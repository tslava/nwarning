import type { SettingsStorage } from '../config/settings';

/** In-memory SettingsStorage for tests. */
export class FakeStorage implements SettingsStorage {
  public writes: Record<string, unknown>[] = [];
  private readonly listeners: ((keys: string[]) => void)[] = [];

  constructor(private readonly data: Record<string, unknown> = {}) {}

  async get(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in this.data) result[key] = this.data[key];
    }
    return result;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    this.writes.push(items);
    Object.assign(this.data, items);
    for (const listener of this.listeners) listener(Object.keys(items));
  }

  onChanged(listener: (keys: string[]) => void): void {
    this.listeners.push(listener);
  }

  /** Last value written for a key, or undefined if it was never written. */
  lastWrite<T>(key: string): T | undefined {
    for (let i = this.writes.length - 1; i >= 0; i--) {
      if (key in this.writes[i]) return this.writes[i][key] as T;
    }
    return undefined;
  }
}
