import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3-multiple-ciphers';

const TOMBSTONE_TTL_SECONDS = 90 * 24 * 3600;


export interface SyncResult {
  success: boolean;
  error?: string;
}

/**
 * Bidirectional sync between local and shared DBs for a single project.
 *
 * Replication state:
 *   - Push tracking lives in the local sync_pushed table, keyed by
 *     (project_id, table_name, row_id). A row is pushed when it has no entry
 *     for this project, or when its updated_at is newer than pushed_at.
 *   - Deletions propagate through sync_tombstones. Sub-table rows
 *     (emails/phones/links/handles/tags) are filtered during the union merge;
 *     contacts, project_memberships, and interaction_log_entries tombstones
 *     are applied directly: matching rows are deleted on both sides.
 *     Conflict rule: for contacts and memberships, an edit with
 *     updated_at > deleted_at beats the tombstone (the row survives and the
 *     tombstone is dropped); otherwise the delete wins, including ties.
 *     Log entries are immutable, so their tombstones always win.
 *
 * Pull strategy:
 *   - Contacts + their sub-tables (emails/phones/links/alert_rss): LWW by
 *     contact.updated_at. When shared contact is newer, replace the contact row
 *     AND all its sub-tables.
 *   - project_memberships: LWW by membership.updated_at.
 *   - contact_alert_mentions, interaction_log_entries: append-only — full-table
 *     scan with INSERT OR IGNORE. No watermarks: rows arrive in the shared file
 *     in sync order, not timestamp order (an offline client can upload old rows
 *     long after newer ones exist locally), so any timestamp cutoff can skip
 *     rows permanently.
 *
 * Push strategy:
 *   - Contacts / memberships: push when sync_pushed has no fresh record for
 *     this project (see above), then replace sub-tables wholesale.
 *   - Append-only tables: push rows with no sync_pushed record for this project.
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
  //   4. Stamp localDb push records (sync_pushed) in a final local transaction.
  // (fixes #224)
  try {
    const now = Math.floor(Date.now() / 1000);

    // Phase 2: pull from shared → local
    localDb.transaction(() => {
      pullTombstones(localDb, sharedDb);
      const tombstones = loadLocalTombstones(localDb);
      applyTombstonesLocal(localDb, tombstones);
      pullContacts(localDb, sharedDb, tombstones);
      pullMemberships(localDb, sharedDb, projectId, now, tombstones);
      pullAppendOnly(localDb, sharedDb, projectId, tombstones);
    })();

    // Phase 3: push from local → shared (pure sharedDb writes; sync_pushed stamps deferred to phase 4)
    const memberRows = localDb
      .prepare('SELECT id, contact_id FROM project_memberships WHERE project_id = ?')
      .all(projectId) as { id: string; contact_id: string }[];
    const contactIds = memberRows.map((r) => r.contact_id);
    const membershipIds = memberRows.map((r) => r.id);

    let pushedContactIds: string[];
    let pushedMembershipIds: string[];
    let pushedMentionIds: string[];
    let pushedLogEntryIds: string[];

    // Reload — the pull phase can add tombstones from shared and drop ones that
    // lost to a newer edit.
    const tombstones = loadLocalTombstones(localDb);

    sharedDb.transaction(() => {
      pushTombstones(localDb, sharedDb, now);
      applyTombstonesShared(sharedDb, tombstones);
      pushedContactIds = pushContacts(localDb, sharedDb, projectId, contactIds);
      pushedMembershipIds = pushMemberships(localDb, sharedDb, projectId);
      ({ mentionIds: pushedMentionIds, logEntryIds: pushedLogEntryIds } =
        pushAppendOnly(localDb, sharedDb, projectId, contactIds, membershipIds));
    })();

    // Phase 4: record push state for all successfully-pushed rows, plus project metadata.
    // Runs after sharedDb.transaction() commits so records only apply when the push succeeded.
    const stampPushed = localDb.prepare(
      'INSERT OR REPLACE INTO sync_pushed (project_id, table_name, row_id, pushed_at) VALUES (?, ?, ?, ?)',
    );
    localDb.transaction(() => {
      for (const id of pushedContactIds!) stampPushed.run(projectId, 'contacts', id, now);
      for (const id of pushedMembershipIds!) stampPushed.run(projectId, 'project_memberships', id, now);
      for (const id of pushedMentionIds!) stampPushed.run(projectId, 'contact_alert_mentions', id, now);
      for (const id of pushedLogEntryIds!) stampPushed.run(projectId, 'interaction_log_entries', id, now);
      localDb.prepare('UPDATE projects SET shared_pending_writes = 0, last_synced_at = ? WHERE id = ?').run(now, projectId);
      localDb.prepare('DELETE FROM sync_tombstones WHERE deleted_at < ?').run(now - TOMBSTONE_TTL_SECONDS);
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
// Tombstone helpers
// ---------------------------------------------------------------------------

// table_name → (row_id → deleted_at)
type TombstoneMap = Map<string, Map<string, number>>;

function pullTombstones(local: Database.Database, shared: Database.Database): void {
  const rows = shared.prepare('SELECT table_name, row_id, deleted_at FROM sync_tombstones').all() as {
    table_name: string; row_id: string; deleted_at: number;
  }[];
  const upsert = local.prepare(`
    INSERT INTO sync_tombstones (table_name, row_id, deleted_at) VALUES (?, ?, ?)
    ON CONFLICT(table_name, row_id) DO UPDATE SET deleted_at = MAX(deleted_at, excluded.deleted_at)
  `);
  for (const r of rows) upsert.run(r.table_name, r.row_id, r.deleted_at);
}

function pushTombstones(local: Database.Database, shared: Database.Database, now: number): void {
  const rows = local.prepare('SELECT table_name, row_id, deleted_at FROM sync_tombstones').all() as {
    table_name: string; row_id: string; deleted_at: number;
  }[];
  const upsert = shared.prepare(`
    INSERT INTO sync_tombstones (table_name, row_id, deleted_at) VALUES (?, ?, ?)
    ON CONFLICT(table_name, row_id) DO UPDATE SET deleted_at = MAX(deleted_at, excluded.deleted_at)
  `);
  for (const r of rows) upsert.run(r.table_name, r.row_id, r.deleted_at);
  shared.prepare('DELETE FROM sync_tombstones WHERE deleted_at < ?').run(now - TOMBSTONE_TTL_SECONDS);
}

function loadLocalTombstones(local: Database.Database): TombstoneMap {
  const map: TombstoneMap = new Map();
  for (const { table_name, row_id, deleted_at } of local.prepare('SELECT table_name, row_id, deleted_at FROM sync_tombstones').all() as { table_name: string; row_id: string; deleted_at: number }[]) {
    let m = map.get(table_name);
    if (!m) { m = new Map<string, number>(); map.set(table_name, m); }
    m.set(row_id, deleted_at);
  }
  return map;
}

/**
 * Deletes locally-present rows that have an active tombstone. Mutates the
 * passed map when a tombstone loses to a newer edit so later pull steps see
 * the same view as the database.
 */
