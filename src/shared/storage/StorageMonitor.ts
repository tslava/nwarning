/**
 * Watches a configured set of page-localStorage keys and reports their values.
 */

import { platform } from '../platform';

export interface Warning {
  key: string;
  value: string;
  /**
   * Value reads as "switched on". The `'1'` / `'true'` rule is the common
   * convention for such flags, so a flag shown as on here is on in the app too.
   */
  isWarning: boolean;
  /**
   * Removed through the banner, but the page has not been reloaded. Frontends
   * read these flags once at startup, so the stored value and what the running
   * app is actually using have diverged until then.
   */
  pendingReload: boolean;
}

function looksEnabled(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

export class StorageMonitor {
  private keys: string[] = [];
  private watching = false;
  /** Keys this banner removed; kept until the page reloads. */
  private readonly pending = new Set<string>();

  constructor(private readonly onWarningsUpdate: (warnings: Warning[]) => void) {}

  setKeys(keys: string[]): void {
    this.keys = keys;
    for (const key of this.pending) {
      if (!keys.includes(key)) this.pending.delete(key);
    }
  }

  /** Start observing page localStorage. Safe to call more than once. */
  start(): void {
    if (this.watching) return;
    this.watching = true;
    platform.watchLocalStorage(() => void this.refresh());
  }

  /**
   * Remove a tracked key from the page's localStorage. Reverting to the app's
   * built-in default is the one thing that cannot be expressed as a value —
   * these flags treat any non-empty value as an override — so it needs its own
   * action rather than writing `0`.
   */
  async remove(key: string): Promise<void> {
    await platform.removeLocalStorageValue(key);
    this.pending.add(key);
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.keys.length === 0) {
      // Always report, so clearing the configured keys clears the display too.
      this.onWarningsUpdate([]);
      return;
    }

    const values = await platform.getLocalStorageValues(this.keys);
    const warnings: Warning[] = [];

    for (const key of this.keys) {
      const value = values[key] ?? null;

      if (value === null) {
        // An absent key means the app falls back to how it was built, which the
        // banner already states — so there is nothing to show, unless we are the
        // ones who removed it and the page has yet to catch up.
        if (this.pending.has(key)) {
          warnings.push({ key, value: '', isWarning: false, pendingReload: true });
        }
        continue;
      }

      warnings.push({
        key,
        value,
        isWarning: looksEnabled(value),
        pendingReload: this.pending.has(key),
      });
    }

    this.onWarningsUpdate(warnings);
  }
}
