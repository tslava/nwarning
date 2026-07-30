import { describe, expect, it } from 'vitest';
import {
  applyWildcards,
  countWildcards,
  extractWildcards,
  findMatchingPattern,
  matchDomainPattern,
  translateHostname,
} from './patterns';

describe('matchDomainPattern', () => {
  it('matches an exact hostname', () => {
    expect(matchDomainPattern('example.com', 'example.com')).toBe(true);
    expect(matchDomainPattern('other.com', 'example.com')).toBe(false);
  });

  it('treats dots as literals', () => {
    expect(matchDomainPattern('aXexample.com', 'a.example.com')).toBe(false);
  });

  it('matches a wildcard against exactly one label', () => {
    expect(matchDomainPattern('app.example.com', '*.example.com')).toBe(true);
    // A bare domain has no label for the wildcard to consume.
    expect(matchDomainPattern('example.com', '*.example.com')).toBe(false);
    // The wildcard must not swallow a dot, which the old `.*` translation did.
    expect(matchDomainPattern('a.b.example.com', '*.example.com')).toBe(false);
  });

  it('supports several wildcards', () => {
    expect(matchDomainPattern('a.b.example.com', '*.*.example.com')).toBe(true);
    expect(matchDomainPattern('a.example.com', '*.*.example.com')).toBe(false);
  });

  it('does not match empty input', () => {
    expect(matchDomainPattern('', 'example.com')).toBe(false);
    expect(matchDomainPattern('example.com', '')).toBe(false);
  });
});

describe('findMatchingPattern', () => {
  it('returns the first matching pattern', () => {
    expect(findMatchingPattern('app.example.com', ['other.com', '*.example.com'])).toBe(
      '*.example.com',
    );
    expect(findMatchingPattern('app.example.com', ['other.com'])).toBeUndefined();
  });
});

describe('countWildcards', () => {
  it('counts wildcards', () => {
    expect(countWildcards('example.com')).toBe(0);
    expect(countWildcards('*.example.com')).toBe(1);
    expect(countWildcards('*.*.example.com')).toBe(2);
  });
});

describe('extractWildcards', () => {
  it('captures each wildcard in order', () => {
    expect(extractWildcards('a.b.example.com', '*.*.example.com')).toEqual(['a', 'b']);
  });

  it('returns null when the hostname does not match', () => {
    expect(extractWildcards('example.com', '*.example.com')).toBeNull();
  });

  it('returns an empty list for a pattern without wildcards', () => {
    expect(extractWildcards('example.com', 'example.com')).toEqual([]);
  });
});

describe('applyWildcards', () => {
  it('substitutes values in order', () => {
    expect(applyWildcards('*.*.dev.example.com', ['a', 'b'])).toBe('a.b.dev.example.com');
  });

  it('refuses to guess when the counts disagree', () => {
    expect(applyWildcards('*.dev.example.com', ['a', 'b'])).toBeNull();
    expect(applyWildcards('*.*.dev.example.com', ['a'])).toBeNull();
  });
});

describe('translateHostname', () => {
  it('preserves what the wildcard matched', () => {
    expect(
      translateHostname(
        'app.production.example.com',
        '*.production.example.com',
        '*.dev.example.com',
      ),
    ).toBe('app.dev.example.com');
  });

  it('preserves several wildcards', () => {
    expect(translateHostname('a.b.example.com', '*.*.example.com', '*.*.dev.example.com')).toBe(
      'a.b.dev.example.com',
    );
  });

  it('returns a fixed target as-is', () => {
    expect(translateHostname('example.com', 'example.com', 'dev.example.com')).toBe(
      'dev.example.com',
    );
  });

  it('returns null when the hostname does not match the source', () => {
    expect(translateHostname('other.com', 'example.com', 'dev.example.com')).toBeNull();
    expect(translateHostname('example.com', '*.example.com', '*.dev.example.com')).toBeNull();
  });
});
