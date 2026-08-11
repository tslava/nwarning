import { platform } from './platform';
import type { ExtensionMessage, MessageSender } from './types/messages';
import type { Environment } from './utils/environment';

/**
 * One letter each, because the badge is smaller than it looks. The API's own
 * documentation says "only about four can fit", and about four is optimistic:
 * `PROD` came out clipped in Chrome and `DEV` clipped in Firefox, where the badge
 * is drawn differently again. One character cannot be truncated by a theme, a font
 * or a display scale, and the colour is carrying the meaning anyway.
 *
 * The colours are the chips' rather than the banner's, for the same reason the
 * chips use them: badge text sits on this colour, and white on #ff4444 is 3.0:1
 * while white on #17b417 is 2.4:1. Dark red with white, and green with black, are
 * the pair that stays readable at this size.
 */
const BADGE = {
  production: { text: 'P', color: '#c62828', textColor: '#ffffff' },
  development: { text: 'D', color: '#17b417', textColor: '#000000' },
} as const satisfies Record<Environment, { text: string; color: string; textColor: string }>;

/**
 * Badge the toolbar icon of the reporting tab, so the environment stays visible
 * even when the banner is hidden for that page view.
 */
async function badgeTab(tabId: number, environment: Environment | null): Promise<void> {
  const badge = environment
    ? BADGE[environment]
    : { text: '', color: undefined, textColor: undefined };
  try {
    await platform.setBadge({
      tabId,
      text: badge.text,
      color: badge.color,
      textColor: badge.textColor,
    });
  } catch {
    // The tab can be gone by the time the message is handled.
  }
}

platform.onMessage.addListener((message: ExtensionMessage, sender: MessageSender) => {
  if (message.command !== 'environment-detected') return;
  const tabId = sender.tab?.id;
  if (tabId !== undefined) void badgeTab(tabId, message.environment);
});
