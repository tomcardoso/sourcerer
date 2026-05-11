# Sourcerer Security Audit Report
**Date:** 2026-05-10
**Scope:** Full codebase — `/Users/tcardoso/Dropbox/code/Personal/sourcerer`
**Auditor:** GitHub Copilot (adversarial audit)
**Classification:** Sensitive — journalist source-management application

---

## Executive Summary

Sourcerer has a solid cryptographic foundation: Argon2id for KDF, SQLCipher with raw-key mode, AES-256-GCM for screenshot encryption, and correct Electron security primitives (`contextIsolation`, no `nodeIntegration`). All SQL queries are parameterised; no injection surface was found. No hardcoded secrets exist.

The two most serious issues are in the local HTTP server: **CORS is set to wildcard (`*`) on every route including the one that hands out the session token**, enabling any open browser tab to exfiltrate the session token and subsequently read all contact data. The second is **the panic wipe only calls `unlink()`, which is not a secure erase** — unacceptable for a tool whose threat model includes physical seizure.

Seven other findings span backup integrity, key memory hygiene, file permissions, shared-DB housekeeping, and a password-change bug that silently breaks screenshot decryption.

---

## Correctly Implemented — Honest Positives

Before findings: the following are done right and deserve to stay that way.

| Area | Detail |
|---|---|
| Argon2id KDF | `argon2id`, raw output (`raw: true`), 32-byte output. SQLCipher is opened with `x'hex'` notation, bypassing its own (weaker) PBKDF2. Correct. |
| SQL injection | Every query uses parameterised statements (`db.prepare('... WHERE id = ?').get(id)`). The dynamic IN-clause in `contacts.ts:154` also uses `?` placeholders correctly. |
| Session token entropy | `randomBytes(32).toString('base64')` — 256 bits. Strong. |
| Electron core settings | `contextIsolation: true`, `nodeIntegration: false` — both set. |
| Preload isolation | `contextBridge.exposeInMainWorld()` is used correctly; `ipcRenderer` itself is never exposed. |
| New-window handling | `setWindowOpenHandler` denies popups and routes to `shell.openExternal`. |
| Screenshot encryption | AES-256-GCM with a random 12-byte IV per file. The GCM authentication tag is prepended and checked on decrypt. |
| No eval / innerHTML | No `eval()`, `new Function()`, `dangerouslySetInnerHTML`, or dynamic `require()` found in renderer code. |
| No hardcoded secrets | None found in any source file. |
| Foreign keys | `PRAGMA foreign_keys = ON` enforced on every connection open. |
| Extension approval | Access-request flow requires explicit user approval via the in-app UI before any token is issued. |

---

## HIGH — Meaningful Attack Surface

### H1 — CORS wildcard exposes session token to any browser tab

**Location:** `src/main/http-server.ts`, lines 39–40 and 80–84

**Code:**
```ts
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Headers', 'X-Sourcerer-Token, Content-Type');
```
These two headers are set unconditionally at the top of `handleRequest()`, before any route dispatch, including the route that returns the session token:

```ts
// /access-status — no auth required
if (accessState === 'approved' && sessionToken) {
  json(res, 200, { status: 'approved', token: sessionToken });
```

**Exploit scenario:**
1. A malicious webpage (or any site with a stored XSS) runs in the user's browser while Sourcerer is open.
2. The page sends `fetch('http://127.0.0.1:27371/request-access', { method: 'POST' })`. The wildcard `Access-Control-Allow-Origin` makes the CORS preflight succeed and the browser sends the request.
3. The Sourcerer UI shows an "Extension wants access" dialog. If the user clicks Approve (believing it is their Sourcerer browser extension), `accessState` transitions to `'approved'` and a 256-bit token is minted.
4. The page polls `GET /access-status`. The wildcard CORS header means the full JSON response — including `token` — is readable by the page.
5. The page now sends `GET /contacts` with `X-Sourcerer-Token: <stolen>` and reads back all contact names, organisations, and project memberships in cleartext JSON.
6. Optionally the page sends `POST /screenshot` with a session token to inject arbitrary data that will be stored as an encrypted screenshot.

