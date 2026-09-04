import { describe, expect, it } from 'vitest';
import type { TrackedKey } from '../config/schema';
import { keysForHost } from './trackedKeys';

function key(name: string, hosts: string[], value = '1'): TrackedKey {
  return { key: name, hosts, value };
}

describe('keysForHost', () => {
  it('applies a key with no hosts to any host', () => {
    // Which is what the pre-2.1 flat list of names meant, so a migrated
    // configuration keeps watching everywhere the banner appears.
    const keys = [key('flag', [])];
    expect(keysForHost(keys, 'dev.example.com')).toEqual(keys);
    expect(keysForHost(keys, 'app.example.com')).toEqual(keys);
  });

  it('limits a scoped key to its own hosts', () => {
    const keys = [key('flag', ['dev.example.com', 'staging.example.com'])];
    expect(keysForHost(keys, 'dev.example.com')).toEqual(keys);
    expect(keysForHost(keys, 'staging.example.com')).toEqual(keys);
    expect(keysForHost(keys, 'app.example.com')).toEqual([]);
  });

  it('matches a host pattern the same way the banner does', () => {
    const keys = [key('flag', ['*.dev.example.com'])];
    expect(keysForHost(keys, 'app.dev.example.com')).toEqual(keys);
    expect(keysForHost(keys, 'dev.example.com')).toEqual([]);
    expect(keysForHost(keys, 'a.b.dev.example.com')).toEqual([]);
  });

  it('keeps the configured order', () => {
    const keys = [key('b', []), key('a', ['dev.example.com'])];
    expect(keysForHost(keys, 'dev.example.com').map((entry) => entry.key)).toEqual(['b', 'a']);
  });

  it('lets the first matching row win, so one key is one chip', () => {
    const keys = [
      key('flag', ['app.example.com'], '0'),
      key('flag', [], '1'),
      key('other', [], '1'),
    ];

    // Two rows for one key is the point of a per-row value — 0 on production, 1
    // on a stand — but two chips would be two switches over one value.
    expect(keysForHost(keys, 'app.example.com')).toEqual([
      key('flag', ['app.example.com'], '0'),
      key('other', [], '1'),
    ]);
    // Off production, the unscoped row is the one that applies.
    expect(keysForHost(keys, 'dev.example.com')).toEqual([
      key('flag', [], '1'),
      key('other', [], '1'),
    ]);
  });
});
