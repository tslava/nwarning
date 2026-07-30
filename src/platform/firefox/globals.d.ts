/**
 * Firefox exposes the WebExtension API under `browser` in addition to the
 * `chrome` alias. Since Firefox 109 (MV3) the surface we use is shape-compatible
 * with the Chrome typings, and both are promise-based, so reusing `typeof chrome`
 * is accurate here and keeps a single source of API types (@types/chrome).
 */
declare const browser: typeof chrome;
