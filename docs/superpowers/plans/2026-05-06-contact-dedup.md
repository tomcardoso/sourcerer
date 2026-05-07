# Contact Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface duplicate contact pairs as an ambient badge on the All Contacts view and provide a side-by-side merge flow with Keep Left / Keep Right / Merge Both / Skip actions.

**Architecture:** A pure `dedup.ts` module in main process handles detection (inverted email/phone index + Jaro-Winkler fuzzy name pass) and merge logic. The main process caches pairs in memory and pushes the count to the renderer after each contact change. The renderer shows a badge in the All Contacts header that opens a `DedupModal` showing one pair at a time.

**Tech Stack:** TypeScript, better-sqlite3-multiple-ciphers, React 18, Electron IPC push events (BrowserWindow.getAllWindows), uuid

**No test framework is set up** — verification uses `npm run typecheck` and manual app inspection.

---

### Task 1: Add DedupContact and DuplicatePair types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add types to `src/shared/types.ts`**

Append to the end of `src/shared/types.ts`:

```typescript
export interface DedupContact {
  id: string;
  name: string;
  organization: string | null;
  notes: string | null;
  emails: string[];
  phones: string[];
  projectCount: number;
}

export interface DuplicatePair {
  a: DedupContact;
  b: DedupContact;
  reason: 'email' | 'phone' | 'name';
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(dedup): add DedupContact and DuplicatePair types"
```

---

### Task 2: Create dedup.ts — detection algorithm and merge logic

**Files:**
- Create: `src/main/dedup.ts`

- [ ] **Step 1: Create `src/main/dedup.ts` with full content**

