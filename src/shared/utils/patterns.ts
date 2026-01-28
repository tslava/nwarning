/**
 * Utility functions for domain pattern matching with wildcard support.
 */

/**
 * Check if a domain matches a pattern (supports * wildcards).
 * @param domain - The domain to test (e.g., "app.example.com")
 * @param pattern - The pattern to match against (e.g., "*.example.com")
 * @returns true if the domain matches the pattern
 */
export function matchDomainPattern(domain: string, pattern: string): boolean {
    const regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(domain);
}

/**
 * Find if a domain matches any pattern in a list.
 * @param domain - The domain to test
 * @param patterns - Array of patterns to match against
 * @returns true if the domain matches any pattern
 */
export function findMatchingPattern(domain: string, patterns: string[]): string | undefined {
    return patterns.find(pattern => matchDomainPattern(domain, pattern));
}

/**
 * Extract the dynamic part of a domain that matches a wildcard in the pattern.
 * @param domain - The domain (e.g., "staging.example.com")
 * @param pattern - The pattern with wildcard (e.g., "*.example.com")
 * @returns The matched wildcard portion (e.g., "staging") or null if no match
 */
export function extractDynamicPart(domain: string, pattern: string): string | null {
    const regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '(.+)');

    const regex = new RegExp(`^${regexPattern}$`);
    const match = domain.match(regex);

    return match ? match[1] : null;
}
