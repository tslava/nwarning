interface Tab {
  id?: number;
  url?: string;
}

interface StorageData {
  extensionEnabled: boolean;
  prodBannerSize: string;
  devBannerSize: string;
  productionSites: string[];
  developmentSites: string[];
}

interface BrowserAPI {
  storage: {
    local: {
      get(keys: string[], callback: (items: StorageData) => void): void;
      set(items: Partial<StorageData>, callback?: () => void): void;
    };
  };
  runtime: {
    sendMessage(message: any): Promise<any>;
    onMessage: {
      addListener(callback: (message: any, sender: any) => void): void;
    };
  };
  tabs: {
    query(queryInfo: { active: boolean; currentWindow: boolean }, callback: (tabs: Tab[]) => void): void;
    create(createProperties: { url: string }): void;
  };
} 