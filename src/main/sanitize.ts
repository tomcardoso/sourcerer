import net from 'net';
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

/**
 * Returns true when the URL's hostname resolves to a private/loopback/link-local
 * address that should be blocked to prevent SSRF.  Uses net.isIP() to classify
 * addresses rather than regular expressions, which avoids bypass variants such as
 * `127.1`, `localhost.` (trailing dot), `0.0.0.0`, and long-form IPv6 loopback.
 *
 * For hostnames (non-IP strings): only `localhost` (exact, case-insensitive,
 * after stripping any trailing dots) is blocked — DNS resolution of other names
 * is left to the OS and is outside the scope of this guard.
 */
export function isBlockedHost(urlStr: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(urlStr).hostname;
  } catch {
    return true;
  }

  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  const ipVersion = net.isIP(hostname);

  if (ipVersion === 4) {
    const parts = hostname.split('.').map(Number);
    const [a, b] = parts;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    return false;
  }

  if (ipVersion === 6) {
    const lower = hostname.toLowerCase();
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
    const firstGroup = parseInt(lower.split(':')[0] || '0', 16);
    if ((firstGroup & 0xfe00) === 0xfc00) return true;
    if ((firstGroup & 0xffc0) === 0xfe80) return true;
    return false;
  }

  return hostname.replace(/\.+$/, '').toLowerCase() === 'localhost';
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
