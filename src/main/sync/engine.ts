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
  // better-sqlite3 does not allow nesting transactions from two different
  // database connections — attempting to do so throws "cannot start a transaction
  // within a transaction".  Structure the sync as four sequential phases instead:
  //   1. Read everything needed from both DBs (outside any transaction).
  //   2. Write pull results to localDb in one transaction.
  //   3. Write push results to sharedDb in one transaction.
  //   4. Stamp localDb metadata (last_synced_at) in a final local transaction.
  // (fixes #224)
  try {
    const now = Math.floor(Date.now() / 1000);

    // Phase 1: reads happen inside the pull/push helpers themselves; no outer
    // transaction is needed for reads.

    // Phase 2: pull from shared → local
    localDb.transaction(() => {
      pullContacts(localDb, sharedDb);
      pullMemberships(localDb, sharedDb, projectId, now);
      pullAppendOnly(localDb, sharedDb);
    })();

    // Phase 3: push from local → shared (pure sharedDb writes; synced_at stamps deferred to phase 4)
    const memberRows = localDb
      .prepare('SELECT id, contact_id FROM project_memberships WHERE project_id = ?')
      .all(projectId) as { id: string; contact_id: string }[];
    const contactIds = memberRows.map((r) => r.contact_id);
    const membershipIds = memberRows.map((r) => r.id);

    let pushedContactIds: string[];
    let pushedMembershipIds: string[];
    let pushedMentionIds: string[];
    let pushedLogEntryIds: string[];

    sharedDb.transaction(() => {
      pushedContactIds = pushContacts(localDb, sharedDb, contactIds);
      pushedMembershipIds = pushMemberships(localDb, sharedDb, projectId);
      ({ mentionIds: pushedMentionIds, logEntryIds: pushedLogEntryIds } =
        pushAppendOnly(localDb, sharedDb, contactIds, membershipIds));
    })();

    // Phase 4: stamp synced_at on all successfully-pushed local rows, plus project metadata.
    // Runs after sharedDb.transaction() commits so stamps only apply when the push succeeded.
    const stmtContactSynced = localDb.prepare('UPDATE contacts SET synced_at = ? WHERE id = ?');
    const stmtMembershipSynced = localDb.prepare('UPDATE project_memberships SET synced_at = ? WHERE id = ?');
    const stmtMentionSynced = localDb.prepare('UPDATE contact_alert_mentions SET synced_at = ? WHERE id = ?');
    const stmtLogEntrySynced = localDb.prepare('UPDATE interaction_log_entries SET synced_at = ? WHERE id = ?');
    localDb.transaction(() => {
      for (const id of pushedContactIds!) stmtContactSynced.run(now, id);
      for (const id of pushedMembershipIds!) stmtMembershipSynced.run(now, id);
      for (const id of pushedMentionIds!) stmtMentionSynced.run(now, id);
      for (const id of pushedLogEntryIds!) stmtLogEntrySynced.run(now, id);
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
  // Remap every table with a FK pointing at contacts — derived at runtime so new tables are never missed.
  const allTableNames = (local.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
  for (const table of allTableNames) {
    if (table === 'dedup_dismissed_pairs') continue; // handled below
    const fks = local.prepare(`PRAGMA foreign_key_list("${table}")`).all() as { from: string; table: string }[];
    for (const fk of fks.filter((f) => f.table === 'contacts')) {
      local.prepare(`UPDATE "${table}" SET "${fk.from}" = ? WHERE "${fk.from}" = ?`).run(toId, fromId);
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

  // Identity indexes: email/phone → Set of local contact_ids.
  // Using a Set per key so that if two local contacts share an identifier, both are
  // collected into candidateIds — keeping the candidateIds.size === 1 guard accurate.
  const localEmailToId = new Map<string, Set<string>>();
  for (const { email, contact_id } of local.prepare('SELECT email, contact_id FROM contact_emails').all() as { email: string; contact_id: string }[]) {
    const s = localEmailToId.get(email) ?? new Set<string>();
    s.add(contact_id);
    localEmailToId.set(email, s);
  }
  const localPhoneToId = new Map<string, Set<string>>();
  for (const { phone, contact_id } of local.prepare('SELECT phone, contact_id FROM contact_phones').all() as { phone: string; contact_id: string }[]) {
    const s = localPhoneToId.get(phone) ?? new Set<string>();
    s.add(contact_id);
    localPhoneToId.set(phone, s);
  }

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

        mergeSubTablesFromShared(local, shared, sc.id);
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
        if (found) for (const id of found) candidateIds.add(id);
      }
      for (const { phone } of sharedPhones) {
        const found = localPhoneToId.get(phone);
        if (found) for (const id of found) candidateIds.add(id);
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
        mergeSubTablesFromShared(local, shared, sc.id);
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

        mergeSubTablesFromShared(local, shared, sc.id);
      }

      // Keep identity indexes current so later iterations in this sync see updated state
      for (const { email } of (local.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(sc.id) as { email: string }[])) {
        const s = localEmailToId.get(email) ?? new Set<string>();
        s.add(sc.id);
        localEmailToId.set(email, s);
      }
      for (const { phone } of (local.prepare('SELECT phone FROM contact_phones WHERE contact_id = ?').all(sc.id) as { phone: string }[])) {
        const s = localPhoneToId.get(phone) ?? new Set<string>();
        s.add(sc.id);
        localPhoneToId.set(phone, s);
      }
    }
  }
}

function mergeSubTablesFromShared(
  local: Database.Database,
  shared: Database.Database,
  contactId: string,
): void {
  // Sub-table merge strategy: union of shared rows + local-only rows (rows that
  // exist locally but not in shared). This is additive on the pull side.
  //
  // Deletion behaviour:
  //   Deletions propagate through the PUSH path: when a client deletes a sub-table
  //   row and saves (bumping updated_at), they become the newer editor and push the
  //   trimmed sub-tables to shared on the next sync. Other clients then pull that
  //   state from shared.
  //
  //   The one failure case: if another client edits the same contact after the
  //   deletion (making their updated_at newer), the deleting client will pull on
  //   next sync and the merge will restore the deleted row from shared (resurrection).
  //   The deleted row then exists in the deleting client's local DB, so there is no
  //   longer any local deletion intent — the row survives. The concurrent edit wins.
  //   No data is permanently lost, but the deletion is silently discarded.
  //
  // ── Emails ────────────────────────────────────────────────────────────────
  // Stored emails are already normalised (lowercased, trimmed) — compare directly.
  const sharedEmails = shared
    .prepare('SELECT * FROM contact_emails WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; email: string; label: string | null; sort_order: number; created_at: number }[];
  const localEmails = local
    .prepare('SELECT * FROM contact_emails WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; email: string; label: string | null; sort_order: number; created_at: number }[];

  const sharedEmailValues = new Set(sharedEmails.map((e) => e.email));
  const localOnlyEmails = localEmails.filter((e) => !sharedEmailValues.has(e.email));

  // Merge and sort by insertion time so rows appear in the order they were added.
  const mergedEmails = [...sharedEmails, ...localOnlyEmails].sort((a, b) => a.created_at - b.created_at);

  local.prepare('DELETE FROM contact_emails WHERE contact_id = ?').run(contactId);
  mergedEmails.forEach((e, i) => {
    local
      .prepare('INSERT INTO contact_emails (id, contact_id, email, label, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(e.id, contactId, e.email, e.label, i, e.created_at);
  });

  // ── Phones ────────────────────────────────────────────────────────────────
  // Stored phones are already normalised on save — compare stored values directly.
  const sharedPhones = shared
    .prepare('SELECT * FROM contact_phones WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; phone: string; label: string | null; sort_order: number; created_at: number }[];
  const localPhones = local
    .prepare('SELECT * FROM contact_phones WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; phone: string; label: string | null; sort_order: number; created_at: number }[];

  const sharedPhoneValues = new Set(sharedPhones.map((p) => p.phone));
  const localOnlyPhones = localPhones.filter((p) => !sharedPhoneValues.has(p.phone));

  const mergedPhones = [...sharedPhones, ...localOnlyPhones].sort((a, b) => a.created_at - b.created_at);

  local.prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(contactId);
  mergedPhones.forEach((p, i) => {
    local
      .prepare('INSERT INTO contact_phones (id, contact_id, phone, label, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(p.id, contactId, p.phone, p.label, i, p.created_at);
  });

  // ── Links ─────────────────────────────────────────────────────────────────
  // wayback_url is local-only — snapshot it before DELETE and restore after.
  const sharedLinks = shared
    .prepare('SELECT * FROM contact_links WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; type: string; label: string | null; url: string; sort_order: number; created_at: number }[];
  const localLinks = local
    .prepare('SELECT id, type, label, url, wayback_url, sort_order, created_at FROM contact_links WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; type: string; label: string | null; url: string; wayback_url: string | null; sort_order: number; created_at: number }[];

  const sharedUrlValues = new Set(sharedLinks.map((l) => l.url.trim()));
  const localWaybacks = new Map(localLinks.filter((l) => l.wayback_url).map((l) => [l.url.trim(), l.wayback_url]));
  const localOnlyLinks = localLinks.filter((l) => !sharedUrlValues.has(l.url.trim()));

  // Build merged set: shared rows (with wayback_url restored) + local-only rows, sorted by created_at.
  const mergedLinks = [
    ...sharedLinks.map((l) => ({ ...l, wayback_url: localWaybacks.get(l.url.trim()) ?? null })),
    ...localOnlyLinks,
  ].sort((a, b) => a.created_at - b.created_at);

  local.prepare('DELETE FROM contact_links WHERE contact_id = ?').run(contactId);
  mergedLinks.forEach((l, i) => {
    local
      .prepare('INSERT INTO contact_links (id, contact_id, type, label, url, wayback_url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(l.id, contactId, l.type, l.label, l.url, l.wayback_url, i, l.created_at);
  });

  // ── Handles ───────────────────────────────────────────────────────────────
  const sharedHandles = shared
    .prepare('SELECT * FROM contact_handles WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; type: string; handle: string; sort_order: number; created_at: number }[];
  const localHandles = local
    .prepare('SELECT * FROM contact_handles WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; type: string; handle: string; sort_order: number; created_at: number }[];

  const sharedHandleKeys = new Set(sharedHandles.map((h) => `${h.type}:${h.handle}`));
  const localOnlyHandles = localHandles.filter((h) => !sharedHandleKeys.has(`${h.type}:${h.handle}`));

  const mergedHandles = [...sharedHandles, ...localOnlyHandles].sort((a, b) => a.created_at - b.created_at);

  local.prepare('DELETE FROM contact_handles WHERE contact_id = ?').run(contactId);
  mergedHandles.forEach((h, i) => {
    local
      .prepare('INSERT INTO contact_handles (id, contact_id, type, handle, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(h.id, contactId, h.type, h.handle, i, h.created_at);
  });

  // ── Alert RSS ──────────────────────────────────────────────────────────────
  // Same additive union strategy as emails/phones/links/handles: preserve local-only
  // RSS feeds that haven't been pushed to shared yet.
  const sharedRss = shared
    .prepare('SELECT * FROM contact_alert_rss WHERE contact_id = ?')
    .all(contactId) as { id: string; rss_url: string; last_polled_at: number | null; is_invalid: number }[];
  const localRss = local
    .prepare('SELECT * FROM contact_alert_rss WHERE contact_id = ?')
    .all(contactId) as { id: string; rss_url: string; last_polled_at: number | null; is_invalid: number }[];

  const sharedRssUrls = new Set(sharedRss.map((r) => r.rss_url));
  const localOnlyRss = localRss.filter((r) => !sharedRssUrls.has(r.rss_url));
  const mergedRss = [...sharedRss, ...localOnlyRss];

  local.prepare('DELETE FROM contact_alert_rss WHERE contact_id = ?').run(contactId);
  for (const rss of mergedRss) {
    local
      .prepare(
        'INSERT INTO contact_alert_rss (id, contact_id, rss_url, last_polled_at, is_invalid) VALUES (?, ?, ?, ?, ?)',
      )
      .run(rss.id, contactId, rss.rss_url, rss.last_polled_at, rss.is_invalid);
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

    if (!lm || sm.updated_at > lm.updated_at) {
      // Guard: if there's already a membership for this (contact, project) under a different id
      // (can happen when adoptSharedUuid renamed a local contact to the shared UUID), save its
      // children, delete it, then INSERT sm.id so the re-attach below satisfies FK constraints.
      const conflicting = local
        .prepare('SELECT id FROM project_memberships WHERE contact_id = ? AND project_id = ? AND id != ?')
        .get(sm.contact_id, projectId, sm.id) as { id: string } | undefined;

      type MemberReporter = { id: string; reporter_email: string; reporter_name: string };
      type SavedReminder = { id: string; contact_id: string; project_id: string; due_date: number; note: string | null; is_auto_outreach: number; created_at: number; completed_at: number | null; last_notified_at: number | null };
      let savedLogEntryIds: string[] = [];
      let savedReporters: MemberReporter[] = [];
      let savedReminders: SavedReminder[] = [];

      if (conflicting) {
        // Read children before the CASCADE delete removes them.
        // Log entries themselves survive (contact_id FK); only interaction_projects rows are cascade-deleted.
        savedLogEntryIds = (local.prepare('SELECT interaction_id FROM interaction_projects WHERE membership_id = ?').all(conflicting.id) as { interaction_id: string }[]).map((r) => r.interaction_id);
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
          sm.contact_id,
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
        for (const entryId of savedLogEntryIds) {
          local.prepare('INSERT OR IGNORE INTO interaction_projects (interaction_id, membership_id) VALUES (?, ?)').run(entryId, sm.id);
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
  // Use high-watermarks to avoid loading entire shared tables on every sync.
  // INSERT OR IGNORE is idempotent so re-fetching rows we already have is safe;
  // the watermark merely avoids the memory cost of loading them all upfront.

  const maxFetchedAt = (local
    .prepare('SELECT COALESCE(MAX(fetched_at), 0) AS m FROM contact_alert_mentions')
    .get() as { m: number }).m;

  // Subtract a 30-second overlap window so rows that arrive late (due to clock
  // skew between clients) are always eventually reconciled. Duplicates are safe
  // because the INSERT below uses OR IGNORE.
  const fetchedAtWatermark = Math.max(0, maxFetchedAt - 30);

  // Only import append-only rows for contacts that are members of some project.
  // Contacts pulled from shared without any membership are ignored here — they
  // have no context in the local DB and should not accumulate orphaned data.
  const localContactIds = new Set(
    (local.prepare('SELECT DISTINCT contact_id FROM project_memberships').all() as { contact_id: string }[]).map((r) => r.contact_id),
  );

  for (const sm of shared.prepare(
    'SELECT * FROM contact_alert_mentions WHERE fetched_at >= ?',
  ).all(fetchedAtWatermark) as {
    id: string;
    contact_id: string;
    headline: string;
    source_url: string;
    published_at: number | null;
    fetched_at: number;
    guid: string;
    seen: number;
  }[]) {
    if (!localContactIds.has(sm.contact_id)) continue;
    local
      .prepare(
        `INSERT OR IGNORE INTO contact_alert_mentions
           (id, contact_id, headline, source_url, published_at, fetched_at, guid, seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(sm.id, sm.contact_id, sm.headline, sm.source_url, sm.published_at, sm.fetched_at, sm.guid, sm.seen);
  }

  const maxCreatedAt = (local
    .prepare('SELECT COALESCE(MAX(created_at), 0) AS m FROM interaction_log_entries')
    .get() as { m: number }).m;

  // Same 30-second overlap window as above.
  const createdAtWatermark = Math.max(0, maxCreatedAt - 30);

  for (const se of shared.prepare(
    'SELECT * FROM interaction_log_entries WHERE created_at >= ?',
  ).all(createdAtWatermark) as {
    id: string;
    contact_id: string;
    reporter_email: string;
    reporter_name: string;
    body: string;
    created_at: number;
  }[]) {
    if (!localContactIds.has(se.contact_id)) continue;
    local
      .prepare(
        `INSERT OR IGNORE INTO interaction_log_entries
           (id, contact_id, reporter_email, reporter_name, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(se.id, se.contact_id, se.reporter_email, se.reporter_name, se.body, se.created_at);
  }

  for (const sip of shared.prepare(
    `SELECT ip.* FROM interaction_projects ip
     JOIN interaction_log_entries ile ON ile.id = ip.interaction_id
     WHERE ile.created_at >= ?`,
  ).all(createdAtWatermark) as {
    interaction_id: string;
    membership_id: string;
  }[]) {
    local
      .prepare('INSERT OR IGNORE INTO interaction_projects (interaction_id, membership_id) VALUES (?, ?)')
      .run(sip.interaction_id, sip.membership_id);
  }
}

// ---------------------------------------------------------------------------
// Push helpers
// ---------------------------------------------------------------------------

function pushContacts(
  local: Database.Database,
  shared: Database.Database,
  contactIds: string[],
): string[] {
  const pushed: string[] = [];
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
      pushed.push(contactId);
    }
  }
  return pushed;
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
): string[] {
  const pushed: string[] = [];
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
      pushed.push(m.id);
    }
  }
  return pushed;
}

function pushAppendOnly(
  local: Database.Database,
  shared: Database.Database,
  contactIds: string[],
  membershipIds: string[],
): { mentionIds: string[]; logEntryIds: string[] } {
  const membershipIdSet = new Set(membershipIds);
  // SQLite's SQLITE_LIMIT_VARIABLE_NUMBER defaults to 999. Chunk large ID lists
  // to stay safely below that limit.
  const CHUNK = 500;

  const mentionIds: string[] = [];
  const logEntryIds: string[] = [];
  if (contactIds.length > 0) {
    // Alert mentions
    for (let i = 0; i < contactIds.length; i += CHUNK) {
      const chunk = contactIds.slice(i, i + CHUNK);
      const cPlaceholders = chunk.map(() => '?').join(',');
      for (const m of local
        .prepare(
          `SELECT * FROM contact_alert_mentions WHERE contact_id IN (${cPlaceholders}) AND synced_at IS NULL`,
        )
        .all(...chunk) as {
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
          .run(m.id, m.contact_id, m.headline, m.source_url, m.published_at, m.fetched_at, m.guid, m.seen);
        mentionIds.push(m.id);
      }
    }
  }

  if (membershipIds.length > 0) {
    // Interaction log entries (push entries not yet synced that are linked to these memberships)
    const seenEntryIds = new Set<string>();
    for (let i = 0; i < membershipIds.length; i += CHUNK) {
      const chunk = membershipIds.slice(i, i + CHUNK);
      const mPlaceholders = chunk.map(() => '?').join(',');
      for (const e of local
        .prepare(
          `SELECT DISTINCT ile.id, ile.contact_id, ile.reporter_email, ile.reporter_name, ile.body, ile.created_at
           FROM interaction_log_entries ile
           JOIN interaction_projects ip ON ip.interaction_id = ile.id
           WHERE ip.membership_id IN (${mPlaceholders}) AND ile.synced_at IS NULL`,
        )
        .all(...chunk) as {
        id: string;
        contact_id: string;
        reporter_email: string;
        reporter_name: string;
        body: string;
        created_at: number;
      }[]) {
        // seenEntryIds prevents double-inserting entries that appear across multiple membership
        // chunks. The interaction_projects loop below fetches all rows for e.id (not just the
        // current chunk), so the first encounter pushes everything valid — later encounters
        // are safe to skip entirely.
        if (seenEntryIds.has(e.id)) continue;
        seenEntryIds.add(e.id);
        shared
          .prepare(
            `INSERT OR IGNORE INTO interaction_log_entries
               (id, contact_id, reporter_email, reporter_name, body, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(e.id, e.contact_id, e.reporter_email, e.reporter_name, e.body, e.created_at);
        // Only push interaction_projects rows referencing this project's memberships.
        // Rows pointing at other projects' memberships don't exist in this shared DB
        // and would cause FK violations.
        for (const ip of local
          .prepare('SELECT interaction_id, membership_id FROM interaction_projects WHERE interaction_id = ?')
          .all(e.id) as { interaction_id: string; membership_id: string }[]) {
          if (!membershipIdSet.has(ip.membership_id)) continue;
          shared
            .prepare('INSERT OR IGNORE INTO interaction_projects (interaction_id, membership_id) VALUES (?, ?)')
            .run(ip.interaction_id, ip.membership_id);
        }
        logEntryIds.push(e.id);
      }
    }
  }

  return { mentionIds, logEntryIds };
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
