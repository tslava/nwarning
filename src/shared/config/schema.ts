export type BannerPosition = 'top' | 'bottom';

/**
 * One production hostname and the non-production hostnames that mirror it.
 *
 * Production is singular by design — there is only ever one — while dev, staging
 * and QA stands are many. Earlier versions stored flat prod/dev pairs, which
 * could not express a second stand without repeating the production host.
 */
export interface EnvironmentGroup {
  production: string;
  /** At least one non-production hostname pattern. */
  development: string[];
}

export interface Settings {
  extensionEnabled: boolean;
  groups: EnvironmentGroup[];
  prodSize: number;
  devSize: number;
  bannerPosition: BannerPosition;
  localStorageKeys: string[];
}

/** Storage keys owned by the settings layer. */
export const SETTINGS_KEYS = [
  'extensionEnabled',
  'groups',
  'prodSize',
  'devSize',
  'bannerPosition',
  'localStorageKeys',
] as const;

/**
 * Keys from older versions, still read once so existing configurations migrate:
 * `pairs` is 1.2, the two parallel arrays are pre-1.2.
 */
export const LEGACY_KEYS = ['pairs', 'productionSites', 'developmentSites'] as const;
