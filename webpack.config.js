/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const config = require('./packman.config.json');

const entries = {};
config.function.forEach(f => {
    entries[f.name] = path.resolve(__dirname, f.source.location, f.source.filename);
});

module.exports = {
    entry: entries,
    devtool: 'inline-source-map',
    mode: 'production',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js']
    },
    output: {
        filename: `${config.bundle.filenamePrefix}[name]${config.bundle.filenameSuffix}.js`,
        path: path.resolve(__dirname, config.output.outDir),
        libraryTarget: 'commonjs'
    },
    target: 'node'
};
