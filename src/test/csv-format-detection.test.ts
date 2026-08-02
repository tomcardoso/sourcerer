import { beforeEach, describe, it, expect } from 'vitest';
import { createTestDb, insertProject } from './vitest.setup';
import { remapKnownCsvFormat, processImportRows } from '../main/ipc/import';
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

const GMAIL_HEADER = [
  'Name', 'Given Name', 'Family Name', 'Birthday', 'Notes',
  'E-mail 1 - Type', 'E-mail 1 - Value', 'E-mail 2 - Type', 'E-mail 2 - Value',
  'Phone 1 - Type', 'Phone 1 - Value',
  'Organization 1 - Type', 'Organization 1 - Name', 'Organization 1 - Title',
  'Website 1 - Type', 'Website 1 - Value',
];

const OUTLOOK_HEADER = [
  'First Name', 'Last Name', 'E-mail Address', 'E-mail 2 Address',
  'Business Phone', 'Mobile Phone', 'Company', 'Job Title', 'Web Page', 'Birthday', 'Notes',
];

describe('remapKnownCsvFormat — Gmail', () => {
  it('detects a Gmail export and remaps it to Sourcerer columns', () => {
    const row = [
      'Alice Smith', 'Alice', 'Smith', '1990-05-14', 'VIP source',
      '* ', 'alice@example.com', '', 'alicework@example.com',
      'Mobile', '+15551234567',
      '', 'Acme Corp', 'Reporter',
      '', 'https://linkedin.com/in/alicesmith',
    ];
    const [header, ...rows] = remapKnownCsvFormat([GMAIL_HEADER, row]);
    expect(header.map((h) => h.toLowerCase())).toEqual(
      ['name', 'organization', 'title', 'dob', 'notes', 'email', 'phone', 'linkedin', 'x', 'website'],
    );
    expect(rows).toEqual([[
      'Alice Smith', 'Acme Corp', 'Reporter', '1990-05-14', 'VIP source',
      'alice@example.com;alicework@example.com', '+15551234567',
      'https://linkedin.com/in/alicesmith', '', '',
    ]]);
  });

  it('falls back to Given Name + Family Name when Name is blank', () => {
    const row = ['', 'Alice', 'Smith', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    const [, remapped] = remapKnownCsvFormat([GMAIL_HEADER, row]);
    expect(remapped[0]).toBe('Alice Smith');
  });

  it('imports end-to-end into the database', () => {
    const row = [
      'Alice Smith', 'Alice', 'Smith', '1990-05-14', 'VIP source',
      '* ', 'alice@example.com', '', '',
      'Mobile', '+15551234567',
      '', 'Acme Corp', 'Reporter',
      '', '',
    ];
    const result = processImportRows(remapKnownCsvFormat([GMAIL_HEADER, row]), db, { ...BASE_OPTS, projectId });
    expect(result.imported).toBe(1);
    expect(result.skipped).toHaveLength(0);

    const contact = db.prepare('SELECT * FROM contacts WHERE name = ?').get('Alice Smith') as
      | { organization: string; title: string; dob: string } | undefined;
    expect(contact?.organization).toBe('Acme Corp');
    expect(contact?.title).toBe('Reporter');
    expect(contact?.dob).toBe('1990-05-14');
  });
});

describe('remapKnownCsvFormat — Outlook', () => {
  it('detects an Outlook export and remaps it to Sourcerer columns', () => {
    const row = [
      'Bob', 'Jones', 'bob@example.com', 'bob.jones@personal.com',
      '+1 555-987-6543', '', 'Globe Media', 'Editor', 'https://x.com/bobjones', '3/22/1985', 'Contact via referral',
    ];
    const [header, ...rows] = remapKnownCsvFormat([OUTLOOK_HEADER, row]);
    expect(header.map((h) => h.toLowerCase())).toEqual(
      ['name', 'organization', 'title', 'dob', 'notes', 'email', 'phone', 'linkedin', 'x', 'website'],
    );
    expect(rows).toEqual([[
      'Bob Jones', 'Globe Media', 'Editor', '1985-03-22', 'Contact via referral',
      'bob@example.com;bob.jones@personal.com', '+1 555-987-6543',
      '', 'https://x.com/bobjones', '',
    ]]);
  });

  it('imports end-to-end into the database', () => {
    const row = [
      'Bob', 'Jones', 'bob@example.com', '',
      '+15559876543', '', 'Globe Media', 'Editor', '', '', '',
    ];
    const result = processImportRows(remapKnownCsvFormat([OUTLOOK_HEADER, row]), db, BASE_OPTS);
    expect(result.imported).toBe(1);

    const contact = db.prepare('SELECT * FROM contacts WHERE name = ?').get('Bob Jones') as
      | { organization: string; title: string } | undefined;
    expect(contact?.organization).toBe('Globe Media');
    expect(contact?.title).toBe('Editor');

    const email = db.prepare(
      'SELECT email FROM contact_emails WHERE contact_id = (SELECT id FROM contacts WHERE name = ?)',
    ).get('Bob Jones') as { email: string } | undefined;
    expect(email?.email).toBe('bob@example.com');
  });
});

describe('remapKnownCsvFormat — generic CSV', () => {
  it('leaves a plain Sourcerer-format CSV unchanged', () => {
    const rows = [
      ['Name', 'Email'],
      ['Carol Diaz', 'carol@example.com'],
    ];
    expect(remapKnownCsvFormat(rows)).toEqual(rows);
  });

  it('leaves an empty rows array unchanged', () => {
    expect(remapKnownCsvFormat([])).toEqual([]);
  });
});
