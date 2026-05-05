# Sourcerer
## Product Requirements Document
_Version 1.0 · Draft for review_

---

## 1. Purpose & Background

Sourcerer is a desktop application for investigative journalists to manage sources and contacts across reporting projects. It replaces ad-hoc spreadsheets with a structured, encrypted, and collaboration-capable tool that runs locally on Windows and Mac.

The primary user is a reporter at a major newspaper managing dozens to hundreds of sources per investigation — tracking contact details, outreach history, current relationship status, and project membership — often in collaboration with one or two colleagues.

**Key design principles:**

- **Local-first:** all data lives on the user's machine, not in the cloud.
- **Encrypted at rest:** the database is inaccessible without the user's password.
- **Minimal infrastructure:** collaboration works via a shared encrypted file in an existing service (e.g., OneDrive), not a proprietary server.
- **Focused scope:** source tracking only. Not a CRM, document manager, or communication tool.

---

## 2. Platform & Technology

### 2.1 Desktop Framework

The application is built with Electron, with a TypeScript/React frontend and a Node.js backend.

### 2.2 Database

SQLite, encrypted with SQLCipher. The database file is the canonical data store. For shared projects, a last-write-wins sync model using `updated_at` timestamps is used to merge concurrent edits across collaborators' instances.

### 2.3 Target Platforms

- macOS 12+
- Windows 10 and 11

### 2.4 Browser Extension

A companion browser extension (Chrome only) handles page archiving. It communicates with the desktop app via a localhost HTTP API exposed by the app when running. The extension captures a PNG screenshot of the current tab and submits it to the app along with the page URL.

---

## 3. Authentication & Security

### 3.1 User Profile

On first launch, the user completes a one-time setup that establishes both their identity and their master password. The following is collected:

- **First name and last name** — used to attribute interaction log entries, reporter assignments, and conflict detection across shared projects.
- **Email address** — used as a stable identifier when collaborating with others on shared projects.
- **Master password** — used to derive the encryption key for the local database. Not stored in plaintext anywhere.

The user profile (name and email) is stored in the local database and can be edited later in Settings. Changing the name or email does not retroactively update attributions already written to shared project files.

### 3.2 Encryption & Locking

- The master password is used to derive the encryption key for the SQLite database using a strong KDF (e.g., Argon2id).
- The app locks automatically after a configurable idle period (default: 15 minutes).
- There is no password recovery mechanism. If the password is lost, data is unrecoverable. The user must be warned of this clearly during setup.
- No data is ever transmitted to any remote server by the application itself (excluding RSS feed polling, which is user-initiated and fetches only public data).
- The shared project file (see Section 7) is also encrypted. The decryption key for a shared project is distributed out-of-band (QR code or secure link) at project creation time.

---

## 4. Data Model

### 4.1 Contacts

A Contact is a person. Contacts exist globally — they are not tied to any specific project and can be added to multiple projects. Every field except Name is optional.

| Field | Description |
|---|---|
| Name | Full name of the contact. |
| Organization _(optional)_ | Employer, group, or institution. Free text. |
| Email(s) _(optional)_ | One or more email addresses. |
| Phone(s) _(optional)_ | One or more phone numbers. |
| LinkedIn URL _(optional)_ | Direct URL to their LinkedIn profile. |
| Other socials _(optional)_ | Facebook, Instagram, X, or any other profile URL. Multiple allowed. |
| Lawsuits _(optional)_ | Docket numbers or names of relevant legal proceedings. |
| Other links _(optional)_ | Any other relevant URLs (company pages, news mentions, public records, etc.). |
| Notes _(optional)_ | Freeform notes. Covers: preferred contact method, topics they will/won't discuss, relationship history, current sentiment/posture, anything else the reporter needs to remember. |
| Archived pages _(optional)_ | Screenshots captured via the browser extension, stored as PNG files with timestamp and source URL. Each archive also stores the Wayback Machine snapshot URL if the automated save succeeded. |
| Google Alert RSS URL _(optional)_ | The RSS feed URL for this contact's Google Alert, if configured. |
| Alert mentions _(optional)_ | Fetched alert mentions, stored as a list of (date, headline, URL). Populated automatically when the app polls RSS feeds. |

