import { describe, expect, it } from 'vitest';
import {
  clampBannerSize,
  isBannerPosition,
  normalizeHostPattern,
  validateTrackedKey,
  parseHostList,
  validateGroup,
  validateHostPattern,
} from './validation';

describe('normalizeHostPattern', () => {
  it('reduces a full URL to its hostname', () => {
    expect(normalizeHostPattern('https://app.example.com/login?next=/x#top')).toBe(
      'app.example.com',
    );
  });

  it('strips scheme, port, userinfo and trailing dots', () => {
    expect(normalizeHostPattern('http://example.com:8443')).toBe('example.com');
    expect(normalizeHostPattern('https://user:pass@example.com')).toBe('example.com');
    expect(normalizeHostPattern('example.com.')).toBe('example.com');
  });

  it('lower-cases and trims', () => {
    expect(normalizeHostPattern('  APP.Example.COM  ')).toBe('app.example.com');
  });

  it('leaves a bare hostname pattern untouched', () => {
    expect(normalizeHostPattern('*.example.com')).toBe('*.example.com');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeHostPattern('   ')).toBe('');
  });
});

describe('validateHostPattern', () => {
  it('accepts hostnames and wildcard patterns', () => {
    expect(validateHostPattern('example.com')).toEqual({ ok: true, value: 'example.com' });
    expect(validateHostPattern('*.example.com')).toEqual({ ok: true, value: '*.example.com' });
    expect(validateHostPattern('localhost')).toEqual({ ok: true, value: 'localhost' });
    expect(validateHostPattern('dev-1.example.com')).toEqual({
      ok: true,
      value: 'dev-1.example.com',
    });
  });

  it('normalizes before validating', () => {
    expect(validateHostPattern('HTTPS://App.Example.com/x')).toEqual({
      ok: true,
      value: 'app.example.com',
    });
  });

  it('rejects an empty hostname', () => {
    expect(validateHostPattern('')).toMatchObject({ ok: false });
  });

  it('rejects a bare wildcard, which would match every site', () => {
    expect(validateHostPattern('*')).toMatchObject({ ok: false });
  });

  it('rejects malformed hostnames', () => {
    expect(validateHostPattern('two words')).toMatchObject({ ok: false });
    expect(validateHostPattern('exa mple.com')).toMatchObject({ ok: false });
    expect(validateHostPattern('..')).toMatchObject({ ok: false });
  });
});

describe('parseHostList', () => {
  it('splits on commas, whitespace and newlines', () => {
    expect(parseHostList('a.example.com, b.example.com\nc.example.com  d.example.com')).toEqual([
      'a.example.com',
      'b.example.com',
      'c.example.com',
      'd.example.com',
    ]);
  });

  it('drops empty entries and trailing separators', () => {
    expect(parseHostList(' a.example.com ,, , ')).toEqual(['a.example.com']);
    expect(parseHostList('   ')).toEqual([]);
  });
});