The `/focus` endpoint (line 58) is also unauthenticated and callable by any local process or page, which can be used to force the Sourcerer window to the foreground as part of a social-engineering flow.

**Fix:**
- Restrict the CORS origin to the known extension ID(s): `chrome-extension://<id>` and/or `moz-extension://<id>`. These are known at build time and can be hardcoded constants.
- For `/access-status` and all authenticated routes, set `Access-Control-Allow-Origin` only to the verified extension origin, not `*`.
- Do not add CORS headers to `/status`, `/focus`, and `/request-access` at all — these should not be callable cross-origin.
- Consider adding a pre-shared nonce (generated at app start, written to a known location that only the sideloaded extension reads) to gate `/request-access` itself.

---

### H2 — Backup file has no integrity protection; restore overwrites DB without validation

**Location:** `src/main/ipc/backup.ts`, lines 56–75

**Code (restore path):**
```ts
const compressed = await fs.readFile(filePaths[0]);  // no size cap
const raw = await gunzip(compressed);
const bundle = JSON.parse(raw.toString('utf-8'));

if (bundle.version !== 1 || !bundle.db || !bundle.salt) {
  return { success: false, error: 'Unrecognised backup format.' };
}

const db = Buffer.from(bundle.db, 'base64');
const salt = Buffer.from(bundle.salt, 'base64');

stopPoller();
closeDatabase();
await fs.writeFile(dbPath, db);    // unconditional overwrite
await fs.writeFile(saltPath, salt);
```

Issues:
- **No size cap.** A 2 GB gzip bomb will OOM the process before the format check. Add `fs.stat()` before reading and reject files over (e.g.) 500 MB.
- **DB bytes are written without verifying they are a valid SQLCipher file.** There is no attempt to open the restored DB with the user's current password (or any password) before overwriting the live installation. A planted `.sourcerer-backup` file can erase the real database.
- **No HMAC / signature.** The backup bundle is gzip-compressed plaintext JSON wrapping a SQLCipher-encrypted blob. There is no integrity check on the outer wrapper. An attacker who can modify the file on disk can alter the `version` or `created_at` fields without detection.
- **The backup file itself is unencrypted at the outer layer.** The DB inside is SQLCipher-protected by the user's password, but the gzip bundle is written to an arbitrary user-chosen path with no additional encryption. An adversary who steals the backup file gets an offline brute-force target.

