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
 *   - contact_archives, contact_alert_mentions, interview_dates, interaction_log_entries:
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
        pullContacts(localDb, sharedDb, now);
        pullMemberships(localDb, sharedDb, projectId, now);
        pullAppendOnly(localDb, sharedDb, now);
      })();

      const contactIds = getMemberContactIds(localDb, projectId);
      const membershipIds = getMembershipIds(localDb, projectId);

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

function pullContacts(local: Database.Database, shared: Database.Database, now: number): void {
  const sharedContacts = shared.prepare('SELECT * FROM contacts').all() as {
    id: string;
    name: string;
    organization: string | null;
    notes: string | null;
    created_at: number;
    updated_at: number;
  }[];

  for (const sc of sharedContacts) {
    const lc = local.prepare('SELECT updated_at FROM contacts WHERE id = ?').get(sc.id) as
      | { updated_at: number }
      | undefined;

    if (!lc || sc.updated_at > lc.updated_at) {
      local
        .prepare(
          `INSERT INTO contacts (id, name, organization, notes, created_at, updated_at, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, organization = excluded.organization,
             notes = excluded.notes, updated_at = excluded.updated_at,
             synced_at = excluded.synced_at`,
        )
        .run(sc.id, sc.name, sc.organization, sc.notes, sc.created_at, sc.updated_at, now);

      replaceSubTablesFromShared(local, shared, sc.id);
    }
  }
}

