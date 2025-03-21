import { PlatformAPI } from '../../shared/types/platform';

const chromePlatform: PlatformAPI = {
    openOptionsPage: () => {
        chrome.runtime.openOptionsPage();
    },
    
    getCurrentTab: async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    },
    
    sendMessageToTab: async (tabId: number, message: any) => {
        return await chrome.tabs.sendMessage(tabId, message);
    },
    
    onMessage: {
        addListener: (callback: (message: any, sender: any) => void) => {
            chrome.runtime.onMessage.addListener(callback);
        }
    },
    
    storage: {
        get: async (keys: string[]) => {
            return new Promise((resolve) => {
                chrome.storage.local.get(keys, (result) => {
                    resolve(result);
                });
            });
        },
        set: async (items: { [key: string]: any }) => {
            return new Promise((resolve) => {
                chrome.storage.local.set(items, () => {
                    resolve();
                });
            });
        }
    },

    // Add Chrome-specific method for localStorage access (direct access)
    getLocalStorageValues: async (keys: string[]): Promise<{ [key: string]: string | null }> => {
        const result: { [key: string]: string | null } = {};
        for (const key of keys) {
            result[key] = localStorage.getItem(key);
        }
        return result;
    },

    // No-op implementation for Chrome
    injectStorageListener: () => {}
};

export default chromePlatform; 