/**
 * Inserts the banner and reserves space for it in the page layout.
 */

import type { BannerPosition } from '../config/schema';
import { OverlapResolver } from './OverlapResolver';

const WRAPPER_ID = 'environment-banner-wrapper';

export class BannerPositioner {
  private readonly resolver: OverlapResolver | null;
  private inserted = false;

  constructor(
    private readonly wrapper: HTMLElement,
    private readonly bannerSize: number,
    private readonly bannerPosition: BannerPosition,
  ) {
    // Only a top banner can cover a site's viewport-anchored elements; bottom
    // bars are rare enough that offsetting them would do more harm than good.
    this.resolver =
      bannerPosition === 'top'
        ? new OverlapResolver(bannerSize, (element) => element.closest(`#${WRAPPER_ID}`) !== null)
        : null;
  }

  start(): void {
    if (this.inserted) return;
    this.inserted = true;

    document.body.insertBefore(this.wrapper, document.body.firstChild);

    // Space is reserved with padding on the root element rather than a margin on
    // body: a body margin collapses or is overridden on sites that position body
    // themselves, and box-sizing keeps `height: 100%` layouts from overflowing.
    document.documentElement.style.setProperty('--banner-height', `${this.bannerSize}px`);
    document.documentElement.classList.add(`banner-${this.bannerPosition}`);

    this.resolver?.start();
  }

  stop(): void {
    this.resolver?.stop();

    this.wrapper.remove();
    document.documentElement.classList.remove('banner-top', 'banner-bottom');
    document.documentElement.style.removeProperty('--banner-height');
    this.inserted = false;
  }
}
