import { settings, type SettingsManager } from './config/settings';
import { platform } from './platform';
import type { PermissionsPort } from './types/platform';

export interface PopupDeps {
  settings?: SettingsManager;
  permissions?: PermissionsPort;
  version?: string;
}

export class PopupManager {
  private readonly manager: SettingsManager;
  private readonly permissions: PermissionsPort;

  private readonly toggleButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly hostAccessWarning: HTMLElement;
  private extensionEnabled = true;

  /** Resolves once the stored state has been rendered. */
  readonly ready: Promise<void>;

  constructor(deps: PopupDeps = {}) {
    this.manager = deps.settings ?? settings;
    this.permissions = deps.permissions ?? platform.permissions;

    this.toggleButton = document.getElementById('toggleButton') as HTMLButtonElement;
    this.status = document.getElementById('status') as HTMLElement;
    this.hostAccessWarning = document.getElementById('hostAccessWarning') as HTMLElement;

    const version = document.getElementById('version');
    // Shown so a support question can start from a known build rather than a
    // trip through the browser's add-on manager.
    if (version) version.textContent = deps.version ?? platform.getVersion();

    this.setupEventListeners();
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    const [current, hasHostAccess] = await Promise.all([
      this.manager.load(),
      this.permissions.hasHostAccess(),
    ]);

    this.extensionEnabled = current.extensionEnabled;
    this.updateUI();

    // Without host access the banner simply never appears, which is
    // indistinguishable from a broken extension unless we say so. Manifest V3
    // leaves this to the user on Firefox.
    this.hostAccessWarning.hidden = hasHostAccess;
  }

  private updateUI(): void {
    this.toggleButton.textContent = this.extensionEnabled
      ? 'Disable Extension'
      : 'Enable Extension';
    this.toggleButton.setAttribute('aria-pressed', String(!this.extensionEnabled));
    this.status.textContent = `Extension is ${this.extensionEnabled ? 'active' : 'inactive'}`;
  }

  private setupEventListeners(): void {
    this.toggleButton.addEventListener('click', async () => {
      this.extensionEnabled = !this.extensionEnabled;
      // Content scripts observe storage directly, so every open tab reacts —
      // not just the active one, and with no message that could fail to deliver.
      await this.manager.save({ extensionEnabled: this.extensionEnabled });
      this.updateUI();
    });

    document.getElementById('optionsButton')?.addEventListener('click', () => {
      platform.openOptionsPage();
    });

    // The grant itself lives on the options page: Firefox can close a popup
    // mid-request and lose it.
    document.getElementById('fixAccessButton')?.addEventListener('click', () => {
      platform.openOptionsPage();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});
