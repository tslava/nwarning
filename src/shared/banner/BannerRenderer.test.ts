import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BannerRenderer, currentUrlParameters } from './BannerRenderer';
import type { SwitchTarget } from './EnvironmentSwitcher';
import type { Warning } from '../storage/StorageMonitor';
import { nextFlagValue } from '../storage/flagValue';

function target(hostname: string, isProduction = false): SwitchTarget {
  return { hostname, url: `https://${hostname}/`, isProduction };
}

function mountRenderer(
  isProduction = false,
  targets: SwitchTarget[] = [target('dev.example.com')],
) {
  const onSwitch = vi.fn();
  const onDismiss = vi.fn();
  const onToggleKey = vi.fn();
  const onUnsetKey = vi.fn();
  const renderer = new BannerRenderer({
    isProduction,
    bannerSize: 50,
    bannerPosition: 'top',
    targets,
    onSwitch,
    onDismiss,
    onToggleKey,
    onUnsetKey,
  });

  const elements = renderer.create();
  if (!elements) throw new Error('renderer produced no elements');
  document.body.appendChild(elements.wrapper);

  return { renderer, banner: elements.banner, onSwitch, onDismiss, onToggleKey, onUnsetKey };
}

/** Mirrors what StorageMonitor reports, so the fixtures cannot describe a chip it never produces. */
function warning(key: string, value: string | null, isWarning = false): Warning {
  return { key, value, isWarning, pendingReload: false, nextValue: nextFlagValue(value) };
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
      'Copy URL parameters',
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
    expect(chip.querySelector('.tracked-flag-text')?.textContent).toBe('flag');
    expect(chip.querySelector('.tracked-flag-value')?.textContent).toBe(`= ${payload}`);
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it('keeps a value containing angle brackets intact', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([warning('cfg', '{"a": 1 < 2}')]);
    expect(chips(banner)[0].querySelector('.tracked-flag-value')?.textContent).toBe(
      '= {"a": 1 < 2}',
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
    expect(chips(banner)[0].querySelector('.tracked-flag-text')?.textContent).toBe('b');
  });

  /** The chip's actions, by their visible label. */
  function actions(banner: HTMLElement, index = 0): Record<string, HTMLButtonElement> {
    const found: Record<string, HTMLButtonElement> = {};
    for (const button of chips(banner)[index].querySelectorAll<HTMLButtonElement>(
      '.tracked-flag-action',
    )) {
      found[button.textContent ?? ''] = button;
    }
    return found;
  }

  it('offers swap and unset as words, not as one click on the whole chip', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([warning('flag', '1', true)]);

    // The chip's body used to be one button, which read as a label and behaved as
    // a switch — and could not offer two different actions at all.
    expect(Object.keys(actions(banner))).toEqual(['swap', 'unset']);
    expect(chips(banner)[0].querySelector('.tracked-flag-text')?.closest('button')).toBeNull();
  });

  it('swaps a 0/1 flag, and says what that will write', () => {
    const { renderer, banner, onToggleKey } = mountRenderer();
    renderer.displayWarnings([warning('use-production-data', '1', true)]);

    const swap = actions(banner).swap;
    // Both effects have to be named, or the new tab is a surprise.
    expect(swap.title).toBe(
      'Set use-production-data to 0 and open this page in a new tab, where the app will read it' +
        ' — this tab keeps the value it started with',
    );

    swap.click();
    expect(onToggleKey).toHaveBeenCalledWith('use-production-data');
  });

  it('names the value the flag will be given, not just the flip', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([warning('flag', 'FALSE')]);
    // The vocabulary and spelling the page used are kept, so the chip has to say so.
    expect(actions(banner).swap.title).toContain('Set flag to TRUE');
  });

  it('removes a flag when unset is pressed, saying it cannot be undone', () => {
    const { renderer, banner, onUnsetKey, onToggleKey } = mountRenderer();
    renderer.displayWarnings([warning('flag', '1', true)]);

    const unset = actions(banner).unset;
    expect(unset.title).toContain('Remove flag');
    expect(unset.title).toContain('cannot be undone');

    unset.click();
    expect(onUnsetKey).toHaveBeenCalledWith('flag');
    expect(onToggleKey).not.toHaveBeenCalled();
  });

  it('does not overwrite a value that is not a plain on/off flag', () => {
    const { renderer, banner, onToggleKey } = mountRenderer();
    renderer.displayWarnings([warning('flag', 'staging')]);

    const swap = actions(banner).swap;
    expect(swap.classList.contains('is-locked')).toBe(true);
    expect(swap.getAttribute('aria-disabled')).toBe('true');

    swap.click();
    expect(onToggleKey).not.toHaveBeenCalled();
  });

  it('still offers unset as the way out of such a value', () => {
    const { renderer, banner, onUnsetKey } = mountRenderer();
    renderer.displayWarnings([warning('flag', 'staging')]);

    // Refusing to overwrite it is not the same as refusing to let it go: the user
    // pressing unset is plainly asking for the value to go.
    actions(banner).unset.click();
    expect(onUnsetKey).toHaveBeenCalledWith('flag');
  });

  it('says why, rather than quietly ignoring the press', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([warning('flag', '{"env":"prod"}')]);

    actions(banner).swap.click();

    const flash = banner.querySelector<HTMLElement>('.banner-flash');
    expect(flash?.hidden).toBe(false);
    expect(flash?.textContent).toBe('flag is not 0/1 — left as it is');
  });

  it('offers to set a key the host is configured to have, naming the value', () => {
    const { renderer, banner, onToggleKey } = mountRenderer();
    // What StorageMonitor reports for a configured key the page has not set, with
    // the value the key is configured to be assigned.
    renderer.displayWarnings([{ ...warning('flag', null), nextValue: 'true' }]);

    const chip = chips(banner)[0];
    // Neutral, not the "off" green: the app is on whatever it was built with, and
    // that is not a statement about the flag's value.
    expect(chip.classList.contains('is-unset')).toBe(true);
    expect(chip.querySelector('.tracked-flag-value')?.textContent).toBe('— not set');

    // One action, and the value it writes is visible: there is nothing to swap and
    // nothing to clear.
    expect(Object.keys(actions(banner))).toEqual(['set true']);
    actions(banner)['set true'].click();
    expect(onToggleKey).toHaveBeenCalledWith('flag');
  });

  it('keeps the state out of the ellipsis when the key name is long', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([warning('nwave-production-enabled-and-then-some-more', null)]);

    const chip = chips(banner)[0];
    // The name is the only shrinking part, so a long one can never swallow the
    // state the way it did when both lived in one element.
    expect(chip.querySelector('.tracked-flag-text')?.textContent).toBe(
      'nwave-production-enabled-and-then-some-more',
    );
    expect(chip.querySelector('.tracked-flag-value')?.textContent).toBe('— not set');
  });

  it('names an unset key by its state for a screen reader', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([warning('flag', null)]);

    expect(actions(banner)['set 1'].getAttribute('aria-label')).toContain('flag is not set');
  });

  it('keeps the flag readable to a screen reader alongside each action', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([warning('flag', '1', true)]);

    // A one-word label means nothing on its own, so both carry the value.
    expect(actions(banner).swap.getAttribute('aria-label')).toMatch(
      /^flag = 1\. Set flag to 0 and open/,
    );
    expect(actions(banner).unset.getAttribute('aria-label')).toMatch(/^flag = 1\. Remove flag/);
  });

  it('keeps the value visible while a change awaits a reload', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([{ ...warning('flag', '0'), pendingReload: true }]);

    const chip = chips(banner)[0];
    // Coloured by what is stored, so the press has a visible effect straight away,
    // with the outstanding reload said in words next to it.
    expect(chip.classList.contains('is-disabled')).toBe(true);
    expect(chip.querySelector('.tracked-flag-value')?.textContent).toBe('= 0');
    expect(chip.querySelector('.tracked-flag-note')?.textContent).toBe('reload to apply');
  });

  it('leaves no nested buttons, which is not valid markup', () => {
    const { renderer, banner } = mountRenderer();
    renderer.displayWarnings([warning('flag', '1', true)]);
    expect(chips(banner)[0].querySelector('button button')).toBeNull();
  });

  it('does nothing before the banner is built', () => {
    const renderer = new BannerRenderer({
      isProduction: false,
      bannerSize: 50,
      bannerPosition: 'top',
      targets: [],
      onSwitch: vi.fn(),
      onDismiss: vi.fn(),
      onToggleKey: vi.fn(),
      onUnsetKey: vi.fn(),
    });
    expect(() => renderer.displayWarnings([warning('a', '1')])).not.toThrow();
  });
});

