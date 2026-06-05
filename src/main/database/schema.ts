export const LOCAL_SCHEMA_PRAGMAS_SQL = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = DELETE;
`;

export const LOCAL_SCHEMA_DDL_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id                         INTEGER PRIMARY KEY,
    first_name                 TEXT    NOT NULL,
    last_name                  TEXT    NOT NULL,
    email                      TEXT    NOT NULL,
    created_at                 INTEGER NOT NULL,
    calendar_token             TEXT    NOT NULL,
    idle_timeout_seconds       INTEGER NOT NULL DEFAULT 900,
    phone_country              TEXT    NOT NULL DEFAULT 'CA',
    outreach_reminders_enabled    INTEGER NOT NULL DEFAULT 1,
    outreach_require_interaction  INTEGER NOT NULL DEFAULT 1,
    staleness_enabled             INTEGER NOT NULL DEFAULT 1,
    staleness_threshold_days      INTEGER NOT NULL DEFAULT 90,
    alert_notifications_enabled   INTEGER NOT NULL DEFAULT 1,
    reminder_notifications_enabled INTEGER NOT NULL DEFAULT 1,
    rss_poll_interval_hours        INTEGER NOT NULL DEFAULT 6,
    wayback_enabled                INTEGER NOT NULL DEFAULT 1,
    archive_access_key             TEXT,
    archive_secret_key             TEXT,
    last_rss_fetched_at            INTEGER,
    auto_backup_enabled            INTEGER NOT NULL DEFAULT 0,
    auto_backup_dest_path          TEXT,
    auto_backup_max_count          INTEGER NOT NULL DEFAULT 10,
    dev_seeded                     INTEGER NOT NULL DEFAULT 0,
    theme                          TEXT    NOT NULL DEFAULT 'light'
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id           TEXT    PRIMARY KEY,
    name         TEXT    NOT NULL,
    organization TEXT,
    title        TEXT,
    dob          TEXT,
    notes        TEXT,
    default_membership_id TEXT REFERENCES project_memberships(id) ON DELETE SET NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    synced_at    INTEGER
  );

  CREATE TABLE IF NOT EXISTS dedup_dismissed_pairs (
    contact_a_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    contact_b_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    dismissed_at INTEGER NOT NULL,
    PRIMARY KEY (contact_a_id, contact_b_id),
    CHECK(contact_a_id < contact_b_id)
  );

  CREATE TABLE IF NOT EXISTS contact_emails (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    email      TEXT    NOT NULL,
    label      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0,
    synced_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS contact_phones (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    phone      TEXT    NOT NULL,
    label      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0,
    synced_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS contact_links (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    type       TEXT    NOT NULL,
    label      TEXT,
    url        TEXT    NOT NULL,
    wayback_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0,
    synced_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS contact_handles (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    type       TEXT    NOT NULL,
    handle     TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0,
    synced_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS contact_alert_rss (
    id             TEXT    PRIMARY KEY,
    contact_id     TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    rss_url        TEXT    NOT NULL,
    last_polled_at INTEGER,
    is_invalid     INTEGER NOT NULL DEFAULT 0,
    synced_at      INTEGER
  );

  CREATE TABLE IF NOT EXISTS contact_alert_mentions (
    id          TEXT    PRIMARY KEY,
    contact_id  TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    headline    TEXT    NOT NULL,
    source_url  TEXT    NOT NULL,
    published_at INTEGER,
    fetched_at  INTEGER NOT NULL,
    guid        TEXT    NOT NULL,
    seen        INTEGER NOT NULL DEFAULT 0,
    dismissed   INTEGER NOT NULL DEFAULT 0,
    synced_at   INTEGER
  );

  CREATE TABLE IF NOT EXISTS projects (
    id                   TEXT    PRIMARY KEY,
    name                 TEXT    NOT NULL,
    description          TEXT,
    is_shared            INTEGER NOT NULL DEFAULT 0,
    is_archived          INTEGER NOT NULL DEFAULT 0,
    shared_db_path       TEXT,
    shared_db_key        BLOB,
    shared_pending_writes INTEGER NOT NULL DEFAULT 0,
    last_synced_at       INTEGER,
    created_at           INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_reporters (
    id         TEXT    PRIMARY KEY,
    project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    email      TEXT    NOT NULL,
    is_self    INTEGER NOT NULL DEFAULT 0,
    UNIQUE(project_id, email)
  );

  CREATE TABLE IF NOT EXISTS project_memberships (
    id                          TEXT    PRIMARY KEY,
    contact_id                  TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    project_id                  TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    reporter_email              TEXT    NOT NULL,
    reporter_name               TEXT    NOT NULL,
    theme                       TEXT,
    priority                    TEXT,
    status                      TEXT,
    first_outreach_at           INTEGER,
    outreach_interval_days      INTEGER,
    outreach_reminders_enabled  INTEGER NOT NULL DEFAULT 1,
    reporter_assigned_at        INTEGER,
    reporter_conflict           INTEGER NOT NULL DEFAULT 0,
    created_at                  INTEGER NOT NULL,
    updated_at                  INTEGER NOT NULL,
    synced_at                   INTEGER,
    UNIQUE(contact_id, project_id)
  );

  CREATE TABLE IF NOT EXISTS membership_reporters (
    id             TEXT PRIMARY KEY,
    membership_id  TEXT NOT NULL REFERENCES project_memberships(id) ON DELETE CASCADE,
    reporter_email TEXT NOT NULL,
    reporter_name  TEXT NOT NULL,
    UNIQUE(membership_id, reporter_email)
  );

  CREATE TABLE IF NOT EXISTS interaction_log_entries (
    id             TEXT    PRIMARY KEY,
    contact_id     TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    reporter_email TEXT    NOT NULL,
    reporter_name  TEXT    NOT NULL,
    body           TEXT    NOT NULL,
    created_at     INTEGER NOT NULL,
    synced_at      INTEGER
  );

  CREATE TABLE IF NOT EXISTS interaction_projects (
    interaction_id TEXT NOT NULL REFERENCES interaction_log_entries(id) ON DELETE CASCADE,
    membership_id  TEXT NOT NULL REFERENCES project_memberships(id) ON DELETE CASCADE,
    PRIMARY KEY (interaction_id, membership_id)
  );

  CREATE TABLE IF NOT EXISTS message_scratchpad_drafts (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label      TEXT    NOT NULL,
    body       TEXT    NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS status_options (
    id         TEXT    PRIMARY KEY,
    label      TEXT    NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS priority_options (
    id                     TEXT    PRIMARY KEY,
    label                  TEXT    NOT NULL UNIQUE,
    sort_order             INTEGER NOT NULL DEFAULT 0,
    is_default             INTEGER NOT NULL DEFAULT 0,
    outreach_interval_days INTEGER
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id               TEXT    PRIMARY KEY,
    contact_id       TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    project_id       TEXT    REFERENCES projects(id) ON DELETE SET NULL,
    membership_id    TEXT    REFERENCES project_memberships(id) ON DELETE CASCADE,
    due_date         INTEGER NOT NULL,
    note             TEXT,
    is_auto_outreach INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL,
    completed_at     INTEGER,
    last_notified_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS contact_screenshots (
    id          TEXT    PRIMARY KEY,
    contact_id  TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    tab_url     TEXT,
    file_path   TEXT    NOT NULL,
    iv          TEXT    NOT NULL,
    captured_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contact_tags (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    tag        TEXT    NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    UNIQUE(contact_id, tag)
  );

  CREATE TABLE IF NOT EXISTS sync_tombstones (
    id         TEXT    PRIMARY KEY,
    table_name TEXT    NOT NULL,
    row_id     TEXT    NOT NULL,
    deleted_at INTEGER NOT NULL,
    UNIQUE(table_name, row_id)
  );

  CREATE INDEX IF NOT EXISTS idx_contact_tags_contact_id ON contact_tags(contact_id);
  CREATE INDEX IF NOT EXISTS idx_sync_tombstones_table_row ON sync_tombstones(table_name, row_id);
  CREATE INDEX IF NOT EXISTS idx_contact_emails_contact_id        ON contact_emails(contact_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_emails_contact_email  ON contact_emails(contact_id, email);
  CREATE INDEX IF NOT EXISTS idx_contact_phones_contact_id        ON contact_phones(contact_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_phones_contact_phone  ON contact_phones(contact_id, phone);
  CREATE INDEX IF NOT EXISTS idx_contact_links_contact_id         ON contact_links(contact_id);
  CREATE INDEX IF NOT EXISTS idx_contact_handles_contact_id           ON contact_handles(contact_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_handles_contact_type_handle ON contact_handles(contact_id, type, handle);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_links_contact_url      ON contact_links(contact_id, url);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_alert_rss_contact_url ON contact_alert_rss(contact_id, rss_url);
  CREATE INDEX IF NOT EXISTS idx_contact_screenshots_contact_id   ON contact_screenshots(contact_id);
  CREATE INDEX IF NOT EXISTS idx_interaction_log_contact_created ON interaction_log_entries(contact_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_interaction_projects_membership ON interaction_projects(membership_id);
  CREATE INDEX IF NOT EXISTS idx_project_memberships_contact_id   ON project_memberships(contact_id);
  CREATE INDEX IF NOT EXISTS idx_project_memberships_project_id      ON project_memberships(project_id);
  CREATE INDEX IF NOT EXISTS idx_project_memberships_reporter_email ON project_memberships(reporter_email);
  CREATE INDEX IF NOT EXISTS idx_reminders_membership_id            ON reminders(membership_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_membership_outreach ON reminders(membership_id) WHERE is_auto_outreach = 1;
  CREATE INDEX IF NOT EXISTS idx_reminders_contact_id             ON reminders(contact_id);
  CREATE INDEX IF NOT EXISTS idx_reminders_due_incomplete         ON reminders(due_date) WHERE completed_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_alert_mentions_contact_id        ON contact_alert_mentions(contact_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_mentions_contact_guid   ON contact_alert_mentions(contact_id, guid);
  CREATE INDEX IF NOT EXISTS idx_alert_mentions_active            ON contact_alert_mentions(seen) WHERE dismissed = 0;

  CREATE VIRTUAL TABLE IF NOT EXISTS interaction_log_fts
    USING fts5(body, content='interaction_log_entries', content_rowid='rowid');

  CREATE TRIGGER IF NOT EXISTS interaction_log_fts_ai
    AFTER INSERT ON interaction_log_entries BEGIN
      INSERT INTO interaction_log_fts(rowid, body) VALUES (new.rowid, new.body);
    END;

  CREATE TRIGGER IF NOT EXISTS interaction_log_fts_ad
    AFTER DELETE ON interaction_log_entries BEGIN
      INSERT INTO interaction_log_fts(interaction_log_fts, rowid, body)
        VALUES ('delete', old.rowid, old.body);
    END;

  CREATE TRIGGER IF NOT EXISTS interaction_log_fts_au
    AFTER UPDATE ON interaction_log_entries BEGIN
      INSERT INTO interaction_log_fts(interaction_log_fts, rowid, body)
        VALUES ('delete', old.rowid, old.body);
      INSERT INTO interaction_log_fts(rowid, body) VALUES (new.rowid, new.body);
    END;

  CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts
    USING fts5(name, organization, title, notes, content='contacts', content_rowid='rowid');

  CREATE TRIGGER IF NOT EXISTS contacts_fts_ai
    AFTER INSERT ON contacts BEGIN
      INSERT INTO contacts_fts(rowid, name, organization, title, notes)
      VALUES (new.rowid, new.name, new.organization, new.title, new.notes);
    END;

  CREATE TRIGGER IF NOT EXISTS contacts_fts_ad
    AFTER DELETE ON contacts BEGIN
      INSERT INTO contacts_fts(contacts_fts, rowid, name, organization, title, notes)
        VALUES ('delete', old.rowid, old.name, old.organization, old.title, old.notes);
    END;

  CREATE TRIGGER IF NOT EXISTS contacts_fts_au
    AFTER UPDATE ON contacts BEGIN
      INSERT INTO contacts_fts(contacts_fts, rowid, name, organization, title, notes)
        VALUES ('delete', old.rowid, old.name, old.organization, old.title, old.notes);
      INSERT INTO contacts_fts(rowid, name, organization, title, notes)
      VALUES (new.rowid, new.name, new.organization, new.title, new.notes);
    END;
`;

export const LOCAL_SCHEMA_SQL = LOCAL_SCHEMA_PRAGMAS_SQL + LOCAL_SCHEMA_DDL_SQL;
