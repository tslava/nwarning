const path = require('path');

module.exports = {
  entry: {
    content: './src/shared/content.ts',
    background: './src/shared/background.ts',
    options: './src/shared/options.ts',
    popup: './src/shared/popup.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist/shared'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
}; 