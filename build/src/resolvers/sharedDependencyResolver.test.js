import SharedDependencyResolver from './SharedDependencyResolver';
import produce from 'immer';

describe('SharedDependencyResolver.resolve', () => {
    it('is a noop if no dependencies overlap', () => {
        let mergedManifest = {
            assets: {
                'entry1.js': {
                    isEntry: true,
                    modules: ['abc123'],
                    dependencies: ['dep@1.0.0.js']
                },
                'entry2.js': {
                    isEntry: true,
                    modules: ['def456'],
                    dependencies: ['dep@2.0.0.js']
                },
                'dep@1.0.0.js': {
                    modules: ['dep@1.0.0/index.js'],
                    dependencies: []
                },
                'dep@2.0.0.js': {
                    modules: ['dep@2.0.0/index.js'],
                    dependencies: []
                }
            },
            aliases: {},
            modules: {
                abc123: {},
                def456: {},
                'dep@1.0.0/index.js': {},
                'dep@2.0.0/index.js': {}
            },
            sharedDependencies: {
                modules: {
                    abc123: {
                        dep: {
                            concreteVersions: ['1.0.0'],
                            semverRange: '^1.0.0'
                        }
                    },
                    def456: {
                        dep: {
                            concreteVersions: ['2.0.0'],
                            semverRange: '^2.0.0'
                        }
                    }
                }
            }
        };

        let resolver = new SharedDependencyResolver();
        let actual = produce(mergedManifest, m => resolver.resolve(m));

        expect(actual).toEqual(mergedManifest);
    });

    it('removes extraneous versions when semver ranges are compatible', () => {
        let mergedManifest = {
            assets: {
                'entry1.js': {
                    isEntry: true,
                    modules: ['abc123'],
                    dependencies: ['dep@1.0.0.js']
                },
                'entry2.js': {
                    isEntry: true,
                    modules: ['def456'],
                    dependencies: ['dep@1.0.1.js']
                },
                'dep@1.0.0.js': {
                    modules: ['dep@1.0.0/index.js'],
                    dependencies: []
                },
                'dep@1.0.1.js': {
                    modules: ['dep@1.0.1/index.js'],
                    dependencies: []
                }
            },
            aliases: {},
            modules: {
                abc123: {},
                def456: {},
                'dep@1.0.0/index.js': {},
                'dep@1.0.1/index.js': {}
            },
            sharedDependencies: {
                modules: {
                    abc123: {
                        dep: {
                            concreteVersions: ['1.0.0'],
                            semverRange: '^1.0.0'
                        }
                    },
                    def456: {
                        dep: {
                            concreteVersions: ['1.0.1'],
                            semverRange: '^1.0.1'
                        }
                    }
                }
            }
        };

        let resolver = new SharedDependencyResolver();
        let actual = produce(mergedManifest, m => resolver.resolve(m));

        expect(actual.assets).not.toHaveProperty('dep@1.0.0.js');
        expect(actual.aliases).toEqual({
            'dep@1.0.0.js': {
                modules: [
                    {
                        from: 'dep@1.0.0/index.js',
                        to: 'dep@1.0.1/index.js'
                    }
                ]
            }
        });
    });

    it('cleans up unused transitive dependencies when unifying versions', () => {
        let mergedManifest = {
            assets: {
                'entry1.js': {
                    isEntry: true,
                    modules: ['abc123'],
                    dependencies: ['dep@1.0.0.js']
                },
                'entry2.js': {
                    isEntry: true,
                    modules: ['def456'],
                    dependencies: ['dep@1.0.1.js']
                },
                'dep@1.0.0.js': {
                    modules: ['dep@1.0.0/index.js'],
                    dependencies: ['transitiveDep@1.0.0.js']
                },
                'dep@1.0.1.js': {
                    modules: ['dep@1.0.1/index.js'],
                    dependencies: []
                },
                'transitiveDep@1.0.0.js': {
                    modules: ['transitiveDep@1.0.0/index.js'],
                    dependencies: []
                }
            },
            aliases: {},
            modules: {
                abc123: {},
                def456: {},
                'dep@1.0.0/index.js': {},
                'dep@1.0.1/index.js': {},
                'transitiveDep@1.0.0/index.js': {}
            },
            sharedDependencies: {
                modules: {
                    abc123: {
                        dep: {
                            concreteVersions: ['1.0.0'],
                            semverRange: '^1.0.0'
                        }
                    },
                    def456: {
                        dep: {
                            concreteVersions: ['1.0.1'],
                            semverRange: '^1.0.1'
                        }
                    }
                }
            }
        };

        let resolver = new SharedDependencyResolver();
        let actual = produce(mergedManifest, m => resolver.resolve(m));

        expect(actual).not.toHaveProperty(['assets', 'transitiveDep@1.0.0.js']);
    });

    it("does not remove transitive dependencies of removed assets if they're referenced by other assets", () => {
        let mergedManifest = {
            assets: {
                'entry1.js': {
                    isEntry: true,
                    modules: ['abc123'],
                    dependencies: ['dep@1.0.0.js', 'transitiveDep@1.0.0.js']
                },
                'entry2.js': {
                    isEntry: true,
                    modules: ['def456'],
                    dependencies: ['dep@1.0.1.js']
                },
                'dep@1.0.0.js': {
                    modules: ['dep@1.0.0/index.js'],
                    dependencies: ['transitiveDep@1.0.0.js']
                },
                'dep@1.0.1.js': {
                    modules: ['dep@1.0.1/index.js'],
                    dependencies: []
                },
                'transitiveDep@1.0.0.js': {
                    modules: ['transitiveDep@1.0.0/index.js'],
                    dependencies: []
                }
            },
            aliases: {},
            modules: {
                abc123: {},
                def456: {},
                'dep@1.0.0/index.js': {},
                'dep@1.0.1/index.js': {},
                'transitiveDep@1.0.0/index.js': {}
            },
            sharedDependencies: {
                modules: {
                    abc123: {
                        dep: {
                            concreteVersions: ['1.0.0'],
                            semverRange: '^1.0.0'
                        },
                        transitiveDep: {
                            concreteVersions: ['1.0.0'],
                            semverRange: '^1.0.0'
                        }
                    },
                    def456: {
                        dep: {
                            concreteVersions: ['1.0.1'],
                            semverRange: '^1.0.1'
                        }
                    }
                }
            }
        };

        let resolver = new SharedDependencyResolver();
        let actual = produce(mergedManifest, m => resolver.resolve(m));

        expect(actual).toHaveProperty(['assets', 'transitiveDep@1.0.0.js']);
    });

    it('uses the smallest set of assets that will satisfy semver constraints of requiring modules', () => {
        // One naive approach this tests for is starting with the version that satisfies most dependencies.
        // In this case, that version will satisfy four dependencies, but still require two additional
        // versions to satisfy all requirements. A better solution covers all requirements with two total versions
        let mergedManifest = {
            assets: {
                'entry1.js': {
                    isEntry: true,
                    modules: ['0beec7'],
                    dependencies: ['dep@1.0.1.js']
                },
                'entry2.js': {
                    isEntry: true,
                    modules: ['b5ea3f'],
                    dependencies: ['dep@1.0.2.js']
                },
                'entry3.js': {
                    isEntry: true,
                    modules: ['0fdbc9'],
                    dependencies: ['dep@1.0.3.js']
                },
                'entry4.js': {
                    isEntry: true,
                    modules: ['5d0dd4'],
                    dependencies: ['dep@1.0.4.js']
                },
                'entry5.js': {
                    isEntry: true,
                    modules: ['7f3c5b'],
                    dependencies: ['dep@1.0.5.js']
                },
                'entry6.js': {
                    isEntry: true,
                    modules: ['c275da'],
                    dependencies: ['dep@1.0.6.js']
                },
                'dep@1.0.1.js': {
                    modules: ['dep@1.0.1/index.js'],
                    dependencies: []
                },
                'dep@1.0.2.js': {
                    modules: ['dep@1.0.2/index.js'],
                    dependencies: []
                },
                'dep@1.0.3.js': {
                    modules: ['dep@1.0.3/index.js'],
                    dependencies: []
                },
                'dep@1.0.4.js': {
                    modules: ['dep@1.0.4/index.js'],
                    dependencies: []
                },
                'dep@1.0.5.js': {
                    modules: ['dep@1.0.5/index.js'],
                    dependencies: []
                },
                'dep@1.0.6.js': {
                    modules: ['dep@1.0.6/index.js'],
                    dependencies: []
                }
            },
            aliases: {},
            modules: {
                '0beec7': {},
                b5ea3f: {},
                '0fdbc9': {},
                '5d0dd4': {},
                '7f3c5b': {},
                c275da: {},
                'dep@1.0.1/index.js': {},
                'dep@1.0.2/index.js': {},
                'dep@1.0.3/index.js': {},
                'dep@1.0.4/index.js': {},
                'dep@1.0.5/index.js': {},
                'dep@1.0.6/index.js': {}
            },
            sharedDependencies: {
                modules: {
                    '0beec7': {
                        dep: {
                            concreteVersions: ['1.0.1'],
                            semverRange: '1.0.0 - 1.0.2'
                        }
                    },
                    b5ea3f: {
                        dep: {
                            concreteVersions: ['1.0.2'],
                            semverRange: '1.0.0 - 1.0.3'
                        }
                    },
                    '0fdbc9': {
                        dep: {
                            concreteVersions: ['1.0.3'],
                            semverRange: '1.0.2 - 1.0.3'
                        }
                    },
                    '5d0dd4': {
                        dep: {
                            concreteVersions: ['1.0.4'],
                            semverRange: '1.0.3 - 1.0.5'
                        }
                    },
                    '7f3c5b': {
                        dep: {
                            concreteVersions: ['1.0.5'],
                            semverRange: '1.0.3 - 1.0.6'
                        }
                    },
                    c275da: {
                        dep: {
                            concreteVersions: ['1.0.6'],
                            semverRange: '^1.0.4'
                        }
                    }
                }
            }
        };

        let resolver = new SharedDependencyResolver();
        let actual = produce(mergedManifest, m => resolver.resolve(m));

        let dependencyAssets = Object.keys(actual.assets).filter(x =>
            x.startsWith('dep@')
        );

        expect(dependencyAssets).toEqual(['dep@1.0.2.js', 'dep@1.0.4.js']);
    });
});