**Fix:**
- Before overwriting the live DB, attempt to open the restored DB with the current password. Only proceed if it opens cleanly.
- Add `fs.stat()` before `fs.readFile()` and reject files above a reasonable limit.
- Add an HMAC-SHA256 (keyed with the user's current password, or a separately entered restore password) over the bundle to detect tampering.

---

### H3 — `xlsx` prototype pollution is a runtime dependency

**Location:** `package.json` — `"xlsx": "^0.18.5"` in `dependencies`

`npm audit` reports `HIGH: Prototype Pollution in sheetJS` for this version. The package is used in `src/main/ipc/export.ts` for writing XLSX and CSV files. If synced shared-DB data (attacker-controlled contact names, organisation names, URLs) is passed through `utils.json_to_sheet()`, prototype pollution could corrupt `Object.prototype` in the main process, potentially affecting subsequent operations.

**Fix:** Migrate to `exceljs` (actively maintained, no known prototype-pollution CVEs) or wait for an upstream fix. This is a main-process dependency with attacker-reachable data paths.

---

### H4 — `sandbox: false` disables the OS-level renderer sandbox

**Location:** `src/main/index.ts`, line 47

```ts
webPreferences: {
  sandbox: false,          // <—
  contextIsolation: true,
  nodeIntegration: false,
},
```

With `sandbox: false`, the renderer process runs without the Chromium OS-level sandbox (seccomp on Linux, Win32 job objects on Windows, macOS sandbox profile). A renderer-side exploit (Chromium/Blink vulnerability or an XSS that chains to one) would gain unrestricted process-level access to the filesystem and network without needing a sandbox escape.

The native modules (`better-sqlite3-multiple-ciphers`, `argon2`) are used exclusively in the **main** process. The renderer has no direct dependency on native addons. This means the `sandbox: false` restriction reason no longer applies.

**Fix:** Set `sandbox: true` and test the renderer independently. Move any remaining preload code that touches native modules into the main process via IPC. This is the highest-leverage hardening change available.

---

## MEDIUM — Defence-in-Depth Gaps

### M1 — Panic wipe uses `unlink()`, not secure erase

**Location:** `src/main/ipc/audit.ts`, line 27

```ts
await fs.unlink(dbPath).catch(() => {});
await fs.unlink(saltPath).catch(() => {});
app.quit();
```

`fs.unlink()` removes the directory entry only. On SSDs (and all modern macOS hardware uses APFS on flash), the physical sectors remain until the storage controller's garbage collection runs. Standard forensic tools can recover recently unlinked files.

Additional gaps:
- **WAL files not deleted.** SQLite WAL mode creates `sourcerer.db-wal` and `sourcerer.db-shm`. These contain recent transaction data.
- **Screenshots directory not deleted.** `userData/screenshots/*.enc` files remain.
- **Shared project DB files are at user-defined paths and are not touched.**
- **Electron log files** (`userData/logs/`) are not cleared.
- **In-memory key not zeroed** before `app.quit()`.

**Fix:**
- Before unlinking, overwrite the DB and salt file contents with `crypto.randomBytes(size)` or zeros using `fs.open()` + `fs.write()`.
- Also unlink `sourcerer.db-wal` and `sourcerer.db-shm`.
- Recursively delete `userData/screenshots/`.
- Recursively delete `userData/logs/`.

---

### M2 — Derived key stored as an immutable JavaScript string; cannot be zeroed

**Location:** `src/main/database/index.ts`, line 7

```ts
let activeKeyHex: string | null = null;
```

JavaScript strings are immutable. Setting `activeKeyHex = null` removes the module-level reference but the underlying V8 string object stays in heap until the GC reclaims it. A memory dump of the Electron main process between `closeDatabase()` and GC may still contain the 64-character hex key.

Additionally, in `utils.ts:14`, the raw 32-byte Buffer from argon2 is immediately converted to a string and the Buffer is not zeroed.

**Fix:**
- Keep the key as a `Buffer` (or `Uint8Array`) rather than a string.
- Add an explicit `activeKeyBuf.fill(0)` in `closeDatabase()` before nulling the reference.
- Pass the key to SQLCipher via a method that accepts a Buffer rather than embedding it in a template-literal SQL string.

---

### M3 — `settings:change-password` does not update `activeKeyHex` after `PRAGMA rekey`

**Location:** `src/main/ipc/settings.ts`, line 221

```ts
getDatabase().pragma(`rekey="x'${newKeyHex}'"`);   // DB rekeyed
await fs.writeFile(saltPath, newSalt);
// activeKeyHex is never updated — still holds currentKeyHex
return { success: true };
```

After a password change:
- The SQLite database file is now encrypted with `newKeyHex`.
- `activeKeyHex` in `database/index.ts` still holds the **old** key.
- Any screenshot created *after* the password change (in the same session) is AES-256-GCM encrypted with `getKeyHex()` → the old key.
- On the next unlock, `activeKeyHex = newKeyHex` and all subsequent `decryptBuffer()` calls for those screenshots will fail silently or throw.

This is both a security correctness bug and a data-loss path.

**Fix:** After `PRAGMA rekey` succeeds, call a new exported function `updateActiveKeyHex(newKeyHex)` in `database/index.ts`, or close and reopen the database with the new key, resetting the module state cleanly.

---

### M4 — Salt and DB files written without restricting permissions (world-readable)

**Location:** `src/main/ipc/setup.ts` line 28, `src/main/ipc/backup.ts` lines 74–75

```ts
await fs.writeFile(saltPath, salt);        // uses process umask, typically 0644
await fs.writeFile(dbPath, db);
```

macOS default umask is `022`, so files are created as `0644` (owner rw, group r, others r). On a shared macOS system, any local user can read `sourcerer.db` and `sourcerer.salt`.

**Fix:**
```ts
await fs.writeFile(saltPath, salt, { mode: 0o600 });
await fs.writeFile(dbPath, db, { mode: 0o600 });
```
Apply to: `setup.ts`, `backup.ts` (both files on restore), `settings.ts` (new salt on password change).

---

### M5 — Auto-lock does not close shared DB connections

**Location:** `src/main/auto-lock.ts`, line 38

```ts
private check(): void {
  if (!isDatabaseOpen()) return;
  if (Date.now() - this.lastInteractionAt > this.idleThresholdMs) {
    stopPoller();
    closeDatabase();          // local DB closed
    // closeAllSharedDbs() ← missing
    this.win?.webContents.send('app:locked');
  }
}
```

`closeAllSharedDbs()` is called on `window-all-closed` but not on auto-lock. After auto-lock fires, file handles to every shared project DB remain open indefinitely.

**Fix:** Import `closeAllSharedDbs` from `'./database/shared-db'` in `auto-lock.ts` and call it alongside `closeDatabase()`.

---

### M6 — Auto-lock: 60-second check granularity; no OS idle or window blur hook

**Location:** `src/main/auto-lock.ts`, line 23

```ts
win.webContents.on('input-event', () => {
  this.lastInteractionAt = Date.now();
});
```

Only resets the idle timer on mouse/keyboard events within the Sourcerer window. No `window.on('blur')` handler and no call to `powerMonitor.getSystemIdleTime()`. The 60-second check interval adds up to 60 seconds of lag beyond the configured timeout before lock fires.

**Fix:** Supplement with `powerMonitor.getSystemIdleTime()` from Electron's `powerMonitor` module to detect OS-level system idle state. Optionally hook `win.on('blur')` to start an accelerated countdown.

---

### M7 — Wayback Machine archiving silently exfiltrates journalist research to an external service

**Location:** `src/main/ipc/contacts.ts`, line 31

```ts
async function triggerWaybackSave(contactId: string, url: string): Promise<void> {
  const response = await fetch(`https://web.archive.org/save/${encodeURIComponent(url)}`, {
    headers: { 'User-Agent': 'Sourcerer/1.0' },
  });
