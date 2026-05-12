# Sourcerer

Source and contact management for journalists and researchers — local-first, encrypted, no cloud.

![screenshot](docs/img/contact-details-2.png)

_All names and details in the screenshot are fictional and generated for demonstration purposes only._

---

- [What it does](#what-it-does)
- [Features](#features)
- [How it works](#how-it-works)
- [Installation](#installation)
- [Getting started (development)](#getting-started-development)
- [Security notes](#security-notes)
- [License](#license)

---

## What it does

All data lives in an encrypted SQLite database on your own machine. There are no accounts, no sync servers, and no telemetry of any kind. The encryption key is derived from your master password with Argon2id on every unlock and is never written to disk.

Sourcerer is built around the workflow of investigative reporting: you manage a global contact book, then organise sources into projects with per-project status, priority, outreach history, and reporter attribution. You can log interactions, set reminders, and track exactly who owns each relationship and when it was last touched.

Deduplication surfaces likely-duplicate contacts via fuzzy name matching and exact email/phone signals, then presents them side-by-side so you can merge or dismiss each pair with one click.

A Chrome extension captures full-page screenshots from any browser tab and links them to a contact record. Screenshots are encrypted on disk with the same key as the database. Export to CSV, Excel, or vCard; import from CSV with semicolon-separated multi-value fields.

---

## Features

**Contacts**
- Add/edit name, organisation, notes, emails, phones, and links (LinkedIn, X, website, etc.)
- Staleness indicator flags contacts not touched in a configurable number of days
- Duplicate detection with one-click merge

**Projects**
- Local projects or shared (encrypted shared database on a shared drive)
- Per-project source memberships with reporter attribution, theme, priority, status, and outreach tracking
- Multiple reporters per project; conflict detection when the same contact is assigned to two reporters

**Outreach**
- Priority levels: Critical, High, Medium, Low, Monitor-only — each with a fixed reminder interval
- Status workflow: Not yet contacted → Contacted, no reply → In dialogue → Interview arranged → Interviewed (off/on-record) → Declined / Declined, door open / Referred to comms / Ghosted / Do not contact
- Interaction log per source per project
- Manual reminders with due dates and notes

**Alerts**
- RSS feed monitoring per contact; new mentions surfaced in a notification centre
- Optional Wayback Machine snapshot on link save

**Security**
- AES-256 encryption via SQLCipher; master password derived with Argon2id
- Auto-lock on idle (configurable timeout)
- Panic wipe: destroys the database and key material immediately
- Encrypted backup and restore

**Import / Export**
- CSV import with semicolon-separated multi-value fields (emails, phones, websites per cell)
- Export to CSV, Excel (.xlsx), or vCard (.vcf) — per project or all contacts
- Sanitised export mode strips notes and interaction logs for sharing

**Chrome extension**
- Full-page screenshot capture from any tab
- Contact picker links screenshots to a source record
- Screenshots stored encrypted alongside the database

---

## How it works

Sourcerer is an Electron + React + TypeScript application built with [electron-vite](https://electron-vite.org). The database is SQLite encrypted with [better-sqlite3-multiple-ciphers](https://github.com/m4heshd/better-sqlite3-multiple-ciphers) (SQLCipher AES-256-CBC). All communication between the renderer and the main process goes through a typed preload bridge — `nodeIntegration` is off, the renderer sandbox is on. The master password is never stored; the key is derived fresh on each unlock with Argon2id.

---

## Installation

Pre-built binaries for **macOS (Apple Silicon)**, **Windows (x64)**, and **Linux (x64)** are published with each release.

**[→ Download the latest release](https://github.com/tomcardoso/sourcerer/releases/latest)**

**macOS**

1. Download `Sourcerer-<version>-arm64.dmg`.
2. Open the `.dmg` and drag Sourcerer to your Applications folder.
3. On first launch, macOS may block the app because it is not notarized. If you see a Gatekeeper prompt, open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway**.

**Windows**

1. Download `Sourcerer Setup <version>.exe`.
2. Run the installer. Windows SmartScreen may warn you the publisher is unknown — click **More info → Run anyway**.
3. Sourcerer will be installed to your user profile and a Start Menu shortcut will be created.

**Linux**

1. Download `Sourcerer-<version>.AppImage`.
2. Make it executable: `chmod +x Sourcerer-*.AppImage`
3. Run it: `./Sourcerer-*.AppImage`

No installation required. The AppImage runs on any x64 Linux distribution with glibc 2.17+ (Ubuntu 18.04+, Fedora 27+, Debian 9+, and equivalents).

---

## Getting started (development)

**Prerequisites:** Node 20+, npm

```bash
git clone https://github.com/tomcardoso/sourcerer.git
cd sourcerer
npm install
npm run rebuild   # compiles native SQLite and Argon2 modules for Electron
npm run dev
```

> If you see a `NODE_MODULE_VERSION` mismatch error, run `npm run rebuild` again.

**Running tests** (before the Electron rebuild):

```bash
npm run rebuild:node   # compile native modules for system Node
npm test
npm run rebuild        # restore Electron-targeted binaries before npm run dev
```

---

## Security notes

- No network requests are made except: user-configured RSS feeds, optional Wayback Machine saves, and the local HTTP server that receives screenshots from the Chrome extension (localhost only, one-time token auth).
- The master password cannot be recovered. Use a passphrase — four random words are easier to remember and just as strong as a complex string.
- The Chrome extension communicates only with localhost and requires explicit one-time approval in the app.

---

## License

AGPL-3.0 — see [LICENSE](LICENSE).
