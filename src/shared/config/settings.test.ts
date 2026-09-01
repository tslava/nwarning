import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsManager } from './settings';
import type { EnvironmentGroup } from './schema';
import { FakeStorage } from '../testing/fakeStorage';

describe('SettingsManager.load', () => {
  it('returns defaults for empty storage', async () => {
    const settings = await new SettingsManager(new FakeStorage()).load();
    expect(settings).toEqual({
      extensionEnabled: true,
      groups: [],
      prodSize: 30,
      devSize: 30,
      bannerPosition: 'top',
      localStorageKeys: [],
    });
  });

  it('treats a missing extensionEnabled as enabled and false as disabled', async () => {
    expect((await new SettingsManager(new FakeStorage({})).load()).extensionEnabled).toBe(true);
    expect(
      (await new SettingsManager(new FakeStorage({ extensionEnabled: false })).load())
        .extensionEnabled,
    ).toBe(false);
  });

  it('clamps stored sizes and falls back on an unknown position', async () => {
    const storage = new FakeStorage({ prodSize: 9000, devSize: 'x', bannerPosition: 'middle' });
    const settings = await new SettingsManager(storage).load();
    expect(settings.prodSize).toBe(200);
    // 'x' is not a number, so the default stands in.
    expect(settings.devSize).toBe(30);
    expect(settings.bannerPosition).toBe('top');
  });

  it('drops non-string and blank localStorage keys', async () => {
    const storage = new FakeStorage({ localStorageKeys: ['a', '', '  ', 7, null, 'b'] });
    const settings = await new SettingsManager(storage).load();
    expect(settings.localStorageKeys).toEqual(['a', 'b']);
  });

  it('reads a group with several stands', async () => {
    const storage = new FakeStorage({
      groups: [
        { production: 'example.com', development: ['dev.example.com', 'staging.example.com'] },
      ],
    });
    const settings = await new SettingsManager(storage).load();
    expect(settings.groups).toEqual([
      { production: 'example.com', development: ['dev.example.com', 'staging.example.com'] },
    ]);
  });

  it('drops stored groups that no longer validate', async () => {
    const storage = new FakeStorage({
      groups: [
        { production: 'example.com', development: ['dev.example.com'] },
        { production: '*', development: ['dev.example.com'] },
        { production: '*.example.com', development: ['*.*.dev.example.com'] },
        { production: 'lonely.example.com', development: [] },
        { nonsense: true },
      ],
    });
    const settings = await new SettingsManager(storage).load();
    expect(settings.groups).toEqual([
      { production: 'example.com', development: ['dev.example.com'] },
    ]);
  });

  it('folds stored groups that share a production host', async () => {
    const storage = new FakeStorage({
      groups: [
        { production: 'example.com', development: ['dev.example.com'] },
        { production: 'example.com', development: ['staging.example.com', 'dev.example.com'] },
      ],
    });
    const settings = await new SettingsManager(storage).load();
    expect(settings.groups).toEqual([
      { production: 'example.com', development: ['dev.example.com', 'staging.example.com'] },
    ]);
  });
});

describe('SettingsManager.load migration from 1.2 pairs', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = new FakeStorage({
      pairs: [
        { production: 'app.example.com', development: 'dev.example.com' },
        { production: 'app.example.com', development: 'staging.example.com' },
        { production: '*.prod.example.com', development: '*.dev.example.com' },
      ],
    });
  });

  it('folds pairs sharing a production host into one group', async () => {
    const settings = await new SettingsManager(storage).load();
    expect(settings.groups).toEqual([
      { production: 'app.example.com', development: ['dev.example.com', 'staging.example.com'] },
      { production: '*.prod.example.com', development: ['*.dev.example.com'] },
    ]);
  });

  it('persists the migration once and leaves the old key in place', async () => {
    const manager = new SettingsManager(storage);
    await manager.load();
    expect(storage.writes).toHaveLength(1);
    expect(storage.lastWrite<EnvironmentGroup[]>('groups')).toHaveLength(2);

    await manager.load();
    expect(storage.writes).toHaveLength(1);
    expect(await storage.get(['pairs'])).toHaveProperty('pairs');
  });
});

