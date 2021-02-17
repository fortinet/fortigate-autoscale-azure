/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
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
                options: { onlyCompileBundledFiles: true, allowTsInNodeModules: true }
            },
            {
                test: /\.node$/,
                type: 'asset/resource',
                generator: {
                    filename: 'static/[base]'
                }
            }
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js']
    },
    optimization: {
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    keep_fnames: /AbortSignal/
                },
                extractComments: false
            })
        ]
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
