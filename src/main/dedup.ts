import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3-multiple-ciphers';
import type { DedupContact, DuplicatePair } from '@shared/types';
import { normalizeEmail } from './sanitize';
import { writeTombstone } from './sync/engine';

export function loadDedupContacts(db: Database.Database): DedupContact[] {
  const contacts = db
    .prepare(
      `SELECT c.id, c.name, c.organization, c.notes,
              (SELECT COUNT(*) FROM project_memberships pm WHERE pm.contact_id = c.id) AS project_count
       FROM contacts c
       ORDER BY c.name ASC`,
    )
    .all() as Array<{
    id: string;
    name: string;
    organization: string | null;
    notes: string | null;
    project_count: number;
  }>;

  const emailRows = db
    .prepare('SELECT contact_id, email FROM contact_emails')
    .all() as Array<{ contact_id: string; email: string }>;

  const phoneRows = db
    .prepare('SELECT contact_id, phone FROM contact_phones')
    .all() as Array<{ contact_id: string; phone: string }>;

  const emailsByContact = new Map<string, string[]>();
  for (const row of emailRows) {
    const arr = emailsByContact.get(row.contact_id) ?? [];
    arr.push(row.email);
    emailsByContact.set(row.contact_id, arr);
  }

  const phonesByContact = new Map<string, string[]>();
  for (const row of phoneRows) {
    const arr = phonesByContact.get(row.contact_id) ?? [];
    arr.push(row.phone);
    phonesByContact.set(row.contact_id, arr);
  }

  const projectRows = db
    .prepare(`SELECT pm.contact_id, p.name FROM project_memberships pm JOIN projects p ON p.id = pm.project_id`)
    .all() as Array<{ contact_id: string; name: string }>;

  const projectsByContact = new Map<string, string[]>();
  for (const row of projectRows) {
    const arr = projectsByContact.get(row.contact_id) ?? [];
    arr.push(row.name);
    projectsByContact.set(row.contact_id, arr);
  }

  return contacts.map((c) => ({
    id: c.id,
    name: c.name,
    organization: c.organization,
    notes: c.notes,
    emails: emailsByContact.get(c.id) ?? [],
    phones: phonesByContact.get(c.id) ?? [],
    projectCount: c.project_count,
    projects: projectsByContact.get(c.id) ?? [],
  }));
}

function jaroWinkler(a: string, b: string): number {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  if (s1 === s2) return 1;

  const matchDist = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);
  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);
  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

// For matching purposes only — strips formatting to compare digit sequences
function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function findDuplicatePairs(contacts: DedupContact[], dismissedPairs?: Set<string>): DuplicatePair[] {
  const isDismissed = (a: string, b: string) => {
    if (!dismissedPairs) return false;
    const key1 = `${a}|${b}`;
    const key2 = `${b}|${a}`;
    return dismissedPairs.has(key1) || dismissedPairs.has(key2);
  };

  const pairs: DuplicatePair[] = [];
  const pairedIds = new Set<string>();
  const contactById = new Map<string, DedupContact>(contacts.map((c) => [c.id, c]));

  // Identity indexes: identifier → Set of contact IDs that carry it. Every co-owner
  // of an identifier must be indexed, even ones that were skipped as a match partner
  // (dismissed pair, or already paired elsewhere) — otherwise later contacts sharing
  // the same identifier can miss a valid pairing (issue #441).
  const emailIndex = new Map<string, Set<string>>();
  for (const c of contacts) {
    for (const email of c.emails) {
      const key = normalizeEmail(email);
      const seen = emailIndex.get(key) ?? new Set<string>();
      if (!pairedIds.has(c.id)) {
        for (const existing of seen) {
          if (existing === c.id || pairedIds.has(existing)) continue;
          if (isDismissed(existing, c.id)) continue;
          pairs.push({ a: contactById.get(existing)!, b: c, reason: 'email' });
          pairedIds.add(existing);
          pairedIds.add(c.id);
          break;
        }
      }
      seen.add(c.id);
      emailIndex.set(key, seen);
    }
  }

  const phoneIndex = new Map<string, Set<string>>();
  for (const c of contacts) {
    for (const phone of c.phones) {
      const key = digitsOnly(phone);
      if (!key) continue;
      const seen = phoneIndex.get(key) ?? new Set<string>();
      if (!pairedIds.has(c.id)) {
        for (const existing of seen) {
          if (existing === c.id || pairedIds.has(existing)) continue;
          if (isDismissed(existing, c.id)) continue;
          pairs.push({ a: contactById.get(existing)!, b: c, reason: 'phone' });
          pairedIds.add(existing);
          pairedIds.add(c.id);
          break;
        }
      }
      seen.add(c.id);
      phoneIndex.set(key, seen);
    }
  }

  const unpaired = contacts.filter((c) => !pairedIds.has(c.id));
  const unpairedLower = unpaired.map((c) => c.name.toLowerCase());
  for (let i = 0; i < unpaired.length; i++) {
    for (let j = i + 1; j < unpaired.length; j++) {
      if (pairedIds.has(unpaired[i].id) || pairedIds.has(unpaired[j].id)) continue;
      if (isDismissed(unpaired[i].id, unpaired[j].id)) continue;
      if (jaroWinkler(unpairedLower[i], unpairedLower[j]) >= 0.95) {
        pairs.push({ a: unpaired[i], b: unpaired[j], reason: 'name' });
        pairedIds.add(unpaired[i].id);
        pairedIds.add(unpaired[j].id);
        break;
      }
    }
  }

  return pairs;
}

