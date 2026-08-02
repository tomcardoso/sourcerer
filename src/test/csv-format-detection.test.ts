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
    const { rows: remapped, droppedFields } = remapKnownCsvFormat([GMAIL_HEADER, row]);
    const [header, ...dataRows] = remapped;
    expect(header.map((h) => h.toLowerCase())).toEqual(
      ['name', 'organization', 'title', 'dob', 'notes', 'email', 'phone', 'linkedin', 'x', 'website'],
    );
    expect(dataRows).toEqual([[
      'Alice Smith', 'Acme Corp', 'Reporter', '1990-05-14', 'VIP source',
      'alice@example.com;alicework@example.com', '+15551234567',
      'https://linkedin.com/in/alicesmith', '', '',
    ]]);
    expect(droppedFields).toEqual([]);
  });

  it('falls back to Given Name + Family Name when Name is blank', () => {
    const row = ['', 'Alice', 'Smith', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    const { rows: remapped } = remapKnownCsvFormat([GMAIL_HEADER, row]);
    expect(remapped[1][0]).toBe('Alice Smith');
  });

  it('imports end-to-end into the database', () => {
    const row = [
      'Alice Smith', 'Alice', 'Smith', '1990-05-14', 'VIP source',
      '* ', 'alice@example.com', '', '',
      'Mobile', '+15551234567',
      '', 'Acme Corp', 'Reporter',
      '', '',
    ];
    const { rows: remapped } = remapKnownCsvFormat([GMAIL_HEADER, row]);
    const result = processImportRows(remapped, db, { ...BASE_OPTS, projectId });
    expect(result.imported).toBe(1);
    expect(result.skipped).toHaveLength(0);

    const contact = db.prepare('SELECT * FROM contacts WHERE name = ?').get('Alice Smith') as
      | { organization: string; title: string; dob: string } | undefined;
    expect(contact?.organization).toBe('Acme Corp');
    expect(contact?.title).toBe('Reporter');
    expect(contact?.dob).toBe('1990-05-14');
  });

  it('reports source columns that carried data but have no home in Sourcerer', () => {
    const header = [...GMAIL_HEADER, 'Address 1 - Street', 'Nickname'];
    const row = [
      'Alice Smith', 'Alice', 'Smith', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '123 Main St', '',
    ];
    const { droppedFields } = remapKnownCsvFormat([header, row]);
    expect(droppedFields).toEqual(['Address 1 - Street']);
  });

  it('does not report unused columns when every row leaves them blank', () => {
    const header = [...GMAIL_HEADER, 'Address 1 - Street'];
    const row = ['Alice Smith', 'Alice', 'Smith', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    const { droppedFields } = remapKnownCsvFormat([header, row]);
    expect(droppedFields).toEqual([]);
  });
});

// Google's current contacts CSV schema (its own official import template,
// and what a fresh Google Contacts export produces) — First/Last Name and
// unprefixed Organization Name/Title, not the legacy Given/Family Name +
// "Organization 1 -" variant covered above.
const GMAIL_REAL_HEADER = [
  'Name Prefix', 'First Name', 'Middle Name', 'Last Name', 'Name Suffix',
  'Phonetic First Name', 'Phonetic Middle Name', 'Phonetic Last Name', 'Nickname', 'File As',
  'E-mail 1 - Label', 'E-mail 1 - Value', 'Phone 1 - Label', 'Phone 1 - Value',
  'Address 1 - Label', 'Address 1 - Country', 'Address 1 - Street', 'Address 1 - Extended Address',
  'Address 1 - City', 'Address 1 - Region', 'Address 1 - Postal Code', 'Address 1 - PO Box',
  'Organization Name', 'Organization Title', 'Organization Department', 'Birthday',
  'Event 1 - Label', 'Event 1 - Value', 'Relation 1 - Label', 'Relation 1 - Value',
  'Website 1 - Label', 'Website 1 - Value', 'Custom Field 1 - Label', 'Custom Field 1 - Value',
  'Notes', 'Labels',
];