### 4.2 Project Membership

When a Contact is added to a project, a Project Membership record is created. This record holds all project-specific information about that contact.

| Field | Description |
|---|---|
| Contact | Reference to the global Contact record. |
| Project | Reference to the Project. |
| Reporter | Which reporter on the project has claimed this source. |
| Theme _(optional)_ | Sub-theme within the project (e.g., "accounting issues", "police investigation"). Free text. |
| Priority | How much effort to invest in securing this source. Default options: Critical, High, Medium, Low, Monitor-only. Like the status list, priority options are user-editable in Settings — reporters can add, rename, or reorder them, but cannot delete a priority level currently in use. |
| Status | Current outreach status. User-editable drop-down — see Section 4.3 for defaults. |
| First outreach _(optional)_ | Date of first contact attempt. |
| Interview dates _(optional)_ | Date(s) the reporter spoke with this source (on or off record). Append-only. |
| Interaction log _(optional)_ | Timestamped, append-only log of free-text notes about each interaction or contact attempt. |
| Message scratchpad _(optional)_ | A private space for drafting outreach messages. Multiple drafts can be saved with a label and timestamp. Never sent by the app. **Strictly local — never written to the shared project file.** |

### 4.3 Source Status Options

A drop-down populated from a user-editable list. Reporters can add new statuses, rename existing ones, and reorder them in Settings. A status that is currently assigned to one or more contacts cannot be deleted — it must first be reassigned. The following statuses are pre-loaded as defaults:

| Status | Meaning |
|---|---|
| Not yet contacted | Added to the list; no outreach attempted. |
| Outreach attempted — no response | Reached out at least once; no reply received. |
| Declined | Explicitly refused to participate. |
| Declined — door left open | Declined for now but indicated willingness to revisit. |
| Referred to communications | Directed reporter to PR/comms department. |
| Agreed — not yet scheduled | Said yes but interview not yet booked. |
| Interviewed — off record | Spoke with reporter; not on record. |
| Interviewed — on record | Spoke with reporter; on record. |
| Ghosted | Was previously responsive; has since stopped replying. |
| Do not contact | Should not be contacted (legal hold, reporter discretion, etc.). |

### 4.4 Projects

| Field | Description |
|---|---|
| Name | Project name (e.g., "Maple Leaf Foods investigation"). |
| Description _(optional)_ | Short description or slug line. |
| Reporters | List of reporters who are collaborators on this project. |
| Created date | Auto-populated. |
| Shared file path _(optional)_ | Path to the shared encrypted .db file on disk, if this is a collaborative project. |

---

## 5. Views & Navigation

### 5.1 Global Contacts

A searchable, sortable table of all contacts across all projects. Columns: Name, Organization, Projects (list of project names the contact belongs to), Status (per-project, shown as tags if multiple). Clicking a contact opens their detail view.

### 5.2 Project View

The primary working view. Displays all contacts within a selected project. Layout:

- Left sidebar: project list, with the active project highlighted.
- Main panel: sortable, filterable table of contacts in the active project. Columns: Reporter (assigned), Name, Organization, Theme, Priority, Status, Last Contact, Interview Date.
- The current user's assigned contacts are visually highlighted (e.g., a subtle row tint or an icon).
- Clicking a row opens the Contact Detail panel (see 5.3).

### 5.3 Contact Detail Panel

A side panel or modal showing all fields for a contact, split into two tabs:

- **Global tab:** all fields from the Contact record (contact info, notes, archived pages, alert mentions).
- **Project tab:** all project membership fields (reporter, theme, priority, status, outreach dates, interaction log, message scratchpad).

### 5.4 Alert Mentions Feed

A dedicated view listing all incoming Google Alert mentions across all contacts, sorted by date descending. Each item shows: date, contact name, headline, source URL. Clicking an item opens the source URL in the default browser and optionally jumps to that contact.

### 5.5 Search

