/**
 * Which watched keys apply to a hostname.
 *
 * The banner only exists on a host that matches an environment group, so this
 * runs after that decision and never has to look at the groups itself: an empty
 * host list means "wherever the extension is active", which is exactly where
 * this is called from.
 */

import type { TrackedKey } from '../config/schema';
import { matchDomainPattern } from './patterns';

/**
 * The keys in scope for `hostname`, in configured order, at most one per key
 * name.
 *
 * A key name may legitimately appear in several rows — the same flag assigned
 * `0` on production and `1` on a stand is the reason the value is per row — so
 * where two rows both match, the first wins. That mirrors `matchEnvironment`,
 * and it keeps one chip per key: two chips for one key would be two switches
 * fighting over one value.
 */
export function keysForHost(keys: TrackedKey[], hostname: string): TrackedKey[] {
  const resolved: TrackedKey[] = [];
  const claimed = new Set<string>();

  for (const tracked of keys) {
    if (claimed.has(tracked.key)) continue;
    const inScope =
      tracked.hosts.length === 0 ||
      tracked.hosts.some((pattern) => matchDomainPattern(hostname, pattern));
    if (!inScope) continue;

    claimed.add(tracked.key);
    resolved.push(tracked);
  }

  return resolved;
}
