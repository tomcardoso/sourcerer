import { describe, it, expect } from 'vitest';
import { parseCsv } from '../main/ipc/import';

describe('parseCsv', () => {
  it('parses plain header + data rows', () => {
    const input = 'Name,Email,Phone\nAlice,alice@example.com,555-1111\nBob,bob@example.com,555-2222\n';
    const rows = parseCsv(input);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(['Name', 'Email', 'Phone']);
    expect(rows[1]).toEqual(['Alice', 'alice@example.com', '555-1111']);
    expect(rows[2]).toEqual(['Bob', 'bob@example.com', '555-2222']);
  });

  it('handles quoted fields that contain commas', () => {
    const input = 'Name,Notes\n"Smith, John","Reporter, senior"\n';
    const rows = parseCsv(input);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['Smith, John', 'Reporter, senior']);
  });

  it('handles escaped double-quotes inside quoted fields (RFC 4180 "")', () => {
    const input = 'Name,Notes\n"Alice","She said ""hello"""\n';
    const rows = parseCsv(input);
    expect(rows[1][1]).toBe('She said "hello"');
  });

  it('handles CRLF line endings', () => {
    const input = 'Name,Email\r\nAlice,alice@example.com\r\nBob,bob@example.com\r\n';
    const rows = parseCsv(input);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(['Alice', 'alice@example.com']);
    expect(rows[2]).toEqual(['Bob', 'bob@example.com']);
  });

  it('skips blank lines', () => {
    const input = 'Name,Email\n\nAlice,alice@example.com\n\nBob,bob@example.com\n';
    const rows = parseCsv(input);
    expect(rows).toHaveLength(3);
  });

  it('parses a single-column file', () => {
    const input = 'Name\nAlice\nBob\n';
    const rows = parseCsv(input);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(['Name']);
    expect(rows[1]).toEqual(['Alice']);
  });

  it('handles an empty input string', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('handles multi-row file with mixed quoted and unquoted fields', () => {
    const input = 'Name,Org,Notes\n"Jones, Mary",Acme,"Works on ""special"" projects"\nBob,Globex,\n';
    const rows = parseCsv(input);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(['Jones, Mary', 'Acme', 'Works on "special" projects']);
    expect(rows[2]).toEqual(['Bob', 'Globex', '']);
  });

  it('handles fields with newlines inside quotes', () => {
    // RFC 4180: quoted fields may contain literal newlines; the embedded newline becomes part of the value.
    const input = 'Name,Notes\nAlice,"line one\nline two"\nBob,plain\n';
    const rows = parseCsv(input);
    expect(rows[1][1]).toBe('line one\nline two');
  });

  it('parses a row with a trailing empty field without crashing (#291)', () => {
    // e.g. "name,email," — the trailing comma produces an empty final field
    const input = 'Name,Email,Extra\nAlice,alice@example.com,\n';
    const rows = parseCsv(input);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['Alice', 'alice@example.com', '']);
  });

  it('parses a header row with a trailing empty field without crashing (#291)', () => {
    const input = 'Name,Email,\nAlice,alice@example.com,\n';
    const rows = parseCsv(input);
    expect(rows).toHaveLength(2);
    // trailing empty fields are preserved
    expect(rows[0][2]).toBe('');
    expect(rows[1][2]).toBe('');
  });

  it('strips a leading UTF-8 BOM so Excel exports parse correctly (#328)', () => {
    const bom = '﻿';
    const input = `${bom}Name,Email\nAlice,alice@example.com\n`;
    const rows = parseCsv(input);
    expect(rows[0][0]).toBe('Name');
  });

  it('heals malformed quoted fields with junk after closing quote (#328)', () => {
    // "Smith, Jr."suffix — the suffix should be discarded, not shift columns
    const input = 'Name,Email\n"Smith, Jr."suffix,alice@example.com\n';
    const rows = parseCsv(input);
    expect(rows[1]).toEqual(['Smith, Jr.', 'alice@example.com']);
  });
});