function applyTombstonesLocal(local: Database.Database, tombstones: TombstoneMap): void {
  const dropTombstone = local.prepare('DELETE FROM sync_tombstones WHERE table_name = ? AND row_id = ?');
  const dropPushRecords = local.prepare('DELETE FROM sync_pushed WHERE table_name = ? AND row_id = ?');

  for (const table of ['contacts', 'project_memberships'] as const) {
    const idCol = 'id';
    for (const [rowId, deletedAt] of tombstones.get(table) ?? []) {
      const row = local.prepare(`SELECT updated_at FROM "${table}" WHERE "${idCol}" = ?`).get(rowId) as
        | { updated_at: number }
        | undefined;
      if (!row) continue;
      if (row.updated_at > deletedAt) {
        // Edit is newer than the delete — the row survives everywhere.
        dropTombstone.run(table, rowId);
        tombstones.get(table)!.delete(rowId);
      } else {
        local.prepare(`DELETE FROM "${table}" WHERE "${idCol}" = ?`).run(rowId);
        dropPushRecords.run(table, rowId);
      }
    }
  }

  // Log entries are immutable — tombstones always win.
  for (const [rowId] of tombstones.get('interaction_log_entries') ?? []) {
    local.prepare('DELETE FROM interaction_log_entries WHERE id = ?').run(rowId);
    dropPushRecords.run('interaction_log_entries', rowId);
  }
}

