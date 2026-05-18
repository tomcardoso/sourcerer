import { describe, it, expect } from 'vitest';
import {
  hasDisallowedPhoneChars,
  normalizePhoneForComparison,
  sanitizeOtherLabel,
  OTHER_LABEL_MAX,
  findDuplicates,
} from '../renderer/src/contacts/contactValidation';

describe('hasDisallowedPhoneChars', () => {
  it('accepts digits', () => {
    expect(hasDisallowedPhoneChars('1234567890')).toBe(false);
  });

  it('accepts common formatting chars: +, -, (, ), ., space', () => {
    expect(hasDisallowedPhoneChars('+1 (202) 456-1111')).toBe(false);
  });

  it('accepts extension notation: ext, x, #', () => {
    expect(hasDisallowedPhoneChars('+1 202 456 1111 ext 567')).toBe(false);
    expect(hasDisallowedPhoneChars('+1 202 456 1111 x567')).toBe(false);
    expect(hasDisallowedPhoneChars('+1 202 456 1111 #567')).toBe(false);
  });

  it('rejects letters outside extension notation', () => {
    expect(hasDisallowedPhoneChars('555-CALL-NOW')).toBe(true);
    expect(hasDisallowedPhoneChars('555-text')).toBe(true);
  });

  it('rejects @', () => {
    expect(hasDisallowedPhoneChars('555@1234')).toBe(true);
  });

  it('returns false for an empty string (no chars to disallow)', () => {
    expect(hasDisallowedPhoneChars('')).toBe(false);
  });
});

describe('normalizePhoneForComparison', () => {
  it('strips spaces, dashes, parentheses, and dots', () => {
    expect(normalizePhoneForComparison('+1 (202) 456-1111')).toBe('+12024561111');
  });

  it('treats spacing variants of the same number as equal', () => {
    const a = normalizePhoneForComparison('+12024561111');
    const b = normalizePhoneForComparison('+1 202 456 1111');
    expect(a).toBe(b);
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizePhoneForComparison('  +1234  ')).toBe('+1234');
  });

  it('preserves extension chars that are not separators', () => {
    expect(normalizePhoneForComparison('+1 202 456 1111 ext567')).toBe('+12024561111ext567');
  });
});

describe('sanitizeOtherLabel', () => {
  it('trims leading and trailing whitespace', () => {
    expect(sanitizeOtherLabel('  Signal  ')).toBe('Signal');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(sanitizeOtherLabel('My   Label')).toBe('My Label');
  });

  it('strips control characters', () => {
    expect(sanitizeOtherLabel('Label\x00\x1f\x7f')).toBe('Label');
  });

  it(`truncates to ${OTHER_LABEL_MAX} characters`, () => {
    const long = 'a'.repeat(OTHER_LABEL_MAX + 10);
    expect(sanitizeOtherLabel(long)).toHaveLength(OTHER_LABEL_MAX);
  });

  it('returns an empty string for blank input', () => {
    expect(sanitizeOtherLabel('   ')).toBe('');
  });
});

describe('findDuplicates', () => {
  it('returns an empty set when there are no duplicates', () => {
    expect(findDuplicates(['a', 'b', 'c']).size).toBe(0);
  });

  it('identifies a duplicated key', () => {
    const dupes = findDuplicates(['a', 'b', 'a']);
    expect(dupes.has('a')).toBe(true);
    expect(dupes.has('b')).toBe(false);
  });

  it('identifies multiple duplicated keys', () => {
    const dupes = findDuplicates(['a', 'b', 'a', 'b', 'c']);
    expect(dupes.has('a')).toBe(true);
    expect(dupes.has('b')).toBe(true);
    expect(dupes.has('c')).toBe(false);
  });

  it('ignores empty strings', () => {
    const dupes = findDuplicates(['', '', 'a']);
    expect(dupes.size).toBe(0);
  });

  it('returns an empty set for an empty array', () => {
    expect(findDuplicates([]).size).toBe(0);
  });

  it('is case-sensitive', () => {
    const dupes = findDuplicates(['foo@example.com', 'FOO@EXAMPLE.COM']);
    expect(dupes.size).toBe(0);
  });
});
