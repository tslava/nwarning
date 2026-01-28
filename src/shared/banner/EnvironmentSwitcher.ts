/**
 * Handles environment switching logic between production and development URLs.
 */

import { platform } from '../platform';
import { matchDomainPattern, extractDynamicPart } from '../utils/patterns';

export class EnvironmentSwitcher {
    private isProduction: boolean;

    constructor(isProduction: boolean) {
        this.isProduction = isProduction;
    }

    async switchEnvironment(): Promise<void> {
        const data = await platform.storage.get(['productionSites', 'developmentSites']);
        const currentHostname = window.location.hostname;

        const productionSites: string[] = data.productionSites || [];
        const developmentSites: string[] = data.developmentSites || [];

        const targetHostname = this.calculateTargetHostname(
            currentHostname,
            productionSites,
            developmentSites
        );

        if (targetHostname) {
            const currentUrl = new URL(window.location.href);
            currentUrl.hostname = targetHostname;
            window.open(currentUrl.toString(), '_blank');
        }
    }

    private calculateTargetHostname(
        currentHostname: string,
        productionSites: string[],
        developmentSites: string[]
    ): string | null {
        if (this.isProduction) {
            return this.findTargetFromPattern(
                currentHostname,
                productionSites,
                developmentSites
            );
        } else {
            return this.findTargetFromPattern(
                currentHostname,
                developmentSites,
                productionSites
            );
        }
    }

    private findTargetFromPattern(
        currentHostname: string,
        sourcePatterns: string[],
        targetPatterns: string[]
    ): string | null {
        const matchingPattern = sourcePatterns.find(pattern =>
            matchDomainPattern(currentHostname, pattern)
        );

        if (!matchingPattern) return null;

        const index = sourcePatterns.indexOf(matchingPattern);
        if (index === -1 || index >= targetPatterns.length) return null;

        const targetPattern = targetPatterns[index];

        if (targetPattern.includes('*')) {
            const dynamicPart = extractDynamicPart(currentHostname, matchingPattern);
            if (dynamicPart) {
                return targetPattern.replace('*', dynamicPart);
            }
        }

        return targetPattern;
    }
}
