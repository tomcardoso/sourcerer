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

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  const [a, b] = parts;
  if (a === 127) return true;                            // loopback
  if (a === 10) return true;                             // RFC 1918
  if (a === 172 && b >= 16 && b <= 31) return true;     // RFC 1918
  if (a === 192 && b === 168) return true;               // RFC 1918
  if (a === 169 && b === 254) return true;               // link-local
  if (a === 100 && b >= 64 && b <= 127) return true;    // CGNAT RFC 6598
  if (a === 0) return true;                              // "this" network
  return false;
}

/**
 * Returns true when the URL's hostname is a private/loopback/link-local
 * IP address that should be blocked to prevent SSRF.  Uses net.isIP() to
 * classify literal IP addresses; for non-IP hostnames only `localhost` is
 * blocked — no DNS resolution is performed.
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

  // Strip trailing dots — net.isIP() rejects "127.0.0.1." even though some
  // URL parsers accept it, allowing a bypass without this strip.
  hostname = hostname.replace(/\.+$/, '');

  const ipVersion = net.isIP(hostname);

  if (ipVersion === 4) {
    return isPrivateIPv4(hostname);
  }

  if (ipVersion === 6) {
    const lower = hostname.toLowerCase();
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
    // IPv4-mapped IPv6: handles both dotted-quad (::ffff:127.0.0.1) and the
    // hex-pairs form the WHATWG URL parser produces (::ffff:7f00:1).
    if (lower.startsWith('::ffff:')) {
      const embedded = lower.slice(7);
      if (net.isIP(embedded) === 4) return isPrivateIPv4(embedded);
      const hexParts = embedded.split(':');
      if (hexParts.length === 2) {
        const hi = parseInt(hexParts[0], 16);
        const lo = parseInt(hexParts[1], 16);
        if (!isNaN(hi) && !isNaN(lo)) {
          const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
          return isPrivateIPv4(ipv4);
        }
      }
    }
    const firstGroup = parseInt(lower.split(':')[0] || '0', 16);
    if ((firstGroup & 0xfe00) === 0xfc00) return true;   // ULA fc00::/7
    if ((firstGroup & 0xffc0) === 0xfe80) return true;   // link-local fe80::/10
    return false;
  }

  return hostname.toLowerCase() === 'localhost';
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
