import type { PlatformAPI, StorageArea } from '../../shared/types/platform';

/** Matches the manifest's host_permissions. */
const HOST_ORIGINS = ['<all_urls>'];
/** Wraps one browser.storage area behind the platform-neutral StorageArea shape. */
function createStorageArea(area: 'sync' | 'local'): StorageArea {
  return {
    get: (keys) => browser.storage[area].get(keys),
    set: (items) => browser.storage[area].set(items),
    onChanged: (listener) => {
      browser.storage.onChanged.addListener((changes, changedArea) => {
        if (changedArea !== area) return;
        listener(Object.keys(changes));
      });
    },
  };
}

const DATA_MESSAGE = 'env-switcher:localStorage-data';
const CHANGE_MESSAGE = 'env-switcher:localStorage-changed';

/** How long to wait for the injected reader before falling back. */
const INJECTION_TIMEOUT_MS = 500;

/**
 * Only accept messages this window posted to itself. A cross-origin iframe's
 * postMessage arrives with `source` set to the iframe's window, so this check
 * keeps another frame from feeding us fabricated values. The page's own scripts
 * could still post them, but the page owns its localStorage anyway, so there is
 * no privilege boundary to defend there — the nonce just prevents cross-talk
 * between concurrent reads.
 */
function isOwnWindowMessage(event: MessageEvent): boolean {
  return event.source === window;
}

function runInPage(source: string): boolean {
  try {
    const script = document.createElement('script');
    script.textContent = source;
    (document.head ?? document.documentElement).appendChild(script);
    script.remove();
    return true;
  } catch {
    return false;
  }
}

/** Read directly, which works whenever the content script shares the page's storage. */
function readDirectly(keys: string[]): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const key of keys) {
    try {
      result[key] = localStorage.getItem(key);
    } catch {
      result[key] = null;
    }
  }
  return result;
}

/**
 * Read via a script injected into the page. Resolves to null if the injection is
 * blocked (a strict page CSP will block it) or does not answer in time, so the
 * caller can fall back instead of hanging forever — the previous implementation
 * had no timeout and left the promise pending.
 */
function readViaInjection(keys: string[]): Promise<Record<string, string | null> | null> {
  return new Promise((resolve) => {
    const nonce = crypto.randomUUID();
    let settled = false;

    const finish = (value: Record<string, string | null> | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(value);
    };

    const onMessage = (event: MessageEvent) => {
      if (!isOwnWindowMessage(event)) return;
      const data = event.data;
      if (!data || data.type !== DATA_MESSAGE || data.nonce !== nonce) return;
      finish(data.values as Record<string, string | null>);
    };

    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => finish(null), INJECTION_TIMEOUT_MS);

    const injected = runInPage(`
      (() => {
        const keys = ${JSON.stringify(keys)};
        const values = {};
        for (const key of keys) {
          try { values[key] = localStorage.getItem(key); } catch { values[key] = null; }
        }
        window.postMessage({ type: ${JSON.stringify(DATA_MESSAGE)}, nonce: ${JSON.stringify(nonce)}, values }, '*');
      })();
    `);

    if (!injected) finish(null);
  });
}

const firefoxPlatform: PlatformAPI = {
  openOptionsPage: () => {
    browser.runtime.openOptionsPage();
  },

  getVersion: () => browser.runtime.getManifest().version,

  permissions: {
    hasHostAccess: async () => {
      try {
        return await browser.permissions.contains({ origins: HOST_ORIGINS });
      } catch {
        // Treat an unanswerable question as "granted": showing a warning we
        // cannot act on would be worse than showing nothing.
        return true;
      }
    },
    requestHostAccess: async () => {
      try {
        return await browser.permissions.request({ origins: HOST_ORIGINS });
      } catch {
        // Some browsers refuse to request origins that are not declared
        // optional; the caller falls back to telling the user to do it by hand.
        return false;
      }
    },
  },

  getCurrentTab: async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab;
  },

  sendMessageToTab: (tabId, message) => browser.tabs.sendMessage(tabId, message),

  sendMessage: (message) => browser.runtime.sendMessage(message),

  createTab: async (options) => {
    await browser.tabs.create(options);
  },

  onMessage: {
    addListener: (handler) => {
      browser.runtime.onMessage.addListener(handler);
    },
  },

  onCommand: {
    addListener: (handler) => {
      browser.commands.onCommand.addListener(handler);
    },
  },

  setBadge: async ({ tabId, text, color }) => {
    await browser.action.setBadgeText({ tabId, text });
    if (text && color) {
      await browser.action.setBadgeBackgroundColor({ tabId, color });
    }
  },

  storage: {
    sync: createStorageArea('sync'),
    local: createStorageArea('local'),
  },

  getLocalStorageValues: async (keys) => {
    if (keys.length === 0) return {};
    const injected = await readViaInjection(keys);
    return injected ?? readDirectly(keys);
  },

  removeLocalStorageValue: async (key) => {
    // Mirrors the read path: the injected removal is what counts if the content
    // script does not share the page's storage, and the direct one covers the
    // case where a page CSP blocks the injection. Doing both is harmless.
    runInPage(`try { localStorage.removeItem(${JSON.stringify(key)}); } catch {}`);
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing more to try.
    }
  },

  watchLocalStorage: (onChange) => {
    window.addEventListener('message', (event) => {
      if (!isOwnWindowMessage(event)) return;
      if (event.data?.type === CHANGE_MESSAGE) onChange();
    });

    // Writes from other tabs surface as a normal storage event.
    window.addEventListener('storage', (event) => {
      if (event.storageArea === localStorage) onChange();
    });

    // Same-tab writes do not fire a storage event, so proxy the mutators. If the
    // page's CSP blocks this, cross-tab changes are still observed above.
    runInPage(`
      (() => {
        const notify = () => window.postMessage({ type: ${JSON.stringify(CHANGE_MESSAGE)} }, '*');
        for (const name of ['setItem', 'removeItem', 'clear']) {
          const original = localStorage[name];
          if (typeof original !== 'function') continue;
          localStorage[name] = function (...args) {
            const result = original.apply(this, args);
            notify();
            return result;
          };
        }
      })();
    `);
  },
};

export default firefoxPlatform;
