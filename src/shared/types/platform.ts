import type { ExtensionMessage, MessageSender } from './messages';

/**
 * Host access, which Manifest V3 leaves to the user on Firefox. Chrome grants the
 * manifest's host permissions at install, so there it is already true and the UI
 * built on this never appears.
 */
export interface PermissionsPort {
  hasHostAccess: () => Promise<boolean>;
  /**
   * Ask for host access. Must be called from a user gesture, and from a tab
   * rather than a popup — Firefox can close the popup and lose the request.
   * Resolves false if the user declines or the browser refuses to ask.
   */
  requestHostAccess: () => Promise<boolean>;
}

export interface StorageArea {
  get: (keys: string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  onChanged: (listener: (changedKeys: string[]) => void) => void;
}

export interface PlatformAPI {
  openOptionsPage: () => void;
  /** Version from the manifest, so support questions start with a known build. */
  getVersion: () => string;
  permissions: PermissionsPort;
  /** Send to the extension's own pages and background worker. */
  sendMessage: (message: ExtensionMessage) => Promise<unknown>;

  onMessage: {
    addListener: (
      handler: (
        message: ExtensionMessage,
        sender: MessageSender,
      ) => void | Promise<unknown> | unknown,
    ) => void;
  };

  /**
   * Badge a single tab's toolbar icon. Empty text clears it. Background context
   * only — the action API is not exposed to content scripts.
   */
  setBadge: (options: {
    tabId: number;
    text: string;
    color?: string;
    /** Badge text is drawn on `color`, so it cannot be left to the default. */
    textColor?: string;
  }) => Promise<void>;

  /**
   * `sync` is where settings live, so a configuration follows the browser
   * profile. `local` is read once to migrate configurations written before that
   * change.
   */
  storage: {
    sync: StorageArea;
    local: StorageArea;
  };

  /** Read keys from the *page's* localStorage (content script context only). */
  getLocalStorageValues: (keys: string[]) => Promise<Record<string, string | null>>;

  /** Observe writes to the page's localStorage (content script context only). */
  watchLocalStorage: (onChange: () => void) => void;

  /**
   * Write a key in the *page's* localStorage (content script context only).
   *
   * There is deliberately no removal counterpart: the banner's chips are
   * switches, and the only values they ever write are the two a flag flips
   * between.
   */
  setLocalStorageValue: (key: string, value: string) => Promise<void>;
}