```

This is triggered automatically (without user prompt) when a contact's website link is saved. Every call tells the Wayback Machine — a third-party service — that the `Sourcerer/1.0` user agent is archiving this URL at this moment. The URL reveals the journalist's subject of investigation. The Internet Archive logs IP addresses and request metadata.

**Fix:** Make this an explicit, opt-in, user-initiated action (a "Save to Wayback" button). Never trigger it automatically on contact save. Add a note in the UI that this sends the URL to a third-party service.

---

### M8 — `setWindowOpenHandler` calls `shell.openExternal` without scheme validation

**Location:** `src/main/index.ts`, line 55

```ts
win.webContents.setWindowOpenHandler((details) => {
  shell.openExternal(details.url);
  return { action: 'deny' };
});
```

`shell.openExternal` will attempt to open any URL including `file://`, `smb://`, or `steam://`. A renderer XSS could trigger `window.open('file:///etc/passwd')` and have it opened by the OS file handler.

**Fix:**
```ts
win.webContents.setWindowOpenHandler((details) => {
  const url = new URL(details.url);
  if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:') {
    shell.openExternal(details.url);
  }
  return { action: 'deny' };
});
```

---

## LOW / INFORMATIONAL

### L1 — Argon2id parameters are at the lower bound for a high-sensitivity application

