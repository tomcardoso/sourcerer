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
