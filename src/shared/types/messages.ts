import type { Environment } from '../utils/environment';

/**
 * Messages exchanged between the background worker and content scripts.
 *
 * Sent by a content script on every load and whenever settings change, so the
 * background worker can badge that tab's toolbar icon. `null` means the tab is
 * not part of any configured group, or the extension is off.
 */
export type ExtensionMessage = { command: 'environment-detected'; environment: Environment | null };

export interface MessageSender {
  tab?: { id?: number };
}