```typescript
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3-multiple-ciphers';
import type { DedupContact, DuplicatePair } from '@shared/types';

export function loadDedupContacts(db: Database.Database): DedupContact[] {
  const contacts = db
    .prepare(
      `SELECT c.id, c.name, c.organization, c.notes,
              (SELECT COUNT(*) FROM project_memberships pm WHERE pm.contact_id = c.id) AS project_count
       FROM contacts c
       ORDER BY c.name ASC`,
    )
    .all() as Array<{
    id: string;
    name: string;
    organization: string | null;
    notes: string | null;
    project_count: number;
  }>;

  const emailRows = db
    .prepare('SELECT contact_id, email FROM contact_emails')
    .all() as Array<{ contact_id: string; email: string }>;

  const phoneRows = db
    .prepare('SELECT contact_id, phone FROM contact_phones')
    .all() as Array<{ contact_id: string; phone: string }>;

  const emailsByContact = new Map<string, string[]>();
  for (const row of emailRows) {
    const arr = emailsByContact.get(row.contact_id) ?? [];
    arr.push(row.email);
    emailsByContact.set(row.contact_id, arr);
  }

  const phonesByContact = new Map<string, string[]>();
  for (const row of phoneRows) {
    const arr = phonesByContact.get(row.contact_id) ?? [];
    arr.push(row.phone);
    phonesByContact.set(row.contact_id, arr);
  }

  return contacts.map((c) => ({
    id: c.id,
    name: c.name,
    organization: c.organization,
    notes: c.notes,
    emails: emailsByContact.get(c.id) ?? [],
    phones: phonesByContact.get(c.id) ?? [],
    projectCount: c.project_count,
  }));
}

function jaroWinkler(a: string, b: string): number {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  if (s1 === s2) return 1;

  const matchDist = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);
  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);
  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

export function findDuplicatePairs(contacts: DedupContact[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const pairedIds = new Set<string>();

  // Pass 1: exact email signals
  const emailIndex = new Map<string, string>();
  for (const c of contacts) {
    for (const email of c.emails) {
      const existing = emailIndex.get(email);
      if (existing && existing !== c.id && !pairedIds.has(existing) && !pairedIds.has(c.id)) {
        const a = contacts.find((x) => x.id === existing)!;
        pairs.push({ a, b: c, reason: 'email' });
        pairedIds.add(existing);
        pairedIds.add(c.id);
      } else if (!existing) {
        emailIndex.set(email, c.id);
      }
    }
  }

  // Pass 1b: exact phone signals
  const phoneIndex = new Map<string, string>();
  for (const c of contacts) {
    for (const phone of c.phones) {
      const existing = phoneIndex.get(phone);
      if (existing && existing !== c.id && !pairedIds.has(existing) && !pairedIds.has(c.id)) {
        const a = contacts.find((x) => x.id === existing)!;
        pairs.push({ a, b: c, reason: 'phone' });
        pairedIds.add(existing);
        pairedIds.add(c.id);
      } else if (!existing) {
        phoneIndex.set(phone, c.id);
      }
    }
  }

  // Pass 2: fuzzy name matching over unpaired contacts
  const unpaired = contacts.filter((c) => !pairedIds.has(c.id));
  for (let i = 0; i < unpaired.length; i++) {
    for (let j = i + 1; j < unpaired.length; j++) {
      const a = unpaired[i];
      const b = unpaired[j];
      if (pairedIds.has(a.id) || pairedIds.has(b.id)) continue;
      if (jaroWinkler(a.name, b.name) >= 0.88) {
        pairs.push({ a, b, reason: 'name' });
        pairedIds.add(a.id);
        pairedIds.add(b.id);
      }
    }
  }

  return pairs;
}

export function mergeContacts(
  db: Database.Database,
  winnerId: string,
  loserId: string,
  strategy: 'keep' | 'merge',
): void {
  const doMerge = db.transaction(() => {
    if (strategy === 'merge') {
      const winner = db
        .prepare('SELECT name, organization, notes FROM contacts WHERE id = ?')
        .get(winnerId) as { name: string; organization: string | null; notes: string | null };
      const loser = db
        .prepare('SELECT name, organization, notes FROM contacts WHERE id = ?')
        .get(loserId) as { name: string; organization: string | null; notes: string | null };

      const name = loser.name.length > winner.name.length ? loser.name : winner.name;
      const organization = !winner.organization
        ? loser.organization
        : !loser.organization
          ? winner.organization
          : loser.organization.length > winner.organization.length
            ? loser.organization
            : winner.organization;
      const notes = !winner.notes
        ? loser.notes
        : !loser.notes
          ? winner.notes
          : loser.notes.length > winner.notes.length
            ? loser.notes
            : winner.notes;

      db.prepare('UPDATE contacts SET name = ?, organization = ?, notes = ? WHERE id = ?').run(
        name,
        organization,
        notes,
        winnerId,
      );

      // Copy unique emails from loser to winner
      const winnerEmails = new Set<string>(
        (
          db
            .prepare('SELECT email FROM contact_emails WHERE contact_id = ?')
            .all(winnerId) as Array<{ email: string }>
        ).map((r) => r.email),
      );
      const loserEmails = db
        .prepare('SELECT email FROM contact_emails WHERE contact_id = ?')
        .all(loserId) as Array<{ email: string }>;
      const maxEmailOrder = (
        db
          .prepare('SELECT MAX(sort_order) AS m FROM contact_emails WHERE contact_id = ?')
          .get(winnerId) as { m: number | null }
      ).m ?? -1;
      let emailOffset = maxEmailOrder + 1;
      for (const row of loserEmails) {
        if (!winnerEmails.has(row.email)) {
          db.prepare(
            'INSERT INTO contact_emails (id, contact_id, email, sort_order) VALUES (?, ?, ?, ?)',
          ).run(uuidv4(), winnerId, row.email, emailOffset++);
        }
      }

      // Copy unique phones from loser to winner (including label)
      const winnerPhones = new Set<string>(
        (
          db
            .prepare('SELECT phone FROM contact_phones WHERE contact_id = ?')
            .all(winnerId) as Array<{ phone: string }>
        ).map((r) => r.phone),
      );
      const loserPhones = db
        .prepare('SELECT phone, label FROM contact_phones WHERE contact_id = ?')
        .all(loserId) as Array<{ phone: string; label: string | null }>;
      const maxPhoneOrder = (
        db
          .prepare('SELECT MAX(sort_order) AS m FROM contact_phones WHERE contact_id = ?')
          .get(winnerId) as { m: number | null }
      ).m ?? -1;
      let phoneOffset = maxPhoneOrder + 1;
      for (const row of loserPhones) {
        if (!winnerPhones.has(row.phone)) {
          db.prepare(
            'INSERT INTO contact_phones (id, contact_id, phone, label, sort_order) VALUES (?, ?, ?, ?, ?)',
          ).run(uuidv4(), winnerId, row.phone, row.label, phoneOffset++);
        }
      }

      // Copy unique links from loser to winner
      const winnerUrls = new Set<string>(
        (
          db
            .prepare('SELECT url FROM contact_links WHERE contact_id = ?')
            .all(winnerId) as Array<{ url: string }>
        ).map((r) => r.url),
      );
      const loserLinks = db
        .prepare('SELECT type, label, url FROM contact_links WHERE contact_id = ?')
        .all(loserId) as Array<{ type: string; label: string | null; url: string }>;
      const maxLinkOrder = (
        db
          .prepare('SELECT MAX(sort_order) AS m FROM contact_links WHERE contact_id = ?')
          .get(winnerId) as { m: number | null }
      ).m ?? -1;
      let linkOffset = maxLinkOrder + 1;
      for (const row of loserLinks) {
        if (!winnerUrls.has(row.url)) {
          db.prepare(
            'INSERT INTO contact_links (id, contact_id, type, label, url, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(uuidv4(), winnerId, row.type, row.label, row.url, linkOffset++);
        }
      }
    }

    // Reassign project memberships
    const loserMemberships = db
      .prepare('SELECT id, project_id FROM project_memberships WHERE contact_id = ?')
      .all(loserId) as Array<{ id: string; project_id: string }>;

    for (const membership of loserMemberships) {
      const winnerMembership = db
        .prepare('SELECT id FROM project_memberships WHERE contact_id = ? AND project_id = ?')
        .get(winnerId, membership.project_id) as { id: string } | undefined;

      if (winnerMembership) {
        // Move loser's interaction logs to winner's membership, then delete loser's membership
        db.prepare(
          'UPDATE interaction_log_entries SET membership_id = ? WHERE membership_id = ?',
        ).run(winnerMembership.id, membership.id);
        db.prepare('DELETE FROM project_memberships WHERE id = ?').run(membership.id);
      } else {
        db.prepare('UPDATE project_memberships SET contact_id = ? WHERE id = ?').run(
          winnerId,
          membership.id,
        );
      }
    }

    // Reassign scratchpad drafts and reminders
    db.prepare('UPDATE message_scratchpad_drafts SET contact_id = ? WHERE contact_id = ?').run(
      winnerId,
      loserId,
    );
    db.prepare('UPDATE reminders SET contact_id = ? WHERE contact_id = ?').run(winnerId, loserId);

    // Keep winner's alert RSS; copy loser's only if winner has none
    const winnerRss = db
      .prepare('SELECT id FROM contact_alert_rss WHERE contact_id = ?')
      .get(winnerId);
    if (!winnerRss) {
      db.prepare('UPDATE contact_alert_rss SET contact_id = ? WHERE contact_id = ?').run(
        winnerId,
        loserId,
      );
    }

    // Delete loser — cascades remaining child rows
    db.prepare('DELETE FROM contacts WHERE id = ?').run(loserId);
  });

  doMerge();
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors (types imported from `@shared/types` which was updated in Task 1).

- [ ] **Step 3: Commit**

```bash
git add src/main/dedup.ts
git commit -m "feat(dedup): add detection algorithm and merge logic"
```

---

### Task 3: IPC handlers — wire dedup into contacts.ts, preload, and env.d.ts

**Files:**
- Modify: `src/main/ipc/contacts.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`

- [ ] **Step 1: Add BrowserWindow import and dedup imports to `contacts.ts`**

At the top of `src/main/ipc/contacts.ts`, add to the electron import and add dedup imports:

Change:
```typescript
import { ipcMain } from 'electron';
```
To:
```typescript
import { ipcMain, BrowserWindow } from 'electron';
```

Add after the existing imports:
```typescript
import { loadDedupContacts, findDuplicatePairs, mergeContacts as mergeContactsDb } from '../dedup';
import type { DuplicatePair } from '@shared/types';
```

- [ ] **Step 2: Add the pair cache and `runDedupScan` helper in `contacts.ts`**

Add immediately after the import block, before `export function registerContactHandlers()`:

```typescript
let cachedPairs: DuplicatePair[] = [];

