/**
 * How a tracked localStorage flag's value is read, and what a click writes.
 *
 * Both rules live here because they have to agree: the chip's colour and the
 * direction of the flip are the same statement about one value, and they were
 * never allowed to drift apart.
 */

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
 * Only two vocabularies are recognised, `1`/`0` and `true`/`false`, because those
 * are what an app that parses such a flag actually understands. Anything else —
 * `staging`, `2`, a JSON blob, a value some other tool owns — is left alone: it is
 * real configuration, one click must not throw it away, and localStorage keeps no
 * history to undo it from. `×` remains the way out of those, where the user is
 * plainly asking for the value to go.
 *
 * An absent or empty value flips on. Absent means the app falls back to how it was
 * built, so there is nothing to lose, and turning the flag on is the only flip
 * that means anything from there.
 *
 * Note that an unrecognised value never reads as on under `looksEnabled`, so this
 * never has to decide which way to flip one.
 */
export function nextFlagValue(value: string | null): string | null {
  if (value === null || value.trim() === '') return '1';

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
