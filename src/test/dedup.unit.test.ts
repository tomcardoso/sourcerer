import { describe, it, expect } from 'vitest';
import { findDuplicatePairs } from '../main/dedup';
import type { DedupContact } from '@shared/types';

function makeContact(id: string, name: string, extras: Partial<DedupContact> = {}): DedupContact {
  return {
    id,
    name,
    organization: null,
    notes: null,
    emails: [],
    phones: [],
    projectCount: 0,
    projects: [],
    ...extras,
  };
}

describe('findDuplicatePairs — exact email match', () => {
  it('pairs two contacts sharing a normalised email', () => {
    const contacts = [
      makeContact('a', 'Alice Smith', { emails: ['alice@example.com'] }),
      makeContact('b', 'Alicia Smith', { emails: ['ALICE@EXAMPLE.COM'] }), // same email, different case
    ];
    const pairs = findDuplicatePairs(contacts);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].reason).toBe('email');
    expect(new Set([pairs[0].a.id, pairs[0].b.id])).toEqual(new Set(['a', 'b']));
  });

  it('does not pair contacts with different emails', () => {
    const contacts = [
      makeContact('a', 'Alice Smith', { emails: ['alice@example.com'] }),
      makeContact('b', 'Alice Jones', { emails: ['jones@example.com'] }),
    ];
    expect(findDuplicatePairs(contacts)).toHaveLength(0);
  });

  it('a contact already paired by email is not re-paired by name', () => {
    // 'a' and 'b' share an email; 'a' and 'c' have near-identical names.
    // Once 'a' is used in the email pair it should not appear in a name pair.
    const contacts = [
      makeContact('a', 'Jonathan Edwards', { emails: ['je@example.com'] }),
      makeContact('b', 'Someone Else',      { emails: ['je@example.com'] }),
      makeContact('c', 'Jonathan Edward',   { emails: [] }), // would match 'a' by name
    ];
    const pairs = findDuplicatePairs(contacts);
    // Only one pair: a+b by email
    expect(pairs).toHaveLength(1);
    expect(pairs[0].reason).toBe('email');
  });
});

describe('findDuplicatePairs — exact phone match', () => {
  it('pairs two contacts sharing the same phone digits', () => {
    const contacts = [
      makeContact('a', 'Alice Smith', { phones: ['(202) 456-1111'] }),
      makeContact('b', 'Alicia Smith', { phones: ['202-456-1111'] }), // same digits, different format
    ];
    const pairs = findDuplicatePairs(contacts);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].reason).toBe('phone');
  });

  it('does not pair contacts with different phones', () => {
    const contacts = [
      makeContact('a', 'Alice Smith', { phones: ['+1 202 456 1111'] }),
      makeContact('b', 'Bob Jones',   { phones: ['+1 202 456 9999'] }),
    ];
    expect(findDuplicatePairs(contacts)).toHaveLength(0);
  });
});

describe('findDuplicatePairs — fuzzy name match (Jaro-Winkler ≥ 0.95)', () => {
  it('pairs names with a single-character transposition near the end (≥ 0.95)', () => {
    // "James O'Brien" vs "James O'Brian" — one char differs → score ≈ 0.954
    const contacts = [
      makeContact('a', "James O'Brien"),
      makeContact('b', "James O'Brian"),
    ];
    const pairs = findDuplicatePairs(contacts);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].reason).toBe('name');
  });

  it('pairs names that differ only by a trailing character (≥ 0.95)', () => {
    // "Jonathan Edwards" vs "Jonathan Edward" — one fewer char → score ≈ 0.987
    const contacts = [
      makeContact('a', 'Jonathan Edwards'),
      makeContact('b', 'Jonathan Edward'),
    ];
    const pairs = findDuplicatePairs(contacts);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].reason).toBe('name');
  });

  it('does NOT pair names with different last names that share only a few letters (< 0.95)', () => {
    // "Karen Wilder" vs "Karen Wilson" — last names differ by 3 chars → score ≈ 0.900
    const contacts = [
      makeContact('a', 'Karen Wilder'),
      makeContact('b', 'Karen Wilson'),
    ];
    expect(findDuplicatePairs(contacts)).toHaveLength(0);
  });

  it('does NOT pair names with same first name but clearly different last name', () => {
    // "David Kim" vs "David Lee" — score ≈ 0.80 (well below threshold)
    const contacts = [
      makeContact('a', 'David Kim'),
      makeContact('b', 'David Lee'),
    ];
    expect(findDuplicatePairs(contacts)).toHaveLength(0);
  });
});

