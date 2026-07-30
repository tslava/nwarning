/**
 * Pushes the page's own viewport-anchored elements out from under the banner.
 *
 * Reserving space with page padding moves the document, but `fixed` and `sticky`
 * elements are anchored to the viewport and ignore it, so a site's own top bar
 * ends up hidden behind the banner. Those elements have to be offset one by one.
 *
 * Two things make this reliable where the previous implementation was not:
 *
 *  - It re-runs. The old code ran a single pass when the banner was inserted and
 *    then only on resize, so on a client-rendered page whose header mounts after
 *    the banner (React, Vue, …) the header was never moved at all. A
 *    MutationObserver plus scroll/resize/load, all coalesced into one pass per
 *    animation frame, covers late mounts and dynamically added bars.
 *  - It tracks state instead of a marker. The old code set a `data-adjusted`
 *    attribute and skipped anything carrying it, so once a framework re-render
 *    rewrote the element's style attribute and wiped the offset, it was never
 *    restored. Offsets live in a Map here, and each pass verifies the element is
 *    still where we put it.
 */

/** Extra pixels below the banner that still count as "overlapping". */
const OVERLAP_SLACK = 2;

/** Interior sample positions, as a fraction of the viewport width. */
const SAMPLE_FRACTIONS = [0.25, 0.5, 0.75];

/**
 * Both viewport edges are sampled at a fixed inset as well. Purely fractional
 * columns miss narrow elements pinned to an edge — MUI's 20px swipe-area strip,
 * edge-anchored toolbars, scroll-progress bars.
 */
const EDGE_INSET = 2;

interface SavedStyle {
  /** Inline `top` before we touched it, so it can be restored exactly. */
  inlineTop: string;
  inlineTopPriority: string;
  inlineMaxHeight: string;
  inlineMaxHeightPriority: string;
  inlineTransform: string;
  inlineTransformPriority: string;
  /** Resolved `top` at capture time; offsets are always derived from this. */
  baseTop: string;
  /** Whether the element is a bar to nudge or an overlay to also shorten. */
  kind: 'bar' | 'overlay';
}

/** A coalesced pass waiting to run, and how it was scheduled. */
interface PendingPass {
  kind: 'frame' | 'timer';
  id: number;
}

export class OverlapResolver {
  private readonly offsets = new Map<HTMLElement, SavedStyle>();
  private observer: MutationObserver | null = null;
  private pending: PendingPass | null = null;
  private running = false;

