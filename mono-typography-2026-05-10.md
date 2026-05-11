# Mono Typography Audit & Recommendations
**Date:** 2026-05-10
**Scope:** All `--font-mono` usages across every CSS file
**Goal:** Consolidate to three canonical sizes (10 / 11 / 12 px) with one consistent `letter-spacing` per size.

---

## Proposed System

| Tier | `font-size` | `letter-spacing` | Intended use |
|---|---|---|---|
| **Small** | `10px` | `0.16em` | Compact action buttons, tags, small metadata labels |
| **Medium** | `11px` | `0.14em` | Column headers, section labels, filter pills, group titles |
| **Large** | `12px` | `0.10em` | Utility buttons, dropdowns, date displays, input controls |

**Rationale for the descending tracking curve:** at the smallest size, extra letter-spacing compensates for optical crowding in a monospace face. As size grows, the same relative spacing would look over-spaced, so tracking relaxes.

The global `button` baseline in `global.css` currently uses `letter-spacing: 0.1em` with no explicit `font-size`. I recommend updating it to `0.14em` as a default — most small action buttons should drift toward medium tracking when nothing more specific is set — but every component should set its own explicit `font-size` and `letter-spacing` anyway.

---

## Current Inventory — All Mono Selectors

Font sizes in active use: **9.5 / 10 / 10.5 / 11 / 12 / 13 px**.
Letter-spacing values in active use: **0.03 / 0.04 / 0.05 / 0.06 / 0.10 / 0.12 / 0.14 / 0.16 / 0.18 / 0.22 em** (plus many that inherit the unset button baseline of `0.1em`).

---

## File-by-file Recommendations

### `global.css`

| Selector | Current size | Current `letter-spacing` | Recommended size | Recommended `letter-spacing` | Change? |
|---|---|---|---|---|---|
| `button, [role="button"]` baseline | *(not set)* | `0.1em` | *(not set)* | `0.14em` | Update ls |
| `.utility-type-small` | `10px` | `0.18em` | `10px` | `0.16em` | Update ls |
| `.utility-type-medium` | `11px` | `0.18em` | `11px` | `0.14em` | Update ls |
| `.utility-type-large` | `12px` | `0.18em` | `12px` | `0.10em` | Update ls |
| `code` | `12px` | *(none)* | `12px` | — | No change — `code` isn't uppercase, leave tracking at default |

---

### `AllContacts.css`

| Selector | Current size | Current `letter-spacing` | Recommended size | Recommended `letter-spacing` | Change? |
|---|---|---|---|---|---|
| `.contacts-table th` | `10.5px` | `0.18em` | **`11px`** | `0.14em` | Update both |
| `.project-tag` | `9.5px` | `0.12em` | **`10px`** | `0.16em` | Update both |
| `.btn-secondary` | `10.5px` | `0.16em` | **`11px`** | `0.14em` | Update both |
| `.btn-link` | `10px` | `0.14em` | `10px` | **`0.16em`** | Update ls |
| `.contact-date-cell` | `11px` | *(none)* | `11px` | **`0.14em`** | Add ls |
| `.bulk-project-item` | `13px` | *(none — inherits 0.1em)* | **`12px`** | `0.10em` | Update size, add explicit ls |
| `.bulk-delete-btn` | `10px` | `0.12em` | `10px` | **`0.16em`** | Update ls |
| `.bulk-delete-confirm-text` | `11px` | `0.06em` | `11px` | **`0.14em`** | Update ls |
| `.bulk-delete-confirm-btn` | `10px` | `0.12em` | `10px` | **`0.16em`** | Update ls |
| `.clear-filters-btn` | `10px` | `0.14em` | `10px` | **`0.16em`** | Update ls |
| `.dedup-badge` | `10px` | `0.14em` | `10px` | **`0.16em`** | Update ls |

---

### `ProjectView.css`

