import semver from 'semver';

/*
    manifest = {
        assets: {
            'main.js': {
                isEntry: true,
                dependencies: [
                    'react@16.8.1.js'
                ],
                modules: [
                    'module1',
                    'module2',
                ]
            },
            'react@16.8.1.js': {
                dependencies: [
                    'object-assign@4.0.0.js'
                ],
                modules: [
                    'react@16.8.1/index.js'
                ]
            }
        },
        aliases: {
            'react@16.8.0.js': {
                modules: [
                    { from: 'react@16.8.0/index.js', to: 'react@16.8.1/index.js' }
                ]
            }
        },
        modules: {
            'module1': {
                externalDependencies: {
                    react: {
                        concreteVersion: '16.8.1',
                        semverRange: '^16.0.0'
                    }
                }
            },
            'react@16.8.1/index.js': {

            }
        }
    }
*/


/*

Top-level "aliases" that has all the data used to generate concrete assets
API for Teglon operations like "alias" and "remove"

*/

function resolveSharedDependencies(manifest) {
    /**
     * Extract a mapping of external dependencies to modules that depend on them:
     * Map([
     *     ['react', [{ id: 'module1', concreteVersion: '16.8.1', semverRange: '^16.8.0' }]]
     * ])
     */
    let externalDependencies = new Map();
    for (let [moduleId, moduleMetadata] of Object.entries(manifest.modules)) {
        for (let [dependencyName, dependencyMetadata] of Object.entries(moduleMetadata.externalDependencies)) {
            if (!externalDependencies.has(dependencyName)) {
                externalDependencies.set(dependencyName, []);
            }

            externalDependencies.get(dependencyName).push({ 
                id: moduleId,
                concreteVersion: dependencyMetadata.concreteVersion,
                semverRange: dependencyMetadata.semverRange
            });
        }
    }

    /**
     * For each external dependency, create a mapping of each available concrete version
     * to all modules the concrete version is compatible with:
     * Map([
     *     ['react', Map([
     *         ['16.8.1', ['module1', 'module2']]
     *     ])
     * ])
     */
    let dependencyVersions = new Map();
    for (let [dependencyName, modules] of externalDependencies.entries()) {
        let concreteVersions = new Map();

        // Make a map of concrete version to modules that would be satisfied by that version
        for (let { concreteVersion } of modules) {
            if (concreteVersions.has(concreteVersion)) {
                continue;
            }

            concreteVersions.set(concreteVersion, []);

            let compatibleModules = concreteVersions.get(concreteVersion);

            for (let module of modules) {
                if (semver.satisfies(concreteVersion, module.semverRange)) {
                    compatibleModules.push(module.id);
                }
            }

            if (compatibleModules.length > 1) {
                dependencyVersions.set(dependencyName, concreteVersions);
            }
        }
    }

    for (let [dependencyName, concreteVersions] of dependencyVersions.entries()) {
        let versionsToUse = smallestVersionSet(concreteVersions).sort(semver.compare);

        let versionsToPrune = new Map(concreteVersions.entries());
        for (let v of versionsToUse) {
            versionsToPrune.delete(v);
        }

        for (let version of versionsToPrune) {
            let packageIdToRemove = `${dependencyName}@${version}`;
            let packageIdToAlias = versionsToUse.find(v => semver.satisfies())
            let packageModules = manifest.assets[packageId + '.js'].modules;
            let alias = { modules: {} };
            Object.entries(manifest.modules)
        }

        // Update modules that use an unneeded concrete version
        let aliases = new Set();
        for (let [version, modules] of versionsToPrune.entries()) {
            modules
                .map(id => manifest.modules[id])
                .filter(module => module.externalDependencies[dependencyName].concreteVersion === version)
                .forEach(module => {
                    let dependencies = module.externalDependencies[dependencyName].semverRange;
                    aliases.add(${dependencies.concreteVersion}|)
                        from: dependencies.concreteVersion,
                        to: versionsToUse.find(v => semver.satisfies(v, dependencies.semverRange))
                    }
                })
            for (moduleId of modules) {
                let module = manifest[moduleId];
                let dependencies = module.externalDependencies[dependencyName];

                if (dependencies.concreteVersion !== concreteVersion) {
                    continue;
                }

        //         let prevVersion = dependencies.concreteVersion;
        //         // Use the highest semver version that's compatible
        //         dependencies.concreteVersion = versionsToUse.find(v => semver.satisfies(dependencies.semverRange));
        //         dependencies.alias = { from: prevVersion, to: dependencies.concreteVersion };
        //     }
        // }
    }

    // Once we've updated to the smallest set of dependencies possible, remove assets that are no longer referenced
    let assetReferences = new Map();
    for ([assetId, assetMetadata] of Object.entries(manifest.assets)) {
        if (!assetReferences.has(assetId)) {
            assetReferences.set(assetId, 0);
        }
        for (let dependencyId of assetMetadata.dependencies) {
            let refCount = assetReferences.has(dependencyId) ? assetReferences.get(dependencyId) : 0;
            assetReferences.set(dependencyId, refCount++);
        }
    }

    let assetQueue = new Set(assetReferences.keys());

    for (assetId of assetQueue) {
        let asset = manifest.assets[assetId];

        if (!asset) {
            continue;
        }

        if (!asset.isEntry && assetReferences.get(assetId) <= 0) {
            delete manifest.assets[assetId];
            for (let dependencyId of asset.dependencies) {
                assetReferences.set(dependencyId, assetReferences.get(dependencyId) - 1);
                // Move each decremented dependency to the back of the queue
                assetQueue.delete(dependencyId);
                assetQueue.add(dependencyId);
            }
        }        
    }

    return manifest;
}

/**
 * Given a mapping of possible concrete versions to modules, find the fewest number of
 * concrete versions required to satisfy the dependencies of all modules
 * @param versionsMap mapping of concrete versions to modules that can depend on them (semver-compatible)
 */
function smallestVersionSet(versionsMap) {
    let fewest = null;

    let versions = [];
    let allModules = new Set();
    for (let [version, modules] of versionsMap.entries()) {
        versions.push(version);
        modules.forEach(m => allModules.add(m));
    }

    for (let concreteVersionsSubset of subsequences(versions)) {
        let satisfiedModules = concreteVersionsSubset.reduce((uniqueModules, concreteVersion) => {
            versionsMap.get(concreteVersion).forEach(m => uniqueModules.add(m));
            return uniqueModules;
        }, new Set());

        let subsetSatisifiesAllModules = satisfiedModules.count === allModules.count;

        if (
            subsetSatisifiesAllModules && (fewest === null || concreteVersionsSubset.length < fewest.length)
        ) {
            fewest = concreteVersionsSubset;
        } 
    }
    return fewest;
}

/**
 * Returns an iterator that yields for every subsequence of a given sequence of elements
 * @param sequence Sequence of elements
 */
function* subsequences(sequence) {
    let currentSubsequence = [];
    let subsequencesCount = Math.pow(2, sequence.length);
    
    for (let i = 0; i < subsequencesCount; i++) {
        currentSubsequence = [];
        for (var j = 0; j < sequence.length; j++) {
            if (i & Math.pow(2, j)) { 
                currentSubsequence.push(sequence[j]);
            }
        }
        if (currentSubsequence.length) {
            yield currentSubsequence;
        }
    }
}

