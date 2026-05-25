import { beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createTestDb, insertContact, insertProject } from './vitest.setup';
import { parseVcf, processVcfContacts } from '../main/ipc/import';
import type { ProcessImportOptions, VcfContact } from '../main/ipc/import';
import type Database from 'better-sqlite3-multiple-ciphers';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

// ---------------------------------------------------------------------------
// parseVcf
// ---------------------------------------------------------------------------

describe('parseVcf — single contact', () => {
  it('parses FN, ORG, NOTE, EMAIL, TEL, URL', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Alice Smith',
      'ORG:Acme Corp',
      'NOTE:A journalist.',
      'EMAIL:alice@example.com',
      'TEL:+12024561111',
      'URL:https://example.com',
      'END:VCARD',
    ].join('\r\n');

    const contacts = parseVcf(vcf);
    expect(contacts).toHaveLength(1);
    const c = contacts[0];
    expect(c.name).toBe('Alice Smith');
    expect(c.organization).toBe('Acme Corp');
    expect(c.notes).toBe('A journalist.');
    expect(c.emails).toEqual(['alice@example.com']);
    expect(c.phones).toEqual(['+12024561111']);
    expect(c.urls).toEqual(['https://example.com']);
  });

  it('accepts LF-only line endings', () => {
    const vcf = 'BEGIN:VCARD\nFN:Bob Jones\nEND:VCARD\n';
    const [c] = parseVcf(vcf);
    expect(c.name).toBe('Bob Jones');
  });

  it('returns a contact with empty name when FN and N are both absent', () => {
    const vcf = ['BEGIN:VCARD', 'EMAIL:anon@example.com', 'END:VCARD'].join('\n');
    const contacts = parseVcf(vcf);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe('');
  });

  it('synthesises name from N field when FN is absent', () => {
    const vcf = ['BEGIN:VCARD', 'N:Smith;Alice;M;;', 'EMAIL:alice@example.com', 'END:VCARD'].join('\n');
    const [c] = parseVcf(vcf);
    expect(c.name).toBe('Alice M Smith');
  });

  it('prefers FN over N when both are present', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'N:Smith;Alice;;;', 'END:VCARD'].join('\n');
    const [c] = parseVcf(vcf);
    expect(c.name).toBe('Alice Smith');
  });

  it('handles escaped semicolons in N field components', () => {
    const vcf = ['BEGIN:VCARD', 'N:Smith\\;Jr;Alice;;;', 'END:VCARD'].join('\n');
    const [c] = parseVcf(vcf);
    expect(c.name).toBe('Alice Smith;Jr');
  });

  it('returns a contact with empty name when FN is empty', () => {
    const vcf = ['BEGIN:VCARD', 'FN:', 'END:VCARD'].join('\n');
    const contacts = parseVcf(vcf);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe('');
  });
});

describe('parseVcf — multi-contact file', () => {
  it('parses all contacts in a multi-vCard file', () => {
    const vcf = [
      'BEGIN:VCARD', 'FN:Alice Smith', 'END:VCARD',
      'BEGIN:VCARD', 'FN:Bob Jones', 'END:VCARD',
      'BEGIN:VCARD', 'FN:Carol White', 'END:VCARD',
    ].join('\n');

    const contacts = parseVcf(vcf);
    expect(contacts).toHaveLength(3);
    expect(contacts.map((c) => c.name)).toEqual(['Alice Smith', 'Bob Jones', 'Carol White']);
  });

  it('returns all blocks including nameless ones', () => {
    const vcf = [
      'BEGIN:VCARD', 'FN:Good Contact', 'END:VCARD',
      'BEGIN:VCARD', 'NOTE:no name here', 'END:VCARD',
    ].join('\n');
    const contacts = parseVcf(vcf);
    expect(contacts).toHaveLength(2);
    expect(contacts[0].name).toBe('Good Contact');
    expect(contacts[1].name).toBe('');
  });
});

