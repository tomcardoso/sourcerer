import { ipcMain, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, isDatabaseOpen } from '../database';
import { normalizeEmail, normalizePhone } from '../sanitize';
import { broadcastRemindersChanged } from './reminders';
import type {
  ContactListItem,
  ContactDetail,
  CreateContactInput,
  UpdateContactInput,
  UpdateMembershipInput,
  ContactEmail,
  ContactPhone,
  ContactLink,
  ContactProject,
  ContactLinkInput,
  ProjectContactRow,
  InteractionLogEntry,
  ScratchpadDraft,
  StatusOption,
  PriorityOption,
  User,
} from '@shared/types';
import { loadDedupContacts, findDuplicatePairs, mergeContacts as mergeContactsDb } from '../dedup';
import type { DuplicatePair } from '@shared/types';

let cachedPairs: DuplicatePair[] = [];

async function triggerWaybackSave(contactId: string, url: string): Promise<void> {
  try {
    const response = await fetch(`https://web.archive.org/save/${encodeURIComponent(url)}`, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Sourcerer/1.0' },
    });
    const waybackUrl = response.url;
    if (waybackUrl.includes('web.archive.org/web/') && isDatabaseOpen()) {
      getDatabase()
        .prepare("UPDATE contact_links SET wayback_url = ? WHERE contact_id = ? AND type = 'website' AND url = ?")
        .run(waybackUrl, contactId, url);
    }
  } catch {
    // Silent failure — Wayback may not be reachable
  }
}

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

