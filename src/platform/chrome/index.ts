import type { PlatformAPI, StorageArea } from '../../shared/types/platform';

/** Matches the manifest's host_permissions. */
const HOST_ORIGINS = ['<all_urls>'];
/** Wraps one chrome.storage area behind the platform-neutral StorageArea shape. */
function createStorageArea(area: 'sync' | 'local'): StorageArea {
  return {
    get: (keys) => chrome.storage[area].get(keys),
    set: (items) => chrome.storage[area].set(items),
    onChanged: (listener) => {
      chrome.storage.onChanged.addListener((changes, changedArea) => {
        if (changedArea !== area) return;
        listener(Object.keys(changes));
      });
    },
  };
}

const chromePlatform: PlatformAPI = {
  openOptionsPage: () => {
    chrome.runtime.openOptionsPage();
  },

  getVersion: () => chrome.runtime.getManifest().version,

  permissions: {
    hasHostAccess: async () => {
      try {
        return await chrome.permissions.contains({ origins: HOST_ORIGINS });
      } catch {
        // Treat an unanswerable question as "granted": showing a warning we
        // cannot act on would be worse than showing nothing.
        return true;
      }
    },
    requestHostAccess: async () => {
      try {
        return await chrome.permissions.request({ origins: HOST_ORIGINS });
      } catch {
        // Some browsers refuse to request origins that are not declared
        // optional; the caller falls back to telling the user to do it by hand.
        return false;
      }
    },
  },

  sendMessage: (message) => chrome.runtime.sendMessage(message),

  onMessage: {
    addListener: (handler) => {
      chrome.runtime.onMessage.addListener(handler);
    },
  },

  setBadge: async ({ tabId, text, color }) => {
    await chrome.action.setBadgeText({ tabId, text });
    if (text && color) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color });
    }
  },

  storage: {
    sync: createStorageArea('sync'),
    local: createStorageArea('local'),
  },

  // Chrome content scripts run in an isolated world but share the page's origin,
  // so the page's localStorage is directly reachable.
  getLocalStorageValues: async (keys) => {
    const result: Record<string, string | null> = {};
    for (const key of keys) {
      try {
        result[key] = localStorage.getItem(key);
      } catch {
        // Sandboxed or storage-partitioned contexts can throw on access.
        result[key] = null;
      }
    }
    return result;
  },

  setLocalStorageValue: async (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Sandboxed or storage-partitioned contexts can throw on access, and a
      // full quota throws too.
    }
  },

  watchLocalStorage: (onChange) => {
    // Fires for writes made by other tabs of the same origin.
    window.addEventListener('storage', (event) => {
      if (event.storageArea === localStorage) onChange();
    });
  },
};

export default chromePlatform;
