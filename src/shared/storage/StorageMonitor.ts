/**
 * Monitors localStorage for specific keys and triggers callbacks on changes.
 */

import { platform } from '../platform';

export interface Warning {
    key: string;
    value: string;
    isWarning: boolean;
}

export class StorageMonitor {
    private onWarningsUpdate: (warnings: Warning[]) => void;

    constructor(onWarningsUpdate: (warnings: Warning[]) => void) {
        this.onWarningsUpdate = onWarningsUpdate;
    }

    async checkLocalStorageVariables(): Promise<void> {
        const data = await platform.storage.get(['localStorageKeys']);
        const keys: string[] = data.localStorageKeys || [];
        const warnings: Warning[] = [];

        if (keys.length === 0) return;

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
            this.onWarningsUpdate(warnings);
        }
    }

    setupStorageListener(): void {
        if (platform.injectStorageListener) {
            platform.injectStorageListener(() => {
                this.checkLocalStorageVariables();
            });
        } else {
            window.addEventListener('storage', (e: StorageEvent) => {
                if (e.storageArea === localStorage) {
                    this.checkLocalStorageVariables();
                }
            });
        }
    }
}
