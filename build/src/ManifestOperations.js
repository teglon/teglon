function alias(manifest, assetId, moduleAliases) {
    delete manifest.assets[assetId];

    manifest.aliases[assetId] = {
        modules: moduleAliases
    };

    return manifest;
}

function prune(manifest) {
    let assetReferences = new Map();
    let allDependencies = [];
    for (let [assetId, assetMetadata] of Object.entries(manifest.assets)) {
        assetReferences.set(assetId, 0);
        allDependencies = allDependencies.concat(assetMetadata.dependencies);
    }

    for (let asset of allDependencies) {
        if (assetReferences.has(asset)) {
            assetReferences.set(asset, assetReferences.get(asset) + 1);
        }
    }

    let assetQueue = new Set(assetReferences.keys());
    for (let assetId of assetQueue) {
        let asset = manifest.assets[assetId];

        if (!asset) {
            continue;
        }

        if (!asset.isEntry && assetReferences.get(assetId) <= 0) {
            delete manifest.assets[assetId];
            for (let dependencyId of asset.dependencies) {
                assetReferences.set(
                    dependencyId,
                    assetReferences.get(dependencyId) - 1
                );
                // Move each decremented dependency to the back of the queue
                assetQueue.delete(dependencyId);
                assetQueue.add(dependencyId);
            }
        }
    }

    return manifest;
}

export { alias, prune };

export default {
    alias,
    prune
};
