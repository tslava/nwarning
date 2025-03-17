export interface PlatformAPI {
    openOptionsPage: () => void;
    getCurrentTab: () => Promise<any>;
    sendMessageToTab: (tabId: number, message: any) => Promise<any>;
    onMessage: {
        addListener: (callback: (message: any, sender: any) => void) => void;
    };
    storage: {
        get: (keys: string[]) => Promise<{ [key: string]: any }>;
        set: (items: { [key: string]: any }) => Promise<void>;
    };
} 