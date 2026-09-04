/**
 * Watches a configured set of page-localStorage keys, reports their values, and
 * changes them on request.
 */

import { platform } from '../platform';
import { looksEnabled, nextFlagValue } from './flagValue';

/**
 * A key to watch on this page, and what to write into it when it is not set.
 *
 * Host scope is resolved before this — the monitor is only ever handed the keys
 * that apply here — so it deals in key names and values only.
 */
export interface WatchedKey {
  key: string;
  /** Written when the key is absent; the key's configured value. */
  assignValue: string;
}

export interface Warning {
  key: string;
  /**
   * Stored value, or null when the key is absent from the page's localStorage.
   * Absent is reported rather than skipped: the key is configured for this host,
   * so its absence is a state the banner has something to say about, and the chip
   * is what offers to set it.
   */
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
  private keys: WatchedKey[] = [];
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

  setKeys(keys: WatchedKey[]): void {
    this.keys = keys;
    const watched = new Set(keys.map((entry) => entry.key));
    for (const key of this.baseline.keys()) {
      if (!watched.has(key)) this.baseline.delete(key);
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
   * devtools. A key that is not set on this page is assigned its configured
   * value, which is the same write in the other direction.
   *
   * A value that is not a plain on/off flag is left untouched, the same decision
   * the chip presents — checked again here because the value the chip was built
   * from can be stale by the time it is clicked, and this must never overwrite
   * something it has not just looked at.
   *
   * Resolves to whether anything was written. The caller opens a fresh tab on the
   * strength of that, so a refusal must be distinguishable from a change.
   */
  async toggle(key: string): Promise<boolean> {
    const watched = this.keys.find((entry) => entry.key === key);
    // Not watched here, so nothing has told us what to write into it.
    if (!watched) return false;

    const current = await this.read(key);
    const next = nextFlagValue(current, watched.assignValue);
    if (next === null) return false;

    this.rememberBaseline(key, current);
    await platform.setLocalStorageValue(key, next);
    await this.refresh();
    return true;
  }

  /**
   * Remove a tracked key, so the app falls back to however it was built.
   *
   * The way out of a value `toggle` refuses to overwrite, and the reverse of
   * assigning one. Destructive and unundoable, which is why the banner asks for it
   * by a named control rather than as one more thing a chip click might do.
   *
   * Resolves to whether anything was removed, so a caller can tell a real removal
   * from a key that was already gone.
   */
  async unset(key: string): Promise<boolean> {
    const watched = this.keys.find((entry) => entry.key === key);
    if (!watched) return false;

    // Re-read for the same reason `toggle` does: what the chip was built from can
    // be stale, and there is nothing to remove if the key has already gone.
    const current = await this.read(key);
    if (current === null) return false;

    this.rememberBaseline(key, current);
    await platform.removeLocalStorageValue(key);
    await this.refresh();
    return true;
  }

  async refresh(): Promise<void> {
    if (this.keys.length === 0) {
      // Always report, so clearing the configured keys clears the display too.
      this.onWarningsUpdate([]);
      return;
    }

    const values = await platform.getLocalStorageValues(this.keys.map((entry) => entry.key));
    const warnings: Warning[] = [];

    for (const watched of this.keys) {
      const value = values[watched.key] ?? null;

      warnings.push({
        key: watched.key,
        value,
        isWarning: value !== null && looksEnabled(value),
        pendingReload: this.resolvePending(watched.key, value),
        nextValue: nextFlagValue(value, watched.assignValue),
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
