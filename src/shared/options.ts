import { BANNER_SIZES } from './config/defaults';
import { settings, type SettingsManager } from './config/settings';
import type { EnvironmentGroup, TrackedKey } from './config/schema';
import { exportSettings, importSettings } from './config/transfer';
import {
  normalizeHostPattern,
  parseHostList,
  validateGroup,
  validateTrackedKey,
} from './config/validation';
import { platform } from './platform';
import { ASSIGNABLE_VALUES, DEFAULT_ASSIGN_VALUE } from './storage/flagValue';
import type { PermissionsPort } from './types/platform';

const GROUP_ROW = 'env-group';
const TRANSFER_FILENAME = 'environment-switcher-settings.json';
const KEY_ROW = 'local-storage-key-row';
/** How long a toast stays up. Long enough to read a validation error in full. */
const STATUS_MS = 4000;

export class OptionsManager {
  private readonly groupsContainer: HTMLElement;
  private readonly keysContainer: HTMLElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private statusTimer: number | null = null;
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

    // Groups are rendered first: the host checkboxes on every key row are built
    // from the group fields, so those have to exist before a key row does.
    this.keysContainer.replaceChildren();
    for (const tracked of current.trackedKeys) this.addKeyRow(tracked);
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
    remove.addEventListener('click', () => {
      row.remove();
      this.refreshHostChoices();
    });

    // A host can only be ticked on a key row once it exists as text up here, so
    // the choices follow the field as it is typed rather than waiting for a save.
    for (const input of [production, development]) {
      input.addEventListener('input', () => this.refreshHostChoices());
    }

    const error = document.createElement('p');
    error.className = 'row-error';
    error.hidden = true;

