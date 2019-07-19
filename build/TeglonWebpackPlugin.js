let path = require('path');
let fs = require('fs').promises;
let webpack = require('webpack');

let EXTERNAL_MODULE_PATTERN = /[\\/]node_modules[\\/](?!webpack)/;

class TeglonWebpackPlugin {
    constructor(cwd) {
        this.packageMetadata = new Map();
        this.moduleMetadata = new Map();
        this.cwd = cwd || process.cwd();
    }

    isModuleExternal(module) {
        return (
            module.nameForCondition &&
            EXTERNAL_MODULE_PATTERN.test(module.nameForCondition())
        );
    }

    isRequiredByOwnPackage(ownPackageName, requiringModule) {
        return (
            path.basename(this.getPackageRootPath(requiringModule.context)) ===
            ownPackageName
        );
    }

    getPackageRootPath(modulePath) {
        modulePath = path.resolve(this.cwd, modulePath);

        while (
            path.basename(path.dirname(modulePath)) !== 'node_modules' &&
            modulePath !== this.cwd
        ) {
            modulePath = path.join(modulePath, '..');
        }

        return modulePath;
    }

    async getPackageManifest(modulePath) {
        modulePath = path.resolve(this.cwd, modulePath);
        let packageRootPath = this.getPackageRootPath(modulePath);
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
            test: EXTERNAL_MODULE_PATTERN,
            filename: '[name].js',
            enforce: true,
            name: module => {
                let packageRootPath = this.getPackageRootPath(module.context);

                if (!this.packageMetadata.has(packageRootPath)) {
                    return false;
                }

                let packageManifest = this.packageMetadata.get(packageRootPath)
                    .packageManifest;
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
                    let externalModules = modules.filter(module =>
                        this.isModuleExternal(module)
                    );

                    for await (let module of externalModules) {
                        if (!this.moduleMetadata.has(module.identifier())) {
                            this.moduleMetadata.set(module.identifier(), {
                                isPublic: false
                            });
                        }

                        let packagePath = this.getPackageRootPath(
                            module.context
                        );

                        if (this.packageMetadata.has(packagePath)) {
                            continue;
                        }

                        let packageManifest = await this.getPackageManifest(
                            module.context
                        );

                        let requiringPackageManifest = null;
                        if (module.issuer) {
                            let requiringModule = module.issuer;

                            // If the module is required directly by the app or another package,
                            // it's part of its package's public API, and will need metadata to be aliasable
                            if (
                                !this.isRequiredByOwnPackage(
                                    packageManifest.name,
                                    requiringModule
                                )
                            ) {
                                this.moduleMetadata.get(
                                    module.identifier()
                                ).isPublic = true;
                            }

                            // Walk up the issuer path until the issuer is no longer part of the same package
                            // as the module itself. Get the semver range the module's package satisfies
                            while (
                                this.isRequiredByOwnPackage(
                                    packageManifest.name,
                                    requiringModule
                                )
                            ) {
                                requiringModule = requiringModule.issuer;
                            }
                            if (requiringModule) {
                                requiringPackageManifest = await this.getPackageManifest(
                                    requiringModule.context
                                );
                            }
                        }

                        // let { name: packageName, version: packageVersion } = packageManifest;
                        // let { name: requirerName, dependencies: requirerDeps } = requiringPackageManifest || {};
                        // console.log('SETTING METADATA:', {
                        //     'Key': packagePath,
                        //     'Package': `${packageName}@${packageVersion}`,
                        //     'Required by': `${requirerName} (${requirerDeps[packageName]})`
                        // });

                        this.packageMetadata.set(packagePath, {
                            packageManifest,
                            requiringPackageManifest
                        });
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
                        let packageRoot = this.getPackageRootPath(
                            module.context
                        );

                        if (
                            !this.packageMetadata.has(packageRoot) ||
                            !this.moduleMetadata.get(module.identifier())
                                .isPublic
                        ) {
                            continue;
                        }

                        let packageManifest = this.packageMetadata.get(
                            packageRoot
                        ).packageManifest;
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
                let teglonManifest = {
                    assets: {},
                    modules: {},
                    sharedDependencies: {
                        modules: {}
                    }
                };

                for (let [
                    key,
                    entrypoint
                ] of compilation.entrypoints.entries()) {
                    let modules = new Map();
                    for (let chunk of entrypoint.chunks) {
                        for (let assetId of chunk.files) {
                            if (
                                !teglonManifest.assets.hasOwnProperty(assetId)
                            ) {
                                teglonManifest.assets[assetId] = {
                                    dependencies: [],
                                    modules: []
                                };
                            }
                        }

                        for (let module of chunk.getModules()) {
                            if (modules.has(module.id)) {
                                let assets = modules.get(module.id).assets;
                                chunk.files.forEach(file => assets.add(file));
                            } else {
                                modules.set(module.id, {
                                    moduleDependencies: new Set(
                                        module.dependencies
                                            .filter(dep => dep.module)
                                            .map(dep => dep.module.id)
                                    ),
                                    assets: new Set(chunk.files),
                                    assetDependencies: new Set()
                                });
                            }
                        }
                    }

                    for (let {
                        moduleDependencies,
                        assetDependencies
                    } of modules.values()) {
                        for (let dependencyModuleId of moduleDependencies) {
                            modules
                                .get(dependencyModuleId)
                                .assets.forEach(asset =>
                                    assetDependencies.add(asset)
                                );
                        }
                    }

                    for (let [moduleId, moduleData] of modules.entries()) {
                        for (let assetId of moduleData.assets) {
                            let asset = teglonManifest.assets[assetId];
                            asset.dependencies = concatUnique(
                                asset.dependencies,
                                moduleData.assetDependencies
                            );
                            asset.modules = concatUnique(asset.modules, [
                                moduleId
                            ]);
                        }
                        // Not sure what module data we'll need yet
                        teglonManifest.modules[moduleId] = {};
                        teglonManifest.sharedDependencies.modules[
                            moduleId
                        ] = {};
                    }

                    console.log(teglonManifest);
                }
            }
        );
    }
}

function concatUnique(...arrs) {
    let merged = arrs.reduce((acc, next) => acc.concat(next), []);
    return [...new Set(merged)];
}

module.exports = TeglonWebpackPlugin;
