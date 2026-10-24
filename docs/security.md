# Security

How Sourcerer protects your data — and what it doesn't protect against.

## Encryption model

All Sourcerer data is stored in a single SQLite database encrypted with [SQLCipher](https://www.zetetic.net/sqlcipher/), an open-source extension that provides transparent, full-database AES-256-CBC encryption.

The encryption key is never stored anywhere — it is derived from your master password each time you unlock the app using **Argon2id**, a memory-hard key derivation function designed to be expensive to brute-force.

### Key derivation parameters

| Parameter | Value |
| --- | --- |
| Algorithm | Argon2id |
| Memory cost | 64 MB (65536 KiB) |
| Time cost | 3 iterations |
| Parallelism | 1 thread |
| Output key length | 32 bytes (256 bits) |
| Salt length | 32 bytes, randomly generated at setup |

The salt is stored as a file named `salt` inside the `.sourcerer` vault bundle, alongside the database. The salt is not secret — its purpose is to ensure that the same password cannot produce the same key on a different machine — but it must not be deleted. Without the salt, the database cannot be opened even with the correct password.

## Your master password

The master password is **never stored, hashed for storage, or transmitted anywhere**. It exists only in memory during the unlock process, long enough to derive the key. After that it is gone.

There is no password reset, recovery code, or backdoor. If you forget your password, your data is permanently inaccessible. This is by design — any recovery mechanism would be a potential attack surface.

### Choosing a good password

A passphrase — four or more random, unrelated words — provides excellent security and is significantly easier to remember than a complex string of characters. The memory cost of Argon2id means that even a moderately long passphrase is extremely difficult to attack offline.

Avoid passwords derived from personal information (birthdays, names, addresses) that an adversary who knows you could guess.

## What is encrypted

The following are encrypted at rest:

- The SQLite database — all contacts, projects, interactions, reminders, alerts, and settings
- Screenshots captured by the browser extension, stored encrypted alongside the database

Encryption is full-database: SQLCipher encrypts every page of the SQLite file, including table structure, indexes, and all data.

## What is not protected

Sourcerer does not protect against every threat. Being honest about its limitations is important.

### Local access

If someone has physical or remote access to your unlocked computer, they can read the Sourcerer database while it is open in memory. Encryption at rest protects the files on disk, not data in a running process.

Auto-lock reduces this window — set a short timeout if you work in shared spaces. The panic wipe is available for extreme situations.

### The salt file

The salt file is stored unencrypted inside the `.sourcerer` vault bundle alongside the database. It is not secret (the salt is not a key), but it must not be deleted or separated from the database. If you move your vault, move the entire bundle — not just the database file.

### File metadata

The operating system can see that the database file exists, its size, and its modification timestamps — even though it cannot read the contents. If the existence of the file itself is sensitive, consider full-disk encryption at the OS level (FileVault on macOS, BitLocker on Windows).

### Memory

While the app is unlocked, decrypted data is held in memory. This is unavoidable for any application. Modern OS memory management means sensitive data may remain in swap or memory dumps after the app is closed. Auto-lock clears the key from memory on idle.

### Backups in insecure locations

Backup files exported from Sourcerer are encrypted with the same password as the original database. However, if you copy a backup to an unencrypted cloud drive, USB stick, or email attachment, the encrypted file could be exfiltrated and subjected to offline password attacks. Store backups carefully.

### Independent security review

Sourcerer has **not yet undergone an independent third-party security audit**. The cryptographic design relies on standard, well-reviewed primitives rather than anything custom — SQLCipher for encryption at rest, Argon2id for key derivation — and the complete source is open for inspection. But no external reviewer has examined the implementation to date, and the claims on this page rest on the code itself rather than on anyone else's verification of it.

An external review has been applied for. This section will be updated when that status changes. If your work carries a threat model where an unaudited tool is unacceptable, treat that as the current state of affairs rather than an oversight.

### What Sourcerer is not

Sourcerer is not a communications tool. It does not provide secure messaging, end-to-end encrypted email, or any kind of anonymity network. It protects data at rest on your local machine — nothing more.

## Network traffic

Sourcerer makes **no telemetry or analytics requests of any kind**. There are no analytics libraries, no crash reporting, and no usage tracking.

The only outbound network connections the app initiates are:

- **RSS feeds** — only for feeds you have explicitly attached to a contact. Sourcerer fetches these feeds from wherever they are hosted.
- **Wayback Machine API** — only when you add or update a contact's website URL and the Wayback Machine setting is enabled.
- **Update checks** — about 10 seconds after launch, and whenever you choose **Help → Check for Updates…**, an installed copy of the app asks GitHub whether a newer release of Sourcerer exists. The check sends no data about you or your contacts, and an update is downloaded only if you choose to.

There are no other outbound connections. The app does not communicate with any Sourcerer-operated server.

## Local HTTP server

When Sourcerer is running and unlocked, it starts a small HTTP server bound to `127.0.0.1:27371`. This server powers two features:

- **Browser extension** — the extension sends screenshots and reads contact data through this server
- **Calendar feed** — reminders can be subscribed to by any local calendar app (Apple Calendar, Outlook, Thunderbird, and others) via an `http://localhost` URL, accessible only on this machine

The server is bound exclusively to the loopback interface (`127.0.0.1`). It is not accessible from any other machine on the network, and cannot be reached from the internet.

### Extension authentication

Before the browser extension can connect, you must explicitly approve it in the app. Sourcerer then issues a session token to the extension. Every request the extension makes must include this token. The token is regenerated each time the extension reconnects.

### Calendar token

The calendar feed URL includes a persistent token. Anyone with this URL can read your upcoming reminders (but not your contacts, notes, or any other data). If you believe the URL has been compromised, regenerate the token from Settings — the old URL will immediately stop working.

### CORS

CORS headers are only set when the request includes an `Origin` or `Referer` header matching an extension scheme (`chrome-extension://` or `moz-extension://`). In that case the header is reflected back to permit the request. Ordinary web pages — whose origins are `http://` or `https://` — never receive CORS headers and cannot make cross-origin requests to the local server. The session token is the primary authentication gate; CORS is a defence-in-depth measure against browser-based cross-origin attacks.

## Panic wipe

The panic wipe is a two-step, irreversible destruction of all Sourcerer data on the machine. Clicking the button reveals a confirmation step that requires you to type **WIPE** before anything is deleted. It then deletes:

- The encrypted database file
- The salt file
- All screenshots stored by the browser extension

Files are overwritten before deletion where possible, making forensic recovery harder (though not impossible on SSDs, which manage writes at the firmware level).

> **Panic wipe has no undo.** Once you confirm by typing WIPE, data is gone immediately. Backups stored elsewhere are not affected — the backup file is self-contained and can be restored using only your password.

## Shared projects

A shared project is a second SQLCipher database placed in a folder that a cloud provider replicates between machines. The encryption properties are the same as the main vault: the provider stores ciphertext and never holds your password, so Dropbox, OneDrive, iCloud Drive and Google Drive cannot read the contents of a shared project.

The consistency properties are weaker, and worth stating plainly. Sourcerer's shared projects are **eventually consistent, provided collaborators do not write within the same cloud-sync upload window**. Cloud providers replicate whole files and fork on concurrent writes — they never merge. When two people save at once, the provider preserves one version and leaves the other beside it as a "conflicted copy", and the changes in that copy are not present in the file Sourcerer subsequently reads.

Where changes do need reconciling, conflict resolution is last-write-wins by wall-clock timestamp at one-second granularity. Those timestamps come from the collaborators' own machines, and there is no server to arbitrate: a client with a materially skewed clock can resolve a conflict backwards, letting an older edit overwrite a newer one.

This is a property of the substrate rather than a defect in the implementation. It is the cost of collaboration with no server and no third party holding a key, and it is the correct tradeoff for this tool — but it means shared projects should not be relied upon as the sole copy of anything critical. Take backups, and prefer working a few minutes apart over editing the same project simultaneously.

## Backups

Backup files produced by Sourcerer are AES-256-GCM encrypted bundles. They contain the database and its salt, compressed and encrypted with a key derived from your password using Argon2id. Anyone who obtains the file still needs the correct password to open it.

A few things to keep in mind:

- The backup uses the password that was active _at the time the backup was made_. If you change your password after taking a backup, the backup can still only be opened with the old password.
- Sourcerer validates the backup file before restoring it, to guard against accidental selection of the wrong file. Files larger than 250 MB are rejected.
- The backup is self-contained — the database salt is embedded inside the encrypted backup file. You do not need to keep a separate copy of `sourcerer.salt` to restore from a backup.

For maximum safety, store backups on encrypted media separate from the main machine.

## Open source

Sourcerer is open source under the AGPL-3.0 licence. The full source code is available at [github.com/tomcardoso/sourcerer](https://github.com/tomcardoso/sourcerer).

Security claims in this document can be verified by reading the code. The key derivation and encryption logic lives in `src/main/ipc/setup.ts`, `src/main/ipc/unlock.ts`, and `src/main/database/index.ts`. The panic wipe is in `src/main/ipc/settings.ts`.

If you find a security vulnerability, please report it responsibly via GitHub rather than disclosing it publicly.
