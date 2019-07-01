module.exports = api => {
    let config = {
        presets: ['@babel/preset-react']
    };

    const isTest = api.env('test');

    if (isTest) {
        config.presets.push([
            '@babel/preset-env',
            {
                targets: {
                    node: 'current',
                },
            },
        ]);
    }

    return config;
};
