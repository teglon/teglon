import semver from 'semver';
import { intersect } from 'semver-intersect';
import ManifestOperations from '../ManifestOperations';

/*
Example of the merged manifest data structure
{
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
        'module1': {...},
        'react@16.8.1/index.js': {...}
    },
    sharedDependencies: {
        modules: {
            'module1': {
                react: {
                    concreteVersion: '16.8.1',
                    semverRange: '^16.0.0'
                }
            }
        }
    }
}
*/

class SharedDependencyResolver {
    key() {
        return 'sharedDependencies';
    }

    /**
     * Given a collection of manifests produced by independent compilations,
     * merge data used by this resolver into a single object. The returned object
     * is assigned to the `sharedDependencies` property of the merged manifest
     * received by the `resolve` method
     * @param {Manifest[]} entryManifests 
     */
    mergeManifests(entryManifests) {
        let moduleEntries = entryManifests
            .filter(manifest => manifest.hasOwnProperty(this.key()))
            .reduce(
                (entries, manifest) =>
                    entries.concat(
                        Object.entries(manifest[this.key()].modules)
                    ),
                []
            );

        let mergedModules = {};
        for (let [moduleId, dependencies] of moduleEntries) {
            if (!mergedModules.hasOwnProperty(moduleId)) {
                mergedModules[moduleId] = {};
            }

            for (let [dep, { concreteVersion, ...metadata }] of Object.entries(dependencies)) {
                /** 
                 * This condition should only apply to shared modules that have transitive
                 * dependencies of their own: application module identifiers should be globally
                 * unique (e.g. id'd by SHA). We therefore assume duplicate module ids are
                 * the same semver version, and have identical dependency version constraints.
                 * Only the concrete version might differ, since concrete version determined at
                 * build time for each compilation separately
                 */
                if (mergedModules[moduleId].hasOwnProperty(dep)) {
                    mergedModules[moduleId][dep].concreteVersions = concatUnique(
                        mergedModules[moduleId][dep].concreteVersions,
                        concreteVersion
                    )
                } else {
                    mergedModules[moduleId][dep] = {
                        ...metadata,
                        concreteVersions: [concreteVersion]
                    };
                }
            }
        }

        return { modules: mergedModules };
    }

    /**
     * Remove redundant versions of external dependencies from the manifest, adding aliases for
     * removed assets. Uses the semver requirements of the requiring modules to determine
     * which concrete versions are unneeded
     * @param {MergedManifest} manifest
     */
    resolve(manifest) {
        /**
         * Extract a mapping of external dependencies to modules that depend on them:
         * Map([
         *     ['react', [{ id: 'module1', concreteVersions: ['16.8.1'], semverRange: '^16.8.0' }]]
         * ])
         */
        let externalDependencies = new Map();
        for (let [moduleId, dependencies] of Object.entries(
            manifest.sharedDependencies.modules
        )) {
            for (let [dependencyName, dependencyMetadata] of Object.entries(
                dependencies
            )) {
                if (!externalDependencies.has(dependencyName)) {
                    externalDependencies.set(dependencyName, []);
                }

                externalDependencies.get(dependencyName).push({
                    id: moduleId,
                    concreteVersions: dependencyMetadata.concreteVersions,
                    semverRange: dependencyMetadata.semverRange
                });
            }
        }

        for (let [
            dependencyName,
            requiringModules
        ] of externalDependencies.entries()) {
            manifest = resolveSharedDependency(
                manifest,
                dependencyName,
                requiringModules
            );
        }

        return manifest;
    }
}

/**
 * For a given dependency, solves semver constraints to find redundant versions and
 * remove them, creating aliases for removed versions
 * @param {Manifest} manifest The bundle manifest to update
 * @param {string} dependencyName The dependency to resolve (e.g. 'react')
 * @param {Module[]} requiringModules Modules that depend on the dependency
 */