| Selector | Current size | Current `letter-spacing` | Recommended size | Recommended `letter-spacing` | Change? |
|---|---|---|---|---|---|
| `.sync-now-btn` | `12px` | *(inherits `0.1em`)* | `12px` | **`0.10em`** | Add explicit ls |
| `.recovery-btn` | `12px` | *(inherits `0.1em`)* | `12px` | **`0.10em`** | Add explicit ls |
| `.export-btn` | `12px` | *(inherits `0.1em`)* | `12px` | **`0.10em`** | Add explicit ls |
| `.export-menu-item` | *(not set)* | *(inherits `0.1em`)* | **`11px`** | **`0.14em`** | Add both |
| `.export-menu-label` | `10px` | *(none)* | `10px` | **`0.16em`** | Add ls |
| `.share-project-btn` | `12px` | *(inherits `0.1em`)* | `12px` | **`0.10em`** | Add explicit ls |

> **Note on `.inline-confirm-yes` / `.inline-confirm-no`:** these set `font-size: 10px` but are plain `<button>` elements — they inherit `font-family: var(--font-mono)` and `letter-spacing: 0.1em` from the global baseline. Under the new system they should explicitly declare `font-size: 10px; letter-spacing: 0.16em`.

---

### `RemindersView.css`

| Selector | Current size | Current `letter-spacing` | Recommended size | Recommended `letter-spacing` | Change? |
|---|---|---|---|---|---|
| `.reminders-ical-btn` | `12px` | *(inherits `0.1em`)* | `12px` | **`0.10em`** | Add explicit ls |
| `.reminders-filter-pill` | `12px` | *(inherits `0.1em`)* | **`11px`** | `0.14em` | Update size, add ls — filter pills are compact and suit the medium tier better |
| `.reminders-filter-count` | `10px` | *(none)* | `10px` | **`0.16em`** | Add ls |
| `.reminders-group-header` | *(not set on header itself)* | *(inherits)* | — | — | No change — delegates to child classes |
| `.reminders-group-title` | `11px` | `0.05em` | `11px` | **`0.14em`** | Update ls |
| `.reminders-group-count` | `11px` | `0.12em` | `11px` | **`0.14em`** | Update ls |
| `.reminders-item-badge` | `10px` | `0.03em` | `10px` | **`0.16em`** | Update ls |
| `.reminders-item-date` | `12px` | *(none)* | `12px` | **`0.10em`** | Add ls |
| `.reminders-item-days` | `12px` | *(none)* | `12px` | **`0.10em`** | Add ls |

---

### `SettingsView.css`

| Selector | Current size | Current `letter-spacing` | Recommended size | Recommended `letter-spacing` | Change? |
|---|---|---|---|---|---|
| `.sv-label` | `11px` | `0.12em` | `11px` | **`0.14em`** | Update ls |
| `.sv-save-btn` | `13px` | *(inherits `0.1em`)* | **`12px`** | `0.10em` | Update size, add ls |
| `.sv-interval-select` | `12px` | *(none)* | `12px` | **`0.10em`** | Add ls |
| `.sv-add-btn` | `12px` | *(inherits `0.1em`)* | `12px` | **`0.10em`** | Add explicit ls |
| `.sv-confirm-btn` | `12px` | *(inherits `0.1em`)* | `12px` | **`0.10em`** | Add explicit ls |
| `.sv-cancel-small-btn` | `12px` | *(inherits `0.1em`)* | `12px` | **`0.10em`** | Add explicit ls |
| `.sv-copy-btn` | `12px` | *(inherits `0.1em`)* | `12px` | **`0.10em`** | Add explicit ls |
| `.sv-wipe-btn` | `12px` | *(inherits `0.1em`)* | `12px` | **`0.10em`** | Add explicit ls |
| `.sv-wipe-confirm-btn` | `12px` | *(inherits `0.1em`)* | `12px` | **`0.10em`** | Add explicit ls |

---

### `ContactDetail.css`

