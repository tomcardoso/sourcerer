import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { CountryCode } from 'libphonenumber-js';
export { validateEmail, validateUrl } from '@shared/validation';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizePhone(raw: string, defaultCountry: string = 'US'): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as CountryCode);
  if (parsed?.isValid()) {
    return parsed.formatInternational();
  }
  return null;
}

export function detectLinkType(url: string): 'linkedin' | 'x' | 'instagram' | 'facebook' | 'website' {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host === 'linkedin.com'  || host.endsWith('.linkedin.com'))  return 'linkedin';
    if (host === 'x.com'         || host.endsWith('.x.com')
     || host === 'twitter.com'   || host.endsWith('.twitter.com'))   return 'x';
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
    if (host === 'facebook.com'  || host.endsWith('.facebook.com'))  return 'facebook';
    return 'website';
  } catch { return 'website'; }
}
