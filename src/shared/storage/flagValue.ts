/**
 * How a tracked localStorage flag's value is read, and what a click writes.
 *
 * Both rules live here because they have to agree: the chip's colour and the
 * direction of the flip are the same statement about one value, and they were
 * never allowed to drift apart.
 */

/**
 * The values the banner is allowed to write, and the only ones the options page
 * offers as a key's assign value.
 *
 * Two vocabularies, because those are what an app that parses such a flag
 * actually understands, and `1` versus `true` is not interchangeable in every
 * front end. Keeping the list here rather than in the options page means the
 * value a key is configured with is drawn from the same vocabulary a click
 * flips within, so a configured value can never be one `nextFlagValue` would
 * then refuse to touch.
 */
export const ASSIGNABLE_VALUES = ['1', '0', 'true', 'false'] as const;

export type AssignableValue = (typeof ASSIGNABLE_VALUES)[number];

/** What an unconfigured key writes: turning a flag on is the useful direction. */
export const DEFAULT_ASSIGN_VALUE: AssignableValue = '1';

export function isAssignableValue(value: unknown): value is AssignableValue {
  return typeof value === 'string' && (ASSIGNABLE_VALUES as readonly string[]).includes(value);
}

/**
 * Value reads as "switched on". The `'1'` / `'true'` rule is the common
 * convention for such flags, so a flag shown as on here is on in the app too.
 */
export function looksEnabled(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

/**
 * The value a click on the chip should write, or `null` when the stored value is
 * not something this can flip.
 *
 * `whenUnset` is the key's configured assign value, used when there is nothing
 * stored — that is the case where the click is an assignment rather than a flip,
 * and the two directions have to come from one function so the chip's label and
 * what the write does can never disagree.
 *
 * Only two vocabularies are recognised, `1`/`0` and `true`/`false`, because those
 * are what an app that parses such a flag actually understands. Anything else —
 * `staging`, `2`, a JSON blob, a value some other tool owns — is left alone: it is
 * real configuration, one click must not throw it away, and localStorage keeps no
 * history to undo it from. Devtools is the way out of such a value; the banner has
 * no control that removes one.
 *
 * An absent or empty value takes `whenUnset`. Absent means the app falls back to
 * how it was built, so there is nothing to lose by writing, and this is what makes
 * a key that a host is supposed to have assignable from the banner at all.
 *
 * Note that an unrecognised value never reads as on under `looksEnabled`, so this
 * never has to decide which way to flip one.
 */
export function nextFlagValue(
  value: string | null,
  whenUnset: string = DEFAULT_ASSIGN_VALUE,
): string | null {
  if (value === null || value.trim() === '') return whenUnset;

  switch (value.trim().toLowerCase()) {
    case '1':
      return '0';
    case '0':
      return '1';
    case 'true':
      return matchCase(value, 'false');
    case 'false':
      return matchCase(value, 'true');
    default:
      return null;
  }
}

/**
 * Keep `TRUE` / `True` spelled the way whoever wrote it spelled it. A front end
 * comparing against a literal is rare but costs nothing to respect, and a click
 * that silently changes the casing of a value the user did not ask about reads as
 * the extension mangling their data.
 */
function matchCase(original: string, word: string): string {
  const trimmed = original.trim();
  if (trimmed === trimmed.toUpperCase()) return word.toUpperCase();
  if (trimmed[0] === trimmed[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}