describe('parseVcf — line folding', () => {
  it('unfolds continuation lines (CRLF + space)', () => {
    const vcf = [
      'BEGIN:VCARD',
      'FN:Alice',
      'NOTE:This is a very long note that has been folded\r\n  across two lines.',
      'END:VCARD',
    ].join('\r\n');

    const [c] = parseVcf(vcf);
    expect(c.notes).toBe('This is a very long note that has been folded across two lines.');
  });

  it('unfolds continuation lines (LF + tab)', () => {
    const vcf = 'BEGIN:VCARD\nFN:Alice\nNOTE:line one\n\tcontinued\nEND:VCARD';
    const [c] = parseVcf(vcf);
    expect(c.notes).toBe('line onecontinued');
  });
});

describe('parseVcf — property parameters', () => {
  it('ignores TYPE and other parameters on EMAIL', () => {
    const vcf = [
      'BEGIN:VCARD',
      'FN:Alice Smith',
      'EMAIL;TYPE=WORK:work@example.com',
      'EMAIL;TYPE=HOME:home@example.com',
      'END:VCARD',
    ].join('\n');

    const [c] = parseVcf(vcf);
    expect(c.emails).toEqual(['work@example.com', 'home@example.com']);
  });

  it('ignores TYPE parameters on TEL', () => {
    const vcf = [
      'BEGIN:VCARD',
      'FN:Alice Smith',
      'TEL;TYPE=CELL:+12024561111',
      'TEL;TYPE=WORK:+12024562222',
      'END:VCARD',
    ].join('\n');

    const [c] = parseVcf(vcf);
    expect(c.phones).toEqual(['+12024561111', '+12024562222']);
  });

  it('takes only the first ORG component', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'ORG:Acme Corp;Legal', 'END:VCARD'].join('\n');
    const [c] = parseVcf(vcf);
    expect(c.organization).toBe('Acme Corp');
  });

  it('parses grouped properties (e.g. item1.EMAIL from Apple/Google exports)', () => {
    const vcf = [
      'BEGIN:VCARD',
      'FN:Alice Smith',
      'item1.EMAIL;TYPE=INTERNET:work@example.com',
      'item2.EMAIL;TYPE=INTERNET:home@example.com',
      'item3.URL:https://example.com',
      'END:VCARD',
    ].join('\n');

    const [c] = parseVcf(vcf);
    expect(c.emails).toEqual(['work@example.com', 'home@example.com']);
    expect(c.urls).toEqual(['https://example.com']);
  });
});

describe('parseVcf — escape sequences', () => {
  it('decodes \\, \\; \\\\ in values', () => {
    const vcf = [
      'BEGIN:VCARD',
      'FN:Alice Smith',
      'NOTE:commas\\, semicolons\\; backslash\\\\',
      'END:VCARD',
    ].join('\n');

    const [c] = parseVcf(vcf);
    expect(c.notes).toBe('commas, semicolons; backslash\\');
  });

  it('decodes \\n in NOTE as a real newline', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'NOTE:line one\\nline two', 'END:VCARD'].join('\n');
    const [c] = parseVcf(vcf);
    expect(c.notes).toBe('line one\nline two');
  });
});

describe('parseVcf — missing optional fields', () => {
  it('returns null for organization when ORG is absent', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'END:VCARD'].join('\n');
    expect(parseVcf(vcf)[0].organization).toBeNull();
  });

  it('returns null for notes when NOTE is absent', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'END:VCARD'].join('\n');
    expect(parseVcf(vcf)[0].notes).toBeNull();
  });

  it('returns null for title when TITLE is absent', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'END:VCARD'].join('\n');
    expect(parseVcf(vcf)[0].title).toBeNull();
  });

  it('returns empty arrays when EMAIL/TEL/URL/IMPP are absent', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'END:VCARD'].join('\n');
    const [c] = parseVcf(vcf);
    expect(c.emails).toEqual([]);
    expect(c.phones).toEqual([]);
    expect(c.urls).toEqual([]);
    expect(c.handles).toEqual([]);
  });
});

describe('parseVcf — TITLE', () => {
  it('parses a TITLE field', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'TITLE:Senior Reporter', 'END:VCARD'].join('\n');
    expect(parseVcf(vcf)[0].title).toBe('Senior Reporter');
  });
});

