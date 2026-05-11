import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { CountryCode } from 'libphonenumber-js';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function normalizePhone(raw: string, defaultCountry: string = 'US'): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as CountryCode);
  if (parsed?.isValid()) return parsed.formatInternational();
  return null;
}

export function validateUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