| Selector | Current size | Current `letter-spacing` | Recommended size | Recommended `letter-spacing` | Change? |
|---|---|---|---|---|---|
| `.detail-vcard-btn` | `10px` | `0.14em` | `10px` | **`0.16em`** | Update ls |
| `.detail-section-label` | `10.5px` | `0.22em` | **`11px`** | `0.14em` | Update both — 0.22em is very wide; 0.14em at 11px still looks authoritative |
| `.detail-project-status` | `9.5px` | `0.12em` | **`10px`** | `0.16em` | Update both |
| `.detail-project-select` | `13px` | *(none)* | **`12px`** | `0.10em` | Update size, add ls |
| `.detail-add-btn` | `10px` | `0.14em` | `10px` | **`0.16em`** | Update ls |
| `.detail-delete-btn` | `10px` | `0.14em` | `10px` | **`0.16em`** | Update ls |
| `.detail-delete-confirm-btn` | `10px` | `0.14em` | `10px` | **`0.16em`** | Update ls |
| `.detail-cancel-btn` | `10px` | `0.14em` | `10px` | **`0.16em`** | Update ls |
| `.detail-tab` | `10.5px` | `0.18em` | **`11px`** | `0.14em` | Update both |
| `.detail-edit-btn` | `10px` | `0.14em` | `10px` | **`0.16em`** | Update ls |
| `.detail-save-btn` | `10px` | `0.14em` | `10px` | **`0.16em`** | Update ls |
| `.pt-section-label` | `10.5px` | `0.22em` | **`11px`** | `0.14em` | Update both — same as `.detail-section-label` |
| `.pt-label` | `9.5px` | `0.16em` | **`10px`** | `0.16em` | Update size only |
| `.pt-project-select` | `13px` | *(none)* | **`12px`** | `0.10em` | Update size, add ls |
| `.pt-reporter-search` | `12px` | *(none)* | `12px` | **`0.10em`** | Add ls |
| `.pt-reporter-option` | `12px` | *(none)* | `12px` | **`0.10em`** | Add ls |
| `.pt-log-row-date` | `10.5px` | `0.06em` | **`11px`** | `0.14em` | Update both |
| `.pt-log-row-reporter` | `10px` | `0.04em` | `10px` | **`0.16em`** | Update ls |
| `.pt-log-submit` | `10px` | `0.14em` | `10px` | **`0.16em`** | Update ls |
| `.pt-reminder-cancel` | `10px` | `0.14em` | `10px` | **`0.16em`** | Update ls |
| `.pt-draft-save` | `9.5px` | `0.14em` | **`10px`** | `0.16em` | Update both |

---

### `DedupModal.css`

| Selector | Current size | Current `letter-spacing` | Recommended size | Recommended `letter-spacing` | Change? |
|---|---|---|---|---|---|
| `.dedup-btn` | `13px` | *(inherits `0.1em`)* | **`12px`** | `0.10em` | Update size, add ls |

---

### `Setup.css`

| Selector | Current size | Current `letter-spacing` | Recommended size | Recommended `letter-spacing` | Change? |
|---|---|---|---|---|---|
| `.setup-field label` | `10px` | `0.18em` | `10px` | **`0.16em`** | Update ls |
| `.setup-submit` | `11px` | `0.18em` | `11px` | **`0.14em`** | Update ls |

---

### `AddContactModal.css`

| Selector | Current size | Current `letter-spacing` | Recommended size | Recommended `letter-spacing` | Change? |
|---|---|---|---|---|---|
| `.ac-label` | `11px` | `0.18em` | `11px` | **`0.14em`** | Update ls |
| `.ac-add-row` | `11px` | *(none)* | `11px` | **`0.14em`** | Add ls |
| `.modal-btn-cancel` / `.modal-btn-create` | `10.5px` | `0.16em` | **`11px`** | `0.14em` | Update both |

---

## Summary of Changes Needed

| Change type | Count |
|---|---|
| **Size only** (no letter-spacing change) | 1 |
| **Letter-spacing only** | 28 |
| **Both size and letter-spacing** | 14 |
| **No change needed** | 1 (`code`) |
| **Global baseline update** | 1 (`button` ls: `0.1em` → `0.14em`) |

**Values being eliminated:** `9.5px`, `10.5px`, `13px` sizes; `0.03em`, `0.04em`, `0.05em`, `0.06em`, `0.12em`, `0.18em`, `0.22em` letter-spacing values.

**Values being standardised to:** `10px/0.16em` · `11px/0.14em` · `12px/0.10em`.
