import { beforeEach, describe, it, expect, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb, insertContact, insertProject, TEST_REPORTER } from './vitest.setup';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

let testDb: ReturnType<typeof createTestDb>;
vi.mock('../main/database', () => ({ getDatabase: () => testDb }));

import { performSearch } from '../main/ipc/search';

function insertMembership(contactId: string, projId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const id = uuidv4();
  testDb.prepare(
    `INSERT INTO project_memberships
       (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, contactId, projId, TEST_REPORTER.email, TEST_REPORTER.name, now, now);
  return id;
}

function insertLogEntry(membershipId: string, body: string): string {
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  testDb.prepare(
    `INSERT INTO interaction_log_entries
       (id, membership_id, reporter_email, reporter_name, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, membershipId, TEST_REPORTER.email, TEST_REPORTER.name, body, now);
  return id;
}

beforeEach(() => {
  testDb = createTestDb();
});

describe('performSearch — empty query', () => {
  it('returns [] without hitting the database', () => {
    expect(performSearch('', testDb)).toEqual([]);
    expect(performSearch('   ', testDb)).toEqual([]);
  });
});

describe('performSearch — log results', () => {
  it('returns a log result when a log entry body matches', () => {
    const contactId = insertContact(testDb, 'Jane Smith');
    const projId = insertProject(testDb, 'Test Project');
    const membId = insertMembership(contactId, projId);
    const entryId = insertLogEntry(membId, 'spoke about the pipeline report');

    const results = performSearch('pipeline', testDb);

    const logResults = results.filter((r) => r.type === 'log');
    expect(logResults).toHaveLength(1);
    const r = logResults[0];
    if (r.type !== 'log') throw new Error('wrong type');
    expect(r.id).toBe(entryId);
    expect(r.contactId).toBe(contactId);
    expect(r.name).toBe('Jane Smith');
    expect(r.subtitle).toBe('Test Project');
    expect(r.excerpt).toContain('pipeline');
  });

  it('returns no log results when body does not match', () => {
    const contactId = insertContact(testDb, 'Jane Smith');
    const projId = insertProject(testDb, 'Test Project');
    const membId = insertMembership(contactId, projId);
    insertLogEntry(membId, 'discussed the annual budget');

    const results = performSearch('pipeline', testDb);
    expect(results.filter((r) => r.type === 'log')).toHaveLength(0);
  });

  it('caps log results at 5', () => {
    const contactId = insertContact(testDb, 'Jane Smith');
    const projId = insertProject(testDb, 'Test Project');
    const membId = insertMembership(contactId, projId);
    for (let i = 0; i < 8; i++) {
      insertLogEntry(membId, `discussed the pipeline report number ${i}`);
    }

    const results = performSearch('pipeline', testDb);
    expect(results.filter((r) => r.type === 'log')).toHaveLength(5);
  });

  it('triggers keep FTS index in sync after insert', () => {
    const contactId = insertContact(testDb, 'Jane Smith');
    const projId = insertProject(testDb, 'Test Project');
    const membId = insertMembership(contactId, projId);

    expect(performSearch('whistleblower', testDb).filter((r) => r.type === 'log')).toHaveLength(0);

    insertLogEntry(membId, 'met with whistleblower at the cafe');

    expect(performSearch('whistleblower', testDb).filter((r) => r.type === 'log')).toHaveLength(1);
  });
});

describe('performSearch — malformed FTS query', () => {
  it('returns [] for log results rather than throwing on invalid FTS syntax', () => {
    const contactId = insertContact(testDb, 'Jane Smith');
    const projId = insertProject(testDb, 'Test Project');
    const membId = insertMembership(contactId, projId);
    insertLogEntry(membId, 'some content');

    // Leading AND is invalid FTS5 syntax
    expect(() => performSearch('AND', testDb)).not.toThrow();
    const results = performSearch('AND', testDb);
    expect(results.filter((r) => r.type === 'log')).toHaveLength(0);
  });
});
