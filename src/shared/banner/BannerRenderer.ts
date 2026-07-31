/**
 * Builds the banner's DOM. All styling lives in content.css; only the values
 * that depend on settings are set here.
 */

import type { BannerPosition } from '../config/schema';
import type { Warning } from '../storage/StorageMonitor';
import type { SwitchTarget } from './EnvironmentSwitcher';

export interface BannerConfig {
  isProduction: boolean;
  bannerSize: number;
  bannerPosition: BannerPosition;
  /** Hosts this page can be switched to. Empty hides the control entirely. */
  targets: SwitchTarget[];
  onSwitch: (target: SwitchTarget) => void;
  /** Hide the banner for this page view, without changing any setting. */
  onDismiss: () => void;
  /** Flip a tracked localStorage flag between its on and off values. */
  onToggleKey: (key: string) => void;
}

export interface BannerElements {
  wrapper: HTMLElement;
  banner: HTMLElement;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Icons are built with DOM calls rather than innerHTML. The markup is static, but
 * keeping innerHTML out of the extension entirely avoids the reviewer warning
 * add-on stores raise for it and leaves no path where markup could ever be
 * assembled from page data.
 */
function createIcon(shapes: [tag: 'path' | 'rect', attrs: Record<string, string>][]): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  setAttributes(svg, {
    viewBox: '0 0 24 24',
    width: '16',
    height: '16',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  });

  for (const [tag, attrs] of shapes) {
    const shape = document.createElementNS(SVG_NS, tag);
    setAttributes(shape, attrs);
    svg.appendChild(shape);
  }

  return svg;
}

function setAttributes(element: Element, attrs: Record<string, string>): void {
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
}

const createCopyIcon = (): SVGElement =>
  createIcon([
    ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
    ['rect', { x: '8', y: '2', width: '8', height: '4', rx: '1', ry: '1' }],
  ]);

const createCheckIcon = (): SVGElement => createIcon([['path', { d: 'M20 6L9 17l-5-5' }]]);

const createCloseIcon = (): SVGElement => createIcon([['path', { d: 'M18 6L6 18M6 6l12 12' }]]);

const COPY_LABEL = 'Copy URL parameters';
const DISMISS_LABEL = 'Hide the banner until this page is reloaded';
const FEEDBACK_MS = 2000;

export class BannerRenderer {
  private wrapper: HTMLElement | null = null;
  private banner: HTMLElement | null = null;
  private warningContent: HTMLElement | null = null;
  /** Right-hand panel; warnings are inserted before it so it stays last. */
  private trailingPanel: HTMLElement | null = null;
  private feedbackTimer: number | null = null;
  private closeMenu: (() => void) | null = null;
  private flash: HTMLElement | null = null;
  private flashTimer: number | null = null;

  constructor(private readonly config: BannerConfig) {}

  create(): BannerElements | null {
    if (this.wrapper && this.banner) {
      return { wrapper: this.wrapper, banner: this.banner };
    }

    this.wrapper = document.createElement('div');
    this.wrapper.id = 'environment-banner-wrapper';
    this.wrapper.className = `position-${this.config.bannerPosition}`;

    this.banner = document.createElement('div');
    this.banner.id = 'environment-banner';
    this.banner.className = this.config.isProduction ? 'is-production' : 'is-development';
    this.banner.setAttribute('role', 'region');
    this.banner.setAttribute(
      'aria-label',
      this.config.isProduction ? 'Production environment banner' : 'Development environment banner',
    );
    // The height is the one value the stylesheet cannot know up front.
    this.banner.style.setProperty('--banner-height', `${this.config.bannerSize}px`);

    this.flash = document.createElement('span');
    this.flash.className = 'banner-flash';
    this.flash.setAttribute('role', 'status');
    this.flash.setAttribute('aria-live', 'polite');
    this.flash.hidden = true;

    this.trailingPanel = document.createElement('div');
    this.trailingPanel.className = 'banner-button-panel banner-trailing-panel';
    this.trailingPanel.appendChild(this.createDismissButton());

    this.banner.append(this.createButtonPanel(), this.createCenterContent(), this.trailingPanel);
    this.wrapper.appendChild(this.banner);

    return { wrapper: this.wrapper, banner: this.banner };
  }

