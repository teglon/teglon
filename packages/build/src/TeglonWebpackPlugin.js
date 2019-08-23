let path = require('path');
let fs = require('fs').promises;
let webpack = require('webpack');

let SHARED_MODULE_PATTERN = /[\\/]node_modules[\\/](?!webpack)/;

class TeglonWebpackPlugin {
    constructor(cwd) {
        /**
         * [[packageRootPath, packageManifest ]]
         */
        this.packageMetadata = new Map();
        /**
         * [[module, { isPublic }]]
         */
        this.moduleMetadata = new Map();
        this.cwd = cwd || process.cwd();
    }

    /**
     * Shared modules originate in node_modules
     * They have the possibility of being deduplicated at runtime
     * @param {*} module
     */
    isModuleShared(module) {
        return (
            module.nameForCondition &&
            SHARED_MODULE_PATTERN.test(module.nameForCondition())
        );
    }

    areModulesInSamePackage(module1, module2) {
        return (
            this.getPackageRootPath(module1) ===
            this.getPackageRootPath(module2)
        );
    }

    getPackageRootPath(module) {
        let modulePath = path.resolve(this.cwd, module.context);

        while (
            path.basename(path.dirname(modulePath)) !== 'node_modules' &&
            modulePath !== this.cwd
        ) {
            modulePath = path.join(modulePath, '..');
        }

        return modulePath;
    }

    async getPackageManifest(packageRootPath) {
        let packageManifestPath = path.join(packageRootPath, './package.json');

        let packageManifest = null;
        try {
            let fileContents = await fs.readFile(packageManifestPath, 'UTF8');
            packageManifest = JSON.parse(fileContents);
        } catch (e) {
            console.log(
                `Module ${modulePath} did not have a parseable package.json:\n${e}`
            );
        }

        return packageManifest;
    }

    buildManifestForEntrypoint(entrypoint) {
        let teglonManifest = {
            assets: {},
            modules: {},
            sharedDependencies: {
                modules: {}
            }
        };

        let chunksByModule = new Map();
        for (let chunk of entrypoint.chunks) {
            for (let module of chunk.getModules()) {
                if (chunksByModule.has(module)) {
                    chunksByModule.get(module).push(chunk);
                } else {
                    chunksByModule.set(module, [chunk]);
                }
            }
        }

        for (let chunk of entrypoint.chunks) {
            let assetDependencies = new Set();
            for (let module of chunk.getModules()) {

                /**
                 * Reserved for future use
                 */
                teglonManifest.modules[module.id] = {};

                for (let { module: depModule } of module.dependencies || []) {
                    if (!depModule) {
                        continue;
                    }

                    /**
                     * Asset 1 depends Asset 2 when Asset 1 contains a module that depends on a module
                     * contained by Asset 2
                     *
                     * When a chunk contains multiple assets (not clear under what circumstances this occurs)
                     * the assets are treated the same (they are said to contain the same modules, and depend
                     * on the same assets)
                     */
                    let chunkDependencies = chunksByModule.get(depModule);
                    if (!chunkDependencies.includes(chunk)) {
                        flatMap(
                            ...chunkDependencies.map(chunkDep => chunkDep.files)
                        ).forEach(assetId => assetDependencies.add(assetId));
                    }

                    /**
                     * This is where we calculate the concrete version and semver range
                     * of each shared dependency, for runtime deduplication
                     */
                    if (
                        !this.areModulesInSamePackage(module, depModule) &&
                        this.isModuleShared(depModule)
                    ) {
                        let sharedDependencyEntries =
                            teglonManifest.sharedDependencies.modules;

                        let {
                            dependencies,
                            peerDependencies
                        } = this.packageMetadata.get(
                            this.getPackageRootPath(module)
                        );

                        let { name, version } = this.packageMetadata.get(
                            this.getPackageRootPath(depModule)
                        );

                        let semverRange =
                            dependencies[name] || peerDependencies[name];

                        if (
                            !sharedDependencyEntries.hasOwnProperty(module.id)
                        ) {
                            sharedDependencyEntries[module.id] = {};
                        }

                        sharedDependencyEntries[module.id][name] = {
                            concreteVersion: version,
                            semverRange
                        };
                    }
                }
            }

            for (let file of chunk.files) {
                teglonManifest.assets[file] = {
                    dependencies: [...assetDependencies],
                    modules: chunk.getModules().map(x => x.id)
                };
            }
        }

        return teglonManifest;
    }