function runDedupScan(): void {
  try {
    const db = getDatabase();
    const contacts = loadDedupContacts(db);
    cachedPairs = findDuplicatePairs(contacts);
    const count = cachedPairs.length;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('contacts:duplicates-updated', count);
    }
  } catch {
    // DB not open yet — scan will run on next contact change
  }
}
```

- [ ] **Step 3: Add `contacts:get-duplicates` and `contacts:merge` IPC handlers**

Inside `registerContactHandlers()`, append before the closing `}`:

```typescript
  ipcMain.handle('contacts:get-duplicates', (): DuplicatePair[] => {
    const db = getDatabase();
    const contacts = loadDedupContacts(db);
    cachedPairs = findDuplicatePairs(contacts);
    return cachedPairs;
  });

  ipcMain.handle(
    'contacts:merge',
    (_, { winnerId, loserId, strategy }: { winnerId: string; loserId: string; strategy: 'keep' | 'merge' }): void => {
      mergeContactsDb(getDatabase(), winnerId, loserId, strategy);
      setImmediate(runDedupScan);
    },
  );
```

- [ ] **Step 4: Trigger re-scan after contact create, update, and delete**

In the `contacts:create` handler, add `setImmediate(runDedupScan);` immediately before `return { id, name: data.name.trim(), ... }`:

```typescript
    insert();
    setImmediate(runDedupScan);
    return { id, name: data.name.trim(), organization: data.organization?.trim() || null, projects: [] };
