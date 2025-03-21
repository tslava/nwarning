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
    private bannerPosition: 'top' | 'bottom' = 'top';
    private extensionEnabled: boolean = true;
    private styleElement: HTMLStyleElement | null = null;
    private warningContent: HTMLElement | null = null;

    constructor() {
        this.setupMessageListener();
        this.loadStateAndCheckEnvironment();
        this.checkLocalStorageVariables();
        this.setupStorageListener();
    }

    private matchDomainPattern(domain: string, pattern: string): boolean {
        // Convert the pattern to a regex pattern
        // Escape special regex characters except *
        const regexPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape special regex chars
            .replace(/\*/g, '.*'); // convert * to .*
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(domain);
    }

    private findMatchingDomain(domain: string, patterns: string[]): boolean {
        return patterns.some(pattern => this.matchDomainPattern(domain, pattern));
    }

    private async loadStateAndCheckEnvironment(): Promise<void> {
        const data = await platform.storage.get([
            'extensionEnabled',
            'productionSites',
            'developmentSites',
            'prodSize',
            'devSize',
            'bannerPosition'
        ]);
        this.extensionEnabled = data.extensionEnabled !== false;
        this.bannerPosition = data.bannerPosition || 'top';
        
        if (!this.extensionEnabled) {
            this.removeBanner();
            return;
        }

        const currentHostname = window.location.hostname;
        
        const productionSites = data.productionSites || [];
        const developmentSites = data.developmentSites || [];
        
        this.isProduction = this.findMatchingDomain(currentHostname, productionSites);
        const isDevelopment = this.findMatchingDomain(currentHostname, developmentSites);
        
        if (this.isProduction || isDevelopment) {
            this.bannerSize = this.isProduction ? (data.prodSize || 50) : (data.devSize || 50);
            this.createBanner();
        }
    }

    private async checkLocalStorageVariables(): Promise<void> {
        const data = await platform.storage.get(['localStorageKeys']);
        const keys = data.localStorageKeys || [];
        const warnings: Warning[] = [];

        if (keys.length > 0) {
            const values = await platform.getLocalStorageValues!(keys);
            
            Object.entries(values).forEach(([key, value]) => {
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
        if (platform.injectStorageListener) {
            // Use platform-specific storage listener for Firefox
            platform.injectStorageListener(() => {
                this.checkLocalStorageVariables();
            });
        } else {
            // Use standard storage event for Chrome
            window.addEventListener('storage', (e: StorageEvent) => {
                if (e.storageArea === localStorage) {
                    this.checkLocalStorageVariables();
                }
            });
        }
    }

    private createBanner(): void {
        if (this.banner || !this.extensionEnabled) return;

        this.wrapper = document.createElement('div');
        this.wrapper.id = 'environment-banner-wrapper';
        this.wrapper.className = `position-${this.bannerPosition}`;
        
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
        document.documentElement.style.setProperty('--banner-height', `${this.bannerSize}px`);
        document.body.classList.add(`banner-${this.bannerPosition}`);
        document.documentElement.classList.add(`banner-${this.bannerPosition}`);

        // Adjust absolute and fixed positioned elements
        const adjustPositionedElements = () => {
            const elements = document.querySelectorAll('body *');
            elements.forEach((el) => {
                if (el === this.wrapper || el === this.banner) return;
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
        };

        if (this.bannerPosition === 'top') {
            adjustPositionedElements();
            window.addEventListener('resize', adjustPositionedElements);
        }
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

        // Remove banner classes
        document.body.classList.remove('banner-top', 'banner-bottom');
        document.documentElement.classList.remove('banner-top', 'banner-bottom');
        document.documentElement.style.removeProperty('--banner-height');
    }

    private async switchEnvironment(): Promise<void> {
        if (!this.extensionEnabled) return;
        
        const data = await platform.storage.get(['productionSites', 'developmentSites']);
        const currentHostname = window.location.hostname;
        
        const productionSites = data.productionSites || [];
        const developmentSites = data.developmentSites || [];
        
        let targetHostname: string | null = null;
        
        if (this.isProduction) {
            // Find the matching production pattern
            const matchingPattern: string | undefined = productionSites.find((pattern: string) => 
                this.matchDomainPattern(currentHostname, pattern)
            );
            if (matchingPattern) {
                const index = productionSites.indexOf(matchingPattern);
                if (index !== -1 && index < developmentSites.length) {
                    // If the current domain matches a wildcard pattern,
                    // preserve the dynamic part when switching
                    const devPattern: string = developmentSites[index];
                    if (devPattern.includes('*')) {
                        // Extract the dynamic part from the current hostname
                        const dynamicPart = this.extractDynamicPart(currentHostname, matchingPattern);
                        if (dynamicPart) {
                            targetHostname = devPattern.replace('*', dynamicPart);
                        }
                    } else {
                        targetHostname = devPattern;
                    }
                }
            }
        } else {
            // Find the matching development pattern
            const matchingPattern: string | undefined = developmentSites.find((pattern: string) => 
                this.matchDomainPattern(currentHostname, pattern)
            );
            if (matchingPattern) {
                const index = developmentSites.indexOf(matchingPattern);
                if (index !== -1 && index < productionSites.length) {
                    // If the current domain matches a wildcard pattern,
                    // preserve the dynamic part when switching
                    const prodPattern: string = productionSites[index];
                    if (prodPattern.includes('*')) {
                        // Extract the dynamic part from the current hostname
                        const dynamicPart = this.extractDynamicPart(currentHostname, matchingPattern);
                        if (dynamicPart) {
                            targetHostname = prodPattern.replace('*', dynamicPart);
                        }
                    } else {
                        targetHostname = prodPattern;
                    }
                }
            }
        }
        
        if (targetHostname) {
            const currentUrl = new URL(window.location.href);
            currentUrl.hostname = targetHostname;
            window.open(currentUrl.toString(), '_blank');
        }
    }

    private extractDynamicPart(domain: string, pattern: string): string | null {
        // Convert the pattern to a regex pattern with a capturing group for the wildcard
        const regexPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape special regex chars
            .replace(/\*/g, '(.+)'); // convert * to capturing group
        
        const regex = new RegExp(`^${regexPattern}$`);
        const match = domain.match(regex);
        
        return match ? match[1] : null;
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