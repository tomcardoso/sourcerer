# Sourceror
## Technical Architecture Document
_Version 1.1 · Draft for review_

---

## 1. Overview

This document specifies the technical implementation of Sourceror. It covers the five core engineering areas: encryption and key derivation, database schema, sync and conflict resolution, the browser extension API, and RSS polling. It is intended to be read alongside the PRD and is the primary reference for implementation decisions.

---

## 2. Encryption & Key Derivation

### 2.1 Local Database

Sourceror's local database is a SQLite file encrypted with **SQLCipher**. The encryption key is never stored on disk — it is derived fresh from the user's master password each time the app unlocks.

**Key derivation:**

- Algorithm: **Argon2id**
- Parameters (minimum): `m=65536` (64 MB memory), `t=3` (iterations), `p=1` (parallelism)
- Salt: 16 bytes of cryptographically random data, generated at first launch and stored in a small plaintext bootstrap file alongside the database (e.g., `sourceror.salt`). The salt is not secret, but must be preserved — losing it means the database cannot be unlocked even with the correct password.
- Output: 32-byte key, passed directly to SQLCipher as the database encryption key via `PRAGMA key`.

**First launch flow:**

1. User sets master password.
2. App generates random salt, writes it to `sourceror.salt`.
3. App derives key using Argon2id(password, salt).
4. App creates and opens the SQLite database with this key via `PRAGMA key = '...'`.
5. App writes user profile (name, email) to the database.

**Subsequent unlock flow:**

1. User enters master password.
2. App reads salt from `sourceror.salt`.
3. App derives key using Argon2id(password, salt).
4. App attempts to open the database with the derived key.
5. If SQLCipher accepts the key, the app proceeds. If not, the password was wrong — show an error.

**Auto-lock:** The app tracks the timestamp of the last user interaction. A background timer checks every 60 seconds. If `now - last_interaction > idle_threshold`, the app closes the database connection and shows the lock screen. The idle threshold is user-configurable (default: 15 minutes).

### 2.2 Shared Project File

Each shared project is backed by a separate SQLite/SQLCipher file with its own independent encryption key.

- The shared project key is a 32-byte random value generated at project creation time. It is **not** derived from any user's master password.
- The key is never stored in the local database or on disk in plaintext.
- At project creation, the key is encoded into a setup payload (see Section 5.2) and shared out-of-band. Each collaborator's app stores the key in their local database, itself encrypted by their master password. This means the shared project key is protected at rest by each user's own encryption.
- The shared `.db` file itself is encrypted with this key via SQLCipher.

### 2.3 What Is Never Stored in Plaintext

