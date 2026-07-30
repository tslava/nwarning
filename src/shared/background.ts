import { platform } from './platform';
import type { ExtensionMessage, MessageSender, SwitchEnvironmentResponse } from './types/messages';
import type { Environment } from './utils/environment';

const BADGE = {
  production: { text: 'PROD', color: '#ff4444' },
  development: { text: 'DEV', color: '#17b417' },
} as const satisfies Record<Environment, { text: string; color: string }>;

/**
 * Opens the current page's counterpart environment in a new tab.
 *
 * The content script only resolves the URL; opening happens here because a
 * keyboard shortcut carries no user gesture into the page, so a `window.open`
 * from the content script would be swallowed by the popup blocker.
 */
async function openOtherEnvironment(): Promise<void> {
  const tab = await platform.getCurrentTab();
  if (tab?.id === undefined) return;

  try {
    const response = (await platform.sendMessageToTab(tab.id, {
      command: 'switch-environment',
    })) as SwitchEnvironmentResponse | undefined;

    if (!response?.targetUrl) return;

    await platform.createTab({
      url: response.targetUrl,
      index: tab.index === undefined ? undefined : tab.index + 1,
    });
  } catch {
    // No content script in this tab (browser-internal pages, the extension
    // gallery, PDF viewer). Nothing to switch.
  }
}

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

platform.onCommand.addListener((command) => {
  if (command === 'switch-environment') void openOtherEnvironment();
});

platform.onMessage.addListener((message: ExtensionMessage, sender: MessageSender) => {
  if (message.command !== 'environment-detected') return;
  const tabId = sender.tab?.id;
  if (tabId !== undefined) void badgeTab(tabId, message.environment);
});
