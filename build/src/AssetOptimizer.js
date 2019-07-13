import url from 'url';
import produce from 'immer';
import sort from 'toposort';

class AssetOptimizer {
    constructor(config = {}) {
        this.resolvers = config.resolvers || [];
        this.fetchAsset = config.fetchAsset;
        this.manifests = new Map();

        // Given a collection of manifests, create a map where each manifest is
        // keyed by the asset name of the first entry point.
        // TODO: does this assumption hold up for child compilations like code split points?
        for (let manifest of (config.manifests || [])) {
            this.manifests.set(manifest.entryName, manifest);
        }
    }

    async compileAssets(incomingMessage) {

    }

    async compileScript(incomingMessage) {
        let { assets, aliases } = this._compileManifest(incomingMessage);

        // Find edges of dependency order graph as a list of tuples [dependency, dependent]
        // Nodes are tracked so assets without dependencies will be included
        // [
        //   ['object-assign@4.1.1', 'react@16.8.1']
        // ]
        let nodes = new Set();
        let edges = [];
        for (let [asset, {dependencies}] of Object.entries(assets)) {
            nodes.add(asset);
            for (let dependency of dependencies) {
                nodes.add(dependency);
                edges.push([dependency, asset]);
            }
        }

        let inclusionOrder = sort.array([...nodes], edges);

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

        return scriptBundle.join('\n\n');
    }

    _compileManifest(incomingMessage) {
        let requestUrl = url.parse(incomingMessage.url, true);
        let requestedEntries = requestUrl.query.entries.split(',');
        let mergedManifest = this._createMergedManifest(requestedEntries);
    
        let context = {
            url: requestUrl,
            request: incomingMessage,
        };
    
        return this.resolvers.reduce((manifest, resolver) => (
            produce(manifest, m => resolver.resolve(m, context))
        ), mergedManifest);
    }

    _createMergedManifest(entries) {
        let manifests = entries.map(entry => this.manifests.get(entry));
        let mergedManifest = {
            assets: {},
            aliases: {},
            modules: {}
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
            // modules don't currently need any specialized merging
            Object.assign(mergedManifest.modules, manifest.modules);
        }
    
        // Each resolver determines how to merge its own data section
        for (let resolver of this.resolvers) {
            mergedManifest[resolver.key()] =  resolver.mergeManifests(manifests);
        }
    
        return mergedManifest;
    }

    _constructAliasScript(chunkName, aliasData) {
    }
}

function concatUnique(...arrs) {
    let merged = arrs.reduce((acc, next) => acc.concat(next), []);
    return [...new Set(merged)];
}

export default AssetOptimizer;



