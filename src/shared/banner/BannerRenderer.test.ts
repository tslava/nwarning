import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BannerRenderer } from './BannerRenderer';
import type { SwitchTarget } from './EnvironmentSwitcher';
import type { Warning } from '../storage/StorageMonitor';

function target(hostname: string, isProduction = false): SwitchTarget {
  return { hostname, url: `https://${hostname}/`, isProduction };
}

function mountRenderer(
  isProduction = false,
  targets: SwitchTarget[] = [target('dev.example.com')],
) {
  const onSwitch = vi.fn();
  const onDismiss = vi.fn();
  const onResetKey = vi.fn();
  const renderer = new BannerRenderer({
    isProduction,
    bannerSize: 50,
    bannerPosition: 'top',
    targets,
    onSwitch,
    onDismiss,
    onResetKey,
  });

  const elements = renderer.create();
  if (!elements) throw new Error('renderer produced no elements');
  document.body.appendChild(elements.wrapper);

  return { renderer, banner: elements.banner, onSwitch, onDismiss, onResetKey };
}

function warning(key: string, value: string, isWarning = false): Warning {
  return { key, value, isWarning, pendingReload: false };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('BannerRenderer.create', () => {
  it('marks the environment with a class rather than an inline colour', () => {
    const { banner } = mountRenderer(true);
    expect(banner.classList.contains('is-production')).toBe(true);
    // The old markup drove hover styling off an inline colour via
    // [style*='ff4444'], which broke as soon as the inline style changed.
    expect(banner.style.backgroundColor).toBe('');
  });

  it('labels the region and the buttons for assistive tech', () => {
    const { banner } = mountRenderer(false);
    expect(banner.getAttribute('role')).toBe('region');
    expect(banner.getAttribute('aria-label')).toBe('Development environment banner');
    expect(banner.querySelector('.banner-icon-button')?.getAttribute('aria-label')).toBe(
      'Copy URL query string',
    );
  });

  it('names the single target by hostname and calls back with it', () => {
    const only = target('dev.example.com');
    const { banner, onSwitch } = mountRenderer(false, [only]);

    const button = banner.querySelector<HTMLButtonElement>('.banner-switch-button');
    expect(button?.textContent).toBe('Switch to dev.example.com');
    expect(banner.querySelector('.banner-switch-menu')).toBeNull();

    button?.click();
    expect(onSwitch).toHaveBeenCalledWith(only);
  });

  it('hides the control when there is nowhere to switch to', () => {
    const { banner } = mountRenderer(false, []);
    expect(banner.querySelector('.banner-switch-button')).toBeNull();
  });

  it('offers a dismiss button that explains how long it lasts', () => {
    const { banner, onDismiss } = mountRenderer(false);
    const dismiss = banner.querySelector<HTMLButtonElement>('.banner-dismiss-button');

    expect(dismiss?.getAttribute('aria-label')).toBe('Hide the banner until this page is reloaded');
    dismiss?.click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('keeps the dismiss button last, after any warnings', () => {
    const { renderer, banner } = mountRenderer(false);
    renderer.displayWarnings([warning('flag', '1', true)]);

    const children = [...banner.children].map((child) => child.className);
    expect(children[children.length - 1]).toContain('banner-trailing-panel');
  });
});

describe('BannerRenderer switch menu', () => {
  const targets = [target('b.example.com', true), target('stage.b.example.com')];

  it('offers a menu when there is more than one target', () => {
    const { banner } = mountRenderer(false, targets);

    const toggle = banner.querySelector<HTMLButtonElement>('.banner-switch-button');
    expect(toggle?.textContent).toBe('Switch to…');
    expect(toggle?.getAttribute('aria-haspopup')).toBe('true');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

    const items = banner.querySelectorAll('.banner-switch-item');
    expect([...items].map((item) => item.textContent)).toEqual([
      'b.example.com',
      'stage.b.example.com',
    ]);
    // The production entry is marked so it reads differently.
    expect(items[0].classList.contains('is-production-target')).toBe(true);
    expect(items[1].classList.contains('is-production-target')).toBe(false);
  });

  it('opens and closes on the toggle', () => {
    const { banner } = mountRenderer(false, targets);
    const toggle = banner.querySelector<HTMLButtonElement>('.banner-switch-button')!;
    const menu = banner.querySelector<HTMLElement>('.banner-switch-menu')!;

    expect(menu.hidden).toBe(true);
    toggle.click();
    expect(menu.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    expect(menu.hidden).toBe(true);
  });

  it('switches to the chosen target and closes', () => {
    const { banner, onSwitch } = mountRenderer(false, targets);
    const toggle = banner.querySelector<HTMLButtonElement>('.banner-switch-button')!;
    const menu = banner.querySelector<HTMLElement>('.banner-switch-menu')!;

    toggle.click();
    banner.querySelectorAll<HTMLButtonElement>('.banner-switch-item')[1].click();

    expect(onSwitch).toHaveBeenCalledWith(targets[1]);
    expect(menu.hidden).toBe(true);
  });

  it('closes on a click outside the banner', () => {
    const { banner } = mountRenderer(false, targets);
    const menu = banner.querySelector<HTMLElement>('.banner-switch-menu')!;

    banner.querySelector<HTMLButtonElement>('.banner-switch-button')!.click();
    expect(menu.hidden).toBe(false);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.hidden).toBe(true);
  });

  it('closes on Escape', () => {
    const { banner } = mountRenderer(false, targets);
    const menu = banner.querySelector<HTMLElement>('.banner-switch-menu')!;

    banner.querySelector<HTMLButtonElement>('.banner-switch-button')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.hidden).toBe(true);
  });
});

describe('BannerRenderer.displayWarnings', () => {
  function chips(banner: HTMLElement) {
    return [...banner.querySelectorAll<HTMLElement>('.tracked-flag')];
  }

  it('renders page-controlled values as text, never as markup', () => {
    const { renderer, banner } = mountRenderer();
    const payload = '<img src=x onerror="globalThis.__pwned = true">';

    renderer.displayWarnings([warning('flag', payload)]);

    const chip = chips(banner)[0];
    expect(chip.querySelector('img')).toBeNull();
    expect(chip.querySelector('.tracked-flag-text')?.textContent).toBe(`flag = ${payload}`);
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it('keeps a value containing angle brackets intact', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([warning('cfg', '{"a": 1 < 2}')]);
    expect(chips(banner)[0].querySelector('.tracked-flag-text')?.textContent).toBe(
      'cfg = {"a": 1 < 2}',
    );
  });

  it('colours a switched-on flag as production and the rest as non-production', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([warning('on', 'true', true), warning('off', '0', false)]);

    const [first, second] = chips(banner);
    expect(first.classList.contains('is-enabled')).toBe(true);
    expect(second.classList.contains('is-disabled')).toBe(true);
  });

  it('exposes changes politely to screen readers', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([warning('flag', '1', true)]);

    const content = banner.querySelector('.warning-content');
    expect(content?.getAttribute('role')).toBe('status');
    expect(content?.getAttribute('aria-live')).toBe('polite');
  });

  it('removes the block when there is nothing to show', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([warning('flag', '1', true)]);
    expect(banner.querySelector('.warning-content')).not.toBeNull();

    renderer.displayWarnings([]);
    expect(banner.querySelector('.warning-content')).toBeNull();
  });

  it('replaces previous content instead of appending to it', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([warning('a', '1')]);
    renderer.displayWarnings([warning('b', '2')]);

    expect(banner.querySelectorAll('.warning-content')).toHaveLength(1);
    expect(chips(banner)).toHaveLength(1);
    expect(chips(banner)[0].querySelector('.tracked-flag-text')?.textContent).toBe('b = 2');
  });

  it('offers a reset that names the key and says a reload is needed', () => {
    const { renderer, banner, onResetKey } = mountRenderer();
    renderer.displayWarnings([warning('use-production-data', '1', true)]);

    const reset = chips(banner)[0].querySelector<HTMLButtonElement>('.tracked-flag-reset');
    expect(reset?.getAttribute('aria-label')).toBe(
      'Remove use-production-data and fall back to the app default (reload to apply)',
    );

    reset?.click();
    expect(onResetKey).toHaveBeenCalledWith('use-production-data');
  });

  it('shows a neutral chip, with no reset, while a removal awaits a reload', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([
      { key: 'use-production-data', value: '', isWarning: false, pendingReload: true },
    ]);

    const chip = chips(banner)[0];
    expect(chip.classList.contains('is-pending')).toBe(true);
    expect(chip.classList.contains('is-enabled')).toBe(false);
    expect(chip.classList.contains('is-disabled')).toBe(false);
    expect(chip.textContent).toBe('use-production-data — reload to apply');
    expect(chip.querySelector('.tracked-flag-reset')).toBeNull();
  });

  it('does nothing before the banner is built', () => {
    const renderer = new BannerRenderer({
      isProduction: false,
      bannerSize: 50,
      bannerPosition: 'top',
      targets: [],
      onSwitch: vi.fn(),
      onDismiss: vi.fn(),
      onResetKey: vi.fn(),
    });
    expect(() => renderer.displayWarnings([warning('a', '1')])).not.toThrow();
  });
});

describe('BannerRenderer.destroy', () => {
  it('injects no stylesheet that could be left behind', () => {
    const before = document.head.querySelectorAll('style').length;
    const { renderer } = mountRenderer();
    renderer.destroy();
    // The old implementation appended a <style> on every create and never
    // removed it, so repeated enable/disable cycles piled them up.
    expect(document.head.querySelectorAll('style')).toHaveLength(before);
  });
});
