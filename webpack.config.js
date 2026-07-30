const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const { version } = require('./package.json');

const TARGETS = ['chrome', 'firefox'];
const isDev = process.env.NODE_ENV === 'development';

/**
 * Both targets share every entry point. The only difference is which platform
 * implementation `@platform-impl` resolves to, so each bundle contains exactly
 * one platform's code instead of both.
 */
function createConfig(target) {
  return {
    name: target,
    mode: isDev ? 'development' : 'production',
    // Extension CSP forbids eval, so no eval-based devtool.
    devtool: isDev ? 'source-map' : false,
    entry: {
      content: './src/shared/content.ts',
      background: './src/shared/background.ts',
      options: './src/shared/options.ts',
      popup: './src/shared/popup.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist', target),
      filename: 'js/[name].js',
      clean: true,
    },
    module: {
      rules: [{ test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }],
    },
    /*
     * Deliberately unminified. The whole extension is well under 150 KB, so
     * minification buys nothing measurable, while shipping readable code means
     * add-on reviewers read what actually runs — and AMO only demands a separate
     * source-code submission when the shipped code has been made unreadable.
     */
    optimization: { minimize: false },
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        '@platform-impl': path.resolve(__dirname, 'src/platform', target, 'index.ts'),
      },
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          {
            from: `src/shared/manifest.${target}.json`,
            to: 'manifest.json',
            // Single source of truth for the version: package.json.
            transform: (content) => {
              const manifest = JSON.parse(content.toString());
              manifest.version = version;
              return JSON.stringify(manifest, null, 2);
            },
          },
          { from: 'src/shared/html', to: 'html' },
          { from: 'src/shared/css', to: 'css' },
          { from: 'src/shared/images', to: 'images' },
        ],
      }),
    ],
    infrastructureLogging: { level: 'warn' },
    stats: 'errors-warnings',
  };
}

module.exports = TARGETS.map(createConfig);
