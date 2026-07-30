import type { Environment } from '../utils/environment';

/** Messages exchanged between the background worker, popup and content scripts. */
export type ExtensionMessage =
  | { command: 'switch-environment' }
  | { command: 'open-options' }
  /**
   * Sent by a content script on every load and whenever settings change, so the
   * background worker can badge that tab's toolbar icon. `null` means the tab is
   * not part of any configured group, or the extension is off.
   */
  | { command: 'environment-detected'; environment: Environment | null };

/** Reply to `switch-environment`: the URL to open, or null if none applies. */
export interface SwitchEnvironmentResponse {
  targetUrl: string | null;
}

export interface MessageSender {
  tab?: { id?: number };
}

export interface TabInfo {
  id?: number;
  index?: number;
}
