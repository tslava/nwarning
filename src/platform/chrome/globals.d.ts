declare namespace chrome.runtime {
    function openOptionsPage(): void;
    function sendMessage(message: any): void;
    const onMessage: {
        addListener: (callback: (message: any, sender: any) => void) => void;
    };
}

declare namespace chrome.tabs {
    function query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<chrome.tabs.Tab[]>;
    function sendMessage(tabId: number, message: any): Promise<any>;
}

declare namespace chrome.storage {
    const local: {
        get: (keys: string[], callback: (result: { [key: string]: any }) => void) => void;
        set: (items: { [key: string]: any }, callback?: () => void) => void;
    };
}

declare namespace chrome.commands {
    const onCommand: {
        addListener: (callback: (command: string) => void) => void;
    };
}

interface Tab {
    id?: number;
    url?: string;
    title?: string;
    active: boolean;
    windowId: number;
} 