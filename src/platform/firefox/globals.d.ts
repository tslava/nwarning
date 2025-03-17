declare namespace browser.runtime {
    function openOptionsPage(): void;
    function sendMessage(message: any): Promise<any>;
    const onMessage: {
        addListener: (callback: (message: any, sender: any) => void) => void;
    };
}

declare namespace browser.tabs {
    function query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<any[]>;
    function sendMessage(tabId: number, message: any): Promise<any>;
}

declare namespace browser.storage {
    const local: {
        get: (keys: string[]) => Promise<{ [key: string]: any }>;
        set: (items: { [key: string]: any }) => Promise<void>;
    };
} 