describe('SettingsManager.load migration from pre-1.2 arrays', () => {
  it('rebuilds groups from the parallel arrays', async () => {
    const storage = new FakeStorage({
      productionSites: ['example.com', 'example.com'],
      developmentSites: ['dev.example.com', 'staging.example.com'],
    });
    const settings = await new SettingsManager(storage).load();
    expect(settings.groups).toEqual([
      { production: 'example.com', development: ['dev.example.com', 'staging.example.com'] },
    ]);
  });

  it('ignores entries without a counterpart', async () => {
    const storage = new FakeStorage({
      productionSites: ['a.example.com', 'b.example.com'],
      developmentSites: ['dev.a.example.com'],
    });
    const settings = await new SettingsManager(storage).load();
    expect(settings.groups).toEqual([
      { production: 'a.example.com', development: ['dev.a.example.com'] },
    ]);
  });

  it('prefers 1.2 pairs over the older arrays', async () => {
    const storage = new FakeStorage({
      pairs: [{ production: 'new.example.com', development: 'dev.new.example.com' }],
      productionSites: ['old.example.com'],
      developmentSites: ['dev.old.example.com'],
    });
    const settings = await new SettingsManager(storage).load();
    expect(settings.groups).toEqual([
      { production: 'new.example.com', development: ['dev.new.example.com'] },
    ]);
  });

  it('prefers the current shape once it exists', async () => {
    const storage = new FakeStorage({
      groups: [{ production: 'current.example.com', development: ['dev.current.example.com'] }],
      pairs: [{ production: 'old.example.com', development: 'dev.old.example.com' }],
    });
    const settings = await new SettingsManager(storage).load();
    expect(settings.groups).toEqual([
      { production: 'current.example.com', development: ['dev.current.example.com'] },
    ]);
    expect(storage.writes).toHaveLength(0);
  });
});

describe('SettingsManager migration from local to synced storage', () => {
  it('copies an existing local configuration into sync on first load', async () => {
    const sync = new FakeStorage();
    const local = new FakeStorage({
      groups: [{ production: 'app.example.com', development: ['dev.example.com'] }],
      extensionEnabled: false,
      prodSize: 100,
      bannerPosition: 'bottom',
      localStorageKeys: ['use-prod-db'],
    });

    const settings = await new SettingsManager(sync, local).load();

    expect(settings.groups).toEqual([
      { production: 'app.example.com', development: ['dev.example.com'] },
    ]);
    expect(settings.extensionEnabled).toBe(false);
    expect(sync.lastWrite('prodSize')).toBe(100);
    expect(sync.lastWrite('bannerPosition')).toBe('bottom');
    expect(sync.lastWrite('localStorageKeys')).toEqual(['use-prod-db']);
  });

  it('does not read local again once sync holds anything', async () => {
    const sync = new FakeStorage({ extensionEnabled: false });
    const local = new FakeStorage({
      groups: [{ production: 'stale.example.com', development: ['dev.stale.example.com'] }],
    });

    const settings = await new SettingsManager(sync, local).load();

    expect(settings.groups).toEqual([]);
    expect(sync.writes).toHaveLength(0);
  });

  it('leaves the local copy alone, so a rollback still works', async () => {
    const sync = new FakeStorage();
    const local = new FakeStorage({
      groups: [{ production: 'app.example.com', development: ['dev.example.com'] }],
    });

    await new SettingsManager(sync, local).load();

    expect(local.writes).toHaveLength(0);
    expect(await local.get(['groups'])).toHaveProperty('groups');
  });

  it('runs the older shape migrations through the local copy too', async () => {
    const sync = new FakeStorage();
    const local = new FakeStorage({
      productionSites: ['app.example.com'],
      developmentSites: ['dev.example.com'],
    });

    const settings = await new SettingsManager(sync, local).load();

    expect(settings.groups).toEqual([
      { production: 'app.example.com', development: ['dev.example.com'] },
    ]);
    expect(sync.lastWrite('groups')).toEqual([
      { production: 'app.example.com', development: ['dev.example.com'] },
    ]);
  });

  it('works with no previous storage at all', async () => {
    const settings = await new SettingsManager(new FakeStorage()).load();
    expect(settings.groups).toEqual([]);
  });
});

describe('SettingsManager.onChange', () => {
  it('fires for owned keys and ignores others', async () => {
    const storage = new FakeStorage();
    const manager = new SettingsManager(storage);
    const seen: boolean[] = [];
    manager.onChange((settings) => seen.push(settings.extensionEnabled));

    await manager.save({ extensionEnabled: false });
    await storage.set({ somethingElse: 1 });
    // Let the load() promise inside onChange settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen).toEqual([false]);
  });
});
