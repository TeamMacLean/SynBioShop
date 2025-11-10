const path = require('path');

module.exports = {
    entry: {
        main: path.resolve(__dirname, 'public', 'js', 'src', 'main.src.js'),
        rearrangePremade: path.resolve(__dirname, 'public', 'js', 'src', 'rearrangePremade.jsx'),
        rearrangeDocs: path.resolve(__dirname, 'public', 'js', 'src', 'rearrangeDocs.jsx'),
        // goldengate: path.resolve(__dirname, 'public', 'js', 'src', 'goldengate.jsx'),
    },
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