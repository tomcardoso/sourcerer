export const SHARED_SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = DELETE;

  CREATE TABLE IF NOT EXISTS project_meta (
    id          INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),
    name        TEXT NOT NULL DEFAULT 'Shared Project',
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id           TEXT    PRIMARY KEY,
    name         TEXT    NOT NULL,
    organization TEXT,
    title        TEXT,
    notes        TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contact_emails (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    email      TEXT    NOT NULL,
    label      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS contact_phones (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    phone      TEXT    NOT NULL,
    label      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS contact_links (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    type       TEXT    NOT NULL,
    label      TEXT,
    url        TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS contact_handles (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    type       TEXT    NOT NULL,
    handle     TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS contact_alert_rss (
    id             TEXT    PRIMARY KEY,
    contact_id     TEXT    NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
    rss_url        TEXT    NOT NULL,
    last_polled_at INTEGER,
    is_invalid     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS contact_alert_mentions (
    id           TEXT    PRIMARY KEY,
    contact_id   TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    headline     TEXT    NOT NULL,
    source_url   TEXT    NOT NULL,
    published_at INTEGER,
    fetched_at   INTEGER NOT NULL,
    guid         TEXT    NOT NULL,
    seen         INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS project_memberships (
    id                TEXT    PRIMARY KEY,
    contact_id        TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    reporter_email    TEXT    NOT NULL,
    reporter_name     TEXT    NOT NULL,
    theme             TEXT,
    priority          TEXT,
    status            TEXT,
    first_outreach_at INTEGER,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    UNIQUE(contact_id)
  );

  CREATE TABLE IF NOT EXISTS interaction_log_entries (
    id             TEXT    PRIMARY KEY,
    membership_id  TEXT    NOT NULL REFERENCES project_memberships(id) ON DELETE CASCADE,
    reporter_email TEXT    NOT NULL,
    reporter_name  TEXT    NOT NULL,
    body           TEXT    NOT NULL,
    created_at     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_shared_contact_emails_contact_id     ON contact_emails(contact_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_contact_emails_contact_email ON contact_emails(contact_id, email);
  CREATE INDEX IF NOT EXISTS idx_shared_contact_phones_contact_id     ON contact_phones(contact_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_contact_phones_contact_phone ON contact_phones(contact_id, phone);
  CREATE INDEX IF NOT EXISTS idx_shared_contact_links_contact_id      ON contact_links(contact_id);
  CREATE INDEX IF NOT EXISTS idx_shared_contact_handles_contact_id             ON contact_handles(contact_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_contact_handles_contact_type_handle ON contact_handles(contact_id, type, handle);
  CREATE INDEX IF NOT EXISTS idx_shared_alert_mentions_contact_id     ON contact_alert_mentions(contact_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_alert_mentions_contact_guid ON contact_alert_mentions(contact_id, guid);
  CREATE INDEX IF NOT EXISTS idx_shared_interaction_log_membership_created ON interaction_log_entries(membership_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_shared_project_memberships_contact_id ON project_memberships(contact_id);

  CREATE TABLE IF NOT EXISTS shared_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;
