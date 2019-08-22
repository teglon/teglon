import { stripIndents } from 'common-tags';
import AssetOptimizer from './AssetOptimizer';

describe('AssetOptimizer.compileScript', () => {
    it('concatenates a single script bundle using manifest data', async () => {
        let scriptContents = new Map([
            ['src/entry1.js', `console.log('Hello from module 1')`],
            ['src/entry2.js', `console.log('Hello from module 2')`]
        ]);

        function getAssetContents(path) {
            return scriptContents.has(path)
                ? Promise.resolve(scriptContents.get(path))
                : Promise.reject('Script not found');
        }

        let manifests = [
            {
                entryName: 'feature-a',
                assets: {
                    'src/entry1.js': {
                        dependencies: [],
                        modules: ['module1']
                    }
                },
                modules: {
                    module1: {}
                }
            },
            {
                entryName: 'feature-b',
                assets: {
                    'src/entry2.js': {
                        dependencies: [],
                        modules: ['module2']
                    }
                },
                modules: {
                    module2: {}
                }
            }
        ];

        let assetOptimizer = new AssetOptimizer({
            fetchAsset: getAssetContents,
            manifests: manifests
        });

        let mockIncomingMessage = {
            url: 'https://cdn.domain.com/bundle.js?entries=feature-a,feature-b'
        }

        let actual = await assetOptimizer.compileScript(mockIncomingMessage);

        expect(actual).toEqual(stripIndents`
            console.log('Hello from module 1')
            
            console.log('Hello from module 2')
        `);
    });

    it('outputs concatenated assets in the correct dependency order', () => {

    });

    it('merges entry manifests using configured resolvers', () => {

    });

    it('runs configured resolvers to alter the merged manifest', () => {

    });

    it('writes modules aliases into the compiled bundle', () => {

    });
});