import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverlapResolver } from './OverlapResolver';

const BANNER_HEIGHT = 50;
const VIEWPORT_HEIGHT = 768;

/**
 * jsdom does no layout, so geometry is stubbed per element and updated by the
 * test to mimic what the browser would do after a style change.
 */
function createElement(options: {
  top: number;
  height?: number;
  position?: string;
  inlineTop?: string;
}): HTMLElement {
  const element = document.createElement('div');
  element.style.position = options.position ?? 'fixed';
  if (options.inlineTop !== undefined) element.style.top = options.inlineTop;
  document.body.appendChild(element);
  setRect(element, options.top, options.height ?? 64);
  return element;
}

function setRect(element: HTMLElement, top: number, height = 64): void {
  element.getBoundingClientRect = () =>
    ({
      top,
      height,
      width: 1000,
      left: 0,
      right: 1000,
      bottom: top + height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

/**
 * Sum of the px terms in an inline `top`. Engines fold `calc(0px + 50px)` down
 * to `calc(50px)` when serializing, so compare numbers rather than strings.
 */
function topPx(element: HTMLElement): number {
  const value = element.style.getPropertyValue('top');
  const terms = value.match(/-?[\d.]+px/g);
  if (!terms) return Number.NaN;
  return terms.reduce((total, term) => total + Number.parseFloat(term), 0);
}

let stack: HTMLElement[] = [];

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  });
}

function isOwnElement(element: Element): boolean {
  return element.closest('#environment-banner-wrapper') !== null;
}