describe('remapKnownCsvFormat — Gmail (current real-world schema)', () => {
  it('remaps First/Last Name and unprefixed Organization Name/Title', () => {
    const row = GMAIL_REAL_HEADER.map((h) => {
      switch (h) {
        case 'First Name': return 'Alice';
        case 'Last Name': return 'Smith';
        case 'E-mail 1 - Value': return 'alice@example.com';
        case 'Phone 1 - Value': return '+15551234567';
        case 'Organization Name': return 'Acme Corp';
        case 'Organization Title': return 'Reporter';
        case 'Birthday': return '1990-05-14';
        case 'Website 1 - Value': return 'https://example.com/alice';
        case 'Notes': return 'VIP source';
        default: return '';
      }
    });
    const { rows: remapped } = remapKnownCsvFormat([GMAIL_REAL_HEADER, row]);
    expect(remapped[1]).toEqual([
      'Alice Smith', 'Acme Corp', 'Reporter', '1990-05-14', 'VIP source',
      'alice@example.com', '+15551234567', '', '', 'https://example.com/alice',
    ]);
  });

  it('flags populated address/relation/custom fields as dropped', () => {
    const row = GMAIL_REAL_HEADER.map((h) => {
      switch (h) {
        case 'First Name': return 'Alice';
        case 'Last Name': return 'Smith';
        case 'Address 1 - Street': return '123 Main St';
        case 'Relation 1 - Value': return 'Jane Smith';
        case 'Custom Field 1 - Value': return 'Editor pref';
        default: return '';
      }
    });
    const { droppedFields } = remapKnownCsvFormat([GMAIL_REAL_HEADER, row]);
    expect(droppedFields).toContain('Address 1 - Street');
    expect(droppedFields).toContain('Relation 1 - Value');
    expect(droppedFields).toContain('Custom Field 1 - Value');
    // Populated label columns paired with those values are dropped too.
    expect(droppedFields).not.toContain('Name Prefix');
  });
});

describe('remapKnownCsvFormat — Outlook', () => {
  it('detects an Outlook export and remaps it to Sourcerer columns', () => {
    const row = [
      'Bob', 'Jones', 'bob@example.com', 'bob.jones@personal.com',
      '+1 555-987-6543', '', 'Globe Media', 'Editor', 'https://x.com/bobjones', '3/22/1985', 'Contact via referral',
    ];
    const { rows: remapped, droppedFields } = remapKnownCsvFormat([OUTLOOK_HEADER, row]);
    const [header, ...dataRows] = remapped;
    expect(header.map((h) => h.toLowerCase())).toEqual(
      ['name', 'organization', 'title', 'dob', 'notes', 'email', 'phone', 'linkedin', 'x', 'website'],
    );
    expect(dataRows).toEqual([[
      'Bob Jones', 'Globe Media', 'Editor', '1985-03-22', 'Contact via referral',
      'bob@example.com;bob.jones@personal.com', '+1 555-987-6543',
      '', 'https://x.com/bobjones', '',
    ]]);
    expect(droppedFields).toEqual([]);
  });

  it('imports end-to-end into the database', () => {
    const row = [
      'Bob', 'Jones', 'bob@example.com', '',
      '+15559876543', '', 'Globe Media', 'Editor', '', '', '',
    ];
    const { rows: remapped } = remapKnownCsvFormat([OUTLOOK_HEADER, row]);
    const result = processImportRows(remapped, db, BASE_OPTS);
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

  it('reports populated Outlook fields Sourcerer has no home for', () => {
    const header = [...OUTLOOK_HEADER, 'Home Street', 'Spouse', 'Anniversary'];
    const row = [
      'Bob', 'Jones', 'bob@example.com', '', '', '', 'Globe Media', 'Editor', '', '', '',
      '456 Oak Ave', 'Jane Jones', '',
    ];
    const { droppedFields } = remapKnownCsvFormat([header, row]);
    expect(droppedFields).toEqual(['Home Street', 'Spouse']);
  });
});

describe('remapKnownCsvFormat — generic CSV', () => {
  it('leaves a plain Sourcerer-format CSV unchanged, with no dropped fields', () => {
    const rows = [
      ['Name', 'Email'],
      ['Carol Diaz', 'carol@example.com'],
    ];
    const result = remapKnownCsvFormat(rows);
    expect(result.rows).toEqual(rows);
    expect(result.droppedFields).toEqual([]);
  });

  it('leaves an empty rows array unchanged', () => {
    const result = remapKnownCsvFormat([]);
    expect(result.rows).toEqual([]);
    expect(result.droppedFields).toEqual([]);
  });
});
