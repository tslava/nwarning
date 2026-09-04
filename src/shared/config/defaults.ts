import type { Settings } from './schema';

export const MIN_BANNER_SIZE = 20;
export const MAX_BANNER_SIZE = 200;

/** Sizes offered in the options dropdowns. */
export const BANNER_SIZES = [30, 50, 75, 100, 125, 150] as const;

export const DEFAULTS: Readonly<Settings> = Object.freeze({
  extensionEnabled: true,
  groups: [],
  // The smallest offered size: the banner is a permanent strip on every page of
  // every configured host, and it only has to be noticed, not accommodated.
  // Stored settings win over this, so nobody's existing height changes.
  prodSize: 30,
  devSize: 30,
  bannerPosition: 'top',
  trackedKeys: [],
});