beforeEach(() => {
  document.body.replaceChildren();
  document.documentElement.style.cssText = '';
  stack = [];
  Object.defineProperty(window, 'innerHeight', { value: VIEWPORT_HEIGHT, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  document.elementsFromPoint = () => stack;
});

afterEach(() => {
  stack = [];
  setHidden(false);
  vi.restoreAllMocks();
});

describe('OverlapResolver', () => {
  let resolver: OverlapResolver;

  beforeEach(() => {
    resolver = new OverlapResolver(BANNER_HEIGHT, isOwnElement);
  });

  afterEach(() => {
    resolver.stop();
  });

  it('offsets a fixed bar sitting under the banner', () => {
    const bar = createElement({ top: 0, inlineTop: '0px' });
    stack = [bar];

    resolver.start();

    expect(topPx(bar)).toBe(BANNER_HEIGHT);
    // important, so a site rule with !important on top cannot win.
    expect(bar.style.getPropertyPriority('top')).toBe('important');
  });

  it('offsets sticky elements too', () => {
    const bar = createElement({ top: 0, inlineTop: '0px', position: 'sticky' });
    stack = [bar];

    resolver.start();

    expect(topPx(bar)).toBe(BANNER_HEIGHT);
  });

  it('leaves elements that already clear the banner alone', () => {
    const bar = createElement({ top: 200, inlineTop: '200px' });
    stack = [bar];

    resolver.start();

    expect(bar.style.getPropertyValue('top')).toBe('200px');
    expect(bar.style.getPropertyPriority('top')).toBe('');
  });

  it('ignores elements that are not viewport-anchored', () => {
    const block = createElement({ top: 0, inlineTop: '0px', position: 'absolute' });
    stack = [block];

    resolver.start();

    expect(block.style.getPropertyValue('top')).toBe('0px');
  });

  it('ignores the banner’s own elements', () => {
    const wrapper = document.createElement('div');
    wrapper.id = 'environment-banner-wrapper';
    const inner = document.createElement('div');
    wrapper.appendChild(inner);
    document.body.appendChild(wrapper);
    inner.style.position = 'fixed';
    inner.style.top = '0px';
    setRect(inner, 0);
    stack = [inner];

    resolver.start();

    expect(inner.style.getPropertyValue('top')).toBe('0px');
  });

  it('shifts an element with top:auto without giving it a top', () => {
    const bar = createElement({ top: 0 });
    stack = [bar];

    resolver.start();

    expect(bar.style.getPropertyValue('top')).toBe('');
    expect(bar.style.getPropertyValue('transform')).toBe(`translateY(${BANNER_HEIGHT}px)`);
  });

  it('also shortens a full-height overlay so its bottom is not pushed off-screen', () => {
    const drawer = createElement({ top: 0, height: VIEWPORT_HEIGHT, inlineTop: '0px' });
    stack = [drawer];

    resolver.start();

    expect(topPx(drawer)).toBe(BANNER_HEIGHT);
    expect(drawer.style.getPropertyValue('max-height')).toBe(`calc(100vh - ${BANNER_HEIGHT}px)`);
  });

  it('does not shorten a normal bar', () => {
    const bar = createElement({ top: 0, height: 64, inlineTop: '0px' });
    stack = [bar];

    resolver.start();

    expect(bar.style.getPropertyValue('max-height')).toBe('');
  });

  it('picks up a bar that mounts after the banner', async () => {
    resolver.start();

    const late = createElement({ top: 0, inlineTop: '0px' });
    stack = [late];
    // The MutationObserver from appending the element schedules a pass.
    await nextFrame();
    await nextFrame();

    expect(topPx(late)).toBe(BANNER_HEIGHT);
  });

  it('re-applies an offset that a framework re-render wiped', async () => {
    const bar = createElement({ top: 0, inlineTop: '0px' });
    stack = [bar];
    resolver.start();
    expect(topPx(bar)).toBe(BANNER_HEIGHT);

    // The browser has moved it down; the resolver should now leave it be.
    setRect(bar, BANNER_HEIGHT);

    // A re-render rewrites the style attribute and loses our offset.
    bar.style.removeProperty('top');
    setRect(bar, 0);

    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    await nextFrame();

    expect(topPx(bar)).toBe(BANNER_HEIGHT);
  });

  it('does not stack offsets across repeated passes', async () => {
    const bar = createElement({ top: 0, inlineTop: '0px' });
    stack = [bar];
    resolver.start();

    setRect(bar, BANNER_HEIGHT);
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    await nextFrame();

    expect(topPx(bar)).toBe(BANNER_HEIGHT);
  });

  it('restores the original inline top on stop', () => {
    const bar = createElement({ top: 0, inlineTop: '12px' });
    stack = [bar];

    resolver.start();
    expect(topPx(bar)).toBe(12 + BANNER_HEIGHT);

    resolver.stop();
    expect(bar.style.getPropertyValue('top')).toBe('12px');
    expect(bar.style.getPropertyPriority('top')).toBe('');
  });

  it('removes the inline top entirely when there was none', () => {
    const bar = createElement({ top: 0, inlineTop: '0px' });
    bar.style.removeProperty('top');
    // Computed top still resolves via the stub; simulate a stylesheet rule.
    bar.style.setProperty('position', 'fixed');
    stack = [bar];

    resolver.start();
    resolver.stop();

    expect(bar.getAttribute('style')).not.toContain('top');
  });

  it('restores max-height and transform as well', () => {
    const drawer = createElement({ top: 0, height: VIEWPORT_HEIGHT, inlineTop: '0px' });
    drawer.style.setProperty('max-height', '90vh');
    stack = [drawer];

    resolver.start();
    resolver.stop();

    expect(drawer.style.getPropertyValue('max-height')).toBe('90vh');
    expect(drawer.style.getPropertyValue('transform')).toBe('');
  });

  it('re-checks after a transition, which moves an element with no DOM mutation', async () => {
    resolver.start();

    // A drawer mounts off-screen and slides in: not hit-testable until it lands.
    const drawer = createElement({ top: 0, height: VIEWPORT_HEIGHT, inlineTop: '0px' });
    stack = [];
    await nextFrame();
    await nextFrame();
    expect(drawer.style.getPropertyValue('top')).toBe('0px');

    // It has arrived. Nothing mutated the DOM, so only transitionend can tell us.
    stack = [drawer];
    drawer.dispatchEvent(new Event('transitionend', { bubbles: true }));
    await nextFrame();
    await nextFrame();

    expect(topPx(drawer)).toBe(BANNER_HEIGHT);
    expect(drawer.style.getPropertyValue('max-height')).toBe(`calc(100vh - ${BANNER_HEIGHT}px)`);
  });

  it('re-checks after a CSS animation ends', async () => {
    resolver.start();

    const bar = createElement({ top: 0, inlineTop: '0px' });
    stack = [];
    await nextFrame();
    await nextFrame();

    stack = [bar];
    bar.dispatchEvent(new Event('animationend', { bubbles: true }));
    await nextFrame();
    await nextFrame();

    expect(topPx(bar)).toBe(BANNER_HEIGHT);
  });

  it('samples the viewport edges, not just interior columns', () => {
    const edgeBar = createElement({ top: 0, inlineTop: '0px' });
    // A narrow strip pinned to the left edge: only in the stack at x <= 2.
    document.elementsFromPoint = (x: number): Element[] => (x <= 2 ? [edgeBar] : []);

    resolver.start();

    expect(topPx(edgeBar)).toBe(BANNER_HEIGHT);
  });

  it('still resolves in a background tab, where rAF never fires', async () => {
    setHidden(true);
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);

    resolver.start();

    // Mounts after the first pass, exactly as a client-rendered header does.
    const late = createElement({ top: 0, inlineTop: '0px' });
    stack = [late];
    await nextTick();
    await nextTick();

    expect(topPx(late)).toBe(BANNER_HEIGHT);
    // Proof the timer path did the work: rAF was never usable here.
    expect(raf).not.toHaveBeenCalled();
  });

  it('re-checks when a hidden tab becomes visible', async () => {
    setHidden(true);
    // Starts clear of the banner, so the first pass leaves it alone.
    const bar = createElement({ top: 200, inlineTop: '200px' });
    stack = [bar];
    resolver.start();
    expect(bar.style.getPropertyPriority('top')).toBe('');

    // Geometry changed without any DOM mutation, which is what stale layout in a
    // background tab looks like once the tab is shown.
    setRect(bar, 0);

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await nextFrame();
    await nextFrame();

    expect(topPx(bar)).toBe(200 + BANNER_HEIGHT);
  });

  it('forgets elements that leave the DOM', async () => {
    const bar = createElement({ top: 0, inlineTop: '0px' });
    stack = [bar];
    resolver.start();

    bar.remove();
    stack = [];
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    await nextFrame();

    // stop() must not throw or resurrect styles on a detached node.
    expect(() => resolver.stop()).not.toThrow();
  });
});