function replaceSubTablesFromShared(
  local: Database.Database,
  shared: Database.Database,
  contactId: string,
): void {
  // Emails
  local.prepare('DELETE FROM contact_emails WHERE contact_id = ?').run(contactId);
  for (const e of shared
    .prepare('SELECT * FROM contact_emails WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; email: string; label: string | null; sort_order: number }[]) {
    local
      .prepare(
        'INSERT INTO contact_emails (id, contact_id, email, label, sort_order) VALUES (?, ?, ?, ?, ?)',
      )
      .run(e.id, contactId, e.email, e.label, e.sort_order);
  }

  // Phones
  local.prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(contactId);
  for (const p of shared
    .prepare('SELECT * FROM contact_phones WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; phone: string; sort_order: number }[]) {
    local
      .prepare(
        'INSERT INTO contact_phones (id, contact_id, phone, sort_order) VALUES (?, ?, ?, ?)',
      )
      .run(p.id, contactId, p.phone, p.sort_order);
  }

  // Links
  local.prepare('DELETE FROM contact_links WHERE contact_id = ?').run(contactId);
  for (const l of shared
    .prepare('SELECT * FROM contact_links WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as {
    id: string;
    type: string;
    label: string | null;
    url: string;
    sort_order: number;
  }[]) {
    local
      .prepare(
        'INSERT INTO contact_links (id, contact_id, type, label, url, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(l.id, contactId, l.type, l.label, l.url, l.sort_order);
  }

  // Alert RSS (one per contact)
  local.prepare('DELETE FROM contact_alert_rss WHERE contact_id = ?').run(contactId);
  const rss = shared
    .prepare('SELECT * FROM contact_alert_rss WHERE contact_id = ?')
    .get(contactId) as
    | { id: string; rss_url: string; last_polled_at: number | null; is_invalid: number }
    | undefined;
  if (rss) {
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
  const CONFLICT_WINDOW_SECS = 24 * 3600; // 24-hour window for reporter conflict detection

  const sharedMemberships = shared.prepare('SELECT * FROM project_memberships').all() as {
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

  for (const sm of sharedMemberships) {
    const lm = local.prepare('SELECT updated_at, reporter_email, reporter_assigned_at FROM project_memberships WHERE id = ?').get(sm.id) as
      | { updated_at: number; reporter_email: string; reporter_assigned_at: number | null }
      | undefined;

    if (!lm || sm.updated_at > lm.updated_at) {
      // Detect reporter conflict: sync is overwriting a recently-claimed local assignment
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
    }

    // Ensure reporter is tracked locally
    const reporterExists = local
      .prepare('SELECT id FROM project_reporters WHERE project_id = ? AND email = ?')
      .get(projectId, sm.reporter_email);
    if (!reporterExists) {
      local
        .prepare(
          'INSERT INTO project_reporters (id, project_id, name, email, is_self) VALUES (?, ?, ?, ?, 0)',
        )
        .run(uuidv4(), projectId, sm.reporter_name, sm.reporter_email);
    }
  }
}

function pullAppendOnly(
  local: Database.Database,
  shared: Database.Database,
  now: number,
): void {
  // Archives — insert new, update wayback fields on existing
  for (const sa of shared.prepare('SELECT * FROM contact_archives').all() as {
    id: string;
    contact_id: string;
    url: string;
    wayback_url: string | null;
    wayback_status: string;
    archived_at: number;
  }[]) {
    const exists = local.prepare('SELECT id FROM contact_archives WHERE id = ?').get(sa.id);
    if (!exists) {
      // Collaborator's archive: empty screenshot_path (file is local to whoever captured it)
      local
        .prepare(
          `INSERT INTO contact_archives
             (id, contact_id, url, screenshot_path, wayback_url, wayback_status, archived_at, synced_at)
           VALUES (?, ?, ?, '', ?, ?, ?, ?)`,
        )
        .run(sa.id, sa.contact_id, sa.url, sa.wayback_url, sa.wayback_status, sa.archived_at, now);
    } else {
      // Propagate wayback updates from shared
      local
        .prepare(
          `UPDATE contact_archives SET wayback_url = ?, wayback_status = ?
           WHERE id = ? AND wayback_status = 'pending'`,
        )
        .run(sa.wayback_url, sa.wayback_status, sa.id);
    }
  }

  // Alert mentions — insert new
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
    local
      .prepare(
        `INSERT OR IGNORE INTO contact_alert_mentions
           (id, contact_id, headline, source_url, published_at, fetched_at, guid, seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sm.id,
        sm.contact_id,
        sm.headline,
        sm.source_url,
        sm.published_at,
        sm.fetched_at,
        sm.guid,
        sm.seen,
      );
  }

  // Interview dates
  for (const sd of shared.prepare('SELECT * FROM interview_dates').all() as {
    id: string;
    membership_id: string;
    interviewed_at: number;
    note: string | null;
    created_at: number;
  }[]) {
    local
      .prepare(
        `INSERT OR IGNORE INTO interview_dates (id, membership_id, interviewed_at, note)
         VALUES (?, ?, ?, ?)`,
      )
      .run(sd.id, sd.membership_id, sd.interviewed_at, sd.note);
  }

  // Interaction log entries
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
          `INSERT INTO contacts (id, name, organization, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, organization = excluded.organization,
             notes = excluded.notes, updated_at = excluded.updated_at`,
        )
        .run(lc.id, lc.name, lc.organization, lc.notes, lc.created_at, lc.updated_at);

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
    .all(contactId) as { id: string; email: string; label: string | null; sort_order: number }[]) {
    shared
      .prepare(
        'INSERT INTO contact_emails (id, contact_id, email, label, sort_order) VALUES (?, ?, ?, ?, ?)',
      )
      .run(e.id, contactId, e.email, e.label, e.sort_order);
  }

  shared.prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(contactId);
  for (const p of local
    .prepare('SELECT * FROM contact_phones WHERE contact_id = ? ORDER BY sort_order')
    .all(contactId) as { id: string; phone: string; sort_order: number }[]) {
    shared
      .prepare(
        'INSERT INTO contact_phones (id, contact_id, phone, sort_order) VALUES (?, ?, ?, ?)',
      )
      .run(p.id, contactId, p.phone, p.sort_order);
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
  }[]) {
    shared
      .prepare(
        'INSERT INTO contact_links (id, contact_id, type, label, url, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(l.id, contactId, l.type, l.label, l.url, l.sort_order);
  }

  shared.prepare('DELETE FROM contact_alert_rss WHERE contact_id = ?').run(contactId);
  const rss = local
    .prepare('SELECT * FROM contact_alert_rss WHERE contact_id = ?')
    .get(contactId) as
    | { id: string; rss_url: string; last_polled_at: number | null; is_invalid: number }
    | undefined;
  if (rss) {
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

    // Archives
    for (const a of local
      .prepare(
        `SELECT * FROM contact_archives WHERE contact_id IN (${cPlaceholders}) AND synced_at IS NULL`,
      )
      .all(...contactIds) as {
      id: string;
      contact_id: string;
      url: string;
      wayback_url: string | null;
      wayback_status: string;
      archived_at: number;
    }[]) {
      shared
        .prepare(
          `INSERT OR IGNORE INTO contact_archives
             (id, contact_id, url, wayback_url, wayback_status, archived_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(a.id, a.contact_id, a.url, a.wayback_url, a.wayback_status, a.archived_at);
      local.prepare('UPDATE contact_archives SET synced_at = ? WHERE id = ?').run(now, a.id);
    }

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

    // Interview dates
    for (const d of local
      .prepare(
        `SELECT * FROM interview_dates WHERE membership_id IN (${mPlaceholders}) AND synced_at IS NULL`,
      )
      .all(...membershipIds) as {
      id: string;
      membership_id: string;
      interviewed_at: number;
      note: string | null;
    }[]) {
      shared
        .prepare(
          'INSERT OR IGNORE INTO interview_dates (id, membership_id, interviewed_at, note) VALUES (?, ?, ?, ?)',
        )
        .run(d.id, d.membership_id, d.interviewed_at, d.note);
      local.prepare('UPDATE interview_dates SET synced_at = ? WHERE id = ?').run(now, d.id);
    }

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
