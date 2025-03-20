import { platform } from './platform';

interface Warning {
    key: string;
    value: string;
    isWarning: boolean;
}

class EnvironmentBanner {
    private banner: HTMLElement | null = null;
    private wrapper: HTMLElement | null = null;
    private isProduction: boolean = false;
    private bannerSize: number = 50;
    private extensionEnabled: boolean = true;
    private styleElement: HTMLStyleElement | null = null;
    private warningContent: HTMLElement | null = null;

    constructor() {
        this.setupMessageListener();
        this.loadStateAndCheckEnvironment();
        this.checkLocalStorageVariables();
        this.setupStorageListener();
    }

    private async loadStateAndCheckEnvironment(): Promise<void> {
        const data = await platform.storage.get(['extensionEnabled', 'productionSites', 'developmentSites', 'prodSize', 'devSize']);
        this.extensionEnabled = data.extensionEnabled !== false;
        
        if (!this.extensionEnabled) {
            this.removeBanner();
            return;
        }

        const currentHostname = window.location.hostname;
        
        const productionSites = data.productionSites || [];
        const developmentSites = data.developmentSites || [];
        
        this.isProduction = productionSites.includes(currentHostname);
        const isDevelopment = developmentSites.includes(currentHostname);
        
        if (this.isProduction || isDevelopment) {
            this.bannerSize = this.isProduction ? (data.prodSize || 50) : (data.devSize || 50);
            this.createBanner();
        }
    }

    private async checkLocalStorageVariables(): Promise<void> {
        const data = await platform.storage.get(['localStorageKeys']);
        const keys = data.localStorageKeys || [];
        const warnings: Warning[] = [];

        keys.forEach((key: string) => {
            const value = localStorage.getItem(key);
            if (value !== null) {
                warnings.push({
                    key,
                    value,
                    isWarning: value === '1' || value === 'true'
                });
            }
        });

        if (warnings.length > 0) {
            this.displayWarnings(warnings);
        }
    }

    private displayWarnings(warnings: Warning[]): void {
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

    private setupStorageListener(): void {
        window.addEventListener('storage', (e: StorageEvent) => {
            if (e.storageArea === localStorage) {
                this.checkLocalStorageVariables();
            }
        });
    }

    private createBanner(): void {
        if (this.banner || !this.extensionEnabled) return;

        this.wrapper = document.createElement('div');
        this.wrapper.id = 'environment-banner-wrapper';
        
        this.banner = document.createElement('div');
        this.banner.id = 'environment-banner';
        this.banner.style.height = `${this.bannerSize}px`;
        this.banner.style.backgroundColor = this.isProduction ? '#ff4444' : '#17b417';
        
        const text = document.createElement('span');
        text.textContent = this.isProduction ? 'PRODUCTION ENVIRONMENT' : 'DEVELOPMENT ENVIRONMENT';
        
        const switchButton = document.createElement('button');
        switchButton.textContent = `Switch to ${this.isProduction ? 'Development' : 'Production'}`;
        switchButton.onclick = () => this.switchEnvironment();
        switchButton.style.color = this.isProduction ? '#ff4444' : '#17b417';
        
        this.banner.appendChild(text);
        this.banner.appendChild(switchButton);
        this.wrapper.appendChild(this.banner);
        
        // Insert banner and adjust page layout
        this.insertBannerAndAdjustLayout();
    }

    private insertBannerAndAdjustLayout(): void {
        if (!document.body) {
            setTimeout(() => this.insertBannerAndAdjustLayout(), 10);
            return;
        }

        // Insert the banner wrapper at the start of the body
        document.body.insertBefore(this.wrapper!, document.body.firstChild);

        // Create and insert style element
        this.styleElement = document.createElement('style');
        this.styleElement.textContent = `
            body {
                margin-top: ${this.bannerSize}px !important;
                width: 100% !important;
                min-width: 100% !important;
                position: relative !important;
            }
            html {
                scroll-padding-top: ${this.bannerSize}px;
                width: 100% !important;
                min-width: 100% !important;
                overflow-x: visible !important;
            }
            #environment-banner-wrapper {
                width: 100% !important;
                min-width: 100% !important;
                max-width: 100% !important;
                left: 0 !important;
                right: 0 !important;
            }
            #environment-banner {
                width: 100% !important;
                min-width: 100% !important;
                max-width: 100% !important;
            }
        `;
        document.head.appendChild(this.styleElement);

        // Adjust absolute and fixed positioned elements
        const adjustPositionedElements = () => {
            const elements = document.querySelectorAll('body *');
            elements.forEach((el) => {
                if (el === this.wrapper || el === this.banner) return;
                const position = window.getComputedStyle(el).position;
                if (position === 'fixed' || position === 'absolute') {
                    const top = window.getComputedStyle(el).top;
                    if (top !== 'auto' && !el.hasAttribute('data-adjusted')) {
                        (el as HTMLElement).style.top = `calc(${top} + ${this.bannerSize}px)`;
                        el.setAttribute('data-adjusted', 'true');
                    }
                }
            });
        };

        adjustPositionedElements();
        window.addEventListener('resize', adjustPositionedElements);
    }

    private removeBanner(): void {
        if (this.wrapper) {
            this.wrapper.remove();
            this.wrapper = null;
            this.banner = null;
            this.warningContent = null;
        }
        if (this.styleElement) {
            this.styleElement.remove();
            this.styleElement = null;
        }

        // Remove adjustments from positioned elements
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

    private async switchEnvironment(): Promise<void> {
        if (!this.extensionEnabled) return;
        
        const data = await platform.storage.get(['productionSites', 'developmentSites']);
        const currentHostname = window.location.hostname;
        
        const productionSites = data.productionSites || [];
        const developmentSites = data.developmentSites || [];
        
        let targetHostname: string | null = null;
        
        if (this.isProduction) {
            const index = productionSites.indexOf(currentHostname);
            if (index !== -1 && index < developmentSites.length) {
                targetHostname = developmentSites[index];
            }
        } else {
            const index = developmentSites.indexOf(currentHostname);
            if (index !== -1 && index < productionSites.length) {
                targetHostname = productionSites[index];
            }
        }
        
        if (targetHostname) {
            const currentUrl = new URL(window.location.href);
            currentUrl.hostname = targetHostname;
            window.open(currentUrl.toString(), '_blank');
        }
    }

    private setupMessageListener(): void {
        platform.onMessage.addListener(async (message: any) => {
            if (message.command === 'toggle-environment') {
                this.switchEnvironment();
            } else if (message.command === 'extension-state-changed') {
                const data = await platform.storage.get(['extensionEnabled']);
                this.extensionEnabled = data.extensionEnabled !== false;
                
                if (this.extensionEnabled) {
                    this.loadStateAndCheckEnvironment();
                } else {
                    this.removeBanner();
                }
            }
        });
    }
}

// Initialize the banner
new EnvironmentBanner(); 