  /**
   * Render tracked localStorage values as coloured chips.
   *
   * Red means the flag reads as on, which for such flags conventionally means
   * "use production data"; green means it does not. That is the same colour language
   * the banner itself uses, so a red chip on a green banner — a dev page pointed
   * at production — is visible without any comparison logic. Keys and values are
   * page-controlled, so they are written as text.
   *
   * Each chip is also the switch for its flag; see `createToggleButton`.
   */
  displayWarnings(warnings: Warning[]): void {
    if (!this.banner) return;

    if (warnings.length === 0) {
      this.warningContent?.remove();
      this.warningContent = null;
      return;
    }

    if (!this.warningContent) {
      this.warningContent = document.createElement('div');
      this.warningContent.className = 'warning-content';
      this.warningContent.setAttribute('role', 'status');
      this.warningContent.setAttribute('aria-live', 'polite');
      this.banner.insertBefore(this.warningContent, this.trailingPanel);
    }

    this.warningContent.replaceChildren(...warnings.map((warning) => this.createChip(warning)));
  }

  /**
   * A chip is the switch for its flag, and nothing else. There is no remove
   * control: the two values a flag flips between are the whole vocabulary the
   * banner writes.
   *
   * A key that has gone missing keeps the neutral look rather than taking the
   * "off" green: the app is back on however it was built, which is not the same
   * statement as the flag being off, and the colours only speak about values.
   */
  private createChip(warning: Warning): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'tracked-flag';
    chip.classList.add(
      warning.value === null ? 'is-removed' : warning.isWarning ? 'is-enabled' : 'is-disabled',
    );

