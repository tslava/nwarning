/**
 * Handles banner DOM creation and rendering.
 */

export interface BannerConfig {
    isProduction: boolean;
    bannerSize: number;
    bannerPosition: 'top' | 'bottom';
    onSwitchEnvironment: () => void;
}

export interface BannerElements {
    wrapper: HTMLElement;
    banner: HTMLElement;
    warningContent: HTMLElement | null;
}

export class BannerRenderer {
    private wrapper: HTMLElement | null = null;
    private banner: HTMLElement | null = null;
    private warningContent: HTMLElement | null = null;
    private config: BannerConfig;

    constructor(config: BannerConfig) {
        this.config = config;
    }

    create(): BannerElements | null {
        if (this.banner) return this.getElements();

        this.injectButtonStyles();
        this.createWrapper();
        this.createBannerElement();
        this.createButtonPanel();
        this.createCenterContent();

        this.wrapper!.appendChild(this.banner!);

        return this.getElements();
    }

    getElements(): BannerElements | null {
        if (!this.wrapper || !this.banner) return null;
        return {
            wrapper: this.wrapper,
            banner: this.banner,
            warningContent: this.warningContent
        };
    }

    displayWarnings(warnings: { key: string; value: string; isWarning: boolean }[]): void {
        if (!this.banner) return;

        const warningText = warnings.map(w => {
            const brightness = w.isWarning ? 'bright' : 'dim';
            return `<span class="${brightness}">${w.key} = ${w.value}</span>`;
        }).join(' | ');

        if (!this.warningContent) {
            this.warningContent = document.createElement('div');
            this.warningContent.className = 'warning-content';
            this.banner.appendChild(this.warningContent);
        }

        this.warningContent.innerHTML = `
            <span class="warning-icon">⚠️</span>
            <span class="warning-text">${warningText}</span>
        `;
    }

    destroy(): void {
        this.wrapper = null;
        this.banner = null;
        this.warningContent = null;
    }

    private injectButtonStyles(): void {
        const style = document.createElement('style');
        style.textContent = `
            .banner-icon-button {
                padding: 4px !important;
                background: none !important;
                border: none !important;
                cursor: pointer !important;
                color: white !important;
                opacity: 0.8 !important;
                transition: opacity 0.2s ease !important;
            }
            .banner-icon-button:hover {
                opacity: 1 !important;
            }
            .banner-icon-button svg {
                display: block !important;
            }
        `;
        document.head.appendChild(style);
    }

    private createWrapper(): void {
        this.wrapper = document.createElement('div');
        this.wrapper.id = 'environment-banner-wrapper';
        this.wrapper.className = `position-${this.config.bannerPosition}`;
    }

    private createBannerElement(): void {
        this.banner = document.createElement('div');
        this.banner.id = 'environment-banner';
        this.banner.style.height = `${this.config.bannerSize}px`;
        this.banner.style.backgroundColor = this.config.isProduction ? '#ff4444' : '#17b417';
        this.banner.style.display = 'flex';
        this.banner.style.alignItems = 'center';
        this.banner.style.position = 'relative';
    }

    private createButtonPanel(): void {
        const buttonPanel = document.createElement('div');
        buttonPanel.className = 'banner-button-panel';
        buttonPanel.style.marginLeft = '16px';
        buttonPanel.style.display = 'flex';
        buttonPanel.style.alignItems = 'center';
        buttonPanel.style.gap = '8px';

        const copyQueryButton = this.createCopyButton();
        buttonPanel.appendChild(copyQueryButton);
        this.banner!.appendChild(buttonPanel);
    }

    private createCopyButton(): HTMLButtonElement {
        const button = document.createElement('button');
        button.className = 'banner-icon-button';
        button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>';
        button.title = 'Copy URL query string';

        button.onclick = () => this.handleCopyClick(button);
        return button;
    }

    private handleCopyClick(button: HTMLButtonElement): void {
        const queryString = window.location.search;

        if (!queryString) {
            button.title = 'No query string to copy';
            setTimeout(() => { button.title = 'Copy URL query string'; }, 2000);
            return;
        }

        try {
            const tempInput = document.createElement('input');
            tempInput.style.position = 'absolute';
            tempInput.style.left = '-9999px';
            tempInput.style.top = '0';
            tempInput.value = queryString;
            document.body.appendChild(tempInput);

            tempInput.select();
            tempInput.setSelectionRange(0, 99999);

            const successful = document.execCommand('copy');
            document.body.removeChild(tempInput);

            if (successful) {
                const originalHTML = button.innerHTML;
                button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
                button.title = 'Copied!';
                setTimeout(() => {
                    button.innerHTML = originalHTML;
                    button.title = 'Copy URL query string';
                }, 2000);
            } else {
                button.title = 'Failed to copy';
                setTimeout(() => { button.title = 'Copy URL query string'; }, 2000);
            }
        } catch {
            button.title = 'Error copying';
            setTimeout(() => { button.title = 'Copy URL query string'; }, 2000);
        }
    }

    private createCenterContent(): void {
        const centerContent = document.createElement('div');
        centerContent.style.flex = '1';
        centerContent.style.display = 'flex';
        centerContent.style.justifyContent = 'center';
        centerContent.style.alignItems = 'center';
        centerContent.style.gap = '20px';

        const text = document.createElement('span');
        text.textContent = this.config.isProduction ? 'PRODUCTION ENVIRONMENT' : 'DEVELOPMENT ENVIRONMENT';

        const switchButton = document.createElement('button');
        switchButton.textContent = `Switch to ${this.config.isProduction ? 'Development' : 'Production'}`;
        switchButton.onclick = () => this.config.onSwitchEnvironment();
        switchButton.style.color = this.config.isProduction ? '#ff4444' : '#17b417';

        centerContent.appendChild(text);
        centerContent.appendChild(switchButton);
        this.banner!.appendChild(centerContent);
    }
}