  constructor(
    private readonly height: number,
    private readonly isOwnElement: (element: Element) => boolean,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    window.addEventListener('resize', this.schedule);
    // Sticky elements change offset as the page scrolls.
    window.addEventListener('scroll', this.schedule, { passive: true });
    // Layout can be stale in a background tab, so re-check when it is shown.
    document.addEventListener('visibilitychange', this.schedule);
    // A transition or animation moves an element without touching the DOM, so
    // the observer never sees it. A drawer sliding in is the common case: while
    // it is off-screen it is not hit-testable, and by the time it has arrived
    // nothing else would have triggered a pass.
    document.addEventListener('transitionend', this.schedule, { capture: true, passive: true });
    document.addEventListener('animationend', this.schedule, { capture: true, passive: true });
    if (document.readyState !== 'complete') {
      window.addEventListener('load', this.schedule);
    }

    this.observer = new MutationObserver(this.schedule);
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      // A class or style change can turn an element into a fixed bar, or undo
      // an offset we applied.
      attributeFilter: ['style', 'class'],
    });

    this.resolve();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    window.removeEventListener('resize', this.schedule);
    window.removeEventListener('scroll', this.schedule);
    window.removeEventListener('load', this.schedule);
    document.removeEventListener('visibilitychange', this.schedule);
    document.removeEventListener('transitionend', this.schedule, { capture: true });
    document.removeEventListener('animationend', this.schedule, { capture: true });
    this.observer?.disconnect();
    this.observer = null;
    this.cancelPending();

    for (const [element, saved] of this.offsets) this.restore(element, saved);
    this.offsets.clear();
  }

  /**
   * Coalesce every trigger into at most one pass. A pass is idempotent — it only
   * writes to elements that are actually overlapping — so the style mutations it
   * makes settle on the next pass instead of looping.
   *
   * requestAnimationFrame does not fire in a background tab, so relying on it
   * alone left every pass queued and never run: a page opened in a background
   * tab kept its bars under the banner. Fall back to a timer while hidden.
   */
  private readonly schedule = (): void => {
    if (!this.running || this.pending !== null) return;

    this.pending = document.hidden
      ? { kind: 'timer', id: window.setTimeout(this.runPending, 0) }
      : { kind: 'frame', id: requestAnimationFrame(this.runPending) };
  };

  private readonly runPending = (): void => {
    this.pending = null;
    this.resolve();
  };

  private cancelPending(): void {
    if (!this.pending) return;
    if (this.pending.kind === 'frame') {
      cancelAnimationFrame(this.pending.id);
    } else {
      clearTimeout(this.pending.id);
    }
    this.pending = null;
  }

  private resolve(): void {
    if (!document.body) return;

    this.pruneDetached();

    // Re-apply first: an element we already own may have lost its offset to a
    // framework re-render, which would also make it overlap again.
    for (const [element, saved] of this.offsets) {
      if (this.overlapsBanner(element)) this.applyOffset(element, saved);
    }

    for (const element of this.findOverlapping()) {
      if (this.offsets.has(element)) continue;
      this.capture(element);
    }
  }

  /**
   * Elements the banner currently covers, found by hit-testing its band.
   *
   * Hit-testing only sees elements that participate in it, so an element with
   * `pointer-events: none` is invisible here. That is the intended trade-off:
   * such an element cannot be clicked through anyway, and its visible children
   * are found on their own. Elements with `visibility: hidden` — closed modals,
   * for instance — are skipped for the same reason, which is what we want.
   */
  private findOverlapping(): HTMLElement[] {
    const found = new Set<HTMLElement>();
    const rows = [1, Math.round(this.height / 2), this.height + 1];
    const columns = [
      EDGE_INSET,
      ...SAMPLE_FRACTIONS.map((fraction) => Math.round(window.innerWidth * fraction)),
      window.innerWidth - EDGE_INSET,
    ];

    for (const row of rows) {
      for (const x of columns) {
        // elementsFromPoint returns the whole stack at that point, so elements
        // completely hidden behind the banner are found too. It costs one
        // hit-test rather than a walk of every element on the page.
        for (const element of document.elementsFromPoint(x, row)) {
          if (!(element instanceof HTMLElement)) continue;
          if (this.isOwnElement(element)) continue;
          if (this.isCandidate(element)) found.add(element);
        }
      }
    }

    return [...found];
  }

  private isCandidate(element: HTMLElement): boolean {
    const position = getComputedStyle(element).position;
    // `absolute` is deliberately excluded: it scrolls with the page padding, so
    // it needs no offset, and moving it was a large part of what the previous
    // implementation broke on unrelated layouts.
    if (position !== 'fixed' && position !== 'sticky') return false;
    return this.overlapsBanner(element);
  }

  private overlapsBanner(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return rect.top < this.height - OVERLAP_SLACK;
  }

  private capture(element: HTMLElement): void {
    const style = getComputedStyle(element);
    const saved: SavedStyle = {
      inlineTop: element.style.getPropertyValue('top'),
      inlineTopPriority: element.style.getPropertyPriority('top'),
      inlineMaxHeight: element.style.getPropertyValue('max-height'),
      inlineMaxHeightPriority: element.style.getPropertyPriority('max-height'),
      inlineTransform: element.style.getPropertyValue('transform'),
      inlineTransformPriority: element.style.getPropertyPriority('transform'),
      baseTop: style.top,
      kind: this.classify(element),
    };

    this.offsets.set(element, saved);
    this.applyOffset(element, saved);
  }

  /**
   * A full-height overlay (modal, backdrop, drawer) needs its height reduced as
   * well as its top moved, or the bottom of it is pushed off-screen — which is
   * how the previous version cut off the last 50px of side menus.
   */
  private classify(element: HTMLElement): 'bar' | 'overlay' {
    const rect = element.getBoundingClientRect();
    return rect.height > window.innerHeight - this.height ? 'overlay' : 'bar';
  }

  private applyOffset(element: HTMLElement, saved: SavedStyle): void {
    if (saved.baseTop === 'auto') {
      // Nothing to add to, and writing a `top` would tear the element out of its
      // natural position, so shift it visually instead.
      const base = saved.inlineTransform.trim();
      const shift = `translateY(${this.height}px)`;
      element.style.setProperty('transform', base ? `${base} ${shift}` : shift, 'important');
    } else {
      // `important` so a site rule with !important on `top` cannot win.
      element.style.setProperty('top', `calc(${saved.baseTop} + ${this.height}px)`, 'important');
    }

    if (saved.kind === 'overlay') {
      element.style.setProperty('max-height', `calc(100vh - ${this.height}px)`, 'important');
    }
  }

  private restore(element: HTMLElement, saved: SavedStyle): void {
    restoreProperty(element, 'top', saved.inlineTop, saved.inlineTopPriority);
    restoreProperty(element, 'max-height', saved.inlineMaxHeight, saved.inlineMaxHeightPriority);
    restoreProperty(element, 'transform', saved.inlineTransform, saved.inlineTransformPriority);
  }

  private pruneDetached(): void {
    for (const element of this.offsets.keys()) {
      if (!element.isConnected) this.offsets.delete(element);
    }
  }
}

function restoreProperty(
  element: HTMLElement,
  property: string,
  value: string,
  priority: string,
): void {
  if (value) {
    element.style.setProperty(property, value, priority);
  } else {
    element.style.removeProperty(property);
  }
}
