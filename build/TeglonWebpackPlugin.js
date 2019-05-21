const path = require('path');
const fs = require('fs');
const webpack = require('webpack');

const EXTERNAL_MODULE_PATTERN = /[\\/]node_modules[\\/](?!webpack)/;

class TeglonWebpackPlugin {
    constructor(cwd) {
        this.packageManifests = new Map();
        this.nodeModuleChunkNames = new Set();
        this.cwd = cwd || process.cwd();
    }

    getPackageRootPath(modulePath) {
        while (path.basename(path.join(modulePath, '..')) !== 'node_modules') {
            modulePath = path.join(modulePath, '..');
        }
    
        return modulePath;
    }

    getPackageManifest(modulePath, relativeTo) {
        relativeTo = relativeTo || this.cwd;
        const relativePath = path.relative(relativeTo, modulePath);
    
        const cachedManifest = this.packageManifests.get(relativePath);
        if (cachedManifest) {
            return cachedManifest;
        }
    
        const packageRootPath = this.getPackageRootPath(relativePath);
        const packageManifestPath = path.join(packageRootPath, './package.json');
        let packageManifest = null;
    
        try {
            const fileContents = fs.readFileSync(packageManifestPath, 'UTF8');
            packageManifest = JSON.parse(fileContents);
        } catch (e) {
            console.log(`Module ${modulePath} did not have a parseable package.json:\n${e}`);
        }
    
        this.packageManifests.set(relativePath, packageManifest);
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
        compiler.options.optimization.runtimeChunk = 'single';
        compiler.options.optimization.splitChunks.cacheGroups.vendors = {
            ...compiler.options.optimization.splitChunks.cacheGroups.vendors,
            chunks: 'all',
            test: EXTERNAL_MODULE_PATTERN,
            filename: '[name].js',
            enforce: true,
            name: (module) => {
                const packageManifest = this.getPackageManifest(module.context);

                if (!packageManifest) {
                    return false;
                }
        
                const chunkName = `${packageManifest.name}@${packageManifest.version}`;
                this.nodeModuleChunkNames.add(chunkName);
                return chunkName;
            },
        }

		compiler.hooks.compilation.tap('TeglonWebpackPlugin', compilation => {
            // Name all chunks. Monotonic ids would collide with chunk ids produced by separate compilations
			compilation.hooks.beforeChunkIds.tap(
				'TeglonWebpackPlugin',
				chunks => {
					for (const chunk of chunks) {
                        chunk.id = chunk.name;
					}
				}
            );
            
            // Name modules originating in node_modules:
            // package@version/path/to/module.js
			compilation.hooks.beforeModuleIds.tap(
				'TeglonWebpackPlugin',
				modules => {
                    for (module of modules) {
                        if (module.nameForCondition && EXTERNAL_MODULE_PATTERN.test(module.nameForCondition())) {
                            const packageManifest = this.getPackageManifest(module.context);
                            const packageId = `${packageManifest.name}@${packageManifest.version}`;
                            
                            if (this.nodeModuleChunkNames.has(packageId)) {
                                const packageRoot = this.getPackageRootPath(module.context);
                                const moduleId = module.identifier().replace(packageRoot, packageId);
                                module.id = moduleId;
                            }
                        }
                    }
				}
			);
        });
    }
}

module.exports = TeglonWebpackPlugin;