Global search across all contact fields (name, organization, notes, interaction logs). Results link directly to the matching contact.

---

## 6. Feature Specifications

### 6.1 Interaction Log

Each project membership has an append-only log. Entries are free text with an auto-stamped date and time. The reporter cannot edit or delete past entries (append-only). Entries are displayed in reverse chronological order. A new entry is added via a text area at the top of the log.

In shared projects, the interaction log is fully visible to all collaborators. Each entry is attributed to the reporter who wrote it (by name), so collaborators can see who contacted the source and when. This is by design — the log is a shared record of outreach activity, not a private journal.

### 6.2 Message Scratchpad

A draft-storage area within the project membership record. The reporter can create multiple named drafts (e.g., "First cold email", "Second follow-up text"). Each draft stores: label, body text, and created/modified timestamps. Drafts are never sent by the app. The scratchpad is a space to compose and iterate; the reporter copies text out manually to send via their own tools.

The scratchpad is strictly private. In shared projects, scratchpad drafts are stored only in the local database and are never written to the shared project file. Collaborators cannot see each other's drafts.

### 6.3 Google Alerts / RSS Integration

For each contact, the reporter can store a Google Alerts RSS URL. The app polls all stored RSS URLs on a configurable schedule (default: every 6 hours, minimum: every hour). New items that have not been seen before are stored in the contact's alert mentions list and surfaced in the Alert Mentions Feed (5.4). The app does not send OS-level push notifications in v1 — new mentions are only visible within the app.

When a reporter adds an RSS URL to a contact, the app shows a brief inline guide explaining how to create a Google Alert with RSS delivery, since this is not Google's default.

### 6.4 Page Archiving (Browser Extension)

The companion browser extension allows the reporter to capture a screenshot of any webpage and associate it with a contact. Flow:

1. Reporter visits a LinkedIn profile (or any page) in the browser.
2. Reporter clicks the extension icon, which shows a searchable list of all contacts across all projects, filterable by project.
3. Reporter selects a contact and clicks Archive.
4. The extension captures a PNG screenshot of the current tab and sends it along with the page URL to the desktop app via localhost API.
5. The desktop app stores the screenshot and displays it in the contact's archived pages list with a timestamp and source URL.
6. In the background, the app attempts to save the URL to the Wayback Machine (`https://web.archive.org/save/{url}`). If successful, the returned Wayback Machine URL is stored alongside the screenshot for future reference.

