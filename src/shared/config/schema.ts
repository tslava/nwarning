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

/**
 * One watched localStorage key, and where it applies.
 *
 * `hosts` is a list of hostname patterns chosen from the configured environment
 * groups. Empty means every host the extension is active on — which is what the
 * pre-2.1 flat list of key names meant, so a migrated configuration keeps
 * behaving exactly as it did.
 *
 * `value` is what a click writes when the key is absent from the page. It is one
 * of `ASSIGNABLE_VALUES`, so an assignment can only ever produce a value the chip
 * is then able to flip back.
 */
export interface TrackedKey {
  key: string;
  /** Hostname patterns this key applies to; empty means all configured hosts. */
  hosts: string[];
  /** Value written when the key is not set on the page. */
  value: string;
}

export interface Settings {
  extensionEnabled: boolean;
  groups: EnvironmentGroup[];
  prodSize: number;
  devSize: number;
  bannerPosition: BannerPosition;
  trackedKeys: TrackedKey[];
}

/** Storage keys owned by the settings layer. */
export const SETTINGS_KEYS = [
  'extensionEnabled',
  'groups',
  'prodSize',
  'devSize',
  'bannerPosition',
  'trackedKeys',
] as const;

/**
 * Keys from older versions, still read once so existing configurations migrate:
 * `pairs` is 1.2, the two parallel arrays are pre-1.2, and `localStorageKeys` is
 * the flat list of key names that `trackedKeys` replaced in 2.1.
 */
export const LEGACY_KEYS = [
  'pairs',
  'productionSites',
  'developmentSites',
  'localStorageKeys',
] as const;