describe('findDuplicatePairs — email signal catches what name alone would not', () => {
  it('pairs contacts via email even when name similarity is below threshold', () => {
    // "Robert Chen" vs "Robert Chin" — name score ≈ 0.946 (miss), but same email → hit
    const contacts = [
      makeContact('a', 'Robert Chen', { emails: ['rchen@example.com'] }),
      makeContact('b', 'Robert Chin', { emails: ['rchen@example.com'] }),
    ];
    const pairs = findDuplicatePairs(contacts);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].reason).toBe('email'); // caught in Pass 1, not by name
  });
});

describe('findDuplicatePairs — dismissed pairs', () => {
  it('excludes a dismissed pair from results', () => {
    const contacts = [
      makeContact('a', "James O'Brien"),
      makeContact('b', "James O'Brian"),
    ];
    const dismissed = new Set(['a|b']);
    expect(findDuplicatePairs(contacts, dismissed)).toHaveLength(0);
  });

  it('excludes regardless of key order in the dismissed set', () => {
    const contacts = [
      makeContact('a', "James O'Brien"),
      makeContact('b', "James O'Brian"),
    ];
    const dismissed = new Set(['b|a']); // reversed order
    expect(findDuplicatePairs(contacts, dismissed)).toHaveLength(0);
  });

  it('still pairs contacts that are not in the dismissed set', () => {
    const contacts = [
      makeContact('a', "James O'Brien"),
      makeContact('b', "James O'Brian"),
      makeContact('c', 'Jonathan Edwards'),
      makeContact('d', 'Jonathan Edward'),
    ];
    const dismissed = new Set(['a|b']); // only a+b dismissed
    const pairs = findDuplicatePairs(contacts, dismissed);
    expect(pairs).toHaveLength(1);
    expect(new Set([pairs[0].a.id, pairs[0].b.id])).toEqual(new Set(['c', 'd']));
  });
});

describe('findDuplicatePairs — cross-pair deduplication', () => {
  it('each contact appears in at most one pair', () => {
    // 'a' shares an email with 'b' and also nearly-matches 'c' by name.
    // After being paired with 'b', 'a' must not appear in another pair.
    const contacts = [
      makeContact('a', 'Jonathan Edwards', { emails: ['je@test.com'] }),
      makeContact('b', 'Somebody Else',    { emails: ['je@test.com'] }),
      makeContact('c', 'Jonathan Edward',  { emails: [] }),
    ];
    const pairs = findDuplicatePairs(contacts);
    const ids = pairs.flatMap((p) => [p.a.id, p.b.id]);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });
});

describe('findDuplicatePairs — empty and single-contact inputs', () => {
  it('returns empty array for no contacts', () => {
    expect(findDuplicatePairs([])).toEqual([]);
  });

  it('returns empty array for a single contact', () => {
    expect(findDuplicatePairs([makeContact('a', 'Alice Smith')])).toEqual([]);
  });
});

describe('findDuplicatePairs — empty-digit phone string (#291 / dedup edge case)', () => {
  it('does not crash when a phone contains only non-digit characters', () => {
    const contacts = [
      makeContact('a', 'Alice Smith', { phones: ['000'] }),
      makeContact('b', 'Bob Jones',   { phones: ['000'] }),
    ];
    // digitsOnly('000') === '000' which is truthy — the contacts should pair by phone
    // but the key point is that it must NOT throw
    expect(() => findDuplicatePairs(contacts)).not.toThrow();
  });

  it('does not crash when phone normalises to an empty digit string', () => {
    // A phone of all punctuation e.g. "---" has no digits.
    // digitsOnly('---') === '' which is falsy — the guard `if (!key) continue` fires.
    const contacts = [
      makeContact('a', 'Alice Smith', { phones: ['---'] }),
      makeContact('b', 'Bob Jones',   { phones: ['---'] }),
    ];
    expect(() => findDuplicatePairs(contacts)).not.toThrow();
    // Empty-digit phones should not produce a pairing
    expect(findDuplicatePairs(contacts)).toHaveLength(0);
  });
});
