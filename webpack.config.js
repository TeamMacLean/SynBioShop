const path = require('path');
const webpack = require('webpack');

module.exports = {
    entry: {
        main: [
            path.resolve(path.join(__dirname, "public", "js", "src", 'main.src.js'))
        ],
        rearrangePremade: [
            path.resolve(path.join(__dirname, "public", "js", "src", 'rearrangePremade.jsx'))
        ],
        rearrangeDocs: [
            path.resolve(path.join(__dirname, "public", "js", "src", 'rearrangeDocs.jsx'))
        ],
        goldengate: [
            path.resolve(path.join(__dirname, "public", "js", "src", 'goldengate.jsx'))
        ],
    },
    watch: false,
    module: {
        loaders: [
            {
                test: /.jsx?$/,
                loader: 'babel-loader',
                exclude: /node_modules/,
                query: {
                    presets: ['es2015', 'react']
                }
            },
        ],
    },
    output: {
        path: path.join(__dirname, "public", "js"),
        filename: '[name].js'
    },
};