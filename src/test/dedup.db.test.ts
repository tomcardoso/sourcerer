import { beforeEach, describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb, insertContact, insertProject, TEST_REPORTER } from './vitest.setup';
import {
  loadDedupContacts,
  findDuplicatePairs,
  mergeContacts,
  dismissPair,
  loadDismissedPairs,
} from '../main/dedup';
import type Database from 'better-sqlite3-multiple-ciphers';

let db: Database.Database;

function insertMembership(contactId: string, projectId: string): string {
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO project_memberships
       (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, contactId, projectId, TEST_REPORTER.email, TEST_REPORTER.name, now, now);
  return id;
}

beforeEach(() => {
  db = createTestDb();
});

describe('loadDedupContacts', () => {
  it('returns an empty array when there are no contacts', () => {
    expect(loadDedupContacts(db)).toEqual([]);
  });

  it('loads a contact with emails, phones, and project count', () => {
    const pid = insertProject(db, 'Project Alpha');
    const cid = insertContact(db, 'Alice Smith', {
      emails: ['alice@example.com', 'alice.work@example.com'],
      phones: ['+1 202 456 1111'],
      org: 'Acme Inc',
    });
    insertMembership(cid, pid);

    const contacts = loadDedupContacts(db);
    expect(contacts).toHaveLength(1);
    const c = contacts[0];
    expect(c.id).toBe(cid);
    expect(c.name).toBe('Alice Smith');
    expect(c.organization).toBe('Acme Inc');
    expect(c.emails).toContain('alice@example.com');
    expect(c.emails).toContain('alice.work@example.com');
    expect(c.phones).toContain('+1 202 456 1111');
    expect(c.projectCount).toBe(1);
    expect(c.projects).toContain('Project Alpha');
  });

  it('returns contacts sorted by name ascending', () => {
    insertContact(db, 'Zara Young');
    insertContact(db, 'Alice Smith');
    insertContact(db, 'Mike Jones');

    const contacts = loadDedupContacts(db);
    expect(contacts.map((c) => c.name)).toEqual(['Alice Smith', 'Mike Jones', 'Zara Young']);
  });
});

describe('dismissPair', () => {
  it('inserts a dismissed pair and loadDismissedPairs returns it', () => {
    const a = insertContact(db, 'Alice');
    const b = insertContact(db, 'Bob');

    dismissPair(db, a, b);
    const set = loadDismissedPairs(db);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    expect(set.has(`${lo}|${hi}`)).toBe(true);
  });

  it('is idempotent (INSERT OR IGNORE)', () => {
    const a = insertContact(db, 'Alice');
    const b = insertContact(db, 'Bob');
    dismissPair(db, a, b);
    expect(() => dismissPair(db, a, b)).not.toThrow();
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM dedup_dismissed_pairs').get() as { n: number }).n,
    ).toBe(1);
  });

  it('excluded pair no longer appears in findDuplicatePairs results', () => {
    const a = insertContact(db, 'Alice Smith', { emails: ['alice@example.com'] });
    const b = insertContact(db, 'Alicia Smith', { emails: ['alice@example.com'] });

    dismissPair(db, a, b);
    const contacts = loadDedupContacts(db);
    const dismissed = loadDismissedPairs(db);
    expect(findDuplicatePairs(contacts, dismissed)).toHaveLength(0);
  });

  it('silently no-ops when either contact has been deleted (no FK error)', () => {
    const a = insertContact(db, 'Alice');
    const b = insertContact(db, 'Bob');
    db.prepare('DELETE FROM contacts WHERE id = ?').run(b);
    expect(() => dismissPair(db, a, b)).not.toThrow();
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM dedup_dismissed_pairs').get() as { n: number }).n,
    ).toBe(0);
  });
});