    chip.appendChild(this.createToggleButton(warning));
    return chip;
  }

  /**
   * Clicking the chip flips the flag and opens this page again in a new tab, which
   * is the pair of actions that actually gets you anywhere: the app read the flag
   * at startup, so a fresh load is what applies it. This tab is left alone on
   * purpose, so the two are there to compare.
   *
   * A value that is not a plain on/off flag is not flipped: `staging`, `2` or a
   * JSON blob is real configuration, one click must not overwrite it, and there is
   * nothing to undo it from. Such a chip stays a focusable button that says so
   * when clicked, rather than one that quietly ignores it — a control that
   * silently does nothing is exactly how the copy button was reported as broken.
   */
  private createToggleButton(warning: Warning): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tracked-flag-toggle';

    const text = document.createElement('span');
    text.className = 'tracked-flag-text';
    text.textContent =
      warning.value === null ? `${warning.key} — removed` : `${warning.key} = ${warning.value}`;
    button.appendChild(text);

    // The value has been changed here, but the page read the old one at startup.
    if (warning.pendingReload) {
      const note = document.createElement('span');
      note.className = 'tracked-flag-note';
      note.textContent = 'reload to apply';
      button.appendChild(note);
    }

    const state = warning.value === null ? `${warning.key} is gone` : text.textContent;
    const action =
      warning.nextValue === null
        ? `${warning.key} is not 0/1, so clicking leaves it alone`
        : `Set ${warning.key} to ${warning.nextValue} and open this page in a new tab, where the app will read it — this tab keeps the value it started with`;

    button.title = action;
    button.setAttribute('aria-label', `${state}. ${action}`);

    if (warning.nextValue === null) {
      button.classList.add('is-locked');
      button.setAttribute('aria-disabled', 'true');
      button.addEventListener('click', () =>
        this.showFlash(`${warning.key} is not 0/1 — left as it is`, 'warn'),
      );
      return button;
    }

    button.addEventListener('click', () => this.config.onToggleKey(warning.key));
    return button;
  }

  /**
   * Say something in the banner from outside the renderer. The orchestrator needs
   * it for outcomes it alone can see \u2014 a new tab the browser refused to open \u2014 and
   * those have to be visible here rather than only in the console.
   */
  showMessage(message: string, kind: 'ok' | 'warn'): void {
    this.showFlash(message, kind);
  }

  destroy(): void {
    if (this.feedbackTimer !== null) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
    if (this.flashTimer !== null) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
    this.flash = null;
    // Drops the document-level menu listeners as a side effect.
    this.closeMenu?.();
    // The wrapper element itself is removed by the positioner, which owns
    // insertion. Nothing is injected into document.head any more, so there is
    // no leftover <style> to clean up.
    this.wrapper = null;
    this.banner = null;
    this.warningContent = null;
    this.trailingPanel = null;
  }

  private createButtonPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'banner-button-panel';
    panel.appendChild(this.createCopyButton());
    if (this.flash) panel.appendChild(this.flash);
    return panel;
  }

  /**
   * Every outcome of a copy has to be visible. Previously only success changed
   * anything on screen — the icon — while "nothing to copy" and "copy failed"
   * lived in the `title` attribute alone, so on the many pages without a query
   * string the button appeared to do nothing at all.
   */
  private showFlash(message: string, kind: 'ok' | 'warn'): void {
    if (!this.flash) return;
    if (this.flashTimer !== null) clearTimeout(this.flashTimer);

    this.flash.textContent = message;
    this.flash.className = `banner-flash is-${kind}`;
    this.flash.hidden = false;

    this.flashTimer = window.setTimeout(() => {
      this.flashTimer = null;
      if (!this.flash) return;
      this.flash.hidden = true;
      this.flash.textContent = '';
    }, FEEDBACK_MS);
  }

  /**
   * Hides the banner for this page view only. Disabling the extension from the
   * popup is global and sticky, which is the wrong tool when the banner is simply
   * covering something you need to read right now.
   */
  private createDismissButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'banner-icon-button banner-dismiss-button';
    button.replaceChildren(createCloseIcon());
    button.title = DISMISS_LABEL;
    button.setAttribute('aria-label', DISMISS_LABEL);
    button.addEventListener('click', () => this.config.onDismiss());
    return button;
  }

  private createCopyButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'banner-icon-button';
    button.replaceChildren(createCopyIcon());
    button.title = COPY_LABEL;
    button.setAttribute('aria-label', COPY_LABEL);
    button.addEventListener('click', () => void this.handleCopy(button));
    return button;
  }

  private async handleCopy(button: HTMLButtonElement): Promise<void> {
    const parameters = currentUrlParameters();
    if (!parameters) {
      this.showFeedback(button, null, 'No parameters to copy');
      this.showFlash('No parameters on this page', 'warn');
      return;
    }

    const copied = await copyText(parameters);
    this.showFeedback(button, copied ? createCheckIcon() : null, copied ? 'Copied' : 'Copy failed');
    this.showFlash(copied ? 'Parameters copied' : 'Copy failed', copied ? 'ok' : 'warn');
  }

  private showFeedback(button: HTMLButtonElement, icon: SVGElement | null, label: string): void {
    if (this.feedbackTimer !== null) clearTimeout(this.feedbackTimer);

    if (icon) button.replaceChildren(icon);
    button.title = label;
    button.setAttribute('aria-label', label);

    this.feedbackTimer = window.setTimeout(() => {
      this.feedbackTimer = null;
      button.replaceChildren(createCopyIcon());
      button.title = COPY_LABEL;
      button.setAttribute('aria-label', COPY_LABEL);
    }, FEEDBACK_MS);
  }

  private createCenterContent(): HTMLElement {
    const center = document.createElement('div');
    center.className = 'banner-center';

    const label = document.createElement('span');
    label.className = 'banner-label';
    label.textContent = this.config.isProduction
      ? 'PRODUCTION ENVIRONMENT'
      : 'DEVELOPMENT ENVIRONMENT';
    center.appendChild(label);

    const control = this.createSwitchControl();
    if (control) center.appendChild(control);

    return center;
  }

  /**
   * A single target gets a plain button; several get a menu. Targets are named by
   * hostname rather than "Production"/"Development", since a group can hold
   * several stands and only the hostname says which one you are going to.
   */
  private createSwitchControl(): HTMLElement | null {
    const { targets } = this.config;
    if (targets.length === 0) return null;

    if (targets.length === 1) {
      const button = this.createSwitchButton(targets[0].hostname, () =>
        this.config.onSwitch(targets[0]),
      );
      return button;
    }

    const container = document.createElement('div');
    container.className = 'banner-switch';

    const menu = document.createElement('ul');
    menu.className = 'banner-switch-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');

    const toggle = this.createSwitchButton(null, () => this.setMenuOpen(menu, toggle, menu.hidden));
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');

    for (const target of targets) {
      const item = document.createElement('li');
      item.setAttribute('role', 'none');

      const entry = document.createElement('button');
      entry.type = 'button';
      entry.className = 'banner-switch-item';
      entry.setAttribute('role', 'menuitem');
      entry.textContent = target.hostname;
      entry.title = target.url;
      if (target.isProduction) entry.classList.add('is-production-target');
      entry.addEventListener('click', () => {
        this.setMenuOpen(menu, toggle, false);
        this.config.onSwitch(target);
      });

      item.appendChild(entry);
      menu.appendChild(item);
    }

    container.append(toggle, menu);
    return container;
  }

  private createSwitchButton(hostname: string | null, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'banner-switch-button';
    button.textContent = hostname ? `Switch to ${hostname}` : 'Switch to…';
    if (hostname) button.title = `Switch to ${hostname}`;
    button.addEventListener('click', onClick);
    return button;
  }

  private setMenuOpen(menu: HTMLElement, toggle: HTMLElement, open: boolean): void {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));

    if (open) {
      this.closeMenu = () => this.setMenuOpen(menu, toggle, false);
      // Capture phase, so a page that stops propagation cannot wedge the menu open.
      document.addEventListener('pointerdown', this.onOutsidePointer, true);
      document.addEventListener('keydown', this.onMenuKeydown, true);
    } else {
      this.closeMenu = null;
      document.removeEventListener('pointerdown', this.onOutsidePointer, true);
      document.removeEventListener('keydown', this.onMenuKeydown, true);
    }
  }

  private readonly onOutsidePointer = (event: Event): void => {
    const target = event.target;
    if (target instanceof Node && this.banner?.contains(target)) return;
    this.closeMenu?.();
  };

  private readonly onMenuKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.closeMenu?.();
  };
}

