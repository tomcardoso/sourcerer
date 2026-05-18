export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

export function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// Allowed phone chars: digits, +, -, (, ), ., whitespace, and extension
// notation letters (e, x, t for "ext", # for US-style extensions).
export function hasDisallowedPhoneChars(raw: string): boolean {
  return /[^0-9+\-(). \t#extEXT]/.test(raw);
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
    .replace(/[\x00-\x1f\x7f]/g, '') // strip control characters
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
