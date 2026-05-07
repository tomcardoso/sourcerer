import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { CountryCode } from 'libphonenumber-js';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizePhone(raw: string, defaultCountry: string = 'US'): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as CountryCode);
  if (parsed?.isValid()) return parsed.formatInternational();
  // Fall back: return trimmed as-is if still unparseable
  return trimmed;
}
