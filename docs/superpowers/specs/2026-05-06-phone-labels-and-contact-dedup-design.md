# Phone Labels & Contact Deduplication — Design Spec

Date: 2026-05-06

## Overview

Two independent features:

1. **Phone labels** — an optional free-text label on each phone number (e.g. "cell", "home", "disconnected")
2. **Contact deduplication** — ambient badge showing duplicate pair count, on-demand merge flow

---

## Feature 1: Phone Labels

### Schema

Add a nullable `label TEXT` column to `contact_phones` in both `schema.ts` (local) and `shared-schema.ts` via `ALTER TABLE`:

```sql
ALTER TABLE contact_phones ADD COLUMN label TEXT;
```

### Types

- `ContactPhone`: add `label: string | null`
- `CreateContactInput.phones`: change from `string[]` to `Array<{ phone: string; label?: string }>`
- `UpdateContactInput.phones`: same change

### Edit UI

Replace the plain `DynamicList` for phones in `GlobalTab.tsx` with a `PhoneLabelRow` component. Each row has:
- A wider phone number input (existing placeholder `+1 555 000 0000`)
- A narrower label input (placeholder `label…`, optional)
- The existing remove (×) button

Collision checking continues to operate on the phone value only, unchanged.

### View UI

Display label inline after the phone number in muted text: `+1 555 000 0000 · cell`. If label is absent, render the number alone as before.

### IPC & import

- `contacts.ts` save logic (create/update) writes `{ phone, label }` pairs to `contact_phones`
- CSV import produces phones with `label = null` — no change to import format or schema
- Shared sync schema mirrors the same `label` column

---

## Feature 2: Contact Deduplication

### Detection module

New file: `src/main/dedup.ts`

The detection module is called from the main process and queries the DB directly via a dedicated function to build a `DedupContact[]` array — a lightweight type with the fields needed for both detection and merge UI display:

```typescript
interface DedupContact {
  id: string;
  name: string;
  organization: string | null;
  notes: string | null;
  emails: string[];
  phones: string[];
  projectCount: number;
}
```

Pure function: `findDuplicatePairs(contacts: DedupContact[]): DuplicatePair[]`

**Pass 1 — Exact signals (O(n)):**
Build inverted indexes: `email → contactId[]` and `phone → contactId[]`. Any pair sharing at least one email or phone is a strong duplicate (`reason: 'email' | 'phone'`).

**Pass 2 — Fuzzy name (O(n²) over remaining contacts):**
Over contacts with no exact overlap with anyone, run pairwise Jaro-Winkler name comparison. Pairs scoring ≥ 0.88 are flagged (`reason: 'name'`). Threshold catches "Jon Smith / John Smith" without false-positives like "Jane Smith / John Smith". Use a lightweight JS Jaro-Winkler implementation (e.g. `talisman` or a small inline implementation — no heavy dependency needed).

**Output:** `DuplicatePair[]` sorted exact-first then fuzzy. Greedy deduplication ensures each contact appears in at most one pair.

```typescript
export interface DuplicatePair {
  a: DedupContact;
  b: DedupContact;
  reason: 'email' | 'phone' | 'name';
}
```

### Scan lifecycle

- Runs after unlock (startup)
- Runs after any contact create, update, or delete
- Result cached in memory in the main process
- IPC handler `getDuplicatePairs()` returns the cached array
- Main process pushes updated count to renderer via existing push-event pattern after each scan

### Badge

A clickable pill in the All Contacts view header, visible only when count > 0:

> `2 possible duplicates`

Clicking opens the Dedup modal.

### Dedup modal

Same full-screen overlay pattern as `ImportCsvModal`. Shows one pair at a time.

**Header:** `Reviewing pair 1 of 3` + reason tag ("shared email" / "shared phone" / "similar name")

**Body:** Two-column side-by-side view of both contacts showing:
- Name
- Organization
- Emails (list)
- Phones (list)
- Notes (truncated)
- Projects (count)

Fields that differ between the two contacts are visually highlighted.

**Actions:**
- **Keep left** — discard right contact
- **Keep right** — discard left contact
- **Merge both** — union merge, left wins for name/org/notes (longer non-empty value preferred)
- **Skip** — advance without acting; skipped pairs do not reappear until the next scan

After each Keep/Merge action, the resolved pair is removed from the in-memory list. A full re-scan runs when the modal closes.

### Merge logic

The "loser" contact's data is folded into the "winner" before the loser is deleted:

| Data | Behaviour |
|---|---|
| Emails | All unique values appended to winner |
| Phones | All unique values appended to winner |
| Links | All unique URLs appended to winner |
| Project memberships | Reassigned to winner's `contact_id`. If both contacts share a project, winner's membership is kept and loser's interaction logs for that membership are reassigned to winner's membership. |
| Scratchpad drafts | `contact_id` updated to winner |
| Reminders | `contact_id` updated to winner |
| Alert RSS | Kept on winner if winner has none; discarded if winner already has one |
| Name / org / notes | Winner's value used if non-empty; otherwise loser's value used (longer non-empty value wins for Merge Both) |

Loser contact record is deleted after all reassignments. SQLite cascade handles any remaining child rows.

### Non-destructiveness guarantee

No interaction logs, project memberships, scratchpad drafts, or reminders are deleted during a merge. Only the loser contact row and its deduplicated child rows (emails/phones/links already present on winner) are removed.

---

## Out of scope

- Bulk auto-merge without user review
- Persisting duplicate pairs to the DB (in-memory cache is sufficient)
- Fuzzy email/phone matching (exact only for those signals)
- Dedup during CSV import
