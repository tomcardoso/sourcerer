import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { deriveKey } from '../utils';

const MAGIC = Buffer.from('SRCR');
const FORMAT_VERSION = 1;
const CHUNK_SIZE = 64 * 1024;
// magic(4) + version(4) + salt(32) + base_iv(8) + chunk_size(4)
const HEADER_SIZE = 52;
// index(4) + auth_tag(16) + length(4)
const CHUNK_HDR_SIZE = 24;

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

// IV for chunk i: base_iv (8 bytes) || chunk_index as uint32 BE (4 bytes) = 12 bytes
function chunkIV(baseIV: Buffer, index: number): Buffer {
  const iv = Buffer.allocUnsafe(12);
  baseIV.copy(iv, 0, 0, 8);
  iv.writeUInt32BE(index, 8);
  return iv;
}

export async function* createBackupEntries(
  dbPath: string,
  saltPath: string,
  screenshotsPath: string,
): AsyncGenerator<{ name: string; data: Buffer }> {
  yield { name: 'db.sqlite', data: await fs.readFile(dbPath) };
  yield { name: 'salt', data: await fs.readFile(saltPath) };
  try {
    for (const file of await fs.readdir(screenshotsPath)) {
      yield { name: `screenshots/${file}`, data: await fs.readFile(path.join(screenshotsPath, file)) };
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export async function writeBackupFile(
  entries: AsyncIterable<{ name: string; data: Buffer }>,
  outputPath: string,
  password: string,
): Promise<void> {
  const backupSalt = crypto.randomBytes(32);
  const baseIV = crypto.randomBytes(8);
  const backupKey = Buffer.from(await deriveKey(password, backupSalt), 'hex');

  const fh = await fs.open(outputPath, 'w', 0o600);
  try {
    const fileHeader = Buffer.allocUnsafe(HEADER_SIZE);
    MAGIC.copy(fileHeader, 0);
    fileHeader.writeUInt32LE(FORMAT_VERSION, 4);
    backupSalt.copy(fileHeader, 8);
    baseIV.copy(fileHeader, 40);
    fileHeader.writeUInt32LE(CHUNK_SIZE, 48);
    await fh.write(fileHeader);

    let accumBuf = Buffer.allocUnsafe(CHUNK_SIZE);
    let accumLen = 0;
    let chunkIndex = 0;

    async function flushChunk(slice: Buffer): Promise<void> {
      const iv = chunkIV(baseIV, chunkIndex);
      const cipher = crypto.createCipheriv('aes-256-gcm', backupKey, iv);
      const ciphertext = Buffer.concat([cipher.update(slice), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const chunkHeader = Buffer.allocUnsafe(CHUNK_HDR_SIZE);
      chunkHeader.writeUInt32LE(chunkIndex, 0);
      authTag.copy(chunkHeader, 4);
      chunkHeader.writeUInt32LE(ciphertext.length, 20);
      await fh.write(chunkHeader);
      await fh.write(ciphertext);
      chunkIndex++;
    }

    async function feedBytes(data: Buffer): Promise<void> {
      let pos = 0;
      while (pos < data.length) {
        const space = CHUNK_SIZE - accumLen;
        const take = Math.min(space, data.length - pos);
        data.copy(accumBuf, accumLen, pos, pos + take);
        accumLen += take;
        pos += take;
        if (accumLen === CHUNK_SIZE) {
          await flushChunk(accumBuf);
          accumLen = 0;
        }
      }
    }

    for await (const { name, data } of entries) {
      const nameBuf = Buffer.from(name, 'utf8');
      const entryHeader = Buffer.allocUnsafe(8);
      entryHeader.writeUInt32LE(nameBuf.length, 0);
      entryHeader.writeUInt32LE(data.length, 4);
      await feedBytes(entryHeader);
      await feedBytes(nameBuf);
      await feedBytes(data);
    }

    if (accumLen > 0) await flushChunk(accumBuf.subarray(0, accumLen));
  } finally {
    await fh.close();
  }
}

export async function* readBackupFile(
  inputPath: string,
  password: string,
): AsyncGenerator<{ name: string; data: Buffer }> {
  const fh = await fs.open(inputPath, 'r');
  try {
    const fileHeaderBuf = Buffer.allocUnsafe(HEADER_SIZE);
    const { bytesRead: hRead } = await fh.read(fileHeaderBuf, 0, HEADER_SIZE, 0);
    if (hRead < HEADER_SIZE) throw new Error('Corrupted backup: truncated file header.');

    if (!fileHeaderBuf.subarray(0, 4).equals(MAGIC)) throw new Error('Unrecognised backup file format.');

    const version = fileHeaderBuf.readUInt32LE(4);
    if (version !== FORMAT_VERSION) throw new Error('This backup format is not supported. Please create a new backup.');

    const backupSalt = fileHeaderBuf.subarray(8, 40);
    const baseIV = fileHeaderBuf.subarray(40, 48);
    const chunkSize = fileHeaderBuf.readUInt32LE(48);
    if (chunkSize !== CHUNK_SIZE) throw new Error('Corrupted backup: unexpected chunk size in header.');

    const backupKey = Buffer.from(await deriveKey(password, backupSalt), 'hex');

    // Buffer list for streaming unpack — avoids O(n²) copies when a large entry spans many chunks.
    // We only call Buffer.concat once per complete entry, not once per incoming chunk.
    const pendingBufs: Buffer[] = [];
    let pendingLen = 0;

    function* drainEntries(): Generator<{ name: string; data: Buffer }> {
      while (pendingLen >= 8) {
        // Peek at the 8-byte entry header without flattening the full list.
        // CHUNK_SIZE >> 8, so pendingBufs[0] is almost always ≥ 8 bytes; only
        // flatten in the rare case it isn't (e.g. tests with tiny synthetic chunks).
        if (pendingBufs[0].length < 8) {
          const flat = Buffer.concat(pendingBufs);
          pendingBufs.length = 0;
          pendingBufs.push(flat);
        }
        const nameLen = pendingBufs[0].readUInt32LE(0);
        const dataLen = pendingBufs[0].readUInt32LE(4);
        const entrySize = 8 + nameLen + dataLen;
        if (pendingLen < entrySize) break;
        // Flatten exactly once per complete entry
        const flat = Buffer.concat(pendingBufs);
        const name = flat.subarray(8, 8 + nameLen).toString('utf8');
        const data = Buffer.from(flat.subarray(8 + nameLen, entrySize));
        pendingBufs.length = 0;
        if (flat.length > entrySize) pendingBufs.push(flat.subarray(entrySize));
        pendingLen -= entrySize;
        yield { name, data };
      }
    }

    const chunkHeaderBuf = Buffer.allocUnsafe(CHUNK_HDR_SIZE);
    const ciphertextBuf = Buffer.allocUnsafe(CHUNK_SIZE);
    let filePos = HEADER_SIZE;
    let expectedIndex = 0;

    while (true) {
      const { bytesRead: chRead } = await fh.read(chunkHeaderBuf, 0, CHUNK_HDR_SIZE, filePos);
      if (chRead === 0) break;
      if (chRead < CHUNK_HDR_SIZE) throw new Error('Corrupted backup: truncated chunk header.');
      filePos += CHUNK_HDR_SIZE;

      const storedIndex = chunkHeaderBuf.readUInt32LE(0);
      if (storedIndex !== expectedIndex) throw new Error('Corrupted backup: unexpected chunk order.');

      const authTag = Buffer.from(chunkHeaderBuf.subarray(4, 20));
      const ciphertextLength = chunkHeaderBuf.readUInt32LE(20);
      if (ciphertextLength > ciphertextBuf.length) throw new Error('Corrupted backup: chunk exceeds declared chunk size.');

      const { bytesRead: cRead } = await fh.read(ciphertextBuf, 0, ciphertextLength, filePos);
      if (cRead < ciphertextLength) throw new Error('Corrupted backup: truncated chunk ciphertext.');
      filePos += ciphertextLength;

      const iv = chunkIV(baseIV, expectedIndex);
      const decipher = crypto.createDecipheriv('aes-256-gcm', backupKey, iv);
      decipher.setAuthTag(authTag);

      let plaintext: Buffer;
      try {
        plaintext = Buffer.concat([decipher.update(ciphertextBuf.subarray(0, ciphertextLength)), decipher.final()]);
      } catch {
        throw new Error('Incorrect password or corrupted backup.');
      }

      pendingBufs.push(plaintext);
      pendingLen += plaintext.length;
      yield* drainEntries();
      expectedIndex++;
    }

    if (pendingLen > 0) throw new Error('Corrupted backup: trailing bytes in payload.');
  } finally {
    await fh.close();
  }
}
