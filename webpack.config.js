/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-var-requires */
const TerserPlugin = require('terser-webpack-plugin');
const path = require('path');

module.exports = {
    entry: {
        'autoscale-shared': './autoscale-shared/index.ts'
    },
    devtool: 'inline-source-map',
    mode: 'production',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'ts-loader',
                options: {}
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
            return './index.js';
        },
        path: path.resolve(__dirname, 'dist'),
        libraryTarget: 'commonjs'
    },
    target: 'node'
};
