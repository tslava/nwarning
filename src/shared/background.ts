import { platform } from './platform';
import type { ExtensionMessage, MessageSender } from './types/messages';
import type { Environment } from './utils/environment';

const BADGE = {
  production: { text: 'PROD', color: '#ff4444' },
  development: { text: 'DEV', color: '#17b417' },
} as const satisfies Record<Environment, { text: string; color: string }>;

/**
 * Badge the toolbar icon of the reporting tab, so the environment stays visible
 * even when the banner is hidden for that page view.
 */
async function badgeTab(tabId: number, environment: Environment | null): Promise<void> {
  const badge = environment ? BADGE[environment] : { text: '', color: undefined };
  try {
    await platform.setBadge({ tabId, text: badge.text, color: badge.color });
  } catch {
    // The tab can be gone by the time the message is handled.
  }
}

platform.onMessage.addListener((message: ExtensionMessage, sender: MessageSender) => {
  if (message.command !== 'environment-detected') return;
  const tabId = sender.tab?.id;
  if (tabId !== undefined) void badgeTab(tabId, message.environment);
});
