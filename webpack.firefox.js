const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    'platform-specific': './src/platform/firefox/index.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist/firefox'),
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
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/shared/manifest.firefox.json', to: 'manifest.json' },
        { from: 'src/shared/html', to: 'html' },
        { from: 'src/shared/css', to: 'css' },
        { from: 'src/shared/images', to: 'images' },
        { from: 'dist/shared/*.js', to: 'js/[name].js' },
      ],
    }),
  ],
}; 