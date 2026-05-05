# Sourcerer

Local-first, encrypted source and contact tracker for investigative journalists. Built with Electron, React, TypeScript, and SQLCipher.

## Prerequisites

- Node.js 20+
- Python 3 and Xcode Command Line Tools (for native module compilation on macOS)

## Setup

Native modules (SQLCipher, Argon2) must be compiled for Electron's runtime, not system Node.

```bash
npm install --ignore-scripts
node node_modules/electron/install.js
./node_modules/.bin/electron-rebuild -f -w better-sqlite3-multiple-ciphers,argon2
```

## Development

```bash
npm run dev
```

Launches the app with hot-reload. On first run you'll be prompted to create a name, email, and master password — this derives the encryption key and initialises the local database.

## Typecheck

```bash
npm run typecheck
```

## Build & Package

```bash
npm run build       # compile only
npm run package     # compile + create distributable
```

## Data storage

All data is stored locally in Electron's `userData` directory:

- `sourcerer.db` — SQLCipher-encrypted SQLite database
- `sourcerer.salt` — Argon2id salt (not secret, must not be deleted)

The master password is never stored. Losing it means losing access to the database.
