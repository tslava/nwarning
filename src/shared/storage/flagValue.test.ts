import { describe, expect, it } from 'vitest';
import { looksEnabled, nextFlagValue } from './flagValue';

describe('looksEnabled', () => {
  it('treats only 1 and true as switched on, by the common convention', () => {
    expect(['1', 'true', 'TRUE', ' 1 ', 'True'].every(looksEnabled)).toBe(true);
    expect(['0', 'false', 'no', 'off', 'staging', '2', ''].some(looksEnabled)).toBe(false);
  });
});

describe('nextFlagValue', () => {
  it('flips 1 and 0', () => {
    expect(nextFlagValue('1')).toBe('0');
    expect(nextFlagValue('0')).toBe('1');
  });

  it('flips true and false, keeping the spelling it found', () => {
    expect(nextFlagValue('true')).toBe('false');
    expect(nextFlagValue('false')).toBe('true');
    expect(nextFlagValue('TRUE')).toBe('FALSE');
    expect(nextFlagValue('True')).toBe('False');
  });

  it('ignores surrounding whitespace but does not reproduce it', () => {
    expect(nextFlagValue(' 1 ')).toBe('0');
    expect(nextFlagValue('\ttrue\n')).toBe('false');
  });

  it('turns the flag on when there is nothing stored to lose', () => {
    expect(nextFlagValue(null)).toBe('1');
    expect(nextFlagValue('')).toBe('1');
    expect(nextFlagValue('   ')).toBe('1');
  });

  it('refuses to flip a value that is not a plain on/off flag', () => {
    // These are somebody's actual configuration. A click that overwrote them
    // could not be undone — localStorage keeps no history.
    for (const value of ['staging', '2', 'yes', 'on', 'production', '{"env":"prod"}', 'null']) {
      expect(nextFlagValue(value)).toBeNull();
    }
  });

  it('never has to choose a direction for a value it cannot flip', () => {
    // The colour rule and the flip rule have to agree: anything unrecognised
    // reads as off, so "cannot flip" never collides with "would flip on".
    for (const value of ['staging', '2', 'yes', '{"env":"prod"}']) {
      expect(nextFlagValue(value)).toBeNull();
      expect(looksEnabled(value)).toBe(false);
    }
  });
});