describe('validateGroup', () => {
  it('accepts one production host with several stands', () => {
    expect(validateGroup('example.com', ['dev.example.com', 'staging.example.com'])).toEqual({
      ok: true,
      value: {
        production: 'example.com',
        development: ['dev.example.com', 'staging.example.com'],
      },
    });
  });

  it('normalizes every host', () => {
    expect(validateGroup('HTTPS://Example.com/x', ['http://Dev.Example.com:8443/'])).toEqual({
      ok: true,
      value: { production: 'example.com', development: ['dev.example.com'] },
    });
  });

  it('requires at least one non-production host', () => {
    expect(validateGroup('example.com', [])).toMatchObject({ ok: false });
  });

  it('rejects a stand that repeats the production host', () => {
    const result = validateGroup('example.com', ['example.com']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('already the production host');
  });

  it('drops duplicate stands rather than failing', () => {
    expect(validateGroup('example.com', ['dev.example.com', 'dev.example.com'])).toEqual({
      ok: true,
      value: { production: 'example.com', development: ['dev.example.com'] },
    });
  });

  it('allows a stand to match the production wildcard count', () => {
    expect(
      validateGroup('*.example.com', ['*.dev.example.com', '*.staging.example.com']),
    ).toMatchObject({ ok: true });
  });

  it('allows a fixed host paired with a wildcarded one on either side', () => {
    // Fixed production, wildcarded stand — switching only works stand -> production.
    expect(validateGroup('example.com', ['*.dev.example.com'])).toMatchObject({ ok: true });
    // Wildcarded production, fixed stand — switching only works production -> stand.
    expect(validateGroup('*.example.com', ['dev.example.com'])).toMatchObject({ ok: true });
    // Mixing a matching wildcard count with a fixed host in the same group.
    expect(
      validateGroup('*.example.com', ['*.dev.example.com', 'staging.example.com']),
    ).toMatchObject({ ok: true });
  });

  it('rejects two different nonzero wildcard counts, which translate neither way', () => {
    expect(validateGroup('*.example.com', ['*.*.dev.example.com'])).toMatchObject({ ok: false });
  });

  it('reports which side is invalid', () => {
    const result = validateGroup('', ['dev.example.com']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Production');
  });
});

describe('clampBannerSize', () => {
  it('keeps sizes within bounds', () => {
    expect(clampBannerSize(50, 50)).toBe(50);
    expect(clampBannerSize(5, 50)).toBe(20);
    expect(clampBannerSize(5000, 50)).toBe(200);
  });

  it('parses numeric strings and falls back on garbage', () => {
    expect(clampBannerSize('100', 50)).toBe(100);
    expect(clampBannerSize('nonsense', 50)).toBe(50);
    expect(clampBannerSize(undefined, 50)).toBe(50);
    expect(clampBannerSize(null, 30)).toBe(30);
  });
});

describe('isBannerPosition', () => {
  it('accepts only the two known positions', () => {
    expect(isBannerPosition('top')).toBe(true);
    expect(isBannerPosition('bottom')).toBe(true);
    expect(isBannerPosition('middle')).toBe(false);
    expect(isBannerPosition(undefined)).toBe(false);
  });
});

describe('validateTrackedKey', () => {
  it('normalizes the key and its hosts', () => {
    const result = validateTrackedKey('  use-prod-db ', ['https://Dev.Example.com/x'], 'true');
    expect(result).toEqual({
      ok: true,
      value: { key: 'use-prod-db', hosts: ['dev.example.com'], value: 'true' },
    });
  });

  it('accepts no hosts at all, which means every configured host', () => {
    const result = validateTrackedKey('flag', [], '1');
    expect(result).toMatchObject({ ok: true, value: { hosts: [] } });
  });

  it('rejects an empty key name', () => {
    expect(validateTrackedKey('   ', [], '1')).toMatchObject({ ok: false });
  });

  it('rejects a host that is not a hostname pattern', () => {
    const result = validateTrackedKey('flag', ['not a host'], '1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('flag');
  });

  it('takes wildcard hosts without demanding they line up with anything', () => {
    // Unlike a group's hosts, these are never translated into one another, so the
    // wildcard counting that validateGroup enforces has nothing to say here.
    const result = validateTrackedKey('flag', ['*.dev.example.com', 'app.example.com'], '1');
    expect(result).toMatchObject({
      ok: true,
      value: { hosts: ['*.dev.example.com', 'app.example.com'] },
    });
  });

  it('drops a repeated host rather than refusing the row', () => {
    const result = validateTrackedKey('flag', ['dev.example.com', 'dev.example.com'], '1');
    expect(result).toMatchObject({ ok: true, value: { hosts: ['dev.example.com'] } });
  });

  it('coerces a value the banner could not write, keeping the key', () => {
    // The options page only offers the four; this fires on a hand-edited import.
    expect(validateTrackedKey('flag', [], 'staging')).toMatchObject({
      ok: true,
      value: { value: '1' },
    });
    expect(validateTrackedKey('flag', [], undefined)).toMatchObject({
      ok: true,
      value: { value: '1' },
    });
  });
});
