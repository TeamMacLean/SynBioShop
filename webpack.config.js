const path = require('path');
const fs = require('fs');
const webpack = require('webpack');

module.exports = {
    entry: {
        main: path.resolve(__dirname, 'public', 'js', 'src', 'main.src.js'),
        rearrangePremade: path.resolve(__dirname, 'public', 'js', 'src', 'rearrangePremade.jsx'),
        rearrangeDocs: path.resolve(__dirname, 'public', 'js', 'src', 'rearrangeDocs.jsx'),
        // goldengate: path.resolve(__dirname, 'public', 'js', 'src', 'goldengate.jsx'),
    },
    plugins: [
        // Dropzone's distribution has no license banner for Terser to retain.
        new webpack.BannerPlugin({
            banner: fs.readFileSync(require.resolve('dropzone/LICENSE'), 'utf8'),
            include: /^main\.js$/,
        }),
    ],
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env', '@babel/preset-react']
                    }
                }
            }
        ],
    },
    resolve: {
        extensions: ['.js', '.jsx']
    },
    output: {
        path: path.join(__dirname, 'public', 'js'),
        filename: '[name].js',
        clean: false
    },
    target: 'web',
    performance: {
        hints: false
    }
};
