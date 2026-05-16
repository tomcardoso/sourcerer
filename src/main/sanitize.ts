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
  if (parsed?.isValid()) {
    const base = parsed.formatInternational();
    return parsed.ext ? `${base} ext. ${parsed.ext}` : base;
  }
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

export function detectLinkType(url: string): 'linkedin' | 'x' | 'instagram' | 'facebook' | 'website' {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin';
    if (host === 'x.com' || host === 'twitter.com') return 'x';
    if (host === 'instagram.com') return 'instagram';
    if (host === 'facebook.com') return 'facebook';
    return 'website';
  } catch { return 'website'; }
}