describe('parseVcf — BDAY', () => {
  it('parses YYYYMMDD format', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'BDAY:19790322', 'END:VCARD'].join('\n');
    expect(parseVcf(vcf)[0].dob).toBe('1979-03-22');
  });

  it('parses YYYY-MM-DD format (ISO 8601)', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'BDAY:1979-03-22', 'END:VCARD'].join('\n');
    expect(parseVcf(vcf)[0].dob).toBe('1979-03-22');
  });

  it('strips time component from YYYYMMDDTHHMMSSZ', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'BDAY:19790322T000000Z', 'END:VCARD'].join('\n');
    expect(parseVcf(vcf)[0].dob).toBe('1979-03-22');
  });

  it('returns null for year-unknown --MMDD format', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'BDAY:--0322', 'END:VCARD'].join('\n');
    expect(parseVcf(vcf)[0].dob).toBeNull();
  });

  it('returns null for year-unknown --MM-DD format', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'BDAY:--03-22', 'END:VCARD'].join('\n');
    expect(parseVcf(vcf)[0].dob).toBeNull();
  });

  it('returns null for an unrecognised format', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'BDAY:March 22 1979', 'END:VCARD'].join('\n');
    expect(parseVcf(vcf)[0].dob).toBeNull();
  });

  it('returns null when BDAY is absent', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'END:VCARD'].join('\n');
    expect(parseVcf(vcf)[0].dob).toBeNull();
  });
});

describe('parseVcf — IMPP handles', () => {
  it('parses a Signal IMPP field', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'IMPP;X-SERVICE-TYPE=Signal:signal:%2B1%20555%200001', 'END:VCARD'].join('\n');
    const [c] = parseVcf(vcf);
    expect(c.handles).toEqual([{ type: 'signal', handle: '+1 555 0001' }]);
  });

  it('parses a WhatsApp IMPP field', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'IMPP:whatsapp:%2B1%20555%200002', 'END:VCARD'].join('\n');
    const [c] = parseVcf(vcf);
    expect(c.handles).toEqual([{ type: 'whatsapp', handle: '+1 555 0002' }]);
  });

  it('parses a Telegram IMPP field', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'IMPP:telegram:%40username', 'END:VCARD'].join('\n');
    const [c] = parseVcf(vcf);
    expect(c.handles).toEqual([{ type: 'telegram', handle: '@username' }]);
  });

  it('maps an unknown IMPP scheme to other', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'IMPP:xmpp:user@example.com', 'END:VCARD'].join('\n');
    const [c] = parseVcf(vcf);
    expect(c.handles).toEqual([{ type: 'other', handle: 'user@example.com' }]);
  });

  it('ignores an IMPP with no handle value', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Alice Smith', 'IMPP:signal:', 'END:VCARD'].join('\n');
    expect(parseVcf(vcf)[0].handles).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// processVcfContacts
// ---------------------------------------------------------------------------

let db: Database.Database;
let projectId: string;

const BASE_OPTS: ProcessImportOptions = {
  phoneCountry: 'US',
  reporterEmail: 'reporter@example.com',
  reporterName: 'Test Reporter',
};

function makeContact(overrides: Partial<VcfContact> = {}): VcfContact {
  return {
    name: 'Alice Smith',
    organization: null,
    title: null,
    dob: null,
    notes: null,
    emails: [],
    phones: [],
    urls: [],
    handles: [],
    ...overrides,
  };
}

beforeEach(() => {
  db = createTestDb();
  projectId = insertProject(db, 'Test Project');
});

describe('processVcfContacts — missing name', () => {
  it('skips a nameless contact and reports missing-name', () => {
    const result = processVcfContacts([makeContact({ name: '' })], db, BASE_OPTS);
    expect(result.imported).toBe(0);
    expect(result.skipped).toEqual([{ name: '(unnamed contact)', reason: 'missing-name' }]);
  });
});

describe('processVcfContacts — basic import', () => {
  it('imports a contact and returns imported count', () => {
    const result = processVcfContacts([makeContact()], db, BASE_OPTS);
    expect(result.imported).toBe(1);
    expect(result.skipped).toHaveLength(0);
    expect(result.cancelled).toBe(false);
  });

  it('returns 0 imported for an empty array', () => {
    expect(processVcfContacts([], db, BASE_OPTS).imported).toBe(0);
  });

  it('stores organization and notes', () => {
    processVcfContacts(
      [makeContact({ organization: 'Acme Corp', notes: 'A note.' })],
      db,
      BASE_OPTS,
    );
    const row = db
      .prepare('SELECT organization, notes FROM contacts WHERE name = ?')
      .get('Alice Smith') as { organization: string | null; notes: string | null };
    expect(row.organization).toBe('Acme Corp');
    expect(row.notes).toBe('A note.');
  });

  it('stores a valid dob in the database', () => {
    processVcfContacts([makeContact({ dob: '1979-03-22' })], db, BASE_OPTS);
    const row = db
      .prepare('SELECT dob FROM contacts WHERE name = ?')
      .get('Alice Smith') as { dob: string | null };
    expect(row.dob).toBe('1979-03-22');
  });

  it('stores null dob when absent', () => {
    processVcfContacts([makeContact()], db, BASE_OPTS);
    const row = db
      .prepare('SELECT dob FROM contacts WHERE name = ?')
      .get('Alice Smith') as { dob: string | null };
    expect(row.dob).toBeNull();
  });

  it('stores all email addresses', () => {
    processVcfContacts(
      [makeContact({ emails: ['a@example.com', 'b@example.com'] })],
      db,
      BASE_OPTS,
    );
    const contact = db
      .prepare('SELECT id FROM contacts WHERE name = ?')
      .get('Alice Smith') as { id: string };
    const emails = db
      .prepare('SELECT email FROM contact_emails WHERE contact_id = ? ORDER BY sort_order')
      .all(contact.id) as { email: string }[];
    expect(emails.map((r) => r.email)).toEqual(['a@example.com', 'b@example.com']);
  });

  it('stores URLs as website links', () => {
    processVcfContacts(
      [makeContact({ urls: ['https://example.com', 'https://blog.example.com'] })],
      db,
      BASE_OPTS,
    );
    const contact = db
      .prepare('SELECT id FROM contacts WHERE name = ?')
      .get('Alice Smith') as { id: string };
    const links = db
      .prepare("SELECT url, type FROM contact_links WHERE contact_id = ? ORDER BY sort_order")
      .all(contact.id) as { url: string; type: string }[];
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.type === 'website')).toBe(true);
    expect(links.map((l) => l.url)).toEqual(['https://example.com', 'https://blog.example.com']);
  });
});