describe('BannerRenderer copy', () => {
  function flash(banner: HTMLElement): HTMLElement | null {
    const element = banner.querySelector<HTMLElement>('.banner-flash');
    return element && !element.hidden ? element : null;
  }

  function copyButton(banner: HTMLElement): HTMLButtonElement {
    return banner.querySelector<HTMLButtonElement>('.banner-icon-button')!;
  }

  async function clickCopy(banner: HTMLElement): Promise<void> {
    copyButton(banner).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(() => {
    history.replaceState({}, '', '/');
  });

  it('says so visibly when the page has no parameters', async () => {
    const { banner } = mountRenderer();
    await clickCopy(banner);

    // The old build only changed the title here, so most pages looked broken.
    expect(flash(banner)?.textContent).toBe('No parameters on this page');
    expect(flash(banner)?.className).toContain('is-warn');
  });

  it('copies parameters that live in the hash', async () => {
    history.replaceState({}, '', '/reports/history#?limit=20&offset=0&owner=1');
    let copied: string | undefined;
    document.execCommand = vi.fn().mockImplementation(() => {
      copied = document.querySelector<HTMLTextAreaElement>('textarea')?.value;
      return true;
    });

    const { banner } = mountRenderer();
    await clickCopy(banner);

    // Reading only location.search reported "nothing to copy" about this URL.
    expect(copied).toBe('#?limit=20&offset=0&owner=1');
    expect(flash(banner)?.textContent).toBe('Parameters copied');
  });

  it('copies through the selection route, not the Clipboard API', async () => {
    history.replaceState({}, '', '/?probe=1');
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { banner } = mountRenderer();
    await clickCopy(banner);

    expect(execCommand).toHaveBeenCalledWith('copy');
    // writeText resolves even when the write is dropped, so it must not be first.
    expect(writeText).not.toHaveBeenCalled();
    expect(flash(banner)?.textContent).toBe('Parameters copied');
    expect(flash(banner)?.className).toContain('is-ok');
  });

  it('falls back to the Clipboard API when the selection route fails', async () => {
    history.replaceState({}, '', '/?probe=2');
    document.execCommand = vi.fn().mockReturnValue(false);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { banner } = mountRenderer();
    await clickCopy(banner);

    expect(writeText).toHaveBeenCalledWith('?probe=2');
    expect(flash(banner)?.textContent).toBe('Parameters copied');
  });

  it('reports a failure visibly when both routes fail', async () => {
    history.replaceState({}, '', '/?probe=3');
    document.execCommand = vi.fn().mockReturnValue(false);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });

    const { banner } = mountRenderer();
    await clickCopy(banner);

    expect(flash(banner)?.textContent).toBe('Copy failed');
    expect(flash(banner)?.className).toContain('is-warn');
  });

  it('copies the query string itself', async () => {
    history.replaceState({}, '', '/?page=2&filter=test');
    let copied: string | undefined;
    document.execCommand = vi.fn().mockImplementation(() => {
      copied = document.querySelector<HTMLTextAreaElement>('textarea')?.value;
      return true;
    });

    const { banner } = mountRenderer();
    await clickCopy(banner);

    expect(copied).toBe('?page=2&filter=test');
  });

  it('leaves no textarea behind and restores the page selection', async () => {
    history.replaceState({}, '', '/?probe=4');
    const paragraph = document.createElement('p');
    paragraph.textContent = 'user had this selected';
    document.body.appendChild(paragraph);
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);

    document.execCommand = vi.fn().mockReturnValue(true);
    const { banner } = mountRenderer();
    await clickCopy(banner);

    expect(document.querySelectorAll('textarea')).toHaveLength(0);
    expect(getSelection()?.toString()).toBe('user had this selected');
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

describe('currentUrlParameters', () => {
  function at(url: string): string {
    return currentUrlParameters(new URL(url, 'https://example.com') as unknown as Location);
  }

  it('returns a plain query string', () => {
    expect(at('/devices?page=2&filter=test')).toBe('?page=2&filter=test');
  });

  it('returns hash parameters, keeping the hash so they can be pasted back', () => {
    expect(at('/reports/history#?limit=20&offset=0&owner=1&filter=3')).toBe(
      '#?limit=20&offset=0&owner=1&filter=3',
    );
  });

  it('returns only the query part when the hash also carries a route', () => {
    expect(at('/#/devices?limit=20')).toBe('?limit=20');
  });

  it('prefers the search string when a URL somehow has both', () => {
    expect(at('/devices?a=1#?b=2')).toBe('?a=1');
  });

  it('returns nothing when there are no parameters anywhere', () => {
    expect(at('/devices')).toBe('');
    expect(at('/devices#section')).toBe('');
  });
});
