/**
 * Handles banner positioning and page layout adjustments.
 */

export class BannerPositioner {
    private wrapper: HTMLElement;
    private bannerSize: number;
    private bannerPosition: 'top' | 'bottom';
    private styleElement: HTMLStyleElement | null = null;
    private resizeHandler: (() => void) | null = null;

    constructor(wrapper: HTMLElement, bannerSize: number, bannerPosition: 'top' | 'bottom') {
        this.wrapper = wrapper;
        this.bannerSize = bannerSize;
        this.bannerPosition = bannerPosition;
    }

    insertAndAdjustLayout(): void {
        if (!document.body) {
            setTimeout(() => this.insertAndAdjustLayout(), 10);
            return;
        }

        document.body.insertBefore(this.wrapper, document.body.firstChild);

        this.styleElement = document.createElement('style');
        document.documentElement.style.setProperty('--banner-height', `${this.bannerSize}px`);
        document.body.classList.add(`banner-${this.bannerPosition}`);
        document.documentElement.classList.add(`banner-${this.bannerPosition}`);

        if (this.bannerPosition === 'top') {
            this.adjustPositionedElements();
            this.resizeHandler = () => this.adjustPositionedElements();
            window.addEventListener('resize', this.resizeHandler);
        }
    }

    cleanup(): void {
        if (this.wrapper.parentNode) {
            this.wrapper.remove();
        }

        if (this.styleElement) {
            this.styleElement.remove();
            this.styleElement = null;
        }

        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }

        this.removeElementAdjustments();

        document.body.classList.remove('banner-top', 'banner-bottom');
        document.documentElement.classList.remove('banner-top', 'banner-bottom');
        document.documentElement.style.removeProperty('--banner-height');
    }

    private adjustPositionedElements(): void {
        const elements = document.querySelectorAll('body *');
        elements.forEach((el) => {
            if (el === this.wrapper || el.closest('#environment-banner-wrapper')) return;

            const position = window.getComputedStyle(el).position;
            if (position === 'fixed' || position === 'absolute') {
                const top = window.getComputedStyle(el).top;
                if (top !== 'auto' && !el.hasAttribute('data-adjusted')) {
                    if (this.bannerPosition === 'top') {
                        (el as HTMLElement).style.top = `calc(${top} + ${this.bannerSize}px)`;
                    }
                    el.setAttribute('data-adjusted', 'true');
                }
            }
        });
    }

    private removeElementAdjustments(): void {
        const elements = document.querySelectorAll('[data-adjusted]');
        elements.forEach((el) => {
            el.removeAttribute('data-adjusted');
            const computedStyle = window.getComputedStyle(el);
            const top = computedStyle.top;
            if (top.includes('calc')) {
                (el as HTMLElement).style.top = top.replace(`+ ${this.bannerSize}px`, '').trim();
            }
        });
    }
}