```

In the `contacts:update` handler, add `setImmediate(runDedupScan);` after `run();`:

```typescript
    run();
    setImmediate(runDedupScan);
```

In the `contacts:delete` handler, add `setImmediate(runDedupScan);` after the delete:

```typescript
  ipcMain.handle('contacts:delete', (_, id: string): void => {
    getDatabase().prepare('DELETE FROM contacts WHERE id = ?').run(id);
    setImmediate(runDedupScan);
  });
```

- [ ] **Step 5: Add dedup methods to `src/preload/index.ts`**

In `src/preload/index.ts`, add the following to the `sourcererApi` object, after the existing contacts section (after `checkCollision`):

```typescript
  // Dedup
  getDuplicatePairs: (): Promise<DuplicatePair[]> =>
    ipcRenderer.invoke('contacts:get-duplicates'),
  mergeContacts: (data: {
    winnerId: string;
    loserId: string;
    strategy: 'keep' | 'merge';
  }): Promise<void> => ipcRenderer.invoke('contacts:merge', data),
  onDuplicatePairsUpdated: (callback: (count: number) => void): (() => void) => {
    const handler = (_: unknown, count: number) => callback(count);
    ipcRenderer.on('contacts:duplicates-updated', handler);
    return () => ipcRenderer.removeListener('contacts:duplicates-updated', handler);
  },
```

Also add `DuplicatePair` to the existing import at the top of `src/preload/index.ts`:

```typescript
import type {
  // ... existing imports ...
  DuplicatePair,
} from '@shared/types';
```

- [ ] **Step 6: Add dedup types and methods to `src/renderer/src/env.d.ts`**

Add `DuplicatePair` to the import block at the top of `env.d.ts`:

```typescript
import type {
  // ... existing imports ...
  DuplicatePair,
} from '@shared/types';
```

Add to the `sourcerer` interface, after the Contacts section (after `checkCollision`):

```typescript
      // Dedup
      getDuplicatePairs: () => Promise<DuplicatePair[]>;
      mergeContacts: (data: {
        winnerId: string;
        loserId: string;
        strategy: 'keep' | 'merge';
      }) => Promise<void>;
      onDuplicatePairsUpdated: (callback: (count: number) => void) => () => void;
```

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/main/ipc/contacts.ts src/preload/index.ts src/renderer/src/env.d.ts
git commit -m "feat(dedup): wire IPC handlers, preload, and type declarations"
```

---

### Task 4: DedupModal component

**Files:**
- Create: `src/renderer/src/views/DedupModal.tsx`
- Create: `src/renderer/src/views/DedupModal.css`

- [ ] **Step 1: Create `src/renderer/src/views/DedupModal.css`**

```css
.dedup-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  width: 720px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.dedup-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.dedup-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
}

.dedup-reason {
  font-size: 11px;
  background: #eff6ff;
  color: var(--color-primary);
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.dedup-progress {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-muted);
}

.dedup-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.dedup-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.dedup-col-header {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: 10px;
}

.dedup-contact-card {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 12px;
  background: var(--color-bg);
}

.dedup-field {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  padding: 4px 6px;
  border-radius: 4px;
}

.dedup-field--diff {
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.dedup-field-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  width: 44px;
  flex-shrink: 0;
  padding-top: 2px;
}

.dedup-field-value {
  font-size: 13px;
  color: var(--color-text);
  line-height: 1.4;
  word-break: break-word;
}

.dedup-field-value--unique {
  font-style: italic;
  color: var(--color-primary);
}

.dedup-notes {
  max-height: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.dedup-actions {
  display: flex;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
  justify-content: flex-end;
}

.dedup-empty {
  font-size: 13px;
  color: var(--color-text-muted);
  padding: 20px 0;
  text-align: center;
}

.dedup-btn {
  height: 34px;
  padding: 0 14px;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font);
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}

.dedup-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dedup-btn--primary {
  background: var(--color-primary);
  color: #fff;
}

.dedup-btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.dedup-btn--secondary {
  background: #f3f4f6;
  color: var(--color-text);
}

.dedup-btn--secondary:hover:not(:disabled) {
  background: #e5e7eb;
}
```

