import type { Settings } from './schema';

export const MIN_BANNER_SIZE = 20;
export const MAX_BANNER_SIZE = 200;

/** Sizes offered in the options dropdowns. */
export const BANNER_SIZES = [30, 50, 100, 150] as const;

export const DEFAULTS: Readonly<Settings> = Object.freeze({
  extensionEnabled: true,
  groups: [],
  prodSize: 50,
  devSize: 50,
  bannerPosition: 'top',
  localStorageKeys: [],
});
