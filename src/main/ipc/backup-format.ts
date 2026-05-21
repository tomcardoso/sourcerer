import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { deriveKey } from '../utils';

// Backup inner payload: concatenated length-prefixed entries.
// Each entry: [4-byte LE name length][name bytes][4-byte LE data length][data bytes]

export function packFiles(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const header = Buffer.allocUnsafe(8);
    header.writeUInt32LE(nameBuf.length, 0);
    header.writeUInt32LE(data.length, 4);
    parts.push(header, nameBuf, data);
  }
  return Buffer.concat(parts);
}

export function unpackFiles(buf: Buffer): Array<{ name: string; data: Buffer }> {
  const entries: Array<{ name: string; data: Buffer }> = [];
  let offset = 0;
  while (offset < buf.length) {
    if (offset + 8 > buf.length) throw new Error('Corrupted backup: truncated entry header.');
    const nameLen = buf.readUInt32LE(offset); offset += 4;
    const dataLen = buf.readUInt32LE(offset); offset += 4;
    if (offset + nameLen + dataLen > buf.length) throw new Error('Corrupted backup: entry length exceeds buffer.');
    const name = buf.subarray(offset, offset + nameLen).toString('utf8'); offset += nameLen;
    const data = buf.subarray(offset, offset + dataLen); offset += dataLen;
    entries.push({ name, data });
  }
  return entries;
}

export async function buildBackupBundle(
  dbPath: string,
  saltPath: string,
  screenshotsPath: string,
  password: string,
): Promise<string> {
  const entries: Array<{ name: string; data: Buffer }> = [
    { name: 'db.sqlite', data: await fs.readFile(dbPath) },
    { name: 'salt', data: await fs.readFile(saltPath) },
  ];
  try {
    for (const file of await fs.readdir(screenshotsPath)) {
      entries.push({ name: `screenshots/${file}`, data: await fs.readFile(path.join(screenshotsPath, file)) });
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  const payload = packFiles(entries);

  const backupSalt = crypto.randomBytes(32);
  const backupKey = Buffer.from(await deriveKey(password, backupSalt), 'hex');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', backupKey, iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    version: 1,
    backup_salt: backupSalt.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}
