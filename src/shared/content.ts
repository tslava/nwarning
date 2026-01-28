import { platform } from './platform';
import { BannerRenderer, BannerPositioner, EnvironmentSwitcher } from './banner';
import { StorageMonitor, Warning } from './storage/StorageMonitor';
import { matchDomainPattern } from './utils/patterns';

class EnvironmentBanner {
    private renderer: BannerRenderer | null = null;
    private positioner: BannerPositioner | null = null;
    private switcher: EnvironmentSwitcher | null = null;
    private storageMonitor: StorageMonitor;

    private isProduction: boolean = false;
    private bannerSize: number = 50;
    private bannerPosition: 'top' | 'bottom' = 'top';
    private extensionEnabled: boolean = true;

    constructor() {
        this.storageMonitor = new StorageMonitor((warnings) => this.displayWarnings(warnings));
        this.setupMessageListener();
        this.loadStateAndCheckEnvironment();
        this.storageMonitor.checkLocalStorageVariables();
        this.storageMonitor.setupStorageListener();
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
        const productionSites: string[] = data.productionSites || [];
        const developmentSites: string[] = data.developmentSites || [];

        this.isProduction = productionSites.some(pattern => matchDomainPattern(currentHostname, pattern));
        const isDevelopment = developmentSites.some(pattern => matchDomainPattern(currentHostname, pattern));

        if (this.isProduction || isDevelopment) {
            this.bannerSize = this.isProduction ? (data.prodSize || 50) : (data.devSize || 50);
            this.createBanner();
        }
    }

    private createBanner(): void {
        if (this.renderer || !this.extensionEnabled) return;

        this.switcher = new EnvironmentSwitcher(this.isProduction);

        this.renderer = new BannerRenderer({
            isProduction: this.isProduction,
            bannerSize: this.bannerSize,
            bannerPosition: this.bannerPosition,
            onSwitchEnvironment: () => this.switcher?.switchEnvironment()
        });

        const elements = this.renderer.create();
        if (!elements) return;

        this.positioner = new BannerPositioner(
            elements.wrapper,
            this.bannerSize,
            this.bannerPosition
        );
        this.positioner.insertAndAdjustLayout();
    }

    private removeBanner(): void {
        if (this.positioner) {
            this.positioner.cleanup();
            this.positioner = null;
        }
        if (this.renderer) {
            this.renderer.destroy();
            this.renderer = null;
        }
        this.switcher = null;
    }

    private displayWarnings(warnings: Warning[]): void {
        this.renderer?.displayWarnings(warnings);
    }

    private setupMessageListener(): void {
        platform.onMessage.addListener(async (message: { command: string }) => {
            if (message.command === 'toggle-environment') {
                this.switcher?.switchEnvironment();
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

new EnvironmentBanner();