**Location:** `src/main/utils.ts`, line 15

```ts
memoryCost: 65536,   // 64 MiB
timeCost: 3,
parallelism: 1,
```

These meet the OWASP minimum. OWASP's "high security" profile recommends `m=128 MiB`, `t=4`. For a tool protecting journalist-source relationships, the additional ~300 ms of unlock latency is a reasonable trade-off.

**Recommendation:** Increase to `memoryCost: 131072`, `timeCost: 4`.

---

### L2 — Salt is 16 bytes (128 bits) — at the minimum; 32 bytes preferred

**Location:** `src/main/ipc/setup.ts`, line 26

```ts
const salt = crypto.randomBytes(16);
```

128-bit salts meet OWASP requirements. NIST SP 800-132 recommends 32 bytes. Easy change.

---

### L3 — SQLCipher parameters not explicitly documented in code

**Location:** `src/main/database/index.ts`

The code sets `cipher='sqlcipher'` and uses raw-key mode. SQLCipher4 defaults (AES-256-CBC, HMAC-SHA512, 4096-byte pages) are used implicitly. Explicitly setting and documenting `cipher_page_size`, `kdf_iter`, and `cipher_hmac_algorithm` makes the configuration auditable across library upgrades.

---

### L4 — No image validation on screenshot POST body

**Location:** `src/main/http-server.ts`, line 137

The `/screenshot` endpoint accepts any binary payload up to 5 MB after token authentication. No `Content-Type` check and no magic-byte validation at the ingestion point. `detectMimeType()` in `screenshots.ts` only checks 4 bytes and falls back to `image/jpeg`.

**Recommendation:** Validate `Content-Type: image/*` and first 4 bytes match PNG (`\x89PNG`) or JPEG (`\xFF\xD8\xFF`) magic before storing.

---

### L5 — No size guard on backup file read

**Location:** `src/main/ipc/backup.ts`, line 64

```ts
const compressed = await fs.readFile(filePaths[0]);
```

No `fs.stat()` check before reading. A multi-gigabyte file will be entirely buffered in memory before format validation. Add a stat check and reject files above a reasonable maximum (e.g., 250 MB).

---

### L6 — Shared project payload includes the creator's filesystem path in cleartext

**Location:** `src/main/sync/payload.ts`, line 9

```ts
const payload: SetupPayload = { v: 1, name, description, path: filePath, key: keyBytes.toString('base64') };
```

The `path` field contains the creator's local filesystem path (e.g., `/Users/alice/Dropbox/project-name-sourcerer.db`), revealing their username and directory structure to all collaborators and anyone who intercepts the payload. The 32-byte key is also in the payload — if intercepted, the shared DB is fully compromised.

**Recommendation:** Remove the `path` field from the payload (the joining user locates the file via a file-picker dialog). Indicate in the UI that the payload is sensitive and should not be shared over insecure channels.

---

### L7 — RSS feed URLs fetched without SSRF mitigations

**Location:** `src/main/sync/rss-poller.ts`, line 52

```ts
const feed = await parser.parseURL(rssUrl);
```

`rssUrl` is a journalist-entered URL stored in the DB. No scheme validation or IP-range blocking is applied. A malicious collaborator could inject an `rss_url` pointing to an internal network service via shared DB sync.

**Recommendation:** Validate that `rssUrl` uses `https://` or `http://`, and consider blocking RFC-1918 private address ranges.

---

### L8 — `console.error` in screenshots handler logs filesystem paths to Electron log files

**Location:** `src/main/ipc/screenshots.ts`, line 101

```ts
console.error('[screenshots:load] failed:', err);
```

Electron writes console output to `userData/logs/`. Error objects may include the full filesystem path of encrypted screenshot files. Remove in production builds.

---

### L9 — Electron ASAR integrity bypass (build/distribution concern)

