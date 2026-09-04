import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageMonitor, type Warning } from './StorageMonitor';

/**
 * Runs against jsdom's own localStorage through the Chrome platform, which reads
 * and writes it directly — the same path a Chrome content script takes.
 */
function createMonitor() {
  const updates: Warning[][] = [];
  const monitor = new StorageMonitor((warnings) => updates.push(warnings));
  return { monitor, updates, last: () => updates[updates.length - 1] };
}

/** A key as the content script hands it over: name plus what to assign. */
function watched(key: string, assignValue = '1') {
  return { key, assignValue };
}

beforeEach(() => {
  localStorage.clear();
});

describe('StorageMonitor.refresh', () => {
  it('reports nothing at all when no keys are configured', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('ignored', '1');

    monitor.setKeys([]);
    await monitor.refresh();

    expect(last()).toEqual([]);
  });

  it('reports a key that is not set, so the banner can offer to set it', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('present', 'x');

    monitor.setKeys([watched('present'), watched('absent', 'true')]);
    await monitor.refresh();

    // A configured key is reported either way: absence is a state the chip has
    // something to offer about, and what it would write comes from the key.
    expect(last()).toEqual([
      { key: 'present', value: 'x', isWarning: false, pendingReload: false, nextValue: null },
      { key: 'absent', value: null, isWarning: false, pendingReload: false, nextValue: 'true' },
    ]);
  });

  it('keeps the configured order', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('b', '1');
    localStorage.setItem('a', '1');

    monitor.setKeys([watched('a'), watched('b')]);
    await monitor.refresh();

    expect(last().map((warning) => warning.key)).toEqual(['a', 'b']);
  });

  it('treats only 1 and true as switched on, by the common convention', async () => {
    const { monitor, last } = createMonitor();
    const cases: Record<string, boolean> = {
      '1': true,
      true: true,
      TRUE: true,
      ' 1 ': true,
      '0': false,
      false: false,
      no: false,
      anything: false,
    };

    for (const [value, expected] of Object.entries(cases)) {
      localStorage.setItem('flag', value);
      monitor.setKeys([watched('flag')]);
      await monitor.refresh();
      expect(last()[0]).toMatchObject({ value, isWarning: expected });
    }
  });

  it('keeps reporting a key after its value is deleted elsewhere', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('flag', '1');
    monitor.setKeys([watched('flag')]);
    await monitor.refresh();
    expect(last()).toHaveLength(1);

    localStorage.removeItem('flag');
    await monitor.refresh();

    expect(last()).toEqual([
      { key: 'flag', value: null, isWarning: false, pendingReload: false, nextValue: '1' },
    ]);
  });

  it('reports nothing once the keys stop applying to this host', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('flag', '1');
    monitor.setKeys([watched('flag')]);
    await monitor.refresh();
    expect(last()).toHaveLength(1);

    monitor.setKeys([]);
    await monitor.refresh();
    expect(last()).toEqual([]);
  });
});

describe('StorageMonitor.toggle', () => {
  it('flips the stored value and says a reload is needed', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('use-production-data', '1');
    monitor.setKeys([watched('use-production-data')]);
    await monitor.refresh();

    await monitor.toggle('use-production-data');

    expect(localStorage.getItem('use-production-data')).toBe('0');
    expect(last()).toEqual([
      {
        key: 'use-production-data',
        value: '0',
        isWarning: false,
        pendingReload: true,
        nextValue: '1',
      },
    ]);
  });

  it('drops the reload note once the flag is back where the page found it', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('flag', '1');
    monitor.setKeys([watched('flag')]);

    await monitor.toggle('flag');
    await monitor.toggle('flag');

    // The page read '1' at startup and '1' is what is stored again, so there is
    // nothing left to reload for.
    expect(localStorage.getItem('flag')).toBe('1');
    expect(last()).toEqual([
      { key: 'flag', value: '1', isWarning: true, pendingReload: false, nextValue: '0' },
    ]);
  });

  it('stays in the vocabulary it found', async () => {
    const { monitor } = createMonitor();
    localStorage.setItem('flag', 'TRUE');
    monitor.setKeys([watched('flag')]);

    await monitor.toggle('flag');

    expect(localStorage.getItem('flag')).toBe('FALSE');
  });

  it('assigns the value the key is configured with', async () => {
    const { monitor, last } = createMonitor();
    monitor.setKeys([watched('flag', 'true')]);
    await monitor.refresh();

    expect(await monitor.toggle('flag')).toBe(true);

    // Not '1': some front ends compare against the literal, which is the whole
    // reason the value is configurable per key.
    expect(localStorage.getItem('flag')).toBe('true');
    expect(last()).toEqual([
      { key: 'flag', value: 'true', isWarning: true, pendingReload: true, nextValue: 'false' },
    ]);
  });

  it('refuses a key that does not apply to this host', async () => {
    const { monitor } = createMonitor();
    monitor.setKeys([watched('flag')]);

    // Nothing has said what to write into it, and a stale chip must not guess.
    expect(await monitor.toggle('other')).toBe(false);
    expect(localStorage.getItem('other')).toBeNull();
  });

  it('turns a flag on again after it has gone missing', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('flag', '1');
    monitor.setKeys([watched('flag')]);
    await monitor.toggle('flag');

    // Deleted from devtools, say, while the chip was on screen.
    localStorage.removeItem('flag');
    await monitor.toggle('flag');

    expect(localStorage.getItem('flag')).toBe('1');
    // Back to the value the page loaded with, so the note goes with it.
    expect(last()).toEqual([
      { key: 'flag', value: '1', isWarning: true, pendingReload: false, nextValue: '0' },
    ]);
  });

  it('reports whether it wrote anything, since a new tab hangs off that', async () => {
    const { monitor } = createMonitor();
    localStorage.setItem('flag', '1');
    localStorage.setItem('other', 'staging');
    monitor.setKeys([watched('flag'), watched('other')]);

    expect(await monitor.toggle('flag')).toBe(true);
    expect(await monitor.toggle('other')).toBe(false);
  });

  it('leaves a value that is not a plain on/off flag untouched', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('flag', 'staging');
    monitor.setKeys([watched('flag')]);
    await monitor.refresh();

    await monitor.toggle('flag');

    expect(localStorage.getItem('flag')).toBe('staging');
    expect(last()).toEqual([
      { key: 'flag', value: 'staging', isWarning: false, pendingReload: false, nextValue: null },
    ]);
  });

  it('reads the value again rather than trusting what the chip was built from', async () => {
    const { monitor } = createMonitor();
    localStorage.setItem('flag', '1');
    monitor.setKeys([watched('flag')]);
    await monitor.refresh();

    // The page itself changed the flag after the chip was rendered.
    localStorage.setItem('flag', 'staging');
    await monitor.toggle('flag');

    expect(localStorage.getItem('flag')).toBe('staging');
  });
});

