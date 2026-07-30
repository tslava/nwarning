/**
 * Hostname pattern matching.
 *
 * A pattern is a hostname where `*` stands for exactly one label — one or more
 * characters that are not a dot. So `*.example.com` matches `app.example.com`
 * but not `example.com` and not `a.b.example.com`; write `*.*.example.com` for
 * the latter. Keeping a wildcard to a single label makes matching predictable
 * and lets prod/dev patterns be paired up wildcard-for-wildcard.
 */

const WILDCARD = '*';
const LABEL = '[^.]+';

function escapeRegex(literal: string): string {
  return literal.replace(/[.+?^${}()|[\]\\*]/g, '\\$&');
}

function patternToRegex(pattern: string, capture: boolean): RegExp {
  const body = pattern
    .split(WILDCARD)
    .map(escapeRegex)
    .join(capture ? `(${LABEL})` : LABEL);
  return new RegExp(`^${body}$`);
}

/** Number of wildcards in a pattern. */
export function countWildcards(pattern: string): number {
  return pattern.split(WILDCARD).length - 1;
}

/** Whether a hostname matches a pattern. */
export function matchDomainPattern(domain: string, pattern: string): boolean {
  if (!domain || !pattern) return false;
  return patternToRegex(pattern, false).test(domain);
}

/** First pattern in the list that the hostname matches, if any. */
export function findMatchingPattern(domain: string, patterns: string[]): string | undefined {
  return patterns.find((pattern) => matchDomainPattern(domain, pattern));
}

/**
 * Labels captured by each wildcard, in order, or null when the hostname does
 * not match the pattern.
 */
export function extractWildcards(domain: string, pattern: string): string[] | null {
  const match = domain.match(patternToRegex(pattern, true));
  return match ? match.slice(1) : null;
}

/**
 * Substitute captured labels back into a pattern's wildcards, in order.
 * Returns null when the counts do not line up, since guessing would produce a
 * hostname the user never configured.
 */
export function applyWildcards(pattern: string, values: string[]): string | null {
  if (countWildcards(pattern) !== values.length) return null;
  let index = 0;
  return pattern.replace(/\*/g, () => values[index++]);
}

/**
 * Translate a hostname from one pattern to another, preserving whatever the
 * wildcards matched. Returns null when the hostname does not match `from`, or
 * when the two patterns have a different number of wildcards.
 */
export function translateHostname(hostname: string, from: string, to: string): string | null {
  if (countWildcards(to) === 0) {
    return matchDomainPattern(hostname, from) ? to : null;
  }
  const captured = extractWildcards(hostname, from);
  if (!captured) return null;
  return applyWildcards(to, captured);
}