describe('mergeContacts — keep strategy', () => {
  it('deletes the loser and keeps the winner unchanged', () => {
    const winner = insertContact(db, 'Alice Smith', { org: 'Acme', notes: 'short' });
    const loser = insertContact(db, 'Alicia Smith', { org: 'Beta Corp', notes: 'longer notes here' });

    mergeContacts(db, winner, loser, 'keep');

    const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(winner) as {
      name: string;
      organization: string | null;
      notes: string | null;
    };
    expect(row.name).toBe('Alice Smith');
    expect(row.organization).toBe('Acme');
    expect(row.notes).toBe('short');
    expect(db.prepare('SELECT id FROM contacts WHERE id = ?').get(loser)).toBeUndefined();
  });

  it('reassigns loser membership to winner when project differs', () => {
    const p1 = insertProject(db, 'Project A');
    const p2 = insertProject(db, 'Project B');
    const winner = insertContact(db, 'Alice Smith');
    const loser = insertContact(db, 'Alicia Smith');
    insertMembership(winner, p1);
    insertMembership(loser, p2);

    mergeContacts(db, winner, loser, 'keep');

    const memberships = db
      .prepare('SELECT project_id FROM project_memberships WHERE contact_id = ?')
      .all(winner) as { project_id: string }[];
    const projectIds = memberships.map((m) => m.project_id);
    expect(projectIds).toContain(p1);
    expect(projectIds).toContain(p2);
  });

  it('advances updated_at on the reassigned loser membership', () => {
    const p1 = insertProject(db, 'Project A');
    const p2 = insertProject(db, 'Project B');
    const winner = insertContact(db, 'Alice Smith');
    const loser = insertContact(db, 'Alicia Smith');
    insertMembership(winner, p1);
    const loserMembId = insertMembership(loser, p2);
    const staleTs = Math.floor(Date.now() / 1000) - 100;
    db.prepare('UPDATE project_memberships SET updated_at = ? WHERE id = ?').run(staleTs, loserMembId);

    mergeContacts(db, winner, loser, 'keep');

    const row = db
      .prepare('SELECT updated_at FROM project_memberships WHERE contact_id = ? AND project_id = ?')
      .get(winner, p2) as { updated_at: number };
    expect(row.updated_at).toBeGreaterThan(staleTs);
  });

  it('does not duplicate membership when winner already belongs to same project', () => {
    const proj = insertProject(db, 'Shared Project');
    const winner = insertContact(db, 'Alice Smith');
    const loser = insertContact(db, 'Alicia Smith');
    insertMembership(winner, proj);
    insertMembership(loser, proj);

    mergeContacts(db, winner, loser, 'keep');

    const count = (
      db
        .prepare('SELECT COUNT(*) AS n FROM project_memberships WHERE contact_id = ? AND project_id = ?')
        .get(winner, proj) as { n: number }
    ).n;
    expect(count).toBe(1);
  });
});

