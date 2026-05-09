import { ipcMain, app } from 'electron';
import { randomUUID } from 'crypto';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getDatabase, getKeyHex } from '../database';
import { consumePendingScreenshot } from '../http-server';
import type { ContactScreenshot } from '@shared/types';

function screenshotsDir(): string {
  return path.join(app.getPath('userData'), 'screenshots');
}

function encryptBuffer(data: Buffer, keyHex: string): { encrypted: Buffer; iv: string } {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted: Buffer.concat([tag, enc]), iv: iv.toString('hex') };
}

function detectMimeType(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  return 'image/jpeg';
}

function decryptBuffer(data: Buffer, keyHex: string, ivHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = data.subarray(0, 16);
  const enc = data.subarray(16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export function registerScreenshotHandlers(): void {
  ipcMain.handle(
    'screenshots:assign',
    async (_e, { tempId, contactId }: { tempId: string; contactId: string }): Promise<{ success: boolean; error?: string }> => {
      const entry = consumePendingScreenshot(tempId);
      if (!entry) return { success: false, error: 'Screenshot expired or not found.' };

      try {
        const dir = screenshotsDir();
        await fs.mkdir(dir, { recursive: true });

        const keyHex = getKeyHex();
        const { encrypted, iv } = encryptBuffer(entry.buf, keyHex);

        const id = randomUUID();
        const fileName = `${id}.enc`;
        const filePath = path.join(dir, fileName);
        await fs.writeFile(filePath, encrypted);

        const db = getDatabase();
        db.prepare(
          `INSERT INTO contact_screenshots (id, contact_id, tab_url, file_path, iv, captured_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(id, contactId, entry.tabUrl, fileName, iv, Math.floor(Date.now() / 1000));

        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    'screenshots:list',
    (_e, contactId: string): ContactScreenshot[] => {
      const db = getDatabase();
      return db
        .prepare(
          `SELECT id, contact_id, tab_url, captured_at
           FROM contact_screenshots WHERE contact_id = ? ORDER BY captured_at DESC`,
        )
        .all(contactId) as ContactScreenshot[];
    },
  );

  ipcMain.handle(
    'screenshots:load',
    async (_e, screenshotId: string): Promise<{ data: string } | { error: string }> => {
      try {
        const db = getDatabase();
        const row = db
          .prepare('SELECT file_path, iv FROM contact_screenshots WHERE id = ?')
          .get(screenshotId) as { file_path: string; iv: string } | undefined;
        if (!row) return { error: 'Not found.' };

        const filePath = path.join(screenshotsDir(), row.file_path);
        const encrypted = await fs.readFile(filePath);
        const keyHex = getKeyHex();
        const decrypted = decryptBuffer(encrypted, keyHex, row.iv);
        const mimeType = detectMimeType(decrypted);
        return { data: `data:${mimeType};base64,${decrypted.toString('base64')}` };
      } catch (err) {
        return { error: String(err) };
      }
    },
  );

  ipcMain.handle(
    'screenshots:delete',
    async (_e, screenshotId: string): Promise<void> => {
      const db = getDatabase();
      const row = db
        .prepare('SELECT file_path FROM contact_screenshots WHERE id = ?')
        .get(screenshotId) as { file_path: string } | undefined;
      db.prepare('DELETE FROM contact_screenshots WHERE id = ?').run(screenshotId);
      if (row) {
        await fs.unlink(path.join(screenshotsDir(), row.file_path)).catch(() => {});
      }
    },
  );
}