describe('processVcfContacts — collision detection', () => {
  it('skips a contact whose name already exists', () => {
    insertContact(db, 'Alice Smith');
    const result = processVcfContacts(
      [makeContact({ emails: ['new@example.com'] })],
      db,
      BASE_OPTS,
    );
    expect(result.imported).toBe(0);
    expect(result.skipped).toEqual([{ name: 'Alice Smith', reason: 'name' }]);
  });

  it('name collision check is case-insensitive', () => {
    insertContact(db, 'alice smith');
    const result = processVcfContacts([makeContact()], db, BASE_OPTS);
    expect(result.skipped[0].reason).toBe('name');
  });

  it('skips a contact whose email already exists', () => {
    insertContact(db, 'Existing Person', { emails: ['shared@example.com'] });
    const result = processVcfContacts(
      [makeContact({ name: 'New Person', emails: ['shared@example.com'] })],
      db,
      BASE_OPTS,
    );
    expect(result.skipped).toEqual([{ name: 'New Person', reason: 'email' }]);
  });

  it('detects intra-file email duplicates', () => {
    const result = processVcfContacts(
      [
        makeContact({ name: 'Alice Smith', emails: ['alice@example.com'] }),
        makeContact({ name: 'Alice Duplicate', emails: ['alice@example.com'] }),
      ],
      db,
      BASE_OPTS,
    );
    expect(result.imported).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('email');
  });
});

describe('processVcfContacts — per-contact deduplication', () => {
  it('dedupes duplicate emails within a single vCard', () => {
    const result = processVcfContacts(
      [makeContact({ emails: ['alice@example.com', 'alice@example.com'] })],
      db,
      BASE_OPTS,
    );
    expect(result.imported).toBe(1);
    const contact = db.prepare('SELECT id FROM contacts WHERE name = ?').get('Alice Smith') as { id: string };
    const emails = db.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(contact.id);
    expect(emails).toHaveLength(1);
  });

  it('dedupes duplicate URLs within a single vCard', () => {
    processVcfContacts(
      [makeContact({ urls: ['https://example.com', 'https://example.com'] })],
      db,
      BASE_OPTS,
    );
    const contact = db.prepare('SELECT id FROM contacts WHERE name = ?').get('Alice Smith') as { id: string };
    const links = db.prepare('SELECT url FROM contact_links WHERE contact_id = ?').all(contact.id);
    expect(links).toHaveLength(1);
  });
});

