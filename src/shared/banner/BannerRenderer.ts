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
  /** Remove a tracked localStorage key from the page. */
  onResetKey: (key: string) => void;
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

const COPY_LABEL = 'Copy URL query string';
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

  private createChip(warning: Warning): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'tracked-flag';

    const label = document.createElement('span');
    label.className = 'tracked-flag-text';

    if (warning.pendingReload) {
      chip.classList.add('is-pending');
      label.textContent = `${warning.key} — reload to apply`;
      chip.appendChild(label);
      return chip;
    }

    chip.classList.add(warning.isWarning ? 'is-enabled' : 'is-disabled');
    label.textContent = `${warning.key} = ${warning.value}`;
    chip.append(label, this.createResetButton(warning.key));
    return chip;
  }

  private createResetButton(key: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tracked-flag-reset';
    button.textContent = '\u00d7';
    const label = `Remove ${key} and fall back to the app default (reload to apply)`;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', () => this.config.onResetKey(key));
    return button;
  }

  destroy(): void {
    if (this.feedbackTimer !== null) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
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
    return panel;
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
    const queryString = window.location.search;
    if (!queryString) {
      this.showFeedback(button, null, 'No query string to copy');
      return;
    }

    const copied = await copyText(queryString);
    this.showFeedback(button, copied ? createCheckIcon() : null, copied ? 'Copied' : 'Copy failed');
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
 * Clipboard write with a fallback: navigator.clipboard needs a secure context,
 * so plain-http development hosts still need the deprecated path.
 */
async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or insecure context; fall through to execCommand.
    }
  }

  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.top = '-1000px';
  input.style.opacity = '0';
  document.body.appendChild(input);

  try {
    input.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    input.remove();
  }
}