    row.append(production, development, remove, error);
    this.groupsContainer.appendChild(row);
  }

  private addKeyRow(tracked?: TrackedKey): void {
    const row = document.createElement('div');
    row.className = KEY_ROW;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'key-name';
    input.value = tracked?.key ?? '';
    input.placeholder = 'Enter localStorage key';
    input.setAttribute('aria-label', 'localStorage key to track');

    const hosts = document.createElement('div');
    hosts.className = 'key-hosts';
    hosts.setAttribute('role', 'group');
    hosts.setAttribute('aria-label', 'Hosts this key applies to');

    const value = document.createElement('select');
    value.className = 'key-value';
    value.setAttribute('aria-label', 'Default value to write when the key is not set');
    for (const candidate of ASSIGNABLE_VALUES) {
      const option = document.createElement('option');
      option.value = candidate;
      option.textContent = candidate;
      value.appendChild(option);
    }
    value.value = tracked?.value ?? DEFAULT_ASSIGN_VALUE;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.className = 'remove-key';
    remove.addEventListener('click', () => row.remove());

    // No validation message: every field here is constrained — a name, ticked
    // hosts that came from the groups above, and one of the four values — so
    // there is nothing a row can say that it could not have prevented.
    row.append(input, hosts, value, remove);
    this.keysContainer.appendChild(row);
    this.renderHostChoices(row, tracked?.hosts ?? []);
  }

  /**
   * The hosts a key can be scoped to are the ones already configured above, so
   * they are offered rather than typed: a host that is not in any group would
   * never show a banner, and therefore never a chip, and a typo there is
   * indistinguishable from the extension being broken.
   *
   * Production first and separately, because which side of a group a host is on
   * is the thing you are actually deciding about a flag. A host that appears as
   * production in one group and a stand in another is listed once, as production
   * — the same precedence `matchEnvironment` applies.
   */
  private availableHosts(): { production: string[]; development: string[] } {
    const production: string[] = [];
    const development: string[] = [];

    for (const row of this.groupsContainer.querySelectorAll<HTMLElement>(`.${GROUP_ROW}`)) {
      const prod = normalizeHostPattern(
        row.querySelector<HTMLInputElement>('.group-production')?.value ?? '',
      );
      if (prod) production.push(prod);

      const raw = row.querySelector<HTMLInputElement>('.group-development')?.value ?? '';
      for (const entry of parseHostList(raw)) {
        const host = normalizeHostPattern(entry);
        if (host) development.push(host);
      }
    }

    const prodHosts = new Set(production);
    return {
      production: [...prodHosts],
      development: [...new Set(development)].filter((host) => !prodHosts.has(host)),
    };
  }

  /**
   * Rebuild one key row's host checkboxes, keeping what was ticked.
   *
   * A ticked host that is no longer in any group is kept and shown in a section
   * of its own rather than dropped. Dropping it would be the one edit that must
   * not happen silently: emptying the list turns "only on these hosts" into
   * "on every host", which is the opposite instruction.
   */
  private renderHostChoices(row: HTMLElement, selected: string[]): void {
    const container = row.querySelector<HTMLElement>('.key-hosts');
    if (!container) return;

    const available = this.availableHosts();
    const known = new Set([...available.production, ...available.development]);
    const sections: [string, string[]][] = [
      ['Production', available.production],
      ['Non-production', available.development],
      ['No longer in a group', selected.filter((host) => !known.has(host))],
    ];

    const nodes: HTMLElement[] = [];
    for (const [caption, hosts] of sections) {
      if (hosts.length === 0) continue;

      const fieldset = document.createElement('fieldset');
      fieldset.className = 'key-host-group';
      const legend = document.createElement('legend');
      legend.textContent = caption;
      fieldset.appendChild(legend);

      for (const host of hosts) {
        const label = document.createElement('label');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'key-host';
        box.value = host;
        box.checked = selected.includes(host);
        box.addEventListener('change', () => this.updateHostHint(row));

        const text = document.createElement('span');
        text.textContent = host;
        label.append(box, text);
        fieldset.appendChild(label);
      }
      nodes.push(fieldset);
    }

    const hint = document.createElement('p');
    hint.className = 'key-hosts-hint';
    nodes.push(hint);

    container.replaceChildren(...nodes);
    this.updateHostHint(row);
  }

  /** Rebuild every key row's choices, after the groups above have changed. */
  private refreshHostChoices(): void {
    for (const row of this.keysContainer.querySelectorAll<HTMLElement>(`.${KEY_ROW}`)) {
      this.renderHostChoices(row, this.selectedHosts(row));
    }
  }

  /**
   * Say what an empty selection means. Nothing ticked is a legitimate and useful
   * state — the key applies wherever the banner does — but an empty box of
   * checkboxes reads as an unfilled field, which is how it would be misread.
   */
  private updateHostHint(row: HTMLElement): void {
    const hint = row.querySelector<HTMLElement>('.key-hosts-hint');
    if (!hint) return;

    if (this.selectedHosts(row).length > 0) {
      hint.textContent = '';
      hint.hidden = true;
      return;
    }

    const { production, development } = this.availableHosts();
    hint.textContent =
      production.length + development.length === 0
        ? 'Add an environment group above to limit this key to certain hosts.'
        : 'Nothing ticked: every configured host.';
    hint.hidden = false;
  }

  private selectedHosts(row: HTMLElement): string[] {
    return [...row.querySelectorAll<HTMLInputElement>('.key-host')]
      .filter((box) => box.checked)
      .map((box) => box.value);
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

    const trackedKeys = this.collectTrackedKeys();

    // Group fields may have been normalized just now, so the ticked hosts have to
    // be offered under the values that were actually stored.
    this.refreshHostChoices();

    try {
      await this.manager.save({
        groups: collected.groups,
        prodSize: Number.parseInt(this.prodSizeSelect.value, 10),
        devSize: Number.parseInt(this.devSizeSelect.value, 10),
        bannerPosition: this.bannerPositionSelect.value === 'bottom' ? 'bottom' : 'top',
        trackedKeys,
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

  private collectTrackedKeys(): TrackedKey[] {
    const keys: TrackedKey[] = [];

    for (const row of this.keysContainer.querySelectorAll<HTMLElement>(`.${KEY_ROW}`)) {
      const input = row.querySelector<HTMLInputElement>('.key-name');
      const value = row.querySelector<HTMLSelectElement>('.key-value');
      if (!input || !value) continue;

      // A row with no key name is how a key is dropped, as an emptied group row is.
      const result = validateTrackedKey(input.value, this.selectedHosts(row), value.value);
      if (!result.ok) continue;

      // Reflect the trimmed name, so it is visible what was stored.
      input.value = result.value.key;
      keys.push(result.value);
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

  /**
   * Say what just happened, in a toast fixed to the viewport.
   *
   * The timer is kept and cleared: every call used to start another one, so a second
   * message inherited the first one's remaining time and could vanish a moment after
   * appearing.
   */
  private showStatus(message: string, kind: 'success' | 'error'): void {
    if (this.statusTimer !== null) clearTimeout(this.statusTimer);

    this.status.textContent = message;
    this.status.className = `status ${kind}`;

    // Hidden and shown again, with a layout read in between, so a message that
    // replaces a visible one plays the appear animation rather than swapping
    // silently — otherwise two saves in a row look like one.
    this.status.hidden = true;
    void this.status.offsetWidth;
    this.status.hidden = false;

    this.statusTimer = window.setTimeout(() => {
      this.statusTimer = null;
      this.status.hidden = true;
    }, STATUS_MS);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
});
