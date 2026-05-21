import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { packFiles, unpackFiles, writeBackupFile, readBackupFile } from '../main/ipc/backup-format';

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

describe('writeBackupFile / readBackupFile round-trip', () => {
  async function tmpFile(): Promise<string> {
    return path.join(os.tmpdir(), `sourcerer-test-${Date.now()}-${Math.random().toString(36).slice(2)}.bak`);
  }

  async function collect(gen: AsyncGenerator<{ name: string; data: Buffer }>) {
    const results: Array<{ name: string; data: Buffer }> = [];
    for await (const entry of gen) results.push(entry);
    return results;
  }

  it('round-trips a single entry', async () => {
    const outPath = await tmpFile();
    try {
      const entries = [{ name: 'db.sqlite', data: Buffer.from('hello world') }];
      await writeBackupFile((async function* () { yield* entries; })(), outPath, 'password123');
      const result = await collect(readBackupFile(outPath, 'password123'));
      expect(result).toEqual(entries);
    } finally {
      await fs.unlink(outPath).catch(() => {});
    }
  });

  it('round-trips multiple entries with binary data', async () => {
    const outPath = await tmpFile();
    try {
      const entries = [
        { name: 'db.sqlite', data: Buffer.from('db contents') },
        { name: 'salt', data: Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]) },
        { name: 'screenshots/abc.enc', data: Buffer.from('screenshot bytes') },
      ];
      await writeBackupFile((async function* () { yield* entries; })(), outPath, 'secret');
      const result = await collect(readBackupFile(outPath, 'secret'));
      expect(result).toEqual(entries);
    } finally {
      await fs.unlink(outPath).catch(() => {});
    }
  });

  it('round-trips an empty entry list', async () => {
    const outPath = await tmpFile();
    try {
      await writeBackupFile((async function* () {})(), outPath, 'pass');
      const result = await collect(readBackupFile(outPath, 'pass'));
      expect(result).toEqual([]);
    } finally {
      await fs.unlink(outPath).catch(() => {});
    }
  });

  it('round-trips data larger than a single chunk', async () => {
    const outPath = await tmpFile();
    try {
      // 200 KB — spans multiple 64 KB chunks
      const data = Buffer.alloc(200 * 1024, 0xab);
      const entries = [{ name: 'big.bin', data }];
      await writeBackupFile((async function* () { yield* entries; })(), outPath, 'pass');
      const result = await collect(readBackupFile(outPath, 'pass'));
      expect(result[0].data).toEqual(data);
    } finally {
      await fs.unlink(outPath).catch(() => {});
    }
  });

  it('rejects a wrong password', async () => {
    const outPath = await tmpFile();
    try {
      await writeBackupFile(
        (async function* () { yield { name: 'x', data: Buffer.from('y') }; })(),
        outPath,
        'correct',
      );
      await expect(collect(readBackupFile(outPath, 'wrong'))).rejects.toThrow('Incorrect password');
    } finally {
      await fs.unlink(outPath).catch(() => {});
    }
  });

  it('rejects a file with wrong magic bytes', async () => {
    const outPath = await tmpFile();
    try {
      // Must be >= 52 bytes (header size) so the truncation check doesn't fire first
      const fakeBuf = Buffer.alloc(52, 0); // all zeros — not "SRCR"
      await fs.writeFile(outPath, fakeBuf);
      await expect(collect(readBackupFile(outPath, 'pass'))).rejects.toThrow('Unrecognised backup file format');
    } finally {
      await fs.unlink(outPath).catch(() => {});
    }
  });

  it('rejects a truncated file', async () => {
    const outPath = await tmpFile();
    try {
      await fs.writeFile(outPath, Buffer.from([0x53, 0x52, 0x43, 0x52, 0x01])); // "SRCR" + 1 byte
      await expect(collect(readBackupFile(outPath, 'pass'))).rejects.toThrow('truncated file header');
    } finally {
      await fs.unlink(outPath).catch(() => {});
    }
  });
});