export function registerContactHandlers(): void {
  ipcMain.handle('contacts:list', (): ContactListItem[] => {
    const rows = getDatabase()
      .prepare(
        `SELECT c.id, c.name, c.organization, c.notes,
                pm.project_id, p.name AS project_name,
                EXISTS(SELECT 1 FROM contact_emails WHERE contact_id = c.id) AS has_email,
                EXISTS(SELECT 1 FROM contact_phones WHERE contact_id = c.id) AS has_phone,
                (SELECT GROUP_CONCAT(email, ' ') FROM contact_emails WHERE contact_id = c.id) AS emails_raw,
                (SELECT GROUP_CONCAT(phone, ' ') FROM contact_phones WHERE contact_id = c.id) AS phones_raw,
                (SELECT MIN(ile.created_at)
                 FROM interaction_log_entries ile
                 JOIN project_memberships pm2 ON pm2.id = ile.membership_id
                 WHERE pm2.contact_id = c.id) AS date_first_contacted,
                (SELECT MAX(ile.created_at)
                 FROM interaction_log_entries ile
                 JOIN project_memberships pm2 ON pm2.id = ile.membership_id
                 WHERE pm2.contact_id = c.id) AS date_last_contacted
         FROM contacts c
         LEFT JOIN project_memberships pm ON pm.contact_id = c.id
         LEFT JOIN projects p ON p.id = pm.project_id
         ORDER BY c.name COLLATE NOCASE ASC`,
      )
      .all() as Array<{
      id: string;
      name: string;
      organization: string | null;
      notes: string | null;
      has_email: 0 | 1;
      has_phone: 0 | 1;
      emails_raw: string | null;
      phones_raw: string | null;
      date_first_contacted: number | null;
      date_last_contacted: number | null;
      project_id: string | null;
      project_name: string | null;
    }>;

    const map = new Map<string, ContactListItem>();
    for (const row of rows) {
      if (!map.has(row.id)) {
        map.set(row.id, {
          id: row.id,
          name: row.name,
          organization: row.organization,
          notes: row.notes,
          has_email: row.has_email,
          has_phone: row.has_phone,
          emails_raw: row.emails_raw,
          phones_raw: row.phones_raw,
          date_first_contacted: row.date_first_contacted,
          date_last_contacted: row.date_last_contacted,
          projects: [],
        });
      }
      if (row.project_id) {
        map.get(row.id)!.projects.push({ id: row.project_id, name: row.project_name! });
      }
    }
    return [...map.values()];
  });

  ipcMain.handle('contacts:get', (_, id: string): ContactDetail => {
    const db = getDatabase();
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as {
      id: string;
      name: string;
      organization: string | null;
      notes: string | null;
      created_at: number;
      updated_at: number;
    };
    const emails = db
      .prepare('SELECT id, email, sort_order FROM contact_emails WHERE contact_id = ? ORDER BY sort_order')
      .all(id) as ContactEmail[];
    const phones = db
      .prepare('SELECT id, phone, label, sort_order FROM contact_phones WHERE contact_id = ? ORDER BY sort_order')
      .all(id) as ContactPhone[];
    const links = db
      .prepare('SELECT id, type, label, url, wayback_url, sort_order FROM contact_links WHERE contact_id = ? ORDER BY sort_order')
      .all(id) as ContactLink[];
    const projects = db
      .prepare(
        `SELECT p.id, p.name, pm.id AS membership_id, pm.status, pm.priority,
                pm.theme, pm.first_outreach_at, pm.reporter_name, pm.reporter_email,
                pm.outreach_reminders_disabled, pm.reporter_conflict,
                (SELECT MIN(ile.created_at) FROM interaction_log_entries ile
                 WHERE ile.membership_id = pm.id) AS first_log_at,
                (SELECT MAX(ile.created_at) FROM interaction_log_entries ile
                 WHERE ile.membership_id = pm.id) AS date_last_contacted
         FROM project_memberships pm
         JOIN projects p ON p.id = pm.project_id
         WHERE pm.contact_id = ?
         ORDER BY p.name ASC`,
      )
      .all(id) as ContactProject[];

    return { ...contact, emails, phones, links, projects };
  });

  ipcMain.handle('contacts:create', (_, data: CreateContactInput): ContactListItem => {
    const db = getDatabase();
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const { phone_country } = db.prepare('SELECT phone_country FROM users WHERE id = 1').get() as { phone_country: string };

    let phones: { phone: string; label: string | null }[] = [];

    const insert = db.transaction(() => {
      db.prepare(
        'INSERT INTO contacts (id, name, organization, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, data.name.trim(), data.organization?.trim() || null, data.notes?.trim() || null, now, now);

      const emails = (data.emails ?? []).map(normalizeEmail).filter(Boolean);
      emails.forEach((email, i) => {
        db.prepare(
          'INSERT INTO contact_emails (id, contact_id, email, sort_order) VALUES (?, ?, ?, ?)',
        ).run(uuidv4(), id, email, i);
      });

      phones = (data.phones ?? [])
        .filter((p) => p.phone.trim())
        .map((p) => ({ phone: normalizePhone(p.phone, phone_country), label: p.label?.trim() || null }))
        .filter((p) => p.phone);
      phones.forEach((p, i) => {
        db.prepare(
          'INSERT INTO contact_phones (id, contact_id, phone, label, sort_order) VALUES (?, ?, ?, ?, ?)',
        ).run(uuidv4(), id, p.phone, p.label, i);
      });

      const links = (data.links ?? []).filter((l) => l.url.trim());
      links.forEach((link, i) => {
        db.prepare(
          'INSERT INTO contact_links (id, contact_id, type, label, url, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(uuidv4(), id, link.type, link.label ?? null, link.url.trim(), i);
      });
    });

    insert();
    setImmediate(runDedupScan);

    // Trigger background Wayback saves for website links
    const websiteLinks = (data.links ?? []).filter((l) => l.type === 'website' && l.url.trim());
    for (const link of websiteLinks) {
      triggerWaybackSave(id, link.url.trim()).catch(() => {});
    }
    return {
      id,
      name: data.name.trim(),
      organization: data.organization?.trim() || null,
      notes: data.notes?.trim() || null,
      has_email: (data.emails?.length ?? 0) > 0 ? 1 : 0,
      has_phone: phones.length > 0 ? 1 : 0,
      date_first_contacted: null,
      date_last_contacted: null,
      emails_raw: (data.emails ?? []).filter(Boolean).join(' ') || null,
      phones_raw: phones.length > 0 ? phones.join(' ') : null,
      projects: [],
    };
  });

  ipcMain.handle('contacts:delete', (_, id: string): void => {
    getDatabase().prepare('DELETE FROM contacts WHERE id = ?').run(id);
    setImmediate(runDedupScan);
  });

  ipcMain.handle(
    'memberships:add',
    (_, { contactId, projectId }: { contactId: string; projectId: string }): void => {
      const db = getDatabase();
      const user = db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
      const defaultStatus = db
        .prepare('SELECT label FROM status_options ORDER BY sort_order LIMIT 1')
        .get() as { label: string } | undefined;

      db.prepare(
        `INSERT OR IGNORE INTO project_memberships
         (id, contact_id, project_id, reporter_email, reporter_name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        uuidv4(),
        contactId,
        projectId,
        user.email,
        `${user.first_name} ${user.last_name}`,
        defaultStatus?.label ?? null,
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000),
      );
    },
  );

  ipcMain.handle(
    'memberships:remove',
    (_, { contactId, projectId }: { contactId: string; projectId: string }): void => {
      getDatabase()
        .prepare('DELETE FROM project_memberships WHERE contact_id = ? AND project_id = ?')
        .run(contactId, projectId);
    },
  );

  ipcMain.handle('contacts:list-for-project', (_, projectId: string): ProjectContactRow[] => {
    return getDatabase()
      .prepare(
        `SELECT c.id, c.name, c.organization, c.notes,
                pm.id AS membership_id, pm.reporter_name, pm.reporter_email,
                pm.theme, pm.priority, pm.status,
                EXISTS(SELECT 1 FROM contact_emails WHERE contact_id = c.id) AS has_email,
                EXISTS(SELECT 1 FROM contact_phones WHERE contact_id = c.id) AS has_phone,
                (SELECT GROUP_CONCAT(email, ' ') FROM contact_emails WHERE contact_id = c.id) AS emails_raw,
                (SELECT GROUP_CONCAT(phone, ' ') FROM contact_phones WHERE contact_id = c.id) AS phones_raw,
                (SELECT MIN(created_at) FROM interaction_log_entries WHERE membership_id = pm.id) AS date_first_contacted,
                (SELECT MAX(created_at) FROM interaction_log_entries WHERE membership_id = pm.id) AS date_last_contacted
         FROM project_memberships pm
         JOIN contacts c ON c.id = pm.contact_id
         WHERE pm.project_id = ?
         ORDER BY c.name COLLATE NOCASE ASC`,
      )
      .all(projectId) as ProjectContactRow[];
  });

  ipcMain.handle('contacts:update', (_, data: UpdateContactInput): void => {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const { phone_country } = db.prepare('SELECT phone_country FROM users WHERE id = 1').get() as { phone_country: string };

    // Preserve existing website Wayback URLs before re-insert
    const existingWebsites = db
      .prepare("SELECT url, wayback_url FROM contact_links WHERE contact_id = ? AND type = 'website'")
      .all(data.id) as { url: string; wayback_url: string | null }[];
    const existingWaybacks = new Map(existingWebsites.map((r) => [r.url, r.wayback_url]));

    const run = db.transaction(() => {
      db.prepare(
        'UPDATE contacts SET name = ?, organization = ?, notes = ?, updated_at = ? WHERE id = ?',
      ).run(data.name.trim(), data.organization?.trim() || null, data.notes?.trim() || null, now, data.id);

      db.prepare('DELETE FROM contact_emails WHERE contact_id = ?').run(data.id);
      const emails = (data.emails ?? []).map(normalizeEmail).filter(Boolean);
      emails.forEach((email, i) => {
        db.prepare(
          'INSERT INTO contact_emails (id, contact_id, email, sort_order) VALUES (?, ?, ?, ?)',
        ).run(uuidv4(), data.id, email, i);
      });

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

      db.prepare('DELETE FROM contact_links WHERE contact_id = ?').run(data.id);
      const links = (data.links ?? []).filter((l: ContactLinkInput) => l.url.trim());
      links.forEach((link: ContactLinkInput, i: number) => {
        db.prepare(
          'INSERT INTO contact_links (id, contact_id, type, label, url, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(uuidv4(), data.id, link.type, link.label ?? null, link.url.trim(), i);
      });

      // Restore wayback_urls for previously saved website links
      for (const [url, waybackUrl] of existingWaybacks) {
        if (waybackUrl) {
          db.prepare(
            "UPDATE contact_links SET wayback_url = ? WHERE contact_id = ? AND type = 'website' AND url = ?"
          ).run(waybackUrl, data.id, url);
        }
      }
    });
    run();
    setImmediate(runDedupScan);

    // Trigger Wayback saves for newly added website URLs
    const newWebsiteUrls = (data.links ?? [])
      .filter((l) => l.type === 'website' && l.url.trim() && !existingWaybacks.has(l.url.trim()))
      .map((l) => l.url.trim());
    for (const url of newWebsiteUrls) {
      triggerWaybackSave(data.id, url).catch(() => {});
    }
  });

  ipcMain.handle('memberships:update', (_, data: UpdateMembershipInput): void => {
    const now = Math.floor(Date.now() / 1000);
    const db = getDatabase();
    const current = db
      .prepare('SELECT reporter_email, outreach_reminders_disabled FROM project_memberships WHERE id = ?')
      .get(data.membershipId) as { reporter_email: string; outreach_reminders_disabled: 0 | 1 } | undefined;

    const newDisabled = data.outreachRemindersDisabled !== undefined
      ? data.outreachRemindersDisabled
      : (current?.outreach_reminders_disabled ?? 0);

    const reporterChanging = data.reporterEmail !== undefined && data.reporterEmail !== current?.reporter_email;

    db.prepare(
      `UPDATE project_memberships
       SET status = ?, priority = ?, theme = ?,
           outreach_reminders_disabled = ?,
           reporter_email = COALESCE(?, reporter_email),
           reporter_name  = COALESCE(?, reporter_name),
           reporter_assigned_at = CASE WHEN ? THEN ? ELSE reporter_assigned_at END,
           reporter_conflict = CASE WHEN ? OR ? THEN 0 ELSE reporter_conflict END,
           updated_at = ?
       WHERE id = ?`,
    ).run(
      data.status ?? null,
      data.priority ?? null,
      data.theme ?? null,
      newDisabled,
      data.reporterEmail ?? null,
      data.reporterName ?? null,
      reporterChanging ? 1 : 0, now,
      reporterChanging ? 1 : 0, data.clearConflict ? 1 : 0,
      now,
      data.membershipId,
    );

    if (newDisabled === 1) {
      db.prepare(
        `DELETE FROM reminders WHERE membership_id = ? AND is_auto_outreach = 1`,
      ).run(data.membershipId);
      broadcastRemindersChanged();
    }
  });

  ipcMain.handle('interaction-log:list', (_, membershipId: string): InteractionLogEntry[] => {
    return getDatabase()
      .prepare(
        'SELECT * FROM interaction_log_entries WHERE membership_id = ? ORDER BY created_at ASC',
      )
      .all(membershipId) as InteractionLogEntry[];
  });

  ipcMain.handle(
    'interaction-log:add',
    (_, { membershipId, body }: { membershipId: string; body: string }): InteractionLogEntry => {
      const db = getDatabase();
      const user = db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
      const id = uuidv4();
      const now = Math.floor(Date.now() / 1000);
      const reporterName = `${user.first_name} ${user.last_name}`;
      db.prepare(
        'INSERT INTO interaction_log_entries (id, membership_id, reporter_email, reporter_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, membershipId, user.email, reporterName, body.trim(), now);
      // Clear any auto-outreach calendar reminder — source is no longer overdue.
      db.prepare('DELETE FROM reminders WHERE membership_id = ? AND is_auto_outreach = 1').run(membershipId);
      return {
        id,
        membership_id: membershipId,
        reporter_email: user.email,
        reporter_name: reporterName,
        body: body.trim(),
        created_at: now,
      };
    },
  );

  ipcMain.handle(
    'scratchpad:list',
    (_, { contactId, projectId }: { contactId: string; projectId: string }): ScratchpadDraft[] => {
      return getDatabase()
        .prepare(
          'SELECT * FROM message_scratchpad_drafts WHERE contact_id = ? AND project_id = ? ORDER BY created_at ASC',
        )
        .all(contactId, projectId) as ScratchpadDraft[];
    },
  );

  ipcMain.handle(
    'scratchpad:save',
    (
      _,
      data: { id?: string; contactId: string; projectId: string; label: string; body: string },
    ): ScratchpadDraft => {
      const db = getDatabase();
      const now = Math.floor(Date.now() / 1000);
      if (data.id) {
        db.prepare(
          'UPDATE message_scratchpad_drafts SET label = ?, body = ?, updated_at = ? WHERE id = ?',
        ).run(data.label, data.body, now, data.id);
        return db
          .prepare('SELECT * FROM message_scratchpad_drafts WHERE id = ?')
          .get(data.id) as ScratchpadDraft;
      } else {
        const id = uuidv4();
        db.prepare(
          'INSERT INTO message_scratchpad_drafts (id, contact_id, project_id, label, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(id, data.contactId, data.projectId, data.label, data.body, now, now);
        return {
          id,
          contact_id: data.contactId,
          project_id: data.projectId,
          label: data.label,
          body: data.body,
          created_at: now,
          updated_at: now,
        };
      }
    },
  );

  ipcMain.handle('scratchpad:delete', (_, id: string): void => {
    getDatabase().prepare('DELETE FROM message_scratchpad_drafts WHERE id = ?').run(id);
  });

  ipcMain.handle('status-options:list', (): StatusOption[] => {
    return getDatabase()
      .prepare('SELECT * FROM status_options ORDER BY sort_order ASC')
      .all() as StatusOption[];
  });

  ipcMain.handle('priority-options:list', (): PriorityOption[] => {
    return getDatabase()
      .prepare('SELECT * FROM priority_options ORDER BY sort_order ASC')
      .all() as PriorityOption[];
  });

  ipcMain.handle(
    'contacts:check-collision',
    (
      _,
      { emails, phones, excludeId }: { emails: string[]; phones: string[]; excludeId?: string },
    ): { email: Record<string, string>; phone: Record<string, string> } => {
      const db = getDatabase();
      const { phone_country } = db.prepare('SELECT phone_country FROM users WHERE id = 1').get() as { phone_country: string };
      const result: { email: Record<string, string>; phone: Record<string, string> } = {
        email: {},
        phone: {},
      };

      for (const rawEmail of emails.filter(Boolean)) {
        const email = normalizeEmail(rawEmail);
        const row = excludeId
          ? (db
              .prepare(
                `SELECT c.name FROM contact_emails ce JOIN contacts c ON c.id = ce.contact_id
                 WHERE ce.email = ? AND ce.contact_id != ? LIMIT 1`,
              )
              .get(email, excludeId) as { name: string } | undefined)
          : (db
              .prepare(
                `SELECT c.name FROM contact_emails ce JOIN contacts c ON c.id = ce.contact_id
                 WHERE ce.email = ? LIMIT 1`,
              )
              .get(email) as { name: string } | undefined);
        if (row) result.email[rawEmail] = row.name;
      }

      for (const rawPhone of phones.filter(Boolean)) {
        const phone = normalizePhone(rawPhone, phone_country);
        const row = excludeId
          ? (db
              .prepare(
                `SELECT c.name FROM contact_phones cp JOIN contacts c ON c.id = cp.contact_id
                 WHERE cp.phone = ? AND cp.contact_id != ? LIMIT 1`,
              )
              .get(phone, excludeId) as { name: string } | undefined)
          : (db
              .prepare(
                `SELECT c.name FROM contact_phones cp JOIN contacts c ON c.id = cp.contact_id
                 WHERE cp.phone = ? LIMIT 1`,
              )
              .get(phone) as { name: string } | undefined);
        if (row) result.phone[rawPhone] = row.name;
      }

      return result;
    },
  );

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
}
