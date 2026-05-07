export const SHARED_SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS project_meta (
    name        TEXT NOT NULL DEFAULT 'Shared Project',
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id           TEXT    PRIMARY KEY,
    name         TEXT    NOT NULL,
    organization TEXT,
    notes        TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contact_emails (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    email      TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS contact_phones (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    phone      TEXT    NOT NULL,
    label      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS contact_links (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    type       TEXT    NOT NULL,
    label      TEXT,
    url        TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS contact_archives (
    id             TEXT    PRIMARY KEY,
    contact_id     TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    url            TEXT    NOT NULL,
    wayback_url    TEXT,
    wayback_status TEXT    NOT NULL DEFAULT 'pending',
    archived_at    INTEGER NOT NULL
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
    updated_at        INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS interview_dates (
    id             TEXT    PRIMARY KEY,
    membership_id  TEXT    NOT NULL REFERENCES project_memberships(id) ON DELETE CASCADE,
    interviewed_at INTEGER NOT NULL,
    note           TEXT,
    created_at     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS interaction_log_entries (
    id             TEXT    PRIMARY KEY,
    membership_id  TEXT    NOT NULL REFERENCES project_memberships(id) ON DELETE CASCADE,
    reporter_email TEXT    NOT NULL,
    reporter_name  TEXT    NOT NULL,
    body           TEXT    NOT NULL,
    created_at     INTEGER NOT NULL
  );
`;
