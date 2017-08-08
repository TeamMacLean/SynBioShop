const path = require('path');
const webpack = require('webpack');

module.exports = {
    entry: {
        goldengate: [
            path.resolve(path.join(__dirname, "public", "js", 'goldengate.jsx'))
        ],
    },
    watch: true,
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
        ]
    },
    output: {
        path: path.join(__dirname, "public", "js"),
        filename: '[name].js'
    },
};