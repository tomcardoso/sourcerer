import { describe, it, expect } from 'vitest';
import { packFiles, unpackFiles } from '../main/ipc/backup-format';

describe('packFiles / unpackFiles round-trip', () => {
  it('recovers a single entry', () => {
    const entries = [{ name: 'db.sqlite', data: Buffer.from('hello') }];
    expect(unpackFiles(packFiles(entries))).toEqual(entries);
  });

  it('recovers multiple entries', () => {
    const entries = [
      { name: 'db.sqlite', data: Buffer.from('db data') },
      { name: 'salt', data: Buffer.from('salt data') },
      { name: 'screenshots/abc.enc', data: Buffer.from('screenshot data') },
    ];
    expect(unpackFiles(packFiles(entries))).toEqual(entries);
  });

  it('handles binary data', () => {
    const data = Buffer.from([0x00, 0xff, 0xde, 0xad, 0xbe, 0xef]);
    const entries = [{ name: 'salt', data }];
    expect(unpackFiles(packFiles(entries))[0].data).toEqual(data);
  });

  it('handles an empty entries array', () => {
    expect(unpackFiles(packFiles([]))).toEqual([]);
  });

  it('preserves entry order', () => {
    const entries = [
      { name: 'first', data: Buffer.from('a') },
      { name: 'second', data: Buffer.from('b') },
      { name: 'third', data: Buffer.from('c') },
    ];
    const result = unpackFiles(packFiles(entries));
    expect(result.map(e => e.name)).toEqual(['first', 'second', 'third']);
  });
});

describe('unpackFiles — malformed input', () => {
  it('throws on a truncated header (fewer than 8 bytes remain)', () => {
    expect(() => unpackFiles(Buffer.from([0x01, 0x00, 0x00]))).toThrow('truncated entry header');
  });

  it('throws when declared name length exceeds buffer', () => {
    const buf = Buffer.allocUnsafe(8);
    buf.writeUInt32LE(100, 0); // name length: 100
    buf.writeUInt32LE(0, 4);   // data length: 0
    expect(() => unpackFiles(buf)).toThrow('entry length exceeds buffer');
  });

  it('throws when declared data length exceeds buffer', () => {
    const nameBuf = Buffer.from('db.sqlite', 'utf8');
    const header = Buffer.allocUnsafe(8);
    header.writeUInt32LE(nameBuf.length, 0);
    header.writeUInt32LE(9999, 4); // data length far beyond what's available
    expect(() => unpackFiles(Buffer.concat([header, nameBuf]))).toThrow('entry length exceeds buffer');
  });

  it('throws on a completely empty-but-nonzero truncated buffer', () => {
    expect(() => unpackFiles(Buffer.from([0x05]))).toThrow('truncated entry header');
  });
});
