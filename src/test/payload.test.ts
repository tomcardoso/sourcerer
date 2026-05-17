import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import { encodePayload, decodePayload } from '../main/sync/payload';

describe('encodePayload / decodePayload — round-trip', () => {
  it('preserves all fields through encode → decode', () => {
    const key = randomBytes(32);
    const encoded = encodePayload('Test Project', 'A description', '/path/to/file.db', key);
    const decoded = decodePayload(encoded);
    expect(decoded.name).toBe('Test Project');
    expect(decoded.description).toBe('A description');
    expect(decoded.originalFilename).toBe('file.db');
    expect(decoded.keyHex).toBe(key.toString('hex'));
  });

  it('round-trips with null description', () => {
    const key = randomBytes(32);
    const encoded = encodePayload('Minimal', null, '/db.db', key);
    const decoded = decodePayload(encoded);
    expect(decoded.description).toBeNull();
    expect(decoded.name).toBe('Minimal');
    expect(decoded.keyHex).toBe(key.toString('hex'));
  });

  it('tolerates leading and trailing whitespace around the encoded string', () => {
    const key = randomBytes(32);
    const encoded = encodePayload('Trim Test', null, '/db.db', key);
    const decoded = decodePayload(`  ${encoded}  `);
    expect(decoded.name).toBe('Trim Test');
    expect(decoded.keyHex).toBe(key.toString('hex'));
  });

  it('produces a different encoding for each unique key', () => {
    const encoded1 = encodePayload('P', null, '/x', randomBytes(32));
    const encoded2 = encodePayload('P', null, '/x', randomBytes(32));
    expect(encoded1).not.toBe(encoded2);
  });
});

describe('decodePayload — error handling', () => {
  it('throws on invalid base64url characters', () => {
    expect(() => decodePayload('!not-valid-base64!')).toThrow(/Invalid setup payload/);
  });

  it('throws when the decoded content is not JSON', () => {
    const notJson = Buffer.from('this is not json').toString('base64url');
    expect(() => decodePayload(notJson)).toThrow(/Invalid setup payload/);
  });

  it('throws on an unsupported version number', () => {
    const bad = Buffer.from(
      JSON.stringify({ v: 99, name: 'x', description: null, path: '/x', key: randomBytes(32).toString('base64') }),
    ).toString('base64url');
    expect(() => decodePayload(bad)).toThrow(/Unknown payload version/);
  });

  it('throws when the embedded key is shorter than 32 bytes', () => {
    const shortKey = randomBytes(16).toString('base64');
    const bad = Buffer.from(
      JSON.stringify({ v: 1, name: 'x', description: null, path: '/x', key: shortKey }),
    ).toString('base64url');
    expect(() => decodePayload(bad)).toThrow(/Invalid key length/);
  });

  it('throws when the embedded key is longer than 32 bytes', () => {
    const longKey = randomBytes(64).toString('base64');
    const bad = Buffer.from(
      JSON.stringify({ v: 1, name: 'x', description: null, path: '/x', key: longKey }),
    ).toString('base64url');
    expect(() => decodePayload(bad)).toThrow(/Invalid key length/);
  });

  it('throws on an empty string', () => {
    expect(() => decodePayload('')).toThrow();
  });
});
