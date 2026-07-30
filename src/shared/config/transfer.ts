/**
 * Serialising settings so a configuration can be shared, checked in, or moved
 * between profiles by hand.
 */

import { DEFAULTS } from './defaults';
import type { EnvironmentGroup, Settings } from './schema';
import { clampBannerSize, isBannerPosition, validateGroup } from './validation';

/** Bumped only if the shape changes in a way an importer must know about. */
export const TRANSFER_VERSION = 1;

/**
 * The shareable part of the settings. `extensionEnabled` is deliberately left
 * out: whether your extension is switched on is not part of a configuration you
 * would hand to a colleague.
 */
export type TransferableSettings = Pick<
  Settings,
  'groups' | 'prodSize' | 'devSize' | 'bannerPosition' | 'localStorageKeys'
>;

export type ImportResult =
  { ok: true; value: TransferableSettings; skippedGroups: number } | { ok: false; error: string };

export function exportSettings(settings: Settings): string {
  const payload = {
    version: TRANSFER_VERSION,
    groups: settings.groups,
    prodSize: settings.prodSize,
    devSize: settings.devSize,
    bannerPosition: settings.bannerPosition,
    localStorageKeys: settings.localStorageKeys,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

/**
 * Parse and validate pasted JSON. Everything goes through the same validation as
 * the options form, so an import cannot introduce a configuration the UI would
 * have rejected. Invalid groups are counted rather than silently dropped.
 */
export function importSettings(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Not valid JSON' };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: 'Expected a JSON object' };
  }
  if (parsed.version !== undefined && parsed.version !== TRANSFER_VERSION) {
    return { ok: false, error: `Unsupported version ${String(parsed.version)}` };
  }
  if (!Array.isArray(parsed.groups)) {
    return { ok: false, error: 'Missing a "groups" array' };
  }

  const groups: EnvironmentGroup[] = [];
  let skippedGroups = 0;

  for (const entry of parsed.groups) {
    if (!isRecord(entry)) {
      skippedGroups += 1;
      continue;
    }
    const result = validateGroup(String(entry.production ?? ''), asStringArray(entry.development));
    if (result.ok) {
      groups.push(result.value);
    } else {
      skippedGroups += 1;
    }
  }

  if (groups.length === 0) {
    return { ok: false, error: 'No usable environment groups in the import' };
  }

  return {
    ok: true,
    skippedGroups,
    value: {
      groups,
      prodSize: clampBannerSize(parsed.prodSize, DEFAULTS.prodSize),
      devSize: clampBannerSize(parsed.devSize, DEFAULTS.devSize),
      bannerPosition: isBannerPosition(parsed.bannerPosition)
        ? parsed.bannerPosition
        : DEFAULTS.bannerPosition,
      localStorageKeys: asStringArray(parsed.localStorageKeys),
    },
  };
}
