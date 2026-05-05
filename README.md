# Sourcerer

Local-first, encrypted source and contact tracker for investigative journalists. Built with Electron, React, TypeScript, and SQLCipher — no cloud, no accounts, no telemetry.

---

## What it does

Sourcerer replaces the ad-hoc spreadsheets journalists use to manage sources. Everything lives in an encrypted local database that only you can unlock with your master password.

**Contacts & projects**
- Store contacts with name, organisation, role, beat, phone numbers, emails, and social handles (LinkedIn, X, Instagram, etc.)
- Create projects and assign contacts to them with project-specific metadata: status, priority, theme, and a "reporter" field to track who owns the relationship
- Log interactions (calls, emails, meetings, tips) against each contact in a project

**Privacy & security**
- Database encrypted with SQLCipher (AES-256). The encryption key is derived fresh from your master password via Argon2id every time you unlock — the key is never written to disk
- Auto-lock after a configurable idle timeout
- Message scratchpad (per contact) is local-only and never included in any sync or export

**Reminders & calendar**
- Set follow-up reminders against contacts
- Subscribe to a local iCal feed (`webcal://127.0.0.1:27371/calendar/reminders.ics`) in Apple Calendar, Outlook, or Google Calendar

**Browser extension API**
- A local HTTP server exposes a session-authenticated REST API so a browser extension can push contacts and interaction notes directly from the browser
- The renderer controls access: extension requests pop up an approval prompt

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop framework | Electron (macOS 12+, Windows 10/11) |
| UI | React + TypeScript (electron-vite) |
| Database | SQLite via `better-sqlite3-multiple-ciphers` (SQLCipher) |
| Key derivation | Argon2id (m=65536, t=3, p=1, 32-byte key) |
| Build / package | electron-vite + electron-builder |

---

## Setup

Native modules (SQLCipher, Argon2) must be compiled against Electron's Node.js runtime, not the system Node. Run these once after cloning:

```bash
npm install --ignore-scripts
node node_modules/electron/install.js
./node_modules/.bin/electron-rebuild -f -w better-sqlite3-multiple-ciphers,argon2
```

> **After any `npm install` that touches native modules**, re-run the `electron-rebuild` line above.

### Prerequisites

- Node.js 20+
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Python 3 (required by native module build tooling)

---

## Development

```bash
npm run dev
```

Launches the app with hot-reload. On first launch you'll be prompted to create a name, email, and master password. This derives the encryption key and initialises the local database.

In dev mode, a set of realistic seed contacts and projects is loaded automatically on first unlock so you have something to work with immediately.

```bash
npm run typecheck   # type-check without building
npm run build       # compile only
npm run package     # compile + create distributable
```

---

## Data storage

All data lives locally in Electron's `userData` directory (typically `~/Library/Application Support/sourcerer` on macOS):

| File | Purpose |
|---|---|
| `sourcerer.db` | SQLCipher-encrypted SQLite database |
| `sourcerer.salt` | Argon2id salt — not secret, but must not be deleted |

**The master password is never stored.** Losing it means permanent loss of access to the database — there is no recovery mechanism.

---

## Local HTTP server

When the app is running, a local server listens on `127.0.0.1:27371`. This powers:

- **Browser extension API** — session-token-protected endpoints for reading contacts and logging interactions. The extension must request access; the app shows an approval prompt before issuing a token.
- **iCal feed** — `GET /calendar/reminders.ics?token=<calendar_token>` returns a VCALENDAR of upcoming reminders. The calendar token is persistent (survives restarts) and can be regenerated from Settings.

The server only binds to loopback — it is not accessible from the network.

---

## Collaboration

Sourcerer supports optional file-based collaboration: point two installs at the same SQLCipher file in a shared folder (Dropbox, OneDrive) and they sync automatically every two minutes. Sync is last-write-wins on `updated_at` timestamps. The message scratchpad is never synced.
