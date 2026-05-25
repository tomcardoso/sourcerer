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
  const membership = testDb.prepare('SELECT contact_id FROM project_memberships WHERE id = ?').get(membershipId) as { contact_id: string };
  testDb.prepare(
    `INSERT INTO interaction_log_entries
       (id, contact_id, reporter_email, reporter_name, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, membership.contact_id, TEST_REPORTER.email, TEST_REPORTER.name, body, now);
  testDb.prepare('INSERT INTO interaction_projects (interaction_id, membership_id) VALUES (?, ?)').run(id, membershipId);
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

  it('insert trigger keeps FTS index in sync', () => {
    const contactId = insertContact(testDb, 'Jane Smith');
    const projId = insertProject(testDb, 'Test Project');
    const membId = insertMembership(contactId, projId);

    expect(performSearch('whistleblower', testDb).filter((r) => r.type === 'log')).toHaveLength(0);

    insertLogEntry(membId, 'met with whistleblower at the cafe');

    expect(performSearch('whistleblower', testDb).filter((r) => r.type === 'log')).toHaveLength(1);
  });

  it('delete trigger removes entry from FTS index', () => {
    const contactId = insertContact(testDb, 'Jane Smith');
    const projId = insertProject(testDb, 'Test Project');
    const membId = insertMembership(contactId, projId);
    const entryId = insertLogEntry(membId, 'discussed the pipeline report');

    expect(performSearch('pipeline', testDb).filter((r) => r.type === 'log')).toHaveLength(1);

    testDb.prepare('DELETE FROM interaction_log_entries WHERE id = ?').run(entryId);

    expect(performSearch('pipeline', testDb).filter((r) => r.type === 'log')).toHaveLength(0);
  });

  it('update trigger re-indexes the new body and removes the old', () => {
    const contactId = insertContact(testDb, 'Jane Smith');
    const projId = insertProject(testDb, 'Test Project');
    const membId = insertMembership(contactId, projId);
    const entryId = insertLogEntry(membId, 'discussed the pipeline report');

    expect(performSearch('pipeline', testDb).filter((r) => r.type === 'log')).toHaveLength(1);
    expect(performSearch('budget', testDb).filter((r) => r.type === 'log')).toHaveLength(0);

    testDb.prepare('UPDATE interaction_log_entries SET body = ? WHERE id = ?').run('reviewed the annual budget', entryId);

    expect(performSearch('pipeline', testDb).filter((r) => r.type === 'log')).toHaveLength(0);
    expect(performSearch('budget', testDb).filter((r) => r.type === 'log')).toHaveLength(1);
  });
});

describe('performSearch — contact results', () => {
  it('finds a contact by name', () => {
    insertContact(testDb, 'Alice Johnson');
    const results = performSearch('Alice', testDb).filter((r) => r.type === 'contact');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Alice Johnson');
  });

  it('finds a contact by organization', () => {
    insertContact(testDb, 'Bob Smith', { org: 'Reuters News Agency' });
    const results = performSearch('Reuters', testDb).filter((r) => r.type === 'contact');
    expect(results).toHaveLength(1);
  });

  it('finds a contact by notes', () => {
    insertContact(testDb, 'Carol Dane', { notes: 'Former Pentagon official' });
    const results = performSearch('Pentagon', testDb).filter((r) => r.type === 'contact');
    expect(results).toHaveLength(1);
  });

  it('finds a contact by email', () => {
    insertContact(testDb, 'Dave Nguyen', { emails: ['dave@example.com'] });
    const results = performSearch('dave@example', testDb).filter((r) => r.type === 'contact');
    expect(results).toHaveLength(1);
  });

  it('insert trigger keeps contacts_fts in sync', () => {
    expect(performSearch('Eve', testDb).filter((r) => r.type === 'contact')).toHaveLength(0);
    insertContact(testDb, 'Eve Turner');
    expect(performSearch('Eve', testDb).filter((r) => r.type === 'contact')).toHaveLength(1);
  });

  it('delete trigger removes contact from FTS index', () => {
    const id = insertContact(testDb, 'Frank Castle');
    expect(performSearch('Frank', testDb).filter((r) => r.type === 'contact')).toHaveLength(1);
    testDb.prepare('DELETE FROM contacts WHERE id = ?').run(id);
    expect(performSearch('Frank', testDb).filter((r) => r.type === 'contact')).toHaveLength(0);
  });

  it('update trigger re-indexes the contact', () => {
    const id = insertContact(testDb, 'Grace Hopper');
    expect(performSearch('Hopper', testDb).filter((r) => r.type === 'contact')).toHaveLength(1);
    expect(performSearch('Miller', testDb).filter((r) => r.type === 'contact')).toHaveLength(0);
    testDb.prepare('UPDATE contacts SET name = ?, updated_at = ? WHERE id = ?').run('Grace Miller', Math.floor(Date.now() / 1000), id);
    expect(performSearch('Hopper', testDb).filter((r) => r.type === 'contact')).toHaveLength(0);
    expect(performSearch('Miller', testDb).filter((r) => r.type === 'contact')).toHaveLength(1);
  });
});

describe('performSearch — FTS input escaping', () => {
  it('treats FTS operator keywords as literal search terms', () => {
    const contactId = insertContact(testDb, 'Jane Smith');
    const projId = insertProject(testDb, 'Test Project');
    const membId = insertMembership(contactId, projId);
    insertLogEntry(membId, 'AND the source confirmed off the record');

    // "AND" would be an FTS operator without escaping; with escaping it matches literally
    const results = performSearch('AND', testDb).filter((r) => r.type === 'log');
    expect(results).toHaveLength(1);
  });

  it('does not throw on bare FTS punctuation', () => {
    expect(() => performSearch('"', testDb)).not.toThrow();
    expect(() => performSearch('()', testDb)).not.toThrow();
  });
});

describe('performSearch — FTS5 error classification', () => {
  it('swallows an fts5 syntax error and returns partial results (contacts/projects via LIKE)', () => {
    // Insert a contact that will be found by the LIKE fallback
    insertContact(testDb, 'Alice Syntax');

    // Monkey-patch prepare so that MATCH queries throw a syntax error
    const originalPrepare = testDb.prepare.bind(testDb);
    const spy = vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('MATCH')) {
        return {
          all: () => { throw new Error('fts5: syntax error at position 1'); },
        } as ReturnType<typeof testDb.prepare>;
      }
      return originalPrepare(sql);
    });

    let results: ReturnType<typeof performSearch>;
    expect(() => {
      results = performSearch('Alice', testDb);
    }).not.toThrow();

    // Contacts are still returned via LIKE
    expect(results!.filter((r) => r.type === 'contact')).toHaveLength(1);
    // No log results because FTS threw
    expect(results!.filter((r) => r.type === 'log')).toHaveLength(0);

    spy.mockRestore();
  });

  it('rethrows a non-syntax fts5 error (e.g. database corruption)', () => {
    const originalPrepare = testDb.prepare.bind(testDb);
    const spy = vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('MATCH')) {
        return {
          all: () => { throw new Error('fts5: database disk image is malformed'); },
        } as ReturnType<typeof testDb.prepare>;
      }
      return originalPrepare(sql);
    });

    expect(() => performSearch('anything', testDb)).toThrow('fts5: database disk image is malformed');

    spy.mockRestore();
  });
});
