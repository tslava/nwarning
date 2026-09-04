import { describe, expect, it } from 'vitest';
import { exportSettings, importSettings, TRANSFER_VERSION } from './transfer';
import type { Settings } from './schema';

const SETTINGS: Settings = {
  extensionEnabled: false,
  groups: [
    { production: 'app.example.com', development: ['dev.example.com', 'staging.example.com'] },
  ],
  prodSize: 100,
  devSize: 30,
  bannerPosition: 'bottom',
  trackedKeys: [{ key: 'use-prod-db', hosts: ['dev.example.com'], value: '1' }],
};

describe('exportSettings', () => {
  it('writes a versioned, readable payload', () => {
    const parsed = JSON.parse(exportSettings(SETTINGS));
    expect(parsed).toEqual({
      version: TRANSFER_VERSION,
      groups: SETTINGS.groups,
      prodSize: 100,
      devSize: 30,
      bannerPosition: 'bottom',
      trackedKeys: SETTINGS.trackedKeys,
      // Names only, the shape 2.0 reads, so a file from here still imports there.
      localStorageKeys: ['use-prod-db'],
    });
  });

  it('leaves the on/off state out, since it is not part of a shared config', () => {
    expect(exportSettings(SETTINGS)).not.toContain('extensionEnabled');
  });

  it('round-trips through import', () => {
    const result = importSettings(exportSettings(SETTINGS));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        groups: SETTINGS.groups,
        prodSize: 100,
        devSize: 30,
        bannerPosition: 'bottom',
        trackedKeys: SETTINGS.trackedKeys,
      });
      expect(result.skippedGroups).toBe(0);
    }
  });
});

describe('importSettings', () => {
  it('rejects malformed JSON', () => {
    expect(importSettings('{not json')).toMatchObject({ ok: false, error: 'Not valid JSON' });
  });

  it('rejects a non-object payload', () => {
    expect(importSettings('[]')).toMatchObject({ ok: false });
    expect(importSettings('42')).toMatchObject({ ok: false });
  });

  it('rejects an unknown version', () => {
    const result = importSettings(JSON.stringify({ version: 99, groups: [] }));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain('version');
  });

  it('accepts a payload without a version field', () => {
    const result = importSettings(
      JSON.stringify({ groups: [{ production: 'a.com', development: ['dev.a.com'] }] }),
    );
    expect(result.ok).toBe(true);
  });

  it('requires a groups array', () => {
    expect(importSettings(JSON.stringify({ prodSize: 50 }))).toMatchObject({ ok: false });
  });

  it('validates groups the same way the form does, and counts what it skipped', () => {
    const result = importSettings(
      JSON.stringify({
        groups: [
          { production: 'good.com', development: ['dev.good.com'] },
          { production: '*', development: ['dev.com'] },
          { production: '*.wild.com', development: ['*.*.fixed.com'] },
          { production: 'nostands.com', development: [] },
          'nonsense',
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.groups).toEqual([
        { production: 'good.com', development: ['dev.good.com'] },
      ]);
      expect(result.skippedGroups).toBe(4);
    }
  });

  it('normalizes hosts on the way in', () => {
    const result = importSettings(
      JSON.stringify({
        groups: [
          { production: 'HTTPS://App.Example.com/x', development: ['dev.example.com:8443'] },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.groups).toEqual([
        { production: 'app.example.com', development: ['dev.example.com'] },
      ]);
    }
  });

  it('fails when nothing usable is left', () => {
    const result = importSettings(JSON.stringify({ groups: [{ production: '*' }] }));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain('No usable');
  });

  it('falls back to defaults for missing or nonsensical extras', () => {
    const result = importSettings(
      JSON.stringify({
        groups: [{ production: 'a.com', development: ['dev.a.com'] }],
        prodSize: 100000,
        bannerPosition: 'sideways',
        trackedKeys: [
          { key: 'ok', hosts: ['dev.a.com'], value: 'false' },
          { key: '', hosts: [] },
          7,
          { key: 'coerced', hosts: [], value: 'staging' },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prodSize).toBe(200);
      expect(result.value.devSize).toBe(30);
      expect(result.value.bannerPosition).toBe('top');
      expect(result.value.trackedKeys).toEqual([
        { key: 'ok', hosts: ['dev.a.com'], value: 'false' },
        // A value the banner could not write is coerced, not a reason to lose
        // the key: the name is the part that took someone effort to find.
        { key: 'coerced', hosts: [], value: '1' },
      ]);
    }
  });

  it('reads a payload from 2.0, where keys were names without hosts', () => {
    const result = importSettings(
      JSON.stringify({
        groups: [{ production: 'a.com', development: ['dev.a.com'] }],
        localStorageKeys: ['use-prod-db', '', 7],
      }),
    );
    expect(result.ok).toBe(true);
    // No hosts, which is what that list meant: every host the banner appears on.
    if (result.ok) {
      expect(result.value.trackedKeys).toEqual([{ key: 'use-prod-db', hosts: [], value: '1' }]);
    }
  });

  it('rejects a key whose host is not a hostname pattern', () => {
    const result = importSettings(
      JSON.stringify({
        groups: [{ production: 'a.com', development: ['dev.a.com'] }],
        trackedKeys: [
          { key: 'flag', hosts: ['not a host'] },
          { key: 'kept', hosts: [] },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    // Dropped rather than imported unvalidated: an import may not introduce a
    // configuration the form would have refused.
    if (result.ok) {
      expect(result.value.trackedKeys).toEqual([{ key: 'kept', hosts: [], value: '1' }]);
    }
  });
});
