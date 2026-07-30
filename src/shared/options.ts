import { BANNER_SIZES } from './config/defaults';
import { settings, type SettingsManager } from './config/settings';
import type { EnvironmentGroup } from './config/schema';
import { exportSettings, importSettings } from './config/transfer';
import { parseHostList, validateGroup } from './config/validation';
import { platform } from './platform';
import type { PermissionsPort } from './types/platform';

const GROUP_ROW = 'env-group';
const TRANSFER_FILENAME = 'environment-switcher-settings.json';
const KEY_ROW = 'local-storage-key-row';

export class OptionsManager {
  private readonly groupsContainer: HTMLElement;
  private readonly keysContainer: HTMLElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly prodSizeSelect: HTMLSelectElement;
  private readonly devSizeSelect: HTMLSelectElement;
  private readonly bannerPositionSelect: HTMLSelectElement;
  private readonly transferArea: HTMLTextAreaElement;
  private readonly fileInput: HTMLInputElement;
  private readonly siteAccessSection: HTMLElement | null;
  private readonly permissions: PermissionsPort;

  /** Resolves once the stored settings have been rendered. */
  readonly ready: Promise<void>;

  /** Dependencies are injectable so the page can be driven in tests. */
  constructor(
    private readonly manager: SettingsManager = settings,
    permissions: PermissionsPort = platform.permissions,
  ) {
    this.permissions = permissions;
    this.groupsContainer = document.getElementById('environmentGroups') as HTMLElement;
    this.keysContainer = document.getElementById('localStorageKeysContainer') as HTMLElement;
    this.saveButton = document.getElementById('saveButton') as HTMLButtonElement;
    this.status = document.getElementById('status') as HTMLElement;
    this.prodSizeSelect = document.getElementById('prodSize') as HTMLSelectElement;
    this.devSizeSelect = document.getElementById('devSize') as HTMLSelectElement;
    this.bannerPositionSelect = document.getElementById('bannerPosition') as HTMLSelectElement;
    this.transferArea = document.getElementById('transferArea') as HTMLTextAreaElement;
    this.fileInput = document.getElementById('fileInput') as HTMLInputElement;
    this.siteAccessSection = document.getElementById('siteAccessSection');

    this.populateSizeOptions();
    this.ready = Promise.all([this.load(), this.refreshSiteAccess()]).then(() => undefined);
    this.setupEventListeners();
  }

  /** Sizes live in code, not duplicated in the HTML. */
  private populateSizeOptions(): void {
    for (const select of [this.prodSizeSelect, this.devSizeSelect]) {
      select.replaceChildren();
      for (const size of BANNER_SIZES) {
        const option = document.createElement('option');
        option.value = String(size);
        option.textContent = `${size}px`;
        select.appendChild(option);
      }
    }
  }

  private async load(): Promise<void> {
    const current = await this.manager.load();

    this.prodSizeSelect.value = String(current.prodSize);
    this.devSizeSelect.value = String(current.devSize);
    this.bannerPositionSelect.value = current.bannerPosition;

    this.groupsContainer.replaceChildren();
    if (current.groups.length === 0) {
      this.addGroupRow();
    } else {
      for (const group of current.groups) this.addGroupRow(group);
    }

    this.keysContainer.replaceChildren();
    for (const key of current.localStorageKeys) this.addKeyRow(key);
  }

  private addGroupRow(group?: EnvironmentGroup): void {
    const row = document.createElement('div');
    row.className = GROUP_ROW;

    const production = document.createElement('input');
    production.type = 'text';
    production.className = 'group-production';
    production.value = group?.production ?? '';
    production.placeholder = 'app.example.com';
    production.setAttribute('aria-label', 'Production hostname');

    const development = document.createElement('input');
    development.type = 'text';
    development.className = 'group-development';
    development.value = group?.development.join(', ') ?? '';
    development.placeholder = 'dev.example.com, staging.example.com';
    development.setAttribute('aria-label', 'Non-production hostnames, comma separated');

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.className = 'remove-group';
    remove.addEventListener('click', () => row.remove());

    const error = document.createElement('p');
    error.className = 'row-error';
    error.hidden = true;

    row.append(production, development, remove, error);
    this.groupsContainer.appendChild(row);
  }

  private addKeyRow(key = ''): void {
    const row = document.createElement('div');
    row.className = KEY_ROW;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = key;
    input.placeholder = 'Enter localStorage key';
    input.setAttribute('aria-label', 'localStorage key to track');

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.className = 'remove-key';
    remove.addEventListener('click', () => row.remove());

    row.append(input, remove);
    this.keysContainer.appendChild(row);
  }

  private setupEventListeners(): void {
    document.getElementById('addGroupButton')?.addEventListener('click', () => this.addGroupRow());
    document.getElementById('addKeyButton')?.addEventListener('click', () => this.addKeyRow());
    this.saveButton.addEventListener('click', () => void this.save());
    document.getElementById('exportButton')?.addEventListener('click', () => void this.export());
    document.getElementById('importButton')?.addEventListener('click', () => void this.import());
    document
      .getElementById('downloadButton')
      ?.addEventListener('click', () => void this.download());
    document
      .getElementById('loadFileButton')
      ?.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', () => void this.loadFile());
    document
      .getElementById('grantAccessButton')
      ?.addEventListener('click', () => void this.grantSiteAccess());
  }

