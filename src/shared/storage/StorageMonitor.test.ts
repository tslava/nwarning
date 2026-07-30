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

  it('reports only the keys that are present', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('present', 'x');

    monitor.setKeys(['present', 'absent']);
    await monitor.refresh();

    expect(last()).toEqual([
      { key: 'present', value: 'x', isWarning: false, pendingReload: false },
    ]);
  });

  it('keeps the configured order', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('b', '1');
    localStorage.setItem('a', '1');

    monitor.setKeys(['a', 'b']);
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
      monitor.setKeys(['flag']);
      await monitor.refresh();
      expect(last()[0]).toMatchObject({ value, isWarning: expected });
    }
  });

  it('reports an empty list once the last tracked value disappears', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('flag', '1');
    monitor.setKeys(['flag']);
    await monitor.refresh();
    expect(last()).toHaveLength(1);

    localStorage.removeItem('flag');
    await monitor.refresh();
    expect(last()).toEqual([]);
  });
});

describe('StorageMonitor.remove', () => {
  it('removes the key from the page and reports that a reload is needed', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('use-production-data', '1');
    monitor.setKeys(['use-production-data']);
    await monitor.refresh();

    await monitor.remove('use-production-data');

    expect(localStorage.getItem('use-production-data')).toBeNull();
    expect(last()).toEqual([
      { key: 'use-production-data', value: '', isWarning: false, pendingReload: true },
    ]);
  });

  it('keeps saying a reload is needed on later refreshes', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('flag', '1');
    monitor.setKeys(['flag']);

    await monitor.remove('flag');
    await monitor.refresh();

    // The running page still holds the old value, so the chip must not vanish.
    expect(last()).toEqual([{ key: 'flag', value: '', isWarning: false, pendingReload: true }]);
  });

  it('marks a value written again after a removal as still pending', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('flag', '1');
    monitor.setKeys(['flag']);
    await monitor.remove('flag');

    localStorage.setItem('flag', '0');
    await monitor.refresh();

    expect(last()).toEqual([{ key: 'flag', value: '0', isWarning: false, pendingReload: true }]);
  });

  it('forgets the pending state when the key stops being tracked', async () => {
    const { monitor, last } = createMonitor();
    localStorage.setItem('flag', '1');
    monitor.setKeys(['flag']);
    await monitor.remove('flag');

    monitor.setKeys(['other']);
    await monitor.refresh();

    expect(last()).toEqual([]);
  });
});

describe('StorageMonitor.start', () => {
  it('refreshes when the page writes to localStorage', async () => {
    const { monitor, updates } = createMonitor();
    monitor.setKeys(['flag']);
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