/**
 * Deletes shared rows covered by an active local tombstone. When the shared row
 * is newer than the tombstone the row is left in place — the pull side resolves
 * that case by dropping the tombstone and re-pulling the row.
 */
function applyTombstonesShared(shared: Database.Database, tombstones: TombstoneMap): void {
  for (const table of ['contacts', 'project_memberships'] as const) {
    for (const [rowId, deletedAt] of tombstones.get(table) ?? []) {
      const row = shared.prepare(`SELECT updated_at FROM "${table}" WHERE id = ?`).get(rowId) as
        | { updated_at: number }
        | undefined;
      if (!row) continue;
      if (row.updated_at > deletedAt) continue;
      shared.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(rowId);
    }
  }
  for (const [rowId] of tombstones.get('interaction_log_entries') ?? []) {
    shared.prepare('DELETE FROM interaction_log_entries WHERE id = ?').run(rowId);
  }
}

// Returns true when the tombstone should suppress a row with the given
// updated_at (delete wins on ties). Mutating cleanup happens at the call sites.
function tombstoneWins(deletedAt: number | undefined, updatedAt: number): boolean {
  return deletedAt !== undefined && deletedAt >= updatedAt;
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
    notes: string | null; default_membership_id: string | null; created_at: number; updated_at: number;
  };
  local
    .prepare(
      'INSERT INTO contacts (id, name, organization, title, dob, notes, default_membership_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(toId, c.name, c.organization, c.title ?? null, c.dob ?? null, c.notes, c.default_membership_id ?? null, c.created_at, c.updated_at);
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
  // Push records for the abandoned UUID are meaningless; the adopted UUID's
  // records are cleared by the caller so the merged contact re-pushes everywhere.
  local.prepare("DELETE FROM sync_pushed WHERE table_name = 'contacts' AND row_id = ?").run(fromId);
  local.prepare('DELETE FROM contacts WHERE id = ?').run(fromId);
}