describe('processVcfContacts — phone normalisation', () => {
  it('normalises a valid US phone to international format', () => {
    processVcfContacts(
      [makeContact({ phones: ['+12024561111'] })],
      db,
      BASE_OPTS,
    );
    const contact = db
      .prepare('SELECT id FROM contacts WHERE name = ?')
      .get('Alice Smith') as { id: string };
    const phone = db
      .prepare('SELECT phone FROM contact_phones WHERE contact_id = ?')
      .get(contact.id) as { phone: string } | undefined;
    expect(phone?.phone).toMatch(/^\+1/);
  });

  it('drops phones that cannot be normalised', () => {
    processVcfContacts(
      [makeContact({ phones: ['not-a-phone'] })],
      db,
      BASE_OPTS,
    );
    const contact = db
      .prepare('SELECT id FROM contacts WHERE name = ?')
      .get('Alice Smith') as { id: string };
    const phones = db
      .prepare('SELECT phone FROM contact_phones WHERE contact_id = ?')
      .all(contact.id);
    expect(phones).toHaveLength(0);
  });
});

describe('processVcfContacts — project membership', () => {
  it('creates a membership row when projectId is provided', () => {
    processVcfContacts([makeContact()], db, { ...BASE_OPTS, projectId });
    const contact = db
      .prepare('SELECT id FROM contacts WHERE name = ?')
      .get('Alice Smith') as { id: string };
    const membership = db
      .prepare('SELECT id FROM project_memberships WHERE contact_id = ? AND project_id = ?')
      .get(contact.id, projectId);
    expect(membership).toBeDefined();
  });

  it('does not create a membership row when projectId is absent', () => {
    processVcfContacts([makeContact()], db, BASE_OPTS);
    const count = (
      db.prepare('SELECT COUNT(*) AS n FROM project_memberships').get() as { n: number }
    ).n;
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fixture: test-contacts.vcf
// ---------------------------------------------------------------------------

describe('parseVcf — test-contacts.vcf fixture', () => {
  const vcf = readFileSync(resolve(__dirname, 'test-contacts.vcf'), 'utf-8');
  const contacts = parseVcf(vcf);

  it('parses all 4 contacts', () => {
    expect(contacts).toHaveLength(4);
    expect(contacts.map((c) => c.name)).toEqual([
      'Catherine Mwangi',
      'James Rutherford',
      'Amara Diallo',
      'Sofia Reinholt',
    ]);
  });

  it('Catherine Mwangi — org, two emails, phone, URL, notes', () => {
    const c = contacts[0];
    expect(c.organization).toBe('National Export Finance Corporation');
    expect(c.emails).toEqual(['c.mwangi@nefc.go.ke', 'cat.mwangi@gmail.com']);
    expect(c.phones).toEqual(['+254712345678']);
    expect(c.urls).toEqual(['https://nefc.go.ke/staff/mwangi']);
    expect(c.notes).toContain('Whistleblower contact');
  });

  it('James Rutherford — minimal contact, no notes or URL', () => {
    const c = contacts[1];
    expect(c.organization).toBe('Department of Finance');
    expect(c.emails).toEqual(['j.rutherford@finance.gov.ca']);
    expect(c.phones).toEqual(['+16135550192']);
    expect(c.urls).toHaveLength(0);
    expect(c.notes).toBeNull();
  });

  it('Amara Diallo — two emails, two phones, two URLs', () => {
    const c = contacts[2];
    expect(c.emails).toHaveLength(2);
    expect(c.phones).toHaveLength(2);
    expect(c.urls).toHaveLength(2);
  });

  it('Sofia Reinholt — escaped semicolon in notes decoded correctly', () => {
    const c = contacts[3];
    expect(c.notes).toBe('Freelance; covers EU regulatory affairs. Prefers email.');
  });
});
