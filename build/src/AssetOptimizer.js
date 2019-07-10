import url from 'url';
import produce from 'immer';
import sort from 'toposort';

class AssetOptimizer {
    constructor(config = {}) {
        this.resolvers = config.resolvers || [];
        this.fetchAsset = config.fetchAsset;
        this.manifests = config.manifests;
    }

    async compileAssets(incomingMessage) {

    }

    async compileScript(incomingMessage) {
        let { assets, aliases } = compileManifest(incomingMessage);

        // Produce a dependency order graph where each tuple is [dependency, dependent]
        // [
        //   ['object-assign@4.1.1', 'react@16.8.1']
        // ]
        let graph = Object.entries(assets).reduce((graph, [assetName, metadata]) => (
            graph.concat(
                ...metadata.dependencies.map(dep => [dep, assetName])
            )
        ), []);
        
        let inclusionOrder = sort(graph);

        let scriptBundle = [];
        for await (let asset of inclusionOrder) {
            let assetContent;
            if (assets.hasOwnProperty(asset)) {
                assetContent = await this.fetchAsset(asset);
            } else if (aliases.hasOwnProperty(asset)) {
                assetContent = constructAliasScript(asset, aliases.asset);
            }
            scriptBundle.push(assetContent);
        }

        return scriptBundle.join('\n');
    }
}

function constructAliasScript(chunkName, aliasData) {
    
}

function compileManifest(incomingMessage) {
    let requestUrl = url.parse(incomingMessage.url, true);
    let entries = requestUrl.query.entries.split(',');
    let manifest = createMergedManifest(entries);

    let context = {
        url: requestUrl,
        request: incomingMessage,
    };

    return resolvers.reduce((manifest, resolver) => (
        produce(manifest, m => resolver.resolve(m, context))
    ), manifest);
}

function createMergedManifest(entries) {
    let manifests = entries.map(entry => this.manifests[entry]);
    let mergedManifest = {
        aliases: {}
    };

    for (let manifest of manifests) {
        // It's possible for the same asset to be present in multiple individual manifests,
        // and the asset could contain different modules in each separate compilation.
        // Asset modules and dependencies arrays are unioned during merge
        for (let [assetName, metadata] of Object.entries(manifest.assets)) {
            if (mergedManifest.assets.hasOwnProperty(assetName)) {
                let asset = mergedManifest.assets[assetName];
                asset.dependencies = concatUnique(asset.dependencies, metadata.dependencies);
                asset.modules = concatUnique(asset.modules, metadata.modules);
            } else {
                mergedManifest.assets[assetName] = metadata;
            }
        }
        Object.assign(mergedManifest.modules, manifest.modules);
    }

    // Each resolver determines how to merge its own data section
    for (let resolver of this.resolvers) {
        mergedManifest[resolver.key()] =  resolver.mergeManifest(manifests);
    }

    return mergedManifest;
}

function concatUnique(...arrs) {
    let merged = arrs.reduce((acc, next) => acc.concat(next), []);
    return [...new Set(merged)];
}



