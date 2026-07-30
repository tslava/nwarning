import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsManager } from './config/settings';
import { PopupManager } from './popup';
import { FakeStorage } from './testing/fakeStorage';
import type { PermissionsPort } from './types/platform';

/** The real popup markup, so the page and its script cannot drift apart. */
const POPUP_HTML = readFileSync(resolve(process.cwd(), 'src/shared/html/popup.html'), 'utf8');

function mountPage(): void {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(POPUP_HTML);
  if (!body) throw new Error('could not find <body> in popup.html');
  document.body.innerHTML = body[1].replace(/<script[\s\S]*?<\/script>/gi, '');
}

function permissions(hasHostAccess: boolean): PermissionsPort {
  return {
    hasHostAccess: vi.fn().mockResolvedValue(hasHostAccess),
    requestHostAccess: vi.fn().mockResolvedValue(true),
  };
}

async function open(
  options: { storage?: FakeStorage; hostAccess?: boolean; version?: string } = {},
) {
  mountPage();
  const storage = options.storage ?? new FakeStorage();
  const popup = new PopupManager({
    settings: new SettingsManager(storage),
    permissions: permissions(options.hostAccess ?? true),
    version: options.version ?? '1.3.0',
  });
  await popup.ready;
  return { popup, storage };
}

function warning(): HTMLElement {
  return document.getElementById('hostAccessWarning') as HTMLElement;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('popup: version', () => {
  it('shows the installed version', async () => {
    await open({ version: '2.5.1' });
    expect(document.getElementById('version')?.textContent).toBe('2.5.1');
  });
});

describe('popup: enabled state', () => {
  it('reflects the stored state', async () => {
    await open({ storage: new FakeStorage({ extensionEnabled: false }) });
    expect(document.getElementById('status')?.textContent).toBe('Extension is inactive');
    expect(document.getElementById('toggleButton')?.textContent).toBe('Enable Extension');
  });

  it('writes the new state and relabels on toggle', async () => {
    const { storage } = await open();

    document.getElementById('toggleButton')?.dispatchEvent(new MouseEvent('click'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.lastWrite('extensionEnabled')).toBe(false);
    expect(document.getElementById('toggleButton')?.textContent).toBe('Enable Extension');
    expect(document.getElementById('toggleButton')?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('popup: host access', () => {
  it('stays quiet when the extension may run on sites', async () => {
    await open({ hostAccess: true });
    expect(warning().hidden).toBe(true);
  });

  it('explains the silence when it may not', async () => {
    await open({ hostAccess: false });

    expect(warning().hidden).toBe(false);
    expect(warning().getAttribute('role')).toBe('alert');
    // The fix lives on the options page, because Firefox can close a popup
    // mid-request and lose the permission prompt.
    expect(document.getElementById('fixAccessButton')).not.toBeNull();
  });
});
