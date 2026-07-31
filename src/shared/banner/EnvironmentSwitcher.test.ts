import { describe, expect, it } from 'vitest';
import { EnvironmentSwitcher } from './EnvironmentSwitcher';
import { matchEnvironment } from '../utils/environment';
import type { EnvironmentGroup } from '../config/schema';

const GROUP: EnvironmentGroup = {
  production: 'app.example.com',
  development: ['dev.example.com', 'staging.example.com'],
};

function switcherFor(hostname: string, groups: EnvironmentGroup[] = [GROUP]) {
  const match = matchEnvironment(groups, hostname);
  if (!match) throw new Error(`no environment matched ${hostname}`);
  return new EnvironmentSwitcher(match);
}

function hostnames(url: string, hostname: string, groups?: EnvironmentGroup[]): string[] {
  return switcherFor(hostname, groups)
    .resolveTargets(url)
    .map((target) => target.hostname);
}

describe('matchEnvironment', () => {
  it('recognises the production host', () => {
    expect(matchEnvironment([GROUP], 'app.example.com')).toMatchObject({
      environment: 'production',
      pattern: 'app.example.com',
    });
  });

  it('recognises each stand and reports which pattern matched', () => {
    expect(matchEnvironment([GROUP], 'staging.example.com')).toMatchObject({
      environment: 'development',
      pattern: 'staging.example.com',
    });
  });

  it('returns null for an unrelated host', () => {
    expect(matchEnvironment([GROUP], 'example.com')).toBeNull();
  });

  it('prefers production when a host somehow matches both sides', () => {
    const overlapping: EnvironmentGroup = {
      production: 'app.example.com',
      development: ['*.example.com'],
    };
    expect(matchEnvironment([overlapping], 'app.example.com')).toMatchObject({
      environment: 'production',
    });
  });
});

describe('EnvironmentSwitcher.resolveTargets', () => {
  it('offers every stand when on production', () => {
    expect(hostnames('https://app.example.com/devices?page=2', 'app.example.com')).toEqual([
      'dev.example.com',
      'staging.example.com',
    ]);
  });

  it('offers production first, then the other stands, when on a stand', () => {
    expect(hostnames('https://dev.example.com/', 'dev.example.com')).toEqual([
      'app.example.com',
      'staging.example.com',
    ]);
  });

  it('never offers the host you are already on', () => {
    expect(hostnames('https://staging.example.com/', 'staging.example.com')).not.toContain(
      'staging.example.com',
    );
  });

  it('keeps the path, query and hash', () => {
    const [target] = switcherFor('app.example.com').resolveTargets(
      'https://app.example.com/devices?page=2#row-7',
    );
    expect(target.url).toBe('https://dev.example.com/devices?page=2#row-7');
  });

  it('marks which target is production', () => {
    const targets = switcherFor('dev.example.com').resolveTargets('https://dev.example.com/');
    expect(targets.map((target) => target.isProduction)).toEqual([true, false]);
  });

  it('carries the wildcard label across every stand', () => {
    const wildcard: EnvironmentGroup = {
      production: '*.prod.example.com',
      development: ['*.dev.example.com', '*.qa.example.com'],
    };
    expect(hostnames('https://app.prod.example.com/x', 'app.prod.example.com', [wildcard])).toEqual(
      ['app.dev.example.com', 'app.qa.example.com'],
    );
  });

  it('preserves a non-default port', () => {
    const local: EnvironmentGroup = {
      production: 'example.com',
      development: ['localhost'],
    };
    const [target] = switcherFor('example.com', [local]).resolveTargets(
      'https://example.com:8443/x',
    );
    expect(target.url).toBe('https://localhost:8443/x');
  });
});
