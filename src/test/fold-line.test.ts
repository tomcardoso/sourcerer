import { describe, it, expect } from 'vitest';
import { foldLine } from '../main/utils';

describe('foldLine', () => {
  it('leaves short lines untouched', () => {
    expect(foldLine('SUMMARY:Follow up')).toBe('SUMMARY:Follow up');
  });

  it('does not fold a line of exactly 75 octets', () => {
    const line = 'X'.repeat(75);
    expect(foldLine(line)).toBe(line);
  });

  it('folds a line over 75 octets with a single leading space on the continuation', () => {
    const line = 'SUMMARY:' + 'A'.repeat(80);
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBe(2);
    expect(parts[1].startsWith(' ')).toBe(true);
    expect(Buffer.byteLength(parts[0], 'utf8')).toBe(75);
    // Rejoining (stripping the fold markers) reconstructs the original value.
    expect(parts[0] + parts[1].slice(1)).toBe(line);
  });

  it('folds without splitting a multi-byte UTF-8 character', () => {
    const line = 'SUMMARY:' + '€'.repeat(30); // € is 3 octets in UTF-8
    const folded = foldLine(line);
    for (const part of folded.split('\r\n ')) {
      expect(() => Buffer.from(part, 'utf8').toString('utf8')).not.toThrow();
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });

  it('folds across multiple continuation lines when needed', () => {
    const line = 'DESCRIPTION:' + 'B'.repeat(200);
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(parts[0] + parts.slice(1).map((p) => p.slice(1)).join('')).toBe(line);
  });
});