describe('StorageMonitor.unset', () => {
  it('removes the key and says a reload is needed', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('flag', '1');
    monitor.setKeys([watched('flag')]);
    await monitor.refresh();

    expect(await monitor.unset('flag')).toBe(true);

    expect(localStorage.getItem('flag')).toBeNull();
    // The page is still running on the '1' it read at startup.
    expect(last()).toEqual([
      { key: 'flag', value: null, isWarning: false, pendingReload: true, nextValue: '1' },
    ]);
  });

  it('is the way out of a value it refuses to overwrite', async () => {
    const { monitor } = createMonitor();
    localStorage.setItem('flag', 'staging');
    monitor.setKeys([watched('flag')]);

    // toggle leaves such a value alone; unset is the user plainly asking for it
    // to go, which is the one thing that can be done about it from here.
    expect(await monitor.toggle('flag')).toBe(false);
    expect(await monitor.unset('flag')).toBe(true);
    expect(localStorage.getItem('flag')).toBeNull();
  });

  it('reports nothing removed when the key is already gone', async () => {
    const { monitor } = createMonitor();
    monitor.setKeys([watched('flag')]);

    // The caller opens a tab on the strength of this, so "already absent" must be
    // distinguishable from a removal.
    expect(await monitor.unset('flag')).toBe(false);
  });

  it('refuses a key that does not apply to this host', async () => {
    const { monitor } = createMonitor();
    localStorage.setItem('other', '1');
    monitor.setKeys([watched('flag')]);

    expect(await monitor.unset('other')).toBe(false);
    expect(localStorage.getItem('other')).toBe('1');
  });

  it('drops the reload note once the value is back where the page found it', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('flag', '1');
    monitor.setKeys([watched('flag')]);

    await monitor.unset('flag');
    await monitor.toggle('flag');

    expect(localStorage.getItem('flag')).toBe('1');
    expect(last()[0].pendingReload).toBe(false);
  });
});

describe('StorageMonitor tracking outside changes', () => {
  it('reports a key that has gone missing since it was changed here', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('flag', '1');
    monitor.setKeys([watched('flag')]);
    await monitor.toggle('flag');

    // Devtools, another tab or the app itself can still delete the key. The chip
    // has to stay, because the running page is on neither value.
    localStorage.removeItem('flag');
    await monitor.refresh();

    expect(last()).toEqual([
      { key: 'flag', value: null, isWarning: false, pendingReload: true, nextValue: '1' },
    ]);
  });

  it('forgets the pending state when the key stops being tracked', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('flag', '1');
    monitor.setKeys([watched('flag')]);
    await monitor.toggle('flag');

    monitor.setKeys([watched('other')]);
    await monitor.refresh();

    expect(last().map((warning) => warning.key)).toEqual(['other']);
    // The baseline went with the key, so nothing claims a reload is pending.
    expect(last()[0].pendingReload).toBe(false);
  });
});

describe('StorageMonitor.start', () => {
  it('refreshes when the page writes to localStorage', async () => {
    const { monitor, updates } = createMonitor();
    monitor.setKeys([watched('flag')]);
    monitor.start();
    const before = updates.length;

    // Chrome's platform listens for the cross-tab storage event.
    localStorage.setItem('flag', '1');
    window.dispatchEvent(new StorageEvent('storage', { storageArea: localStorage, key: 'flag' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(updates.length).toBeGreaterThan(before);
  });

  it('subscribes only once', () => {
    const { monitor } = createMonitor();
    const spy = vi.spyOn(window, 'addEventListener');
    monitor.start();
    monitor.start();
    const storageSubscriptions = spy.mock.calls.filter(([type]) => type === 'storage');
    expect(storageSubscriptions).toHaveLength(1);
    spy.mockRestore();
  });
});
