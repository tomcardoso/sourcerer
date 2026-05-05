import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const parsed = parsePhoneNumberFromString(trimmed);
  if (parsed?.isValid()) return parsed.format('E.164');
  // Fall back: return as-is if unparseable (e.g. no country code provided)
  return trimmed;
}