/**
 * The parameter portion of the current URL, as the address bar shows it.
 *
 * Not simply `location.search`: plenty of front ends keep filter state in the
 * hash — `/devices/incidents-history#?limit=20&offset=0` — where `search` is empty
 * while the address bar plainly shows parameters. Reading only `search` there
 * reports "nothing to copy" about a URL full of parameters.
 *
 * When the whole hash is a query the leading `#` is kept, so the copied text can
 * be pasted straight after a path and reproduce the same view. When the hash also
 * carries a route, only the query part is returned.
 */
export function currentUrlParameters(location: Location = window.location): string {
  if (location.search) return location.search;

  const hash = location.hash;
  if (hash.startsWith('#?')) return hash;

  const queryStart = hash.indexOf('?');
  return queryStart === -1 ? '' : hash.slice(queryStart);
}

/**
 * Copy through a hidden textarea and `execCommand`.
 *
 * This is the primary path, not a fallback, because in a content script's
 * isolated world `navigator.clipboard.writeText` can resolve while the write is
 * silently dropped — measured on a live page: the button reported success and the
 * clipboard stayed empty. `execCommand` acts on the page's own document and
 * selection inside the click, and returns a boolean that can be believed.
 */
function copyViaSelection(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  // On-screen but invisible and inert: fully off-screen elements are not reliably
  // selectable, and pointer-events keeps it from swallowing the click.
  area.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';

  const selection = document.getSelection();
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    // Give the user back whatever they had selected before we hijacked it.
    if (selection && previousRange) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
  }
}

async function copyText(text: string): Promise<boolean> {
  if (copyViaSelection(text)) return true;

  // Second attempt, for contexts where the selection route is unavailable.
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Insecure context, denied permission, or no user activation left.
    }
  }

  return false;
}