`npm audit` reports HIGH for `electron: ^32.0.0` (ASAR Integrity Bypass). Fix: upgrade Electron and enable ASAR integrity checking in `electron-builder` config.

---

### L10 — `tar` and `make-fetch-happen` HIGH — dev dependencies only

`npm audit` reports HIGH for `tar` (path traversal) and `make-fetch-happen` (via `@electron/rebuild`). Both are in the build toolchain only, not the runtime bundle. Update the dev toolchain as a matter of hygiene.

---

## Full Finding Index

| ID | Severity | Title | File |
|---|---|---|---|
| H1 | **High** | CORS wildcard exposes session token to any browser tab | `src/main/http-server.ts:39` |
| H2 | **High** | Backup restore overwrites DB without validation; no integrity check; no size cap | `src/main/ipc/backup.ts:56` |
| H3 | **High** | `xlsx` prototype pollution — runtime dependency | `package.json` |
| H4 | **High** | `sandbox: false` — OS renderer sandbox disabled | `src/main/index.ts:47` |
| M1 | Medium | Panic wipe uses `unlink()` only; WAL, screenshots, shared DBs, logs survive | `src/main/ipc/audit.ts:27` |
| M2 | Medium | Derived key stored as immutable JS string; cannot be zeroed on lock | `src/main/database/index.ts:7` |
| M3 | Medium | `change-password` doesn't update `activeKeyHex`; screenshot decryption breaks post-rekey | `src/main/ipc/settings.ts:221` |
| M4 | Medium | DB and salt files created without restricting permissions (umask → 0644) | `src/main/ipc/setup.ts:28` |
| M5 | Medium | Auto-lock does not close shared DB connections | `src/main/auto-lock.ts:38` |
| M6 | Medium | Auto-lock: 60-second granularity; no OS idle or blur hook | `src/main/auto-lock.ts:23` |
| M7 | Medium | Wayback Machine archiving exfiltrates journalist research silently | `src/main/ipc/contacts.ts:31` |
| M8 | Medium | `setWindowOpenHandler` calls `shell.openExternal` without URL scheme validation | `src/main/index.ts:55` |
| L1 | Low | Argon2id parameters at minimum; increase for high-sensitivity use | `src/main/utils.ts:15` |
| L2 | Low | Salt is 16 bytes; 32 bytes preferred | `src/main/ipc/setup.ts:26` |
| L3 | Info | SQLCipher parameters not explicitly documented in code | `src/main/database/index.ts` |
| L4 | Low | No image magic-byte validation on screenshot POST | `src/main/http-server.ts:137` |
| L5 | Low | No file size cap before reading backup file | `src/main/ipc/backup.ts:64` |
| L6 | Low | Shared project payload contains cleartext filesystem path and shared key | `src/main/sync/payload.ts:9` |
| L7 | Low | RSS `parseURL` lacks SSRF mitigations | `src/main/sync/rss-poller.ts:52` |
| L8 | Info | `console.error` logs filesystem paths to Electron log files | `src/main/ipc/screenshots.ts:101` |
| L9 | Info | Electron ASAR integrity bypass — upgrade Electron and enable ASAR integrity | `package.json` |
| L10 | Info | `tar`/`make-fetch-happen` HIGH — dev-only, not runtime | `package.json` |

---

## Recommended Fix Priority

**Before any distribution:**
1. **H1** — CORS wildcard / token exfiltration (only remotely exploitable finding)
2. **M3** — Password-change `activeKeyHex` staleness (silent data corruption)
3. **M4** — File permissions 0644 → 0600

**Before wider use:**
4. **H2** — Backup restore validation + size cap
5. **H4** — Enable `sandbox: true` for renderer
6. **M1** — Panic wipe: overwrite before unlink; clear WAL, screenshots, logs
7. **M5** — Close shared DBs on auto-lock
8. **M7** — Make Wayback archiving opt-in
9. **H3** — Migrate off `xlsx` to `exceljs`

**Hardening / informational:**
10. M2, M6, M8, L1–L7
