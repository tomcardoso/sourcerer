import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes } from 'crypto';
import { encodePayload, decodePayload } from '../main/sync/payload';

describe('encodePayload / decodePayload — round-trip', () => {
  it('preserves all fields through encode → decode', () => {
    const key = randomBytes(32);
    const encoded = encodePayload('Test Project', 'A description', '/path/to/file.sourcerer', key);
    const decoded = decodePayload(encoded);
    expect(decoded.name).toBe('Test Project');
    expect(decoded.description).toBe('A description');
    expect(decoded.originalFilename).toBe('file.sourcerer');
    expect(decoded.keyHex).toBe(key.toString('hex'));
  });

  it('round-trips with null description', () => {
    const key = randomBytes(32);
    const encoded = encodePayload('Minimal', null, '/db.sourcerer', key);
    const decoded = decodePayload(encoded);
    expect(decoded.description).toBeNull();
    expect(decoded.name).toBe('Minimal');
    expect(decoded.keyHex).toBe(key.toString('hex'));
  });

  it('tolerates leading and trailing whitespace around the encoded string', () => {
    const key = randomBytes(32);
    const encoded = encodePayload('Trim Test', null, '/db.sourcerer', key);
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

// ---------------------------------------------------------------------------
// sync:decode-payload IPC handler — error path returns {success:false} (#318)
// ---------------------------------------------------------------------------

// The IPC handler in src/main/ipc/sync.ts wraps decodePayload and catches errors,
// returning { success: false, error: string } instead of re-throwing.
// We test the handler-level behaviour by calling the IPC registration directly.

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []), getFocusedWindow: vi.fn(() => null) },
  dialog: { showOpenDialog: vi.fn() },
}));

let testDb: ReturnType<typeof import('./vitest.setup').createTestDb>;
vi.mock('../main/database', () => ({ getDatabase: () => testDb }));
vi.mock('../main/sync/poller', () => ({ syncOne: vi.fn(), pollAll: vi.fn() }));

import { ipcMain } from 'electron';
import { registerSyncHandlers } from '../main/ipc/sync';

const syncHandlers = new Map<string, (...args: unknown[]) => unknown>();

beforeEach(() => {
  syncHandlers.clear();
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn) => {
    syncHandlers.set(channel, fn as (...args: unknown[]) => unknown);
    return ipcMain;
  });
  registerSyncHandlers();
});

describe('sync:decode-payload IPC handler (#318)', () => {
  it('returns success:false with a non-empty error field for invalid base64', async () => {
    const result = await syncHandlers.get('sync:decode-payload')!({}, '!not-valid-base64!') as { success: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });

  it('returns success:false for non-JSON payload', async () => {
    const notJson = Buffer.from('this is not json').toString('base64url');
    const result = await syncHandlers.get('sync:decode-payload')!({}, notJson) as { success: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns success:false for empty string', async () => {
    const result = await syncHandlers.get('sync:decode-payload')!({}, '') as { success: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns success:true for a valid payload', async () => {
    const key = randomBytes(32);
    const encoded = encodePayload('Test Project', null, '/path/to/file.sourcerer', key);
    const result = await syncHandlers.get('sync:decode-payload')!({}, encoded) as { success: boolean; name?: string; keyHex?: string };
    expect(result.success).toBe(true);
    expect(result.name).toBe('Test Project');
    expect(result.keyHex).toBe(key.toString('hex'));
  });
});
