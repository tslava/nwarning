import { platform } from '../platform';
import { DEFAULTS } from './defaults';
import { LEGACY_KEYS, SETTINGS_KEYS, type EnvironmentGroup, type Settings } from './schema';
import { clampBannerSize, isBannerPosition, validateGroup } from './validation';

export interface SettingsStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  onChanged(listener: (changedKeys: string[]) => void): void;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Fold groups that share a production host into one. Two 1.2 pairs pointing at
 * the same production host are the same group with two stands.
 */
function mergeByProduction(groups: EnvironmentGroup[]): EnvironmentGroup[] {
  const merged = new Map<string, string[]>();
  for (const group of groups) {
    const existing = merged.get(group.production) ?? [];
    for (const host of group.development) {
      if (!existing.includes(host)) existing.push(host);
    }
    merged.set(group.production, existing);
  }
  return [...merged].map(([production, development]) => ({ production, development }));
}

function coerceGroups(value: unknown): EnvironmentGroup[] {
  if (!Array.isArray(value)) return [];

  const groups: EnvironmentGroup[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const result = validateGroup(String(entry.production ?? ''), asStringArray(entry.development));
    if (result.ok) groups.push(result.value);
  }
  return mergeByProduction(groups);
}

/** Rebuild groups from the 1.2 flat-pair shape. */
function groupsFromPairs(value: unknown): EnvironmentGroup[] {
  if (!Array.isArray(value)) return [];

  const groups: EnvironmentGroup[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const result = validateGroup(String(entry.production ?? ''), [String(entry.development ?? '')]);
    if (result.ok) groups.push(result.value);
  }
  return mergeByProduction(groups);
}

/** Rebuild groups from the pre-1.2 parallel-array shape. */
function groupsFromLegacyArrays(production: unknown, development: unknown): EnvironmentGroup[] {
  const prod = asStringArray(production);
  const dev = asStringArray(development);

  const groups: EnvironmentGroup[] = [];
  for (let i = 0; i < Math.min(prod.length, dev.length); i++) {
    const result = validateGroup(prod[i], [dev[i]]);
    if (result.ok) groups.push(result.value);
  }
  return mergeByProduction(groups);
}

/**
 * Single owner of reading, validating and persisting settings. Every consumer
 * goes through here so defaults and key names live in one place, and so invalid
 * stored data can never reach the rest of the extension.
 */
export class SettingsManager {
  /**
   * `storage` is the synced area, so a configuration follows the browser profile.
   * `previousStorage` is the local area settings used to live in; it is read only
   * to migrate an existing configuration across, once.
   */
  constructor(
    private readonly storage: SettingsStorage,
    private readonly previousStorage: SettingsStorage | null = null,
  ) {}

  async load(): Promise<Settings> {
    const keys = [...SETTINGS_KEYS, ...LEGACY_KEYS];
    let raw = await this.storage.get(keys);
    let movedFromLocal = false;

    if (Object.keys(raw).length === 0 && this.previousStorage) {
      const previous = await this.previousStorage.get(keys);
      if (Object.keys(previous).length > 0) {
        raw = previous;
        movedFromLocal = true;
      }
    }

    let groups = coerceGroups(raw.groups);
    let migrated = false;

    if (raw.groups === undefined) {
      const fromPairs = groupsFromPairs(raw.pairs);
      const fromArrays = groupsFromLegacyArrays(raw.productionSites, raw.developmentSites);
      const recovered = fromPairs.length > 0 ? fromPairs : fromArrays;
      if (recovered.length > 0) {
        groups = recovered;
        migrated = true;
      }
    }

    const settings: Settings = {
      // Absent means "not configured yet", which stays enabled.
      extensionEnabled: raw.extensionEnabled !== false,
      groups,
      prodSize: clampBannerSize(raw.prodSize, DEFAULTS.prodSize),
      devSize: clampBannerSize(raw.devSize, DEFAULTS.devSize),
      bannerPosition: isBannerPosition(raw.bannerPosition)
        ? raw.bannerPosition
        : DEFAULTS.bannerPosition,
      localStorageKeys: asStringArray(raw.localStorageKeys),
    };

    if (movedFromLocal) {
      // Copy the whole configuration across, so this runs only once. The local
      // copy is left alone in case the user rolls back to an older build.
      await this.storage.set({
        extensionEnabled: settings.extensionEnabled,
        groups: settings.groups,
        prodSize: settings.prodSize,
        devSize: settings.devSize,
        bannerPosition: settings.bannerPosition,
        localStorageKeys: settings.localStorageKeys,
      });
    } else if (migrated) {
      // Persist once so later loads skip this path. Older keys are left in place
      // so an earlier build keeps working if the user rolls back.
      await this.storage.set({ groups: settings.groups });
    }

    return settings;
  }

  async save(patch: Partial<Settings>): Promise<void> {
    await this.storage.set({ ...patch });
  }

  /** Invoke `listener` with fresh settings whenever any settings key changes. */
  onChange(listener: (settings: Settings) => void): void {
    const owned: readonly string[] = SETTINGS_KEYS;
    this.storage.onChanged((changedKeys) => {
      if (!changedKeys.some((key) => owned.includes(key))) return;
      void this.load().then(listener);
    });
  }
}

export const settings = new SettingsManager(platform.storage.sync, platform.storage.local);
