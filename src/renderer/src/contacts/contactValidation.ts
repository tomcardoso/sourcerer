export { validateEmail as isValidEmail, validateUrl as isValidUrl, isGoogleAlertUrl } from '@shared/validation';

// Allowed phone chars: digits, +, -, (, ), ., whitespace, # for US extensions,
// and "ext"/"x" as an extension prefix. Strip any trailing extension first so
// lone letters like 't' or 'ex' inside the number body are still caught.
export function hasDisallowedPhoneChars(raw: string): boolean {
  const stripped = raw.replace(/\s*(?:ext\.?\s*|x)\d+$/i, '');
  return /[^0-9+\-(). \t#]/.test(stripped);
}

// Strip separators so spacing variants of the same number compare equal.
export function normalizePhoneForComparison(raw: string): string {
  return raw.trim().replace(/[\s\-().]/g, '');
}

export const OTHER_LABEL_MAX = 40;

export function sanitizeOtherLabel(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')            // collapse whitespace runs
    // eslint-disable-next-line no-control-regex -- intentionally stripping control characters
    .replace(/[\x00-\x1f\x7f]/g, '')
    .slice(0, OTHER_LABEL_MAX);
}

// Returns the set of keys that appear more than once in the input array.
// Empty strings are ignored.
export function findDuplicates(keys: string[]): Set<string> {
  const seen = new Map<string, number>();
  for (const k of keys) {
    if (!k) continue;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dupes = new Set<string>();
  for (const [k, count] of seen) if (count > 1) dupes.add(k);
  return dupes;
}