- Master password
- Derived database key
- Shared project key (except as encrypted by the user's master password in their local db)

---

## 3. Database Schema

### 3.1 Local Database Tables

The local database contains all global data and local-only data. It is never shared.

---

#### `users` (single row)
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Always 1 — single-user table. |
| `first_name` | TEXT NOT NULL | |
| `last_name` | TEXT NOT NULL | |
| `email` | TEXT NOT NULL | |
| `created_at` | INTEGER NOT NULL | Unix timestamp. |
| `calendar_token` | TEXT NOT NULL | Persistent UUID token used to authenticate the iCalendar subscription URL. Generated once at first launch. |

---

#### `contacts`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `name` | TEXT NOT NULL | |
| `organization` | TEXT | |
| `notes` | TEXT | |
| `created_at` | INTEGER NOT NULL | Unix timestamp. |
| `updated_at` | INTEGER NOT NULL | Unix timestamp. |

---

#### `contact_emails`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `contact_id` | TEXT NOT NULL | FK → `contacts.id`. |
| `email` | TEXT NOT NULL | |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | |

---

#### `contact_phones`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `contact_id` | TEXT NOT NULL | FK → `contacts.id`. |
| `phone` | TEXT NOT NULL | |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | |

---

#### `contact_links`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `contact_id` | TEXT NOT NULL | FK → `contacts.id`. |
| `type` | TEXT NOT NULL | One of: `linkedin`, `facebook`, `instagram`, `x`, `lawsuit`, `other`. |
| `label` | TEXT | Human-readable label (e.g., docket number, site name). |
| `url` | TEXT NOT NULL | |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | |

---

#### `contact_archives`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `contact_id` | TEXT NOT NULL | FK → `contacts.id`. |
| `url` | TEXT NOT NULL | Original URL that was archived. |
| `screenshot_path` | TEXT NOT NULL | Path to the PNG screenshot file on disk, relative to the app data directory. |
| `wayback_url` | TEXT | URL of the Wayback Machine snapshot, if the save succeeded. Null if failed or pending. |
| `wayback_status` | TEXT NOT NULL DEFAULT 'pending' | One of: `pending`, `success`, `failed`. |
| `archived_at` | INTEGER NOT NULL | Unix timestamp. |

---

#### `contact_alert_rss`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `contact_id` | TEXT NOT NULL UNIQUE | FK → `contacts.id`. One RSS URL per contact. |
| `rss_url` | TEXT NOT NULL | |
| `last_polled_at` | INTEGER | Unix timestamp of last successful poll. |
| `is_invalid` | INTEGER NOT NULL DEFAULT 0 | Set to 1 if the feed returns a non-RSS response, flagging it in the UI. |

---

#### `contact_alert_mentions`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `contact_id` | TEXT NOT NULL | FK → `contacts.id`. |
| `headline` | TEXT NOT NULL | |
| `source_url` | TEXT NOT NULL | |
| `published_at` | INTEGER | Unix timestamp, parsed from RSS item. |
| `fetched_at` | INTEGER NOT NULL | Unix timestamp when the app stored this item. |
| `guid` | TEXT NOT NULL | The RSS item's `<guid>` or `<link>`, used for deduplication. |
| `seen` | INTEGER NOT NULL DEFAULT 0 | 0 = unseen, 1 = seen. Updated when user views the Alert Feed. |

---

#### `projects`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `name` | TEXT NOT NULL | |
| `description` | TEXT | |
| `is_shared` | INTEGER NOT NULL DEFAULT 0 | 0 = local only, 1 = shared. |
| `shared_db_path` | TEXT | Absolute local path to the shared `.db` file, set per-collaborator when they join. |
| `shared_db_key` | BLOB | The 32-byte shared project key, stored encrypted (protected by the user's master password via SQLCipher). |
| `shared_pending_writes` | INTEGER NOT NULL DEFAULT 0 | 1 if there are local edits not yet flushed to the shared file. |
| `created_at` | INTEGER NOT NULL | Unix timestamp. |

---

#### `project_reporters`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `project_id` | TEXT NOT NULL | FK → `projects.id`. |
| `name` | TEXT NOT NULL | Display name of the collaborator. |
| `email` | TEXT NOT NULL | Used as the stable identifier for this collaborator. |
| `is_self` | INTEGER NOT NULL DEFAULT 0 | 1 if this row represents the local user. |

---

#### `message_scratchpad_drafts`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `contact_id` | TEXT NOT NULL | FK → `contacts.id`. |
| `project_id` | TEXT NOT NULL | FK → `projects.id`. |
| `label` | TEXT NOT NULL | Reporter-assigned name for this draft. |
| `body` | TEXT NOT NULL DEFAULT '' | Draft content. |
| `created_at` | INTEGER NOT NULL | Unix timestamp. |
| `updated_at` | INTEGER NOT NULL | Unix timestamp. |

> **Note:** Scratchpad drafts live only in the local database. They are never written to the shared project file. This is enforced at the application layer — the sync logic must explicitly exclude this table.

---

#### `status_options`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `label` | TEXT NOT NULL UNIQUE | Display value (e.g., "Declined"). |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | Controls drop-down order. |
| `is_default` | INTEGER NOT NULL DEFAULT 0 | 1 for the 10 pre-loaded defaults. |

---

#### `priority_options`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `label` | TEXT NOT NULL UNIQUE | Display value (e.g., "Critical"). |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | |
| `is_default` | INTEGER NOT NULL DEFAULT 0 | 1 for the 5 pre-loaded defaults. |

---

#### `reminders`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `contact_id` | TEXT NOT NULL | FK → `contacts.id`. |
| `project_id` | TEXT NOT NULL | FK → `projects.id`. |
| `due_date` | INTEGER NOT NULL | Unix timestamp. |
| `note` | TEXT | Optional note included in the calendar feed. |
| `created_at` | INTEGER NOT NULL | Unix timestamp. |

---

### 3.2 Shared Project Database Tables

The shared project `.db` file contains a subset of data — everything needed for collaboration, excluding anything local or private. All tables include an `updated_at` timestamp used for last-write-wins conflict resolution.

All shared tables also include a `synced_at` column in the **local database only** (not written to the shared file). This records when a row was last successfully flushed. Rows where `updated_at > synced_at` are considered pending writes. The `synced_at` column must be added to each shared table's local mirror.

---

#### `contacts` _(shared copy)_

Identical schema to the local `contacts` table, with the addition of `updated_at` on every field for last-write-wins resolution. When a contact is added to a shared project, a full copy of their contact record is written here. Updates propagate bidirectionally — local edits sync out, collaborator edits sync in.

Same applies to: `contact_emails`, `contact_phones`, `contact_links`, `contact_alert_rss`, `contact_alert_mentions`.

`contact_archives` is a **partial sync exception**: the archive record (URL, timestamp, `wayback_url`, `wayback_status`) is synced so all collaborators can see and open Wayback Machine links. The `screenshot_path` field is excluded from sync — it points to a local file that does not exist on collaborators' machines. When a collaborator views an archive record that has no local screenshot, the UI shows: "Screenshot captured by [reporter name] — not available on this machine" with the Wayback URL shown if present.

---

#### `project_memberships`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `contact_id` | TEXT NOT NULL | FK → `contacts.id` (in this shared db). |
| `reporter_email` | TEXT NOT NULL | Email of the assigned reporter. |
| `reporter_name` | TEXT NOT NULL | Display name at time of assignment. |
| `theme` | TEXT | |
| `priority` | TEXT | Label string (not a FK — labels may differ between users' local dbs). |
| `status` | TEXT | Label string (same reasoning). |
| `first_outreach_at` | INTEGER | Unix timestamp. |
| `created_at` | INTEGER NOT NULL | Unix timestamp. |
| `updated_at` | INTEGER NOT NULL | Unix timestamp. Used for last-write-wins. |

---

#### `interview_dates`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `membership_id` | TEXT NOT NULL | FK → `project_memberships.id`. |
| `interviewed_at` | INTEGER NOT NULL | Unix timestamp. |
| `note` | TEXT | e.g., "off record", "on record". |

---

#### `interaction_log_entries`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4. |
| `membership_id` | TEXT NOT NULL | FK → `project_memberships.id`. |
| `reporter_email` | TEXT NOT NULL | Attribution. |
| `reporter_name` | TEXT NOT NULL | Display name at time of writing. |
| `body` | TEXT NOT NULL | Free text. |
| `created_at` | INTEGER NOT NULL | Unix timestamp. Immutable after insert — append-only enforced at app layer. |

---

## 4. Sync & Conflict Resolution

### 4.1 Approach: Last-Write-Wins

All shared tables include an `updated_at` Unix timestamp column. When syncing, the app compares `updated_at` values between the local copy and the shared file — the newer value wins at the field level. This is simple, well-understood, and sufficient for a small-team tool where true simultaneous edits to the same field are rare.

The interaction log is append-only (each entry is its own immutable row), so last-write-wins does not apply there — new entries are simply inserted and never overwritten.

### 4.2 Change Tracking

Each shared table also includes a `synced_at` column (local only, not written to the shared file) recording when that row was last successfully flushed. Rows where `updated_at > synced_at` are considered pending writes.

### 4.3 Polling Loop

The app runs a background polling loop while open and unlocked:

- Default interval: every 2 minutes. User-configurable in Settings.
- On each tick:
  1. Attempt to open the shared file.
  2. If reachable: read all rows in the shared file where `updated_at > synced_at` (using the local `synced_at` column), apply last-write-wins merge to local data, then flush any pending local writes to the shared file. Update `synced_at` on all flushed rows.
  3. If unreachable: set `shared_pending_writes = 1` on the project, show a warning indicator in the UI. Local edits are held in the local database and will be flushed on the next successful poll.
- Writes to the shared file triggered by user actions also attempt an immediate sync outside the poll cycle.

### 4.4 Shared File Unavailability

When the shared file cannot be reached (e.g., OneDrive not synced, network unavailable):

- A warning indicator is shown in the UI (e.g., an amber sync icon in the project header).
- The user can continue working normally. All edits are written to the local database immediately.
- Pending local edits are flushed to the shared file on the next successful poll cycle.
- No data is lost. Nothing is blocked.

### 4.5 Shared File Recovery

If the shared file is missing or unreadable, the app displays a recovery banner in the project view with two options:

**Relocate:** Opens a file picker. The user selects the file at its new location. The app updates `shared_db_path` in the local database and resumes normal sync.

**Regenerate:** Creates a new encrypted SQLite/SQLCipher file at a user-specified location using a freshly generated 32-byte key. The app exports all local project data (contacts, memberships, interaction logs, interview dates) into the new file, then generates a new setup link/QR code containing the new file path and key.

Implementation notes:
- The regeneration export should follow the same schema as a normal shared file, so collaborators re-joining via the new link experience no difference.
- A confirmation dialog is shown before regeneration: _"This will recreate the shared file from your local data. Any changes made by collaborators that were not yet synced before the file was lost may not be included."_
- After regeneration, the old `shared_db_key` in the local database is replaced with the new key.
- The app should clearly indicate to the user that the new setup link must be distributed to all collaborators — their instances are still pointing to the old missing file and will show the same recovery banner until they re-join.

### 4.6 Scratchpad Exclusion

The `message_scratchpad_drafts` table exists only in the local database. The sync logic must never read from or write to it in the context of a shared project file. This must be enforced at the repository/data-access layer with an explicit guard.

### 4.7 Contact Bidirectional Sync

When a contact exists in both the local database and a shared project file, changes propagate in both directions:

- Local edits → written to the shared file on next sync.
- Remote edits from collaborators → pulled into the local database on poll.

Last-write-wins at the field level. The local database is the authoritative store for the current user's contacts; it accepts incoming updates from collaborators via the shared file.

---

## 5. Browser Extension API

### 5.1 Overview

The desktop app exposes a local HTTP server on `localhost` (default port: `27371`) while running. The browser extension communicates exclusively with this server. No external network access is involved.

The server must only bind to `127.0.0.1` (loopback), never `0.0.0.0`.

### 5.2 Authentication — Explicit In-App Approval

To prevent any webpage from making requests to the local server, all extension requests require a session token obtained through an explicit user-approval flow:

1. On first connection attempt, the extension calls `POST /request-access`.
2. The app displays a modal: **"The Sourceror browser extension is requesting access. Approve?"** The user must click Approve in the app.
3. On approval, the app generates a random 32-byte session token, stores it in memory, and returns it to the extension.
4. The extension stores the token in browser extension storage (isolated from webpage access).
5. All subsequent requests include the token in an `X-Sourceror-Token` header. Requests without a valid token receive `401`.
6. The token is regenerated each time the app launches. The extension re-requests approval if its stored token is rejected.

This flow ensures that no webpage JavaScript can obtain a valid token — only the extension can initiate the approval request, and the user must explicitly confirm it in the app UI.

### 5.3 Lock State

The local server runs while the app is open, but requests are only processed if the app is unlocked:

- All endpoints except `/status` return `403 Locked` when the app is locked.
- The extension displays: "Sourceror is locked — unlock the app and try again."

### 5.4 API Endpoints

---

**`GET /status`**

Returns the current app state. No token required.

```json
{
  "running": true,
  "locked": false,
  "version": "1.0.0"
}
```

---

**`POST /request-access`**

Initiates the in-app approval flow. No token required. Returns `202 Accepted` immediately; the token is returned only after the user approves in the app (the extension should poll `GET /access-status` to check).

---

**`GET /access-status`**

Returns whether a pending access request has been approved and, if so, the session token.

```json
{
  "status": "approved",
  "token": "base64-encoded-32-byte-token"
}
```

Possible statuses: `pending`, `approved`, `denied`.

---

**`GET /contacts`**

Returns all contacts across all projects for display in the extension popup.

```json
{
  "contacts": [
    {
      "id": "uuid",
      "name": "Jane Smith",
      "organization": "Acme Corp",
      "projects": [
        { "id": "uuid", "name": "Project Alpha" }
      ]
    }
  ]
}
```

---

**`POST /archive`**

Submits a page screenshot to be associated with a contact. Also triggers a background Wayback Machine save attempt.

Request body:
```json
{
  "contact_id": "uuid",
  "url": "https://linkedin.com/in/janesmith",
  "screenshot_base64": "data:image/png;base64,..."
}
```

The app saves the PNG to disk under `archives/{contact_id}/` and writes a record to `contact_archives` with `wayback_status = 'pending'`. A background task then attempts `GET https://web.archive.org/save/{url}` and updates `wayback_status` and `wayback_url` on completion.

```json
{
  "success": true,
  "archive_id": "uuid"
}
```

---

**`GET /calendar/reminders.ics?token={calendar_token}`**

Returns a dynamically generated iCalendar feed of all reminders across all projects. Used for calendar subscription (see Section 6). Returns `text/calendar` content.

Authentication uses a persistent calendar token (distinct from the session token) that is generated once at first launch and stored in the local database. Unlike the session token, it does not regenerate on app restart — this is required so that calendar subscriptions remain valid across sessions. The full subscription URL including the token is shown in the Reminders view for the user to copy into their calendar app.

---

### 5.5 Extension Behaviour

- On popup open, the extension calls `GET /status` to check app state.
- If not yet approved, it calls `POST /request-access` and shows "Waiting for approval in Sourceror…", polling `GET /access-status`.
- If running and unlocked, calls `GET /contacts` and renders a searchable, project-filterable list.
- On clicking Archive, captures a screenshot of the current tab and calls `POST /archive`.
- The extension popup includes a note: "For full-page HTML archiving, use the [Internet Archive extension](https://chrome.google.com/webstore/detail/wayback-machine/)."
- If the app is not running or locked, the popup shows an appropriate message.

---

## 6. Calendar Subscription Feed

### 6.1 Approach

Rather than exporting individual .ics files, Sourceror serves a live iCalendar feed from its localhost server. The reporter subscribes to this URL once in their calendar app; from then on the calendar polls it automatically and stays current as reminders are added or changed.

**Subscription URL:** `http://127.0.0.1:27371/calendar/reminders.ics?token={calendar_token}`

The calendar token is generated once at first launch and stored in the local database. The full URL (with token) is shown in the Reminders view for the user to copy. The token can be regenerated from Settings if needed (e.g., if the user suspects it has been compromised), which invalidates the old subscription URL and requires re-subscribing.

This works with Apple Calendar (Mac), Outlook (Windows), and Google Calendar (via "Other calendars → From URL"). It is calendar-app-agnostic.

**Caveat:** The feed is only available while Sourceror is running. If the app is closed, the calendar cannot reach the feed and will not pick up new reminders until the app is open again. Existing reminders already in the calendar are not affected.

### 6.2 Feed Generation

The `/calendar/reminders.ics` endpoint dynamically generates a valid iCalendar file from all rows in the `reminders` table. Each reminder becomes a `VEVENT` with:

- `SUMMARY`: Contact name + project name (e.g., "Follow up: Jane Smith — Project Alpha")
- `DTSTART` / `DTEND`: The reminder's `due_date` (full-day event)
- `DESCRIPTION`: The optional note field
- `UID`: The reminder's `id` (UUID), ensuring calendar apps can update existing events rather than duplicating them

### 6.3 Setup Instructions

The app should display setup instructions the first time a user navigates to the Reminders view:

- **Mac (Apple Calendar):** File → New Calendar Subscription → paste the URL.
- **Windows (Outlook):** Add Calendar → From Internet → paste the URL.
- **Google Calendar:** Settings → Other calendars → From URL → paste the URL.

---

## 7. RSS Polling

### 7.1 Polling Mechanism

The app polls Google Alert RSS feeds on a background timer while open and unlocked.

- Default interval: every 6 hours. Minimum: every 1 hour. User-configurable in Settings.
- On each poll cycle, the app iterates all rows in `contact_alert_rss` where `is_invalid = 0` and fetches each URL.
- Each RSS item is identified by its `<guid>` element (or `<link>` if no guid is present). If the guid is not already present in `contact_alert_mentions`, it is inserted as a new mention with `seen = 0`.
- `last_polled_at` is updated on each successful fetch.

### 7.2 Feed Parsing

RSS feeds from Google Alerts follow a standard Atom/RSS2 structure. The app parses:

- `<title>` or `<summary>` → stored as `headline`
- `<link>` → stored as `source_url`
- `<published>` or `<pubDate>` → parsed to Unix timestamp, stored as `published_at`
- `<id>` or `<guid>` → used as the deduplication key, stored as `guid`

### 7.3 Error Handling

- If a feed fetch fails (network error, non-200 response), the error is logged silently and the next feed is processed.
- If a feed returns a non-RSS response (e.g., a login page), `is_invalid` is set to 1 on that row, flagging it in the UI so the reporter can update the URL.
- Polling does not run if the app is locked.

### 7.4 Archive Storage

No hard cap on archive storage. When total archive size exceeds 1 GB, the app shows a persistent (but dismissible) warning in the Settings view suggesting the user review and delete old archives. Archive size is calculated on app launch and cached — not recalculated on every action.

---

## 8. Resolved Decisions

For reference, the following questions were explicitly resolved during specification:

| Question | Decision |
|---|---|
| Sync approach | Last-write-wins with `updated_at` timestamps. CR-SQLite dropped. |
| Calendar integration | Live localhost iCalendar subscription feed. One-time setup. |
| RSS polling when app closed | v2 feature. Not in scope for v1. |
| Session token security | Explicit in-app approval flow. Rate-limited handshake dropped. |
| Archive storage cap | No hard cap. Soft warning at 1 GB. |
| Archiving model | Screenshot (PNG) + automatic Wayback Machine save attempt. HTML archiving dropped. |
| Shared file unavailability | Warning indicator + local edits held and flushed on next successful sync. |
| Desktop framework | Electron chosen over Tauri. |
| Extension store distribution | Sideloaded. Chrome-only extension (Firefox dropped). Desktop app distributed unsigned — one-time OS warning on first launch (Gatekeeper on Mac, SmartScreen on Windows). |