  /**
   * Without host access the banner simply never appears, which looks exactly like
   * a broken extension. Manifest V3 leaves the decision to the user on Firefox,
   * so the state has to be visible and fixable here.
   */
  private async refreshSiteAccess(): Promise<void> {
    if (!this.siteAccessSection) return;
    const granted = await this.permissions.hasHostAccess();
    this.siteAccessSection.hidden = granted;
  }

  private async grantSiteAccess(): Promise<void> {
    const granted = await this.permissions.requestHostAccess();
    await this.refreshSiteAccess();

    if (granted) {
      this.showStatus('Access granted. Reload any open tabs to see the banner.', 'success');
      return;
    }

    // Either the user declined, or the browser refused to ask at all — point at
    // the manual route rather than leaving a button that does nothing.
    const fallback = document.getElementById('siteAccessFallback');
    if (fallback) fallback.hidden = false;
    this.showStatus('Access was not granted', 'error');
  }

  /** Save the configuration as a file, for sharing outside the browser. */
  private async download(): Promise<void> {
    const json = exportSettings(await this.manager.load());
    this.transferArea.value = json;

    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = TRANSFER_FILENAME;
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }

    this.showStatus(`Saved as ${TRANSFER_FILENAME}`, 'success');
  }

  /**
   * Read a file into the box without applying it. Importing stays a separate,
   * deliberate press, so a file from a chat can be looked at first.
   */
  private async loadFile(): Promise<void> {
    const file = this.fileInput.files?.[0];
    // Clear immediately, so picking the same file again still fires a change.
    this.fileInput.value = '';
    if (!file) return;

    try {
      this.transferArea.value = await file.text();
    } catch (error) {
      this.showStatus(`Could not read the file — ${describeError(error)}`, 'error');
      return;
    }

    this.showStatus(`Loaded ${file.name}. Review it, then press Import.`, 'success');
  }

  private async export(): Promise<void> {
    this.transferArea.value = exportSettings(await this.manager.load());
    this.showStatus('Configuration written below', 'success');
  }

  private async import(): Promise<void> {
    const result = importSettings(this.transferArea.value);
    if (!result.ok) {
      this.showStatus(`Import failed — ${result.error}`, 'error');
      return;
    }

    try {
      await this.manager.save(result.value);
    } catch (error) {
      this.showStatus(`Import failed — ${describeError(error)}`, 'error');
      return;
    }

    // Re-render so the form shows what was actually stored.
    await this.load();

    const skipped = result.skippedGroups;
    this.showStatus(
      skipped === 0
        ? `Imported ${result.value.groups.length} environment group(s)`
        : `Imported ${result.value.groups.length} group(s); skipped ${skipped} unusable one(s)`,
      skipped === 0 ? 'success' : 'error',
    );
  }

  private async save(): Promise<void> {
    const collected = this.collectGroups();
    if (collected.errors.length > 0) {
      // Refuse the whole save instead of silently dropping invalid rows, which
      // is what the original version did.
      this.showStatus(`Not saved — ${collected.errors[0]}`, 'error');
      return;
    }

    try {
      await this.manager.save({
        groups: collected.groups,
        prodSize: Number.parseInt(this.prodSizeSelect.value, 10),
        devSize: Number.parseInt(this.devSizeSelect.value, 10),
        bannerPosition: this.bannerPositionSelect.value === 'bottom' ? 'bottom' : 'top',
        localStorageKeys: this.collectKeys(),
      });
    } catch (error) {
      // Synced storage has per-item quotas, so a write can genuinely fail.
      this.showStatus(`Not saved — ${describeError(error)}`, 'error');
      return;
    }

    this.showStatus('Settings saved', 'success');
  }

  private collectGroups(): { groups: EnvironmentGroup[]; errors: string[] } {
    const groups: EnvironmentGroup[] = [];
    const errors: string[] = [];

    for (const row of this.groupsContainer.querySelectorAll<HTMLElement>(`.${GROUP_ROW}`)) {
      const productionInput = row.querySelector<HTMLInputElement>('.group-production');
      const developmentInput = row.querySelector<HTMLInputElement>('.group-development');
      if (!productionInput || !developmentInput) continue;

      const production = productionInput.value.trim();
      const developments = parseHostList(developmentInput.value);

      if (!production && developments.length === 0) {
        this.setRowError(row, null);
        continue;
      }

      const result = validateGroup(production, developments);
      if (!result.ok) {
        this.setRowError(row, result.error);
        errors.push(result.error);
        continue;
      }

      this.setRowError(row, null);
      // Reflect the normalized values, so it is visible that
      // "https://app.example.com/" was stored as "app.example.com".
      productionInput.value = result.value.production;
      developmentInput.value = result.value.development.join(', ');
      groups.push(result.value);
    }

    return { groups, errors };
  }

  private collectKeys(): string[] {
    const keys: string[] = [];
    for (const row of this.keysContainer.querySelectorAll<HTMLElement>(`.${KEY_ROW}`)) {
      const value = row.querySelector('input')?.value.trim();
      if (value) keys.push(value);
    }
    return keys;
  }

  private setRowError(row: HTMLElement, message: string | null): void {
    const target = row.querySelector<HTMLElement>('.row-error');
    if (!target) return;
    target.textContent = message ?? '';
    target.hidden = message === null;
    row.classList.toggle('has-error', message !== null);
  }

  private showStatus(message: string, kind: 'success' | 'error'): void {
    this.status.textContent = message;
    this.status.className = `status ${kind}`;
    this.status.style.display = 'block';
    window.setTimeout(() => {
      this.status.style.display = 'none';
    }, 4000);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
});