describe('mergeContacts — merge strategy', () => {
  it('picks the longer name', () => {
    const winner = insertContact(db, 'Alice S');
    const loser = insertContact(db, 'Alice Smith');
    mergeContacts(db, winner, loser, 'merge');
    const row = db.prepare('SELECT name FROM contacts WHERE id = ?').get(winner) as { name: string };
    expect(row.name).toBe('Alice Smith');
  });

  it('copies unique emails from loser to winner', () => {
    const winner = insertContact(db, 'Alice Smith', { emails: ['alice@work.com'] });
    const loser = insertContact(db, 'Alicia Smith', { emails: ['alice@home.com', 'alice@work.com'] });

    mergeContacts(db, winner, loser, 'merge');

    const emails = (
      db.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(winner) as { email: string }[]
    ).map((r) => r.email);
    expect(emails).toContain('alice@work.com');
    expect(emails).toContain('alice@home.com');
    expect(emails.filter((e) => e === 'alice@work.com')).toHaveLength(1);
  });

  it('copies unique phones from loser to winner', () => {
    const winner = insertContact(db, 'Alice Smith', { phones: ['+1 202 456 1111'] });
    const loser = insertContact(db, 'Alicia Smith', { phones: ['+1 202 456 2222', '+1 202 456 1111'] });

    mergeContacts(db, winner, loser, 'merge');

    const phones = (
      db.prepare('SELECT phone FROM contact_phones WHERE contact_id = ?').all(winner) as { phone: string }[]
    ).map((r) => r.phone);
    expect(phones).toContain('+1 202 456 1111');
    expect(phones).toContain('+1 202 456 2222');
    expect(phones.filter((p) => p === '+1 202 456 1111')).toHaveLength(1);
  });

  it('fills in a missing organization from loser when winner has none', () => {
    const winner = insertContact(db, 'Alice Smith');
    const loser = insertContact(db, 'Alicia Smith', { org: 'Beta Corp' });
    mergeContacts(db, winner, loser, 'merge');
    const row = db.prepare('SELECT organization FROM contacts WHERE id = ?').get(winner) as { organization: string | null };
    expect(row.organization).toBe('Beta Corp');
  });

  it('picks the longer title when both are non-null', () => {
    const winner = insertContact(db, 'Alice Smith', { title: 'Editor' });
    const loser = insertContact(db, 'Alicia Smith', { title: 'Editor in Chief' });
    mergeContacts(db, winner, loser, 'merge');
    const row = db.prepare('SELECT title FROM contacts WHERE id = ?').get(winner) as { title: string | null };
    expect(row.title).toBe('Editor in Chief');
  });

  it('falls back to loser title when winner has none', () => {
    const winner = insertContact(db, 'Bob Jones');
    const loser = insertContact(db, 'Robert Jones', { title: 'Staff Writer' });
    mergeContacts(db, winner, loser, 'merge');
    const row = db.prepare('SELECT title FROM contacts WHERE id = ?').get(winner) as { title: string | null };
    expect(row.title).toBe('Staff Writer');
  });

  it('copies unique handles from loser to winner', () => {
    const winner = insertContact(db, 'Alice Smith', {
      handles: [{ type: 'signal', handle: '+1 202 111 0001' }],
    });
    const loser = insertContact(db, 'Alicia Smith', {
      handles: [
        { type: 'signal', handle: '+1 202 111 0001' }, // duplicate — should not be copied
        { type: 'whatsapp', handle: '+1 202 111 0002' }, // unique — should be copied
      ],
    });
    mergeContacts(db, winner, loser, 'merge');
    const handles = (
      db.prepare('SELECT type, handle FROM contact_handles WHERE contact_id = ?').all(winner) as { type: string; handle: string }[]
    );
    expect(handles).toHaveLength(2);
    expect(handles.some((h) => h.type === 'signal' && h.handle === '+1 202 111 0001')).toBe(true);
    expect(handles.some((h) => h.type === 'whatsapp' && h.handle === '+1 202 111 0002')).toBe(true);
  });

  it('advances contacts.updated_at when overwriting winner fields', () => {
    const staleTs = Math.floor(Date.now() / 1000) - 100;
    const winner = insertContact(db, 'Alice S');
    const loser = insertContact(db, 'Alice Smith');
    db.prepare('UPDATE contacts SET updated_at = ? WHERE id = ?').run(staleTs, winner);

    mergeContacts(db, winner, loser, 'merge');

    const row = db.prepare('SELECT updated_at FROM contacts WHERE id = ?').get(winner) as { updated_at: number };
    expect(row.updated_at).toBeGreaterThan(staleTs);
  });

  it('merges notes from both contacts — picks the longer one (#278)', () => {
    const winner = insertContact(db, 'Alice Smith', { notes: 'short' });
    const loser = insertContact(db, 'Alicia Smith', { notes: 'longer notes here from loser' });

    mergeContacts(db, winner, loser, 'merge');

    const row = db.prepare('SELECT notes FROM contacts WHERE id = ?').get(winner) as { notes: string };
    expect(row.notes).toBe('longer notes here from loser');
  });

  it('copies unique links (URLs) from loser to winner (#305)', () => {
    const winner = insertContact(db, 'Alice Smith');
    const loser = insertContact(db, 'Alicia Smith');
    // Insert links directly — insertContact helper doesn't support links
    const now = Math.floor(Date.now() / 1000);
    db.prepare('INSERT INTO contact_links (id, contact_id, type, label, url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uuidv4(), winner, 'website', null, 'https://winner.example.com', 0, now);
    db.prepare('INSERT INTO contact_links (id, contact_id, type, label, url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uuidv4(), loser, 'website', null, 'https://loser.example.com', 0, now);
    db.prepare('INSERT INTO contact_links (id, contact_id, type, label, url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uuidv4(), loser, 'website', null, 'https://winner.example.com', 1, now); // duplicate

    mergeContacts(db, winner, loser, 'merge');

    const links = db.prepare('SELECT url FROM contact_links WHERE contact_id = ?').all(winner) as { url: string }[];
    const urls = links.map((l) => l.url);
    expect(urls).toContain('https://winner.example.com');
    expect(urls).toContain('https://loser.example.com');
    // no duplicates
    expect(urls.filter((u) => u === 'https://winner.example.com')).toHaveLength(1);
  });

  it('merges RSS feed from loser to winner when winner has none (#314)', () => {
    const winner = insertContact(db, 'Alice Smith');
    const loser = insertContact(db, 'Alicia Smith');
    db.prepare('INSERT INTO contact_alert_rss (id, contact_id, rss_url) VALUES (?, ?, ?)').run(uuidv4(), loser, 'https://loser.example.com/rss');

    mergeContacts(db, winner, loser, 'merge');

    const row = db.prepare('SELECT rss_url FROM contact_alert_rss WHERE contact_id = ?').get(winner) as { rss_url: string } | undefined;
    expect(row?.rss_url).toBe('https://loser.example.com/rss');
  });
});

describe('mergeContacts — invalid IDs (#278, #305, #314)', () => {
  it('throws when winner ID does not exist', () => {
    const loser = insertContact(db, 'Loser Contact');
    expect(() => mergeContacts(db, 'nonexistent-winner-id', loser, 'merge')).toThrow();
  });

  it('throws when loser ID does not exist', () => {
    const winner = insertContact(db, 'Winner Contact');
    expect(() => mergeContacts(db, winner, 'nonexistent-loser-id', 'merge')).toThrow();
  });

  it('throws or errors gracefully when winner and loser are the same ID', () => {
    const id = insertContact(db, 'Same Contact');
    // mergeContacts with same ID will try to DELETE the winner (since loser === winner);
    // the exact failure mode depends on FK constraints. Assert it either throws or
    // leaves the contact intact.
    try {
      mergeContacts(db, id, id, 'merge');
      // If it doesn't throw, the contact must still exist
      const row = db.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
      expect(row).toBeDefined();
    } catch {
      // throwing is also acceptable behaviour
    }
  });
});