The Wayback Machine save will fail silently for pages behind a login (e.g., LinkedIn profiles) — the screenshot is always stored regardless. The extension popup includes a note pointing reporters to the [Internet Archive browser extension](https://chromewebstore.google.com/detail/wayback-machine/fpnmgdkabkmnadcjpehmlllkndpkmiak) for full-page HTML archiving.

### 6.5 Calendar Reminders (Live Subscription Feed)

Sourcerer serves a live iCalendar feed from its localhost server at `http://127.0.0.1:27371/calendar/reminders.ics`. The reporter subscribes to this URL once in their calendar app of choice; from then on the calendar stays current automatically as reminders are added or changed in Sourcerer — no re-importing required.

Supported calendar apps: Apple Calendar (Mac), Outlook (Windows), Google Calendar (via "Other calendars → From URL"). On first visit to the Reminders view, the app shows setup instructions for each.

Each reminder includes: contact name, project name, due date, and an optional note. The feed is only available while Sourcerer is running — if the app is closed, the calendar cannot fetch updates, but existing reminders are unaffected.

The app also maintains an internal reminders list (upcoming follow-ups, sorted by date) so the reporter can review pending outreach within the app without needing to open their calendar.

### 6.6 Conflict Detection

When two reporters in a shared project both mark the same contact as their assigned reporter within a short window (or when a contact is assigned to a reporter when another reporter has recently logged an interaction), the app flags the conflict with a warning banner in the Contact Detail panel. Resolution is manual — the app surfaces the conflict; the reporters decide.

### 6.7 Spreadsheet Export

From any Project View, the reporter can export all contacts in that project to a .csv or .xlsx file. Export options:

- **Full export:** all fields.
- **Sanitized export:** omits the interaction log and message scratchpad (suitable for sharing with editors or legal).

The export dialog lets the reporter choose between the two modes before generating the file.

---

## 7. Collaboration & Sync

### 7.1 Model

Collaboration is file-based, not server-based. A shared project is backed by a single encrypted SQLite/SQLCipher file that lives in a shared folder accessible to all collaborators — e.g., a shared OneDrive or Dropbox folder.

Each collaborator's app instance reads from and writes to this shared file directly. The app polls the file for changes on a configurable interval (default: every 2 minutes while the app is open). There is no real-time sync; this is eventual consistency over a shared file.

The shared file contains the full contact details for every contact added to that project, plus all project membership records. Contacts that exist in a reporter's local database but have not been added to the project are not included.

### 7.2 Setup Flow

When a reporter creates a new shared project:

1. The app creates an encrypted .db file and saves it to a location the reporter specifies (they should choose their shared folder).
2. The app generates a one-time setup link or QR code containing the file path and decryption key.
3. The reporter shares this link/QR with collaborators out-of-band (e.g., via Signal or in person).
4. Each collaborator opens the link/QR in their app instance, which registers the shared file.

### 7.3 Conflict Resolution

Concurrent edits are resolved using last-write-wins at the field level, based on `updated_at` timestamps. The conflict detection feature (6.6) handles the higher-level case of two reporters both claiming the same source.

### 7.4 Visibility

All reporters on a shared project see all contacts in that project. Contacts assigned to the current user are visually highlighted. There is no per-reporter access restriction within a project — if you are a collaborator, you see everything.

### 7.5 Shared File Recovery

If the shared file is moved, corrupted, or deleted, Sourcerer detects this on the next poll cycle (or when the user navigates to the project) and displays a recovery banner with two options:

**Relocate:** If the file has simply been moved, the reporter can open a file picker to point Sourcerer at its new location. The app updates the stored path and resumes normal sync.

**Regenerate:** If the file is lost or corrupted, any collaborator can recreate it from their local data. The app creates a new encrypted shared file, exports all local project data into it, and generates a new setup link/QR code. The reporter must share this new link with all collaborators so they can re-point their instances to the new file.

A warning is shown before regeneration: _"This will recreate the shared file from your local data. Any changes made by collaborators that were not yet synced to the shared file before it was lost may not be included."_ Regeneration does not require any collaborators to be online — it is a unilateral action by whoever initiates it.

### 7.6 What Is and Is Not Synced

The following data is written to the shared project file and visible to all collaborators:

- All contact fields (name, organization, contact details, notes, alert mentions).
- Archive records (URL, timestamp, Wayback Machine URL) — but not screenshot files themselves. Screenshots are stored locally only; collaborators see the archive record and Wayback URL but not the screenshot image.
- All project membership fields (reporter, theme, priority, status, outreach dates).
- The interaction log, including attribution (who wrote each entry).

The following is strictly local and never written to the shared file:

- The message scratchpad. Each reporter's drafts are private to their own instance.
- The user's master password and encryption keys.

---

## 8. Out of Scope (v1)

The following features are explicitly excluded from v1:

- Document management or file attachments beyond page archives.
- Automated sentiment analysis or AI-assisted source scoring.
- Direct sending of messages or emails from within the app.
- Native calendar integration (OS calendar APIs, Google Calendar, Outlook API).
- Real-time collaborative editing.
- Mobile clients.
- Change detection on archived pages (flagging when a source's LinkedIn profile changes).
- Relationship mapping or graph visualization.
- Interview prep views or AI-generated briefing sheets.

---

## 9. Open Questions

All open questions have been resolved. See the Resolved Decisions section in the Technical Architecture Document for a full log.

---

## 10. Next Steps

1. Review and sign off on this PRD.
2. Produce the Technical Architecture Document (database schema, encryption implementation, sync mechanism, extension/app communication protocol).
3. Produce the Data Schema (formal table definitions).
4. Begin scaffolding the project and implementing authentication + encrypted database.
