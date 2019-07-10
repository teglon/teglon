import SharedDependencyResolver from './SharedDependencyResolver';

test('is a noop if no dependencies overlap', () => {
    let manifest = {
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
            abc123: {
                externalDependencies: {
                    dep: {
                        concreteVersion: '1.0.0',
                        semverRange: '^1.0.0'
                    }
                }
            },
            def456: {
                externalDependencies: {
                    dep: {
                        concreteVersion: '2.0.0',
                        semverRange: '^2.0.0'
                    }
                }
            },
            'dep@1.0.0/index.js': {
                externalDependencies: {}
            },
            'dep@2.0.0/index.js': {
                externalDependencies: {}
            }
        }
    };

    let actual = new SharedDependencyResolver().resolve(manifest);

    expect(actual).toEqual(manifest);
});

test('removes extraneous versions when semver ranges are compatible', () => {
    let manifest = {
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
            abc123: {
                externalDependencies: {
                    dep: {
                        concreteVersion: '1.0.0',
                        semverRange: '^1.0.0'
                    }
                }
            },
            def456: {
                externalDependencies: {
                    dep: {
                        concreteVersion: '1.0.1',
                        semverRange: '^1.0.1'
                    }
                }
            },
            'dep@1.0.0/index.js': {
                externalDependencies: {}
            },
            'dep@1.0.1/index.js': {
                externalDependencies: {}
            }
        }
    };

    let actual = new SharedDependencyResolver().resolve(manifest);

    expect(actual.assets).not.toHaveProperty('dep@1.0.0.js');
    expect(actual.aliases).toMatchInlineSnapshot(`
            Object {
              "dep@1.0.0.js": Object {
                "modules": Array [
                  Object {
                    "from": "dep@1.0.0/index.js",
                    "to": "dep@1.0.1/index.js",
                  },
                ],
              },
            }
        `);
});

test('cleans up unused transitive dependencies when unifying versions', () => {
    let manifest = {
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
            abc123: {
                externalDependencies: {
                    dep: {
                        concreteVersion: '1.0.0',
                        semverRange: '^1.0.0'
                    }
                }
            },
            def456: {
                externalDependencies: {
                    dep: {
                        concreteVersion: '1.0.1',
                        semverRange: '^1.0.1'
                    }
                }
            },
            'dep@1.0.0/index.js': {
                externalDependencies: {}
            },
            'dep@1.0.1/index.js': {
                externalDependencies: {}
            },
            'transitiveDep@1.0.0/index.js': {
                externalDependencies: {}
            }
        }
    };

    let actual = new SharedDependencyResolver().resolve(manifest);

    expect(actual).not.toHaveProperty(['assets', 'transitiveDep@1.0.0.js']);
});

test("does not remove transitive dependencies of removed assets if they're referenced by other assets", () => {
    let manifest = {
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
            abc123: {
                externalDependencies: {
                    dep: {
                        concreteVersion: '1.0.0',
                        semverRange: '^1.0.0'
                    },
                    transitiveDep: {
                        concreteVersion: '1.0.0',
                        semverRange: '^1.0.0'
                    }
                }
            },
            def456: {
                externalDependencies: {
                    dep: {
                        concreteVersion: '1.0.1',
                        semverRange: '^1.0.1'
                    }
                }
            },
            'dep@1.0.0/index.js': {
                externalDependencies: {}
            },
            'dep@1.0.1/index.js': {
                externalDependencies: {}
            },
            'transitiveDep@1.0.0/index.js': {
                externalDependencies: {}
            }
        }
    };

    let actual = new SharedDependencyResolver().resolve(manifest);

    expect(actual).toHaveProperty(['assets', 'transitiveDep@1.0.0.js']);
});

test('uses the smallest set of assets that will satisfy semver constraints of requiring modules', () => {
    // One naive approach this tests for is starting with the version that satisfies most dependencies.
    // In this case, that version will satisfy four dependencies, but still require two additional
    // versions to satisfy all requirements. A better solution covers all requirements with two total versions
    let manifest = {
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
            '0beec7': {
                externalDependencies: {
                    dep: {
                        concreteVersion: '1.0.1',
                        semverRange: '1.0.0 - 1.0.2'
                    }
                }
            },
            b5ea3f: {
                externalDependencies: {
                    dep: {
                        concreteVersion: '1.0.2',
                        semverRange: '1.0.0 - 1.0.3'
                    }
                }
            },
            '0fdbc9': {
                externalDependencies: {
                    dep: {
                        concreteVersion: '1.0.3',
                        semverRange: '1.0.2 - 1.0.3'
                    }
                }
            },
            '5d0dd4': {
                externalDependencies: {
                    dep: {
                        concreteVersion: '1.0.4',
                        semverRange: '1.0.3 - 1.0.5'
                    }
                }
            },
            '7f3c5b': {
                externalDependencies: {
                    dep: {
                        concreteVersion: '1.0.5',
                        semverRange: '1.0.3 - 1.0.6'
                    }
                }
            },
            c275da: {
                externalDependencies: {
                    dep: {
                        concreteVersion: '1.0.6',
                        semverRange: '^1.0.4'
                    }
                }
            },
            'dep@1.0.1/index.js': {
                externalDependencies: {}
            },
            'dep@1.0.2/index.js': {
                externalDependencies: {}
            },
            'dep@1.0.3/index.js': {
                externalDependencies: {}
            },
            'dep@1.0.4/index.js': {
                externalDependencies: {}
            },
            'dep@1.0.5/index.js': {
                externalDependencies: {}
            },
            'dep@1.0.6/index.js': {
                externalDependencies: {}
            }
        }
    };

    let actual = new SharedDependencyResolver().resolve(manifest);

    let dependencyAssets = Object.keys(actual.assets).filter(x =>
        x.startsWith('dep@')
    );

    expect(dependencyAssets).toEqual(['dep@1.0.2.js', 'dep@1.0.4.js']);
});
