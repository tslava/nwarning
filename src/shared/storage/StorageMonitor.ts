/**
 * Watches a configured set of page-localStorage keys, reports their values, and
 * changes them on request.
 */

import { platform } from '../platform';
import { looksEnabled, nextFlagValue } from './flagValue';

export interface Warning {
  key: string;
  /** Stored value, or null when the key is absent from the page's localStorage. */
  value: string | null;
  /** Value reads as "switched on" — see `looksEnabled`. */
  isWarning: boolean;
  /**
   * Changed through the banner, and the page has not been reloaded since. Front
   * ends read these flags once at startup, so the stored value and what the
   * running app is actually using have diverged until then.
   */
  pendingReload: boolean;
  /**
   * What clicking the chip writes, or null when the stored value is not a flag
   * this can flip — see `nextFlagValue`.
   */
  nextValue: string | null;
}

export class StorageMonitor {
  private keys: string[] = [];
  private watching = false;
  /**
   * For every key this banner has changed, the value it held beforehand.
   *
   * This is what makes "reload to apply" true rather than sticky: the page is
   * running whatever it read at startup, which is this value, so the note belongs
   * on the chip exactly while the stored value differs from it. Flipping a flag
   * and flipping it straight back leaves nothing to reload for, and the note goes
   * away by itself.
   */
  private readonly baseline = new Map<string, string | null>();

  constructor(private readonly onWarningsUpdate: (warnings: Warning[]) => void) {}

  setKeys(keys: string[]): void {
    this.keys = keys;
    for (const key of this.baseline.keys()) {
      if (!keys.includes(key)) this.baseline.delete(key);
    }
  }

  /** Start observing page localStorage. Safe to call more than once. */
  start(): void {
    if (this.watching) return;
    this.watching = true;
    platform.watchLocalStorage(() => void this.refresh());
  }

  /**
   * Flip a tracked flag between its on and off values, so pointing an app at
   * production data and back is a click in the banner instead of a trip through
   * devtools.
   *
   * A value that is not a plain on/off flag is left untouched, the same decision
   * the chip presents — checked again here because the value the chip was built
   * from can be stale by the time it is clicked, and this must never overwrite
   * something it has not just looked at.
   */
  async toggle(key: string): Promise<void> {
    const current = await this.read(key);
    const next = nextFlagValue(current);
    if (next === null) return;

    this.rememberBaseline(key, current);
    await platform.setLocalStorageValue(key, next);
    await this.refresh();
  }

  /**
   * Remove a tracked key from the page's localStorage. Reverting to the app's
   * built-in default is the one thing that cannot be expressed as a value —
   * these flags treat any non-empty value as an override — so it needs its own
   * action rather than writing `0`.
   */
  async remove(key: string): Promise<void> {
    this.rememberBaseline(key, await this.read(key));
    await platform.removeLocalStorageValue(key);
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
      const pendingReload = this.resolvePending(key, value);

      // An absent key means the app falls back to how it was built, which the
      // banner already states — so there is nothing to show, unless we are the
      // ones who removed it and the page has yet to catch up.
      if (value === null && !pendingReload) continue;

      warnings.push({
        key,
        value,
        isWarning: value !== null && looksEnabled(value),
        pendingReload,
        nextValue: nextFlagValue(value),
      });
    }

    this.onWarningsUpdate(warnings);
  }

  private async read(key: string): Promise<string | null> {
    const values = await platform.getLocalStorageValues([key]);
    return values[key] ?? null;
  }

  private rememberBaseline(key: string, current: string | null): void {
    if (!this.baseline.has(key)) this.baseline.set(key, current);
  }

  /** Whether the stored value still differs from what the page loaded with. */
  private resolvePending(key: string, value: string | null): boolean {
    if (!this.baseline.has(key)) return false;
    if (this.baseline.get(key) !== value) return true;

    // Back where the page started: forget it, so a later change starts from the
    // value that is genuinely running.
    this.baseline.delete(key);
    return false;
  }
}
