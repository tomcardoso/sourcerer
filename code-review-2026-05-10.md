# Sourcerer Code Review
**Date:** 2026-05-10
**Scope:** Full codebase — bugs, inefficiencies, and verbosity
**Note:** No changes made — findings and recommendations only.

---

## Bugs

### B1 — Leftover "Hello world ·" debug text in ContactDetail

**File:** `src/renderer/src/contacts/ContactDetail.tsx`, line 52

```tsx
<div className="view-kicker">
  Hello world  ·
</div>
```

This placeholder string is rendered in the contact detail panel header above every contact name. It is visible to users. It should be removed or replaced with the intended content (likely the contact's organisation or a breadcrumb).

---

### B2 — `memberships:set-reporters` writes without a transaction

**File:** `src/main/ipc/contacts.ts` (inside `memberships:set-reporters` handler)

```ts
db.prepare('DELETE FROM membership_reporters WHERE membership_id = ?').run(membershipId);
const insert = db.prepare('INSERT OR IGNORE INTO membership_reporters ...');
for (const r of reporters) {
  insert.run(membershipId, r.email, r.name);
}
```

The `DELETE` and the loop of `INSERT`s are not wrapped in a transaction. If the process crashes or the DB connection drops mid-loop, the old reporters have been deleted but only some new ones have been written, leaving the row in a partial state. Wrap in `db.transaction(() => { ... })()`.

---

### B3 — `pendingScreenshots` Map accumulates entries indefinitely

**File:** `src/main/http-server.ts`, lines 6–7 and the `/screenshot` handler (~line 138)

```ts
const pendingScreenshots = new Map<string, { buf: Buffer; tabUrl: string | null }>();
```

Screenshots are added to this Map when the extension POSTs one, and removed when `consumePendingScreenshot()` is called. But if the user dismisses the screenshot modal without assigning, or the modal is never shown (e.g., the window is not focusable), the entry is never consumed and stays in the Map for the lifetime of the process. Over a long session with many screenshots, this leaks memory (each entry holds a 5 MB Buffer). Add a TTL eviction, e.g., after 5 minutes or a fixed cap on the number of pending entries.

---

### B4 — `dedup.ts` Pass 2 inner loop continues after `a` is paired

**File:** `src/main/dedup.ts`, around line 120

```ts
for (let i = 0; i < unpaired.length; i++) {
  for (let j = i + 1; j < unpaired.length; j++) {
    const a = unpaired[i];
    const b = unpaired[j];
    if (pairedIds.has(a.id) || pairedIds.has(b.id)) continue;  // <—
    if (jaroWinkler(a.name, b.name) >= 0.95) {
      pairs.push({ a, b, reason: 'name' });
      pairedIds.add(a.id);
      pairedIds.add(b.id);
    }
  }
}
```

Once `a` is paired (i.e., added to `pairedIds` at some `j`), the inner loop continues iterating over remaining `j` values, hitting the `pairedIds.has(a.id)` guard on every subsequent iteration. Add `break` after `pairedIds.add(b.id)` to exit the inner loop immediately once `a` is consumed.

**Fix:**
```ts
if (jaroWinkler(a.name, b.name) >= 0.95) {
  pairs.push({ a, b, reason: 'name' });
  pairedIds.add(a.id);
  pairedIds.add(b.id);
  break;  // a is consumed; no point comparing further j values
}
```

---

### B5 — `contacts:get-duplicates` ignores `cachedPairs` and always re-scans

**File:** `src/main/ipc/contacts.ts`, near the end of `registerContactHandlers`

```ts
ipcMain.handle('contacts:get-duplicates', (): DuplicatePair[] => {
  const db = getDatabase();
  const contacts = loadDedupContacts(db);
  cachedPairs = findDuplicatePairs(contacts);   // overwrites cache
  return cachedPairs;                            // then returns it
});
```

The handler unconditionally runs the full O(n²) scan. The `cachedPairs` module-level variable is populated by `runDedupScan()` (called after every contact mutation) but is never *read* from in this handler — it's only overwritten. The intent appears to be that opening the dedup modal should return fresh data, but the cache populated by background scans is unused. Either return `cachedPairs` directly (if freshness is acceptable) or remove the variable and document that this handler is always live. As written, the two code paths are confusing and the `cachedPairs` write in this handler races with the background scan.

---

## Performance & Efficiency

### P1 — `db.prepare()` called inside a loop in `contacts:check-collision`

**File:** `src/main/ipc/contacts.ts` (inside `contacts:check-collision` handler)

```ts
for (const rawEmail of emails.filter(Boolean)) {
  const email = normalizeEmail(rawEmail);
  const row = excludeId
    ? db.prepare(`SELECT c.name ... WHERE ce.email = ? AND ce.contact_id != ? LIMIT 1`).get(email, excludeId)
    : db.prepare(`SELECT c.name ... WHERE ce.email = ? LIMIT 1`).get(email);
```

`db.prepare()` compiles the SQL string into a statement object. Calling it on every loop iteration (for each email, then for each phone) re-compiles the same two queries repeatedly. Prepare both variants once, before the loop, and call `.get()` on the prepared statement inside the loop.

---

### P2 — Filter and sort chains run in the render body without memoisation

**Files:** `src/renderer/src/views/AllContacts.tsx` (~line 155), `src/renderer/src/views/ProjectView.tsx` (~line 330)

Both views have a `let displayed = contacts/rows; ... displayed = displayed.filter(...)` chain directly in the component function body. This chain re-runs on every render, including renders triggered by unrelated state changes (e.g., a checkbox toggle, a modal open). Wrapping with `useMemo` on `[contacts/rows, filters, sort, now]` would prevent unnecessary recomputation on large contact lists.

**Example fix for AllContacts:**
```ts
const displayed = useMemo(() => {
  let result = contacts;
  if (filters.name) { ... }
  // ... rest of filter chain
  if (sort.key) { ... }
  return result;
}, [contacts, filters, sort]);
```

---

### P3 — `contacts.find()` is O(n) per duplicate found in dedup

**File:** `src/main/dedup.ts`, Pass 1 and Pass 1b

```ts
const a = contacts.find((x) => x.id === existing)!;
```

This linear scan runs once per duplicate email/phone found. With a large contacts list this is O(n) per pair. Build a `Map<string, DedupContact>` once before the loops:

```ts
const contactById = new Map(contacts.map((c) => [c.id, c]));
```

Then replace `contacts.find(...)` with `contactById.get(existing)!`.

---

### P4 — `loadDedupContacts` makes three separate DB round-trips

**File:** `src/main/dedup.ts`, lines 6–40

Three separate `db.prepare(...).all()` calls fetch contacts, emails, and phones. The contacts and their emails can be fetched in two queries (the contact list, plus a single `SELECT contact_id, email FROM contact_emails` grouped or joined). This is a minor issue at typical scale but worth noting as a pattern.

---

### P5 — `handleRegenerate` in ProjectView fetches all projects to find one

**File:** `src/renderer/src/views/ProjectView.tsx`, inside `handleRegenerate`

```ts
const projects = await window.sourcerer.listProjects();
const updated = projects.find((p) => p.id === project.id);
if (updated) onProjectUpdated(updated);
```

After regenerating a shared project, the view fetches the entire project list just to get the updated record for the current project. The `projects:regenerateShared` IPC handler could return the updated `Project` row directly, or a `projects:get(id)` handler would allow fetching a single project without the full list.

---

### P6 — `SettingsView.tsx` calls `getCountries()` without memoisation

**File:** `src/renderer/src/views/SettingsView.tsx`, top of component

```ts
const countries = useMemo(() => getCountries(), []);
```

Actually — this *is* already using `useMemo`. Mark as not an issue. ✓

---

## Verbosity & DRY Violations

### V1 — `fmtDate` is copy-pasted between two views

**Files:** `src/renderer/src/views/AllContacts.tsx` line ~38, `src/renderer/src/views/ProjectView.tsx` line ~70

Identical function body:
```ts
function fmtDate(ts: number | null): string {
  if (ts === null) return 'Never';
  const d = new Date(ts * 1000);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
```

Extract to `src/renderer/src/utils/format.ts` (or similar) and import from both views. `ProjectView` also has `fmtOpened` and `fmtRelative` that are candidates for the same file.

---

### V2 — ~20 nearly-identical try/catch migration blocks in `database/index.ts`

**File:** `src/main/database/index.ts`, throughout `openRaw()`

Every schema migration follows the same pattern:
```ts
try {
  db.exec('ALTER TABLE x ADD COLUMN y ...');
} catch {}
```

This is repeated ~20 times with no variation in structure, adding ~60 lines of boilerplate. A one-line helper eliminates all of them:

```ts
function tryMigrate(db: Database.Database, sql: string): void {
  try { db.exec(sql); } catch { /* column/table already exists */ }
}
```

Then each block becomes one line: `tryMigrate(db, 'ALTER TABLE users ADD COLUMN ...')`.

---

### V3 — `contacts:check-collision` duplicates two near-identical SQL queries per field type

**File:** `src/main/ipc/contacts.ts`, inside `contacts:check-collision`

For emails, there are two almost-identical prepared queries — one with `AND ce.contact_id != ?` and one without. Same pattern for phones. Four queries total, differing only by one clause. A single parameterised query with an always-true fallback (e.g., `AND (? IS NULL OR ce.contact_id != ?)`) would collapse all four into two.

---

### V4 — Extension approval modal is inline JSX with all inline styles in `App.tsx`

**File:** `src/renderer/src/App.tsx`, lines ~47–82

The extension approval dialog is a ~35-line block of JSX with all styles inlined. The pattern elsewhere (e.g., all modal components) is to use `.css` files and `className`. This block should be extracted to an `ExtensionApprovalModal` component with a CSS class.

---

### V5 — Multiple IPC handlers use `SELECT *` when only a few columns are needed

**Files:** various in `src/main/ipc/`

Examples:
- `app:get-user`: `db.prepare('SELECT * FROM users WHERE id = 1')` — the `User` type has 15+ fields; the handler returns all of them, which is fine, but the pattern is repeated for fetching only one or two fields.
- `interaction-log:add`: `db.prepare('SELECT * FROM users WHERE id = 1').get()` — only uses `first_name`, `last_name`, and `email`.
- `projects:createShared`, `projects:convertToShared`: `db.prepare('SELECT * FROM users WHERE id = 1').get()` — only uses `first_name`, `last_name`, `email`.

`SELECT *` returning unused columns is low cost for SQLite single-row lookups, but for correctness and readability the narrow cases should select only what they use.

---

### V6 — `bulk-bar` click-outside / Escape handling is duplicated between `AllContacts.tsx` and the export menu in `ProjectView.tsx`

**Files:** `src/renderer/src/views/AllContacts.tsx` (~line 104), `src/renderer/src/views/ProjectView.tsx` (~line 147)

Both implement an identical `useEffect` that adds `mousedown` and `keydown` listeners to close a floating menu when clicking outside or pressing Escape, cleaned up on unmount. This is a standard pattern that could be extracted to a `useClickOutside(ref, onClose, enabled)` hook.

---

### V7 — Reminder checker and outreach checker share structural boilerplate

**Files:** `src/main/sync/reminder-checker.ts`, `src/main/sync/outreach-checker.ts`

Both modules maintain a `notifiedThisSession = new Set<string>()`, a `clearXNotificationCache()` export, and early-return guards on `isDatabaseOpen()`. The shared pattern could be codified but the files are small enough that this is only informational.

---

## Minor / Informational

### I1 — `now` is recomputed on every render in both list views

**Files:** `AllContacts.tsx`, `ProjectView.tsx`

```ts
const now = Math.floor(Date.now() / 1000);
```

This is in the render body and recalculates on every render. For the date-filter predicates, the value is used for "not contacted in 30/90 days" comparisons where a few-second staleness is irrelevant. A `useMemo` with a dependency of `[]` (or recomputed on a 60-second interval) would be more accurate, but in practice the current approach is harmless for typical interaction patterns.

---

### I2 — `AppShell.tsx` — `refreshOverdue` is not wrapped in `useCallback`, causing a new reference per render

**File:** `src/renderer/src/shell/AppShell.tsx`

```ts
async function refreshOverdue() {
  const now = Math.floor(Date.now() / 1000);
  const all = await window.sourcerer.listAllReminders();
  setOverdueReminders(all.filter((r) => r.due_date < now).length);
}
```

This function is passed to `window.sourcerer.onRemindersChanged(refreshOverdue)` inside a `useEffect` with `[]` deps, so the stale closure captured at mount is used throughout the session — which works because `window.sourcerer` is stable. However, it's also called directly from `useEffect([], [])`, so the first-call reference is fine. If `refreshOverdue` ever depended on component state, the stale closure would be a bug. Wrap with `useCallback([], [])` to make the intent explicit.

---

### I3 — `settings.ts` — `reorder()` interpolates table name into SQL

**File:** `src/main/ipc/settings.ts`, the `reorder()` helper

```ts
function reorder(table: 'status_options' | 'priority_options', ...) {
  const all = db.prepare(`SELECT id, sort_order FROM ${table} ORDER BY sort_order ASC`).all();
```

The `table` parameter is typed as a literal union so there is no injection risk here. However, it's the only place in the codebase where a value is interpolated into SQL, which breaks the "all queries are parameterised" rule. SQLite doesn't support parameterised table names, but the intent can be expressed more explicitly by branching on the two known values:

```ts
const stmt = table === 'status_options'
  ? db.prepare('SELECT id, sort_order FROM status_options ORDER BY sort_order ASC')
  : db.prepare('SELECT id, sort_order FROM priority_options ORDER BY sort_order ASC');
```

This removes the string interpolation pattern entirely.

---

### I4 — `import.ts` uses a hand-rolled CSV parser

**File:** `src/main/ipc/import.ts`, lines 13–55

The custom `parseCsv()` implementation handles quoted fields and escaped quotes correctly for common cases, but hand-rolled parsers for CSV are notoriously fragile (multi-line quoted fields, BOM characters, Windows-style CRLF inside quotes, etc.). The project already depends on `rss-parser`; adding a small, well-tested CSV library (e.g., `papaparse` or `csv-parse`) would remove this surface area entirely.

---

### I5 — `ContactDetail.tsx` fetches `listProjects`, `listStatusOptions`, and `listPriorityOptions` on every contact open

**File:** `src/renderer/src/contacts/ContactDetail.tsx`, inside `useEffect` on `[contactId, reload]`

```ts
window.sourcerer.listProjects().then(setAllProjects);
window.sourcerer.listStatusOptions().then(setStatusOptions);
window.sourcerer.listPriorityOptions().then(setPriorityOptions);
```

These three lists are already loaded in `AppShell` and `ProjectView`. Passing them as props would eliminate three IPC round-trips per contact open. This is a minor concern since the calls are fast local SQLite reads, but it creates redundant network-like traffic over IPC.

---

## Summary Table

| ID | Category | File | Description |
|---|---|---|---|
| B1 | Bug | `contacts/ContactDetail.tsx:52` | "Hello world ·" leftover debug text visible to users |
| B2 | Bug | `ipc/contacts.ts` | `memberships:set-reporters` not wrapped in a transaction |
| B3 | Bug | `http-server.ts` | `pendingScreenshots` Map leaks memory; no TTL or size cap |
| B4 | Bug | `dedup.ts` | Pass 2 inner loop continues after `a` is paired; add `break` |
| B5 | Bug | `ipc/contacts.ts` | `cachedPairs` in `contacts:get-duplicates` is written but never read |
| P1 | Performance | `ipc/contacts.ts` | `db.prepare()` called inside email/phone collision loops |
| P2 | Performance | `AllContacts.tsx`, `ProjectView.tsx` | Filter/sort chain runs unmemoised on every render |
| P3 | Performance | `dedup.ts` | `contacts.find()` is O(n) per pair; build a contact-by-id Map |
| P4 | Performance | `dedup.ts` | Three separate DB queries in `loadDedupContacts` |
| P5 | Performance | `ProjectView.tsx` | `handleRegenerate` fetches all projects to find one |
| V1 | Verbosity | `AllContacts.tsx`, `ProjectView.tsx` | `fmtDate` copy-pasted; extract to shared util |
| V2 | Verbosity | `database/index.ts` | ~20 identical try/catch migration blocks; extract `tryMigrate()` helper |
| V3 | Verbosity | `ipc/contacts.ts` | `check-collision` has four near-identical SQL queries |
| V4 | Verbosity | `App.tsx` | Extension approval modal is inline JSX; should be a component |
| V5 | Verbosity | multiple `ipc/*.ts` | `SELECT *` used when only 2–3 fields are accessed |
| V6 | Verbosity | `AllContacts.tsx`, `ProjectView.tsx` | Click-outside/Escape pattern duplicated; extract `useClickOutside` hook |
| V7 | Verbosity | `reminder-checker.ts`, `outreach-checker.ts` | Shared boilerplate between both checkers |
| I1 | Info | `AllContacts.tsx`, `ProjectView.tsx` | `now` recomputed on every render |
| I2 | Info | `AppShell.tsx` | `refreshOverdue` not wrapped in `useCallback` |
| I3 | Info | `ipc/settings.ts` | Only place in codebase that interpolates a value into SQL |
| I4 | Info | `ipc/import.ts` | Hand-rolled CSV parser; consider `papaparse` |
| I5 | Info | `contacts/ContactDetail.tsx` | Fetches three lists via IPC on every contact open |