export function loadDismissedPairs(db: Database.Database): Set<string> {
  const rows = db
    .prepare('SELECT contact_a_id, contact_b_id FROM dedup_dismissed_pairs')
    .all() as Array<{ contact_a_id: string; contact_b_id: string }>;
  const set = new Set<string>();
  for (const row of rows) {
    const [lo, hi] = row.contact_a_id < row.contact_b_id
      ? [row.contact_a_id, row.contact_b_id]
      : [row.contact_b_id, row.contact_a_id];
    set.add(`${lo}|${hi}`);
  }
  return set;
}

export function dismissPair(db: Database.Database, aId: string, bId: string): void {
  const [a, b] = aId < bId ? [aId, bId] : [bId, aId];
  // Skip if either contact was deleted since the pair was cached.
  if (!db.prepare('SELECT 1 FROM contacts WHERE id = ?').get(a)) return;
  if (!db.prepare('SELECT 1 FROM contacts WHERE id = ?').get(b)) return;
  db.prepare(
    'INSERT OR IGNORE INTO dedup_dismissed_pairs (contact_a_id, contact_b_id, dismissed_at) VALUES (?, ?, ?)',
  ).run(a, b, Math.floor(Date.now() / 1000));
}

export function mergeContacts(
  db: Database.Database,
  winnerId: string,
  loserId: string,
  strategy: 'keep' | 'merge',
): void {
  const doMerge = db.transaction(() => {
    const now = Math.floor(Date.now() / 1000);
    if (strategy === 'merge') {
      const winner = db
        .prepare('SELECT name, organization, title, notes FROM contacts WHERE id = ?')
        .get(winnerId) as { name: string; organization: string | null; title: string | null; notes: string | null };
      const loser = db
        .prepare('SELECT name, organization, title, notes FROM contacts WHERE id = ?')
        .get(loserId) as { name: string; organization: string | null; title: string | null; notes: string | null };

      const name = loser.name.length > winner.name.length ? loser.name : winner.name;
      const organization = !winner.organization
        ? loser.organization
        : !loser.organization
          ? winner.organization
          : loser.organization.length > winner.organization.length
            ? loser.organization
            : winner.organization;
      const title = !winner.title
        ? loser.title
        : !loser.title
          ? winner.title
          : loser.title.length > winner.title.length
            ? loser.title
            : winner.title;
      const notes = !winner.notes
        ? loser.notes
        : !loser.notes
          ? winner.notes
          : loser.notes.length > winner.notes.length
            ? loser.notes
            : winner.notes;

      db.prepare('UPDATE contacts SET name = ?, organization = ?, title = ?, notes = ?, updated_at = ? WHERE id = ?').run(
        name,
        organization,
        title,
        notes,
        now,
        winnerId,
      );

      const winnerEmails = new Set<string>(
        (
          db
            .prepare('SELECT email FROM contact_emails WHERE contact_id = ?')
            .all(winnerId) as Array<{ email: string }>
        ).map((r) => r.email),
      );
      const loserEmails = db
        .prepare('SELECT email, label FROM contact_emails WHERE contact_id = ?')
        .all(loserId) as Array<{ email: string; label: string | null }>;
      const maxEmailOrder = (
        db
          .prepare('SELECT MAX(sort_order) AS m FROM contact_emails WHERE contact_id = ?')
          .get(winnerId) as { m: number | null }
      ).m ?? -1;
      let emailOffset = maxEmailOrder + 1;
      for (const row of loserEmails) {
        if (!winnerEmails.has(row.email)) {
          db.prepare(
            'INSERT INTO contact_emails (id, contact_id, email, label, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(uuidv4(), winnerId, row.email, row.label, emailOffset++, now);
        }
      }

      const winnerPhones = new Set<string>(
        (
          db
            .prepare('SELECT phone FROM contact_phones WHERE contact_id = ?')
            .all(winnerId) as Array<{ phone: string }>
        ).map((r) => r.phone),
      );
      const loserPhones = db
        .prepare('SELECT phone, label FROM contact_phones WHERE contact_id = ?')
        .all(loserId) as Array<{ phone: string; label: string | null }>;
      const maxPhoneOrder = (
        db
          .prepare('SELECT MAX(sort_order) AS m FROM contact_phones WHERE contact_id = ?')
          .get(winnerId) as { m: number | null }
      ).m ?? -1;
      let phoneOffset = maxPhoneOrder + 1;
      for (const row of loserPhones) {
        if (!winnerPhones.has(row.phone)) {
          db.prepare(
            'INSERT INTO contact_phones (id, contact_id, phone, label, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(uuidv4(), winnerId, row.phone, row.label, phoneOffset++, now);
        }
      }

      const winnerUrls = new Set<string>(
        (
          db
            .prepare('SELECT url FROM contact_links WHERE contact_id = ?')
            .all(winnerId) as Array<{ url: string }>
        ).map((r) => r.url),
      );
      const loserLinks = db
        .prepare('SELECT type, label, url FROM contact_links WHERE contact_id = ?')
        .all(loserId) as Array<{ type: string; label: string | null; url: string }>;
      const maxLinkOrder = (
        db
          .prepare('SELECT MAX(sort_order) AS m FROM contact_links WHERE contact_id = ?')
          .get(winnerId) as { m: number | null }
      ).m ?? -1;
      let linkOffset = maxLinkOrder + 1;
      for (const row of loserLinks) {
        if (!winnerUrls.has(row.url)) {
          db.prepare(
            'INSERT INTO contact_links (id, contact_id, type, label, url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(uuidv4(), winnerId, row.type, row.label, row.url, linkOffset++, now);
        }
      }

      const winnerHandles = new Set<string>(
        (
          db
            .prepare('SELECT type, handle FROM contact_handles WHERE contact_id = ?')
            .all(winnerId) as Array<{ type: string; handle: string }>
        ).map((r) => `${r.type}:${r.handle}`),
      );
      const loserHandles = db
        .prepare('SELECT type, handle FROM contact_handles WHERE contact_id = ?')
        .all(loserId) as Array<{ type: string; handle: string }>;
      const maxHandleOrder = (
        db
          .prepare('SELECT MAX(sort_order) AS m FROM contact_handles WHERE contact_id = ?')
          .get(winnerId) as { m: number | null }
      ).m ?? -1;
      let handleOffset = maxHandleOrder + 1;
      for (const row of loserHandles) {
        if (!winnerHandles.has(`${row.type}:${row.handle}`)) {
          db.prepare(
            'INSERT INTO contact_handles (id, contact_id, type, handle, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(uuidv4(), winnerId, row.type, row.handle, handleOffset++, now);
        }
      }
    }

    // Snapshot the loser's log entry and mention IDs before they're remapped to
    // the winner below. Their shared-DB copies still hang off the loser and get
    // cascade-deleted when the loser's tombstone is applied there, so their push
    // records must be cleared for them to re-push under the winner's contact_id.
    const loserLogEntryIds = (db.prepare('SELECT id FROM interaction_log_entries WHERE contact_id = ?').all(loserId) as Array<{ id: string }>).map((r) => r.id);
    const loserMentionIds = (db.prepare('SELECT id FROM contact_alert_mentions WHERE contact_id = ?').all(loserId) as Array<{ id: string }>).map((r) => r.id);

    const loserMemberships = db
      .prepare('SELECT id, project_id FROM project_memberships WHERE contact_id = ?')
      .all(loserId) as Array<{ id: string; project_id: string }>;

    for (const membership of loserMemberships) {
      const winnerMembership = db
        .prepare('SELECT id FROM project_memberships WHERE contact_id = ? AND project_id = ?')
        .get(winnerId, membership.project_id) as { id: string } | undefined;

      if (winnerMembership) {
        db.prepare(
          'UPDATE OR IGNORE interaction_projects SET membership_id = ? WHERE membership_id = ?',
        ).run(winnerMembership.id, membership.id);
        db.prepare('DELETE FROM project_memberships WHERE id = ?').run(membership.id);
      } else {
        db.prepare('UPDATE project_memberships SET contact_id = ?, updated_at = ? WHERE id = ?').run(
          winnerId,
          now,
          membership.id,
        );
      }
    }

    db.prepare('UPDATE message_scratchpad_drafts SET contact_id = ? WHERE contact_id = ?').run(
      winnerId,
      loserId,
    );
    db.prepare('UPDATE reminders SET contact_id = ? WHERE contact_id = ?').run(winnerId, loserId);

    const winnerRss = db
      .prepare('SELECT id FROM contact_alert_rss WHERE contact_id = ?')
      .get(winnerId);
    if (!winnerRss) {
      db.prepare('UPDATE contact_alert_rss SET contact_id = ? WHERE contact_id = ?').run(
        winnerId,
        loserId,
      );
    }

    db.prepare('UPDATE interaction_log_entries SET contact_id = ? WHERE contact_id = ?').run(
      winnerId,
      loserId,
    );
    db.prepare('UPDATE contact_screenshots SET contact_id = ? WHERE contact_id = ?').run(
      winnerId,
      loserId,
    );
    // contact_tags has UNIQUE(contact_id, tag) — a tag the winner already has stays on
    // the loser and cascades away, which is correct.
    db.prepare('UPDATE OR IGNORE contact_tags SET contact_id = ? WHERE contact_id = ?').run(
      winnerId,
      loserId,
    );
    // contact_alert_mentions has a unique index on (contact_id, guid) — same treatment.
    db.prepare('UPDATE OR IGNORE contact_alert_mentions SET contact_id = ? WHERE contact_id = ?').run(
      winnerId,
      loserId,
    );

    // Tombstone the loser so shared-project sync deletes it (and, via CASCADE,
    // its shared sub-rows) instead of resurrecting it on the next pull.
    writeTombstone(db, 'contacts', loserId, now);

    // Clear push records so everything absorbed by the winner re-pushes: the
    // winner itself (wholesale, for all projects), the remapped log entries and
    // mentions, and the loser's memberships (remapped ones re-push under the
    // winner; deleted ones are cascade-cleaned in shared by the tombstone).
    const clearPush = db.prepare('DELETE FROM sync_pushed WHERE table_name = ? AND row_id = ?');
    clearPush.run('contacts', winnerId);
    clearPush.run('contacts', loserId);
    for (const id of loserLogEntryIds) clearPush.run('interaction_log_entries', id);
    for (const id of loserMentionIds) clearPush.run('contact_alert_mentions', id);
    for (const m of loserMemberships) clearPush.run('project_memberships', m.id);

    db.prepare('DELETE FROM contacts WHERE id = ?').run(loserId);
  });

  doMerge();
}