- [ ] **Step 2: Create `src/renderer/src/views/DedupModal.tsx`**

```tsx
import { useState } from 'react';
import type { DedupContact, DuplicatePair } from '@shared/types';
import './DedupModal.css';
import '../contacts/AddContactModal.css';

interface Props {
  pairs: DuplicatePair[];
  onClose: () => void;
}

function reasonLabel(reason: DuplicatePair['reason']): string {
  if (reason === 'email') return 'shared email';
  if (reason === 'phone') return 'shared phone';
  return 'similar name';
}

function ContactCard({ contact, other }: { contact: DedupContact; other: DedupContact }) {
  const namesDiffer = contact.name !== other.name;
  const orgsDiffer = contact.organization !== other.organization;
  const notesDiffer = contact.notes !== other.notes;

  return (
    <div className="dedup-contact-card">
      <div className={`dedup-field ${namesDiffer ? 'dedup-field--diff' : ''}`}>
        <span className="dedup-field-label">Name</span>
        <span className="dedup-field-value">{contact.name}</span>
      </div>

      {(contact.organization || other.organization) && (
        <div className={`dedup-field ${orgsDiffer ? 'dedup-field--diff' : ''}`}>
          <span className="dedup-field-label">Org</span>
          <span className="dedup-field-value">{contact.organization || '—'}</span>
        </div>
      )}

      {contact.emails.length > 0 && (
        <div className="dedup-field">
          <span className="dedup-field-label">Email</span>
          <div>
            {contact.emails.map((e) => (
              <div
                key={e}
                className={`dedup-field-value ${!other.emails.includes(e) ? 'dedup-field-value--unique' : ''}`}
              >
                {e}
              </div>
            ))}
          </div>
        </div>
      )}

      {contact.phones.length > 0 && (
        <div className="dedup-field">
          <span className="dedup-field-label">Phone</span>
          <div>
            {contact.phones.map((p) => (
              <div
                key={p}
                className={`dedup-field-value ${!other.phones.includes(p) ? 'dedup-field-value--unique' : ''}`}
              >
                {p}
              </div>
            ))}
          </div>
        </div>
      )}

      {(contact.notes || other.notes) && (
        <div className={`dedup-field ${notesDiffer ? 'dedup-field--diff' : ''}`}>
          <span className="dedup-field-label">Notes</span>
          <span className="dedup-field-value dedup-notes">{contact.notes || '—'}</span>
        </div>
      )}

      <div className="dedup-field">
        <span className="dedup-field-label">Projects</span>
        <span className="dedup-field-value">{contact.projectCount}</span>
      </div>
    </div>
  );
}

export default function DedupModal({ pairs: initialPairs, onClose }: Props) {
  const [pairs, setPairs] = useState(initialPairs);
  const [index, setIndex] = useState(0);
  const [working, setWorking] = useState(false);

  function advance() {
    const newPairs = pairs.filter((_, i) => i !== index);
    setPairs(newPairs);
    if (index >= newPairs.length) {
      setIndex(Math.max(0, newPairs.length - 1));
    }
  }

  async function handleAction(
    winnerId: string | null,
    loserId: string | null,
    strategy: 'keep' | 'merge' | 'skip',
  ) {
    if (strategy === 'skip') {
      advance();
      return;
    }
    setWorking(true);
    try {
      await window.sourcerer.mergeContacts({ winnerId: winnerId!, loserId: loserId!, strategy });
      advance();
    } finally {
      setWorking(false);
    }
  }

  if (pairs.length === 0) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="dedup-card" onClick={(e) => e.stopPropagation()}>
          <div className="dedup-header">
            <span className="dedup-title">All done</span>
          </div>
          <p className="dedup-empty">No duplicate pairs to review.</p>
          <div className="dedup-actions">
            <button className="dedup-btn dedup-btn--primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { a, b, reason } = pairs[index];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="dedup-card" onClick={(e) => e.stopPropagation()}>
        <div className="dedup-header">
          <span className="dedup-title">Possible duplicate</span>
          <span className="dedup-reason">{reasonLabel(reason)}</span>
          <span className="dedup-progress">
            {index + 1} of {pairs.length}
          </span>
          <button className="ac-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="dedup-body">
          <div className="dedup-columns">
            <div>
              <div className="dedup-col-header">Contact A</div>
              <ContactCard contact={a} other={b} />
            </div>
            <div>
              <div className="dedup-col-header">Contact B</div>
              <ContactCard contact={b} other={a} />
            </div>
          </div>
        </div>

        <div className="dedup-actions">
          <button
            className="dedup-btn dedup-btn--secondary"
            onClick={() => handleAction(null, null, 'skip')}
            disabled={working}
          >
            Skip
          </button>
          <button
            className="dedup-btn dedup-btn--secondary"
            onClick={() => handleAction(a.id, b.id, 'keep')}
            disabled={working}
          >
            Keep left
          </button>
          <button
            className="dedup-btn dedup-btn--secondary"
            onClick={() => handleAction(b.id, a.id, 'keep')}
            disabled={working}
          >
            Keep right
          </button>
          <button
            className="dedup-btn dedup-btn--primary"
            onClick={() => handleAction(a.id, b.id, 'merge')}
            disabled={working}
          >
            Merge both
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/views/DedupModal.tsx src/renderer/src/views/DedupModal.css
git commit -m "feat(dedup): add DedupModal component"
```

