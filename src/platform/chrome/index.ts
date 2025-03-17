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
    }
};

export default chromePlatform; 