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
        // goldengate: [
        //     path.resolve(path.join(__dirname, "public", "js", "src", 'goldengate.jsx'))
        // ],
    },
    watch: false,
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: ['babel-loader']
            }
        ],
    },
    resolve: {
        extensions: ['*', '.js', '.jsx']
    },
    output: {
        path: path.join(__dirname, "public", "js"),
        filename: '[name].js'
    },
};