---

### Task 5: AllContacts — badge and modal integration

**Files:**
- Modify: `src/renderer/src/views/AllContacts.tsx`
- Modify: `src/renderer/src/views/AllContacts.css`

- [ ] **Step 1: Add `dedup-badge` CSS to `AllContacts.css`**

Append to end of `src/renderer/src/views/AllContacts.css`:

```css
.dedup-badge {
  height: 30px;
  padding: 0 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font);
  color: #92400e;
  cursor: pointer;
  white-space: nowrap;
}

.dedup-badge:hover {
  background: #fef3c7;
}
```

- [ ] **Step 2: Add imports to `AllContacts.tsx`**

At the top of `src/renderer/src/views/AllContacts.tsx`, add:

```typescript
import type { DuplicatePair } from '@shared/types';
import DedupModal from './DedupModal';
```

- [ ] **Step 3: Add dedup state to `AllContacts`**

Inside the `AllContacts` component, add the following state declarations alongside the existing ones:

```typescript
  const [dupCount, setDupCount] = useState(0);
  const [showDedup, setShowDedup] = useState(false);
  const [dupPairs, setDupPairs] = useState<DuplicatePair[]>([]);
```

- [ ] **Step 4: Fetch initial pair count and subscribe to push updates**

Add the following two `useEffect` calls after the existing `useEffect` for `refresh`:

```typescript
  useEffect(() => {
    window.sourcerer.getDuplicatePairs().then((pairs) => {
      setDupPairs(pairs);
      setDupCount(pairs.length);
    });
  }, []);

  useEffect(() => {
    return window.sourcerer.onDuplicatePairsUpdated((count) => {
      setDupCount(count);
    });
  }, []);
```

- [ ] **Step 5: Add the badge to the view header**

In the JSX, inside the header's right-hand `<div style={{ display: 'flex', ... }}>` (around line 286), add the badge as the first child, before the `anyFilter` button:

```tsx
          {dupCount > 0 && (
            <button
              className="dedup-badge"
              onClick={async () => {
                const pairs = await window.sourcerer.getDuplicatePairs();
                setDupPairs(pairs);
                setShowDedup(true);
              }}
            >
              {dupCount} possible duplicate{dupCount !== 1 ? 's' : ''}
            </button>
          )}
```

- [ ] **Step 6: Render the DedupModal**

Near the bottom of the `AllContacts` return JSX, alongside the other modals (after `{showImportModal && ...}` etc.), add:

```tsx
      {showDedup && (
        <DedupModal
          pairs={dupPairs}
          onClose={() => {
            setShowDedup(false);
            refresh();
          }}
        />
      )}
```

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Manual verification**

Start the app with `npm run dev`. With dev seeds loaded (200 contacts), check the All Contacts header — if any pairs exist, a yellow badge should appear. Click it to open the DedupModal. Verify the side-by-side display, the reason tag, and the progress indicator. Try Skip (advances without making changes), Keep left (deletes right contact), Keep right (deletes left contact), and Merge both (merges data). After each action verify the pair advances. After closing the modal, verify the contact list refreshes and the badge count updates.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/views/AllContacts.tsx src/renderer/src/views/AllContacts.css
git commit -m "feat(dedup): add duplicate badge and modal to All Contacts view"
```
