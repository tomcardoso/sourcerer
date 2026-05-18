import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  validateEmail,
  normalizePhone,
  validateUrl,
  detectLinkType,
} from '../main/sanitize';

describe('normalizeEmail', () => {
  it('lowercases the address', () => {
    expect(normalizeEmail('USER@EXAMPLE.COM')).toBe('user@example.com');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeEmail('  foo@bar.com  ')).toBe('foo@bar.com');
  });

  it('returns empty string unchanged', () => {
    expect(normalizeEmail('')).toBe('');
  });

  it('preserves plus-addressing', () => {
    expect(normalizeEmail('User+Tag@Example.COM')).toBe('user+tag@example.com');
  });
});

describe('validateEmail', () => {
  it('accepts a standard address', () => {
    expect(validateEmail('user@example.com')).toBe(true);
  });

  it('accepts plus-addressing', () => {
    expect(validateEmail('user+tag@example.com')).toBe(true);
  });

  it('accepts addresses with trimmed leading/trailing whitespace', () => {
    expect(validateEmail('  user@example.com  ')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(validateEmail('')).toBe(false);
  });

  it('rejects a string with no @', () => {
    expect(validateEmail('notanemail')).toBe(false);
  });

  it('rejects a string with no TLD (dot-less domain)', () => {
    expect(validateEmail('user@host')).toBe(false);
  });

  it('rejects an address with a space before @', () => {
    expect(validateEmail('user @example.com')).toBe(false);
  });

  it('rejects a TLD shorter than 2 characters', () => {
    expect(validateEmail('user@example.c')).toBe(false);
  });

  it('accepts a two-character TLD', () => {
    expect(validateEmail('user@example.ca')).toBe(true);
  });

  it('rejects a whitespace-only string', () => {
    expect(validateEmail('   ')).toBe(false);
  });

  it('rejects a TLD containing digits', () => {
    expect(validateEmail('user@example.org2')).toBe(false);
  });

  it('rejects a local part containing invalid characters', () => {
    expect(validateEmail('user name@example.com')).toBe(false);
    expect(validateEmail('user!@example.com')).toBe(false);
  });

  it('accepts common local-part characters: dots, plus, underscore, hyphen', () => {
    expect(validateEmail('first.last+tag_name-here@example.com')).toBe(true);
  });
});

describe('normalizePhone', () => {
  it('returns null for an empty string', () => {
    expect(normalizePhone('')).toBeNull();
  });

  it('returns null for a whitespace-only string', () => {
    expect(normalizePhone('   ')).toBeNull();
  });

  it('returns null for a non-phone string', () => {
    expect(normalizePhone('not-a-phone')).toBeNull();
  });

  it('parses a valid US number in local format', () => {
    // +1 202 456 1111 — White House main switchboard (publicly listed)
    const result = normalizePhone('+1 202 456 1111', 'US');
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\+1/);
  });

  it('parses a valid UK number', () => {
    const result = normalizePhone('+44 20 7946 0958', 'GB');
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\+44/);
  });

  it('returns E.164-derived international format (contains +)', () => {
    const result = normalizePhone('+12024561111', 'US');
    expect(result).not.toBeNull();
    expect(result!.startsWith('+')).toBe(true);
  });

  it('uses the defaultCountry hint for unambiguous local numbers', () => {
    // A 10-digit North-American number with country code applied
    const withUS = normalizePhone('(202) 456-1111', 'US');
    const withCA = normalizePhone('(416) 555-0100', 'CA');
    expect(withUS).not.toBeNull();
    expect(withCA).not.toBeNull();
  });

  it('preserves an extension in the output', () => {
    const result = normalizePhone('+1 202 456 1111 ext. 567', 'US');
    expect(result).not.toBeNull();
    expect(result).toContain('ext. 567');
  });

  it('parses x-style extension notation', () => {
    const result = normalizePhone('+1 202 456 1111 x567', 'US');
    expect(result).not.toBeNull();
    expect(result).toContain('ext. 567');
  });
});

describe('validateUrl', () => {
  it('accepts an https URL', () => {
    expect(validateUrl('https://example.com')).toBe(true);
  });

  it('accepts an http URL', () => {
    expect(validateUrl('http://example.com')).toBe(true);
  });

  it('rejects ftp protocol', () => {
    expect(validateUrl('ftp://example.com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(validateUrl('')).toBe(false);
  });

  it('rejects a URL without a protocol', () => {
    expect(validateUrl('example.com')).toBe(false);
  });

  it('rejects a whitespace-only string', () => {
    expect(validateUrl('   ')).toBe(false);
  });

  it('rejects javascript: protocol', () => {
    expect(validateUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects a data: URL', () => {
    expect(validateUrl('data:text/html,<h1>hi</h1>')).toBe(false);
  });

  it('accepts a URL with path and query string', () => {
    expect(validateUrl('https://example.com/path?q=1&r=2')).toBe(true);
  });

  it('trims leading/trailing whitespace before validating', () => {
    expect(validateUrl('  https://example.com  ')).toBe(true);
  });

  it('rejects a URL with an internal space', () => {
    expect(validateUrl('https://example.com/path with spaces')).toBe(false);
  });
});

describe('detectLinkType', () => {
  it('detects linkedin.com', () => {
    expect(detectLinkType('https://linkedin.com/in/someone')).toBe('linkedin');
  });

  it('detects linkedin.com with www prefix', () => {
    expect(detectLinkType('https://www.linkedin.com/in/someone')).toBe('linkedin');
  });

  it('detects linkedin subdomains', () => {
    expect(detectLinkType('https://ca.linkedin.com/in/someone')).toBe('linkedin');
  });

  it('detects x.com', () => {
    expect(detectLinkType('https://x.com/someone')).toBe('x');
  });

  it('detects twitter.com', () => {
    expect(detectLinkType('https://twitter.com/someone')).toBe('x');
  });

  it('detects mobile.twitter.com', () => {
    expect(detectLinkType('https://mobile.twitter.com/someone')).toBe('x');
  });

  it('detects instagram.com', () => {
    expect(detectLinkType('https://instagram.com/someone')).toBe('instagram');
  });

  it('detects instagram subdomains', () => {
    expect(detectLinkType('https://www.instagram.com/someone')).toBe('instagram');
  });

  it('detects facebook.com', () => {
    expect(detectLinkType('https://facebook.com/someone')).toBe('facebook');
  });

  it('detects m.facebook.com', () => {
    expect(detectLinkType('https://m.facebook.com/someone')).toBe('facebook');
  });

  it('returns website for an arbitrary URL', () => {
    expect(detectLinkType('https://example.com')).toBe('website');
  });

  it('returns website for a malformed URL', () => {
    expect(detectLinkType('not a url')).toBe('website');
  });
});
