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
    },

    // Add Firefox-specific method for localStorage access
    getLocalStorageValues: async (keys: string[]): Promise<{ [key: string]: string | null }> => {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.textContent = `
                (function() {
                    const keys = ${JSON.stringify(keys)};
                    const result = {};
                    for (const key of keys) {
                        result[key] = localStorage.getItem(key);
                    }
                    window.postMessage({ type: 'localStorage-data', data: result }, '*');
                })();
            `;
            document.documentElement.appendChild(script);
            script.remove();

            const messageHandler = (event: MessageEvent) => {
                if (event.data && event.data.type === 'localStorage-data') {
                    window.removeEventListener('message', messageHandler);
                    resolve(event.data.data);
                }
            };
            window.addEventListener('message', messageHandler);
        });
    },

    // Add method to inject storage event listener
    injectStorageListener: (callback: () => void): void => {
        // Create a script element to inject the storage event listener
        const script = document.createElement('script');
        script.textContent = `
            (function() {
                // Create a proxy to intercept localStorage operations
                const originalSetItem = localStorage.setItem;
                const originalRemoveItem = localStorage.removeItem;
                const originalClear = localStorage.clear;

                localStorage.setItem = function(key, value) {
                    originalSetItem.apply(this, arguments);
                    window.postMessage({ type: 'localStorage-changed', key, value }, '*');
                };

                localStorage.removeItem = function(key) {
                    originalRemoveItem.apply(this, arguments);
                    window.postMessage({ type: 'localStorage-changed', key, value: null }, '*');
                };

                localStorage.clear = function() {
                    originalClear.apply(this, arguments);
                    window.postMessage({ type: 'localStorage-changed', key: null, value: null }, '*');
                };

                // Also listen for storage events from other windows/tabs
                window.addEventListener('storage', function(e) {
                    if (e.storageArea === localStorage) {
                        window.postMessage({ 
                            type: 'localStorage-changed', 
                            key: e.key, 
                            value: e.newValue 
                        }, '*');
                    }
                });
            })();
        `;
        document.documentElement.appendChild(script);
        script.remove();

        // Listen for messages from the injected script
        const messageHandler = (event: MessageEvent) => {
            if (event.data && event.data.type === 'localStorage-changed') {
                callback();
            }
        };
        window.addEventListener('message', messageHandler);
    }
};

export default firefoxPlatform; 