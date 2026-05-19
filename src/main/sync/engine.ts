import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3-multiple-ciphers';

export interface SyncResult {
  success: boolean;
  error?: string;
}

/**
 * Bidirectional sync between local and shared DBs for a single project.
 *
 * Pull strategy:
 *   - Contacts + their sub-tables (emails/phones/links/alert_rss): LWW by contact.updated_at.
 *     When shared contact is newer, replace the contact row AND all its sub-tables.
 *   - project_memberships: LWW by membership.updated_at.
 *   - contact_alert_mentions, interaction_log_entries:
 *     append-only — insert rows not yet present locally.
 *
 * Push strategy:
 *   - Contacts where local.updated_at > local.synced_at: push to shared + replace sub-tables.
 *   - project_memberships where local.updated_at > local.synced_at: push to shared.
 *   - append-only tables where local.synced_at IS NULL: push to shared.
 */
export function syncProject(
  localDb: Database.Database,
  sharedDb: Database.Database,
  projectId: string,
): SyncResult {
  try {
    const now = Math.floor(Date.now() / 1000);

    localDb.transaction(() => {
      sharedDb.transaction(() => {
        pullContacts(localDb, sharedDb);
        pullMemberships(localDb, sharedDb, projectId, now);
        pullAppendOnly(localDb, sharedDb);
      })();

      const memberRows = localDb
        .prepare('SELECT id, contact_id FROM project_memberships WHERE project_id = ?')
        .all(projectId) as { id: string; contact_id: string }[];
      const contactIds = memberRows.map((r) => r.contact_id);
      const membershipIds = memberRows.map((r) => r.id);

      sharedDb.transaction(() => {
        pushContacts(localDb, sharedDb, contactIds, now);
        pushMemberships(localDb, sharedDb, projectId, now);
        pushAppendOnly(localDb, sharedDb, contactIds, membershipIds, now);
      })();

      localDb.prepare('UPDATE projects SET shared_pending_writes = 0, last_synced_at = ? WHERE id = ?').run(now, projectId);
    })();

    return { success: true };
  } catch (err) {
    try {
      localDb.prepare('UPDATE projects SET shared_pending_writes = 1 WHERE id = ?').run(projectId);
    } catch {
      // ignore secondary failure
    }
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Pull helpers
// ---------------------------------------------------------------------------

// Rename a local contact's primary key from fromId to toId, remapping every FK table.
// Used when a shared contact is discovered to match a local contact that was created
// under a different UUID — adopting the shared UUID eliminates the push-side duplicate.
function adoptSharedUuid(local: Database.Database, fromId: string, toId: string): void {
  const c = local.prepare('SELECT * FROM contacts WHERE id = ?').get(fromId) as {
    name: string; organization: string | null; title: string | null; dob: string | null;
    notes: string | null; created_at: number; updated_at: number; synced_at: number | null;
  };
  local
    .prepare(
      'INSERT INTO contacts (id, name, organization, title, dob, notes, created_at, updated_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(toId, c.name, c.organization, c.title ?? null, c.dob ?? null, c.notes, c.created_at, c.updated_at, null);
  // Remap every table with a contact_id FK — derived at runtime so new tables are never missed.
  const allTableNames = (local.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
  for (const table of allTableNames) {
    const fks = local.prepare(`PRAGMA foreign_key_list("${table}")`).all() as { from: string; table: string }[];
    if (fks.some((fk) => fk.from === 'contact_id' && fk.table === 'contacts')) {
      local.prepare(`UPDATE "${table}" SET contact_id = ? WHERE contact_id = ?`).run(toId, fromId);
    }
  }
  // dedup_dismissed_pairs has two separate contact FK columns — remap before delete
  const dedupRows = local
    .prepare('SELECT contact_a_id, contact_b_id, dismissed_at FROM dedup_dismissed_pairs WHERE contact_a_id = ? OR contact_b_id = ?')
    .all(fromId, fromId) as { contact_a_id: string; contact_b_id: string; dismissed_at: number }[];
  for (const row of dedupRows) {
    const rawA = row.contact_a_id === fromId ? toId : row.contact_a_id;
    const rawB = row.contact_b_id === fromId ? toId : row.contact_b_id;
    local.prepare('DELETE FROM dedup_dismissed_pairs WHERE contact_a_id = ? AND contact_b_id = ?').run(row.contact_a_id, row.contact_b_id);
    if (rawA === rawB) continue; // self-pair after remap — discard
    const [a, b] = rawA < rawB ? [rawA, rawB] : [rawB, rawA];
    local.prepare('INSERT OR IGNORE INTO dedup_dismissed_pairs (contact_a_id, contact_b_id, dismissed_at) VALUES (?, ?, ?)').run(a, b, row.dismissed_at);
  }
  local.prepare('DELETE FROM contacts WHERE id = ?').run(fromId);
}

function pullContacts(local: Database.Database, shared: Database.Database): void {
  const sharedContacts = shared.prepare('SELECT id, name, organization, title, dob, notes, created_at, updated_at FROM contacts').all() as {
    id: string;
    name: string;
    organization: string | null;
    title: string | null;
    dob: string | null;
    notes: string | null;
    created_at: number;
    updated_at: number;
  }[];

  const localMap = new Map<string, number>(
    (local.prepare('SELECT id, updated_at FROM contacts').all() as { id: string; updated_at: number }[])
      .map((r) => [r.id, r.updated_at]),
  );

  // Identity indexes for resolving contacts that exist locally under a different UUID
  const localEmailToId = new Map<string, string>(
    (local.prepare('SELECT email, contact_id FROM contact_emails').all() as { email: string; contact_id: string }[])
      .map((r) => [r.email, r.contact_id]),
  );
  const localPhoneToId = new Map<string, string>(
    (local.prepare('SELECT phone, contact_id FROM contact_phones').all() as { phone: string; contact_id: string }[])
      .map((r) => [r.phone, r.contact_id]),
  );

  // Guard against two shared contacts both matching the same local contact.
  const adoptedIds = new Set<string>();

  for (const sc of sharedContacts) {
    const localUpdatedAt = localMap.get(sc.id);

    if (localUpdatedAt !== undefined) {
      // Contact already exists by ID — normal LWW path
      if (sc.updated_at > localUpdatedAt) {
        local
          .prepare(
            `INSERT INTO contacts (id, name, organization, title, dob, notes, created_at, updated_at, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name, organization = excluded.organization,
               title = excluded.title, dob = excluded.dob, notes = excluded.notes,
               updated_at = excluded.updated_at, synced_at = excluded.synced_at`,
          )
          .run(sc.id, sc.name, sc.organization, sc.title ?? null, sc.dob ?? null, sc.notes, sc.created_at, sc.updated_at, 0);

        mergeSubTablesFromShared(local, shared, sc.id, sc.id);
      }
    } else {
      // No local contact with this UUID — check for an identity match by email/phone
      const sharedEmails = shared
        .prepare('SELECT email FROM contact_emails WHERE contact_id = ?')
        .all(sc.id) as { email: string }[];
      const sharedPhones = shared
        .prepare('SELECT phone FROM contact_phones WHERE contact_id = ?')
        .all(sc.id) as { phone: string }[];

      // Collect all candidate local IDs matching any shared email/phone.
      // Only adopt when signals converge on exactly one local contact.
      const candidateIds = new Set<string>();
      for (const { email } of sharedEmails) {
        const found = localEmailToId.get(email);
        if (found) candidateIds.add(found);
      }
      for (const { phone } of sharedPhones) {
        const found = localPhoneToId.get(phone);
        if (found) candidateIds.add(found);
      }
      const matchedLocalId = candidateIds.size === 1 ? [...candidateIds][0] : undefined;

      if (matchedLocalId && !adoptedIds.has(matchedLocalId)) {
        // Adopt the shared UUID so both sides agree on one primary key.
        // This prevents pushContacts from inserting a second contact row in the shared DB.
        adoptSharedUuid(local, matchedLocalId, sc.id);
        // Store both: the old local UUID (guards stale identity-index entries) and
        // the new shared UUID (guards updated identity-index entries after adoption).
        adoptedIds.add(matchedLocalId);
        adoptedIds.add(sc.id);

        const matchedUpdatedAt = localMap.get(matchedLocalId) ?? 0;
        if (sc.updated_at > matchedUpdatedAt) {
          local
            .prepare(
              `UPDATE contacts SET name = ?, organization = ?, title = ?, dob = ?, notes = ?, updated_at = ?, synced_at = ?
               WHERE id = ?`,
            )
            .run(sc.name, sc.organization, sc.title ?? null, sc.dob ?? null, sc.notes, sc.updated_at, 0, sc.id);
        }
        mergeSubTablesFromShared(local, shared, sc.id, sc.id);
      } else {
        // Genuinely new contact (or ambiguous multi-match / already-adopted local contact)
        local
          .prepare(
            `INSERT INTO contacts (id, name, organization, title, dob, notes, created_at, updated_at, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name, organization = excluded.organization,
               title = excluded.title, dob = excluded.dob, notes = excluded.notes,
               updated_at = excluded.updated_at, synced_at = excluded.synced_at`,
          )
          .run(sc.id, sc.name, sc.organization, sc.title ?? null, sc.dob ?? null, sc.notes, sc.created_at, sc.updated_at, 0);

        mergeSubTablesFromShared(local, shared, sc.id, sc.id);
      }

      // Keep identity indexes current so later iterations in this sync see updated state
      for (const { email } of (local.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(sc.id) as { email: string }[])) {
        localEmailToId.set(email, sc.id);
      }
      for (const { phone } of (local.prepare('SELECT phone FROM contact_phones WHERE contact_id = ?').all(sc.id) as { phone: string }[])) {
        localPhoneToId.set(phone, sc.id);
      }
    }
  }
}

function mergeSubTablesFromShared(
  local: Database.Database,
  shared: Database.Database,
  sharedContactId: string,
  localContactId: string,
): void {
  // ── Emails ────────────────────────────────────────────────────────────────
  // Stored emails are already normalised (lowercased, trimmed) — compare directly.
  const sharedEmails = shared
    .prepare('SELECT * FROM contact_emails WHERE contact_id = ? ORDER BY sort_order')
    .all(sharedContactId) as { id: string; email: string; label: string | null; sort_order: number; created_at: number }[];
  const localEmails = local
    .prepare('SELECT * FROM contact_emails WHERE contact_id = ? ORDER BY sort_order')
    .all(localContactId) as { id: string; email: string; label: string | null; sort_order: number; created_at: number }[];

  const sharedEmailValues = new Set(sharedEmails.map((e) => e.email));
  const localOnlyEmails = localEmails.filter((e) => !sharedEmailValues.has(e.email));

  // Merge and sort by insertion time so rows appear in the order they were added.
  const mergedEmails = [...sharedEmails, ...localOnlyEmails].sort((a, b) => a.created_at - b.created_at);

  local.prepare('DELETE FROM contact_emails WHERE contact_id = ?').run(localContactId);
  mergedEmails.forEach((e, i) => {
    local
      .prepare('INSERT INTO contact_emails (id, contact_id, email, label, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(e.id, localContactId, e.email, e.label, i, e.created_at);
  });

  // ── Phones ────────────────────────────────────────────────────────────────
  // Stored phones are already normalised on save — compare stored values directly.
  const sharedPhones = shared
    .prepare('SELECT * FROM contact_phones WHERE contact_id = ? ORDER BY sort_order')
    .all(sharedContactId) as { id: string; phone: string; label: string | null; sort_order: number; created_at: number }[];
  const localPhones = local
    .prepare('SELECT * FROM contact_phones WHERE contact_id = ? ORDER BY sort_order')
    .all(localContactId) as { id: string; phone: string; label: string | null; sort_order: number; created_at: number }[];

  const sharedPhoneValues = new Set(sharedPhones.map((p) => p.phone));
  const localOnlyPhones = localPhones.filter((p) => !sharedPhoneValues.has(p.phone));

  const mergedPhones = [...sharedPhones, ...localOnlyPhones].sort((a, b) => a.created_at - b.created_at);

  local.prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(localContactId);
  mergedPhones.forEach((p, i) => {
    local
      .prepare('INSERT INTO contact_phones (id, contact_id, phone, label, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(p.id, localContactId, p.phone, p.label, i, p.created_at);
  });

  // ── Links ─────────────────────────────────────────────────────────────────
  // wayback_url is local-only — snapshot it before DELETE and restore after.
  const sharedLinks = shared
    .prepare('SELECT * FROM contact_links WHERE contact_id = ? ORDER BY sort_order')
    .all(sharedContactId) as { id: string; type: string; label: string | null; url: string; sort_order: number; created_at: number }[];
  const localLinks = local
    .prepare('SELECT id, type, label, url, wayback_url, sort_order, created_at FROM contact_links WHERE contact_id = ? ORDER BY sort_order')
    .all(localContactId) as { id: string; type: string; label: string | null; url: string; wayback_url: string | null; sort_order: number; created_at: number }[];

  const sharedUrlValues = new Set(sharedLinks.map((l) => l.url.trim()));
  const localWaybacks = new Map(localLinks.filter((l) => l.wayback_url).map((l) => [l.url.trim(), l.wayback_url]));
  const localOnlyLinks = localLinks.filter((l) => !sharedUrlValues.has(l.url.trim()));

  // Build merged set: shared rows (with wayback_url restored) + local-only rows, sorted by created_at.
  const mergedLinks = [
    ...sharedLinks.map((l) => ({ ...l, wayback_url: localWaybacks.get(l.url.trim()) ?? null })),
    ...localOnlyLinks,
  ].sort((a, b) => a.created_at - b.created_at);

  local.prepare('DELETE FROM contact_links WHERE contact_id = ?').run(localContactId);
  mergedLinks.forEach((l, i) => {
    local
      .prepare('INSERT INTO contact_links (id, contact_id, type, label, url, wayback_url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(l.id, localContactId, l.type, l.label, l.url, l.wayback_url, i, l.created_at);
  });

  // ── Handles ───────────────────────────────────────────────────────────────
  const sharedHandles = shared
    .prepare('SELECT * FROM contact_handles WHERE contact_id = ? ORDER BY sort_order')
    .all(sharedContactId) as { id: string; type: string; handle: string; sort_order: number; created_at: number }[];
  const localHandles = local
    .prepare('SELECT * FROM contact_handles WHERE contact_id = ? ORDER BY sort_order')
    .all(localContactId) as { id: string; type: string; handle: string; sort_order: number; created_at: number }[];

  const sharedHandleKeys = new Set(sharedHandles.map((h) => `${h.type}:${h.handle}`));
  const localOnlyHandles = localHandles.filter((h) => !sharedHandleKeys.has(`${h.type}:${h.handle}`));

  const mergedHandles = [...sharedHandles, ...localOnlyHandles].sort((a, b) => a.created_at - b.created_at);

  local.prepare('DELETE FROM contact_handles WHERE contact_id = ?').run(localContactId);
  mergedHandles.forEach((h, i) => {
    local
      .prepare('INSERT INTO contact_handles (id, contact_id, type, handle, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(h.id, localContactId, h.type, h.handle, i, h.created_at);
  });

  // ── Alert RSS ──────────────────────────────────────────────────────────────
  local.prepare('DELETE FROM contact_alert_rss WHERE contact_id = ?').run(localContactId);
  const rssFeeds = shared
    .prepare('SELECT * FROM contact_alert_rss WHERE contact_id = ?')
    .all(sharedContactId) as { id: string; rss_url: string; last_polled_at: number | null; is_invalid: number }[];
  for (const rss of rssFeeds) {
    local
      .prepare(
        'INSERT INTO contact_alert_rss (id, contact_id, rss_url, last_polled_at, is_invalid) VALUES (?, ?, ?, ?, ?)',
      )
      .run(rss.id, localContactId, rss.rss_url, rss.last_polled_at, rss.is_invalid);
  }
}

function pullMemberships(
  local: Database.Database,
  shared: Database.Database,
  projectId: string,
  now: number,
): void {
  const CONFLICT_WINDOW_SECS = 24 * 3600;

  // The shared file is a single-project file — project_memberships has no
  // project_id column; all rows belong to the one project.
  const sharedMemberships = shared.prepare('SELECT id, contact_id, reporter_email, reporter_name, theme, priority, status, first_outreach_at, created_at, updated_at FROM project_memberships').all() as {
    id: string;
    contact_id: string;
    reporter_email: string;
    reporter_name: string;
    theme: string | null;
    priority: string | null;
    status: string | null;
    first_outreach_at: number | null;
    created_at: number;
    updated_at: number;
  }[];

  const localMembershipMap = new Map<string, { updated_at: number; reporter_email: string; reporter_assigned_at: number | null }>(
    (local.prepare('SELECT id, updated_at, reporter_email, reporter_assigned_at FROM project_memberships WHERE project_id = ?').all(projectId) as { id: string; updated_at: number; reporter_email: string; reporter_assigned_at: number | null }[])
      .map((r) => [r.id, r]),
  );

  const existingReporterEmails = new Set<string>(
    (local.prepare('SELECT email FROM project_reporters WHERE project_id = ?').all(projectId) as { email: string }[])
      .map((r) => r.email),
  );

  for (const sm of sharedMemberships) {
    const lm = localMembershipMap.get(sm.id);
    // adoptSharedUuid always renames local UUID → shared UUID, so sm.contact_id is correct locally.
    const localContactId = sm.contact_id;

    if (!lm || sm.updated_at > lm.updated_at) {
      // Guard: if there's already a membership for this (contact, project) under a different id
      // (can happen when adoptSharedUuid renamed a local contact to the shared UUID), save its
      // children, delete it, then INSERT sm.id so the re-attach below satisfies FK constraints.
      const conflicting = local
        .prepare('SELECT id FROM project_memberships WHERE contact_id = ? AND project_id = ? AND id != ?')
        .get(localContactId, projectId, sm.id) as { id: string } | undefined;

      type LogEntry = { id: string; reporter_email: string; reporter_name: string; body: string; created_at: number; synced_at: number | null };
      type MemberReporter = { id: string; reporter_email: string; reporter_name: string };
      type SavedReminder = { id: string; contact_id: string; project_id: string; due_date: number; note: string | null; is_auto_outreach: number; created_at: number; completed_at: number | null; last_notified_at: number | null };
      let savedLogEntries: LogEntry[] = [];
      let savedReporters: MemberReporter[] = [];
      let savedReminders: SavedReminder[] = [];

      if (conflicting) {
        // Read children before the CASCADE delete removes them
        savedLogEntries = local.prepare('SELECT id, reporter_email, reporter_name, body, created_at, synced_at FROM interaction_log_entries WHERE membership_id = ?').all(conflicting.id) as LogEntry[];
        savedReporters = local.prepare('SELECT id, reporter_email, reporter_name FROM membership_reporters WHERE membership_id = ?').all(conflicting.id) as MemberReporter[];
        savedReminders = local.prepare('SELECT id, contact_id, project_id, due_date, note, is_auto_outreach, created_at, completed_at, last_notified_at FROM reminders WHERE membership_id = ?').all(conflicting.id) as SavedReminder[];
        local.prepare('DELETE FROM project_memberships WHERE id = ?').run(conflicting.id);
      }

      const reporterChanging = lm && lm.reporter_email !== sm.reporter_email;
      const recentlyAssigned = lm?.reporter_assigned_at && (now - lm.reporter_assigned_at) < CONFLICT_WINDOW_SECS;
      const hasConflict = reporterChanging && recentlyAssigned ? 1 : 0;

      local
        .prepare(
          `INSERT INTO project_memberships
             (id, contact_id, project_id, reporter_email, reporter_name, theme, priority,
              status, first_outreach_at, created_at, updated_at, synced_at, reporter_conflict)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             reporter_email = excluded.reporter_email, reporter_name = excluded.reporter_name,
             theme = excluded.theme, priority = excluded.priority, status = excluded.status,
             first_outreach_at = excluded.first_outreach_at,
             updated_at = excluded.updated_at, synced_at = excluded.synced_at,
             reporter_conflict = CASE WHEN excluded.reporter_conflict = 1 THEN 1 ELSE reporter_conflict END`,
        )
        .run(
          sm.id,
          localContactId,
          projectId,
          sm.reporter_email,
          sm.reporter_name,
          sm.theme,
          sm.priority,
          sm.status,
          sm.first_outreach_at,
          sm.created_at,
          sm.updated_at,
          now,
          hasConflict,
        );

      // Re-attach children that were cascade-deleted with conflicting membership
      if (conflicting) {
        for (const e of savedLogEntries) {
          local.prepare('INSERT OR IGNORE INTO interaction_log_entries (id, membership_id, reporter_email, reporter_name, body, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(e.id, sm.id, e.reporter_email, e.reporter_name, e.body, e.created_at, e.synced_at);
        }
        for (const mr of savedReporters) {
          local.prepare('INSERT OR IGNORE INTO membership_reporters (id, membership_id, reporter_email, reporter_name) VALUES (?, ?, ?, ?)').run(mr.id, sm.id, mr.reporter_email, mr.reporter_name);
        }
        for (const r of savedReminders) {
          local.prepare('INSERT OR IGNORE INTO reminders (id, contact_id, project_id, membership_id, due_date, note, is_auto_outreach, created_at, completed_at, last_notified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(r.id, r.contact_id, r.project_id, sm.id, r.due_date, r.note, r.is_auto_outreach, r.created_at, r.completed_at, r.last_notified_at);
        }
      }
    }

    if (!existingReporterEmails.has(sm.reporter_email)) {
      local
        .prepare(
          'INSERT OR IGNORE INTO project_reporters (id, project_id, name, email, is_self) VALUES (?, ?, ?, ?, 0)',
        )
        .run(uuidv4(), projectId, sm.reporter_name, sm.reporter_email);
      existingReporterEmails.add(sm.reporter_email);
    }
  }
}

function pullAppendOnly(
  local: Database.Database,
  shared: Database.Database,
): void {
  for (const sm of shared.prepare('SELECT * FROM contact_alert_mentions').all() as {
    id: string;
    contact_id: string;
    headline: string;
    source_url: string;
    published_at: number | null;
    fetched_at: number;
    guid: string;
    seen: number;
  }[]) {
    const localContactId = sm.contact_id;
    local
      .prepare(
        `INSERT OR IGNORE INTO contact_alert_mentions
           (id, contact_id, headline, source_url, published_at, fetched_at, guid, seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sm.id,
        localContactId,
        sm.headline,
        sm.source_url,
        sm.published_at,
        sm.fetched_at,
        sm.guid,
        sm.seen,
      );
  }

  for (const se of shared.prepare('SELECT * FROM interaction_log_entries').all() as {
    id: string;
    membership_id: string;
    reporter_email: string;
    reporter_name: string;
    body: string;
    created_at: number;
  }[]) {
    local
      .prepare(
        `INSERT OR IGNORE INTO interaction_log_entries
           (id, membership_id, reporter_email, reporter_name, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(se.id, se.membership_id, se.reporter_email, se.reporter_name, se.body, se.created_at);
  }
}

// ---------------------------------------------------------------------------
// Push helpers
// ---------------------------------------------------------------------------

function pushContacts(
  local: Database.Database,
  shared: Database.Database,
  contactIds: string[],
  now: number,
): void {
  for (const contactId of contactIds) {
    const lc = local.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId) as
      | {
          id: string;
          name: string;
          organization: string | null;
          title: string | null;
          dob: string | null;
          notes: string | null;
          created_at: number;
          updated_at: number;
          synced_at: number | null;
        }
      | undefined;
    if (!lc) continue;

    if (!lc.synced_at || lc.updated_at > lc.synced_at) {
      shared
        .prepare(
          `INSERT INTO contacts (id, name, organization, title, dob, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, organization = excluded.organization,
             title = excluded.title, dob = excluded.dob, notes = excluded.notes,
             updated_at = excluded.updated_at`,
        )
        .run(lc.id, lc.name, lc.organization, lc.title, lc.dob ?? null, lc.notes, lc.created_at, lc.updated_at);

      pushSubTablesToShared(local, shared, contactId);

      local.prepare('UPDATE contacts SET synced_at = ? WHERE id = ?').run(now, contactId);
    }
  }
}

function pushSubTablesToShared(
  local: Database.Database,
  shared: Database.Database,
  contactId: string,
): void {
  shared.prepare('DELETE FROM contact_emails WHERE contact_id = ?').run(contactId);
  for (const e of local
    .prepare('SELECT * FROM contact_emails WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; email: string; label: string | null; sort_order: number; created_at: number }[]) {
    shared
      .prepare(
        'INSERT INTO contact_emails (id, contact_id, email, label, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(e.id, contactId, e.email, e.label, e.sort_order, e.created_at);
  }

  shared.prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(contactId);
  for (const p of local
    .prepare('SELECT * FROM contact_phones WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; phone: string; label: string | null; sort_order: number; created_at: number }[]) {
    shared
      .prepare(
        'INSERT INTO contact_phones (id, contact_id, phone, label, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(p.id, contactId, p.phone, p.label, p.sort_order, p.created_at);
  }

  shared.prepare('DELETE FROM contact_links WHERE contact_id = ?').run(contactId);
  for (const l of local
    .prepare('SELECT * FROM contact_links WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as {
    id: string;
    type: string;
    label: string | null;
    url: string;
    sort_order: number;
    created_at: number;
  }[]) {
    shared
      .prepare(
        'INSERT INTO contact_links (id, contact_id, type, label, url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(l.id, contactId, l.type, l.label, l.url, l.sort_order, l.created_at);
  }

  shared.prepare('DELETE FROM contact_handles WHERE contact_id = ?').run(contactId);
  for (const h of local
    .prepare('SELECT * FROM contact_handles WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; type: string; handle: string; sort_order: number; created_at: number }[]) {
    shared
      .prepare(
        'INSERT INTO contact_handles (id, contact_id, type, handle, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(h.id, contactId, h.type, h.handle, h.sort_order, h.created_at);
  }

  shared.prepare('DELETE FROM contact_alert_rss WHERE contact_id = ?').run(contactId);
  const rssFeeds = local
    .prepare('SELECT * FROM contact_alert_rss WHERE contact_id = ?')
    .all(contactId) as { id: string; rss_url: string; last_polled_at: number | null; is_invalid: number }[];
  for (const rss of rssFeeds) {
    shared
      .prepare(
        'INSERT INTO contact_alert_rss (id, contact_id, rss_url, last_polled_at, is_invalid) VALUES (?, ?, ?, ?, ?)',
      )
      .run(rss.id, contactId, rss.rss_url, rss.last_polled_at, rss.is_invalid);
  }
}

function pushMemberships(
  local: Database.Database,
  shared: Database.Database,
  projectId: string,
  now: number,
): void {
  const memberships = local
    .prepare('SELECT * FROM project_memberships WHERE project_id = ?')
    .all(projectId) as {
    id: string;
    contact_id: string;
    reporter_email: string;
    reporter_name: string;
    theme: string | null;
    priority: string | null;
    status: string | null;
    first_outreach_at: number | null;
    created_at: number;
    updated_at: number;
    synced_at: number | null;
  }[];

  for (const m of memberships) {
    if (!m.synced_at || m.updated_at > m.synced_at) {
      shared
        .prepare(
          `INSERT INTO project_memberships
             (id, contact_id, reporter_email, reporter_name, theme, priority, status,
              first_outreach_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             reporter_email = excluded.reporter_email, reporter_name = excluded.reporter_name,
             theme = excluded.theme, priority = excluded.priority, status = excluded.status,
             first_outreach_at = excluded.first_outreach_at, updated_at = excluded.updated_at`,
        )
        .run(
          m.id,
          m.contact_id,
          m.reporter_email,
          m.reporter_name,
          m.theme,
          m.priority,
          m.status,
          m.first_outreach_at,
          m.created_at,
          m.updated_at,
        );
      local.prepare('UPDATE project_memberships SET synced_at = ? WHERE id = ?').run(now, m.id);
    }
  }
}

function pushAppendOnly(
  local: Database.Database,
  shared: Database.Database,
  contactIds: string[],
  membershipIds: string[],
  now: number,
): void {
  if (contactIds.length > 0) {
    const cPlaceholders = contactIds.map(() => '?').join(',');

    // Alert mentions
    for (const m of local
      .prepare(
        `SELECT * FROM contact_alert_mentions WHERE contact_id IN (${cPlaceholders}) AND synced_at IS NULL`,
      )
      .all(...contactIds) as {
      id: string;
      contact_id: string;
      headline: string;
      source_url: string;
      published_at: number | null;
      fetched_at: number;
      guid: string;
      seen: number;
    }[]) {
      shared
        .prepare(
          `INSERT OR IGNORE INTO contact_alert_mentions
             (id, contact_id, headline, source_url, published_at, fetched_at, guid, seen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          m.id,
          m.contact_id,
          m.headline,
          m.source_url,
          m.published_at,
          m.fetched_at,
          m.guid,
          m.seen,
        );
      local
        .prepare('UPDATE contact_alert_mentions SET synced_at = ? WHERE id = ?')
        .run(now, m.id);
    }
  }

  if (membershipIds.length > 0) {
    const mPlaceholders = membershipIds.map(() => '?').join(',');

    // Interaction log entries
    for (const e of local
      .prepare(
        `SELECT * FROM interaction_log_entries WHERE membership_id IN (${mPlaceholders}) AND synced_at IS NULL`,
      )
      .all(...membershipIds) as {
      id: string;
      membership_id: string;
      reporter_email: string;
      reporter_name: string;
      body: string;
      created_at: number;
    }[]) {
      shared
        .prepare(
          `INSERT OR IGNORE INTO interaction_log_entries
             (id, membership_id, reporter_email, reporter_name, body, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(e.id, e.membership_id, e.reporter_email, e.reporter_name, e.body, e.created_at);
      local
        .prepare('UPDATE interaction_log_entries SET synced_at = ? WHERE id = ?')
        .run(now, e.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function getMemberContactIds(local: Database.Database, projectId: string): string[] {
  return (
    local
      .prepare('SELECT contact_id FROM project_memberships WHERE project_id = ?')
      .all(projectId) as { contact_id: string }[]
  ).map((r) => r.contact_id);
}

export function getMembershipIds(local: Database.Database, projectId: string): string[] {
  return (
    local
      .prepare('SELECT id FROM project_memberships WHERE project_id = ?')
      .all(projectId) as { id: string }[]
  ).map((r) => r.id);
}
