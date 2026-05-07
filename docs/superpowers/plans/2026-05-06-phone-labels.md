# Phone Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional free-text label field to each phone number (e.g. "cell", "home", "disconnected") visible in edit and view modes.

**Architecture:** Add a nullable `label` column to `contact_phones` in both local and shared schemas, migrate existing DBs via ALTER TABLE, change the `phones` field in CreateContactInput/UpdateContactInput from `string[]` to `Array<{phone, label?}>`, update IPC to read/write labels, and update both edit UIs (GlobalTab + AddContactModal) plus the view mode.

**Tech Stack:** TypeScript, better-sqlite3-multiple-ciphers, React 18, CSS (global, no modules)

**No test framework is set up** — verification uses `npm run typecheck` and manual app inspection.

---

### Task 1: Schema, types, and migration

**Files:**
- Modify: `src/main/database/schema.ts`
- Modify: `src/main/database/shared-schema.ts`
- Modify: `src/main/database/index.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add `label TEXT` to `contact_phones` in local schema**

In `src/main/database/schema.ts`, change the `contact_phones` table definition:

```sql
  CREATE TABLE IF NOT EXISTS contact_phones (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    phone      TEXT    NOT NULL,
    label      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    synced_at  INTEGER
  );
```

- [ ] **Step 2: Add `label TEXT` to `contact_phones` in shared schema**

In `src/main/database/shared-schema.ts`, change the `contact_phones` table definition:

```sql
  CREATE TABLE IF NOT EXISTS contact_phones (
    id         TEXT    PRIMARY KEY,
    contact_id TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    phone      TEXT    NOT NULL,
    label      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
```

- [ ] **Step 3: Add ALTER TABLE migration to `index.ts`**

In `src/main/database/index.ts`, in the `openRaw` function before `return db`, add a migration block that follows the same try/catch pattern as the existing migrations. Use `db.prepare(...).run()` rather than `db.exec()` to keep it consistent with how SQLite DDL runs in this project:

```typescript
  // Migrate existing databases: add label to contact_phones if missing
  try {
    db.prepare('ALTER TABLE contact_phones ADD COLUMN label TEXT').run();
  } catch {}
```

- [ ] **Step 4: Update types in `src/shared/types.ts`**

Update `ContactPhone`:
```typescript
export interface ContactPhone {
  id: string;
  phone: string;
  label: string | null;
  sort_order: number;
}
```

Update `CreateContactInput`:
```typescript
export interface CreateContactInput {
  name: string;
  organization?: string;
  notes?: string;
  emails?: string[];
  phones?: Array<{ phone: string; label?: string }>;
  links?: ContactLinkInput[];
}
```

Update `UpdateContactInput`:
```typescript
export interface UpdateContactInput {
  id: string;
  name: string;
  organization?: string;
  notes?: string;
  emails?: string[];
  phones?: Array<{ phone: string; label?: string }>;
  links?: ContactLinkInput[];
}
```

- [ ] **Step 5: Run typecheck — expect errors in contacts.ts and UI files (fixed in next tasks)**

```bash
npm run typecheck
```

Expected: TypeScript errors on `phones` usage in `contacts.ts`, `GlobalTab.tsx`, and `AddContactModal.tsx`. These will be fixed in the following tasks.

- [ ] **Step 6: Commit schema and type changes**

```bash
git add src/main/database/schema.ts src/main/database/shared-schema.ts src/main/database/index.ts src/shared/types.ts
git commit -m "feat(phone-labels): add label column to contact_phones schema and types"
```

---

### Task 2: IPC — read and write phone labels

**Files:**
- Modify: `src/main/ipc/contacts.ts`

- [ ] **Step 1: Update `contacts:get` to SELECT label from contact_phones**

In the `contacts:get` handler (around line 91), change the phones query from:
```typescript
    const phones = db
      .prepare('SELECT id, phone, sort_order FROM contact_phones WHERE contact_id = ? ORDER BY sort_order')
      .all(id) as ContactPhone[];
```
To:
```typescript
    const phones = db
      .prepare('SELECT id, phone, label, sort_order FROM contact_phones WHERE contact_id = ? ORDER BY sort_order')
      .all(id) as ContactPhone[];
```

- [ ] **Step 2: Update `contacts:create` to INSERT phone labels**

In the `contacts:create` handler, replace the phones section (around lines 136–141):

Old code:
```typescript
      const phones = (data.phones ?? []).map((p) => normalizePhone(p, phone_country)).filter(Boolean);
      phones.forEach((phone, i) => {
        db.prepare(
          'INSERT INTO contact_phones (id, contact_id, phone, sort_order) VALUES (?, ?, ?, ?)',
        ).run(uuidv4(), id, phone, i);
      });
```

New code:
```typescript
      const phones = (data.phones ?? [])
        .filter((p) => p.phone.trim())
        .map((p) => ({ phone: normalizePhone(p.phone, phone_country), label: p.label?.trim() || null }))
        .filter((p) => p.phone);
      phones.forEach((p, i) => {
        db.prepare(
          'INSERT INTO contact_phones (id, contact_id, phone, label, sort_order) VALUES (?, ?, ?, ?, ?)',
        ).run(uuidv4(), id, p.phone, p.label, i);
      });
```

- [ ] **Step 3: Update `contacts:update` to INSERT phone labels**

In the `contacts:update` handler, replace the phones section (around lines 229–235):

Old code:
```typescript
      db.prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(data.id);
      const phones = (data.phones ?? []).map((p) => normalizePhone(p, phone_country)).filter(Boolean);
      phones.forEach((phone, i) => {
        db.prepare(
          'INSERT INTO contact_phones (id, contact_id, phone, sort_order) VALUES (?, ?, ?, ?)',
        ).run(uuidv4(), data.id, phone, i);
      });
```

New code:
```typescript
      db.prepare('DELETE FROM contact_phones WHERE contact_id = ?').run(data.id);
      const phones = (data.phones ?? [])
        .filter((p) => p.phone.trim())
        .map((p) => ({ phone: normalizePhone(p.phone, phone_country), label: p.label?.trim() || null }))
        .filter((p) => p.phone);
      phones.forEach((p, i) => {
        db.prepare(
          'INSERT INTO contact_phones (id, contact_id, phone, label, sort_order) VALUES (?, ?, ?, ?, ?)',
        ).run(uuidv4(), data.id, p.phone, p.label, i);
      });
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: errors now only in `GlobalTab.tsx` and `AddContactModal.tsx` (fixed next).

- [ ] **Step 5: Commit IPC changes**

```bash
git add src/main/ipc/contacts.ts
git commit -m "feat(phone-labels): update IPC handlers to read/write phone label"
```

---

### Task 3: Edit UI — phone+label rows in GlobalTab and AddContactModal

**Files:**
- Modify: `src/renderer/src/contacts/AddContactModal.css`
- Modify: `src/renderer/src/contacts/GlobalTab.tsx`
- Modify: `src/renderer/src/contacts/AddContactModal.tsx`

- [ ] **Step 1: Add `ac-phone-row` CSS class to `AddContactModal.css`**

Append to end of `src/renderer/src/contacts/AddContactModal.css`:

```css
.ac-phone-row {
  display: grid;
  grid-template-columns: 2fr 1fr auto;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}

.ac-phone-row .ac-input {
  width: 100%;
}
```

- [ ] **Step 2: Update `editPhones` state type in `GlobalTab.tsx`**

Change the `editPhones` state declaration (around line 83):

Old:
```typescript
  const [editPhones, setEditPhones] = useState<string[]>([]);
```

New:
```typescript
  const [editPhones, setEditPhones] = useState<Array<{ phone: string; label: string }>>([]);
```

- [ ] **Step 3: Update `startEdit` in `GlobalTab.tsx` to populate labels**

In `startEdit` (around line 100), change:

Old:
```typescript
    setEditPhones(contact.phones.map((p) => p.phone));
```

New:
```typescript
    setEditPhones(contact.phones.map((p) => ({ phone: p.phone, label: p.label ?? '' })));
```

- [ ] **Step 4: Replace the Phone `DynamicList` in `GlobalTab.tsx` edit mode with phone+label rows**

Replace the Phone field block in the edit form (around lines 229–239):

Old:
```tsx
        <div className="ac-field">
          <label className="ac-label">Phone</label>
          <DynamicList
            values={editPhones}
            placeholder="+1 555 000 0000"
            onChange={setEditPhones}
            onBlurItem={checkPhoneBlur}
            warnings={phoneCollisions}
          />
        </div>
```

New:
```tsx
        <div className="ac-field">
          <label className="ac-label">Phone</label>
          {editPhones.map((entry, i) => (
            <div key={i}>
              <div className="ac-phone-row">
                <input
                  className="ac-input"
                  value={entry.phone}
                  placeholder="+1 555 000 0000"
                  onChange={(e) => {
                    const next = [...editPhones];
                    next[i] = { ...next[i], phone: e.target.value };
                    setEditPhones(next);
                  }}
                  onBlur={() => checkPhoneBlur(entry.phone.trim())}
                />
                <input
                  className="ac-input"
                  value={entry.label}
                  placeholder="label…"
                  onChange={(e) => {
                    const next = [...editPhones];
                    next[i] = { ...next[i], label: e.target.value };
                    setEditPhones(next);
                  }}
                />
                <button
                  className="ac-remove"
                  type="button"
                  onClick={() => setEditPhones(editPhones.filter((_, j) => j !== i))}
                >×</button>
              </div>
              {entry.phone.trim() && phoneCollisions[entry.phone.trim()] && (
                <div className="ac-collision-warn">
                  Already on: <strong>{phoneCollisions[entry.phone.trim()]}</strong>
                </div>
              )}
            </div>
          ))}
          <button
            className="ac-add-row"
            type="button"
            onClick={() => setEditPhones([...editPhones, { phone: '', label: '' }])}
          >
            + Add
          </button>
        </div>
```

- [ ] **Step 5: Update `handleSave` in `GlobalTab.tsx` to pass phone objects**

In `handleSave` (around line 145–153), change the `phones` field in the `updateContact` call:

Old:
```typescript
        phones: editPhones,
```

New:
```typescript
        phones: editPhones.map((p) => ({ phone: p.phone, label: p.label.trim() || undefined })),
```

- [ ] **Step 6: Update `phones` state type in `AddContactModal.tsx`**

Change (around line 73):

Old:
```typescript
  const [phones, setPhones] = useState<string[]>(['']);
```

New:
```typescript
  const [phones, setPhones] = useState<Array<{ phone: string; label: string }>>([{ phone: '', label: '' }]);
```

- [ ] **Step 7: Replace Phone `DynamicList` in `AddContactModal.tsx` with phone+label rows**

Replace the `<DynamicList label="Phone" ...>` block (around lines 179–186):

Old:
```tsx
          <DynamicList
            label="Phone"
            values={phones}
            placeholder="+1 555 000 0000"
            onChange={setPhones}
            onBlurItem={checkPhoneBlur}
            warnings={phoneCollisions}
          />
```

New:
```tsx
          <div className="ac-field">
            <label className="ac-label">Phone</label>
            {phones.map((entry, i) => (
              <div key={i}>
                <div className="ac-phone-row">
                  <input
                    className="ac-input"
                    type="text"
                    value={entry.phone}
                    placeholder="+1 555 000 0000"
                    onChange={(e) => setPhones(phones.map((p, j) => j === i ? { ...p, phone: e.target.value } : p))}
                    onBlur={() => checkPhoneBlur(entry.phone.trim())}
                    disabled={submitting}
                  />
                  <input
                    className="ac-input"
                    type="text"
                    value={entry.label}
                    placeholder="label…"
                    onChange={(e) => setPhones(phones.map((p, j) => j === i ? { ...p, label: e.target.value } : p))}
                    disabled={submitting}
                  />
                  {phones.length > 1 && (
                    <button
                      type="button"
                      className="ac-remove"
                      onClick={() => setPhones(phones.filter((_, j) => j !== i))}
                    >×</button>
                  )}
                </div>
                {entry.phone.trim() && phoneCollisions[entry.phone.trim()] && (
                  <div className="ac-collision-warn">
                    Already on: <strong>{phoneCollisions[entry.phone.trim()]}</strong>
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              className="ac-add-row"
              onClick={() => setPhones([...phones, { phone: '', label: '' }])}
            >
              + Add phone
            </button>
          </div>
```

- [ ] **Step 8: Update `handleSubmit` in `AddContactModal.tsx` to pass phone objects**

In `handleSubmit` (around line 122), change the phones field:

Old:
```typescript
      phones: phones.filter((e) => e.trim()),
```

New:
```typescript
      phones: phones.filter((p) => p.phone.trim()).map((p) => ({ phone: p.phone, label: p.label.trim() || undefined })),
```

- [ ] **Step 9: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 10: Commit edit UI changes**

```bash
git add src/renderer/src/contacts/AddContactModal.css src/renderer/src/contacts/GlobalTab.tsx src/renderer/src/contacts/AddContactModal.tsx
git commit -m "feat(phone-labels): add phone+label row UI to GlobalTab and AddContactModal"
```

---

### Task 4: View mode — display label inline

**Files:**
- Modify: `src/renderer/src/contacts/ContactDetail.css`
- Modify: `src/renderer/src/contacts/GlobalTab.tsx`

- [ ] **Step 1: Add `detail-phone-label` CSS class to `ContactDetail.css`**

Append to end of `src/renderer/src/contacts/ContactDetail.css`:

```css
.detail-phone-label {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-left: 5px;
}
```

- [ ] **Step 2: Update phone view in `GlobalTab.tsx` to show label**

In `GlobalTab.tsx`, in the view mode (around lines 292–299), change:

Old:
```tsx
      {contact.phones.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Phone</div>
          {contact.phones.map((p) => (
            <span key={p.id} className="detail-value">{p.phone}</span>
          ))}
        </div>
      )}
```

New:
```tsx
      {contact.phones.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Phone</div>
          {contact.phones.map((p) => (
            <span key={p.id} className="detail-value">
              {p.phone}
              {p.label && <span className="detail-phone-label">· {p.label}</span>}
            </span>
          ))}
        </div>
      )}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the app with `npm run dev`. Open a contact, click Edit, add a phone with a label (e.g. "+1 555 000 0001", "cell"). Save. Verify the view shows `+1 555 000 0001 · cell`. Add a second phone with no label. Verify it shows just the number. Open a new Add Contact modal — verify the same two-column layout works there.

- [ ] **Step 5: Commit view mode**

```bash
git add src/renderer/src/contacts/ContactDetail.css src/renderer/src/contacts/GlobalTab.tsx
git commit -m "feat(phone-labels): show label inline in phone view mode"
```
