import { DEFAULT_ASSIGN_VALUE, isAssignableValue } from '../storage/flagValue';
import { countWildcards } from '../utils/patterns';
import { MAX_BANNER_SIZE, MIN_BANNER_SIZE } from './defaults';
import type { BannerPosition, EnvironmentGroup, TrackedKey } from './schema';

export type ValidationResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Reduce whatever the user typed to a bare hostname pattern.
 *
 * The options page talks about hosts, but people paste URLs, and matching runs
 * against `location.hostname`, so `https://app.example.com:8443/path?q=1` has to
 * become `app.example.com` or it would never match anything.
 */
export function normalizeHostPattern(raw: string): string {
  let value = raw.trim().toLowerCase();
  if (!value) return '';

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme
  value = value.replace(/^[^/@]*@/, ''); // userinfo
  value = value.split(/[/?#]/)[0]; // path, query, fragment
  value = value.replace(/:\d+$/, ''); // port
  value = value.replace(/\.+$/, ''); // trailing dots

  return value;
}

// Labels of letters, digits, hyphens and underscores, or a bare `*` wildcard.
const HOST_PATTERN = /^(\*|[a-z0-9_-]+)(\.(\*|[a-z0-9_-]+))*$/;

/** Normalize and validate a hostname pattern. */
export function validateHostPattern(raw: string): ValidationResult {
  const value = normalizeHostPattern(raw);

  if (!value) {
    return { ok: false, error: 'Hostname is empty' };
  }
  if (value === '*') {
    return { ok: false, error: '"*" alone would match every site' };
  }
  if (!HOST_PATTERN.test(value)) {
    return { ok: false, error: `"${raw.trim()}" is not a valid hostname pattern` };
  }
  return { ok: true, value };
}

/** Split a comma, whitespace or newline separated list of hosts. */
export function parseHostList(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

export type GroupValidationResult =
  { ok: true; value: EnvironmentGroup } | { ok: false; error: string };

/**
 * Validate a production host together with its non-production hosts.
 *
 * A non-production host's wildcard count must either match production's or be
 * zero on one side. Equal counts translate both ways. A fixed host (0
 * wildcards) on either side still translates one way — into the fixed host,
 * always; out of it, only when the other side is also fixed — which is enough
 * for cases like a wildcarded S3 bucket paired with one fixed production host.
 * Two different nonzero counts translate neither way, since the wildcards
 * captured on one side never line up with the slots on the other, so that
 * combination is rejected.
 */
export function validateGroup(production: string, developments: string[]): GroupValidationResult {
  const prod = validateHostPattern(production);
  if (!prod.ok) return { ok: false, error: `Production: ${prod.error}` };

  if (developments.length === 0) {
    return { ok: false, error: 'Add at least one non-production host' };
  }

  const prodWildcards = countWildcards(prod.value);
  const seen = new Set<string>();
  const value: string[] = [];

  for (const candidate of developments) {
    const dev = validateHostPattern(candidate);
    if (!dev.ok) return { ok: false, error: dev.error };

    if (dev.value === prod.value) {
      return { ok: false, error: `"${dev.value}" is already the production host` };
    }
    const devWildcards = countWildcards(dev.value);
    if (devWildcards !== prodWildcards && devWildcards !== 0 && prodWildcards !== 0) {
      return {
        ok: false,
        error:
          `"${dev.value}" has ${devWildcards} wildcard(s) but production ` +
          `"${prod.value}" has ${prodWildcards} — they must match, or one side must have none, ` +
          `so switching works at least one way`,
      };
    }

    // Duplicates are dropped rather than rejected; they are harmless typos.
    if (seen.has(dev.value)) continue;
    seen.add(dev.value);
    value.push(dev.value);
  }

  return { ok: true, value: { production: prod.value, development: value } };
}

export type TrackedKeyValidationResult =
  { ok: true; value: TrackedKey } | { ok: false; error: string };

/**
 * Validate one watched localStorage key together with its host scope.
 *
 * Hosts are patterns, matched against `location.hostname` like everything else,
 * but unlike a group's hosts they are never translated into one another — so the
 * wildcard-counting rules that `validateGroup` enforces do not apply here, and a
 * host only has to be a well-formed pattern. An empty list is legitimate and
 * means every host the extension is active on.
 *
 * A value outside `ASSIGNABLE_VALUES` is coerced rather than rejected. The
 * options page can only produce the four it offers, so this only ever fires on a
 * hand-edited import or a value written by another version, and coercing keeps
 * the key — dropping the whole row over its secondary attribute would throw away
 * the key name, which is the part that took someone effort to find.
 */
export function validateTrackedKey(
  rawKey: string,
  rawHosts: string[],
  rawValue: unknown,
): TrackedKeyValidationResult {
  const key = rawKey.trim();
  if (!key) {
    return { ok: false, error: 'Key name is empty' };
  }

  const seen = new Set<string>();
  const hosts: string[] = [];
  for (const candidate of rawHosts) {
    const host = validateHostPattern(candidate);
    if (!host.ok) return { ok: false, error: `${key}: ${host.error}` };
    // Duplicates are dropped rather than rejected, as in a group.
    if (seen.has(host.value)) continue;
    seen.add(host.value);
    hosts.push(host.value);
  }

  const value = isAssignableValue(rawValue) ? rawValue : DEFAULT_ASSIGN_VALUE;
  return { ok: true, value: { key, hosts, value } };
}

export function clampBannerSize(value: unknown, fallback: number): number {
  const size = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(size)) return fallback;
  return Math.min(MAX_BANNER_SIZE, Math.max(MIN_BANNER_SIZE, Math.round(size)));
}

export function isBannerPosition(value: unknown): value is BannerPosition {
  return value === 'top' || value === 'bottom';
}
