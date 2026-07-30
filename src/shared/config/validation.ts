import { countWildcards } from '../utils/patterns';
import { MAX_BANNER_SIZE, MIN_BANNER_SIZE } from './defaults';
import type { BannerPosition, EnvironmentGroup } from './schema';

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
 * Every non-production host must carry the same number of wildcards as the
 * production one: switching goes both ways, so `*.example.com` paired with a
 * fixed `dev.example.com` would translate one way and silently fail the other.
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
    if (countWildcards(dev.value) !== prodWildcards) {
      return {
        ok: false,
        error:
          `"${dev.value}" has ${countWildcards(dev.value)} wildcard(s) but production ` +
          `"${prod.value}" has ${prodWildcards} — they must match so switching works both ways`,
      };
    }

    // Duplicates are dropped rather than rejected; they are harmless typos.
    if (seen.has(dev.value)) continue;
    seen.add(dev.value);
    value.push(dev.value);
  }

  return { ok: true, value: { production: prod.value, development: value } };
}

export function clampBannerSize(value: unknown, fallback: number): number {
  const size = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(size)) return fallback;
  return Math.min(MAX_BANNER_SIZE, Math.max(MIN_BANNER_SIZE, Math.round(size)));
}

export function isBannerPosition(value: unknown): value is BannerPosition {
  return value === 'top' || value === 'bottom';
}