    apply(compiler) {
        // Modules that don't originate in node_modules need non-numeric ids,
        // but don't need predictable names for runtime substitution
        new webpack.HashedModuleIdsPlugin({
            hashFunction: 'sha256',
            hashDigest: 'hex',
            hashDigestLength: 20
        }).apply(compiler);

        // Split chunks containing modules originating in node_modules.
        // Modules are grouped into chunks by package name: package@version
        compiler.options.optimization.runtimeChunk = { name: 'runtime' };
        compiler.options.optimization.splitChunks.cacheGroups.vendors = {
            ...compiler.options.optimization.splitChunks.cacheGroups.vendors,
            chunks: 'all',
            test: SHARED_MODULE_PATTERN,
            filename: '[name].js',
            enforce: true,
            name: module => {
                let packageRootPath = this.getPackageRootPath(module);

                if (
                    !this.isModuleShared(module) ||
                    !this.packageMetadata.has(packageRootPath)
                ) {
                    return false;
                }

                let packageManifest = this.packageMetadata.get(packageRootPath);
                return `${packageManifest.name}@${packageManifest.version}`;
            }
        };

        compiler.hooks.compilation.tap('TeglonWebpackPlugin', compilation => {
            // TODO: Is there a good way to exclude unrelated child compilations?
            if (compilation.name === 'html-webpack-plugin for "index.html"') {
                return;
            }

            compilation.hooks.finishModules.tapPromise(
                'TeglonWebpackPlugin',
                async modules => {
                    let publicModules = new Set();

                    for await (let module of modules) {
                        let packagePath = this.getPackageRootPath(module);

                        if (!this.packageMetadata.has(packagePath)) {
                            let packageManifest = await this.getPackageManifest(
                                packagePath
                            );
                            this.packageMetadata.set(
                                packagePath,
                                packageManifest
                            );
                        }

                        for (let dependency of module.dependencies || []) {
                            if (!dependency.module) {
                                continue;
                            }

                            if (
                                this.isModuleShared(dependency.module) &&
                                !this.areModulesInSamePackage(
                                    module,
                                    dependency.module
                                )
                            ) {
                                publicModules.add(dependency.module);
                            }
                        }

                        this.moduleMetadata.set(module, {
                            isPublic: false
                        });
                    }

                    for (let publicModule of publicModules) {
                        this.moduleMetadata.get(publicModule).isPublic = true;
                    }
                }
            );

            // Name all chunks. Monotonic ids would collide with chunk ids produced by separate compilations
            compilation.hooks.beforeChunkIds.tap(
                'TeglonWebpackPlugin',
                chunks => {
                    for (let chunk of chunks) {
                        chunk.id = chunk.name;
                    }
                }
            );

            // Name modules that are part of their package's public API:
            // package@version/path/to/module.js
            compilation.hooks.beforeModuleIds.tap(
                'TeglonWebpackPlugin',
                modules => {
                    for (module of modules) {
                        let packageRoot = this.getPackageRootPath(module);

                        if (
                            !this.packageMetadata.has(packageRoot) ||
                            !this.moduleMetadata.get(module).isPublic
                        ) {
                            continue;
                        }

                        let packageManifest = this.packageMetadata.get(
                            packageRoot
                        );
                        let packageId = `${packageManifest.name}@${packageManifest.version}`;
                        let moduleId = module
                            .identifier()
                            .replace(packageRoot, packageId);

                        module.id = moduleId;
                    }
                }
            );
        });

        compiler.hooks.emit.tapPromise(
            'TeglonWebpackPlugin',
            async compilation => {
                for (let [
                    entrypointName,
                    entrypoint
                ] of compilation.entrypoints.entries()) {
                    let manifest = this.buildManifestForEntrypoint(entrypoint);
                    let filePath = path.resolve(compiler.options.output.path, `${entrypointName}.teglon.json`);
                    try {
                        await fs.writeFile(filePath, JSON.stringify(manifest, null, 2));
                    } catch (e) {
                        compilation.getLogger('TeglonWebpackPlugin').log('Error writing teglon manifest to disk', e);
                    }
                }
            }
        );
    }
}

function flatMap(...arrs) {
    return arrs.reduce((acc, next) => acc.concat(next), []);
}

function flatMapDistinct(...arrs) {
    return [...new Set(flatMap(...arrs))];
}

module.exports = TeglonWebpackPlugin;