function resolveSharedDependency(manifest, dependencyName, requiringModules) {
    /**
     * For each concrete version of the external dependency, find a semver range that is valid for every module
     * which currently uses that concrete version.
     *
     * This is a consequence of how aliasing currently works. If two modules were generated at build time
     * to use the same concrete version of a dependency, and that dependency is aliased to another version
     * at runtime, the alias will apply to both modules. IOW, when evaluating whether a version can fulfill
     * a module's semver constraint, we must ensure it will also fulfill the constraints of all other modules
     * using the same import
     *
     * [
     *     ['16.8.1', '^16.8.0']
     * ]
     */
    let aggregateVersionRanges = new Map();
    for (let module of requiringModules) {
        for (let concreteVersion of module.concreteVersions) {
            let aggregateRange =
                aggregateVersionRanges.get(concreteVersion) ||
                module.semverRange;

            aggregateVersionRanges.set(
                concreteVersion,
                intersect(aggregateRange, module.semverRange)
            );
        }
    }
    aggregateVersionRanges = [...aggregateVersionRanges.entries()];

    /**
     * Map each available concrete version to all the concrete versions it can
     * substitute for, based on semver constraints:
     * Map([
     *     ['16.8.2', ['16.8.0', '16.8.1', '16.8.2']]
     * ])
     *
     * The map includes only concrete versions that have possible substitutions
     */
    let possibleReplacements = new Map();
    for (let [concreteVersion] of aggregateVersionRanges) {
        let replaceableVersions = aggregateVersionRanges
            .filter(([, semverRange]) =>
                semver.satisfies(concreteVersion, semverRange)
            )
            .map(([version]) => version);

        if (replaceableVersions.length > 1) {
            possibleReplacements.set(concreteVersion, replaceableVersions);
        }
    }

    let versionsToUse = smallestVersionSet(possibleReplacements).sort(
        semver.compare
    );

    /**
     * For each version that can be replaced, remove the version's associated asset
     * and add a module alias mapping to the manifest's `aliases` collection
     */
    let alreadyReplaced = new Set();
    for (let replacingVersion of versionsToUse) {
        for (let replaceableVersion of possibleReplacements.get(
            replacingVersion
        )) {
            if (
                replaceableVersion === replacingVersion ||
                alreadyReplaced.has(replaceableVersion)
            ) {
                continue;
            }

            let replacedId = `${dependencyName}@${replaceableVersion}`;
            let replacingId = `${dependencyName}@${replacingVersion}`;
            let assetId = replacedId + '.js';

            let moduleAliases = Object.keys(manifest.modules)
                .filter(moduleId => moduleId.startsWith(replacedId))
                .map(moduleId => ({
                    from: moduleId,
                    to: moduleId.replace(replacedId, replacingId)
                }));

            manifest = ManifestOperations.alias(
                manifest,
                assetId,
                moduleAliases
            );

            alreadyReplaced.add(replaceableVersion);
        }
    }

    // Once we've updated to the smallest set of dependencies possible, remove assets that are no longer referenced
    manifest = ManifestOperations.prune(manifest);

    return manifest;
}

/**
 * Given a mapping of possible concrete versions to modules, find the fewest number of
 * concrete versions required to satisfy the dependencies of all modules
 * @param versionsMap mapping of concrete versions to modules that can depend on them (semver-compatible)
 */
function smallestVersionSet(versionsMap) {
    let fewest = null;

    let replacementVersions = [];
    let allReplaceableVersions = new Set();
    for (let [
        replacementVersion,
        replaceableVersions
    ] of versionsMap.entries()) {
        replacementVersions.push(replacementVersion);
        replaceableVersions.forEach(m => allReplaceableVersions.add(m));
    }

    for (let subset of subsequences(replacementVersions)) {
        let satisfiedReplacements = new Set();
        for (let replacingVersion of subset) {
            versionsMap
                .get(replacingVersion)
                .forEach(m => satisfiedReplacements.add(m));
        }

        let subsetSatisifiesAllModules =
            satisfiedReplacements.size === allReplaceableVersions.size;

        if (
            subsetSatisifiesAllModules &&
            (fewest === null || subset.length < fewest.length)
        ) {
            fewest = subset;
        }
    }

    return fewest || [];
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
        for (let j = 0; j < sequence.length; j++) {
            if (i & Math.pow(2, j)) {
                currentSubsequence.push(sequence[j]);
            }
        }
        if (currentSubsequence.length) {
            yield currentSubsequence;
        }
    }
}

function concatUnique(...arrs) {
    let merged = arrs.reduce((acc, next) => acc.concat(next), []);
    return [...new Set(merged)];
}

export default SharedDependencyResolver;
