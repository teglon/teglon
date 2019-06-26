describe('sharedDependencyResolver', () => {
    it('is a noop if no dependencies overlap', () => {
        let manifest = {
            assets: {
                'entry1.js': {
                    isEntry: true,
                    modules: [
                        'abc'
                    ],
                    dependencies: [
                        'dep@1.0.0.js'
                    ]
                },
                'entry2.js': {
                    isEntry: true,
                    modules: [
                        'def'
                    ],
                    dependencies: [
                        'dep@2.0.0.js'
                    ]
                },
                'dep@1.0.0.js': {
                    modules: [
                        'dep@1.0.0/index.js'
                    ],
                    dependencies: []
                },
                'dep@2.0.0.js': {
                    modules: [
                        'dep@2.0.0/index.js'
                    ],
                    dependencies: []
                }
            },
            aliases: {},
            modules: {
                'abc': {
                    externalDependencies: {
                        'dep': {
                            concreteVersion: '1.0.0',
                            semverRange: '^1.0.0'
                        }
                    }
                },
                'def': {
                    externalDependencies: {
                        'dep': {
                            concreteVersion: '2.0.0',
                            semerRange: '^2.0.0'
                        }
                    }
                },
                'dep@1.0.0/index.js': {
                    externalDependencies: {}
                },
                'dep@2.0.0/index.js': {
                    externalDependencies: {}
                }
            },
            externalDependencies: {
                
            }
        };


    });
});
