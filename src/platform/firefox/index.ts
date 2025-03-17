import { PlatformAPI } from '../../shared/types/platform';

const firefoxPlatform: PlatformAPI = {
    openOptionsPage: () => {
        browser.runtime.openOptionsPage();
    },
    
    getCurrentTab: async () => {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        return tabs[0];
    },
    
    sendMessageToTab: async (tabId: number, message: any) => {
        return await browser.tabs.sendMessage(tabId, message);
    },
    
    onMessage: {
        addListener: (callback: (message: any, sender: any) => void) => {
            browser.runtime.onMessage.addListener(callback);
        }
    },
    
    storage: {
        get: async (keys: string[]) => {
            return await browser.storage.local.get(keys);
        },
        set: async (items: { [key: string]: any }) => {
            await browser.storage.local.set(items);
        }
    }
};

export default firefoxPlatform; 