function pullContacts(local: Database.Database, shared: Database.Database, tombstones: TombstoneMap): void {
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

  const contactTombstones = tombstones.get('contacts') ?? new Map<string, number>();
  const dropTombstone = local.prepare("DELETE FROM sync_tombstones WHERE table_name = 'contacts' AND row_id = ?");
  // Clearing a contact's push records marks it dirty for every project, so the
  // merged union propagates everywhere (this replaces the old synced_at = 0 trick).
  const markDirty = local.prepare("DELETE FROM sync_pushed WHERE table_name = 'contacts' AND row_id = ?");

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
    // Deletion vs edit: the tombstone wins unless the shared row was edited
    // after the delete, in which case the edit revives the contact.
    const deletedAt = contactTombstones.get(sc.id);
    if (deletedAt !== undefined) {
      if (tombstoneWins(deletedAt, sc.updated_at)) continue;
      dropTombstone.run(sc.id);
      contactTombstones.delete(sc.id);
    }

    const localUpdatedAt = localMap.get(sc.id);

    if (localUpdatedAt !== undefined) {
      // Contact already exists by ID — normal LWW path
      if (sc.updated_at > localUpdatedAt) {
        local
          .prepare(
            `INSERT INTO contacts (id, name, organization, title, dob, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name, organization = excluded.organization,
               title = excluded.title, dob = excluded.dob, notes = excluded.notes,
               updated_at = excluded.updated_at`,
          )
          .run(sc.id, sc.name, sc.organization, sc.title ?? null, sc.dob ?? null, sc.notes, sc.created_at, sc.updated_at);

        mergeSubTablesFromShared(local, shared, sc.id, tombstones);
        markDirty.run(sc.id);
      }
    } else {
      // No local contact with this UUID — check for an identity match by email/phone
      const sharedEmails = shared
        .prepare('SELECT email FROM contact_emails WHERE contact_id = ?')
        .all(sc.id) as { email: string }[];
      const sharedPhones = shared
        .prepare('SELECT phone FROM contact_phones WHERE contact_id = ?')
        .all(sc.id) as { phone: string }[];

      // Collect all candidate local IDs matching any shared email/phone, plus a
      // separate set for email matches only. Phone numbers aren't personal identifiers
      // (office landline, family phone), so a phone-only match must never trigger
      // adoption on its own — but it still counts toward the ambiguity check below,
      // so a phone match against a *different* contact than the email match still
      // blocks adoption instead of being silently dropped.
      const candidateIds = new Set<string>();
      const emailMatchedIds = new Set<string>();
      for (const { email } of sharedEmails) {
        const found = localEmailToId.get(email);
        if (found) for (const id of found) {
          candidateIds.add(id);
          emailMatchedIds.add(id);
        }
      }
      for (const { phone } of sharedPhones) {
        const found = localPhoneToId.get(phone);
        if (found) for (const id of found) candidateIds.add(id);
      }
      // Only adopt when signals converge on exactly one local contact AND that
      // contact was matched by email (a phone-only match is never sufficient).
      const matchedLocalId =
        candidateIds.size === 1 && emailMatchedIds.has([...candidateIds][0])
          ? [...candidateIds][0]
          : undefined;

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
              `UPDATE contacts SET name = ?, organization = ?, title = ?, dob = ?, notes = ?, updated_at = ?
               WHERE id = ?`,
            )
            .run(sc.name, sc.organization, sc.title ?? null, sc.dob ?? null, sc.notes, sc.updated_at, sc.id);
        }
        mergeSubTablesFromShared(local, shared, sc.id, tombstones);
        markDirty.run(sc.id);
      } else {
        // Genuinely new contact (or ambiguous multi-match / already-adopted local contact)
        local
          .prepare(
            `INSERT INTO contacts (id, name, organization, title, dob, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name, organization = excluded.organization,
               title = excluded.title, dob = excluded.dob, notes = excluded.notes,
               updated_at = excluded.updated_at`,
          )
          .run(sc.id, sc.name, sc.organization, sc.title ?? null, sc.dob ?? null, sc.notes, sc.created_at, sc.updated_at);

        mergeSubTablesFromShared(local, shared, sc.id, tombstones);
        markDirty.run(sc.id);
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
  tombstones: TombstoneMap,
): void {
  // Sub-table merge strategy: union of shared rows + local-only rows (rows that
  // exist locally but not in shared). Local-only rows whose IDs appear in the local
  // tombstone table are excluded so that explicit deletions propagate across clients.
  //
  // ── Emails ────────────────────────────────────────────────────────────────
  // Stored emails are already normalised (lowercased, trimmed) — compare directly.
  const sharedEmails = shared
    .prepare('SELECT * FROM contact_emails WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; email: string; label: string | null; sort_order: number; created_at: number }[];
  const localEmails = local
    .prepare('SELECT * FROM contact_emails WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; email: string; label: string | null; sort_order: number; created_at: number }[];

  const emailTombstones = tombstones.get('contact_emails') ?? new Map<string, number>();
  const filteredSharedEmails = sharedEmails.filter((e) => !emailTombstones.has(e.id));
  const sharedEmailValues = new Set(filteredSharedEmails.map((e) => e.email));
  const localOnlyEmails = localEmails.filter((e) => !sharedEmailValues.has(e.email) && !emailTombstones.has(e.id));

  // Merge and sort by insertion time so rows appear in the order they were added.
  const mergedEmails = [...filteredSharedEmails, ...localOnlyEmails].sort((a, b) => a.created_at - b.created_at);

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

  const phoneTombstones = tombstones.get('contact_phones') ?? new Map<string, number>();
  const filteredSharedPhones = sharedPhones.filter((p) => !phoneTombstones.has(p.id));
  const sharedPhoneValues = new Set(filteredSharedPhones.map((p) => p.phone));
  const localOnlyPhones = localPhones.filter((p) => !sharedPhoneValues.has(p.phone) && !phoneTombstones.has(p.id));

  const mergedPhones = [...filteredSharedPhones, ...localOnlyPhones].sort((a, b) => a.created_at - b.created_at);

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

  const localWaybacks = new Map(localLinks.filter((l) => l.wayback_url).map((l) => [l.url.trim(), l.wayback_url]));
  const linkTombstones = tombstones.get('contact_links') ?? new Map<string, number>();
  const filteredSharedLinks = sharedLinks.filter((l) => !linkTombstones.has(l.id));
  const sharedUrlValues = new Set(filteredSharedLinks.map((l) => l.url.trim()));
  const localOnlyLinks = localLinks.filter((l) => !sharedUrlValues.has(l.url.trim()) && !linkTombstones.has(l.id));

  // Build merged set: shared rows (with wayback_url restored) + local-only rows, sorted by created_at.
  const mergedLinks = [
    ...filteredSharedLinks.map((l) => ({ ...l, wayback_url: localWaybacks.get(l.url.trim()) ?? null })),
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

  const handleTombstones = tombstones.get('contact_handles') ?? new Map<string, number>();
  const filteredSharedHandles = sharedHandles.filter((h) => !handleTombstones.has(h.id));
  const sharedHandleKeys = new Set(filteredSharedHandles.map((h) => `${h.type}:${h.handle}`));
  const localOnlyHandles = localHandles.filter((h) => !sharedHandleKeys.has(`${h.type}:${h.handle}`) && !handleTombstones.has(h.id));

  const mergedHandles = [...filteredSharedHandles, ...localOnlyHandles].sort((a, b) => a.created_at - b.created_at);

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

  // ── Tags ──────────────────────────────────────────────────────────────────
  const sharedTags = shared
    .prepare('SELECT * FROM contact_tags WHERE contact_id = ?')
    .all(contactId) as { id: string; tag: string; created_at: number }[];
  const localTags = local
    .prepare('SELECT * FROM contact_tags WHERE contact_id = ?')
    .all(contactId) as { id: string; tag: string; created_at: number }[];

  const tagTombstones = tombstones.get('contact_tags') ?? new Map<string, number>();
  const filteredSharedTags = sharedTags.filter((t) => !tagTombstones.has(t.id));
  const sharedTagValues = new Set(filteredSharedTags.map((t) => t.tag));
  const localOnlyTags = localTags.filter((t) => !sharedTagValues.has(t.tag) && !tagTombstones.has(t.id));
  const mergedTags = [...filteredSharedTags, ...localOnlyTags];

  local.prepare('DELETE FROM contact_tags WHERE contact_id = ?').run(contactId);
  const insertLocalTag = local.prepare('INSERT OR IGNORE INTO contact_tags (id, contact_id, tag, created_at) VALUES (?, ?, ?, ?)');
  for (const t of mergedTags) {
    insertLocalTag.run(t.id, contactId, t.tag, t.created_at);
  }
}

function pullMemberships(
  local: Database.Database,
  shared: Database.Database,
  projectId: string,
  now: number,
  tombstones: TombstoneMap,
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

  const membershipTombstones = tombstones.get('project_memberships') ?? new Map<string, number>();
  const contactTombstones = tombstones.get('contacts') ?? new Map<string, number>();
  const dropTombstone = local.prepare("DELETE FROM sync_tombstones WHERE table_name = 'project_memberships' AND row_id = ?");
  // Pulled memberships are stamped as pushed so they don't echo straight back.
  const stampPushed = local.prepare(
    "INSERT OR REPLACE INTO sync_pushed (project_id, table_name, row_id, pushed_at) VALUES (?, 'project_memberships', ?, ?)",
  );

  for (const sm of sharedMemberships) {
    // Membership deleted locally (or on another client): tombstone wins unless
    // the shared membership was edited after the delete.
    const deletedAt = membershipTombstones.get(sm.id);
    if (deletedAt !== undefined) {
      if (tombstoneWins(deletedAt, sm.updated_at)) continue;
      dropTombstone.run(sm.id);
      membershipTombstones.delete(sm.id);
    }
    // Never resurrect a membership whose contact is tombstoned — the FK insert
    // would fail anyway once the contact row is gone.
    if (tombstoneWins(contactTombstones.get(sm.contact_id), sm.updated_at)) continue;
    // The contact may legitimately be absent locally (e.g. skipped by an active
    // tombstone in pullContacts) — skip rather than violate the FK.
    if (!local.prepare('SELECT 1 FROM contacts WHERE id = ?').get(sm.contact_id)) continue;

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
              status, first_outreach_at, created_at, updated_at, reporter_conflict)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             reporter_email = excluded.reporter_email, reporter_name = excluded.reporter_name,
             theme = excluded.theme, priority = excluded.priority, status = excluded.status,
             first_outreach_at = excluded.first_outreach_at,
             updated_at = excluded.updated_at,
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
          hasConflict,
        );
      stampPushed.run(projectId, sm.id, now);

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
  projectId: string,
  tombstones: TombstoneMap,
): void {
  // Full-table scan with INSERT OR IGNORE — no watermarks. Rows land in the
  // shared file in sync order, not timestamp order (an offline client can
  // upload old rows long after newer ones exist locally), so any timestamp
  // cutoff can skip rows permanently. The scan is O(shared rows) per sync,
  // which is fine at this application's scale.

  // Only import append-only rows for contacts that are members of some project.
  // Contacts pulled from shared without any membership are ignored here — they
  // have no context in the local DB and should not accumulate orphaned data.
  const localContactIds = new Set(
    (local.prepare('SELECT DISTINCT contact_id FROM project_memberships').all() as { contact_id: string }[]).map((r) => r.contact_id),
  );

  const logTombstones = tombstones.get('interaction_log_entries') ?? new Map<string, number>();

  // Rows we pulled are stamped as pushed for this project so they don't echo
  // straight back on the next push. Stamp only on actual insert (changes > 0):
  // rows we already had keep whatever push state they carry.
  const stampMention = local.prepare(
    "INSERT OR REPLACE INTO sync_pushed (project_id, table_name, row_id, pushed_at) VALUES (?, 'contact_alert_mentions', ?, ?)",
  );
  const stampLogEntry = local.prepare(
    "INSERT OR REPLACE INTO sync_pushed (project_id, table_name, row_id, pushed_at) VALUES (?, 'interaction_log_entries', ?, ?)",
  );
  const now = Math.floor(Date.now() / 1000);

  for (const sm of shared.prepare('SELECT * FROM contact_alert_mentions').all() as {
    id: string;
    contact_id: string;
    headline: string;
    source_url: string;
    published_at: number | null;
    fetched_at: number;
    guid: string;
  }[]) {
    if (!localContactIds.has(sm.contact_id)) continue;
    // seen/dismissed are per-user read state (issue #448) — never synced, so
    // pulled mentions always land locally as unseen regardless of the shared
    // row's state.
    const { changes } = local
      .prepare(
        `INSERT OR IGNORE INTO contact_alert_mentions
           (id, contact_id, headline, source_url, published_at, fetched_at, guid)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(sm.id, sm.contact_id, sm.headline, sm.source_url, sm.published_at, sm.fetched_at, sm.guid);
    if (changes > 0) stampMention.run(projectId, sm.id, now);
  }

  for (const se of shared.prepare('SELECT * FROM interaction_log_entries').all() as {
    id: string;
    contact_id: string;
    reporter_email: string;
    reporter_name: string;
    body: string;
    created_at: number;
  }[]) {
    if (!localContactIds.has(se.contact_id)) continue;
    if (logTombstones.has(se.id)) continue;
    const { changes } = local
      .prepare(
        `INSERT OR IGNORE INTO interaction_log_entries
           (id, contact_id, reporter_email, reporter_name, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(se.id, se.contact_id, se.reporter_email, se.reporter_name, se.body, se.created_at);
    if (changes > 0) stampLogEntry.run(projectId, se.id, now);
  }

  // Guard both FK targets: the entry may have been skipped above (non-member
  // contact or tombstoned) and the membership may be tombstoned/absent locally.
  const insertIp = local.prepare(
    `INSERT OR IGNORE INTO interaction_projects (interaction_id, membership_id)
     SELECT ?, ?
     WHERE EXISTS (SELECT 1 FROM interaction_log_entries WHERE id = ?)
       AND EXISTS (SELECT 1 FROM project_memberships WHERE id = ?)`,
  );
  for (const sip of shared.prepare('SELECT interaction_id, membership_id FROM interaction_projects').all() as {
    interaction_id: string;
    membership_id: string;
  }[]) {
    insertIp.run(sip.interaction_id, sip.membership_id, sip.interaction_id, sip.membership_id);
  }
}

// ---------------------------------------------------------------------------
// Push helpers
// ---------------------------------------------------------------------------

function pushContacts(
  local: Database.Database,
  shared: Database.Database,
  projectId: string,
  contactIds: string[],
): string[] {
  const pushed: string[] = [];
  const getPushRecord = local.prepare(
    "SELECT pushed_at FROM sync_pushed WHERE project_id = ? AND table_name = 'contacts' AND row_id = ?",
  );
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
        }
      | undefined;
    if (!lc) continue;

    const rec = getPushRecord.get(projectId, contactId) as { pushed_at: number } | undefined;
    if (!rec || lc.updated_at > rec.pushed_at) {
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

  shared.prepare('DELETE FROM contact_tags WHERE contact_id = ?').run(contactId);
  const tagRows = local
    .prepare('SELECT * FROM contact_tags WHERE contact_id = ?')
    .all(contactId) as { id: string; tag: string; created_at: number }[];
  const insertSharedTag = shared.prepare('INSERT INTO contact_tags (id, contact_id, tag, created_at) VALUES (?, ?, ?, ?)');
  for (const t of tagRows) {
    insertSharedTag.run(t.id, contactId, t.tag, t.created_at);
  }
}

function pushMemberships(
  local: Database.Database,
  shared: Database.Database,
  projectId: string,
): string[] {
  const pushed: string[] = [];
  const getPushRecord = local.prepare(
    "SELECT pushed_at FROM sync_pushed WHERE project_id = ? AND table_name = 'project_memberships' AND row_id = ?",
  );
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
  }[];

  for (const m of memberships) {
    const rec = getPushRecord.get(projectId, m.id) as { pushed_at: number } | undefined;
    if (!rec || m.updated_at > rec.pushed_at) {
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
  projectId: string,
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
    // Alert mentions: rows with no push record for this project.
    for (let i = 0; i < contactIds.length; i += CHUNK) {
      const chunk = contactIds.slice(i, i + CHUNK);
      const cPlaceholders = chunk.map(() => '?').join(',');
      for (const m of local
        .prepare(
          `SELECT m.* FROM contact_alert_mentions m
           WHERE m.contact_id IN (${cPlaceholders})
             AND NOT EXISTS (
               SELECT 1 FROM sync_pushed sp
               WHERE sp.project_id = ? AND sp.table_name = 'contact_alert_mentions' AND sp.row_id = m.id
             )`,
        )
        .all(...chunk, projectId) as {
        id: string;
        contact_id: string;
        headline: string;
        source_url: string;
        published_at: number | null;
        fetched_at: number;
        guid: string;
      }[]) {
        // seen/dismissed are per-user read state (issue #448) — never pushed, so
        // the shared row always lands as unseen regardless of the local state.
        shared
          .prepare(
            `INSERT OR IGNORE INTO contact_alert_mentions
               (id, contact_id, headline, source_url, published_at, fetched_at, guid)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(m.id, m.contact_id, m.headline, m.source_url, m.published_at, m.fetched_at, m.guid);
        mentionIds.push(m.id);
      }
    }
  }

  if (membershipIds.length > 0) {
    // Interaction log entries: entries linked to this project's memberships with
    // no push record for this project.
    const seenEntryIds = new Set<string>();
    for (let i = 0; i < membershipIds.length; i += CHUNK) {
      const chunk = membershipIds.slice(i, i + CHUNK);
      const mPlaceholders = chunk.map(() => '?').join(',');
      for (const e of local
        .prepare(
          `SELECT DISTINCT ile.id, ile.contact_id, ile.reporter_email, ile.reporter_name, ile.body, ile.created_at
           FROM interaction_log_entries ile
           JOIN interaction_projects ip ON ip.interaction_id = ile.id
           WHERE ip.membership_id IN (${mPlaceholders})
             AND NOT EXISTS (
               SELECT 1 FROM sync_pushed sp
               WHERE sp.project_id = ? AND sp.table_name = 'interaction_log_entries' AND sp.row_id = ile.id
             )`,
        )
        .all(...chunk, projectId) as {
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

/** Writes a deletion tombstone. Callers must run this inside the same
 *  transaction as the DELETE itself so the two can never diverge. */
export function writeTombstone(db: Database.Database, tableName: string, rowId: string, deletedAt: number): void {
  db.prepare(
    `INSERT INTO sync_tombstones (table_name, row_id, deleted_at) VALUES (?, ?, ?)
     ON CONFLICT(table_name, row_id) DO UPDATE SET deleted_at = MAX(deleted_at, excluded.deleted_at)`,
  ).run(tableName, rowId, deletedAt);
}
