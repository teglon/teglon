const path = require('path');
const fs = require('fs');
const webpack = require('webpack');

const packageDescriptions =  new Map();
const nodeModuleChunkNames = new Set();
const EXTERNAL_MODULE_PATTERN = /[\\/]node_modules[\\/](?!webpack)/;

function getPackageRootPath(modulePath) {
    while (path.basename(path.join(modulePath, '..')) !== 'node_modules') {
        modulePath = path.join(modulePath, '..');
    }

    return modulePath;
}

function getPackageDescription(modulePath, relativeTo = process.cwd()) {
    const relativePath = path.relative(relativeTo, modulePath);

    const cachedDescription = packageDescriptions.get(relativePath);
    if (cachedDescription) {
        return cachedDescription;
    }

    const packageRootPath = getPackageRootPath(relativePath);
    const packageDescriptionPath = path.join(packageRootPath, './package.json');
    let packageDescription = null;

    try {
        const fileContents = fs.readFileSync(packageDescriptionPath, 'UTF8');
        packageDescription = JSON.parse(fileContents);
    } catch (e) {
        console.log(`Module ${modulePath} did not have a parseable package.json:\n${e}`);
    }

    packageDescriptions.set(relativePath, packageDescription);
    return packageDescription;
}

class VendorChunkIdsPlugin {
	apply(compiler) {
		compiler.hooks.compilation.tap('VendorChunkIdsPlugin', compilation => {
			compilation.hooks.beforeChunkIds.tap(
				'VendorChunkIdsPlugin',
				chunks => {
					for (const chunk of chunks) {
                        // if (nodeModuleChunkNames.has(chunk.name)) {
                        //     chunk.id = chunk.name;
                        //     console.log(chunk.id);
                        // }
                        chunk.id = chunk.name;
                        console.log('Chunk name: ', chunk.id, chunk.name);
					}
				}
			);
		});
	}
}

class VendorModuleIdsPlugin {
	apply(compiler) {
		compiler.hooks.compilation.tap('VendorModuleIdsPlugin', compilation => {
			compilation.hooks.beforeModuleIds.tap(
				'VendorModuleIdsPlugin',
				modules => {
                    console.log('Naming modules');
                    for (module of modules) {
                        if (module.nameForCondition && EXTERNAL_MODULE_PATTERN.test(module.nameForCondition())) {
                            const packageDescription = getPackageDescription(module.context);
                            const packageId = `${packageDescription.name}@${packageDescription.version}`;
                            
                            if (nodeModuleChunkNames.has(packageId)) {
                                const packageRoot = getPackageRootPath(module.context);
                                const moduleId = module.identifier().replace(packageRoot, packageId);
                                //console.log('setting module id:', moduleId);
                                module.id = moduleId;
                            }
                        }
                        console.log('Module name:', module.id, module.context);
                    }
				}
			);
		});
	}
}

module.exports = {
    mode: 'none',
    entry: './src/index.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].[chunkhash].js'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /(node_modules)/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    recordsPath: path.join(__dirname, 'records.json'),
    optimization: {
        minimize: false,
        runtimeChunk: 'single',
        splitChunks: {
            cacheGroups: {
                vendors: {
                    chunks: 'all',
                    test: EXTERNAL_MODULE_PATTERN,
                    filename: '[name].js',
                    enforce: true,
                    name(module) {
                        const packageDescription = getPackageDescription(module.context);

                        if (!packageDescription) {
                            return false;
                        }

                        const chunkName = `${packageDescription.name}@${packageDescription.version}`;
                        nodeModuleChunkNames.add(chunkName);
                        return chunkName;
                    },
                },
            },
        },
    },
    plugins: [
        new webpack.DefinePlugin({ "process.env.NODE_ENV": JSON.stringify("production") }),
        //new webpack.NamedModulesPlugin(),
        new webpack.HashedModuleIdsPlugin({
            hashFunction: 'sha256',
            hashDigest: 'hex',
            hashDigestLength: 20
        }),
        new webpack.NamedChunksPlugin((chunk) => {
            if (chunk.name) {
                return chunk.name;
            }
            console.log('Naming an unnamed chunk');
            return chunk.modules.map(m => path.relative(m.context, m.request)).join("_");
        }),
        new VendorModuleIdsPlugin(),
        new VendorChunkIdsPlugin(),
    ]
};
