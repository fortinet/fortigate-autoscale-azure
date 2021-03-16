/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const config = require('./packman.config.json');

const entries = {};
config.function.forEach(f => {
    entries[f.name] = path.resolve(__dirname, f.source.location);
});

module.exports = {
    entry: entries,
    devtool: 'inline-source-map',
    mode: 'production',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'ts-loader',
                options: {
                    /* onlyCompileBundledFiles: true, allowTsInNodeModules: true, */
                }
            },
            {
                test: /\.node$/,
                type: 'asset/resource',
                generator: {
                    filename: 'static/[base]'
                }
            },
            // https://github.com/webpack/webpack/issues/11467#issuecomment-691873586
            { test: () => /\.m?js/, resolve: { fullySpecified: false } }
        ]
    },
    resolve: {
        extensions: ['.js', '.tsx', '.ts']
    },
    output: {
        filename: () => {
            return `${config.bundle.filenamePrefix}[name]${config.bundle.filenameSuffix}.js`;
        },
        path: path.resolve(__dirname, config.output.outDir),
        libraryTarget: 'commonjs'
    },
    target: 'node'
};
