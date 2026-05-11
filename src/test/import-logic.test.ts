import { beforeEach, describe, it, expect } from 'vitest';
import { createTestDb, insertContact, insertProject } from './vitest.setup';
import { processImportRows } from '../main/ipc/import';
import type { ProcessImportOptions } from '../main/ipc/import';
import type Database from 'better-sqlite3-multiple-ciphers';

let db: Database.Database;
let projectId: string;

const BASE_OPTS: ProcessImportOptions = {
  phoneCountry: 'US',
  reporterEmail: 'reporter@example.com',
  reporterName: 'Test Reporter',
};

beforeEach(() => {
  db = createTestDb();
  projectId = insertProject(db, 'Test Project');
});

describe('processImportRows — basic import', () => {
  it('imports a simple contact and returns imported count', () => {
    const result = processImportRows(
      [
        ['Name', 'Email'],
        ['Alice Smith', 'alice@example.com'],
      ],
      db,
      BASE_OPTS,
    );
    expect(result.imported).toBe(1);
    expect(result.skipped).toHaveLength(0);
    expect(result.cancelled).toBe(false);
  });

  it('returns empty result when there is only a header row', () => {
    const result = processImportRows([['Name', 'Email']], db, BASE_OPTS);
    expect(result.imported).toBe(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('returns empty result when rows array has fewer than 2 entries', () => {
    expect(processImportRows([], db, BASE_OPTS).imported).toBe(0);
    expect(processImportRows([['Name']], db, BASE_OPTS).imported).toBe(0);
  });

  it('skips rows with no name', () => {
    const result = processImportRows(
      [
        ['Name', 'Email'],
        ['', 'nobody@example.com'],
        ['Alice Smith', 'alice@example.com'],
      ],
      db,
      BASE_OPTS,
    );
    expect(result.imported).toBe(1);
  });
});

describe('processImportRows — name collision', () => {
  it('skips a row whose name already exists in the DB', () => {
    insertContact(db, 'Alice Smith');

    const result = processImportRows(
      [
        ['Name', 'Email'],
        ['Alice Smith', 'other@example.com'],
      ],
      db,
      BASE_OPTS,
    );
    expect(result.imported).toBe(0);
    expect(result.skipped).toEqual([{ name: 'Alice Smith', reason: 'name' }]);
  });

  it('name collision check is case-insensitive', () => {
    insertContact(db, 'alice smith');

    const result = processImportRows(
      [['Name', 'Email'], ['ALICE SMITH', 'new@example.com']],
      db,
      BASE_OPTS,
    );
    expect(result.skipped[0].reason).toBe('name');
  });
});

describe('processImportRows — email collision', () => {
  it('skips a row whose email already exists in the DB', () => {
    insertContact(db, 'Pre-existing Contact', { emails: ['shared@example.com'] });

    const result = processImportRows(
      [
        ['Name', 'Email'],
        ['New Person', 'shared@example.com'],
      ],
      db,
      BASE_OPTS,
    );
    expect(result.skipped).toEqual([{ name: 'New Person', reason: 'email' }]);
  });
});

describe('processImportRows — intra-file duplicate detection', () => {
  it('second row sharing an email with first is skipped mid-import', () => {
    const result = processImportRows(
      [
        ['Name', 'Email'],
        ['Alice Smith', 'alice@example.com'],
        ['Alice Duplicate', 'alice@example.com'],
      ],
      db,
      BASE_OPTS,
    );
    expect(result.imported).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('email');
  });
});

describe('processImportRows — phone normalisation', () => {
  it('imports a contact without a phone when the phone format is unrecognised', () => {
    const result = processImportRows(
      [['Name', 'Phone'], ['Alice Smith', 'not-a-phone']],
      db,
      BASE_OPTS,
    );
    expect(result.imported).toBe(1);
    const contacts = db
      .prepare('SELECT id FROM contacts WHERE name = ?')
      .all('Alice Smith') as { id: string }[];
    expect(contacts).toHaveLength(1);
    const phones = db
      .prepare('SELECT phone FROM contact_phones WHERE contact_id = ?')
      .all(contacts[0].id);
    expect(phones).toHaveLength(0);
  });

  it('normalises a valid phone to international format', () => {
    const result = processImportRows(
      [['Name', 'Phone'], ['Bob Jones', '+12024561111']],
      db,
      BASE_OPTS,
    );
    expect(result.imported).toBe(1);
    const contact = db.prepare('SELECT id FROM contacts WHERE name = ?').get('Bob Jones') as { id: string };
    const phone = db
      .prepare('SELECT phone FROM contact_phones WHERE contact_id = ?')
      .get(contact.id) as { phone: string } | undefined;
    expect(phone).toBeDefined();
    expect(phone!.phone).toMatch(/^\+1/);
  });
});

describe('processImportRows — project membership', () => {
  it('creates a membership row when projectId is provided', () => {
    const result = processImportRows(
      [['Name', 'Email'], ['Alice Smith', 'alice@example.com']],
      db,
      { ...BASE_OPTS, projectId },
    );
    expect(result.imported).toBe(1);
    const contact = db.prepare('SELECT id FROM contacts WHERE name = ?').get('Alice Smith') as { id: string };
    const membership = db
      .prepare('SELECT id FROM project_memberships WHERE contact_id = ? AND project_id = ?')
      .get(contact.id, projectId);
    expect(membership).toBeDefined();
  });

  it('does NOT create a membership row when projectId is absent', () => {
    processImportRows(
      [['Name', 'Email'], ['Alice Smith', 'alice@example.com']],
      db,
      BASE_OPTS,
    );
    const count = (
      db.prepare('SELECT COUNT(*) AS n FROM project_memberships').get() as { n: number }
    ).n;
    expect(count).toBe(0);
  });

  it('sets status to null when status value is not in status_options', () => {
    processImportRows(
      [['Name', 'Status'], ['Alice Smith', 'InvalidStatus']],
      db,
      { ...BASE_OPTS, projectId },
    );
    const contact = db.prepare('SELECT id FROM contacts WHERE name = ?').get('Alice Smith') as { id: string };
    const membership = db
      .prepare('SELECT status FROM project_memberships WHERE contact_id = ?')
      .get(contact.id) as { status: string | null };
    expect(membership.status).toBeNull();
  });

  it('sets a valid status from status_options', () => {
    processImportRows(
      [['Name', 'Status'], ['Alice Smith', 'Declined']],
      db,
      { ...BASE_OPTS, projectId },
    );
    const contact = db.prepare('SELECT id FROM contacts WHERE name = ?').get('Alice Smith') as { id: string };
    const membership = db
      .prepare('SELECT status FROM project_memberships WHERE contact_id = ?')
      .get(contact.id) as { status: string | null };
    expect(membership.status).toBe('Declined');
  });

  it('sets priority to null when priority value is not in priority_options', () => {
    processImportRows(
      [['Name', 'Priority'], ['Alice Smith', 'UltraMega']],
      db,
      { ...BASE_OPTS, projectId },
    );
    const contact = db.prepare('SELECT id FROM contacts WHERE name = ?').get('Alice Smith') as { id: string };
    const membership = db
      .prepare('SELECT priority FROM project_memberships WHERE contact_id = ?')
      .get(contact.id) as { priority: string | null };
    expect(membership.priority).toBeNull();
  });
});
