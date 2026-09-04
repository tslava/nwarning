import { platform } from '../platform';
import { DEFAULTS } from './defaults';
import {
  LEGACY_KEYS,
  SETTINGS_KEYS,
  type EnvironmentGroup,
  type Settings,
  type TrackedKey,
} from './schema';
import { clampBannerSize, isBannerPosition, validateGroup, validateTrackedKey } from './validation';

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

function coerceTrackedKeys(value: unknown): TrackedKey[] {
  if (!Array.isArray(value)) return [];

  const keys: TrackedKey[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const result = validateTrackedKey(
      String(entry.key ?? ''),
      asStringArray(entry.hosts),
      entry.value,
    );
    if (!result.ok) continue;

    // An identical row twice is a harmless duplicate, the same as a repeated
    // host inside a group, and only the first would ever be used.
    const identity = `${result.value.key}\u0000${result.value.hosts.join(',')}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    keys.push(result.value);
  }
  return keys;
}

/**
 * Rebuild watched keys from the pre-2.1 flat list of key names.
 *
 * No hosts, which now means "every host the extension is active on" — the only
 * thing the flat list could ever have meant — so an existing configuration keeps
 * watching exactly the hosts it was watching before the update.
 */
function trackedKeysFromNames(value: unknown): TrackedKey[] {
  return coerceTrackedKeys(asStringArray(value).map((key) => ({ key, hosts: [] })));
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
    let trackedKeys = coerceTrackedKeys(raw.trackedKeys);
    const migratedKeys: Record<string, unknown> = {};
    let migrated = false;

    if (raw.trackedKeys === undefined) {
      const recovered = trackedKeysFromNames(raw.localStorageKeys);
      if (recovered.length > 0) {
        trackedKeys = recovered;
        migratedKeys.trackedKeys = recovered;
        migrated = true;
      }
    }

    if (raw.groups === undefined) {
      const fromPairs = groupsFromPairs(raw.pairs);
      const fromArrays = groupsFromLegacyArrays(raw.productionSites, raw.developmentSites);
      const recovered = fromPairs.length > 0 ? fromPairs : fromArrays;
      if (recovered.length > 0) {
        groups = recovered;
        migratedKeys.groups = recovered;
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
      trackedKeys,
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
        trackedKeys: settings.trackedKeys,
      });
    } else if (migrated) {
      // Persist once so later loads skip this path. Older keys are left in place
      // so an earlier build keeps working if the user rolls back.
      await this.storage.set(migratedKeys);
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
