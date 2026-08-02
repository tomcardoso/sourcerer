import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb, insertContact, insertProject, TEST_REPORTER } from './vitest.setup';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(() => null), getFocusedWindow: vi.fn(() => ({})) },
  dialog: { showSaveDialog: vi.fn() },
}));

let testDb: ReturnType<typeof createTestDb>;
vi.mock('../main/database', () => ({ getDatabase: () => testDb }));

import { ipcMain, dialog } from 'electron';
import { registerExportHandlers } from '../main/ipc/export';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

let dir: string;

function addMembership(contactId: string, projectId: string): void {
  const now = Math.floor(Date.now() / 1000);
  testDb.prepare(
    'INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(uuidv4(), contactId, projectId, TEST_REPORTER.email, TEST_REPORTER.name, now, now);
}

beforeEach(() => {
  testDb = createTestDb();
  handlers.clear();
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn) => {
    handlers.set(channel, fn as (...args: unknown[]) => unknown);
    return ipcMain;
  });
  registerExportHandlers();
  dir = mkdtempSync(join(tmpdir(), 'sourcerer-export-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// SQLite variable limit (#433)
// ---------------------------------------------------------------------------

describe('export:all-contacts — SQLite variable limit (#433)', () => {
  it('exports more than 999 contacts without hitting "too many SQL variables"', async () => {
    const CONTACT_COUNT = 1200;
    for (let i = 0; i < CONTACT_COUNT; i++) {
      insertContact(testDb, `Contact ${i}`, { emails: [`c${i}@example.com`] });
    }
    const filePath = join(dir, 'export.csv');
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath } as unknown as Awaited<ReturnType<typeof dialog.showSaveDialog>>);

    const result = await handlers.get('export:all-contacts')!({ sender: {} }, {}) as { success: boolean; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(CONTACT_COUNT + 1); // header + one row per contact
  });

  it('exports a filtered selection of more than 999 contact IDs without hitting the variable limit', async () => {
    const selectedIds: string[] = [];
    for (let i = 0; i < 1100; i++) {
      selectedIds.push(insertContact(testDb, `Selected ${i}`));
    }
    insertContact(testDb, 'Excluded Contact');

    const filePath = join(dir, 'selected.csv');
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath } as unknown as Awaited<ReturnType<typeof dialog.showSaveDialog>>);

    const result = await handlers.get('export:all-contacts')!({ sender: {} }, { contactIds: selectedIds }) as { success: boolean };

    expect(result.success).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content.trim().split('\n')).toHaveLength(1101); // header + 1100 selected
    expect(content).not.toContain('Excluded Contact');
  });
});

describe('export:project — SQLite variable limit (#433)', () => {
  it('exports a project with more than 999 members without hitting the variable limit', async () => {
    const projId = insertProject(testDb, 'Big Project');
    const MEMBER_COUNT = 1200;
    for (let i = 0; i < MEMBER_COUNT; i++) {
      const contactId = insertContact(testDb, `Member ${i}`, { emails: [`m${i}@example.com`] });
      addMembership(contactId, projId);
    }
    const filePath = join(dir, 'project.csv');
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath } as unknown as Awaited<ReturnType<typeof dialog.showSaveDialog>>);

    const result = await handlers.get('export:project')!({ sender: {} }, { projectId: projId, mode: 'sanitized' }) as { success: boolean; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(MEMBER_COUNT + 1);
  });

  it('exports a filtered selection of more than 999 members without hitting the variable limit', async () => {
    const projId = insertProject(testDb, 'Big Project 2');
    const selectedIds: string[] = [];
    for (let i = 0; i < 1050; i++) {
      const contactId = insertContact(testDb, `Selected Member ${i}`);
      addMembership(contactId, projId);
      selectedIds.push(contactId);
    }
    const excludedId = insertContact(testDb, 'Excluded Member');
    addMembership(excludedId, projId);

    const filePath = join(dir, 'project-selected.csv');
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath } as unknown as Awaited<ReturnType<typeof dialog.showSaveDialog>>);

    const result = await handlers.get('export:project')!(
      { sender: {} },
      { projectId: projId, mode: 'sanitized', contactIds: selectedIds },
    ) as { success: boolean };

    expect(result.success).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content.trim().split('\n')).toHaveLength(1051);
    expect(content).not.toContain('Excluded Member');
  });
});

// ---------------------------------------------------------------------------
// sub-table data fidelity, after the fetchContactSubTables extraction (#442)
// ---------------------------------------------------------------------------

describe('export:all-contacts — sub-table data (#442 refactor)', () => {
  it('includes emails, phones, links, and handles for each contact', async () => {
    insertContact(testDb, 'Alice Smith', {
      emails: ['alice@example.com'],
      phones: ['+12025550100'],
      handles: [{ type: 'signal', handle: '@alice' }],
    });
    const filePath = join(dir, 'fidelity.csv');
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath } as unknown as Awaited<ReturnType<typeof dialog.showSaveDialog>>);

    const result = await handlers.get('export:all-contacts')!({ sender: {} }, {}) as { success: boolean };

    expect(result.success).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('alice@example.com');
    expect(content).toContain('+12025550100');
    expect(content).toContain('signal: @alice');
  });
});

// ---------------------------------------------------------------------------
// Gmail / Outlook CSV export formats (#463)
// ---------------------------------------------------------------------------

describe('export:all-contacts — gmail/outlook formats', () => {
  it('writes Gmail-shaped headers and splits the name into Given/Family Name', async () => {
    insertContact(testDb, 'Alice Smith', { org: 'Acme Corp', title: 'Reporter', emails: ['alice@example.com'], phones: ['+12025550100'] });
    const filePath = join(dir, 'gmail.csv');
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath } as unknown as Awaited<ReturnType<typeof dialog.showSaveDialog>>);

    const result = await handlers.get('export:all-contacts')!({ sender: {} }, { format: 'gmail' }) as { success: boolean };

    expect(result.success).toBe(true);
    const [header, row] = readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(header).toContain('Given Name');
    expect(header).toContain('E-mail 1 - Value');
    expect(header).toContain('Organization 1 - Name');
    expect(row).toContain('Alice');
    expect(row).toContain('Smith');
    expect(row).toContain('alice@example.com');
    expect(row).toContain('Acme Corp');
  });

  it('writes Outlook-shaped headers and splits the name into First/Last Name', async () => {
    insertContact(testDb, 'Bob Jones', { org: 'Globe Media', title: 'Editor', emails: ['bob@example.com'], phones: ['+12025550100'] });
    const filePath = join(dir, 'outlook.csv');
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath } as unknown as Awaited<ReturnType<typeof dialog.showSaveDialog>>);

    const result = await handlers.get('export:all-contacts')!({ sender: {} }, { format: 'outlook' }) as { success: boolean };

    expect(result.success).toBe(true);
    const [header, row] = readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(header).toContain('First Name');
    expect(header).toContain('E-mail Address');
    expect(header).toContain('Company');
    expect(row).toContain('Bob');
    expect(row).toContain('Jones');
    expect(row).toContain('bob@example.com');
    expect(row).toContain('Globe Media');
  });
});
