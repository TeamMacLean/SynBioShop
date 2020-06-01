const path = require('path');
const webpack = require('webpack');

module.exports = {
    entry: {
        main: [
            path.resolve(path.join(__dirname, "public", "js", "src", 'main.src.js'))
        ],
        // need to list uppy here in order for be built for browsers that don't use es6
        // any import magic (e.g. require) needs to be webpacked
        uppy: [
            path.resolve(path.join(__dirname, "public", "js", "src", "uppy.src.js"))
        ],
        // rearrangePremade: [
        //     path.resolve(path.join(__dirname, "public", "js", "src", 'rearrangePremade.jsx'))
        // ],
        // rearrangeDocs: [
        //     path.resolve(path.join(__dirname, "public", "js", "src", 'rearrangeDocs.jsx'))
        // ],
        // goldengate: [
        //     path.resolve(path.join(__dirname, "public", "js", "src", 'goldengate.jsx'))
        // ],
    },
    watch: false,
    module: {
        //     loaders: [
        //         {
        //             test: /.jsx?$/,
        //             loader: 'babel-loader',
        //             exclude: /node_modules/,
        //             query: {
        //                 presets: ['es2015', 'react']
        //             }
        //         },
        //     ],
        rules: [{
            test: /\.css$/i,
            use: ['style-loader', 'css-loader'],
        }, ],
    },
    output: {
        path: path.join(__dirname, "public", "js"),
        filename: '[name].js'
    },
};