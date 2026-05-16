import type Database from 'better-sqlite3-multiple-ciphers';
import { v4 as uuidv4 } from 'uuid';
import { CONTACTS_1 } from './dev-seeds-contacts-1';
import { CONTACTS_2 } from './dev-seeds-contacts-2';
import { CONTACTS_3 } from './dev-seeds-contacts-3';
import { CONTACTS_4 } from './dev-seeds-contacts-4';

const STALE_NAMES = new Set([
  'Staff Insp. Robert Kalinowski',
  'Leah Gustafsson',
  'Alderman Frank Sorrentino',
  'James Calloway',
  'Warren Thickett',
  'Nathaniel Crossfield',
  'Miroslava Horvatová',
  'Astrid Bergqvist',
  'Ignacio Velázquez-Mora',
  'Luca Borromeo',
  'Owen Blackstock',
  'Alejandro Fuentes-Ríos',
  'Maureen Stafford-Hynes',
  'Hana Novotný',
  'Fumiko Yamaguchi',
  'Patrick Villeneuve',
  'Simon Beauchamp-Roy',
  'Anita Fong-Marquez',
]);

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

export function seedDevData(db: Database.Database, email: string, name: string): void {
  const existing = (db.prepare('SELECT COUNT(*) AS n FROM contacts').get() as { n: number }).n;
  if (existing > 0) return;

  const doSeed = db.transaction(() => {
    const stmts = {
      insertContact: db.prepare(
        `INSERT INTO contacts (id, name, organization, title, notes, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?)`,
      ),
      insertEmail: db.prepare(
        `INSERT INTO contact_emails (id, contact_id, email, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`,
      ),
      insertPhone: db.prepare(
        `INSERT INTO contact_phones (id, contact_id, phone, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`,
      ),
      insertLink: db.prepare(
        `INSERT INTO contact_links (id, contact_id, type, url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ),
      insertProject: db.prepare(
        `INSERT INTO projects (id, name, description, is_shared, created_at) VALUES (?, ?, ?, 0, ?)`,
      ),
      insertReporter: db.prepare(
        `INSERT INTO project_reporters (id, project_id, name, email, is_self) VALUES (?, ?, ?, ?, ?)`,
      ),
      insertMembership: db.prepare(
        `INSERT INTO project_memberships
           (id, project_id, contact_id, reporter_name, reporter_email, theme, priority, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      insertLog: db.prepare(
        `INSERT INTO interaction_log_entries (id, membership_id, reporter_email, reporter_name, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ),
      insertReminder: db.prepare(
        `INSERT INTO reminders (id, contact_id, project_id, membership_id, due_date, note, is_auto_outreach, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL)`,
      ),
    };

    // ── Insert all 100 contacts ──────────────────────────────────────────────
    const idByName = new Map<string, string>();
    const allContacts = [...CONTACTS_1, ...CONTACTS_2, ...CONTACTS_3, ...CONTACTS_4];

    for (const c of allContacts) {
      const id = uuidv4();
      idByName.set(c.name, id);
      const updatedAt = STALE_NAMES.has(c.name) ? NOW - 120 * DAY : NOW;
      stmts.insertContact.run(id, c.name, c.organization ?? null, c.notes ?? null, NOW, updatedAt);

      c.emails.forEach((e, i) => stmts.insertEmail.run(uuidv4(), id, e, i, NOW + i));
      c.phones.forEach((p, i) => stmts.insertPhone.run(uuidv4(), id, p, i, NOW + i));
      c.links.forEach((l, i) => stmts.insertLink.run(uuidv4(), id, l.type, l.url, i, NOW + i));
    }

    const cid = (n: string) => idByName.get(n)!;

    // ── Projects ─────────────────────────────────────────────────────────────
    const millgateId = uuidv4();
    const pensionId = uuidv4();
    const healthId = uuidv4();

    stmts.insertProject.run(millgateId, 'Millgate Land Deal',
      'Investigating the removal of protected lands from a local marshland, the approval process, and the developers and officials involved.',
      NOW);
    stmts.insertProject.run(pensionId, 'Clearwater Pension Inquiry',
      'Tracking allegations of misappropriation within a major public pension fund, including offshore holding structures and regulatory blind spots.',
      NOW);
    stmts.insertProject.run(healthId, 'Health System Audit',
      'Documenting systemic failures across hospital staffing, drug approvals, and long-term care — and the government decisions that enabled them.',
      NOW);

    const SARAH = { name: 'Sarah Chen', email: 'sarah.chen@newsroom.ca' };
    const MARCUS = { name: 'Marcus Webb', email: 'marcus.webb@newsroom.ca' };

    stmts.insertReporter.run(uuidv4(), millgateId, name, email, 1);
    stmts.insertReporter.run(uuidv4(), millgateId, SARAH.name, SARAH.email, 0);
    stmts.insertReporter.run(uuidv4(), pensionId, name, email, 1);
    stmts.insertReporter.run(uuidv4(), pensionId, MARCUS.name, MARCUS.email, 0);
    stmts.insertReporter.run(uuidv4(), healthId, name, email, 1);
    stmts.insertReporter.run(uuidv4(), healthId, SARAH.name, SARAH.email, 0);
    stmts.insertReporter.run(uuidv4(), healthId, MARCUS.name, MARCUS.email, 0);

    // ── Membership helpers ────────────────────────────────────────────────────
    const membIds: Record<string, string> = {};

    function addMembership(
      contactName: string,
      projectId: string,
      reporter: { name: string; email: string },
      opts: { theme?: string; priority?: string; status?: string } = {},
    ): string {
      const id = uuidv4();
      membIds[`${contactName}:${projectId}`] = id;
      stmts.insertMembership.run(
        id,
        projectId,
        cid(contactName),
        reporter.name,
        reporter.email,
        opts.theme ?? null,
        opts.priority ?? 'Monitor-only',
        opts.status ?? 'Not yet contacted',
        NOW,
        NOW,
      );
      return id;
    }

    function me(): { name: string; email: string } {
      return { name, email };
    }

    function addLog(
      contactName: string,
      projectId: string,
      reporter: { name: string; email: string },
      body: string,
      daysAgo: number,
    ): void {
      const membId = membIds[`${contactName}:${projectId}`];
      stmts.insertLog.run(uuidv4(), membId, reporter.email, reporter.name, body, NOW - daysAgo * DAY);
    }

    function addReminder(
      contactName: string,
      projectId: string,
      daysFromNow: number,
      note: string,
    ): void {
      const membId = membIds[`${contactName}:${projectId}`];
      stmts.insertReminder.run(uuidv4(), cid(contactName), projectId, membId, NOW + daysFromNow * DAY, note, NOW);
    }

    // ── Millgate Land Deal memberships ───────────────────────────────────────
    addMembership('Catherine Mwangi', millgateId, me(), {
      theme: 'Whistleblower', priority: 'Critical', status: 'Contacted, no reply',
    });
    addMembership('Darnell Okafor', millgateId, me(), {
      theme: 'Whistleblower', priority: 'Critical', status: 'In dialogue',
    });
    addMembership('Marcus Owusu-Boateng', millgateId, me(), {
      theme: 'Government', priority: 'High', status: 'In dialogue',
    });
    addMembership('Sandra Woo-Patel', millgateId, me(), {
      theme: 'Private equity', priority: 'High', status: 'Not yet contacted',
    });
    addMembership('Vivienne Tran', millgateId, me(), {
      theme: 'Legal', priority: 'Medium', status: 'Not yet contacted',
    });
    addMembership('Ted Molnar', millgateId, me(), {
      theme: 'Politics', priority: 'Low', status: 'In dialogue',
    });
    addMembership('Councillor Diane Ferreira', millgateId, SARAH, {
      theme: 'Municipal', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Priya Subramaniam', millgateId, me(), {
      theme: 'Media', priority: 'Monitor-only', status: 'In dialogue',
    });
    addMembership('Gordon Whitfield', millgateId, me(), {
      theme: 'Finance', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Renata Filipowicz', millgateId, SARAH, {
      theme: 'Government', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Sylvie Archambault', millgateId, me(), {
      theme: 'Labour', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Hamish Blackwood', millgateId, SARAH, {
      theme: 'Legal', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Sergeant Félicia Comeau', millgateId, me(), {
      theme: 'Law enforcement', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Magistrate Thomas Dunmore-Baines', millgateId, me(), {
      theme: 'Legal', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Dr. Jean-Paul Hébert', millgateId, SARAH, {
      theme: 'Expert', priority: 'Monitor-only', status: 'In dialogue',
    });
    addMembership('Dominique Paquin-Sévigny', millgateId, me(), {
      theme: 'Developer', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Rowena Bautista-Cruz', millgateId, SARAH, {
      theme: 'Legal', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Michael Clarke', millgateId, me(), {
      theme: 'PR / comms', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Sandra Hutchings-Bell', millgateId, SARAH, {
      theme: 'Legal', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Zach Pendergast', millgateId, me(), {
      theme: 'Media', priority: 'Monitor-only', status: 'Not yet contacted',
    });

    // ── Pension Fund Fraud memberships ───────────────────────────────────────
    addMembership('Eunice Addo-Yeboah', pensionId, me(), {
      theme: 'Banking / finance', priority: 'Critical', status: 'In dialogue',
    });
    addMembership('Sen. (ret.) Gérald Marquette', pensionId, me(), {
      theme: 'Government', priority: 'High', status: 'In dialogue',
    });
    addMembership('Ngozi Okafor-Ellis', pensionId, me(), {
      theme: 'Legal', priority: 'High', status: 'In dialogue',
    });
    addMembership('Deputy Commissioner Harlan Bryce', pensionId, MARCUS, {
      theme: 'Law enforcement', priority: 'Medium', status: 'Contacted, no reply',
    });
    addMembership('Rupert Ainsworth', pensionId, me(), {
      theme: 'Media', priority: 'Medium', status: 'In dialogue',
    });
    addMembership('Isabelle Fontaine-Duplessis', pensionId, MARCUS, {
      theme: 'Finance', priority: 'Low', status: 'In dialogue',
    });
    addMembership('Philip Gauthier-Lessard', pensionId, me(), {
      theme: 'Finance', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Randall Chu-Nakamura', pensionId, MARCUS, {
      theme: 'Private equity', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Tyler Deschênes', pensionId, me(), {
      theme: 'Private equity', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Desmond Asamoah-Frimpong', pensionId, MARCUS, {
      theme: 'Real estate', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Emil Rosenqvist', pensionId, me(), {
      theme: 'International', priority: 'Monitor-only', status: 'Contacted, no reply',
    });
    addMembership('Priscilla Nakagawa', pensionId, MARCUS, {
      theme: 'International', priority: 'Monitor-only', status: 'In dialogue',
    });
    addMembership('Callum Forsythe', pensionId, me(), {
      theme: 'Finance', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Cynthia Drayton', pensionId, MARCUS, {
      theme: 'Finance', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Luca Borromeo', pensionId, me(), {
      theme: 'Finance', priority: 'Monitor-only', status: 'Contacted, no reply',
    });
    addMembership('Petra Vogelsang', pensionId, MARCUS, {
      theme: 'International', priority: 'Monitor-only', status: 'Contacted, no reply',
    });
    addMembership('Hendrik van der Merwe', pensionId, me(), {
      theme: 'Finance', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Jocelyn Paré-Vachon', pensionId, MARCUS, {
      theme: 'Legal', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Carlo Desjardins', pensionId, me(), {
      theme: 'Finance', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Oksana Petrenko', pensionId, MARCUS, {
      theme: 'Civil society', priority: 'Monitor-only', status: 'Not yet contacted',
    });

    // ── Health System Failures memberships ───────────────────────────────────
    addMembership('Dr. Ananya Krishnamurthy', healthId, me(), {
      theme: 'Medical / science', priority: 'Critical', status: 'In dialogue',
    });
    addMembership('Theresa Ouellet-Gauvin', healthId, me(), {
      theme: 'Healthcare', priority: 'Critical', status: 'In dialogue',
    });
    addMembership('Dr. Patience Adusei-Mensah', healthId, SARAH, {
      theme: 'Medical / science', priority: 'High', status: 'In dialogue',
    });
    addMembership('Dr. Jean-Paul Hébert', healthId, MARCUS, {
      theme: 'Expert', priority: 'Medium', status: 'In dialogue',
    });
    addMembership('Kevin Stelmach', healthId, me(), {
      theme: 'Labour', priority: 'Low', status: 'Not yet contacted',
    });
    addMembership('Bertrand Lacombe', healthId, SARAH, {
      theme: 'Labour', priority: 'Monitor-only', status: 'In dialogue',
    });
    addMembership('Dr. Susan Whitmore-Haig', healthId, me(), {
      theme: 'Medical / science', priority: 'Monitor-only', status: 'Contacted, no reply',
    });
    addMembership('Dr. Felicity Okonkwo', healthId, SARAH, {
      theme: 'Medical / science', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership("Dr. Bridget O'Halloran", healthId, me(), {
      theme: 'Government', priority: 'Monitor-only', status: 'In dialogue',
    });
    addMembership('Carolyn Varga-Steele', healthId, MARCUS, {
      theme: 'Industry', priority: 'Monitor-only', status: 'Contacted, no reply',
    });
    addMembership('Chantal Beaubien', healthId, me(), {
      theme: 'Industry', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Finlay Drummond', healthId, SARAH, {
      theme: 'Civil society', priority: 'Monitor-only', status: 'In dialogue',
    });
    addMembership('Chief Medical Officer Dr. Farrukh Tashkentov', healthId, me(), {
      theme: 'Government', priority: 'Monitor-only', status: 'Not yet contacted',
    });
    addMembership('Kwame Asante-Mensah', healthId, MARCUS, {
      theme: 'Whistleblower', priority: 'Monitor-only', status: 'In dialogue',
    });
    addMembership('Antoine Durocher', healthId, SARAH, {
      theme: 'Media', priority: 'Monitor-only', status: 'In dialogue',
    });

    // ── Interaction logs ─────────────────────────────────────────────────────
    addLog('Darnell Okafor', millgateId, me(),
      'Made initial contact through intermediary. Confirmed willingness to speak. Agreed to Signal only — no email.',
      21);
    addLog('Darnell Okafor', millgateId, me(),
      'One-hour call via Signal. He described the document destruction sequence in detail. Cross-referencing his account against the audit trail now.',
      14);
    addLog('Darnell Okafor', millgateId, me(),
      'Follow-up message — he is consulting a lawyer before sharing the handwritten notes. Said two weeks.',
      6);

    addLog('Catherine Mwangi', millgateId, me(),
      'Sent secure form link. She confirmed receipt but has not submitted anything yet.',
      18);
    addLog('Catherine Mwangi', millgateId, me(),
      'Brief call. She is nervous about exposure — reminded her of our source protection practices. She will think about it.',
      9);

    addLog('Marcus Owusu-Boateng', millgateId, me(),
      'Background call via Signal. Confirmed the timeline of ministerial approvals. Will not go on record.',
      30);
    addLog('Marcus Owusu-Boateng', millgateId, me(),
      'Sent him the draft timeline for fact-checking. He marked two dates as incorrect.',
      11);

    addLog('Ted Molnar', millgateId, me(),
      "Shared three pages of opposition research — useful for names but nothing we didn't already have.",
      45);
    addLog('Ted Molnar', millgateId, me(),
      'Follow-up email — asked about the zoning amendments. No reply yet.',
      20);

    addLog('Eunice Addo-Yeboah', pensionId, me(),
      'First call after she moved to Prospect Advisory. She confirmed the memo exists and that she signed it. Will not hand it over directly.',
      35);
    addLog('Eunice Addo-Yeboah', pensionId, me(),
      'Second call — she described the contents in detail. Enough to corroborate the securities commission filing.',

      19);
    addLog('Eunice Addo-Yeboah', pensionId, me(),
      "Her lawyer has asked us to pause direct contact for two weeks. Respect the ask.",
      3);

    addLog('Sen. (ret.) Gérald Marquette', pensionId, me(),
      'Met for coffee. He spoke freely about committee dynamics. Shared a photocopy of a committee briefing note.',
      28);
    addLog('Sen. (ret.) Gérald Marquette', pensionId, me(),
      'Sent the memoir chapter excerpt by courier. Asked him to confirm the key passage is accurate.',
      7);

    addLog('Ngozi Okafor-Ellis', pensionId, me(),
      "In-person at her office. Explained the trust structure using a whiteboard — we photographed it.",
      22);
    addLog('Ngozi Okafor-Ellis', pensionId, me(),
      'She flagged a discrepancy in the securities commission timeline we had. Updated our reconstruction accordingly.',
      8);

    addLog('Rupert Ainsworth', pensionId, me(),
      "Video call to compare notes on the Luxembourg holding structure. His London-sourced documents fill a gap in ours.",
      16);

    addLog('Isabelle Fontaine-Duplessis', pensionId, MARCUS,
      'Background briefing on how European institutional investors are viewing the regulatory risk. Useful framing for the story.',
      40);

    addLog('Dr. Ananya Krishnamurthy', healthId, me(),
      'She shared the suppressed report methodology — not the findings. Enough to know what to request via ATIP.',
      25);
    addLog('Dr. Ananya Krishnamurthy', healthId, me(),
      'Agency legal counsel has been in touch with her. She is cautious but still willing to talk.',
      12);
    addLog('Dr. Ananya Krishnamurthy', healthId, me(),
      'Quick message — she confirmed the lead author on the 2023 report. New name to pursue.',
      4);

    addLog('Theresa Ouellet-Gauvin', healthId, me(),
      'She sent a redacted copy of the internal report via her personal email. Key data still present.',
      33);
    addLog('Theresa Ouellet-Gauvin', healthId, me(),
      "Confirmed that the union rep's account of the promotion snub is accurate. Will provide a written statement if legal approves.",
      15);

    addLog('Dr. Patience Adusei-Mensah', healthId, SARAH,
      'Background call. She explained the funding reduction timeline in detail. Will speak on record about the memo.',
      27);
    addLog('Dr. Patience Adusei-Mensah', healthId, SARAH,
      'Shared two internal emails that corroborate the funding cut timing. Sent via Signal.',
      10);

    addLog('Bertrand Lacombe', healthId, SARAH,
      'He provided the grievance data in a spreadsheet. Three hospital regions, 2021–2024.',
      38);

    addLog('Dr. Jean-Paul Hébert', healthId, MARCUS,
      'On-record interview. Agreed to be quoted on governance failures and the pension fund overlap.',
      50);

    // ── Manual reminders ─────────────────────────────────────────────────────
    addReminder('Catherine Mwangi', millgateId, 5,
      'Follow up on secure-form submission — has she had a chance to upload the documents?');
    addReminder('Darnell Okafor', millgateId, 3,
      'Check in on legal review of handwritten notes — two-week window he mentioned is almost up.');
    addReminder('Eunice Addo-Yeboah', pensionId, 14,
      'Resume contact after lawyer-requested pause — confirm she is still willing to proceed.');
    addReminder('Sen. (ret.) Gérald Marquette', pensionId, 2,
      'Confirm he received the briefing notes and whether he stands by the key passage.');
    addReminder('Dr. Ananya Krishnamurthy', healthId, 1,
      'Check in — agency counsel may have issued guidance that affects what she can share.');
    addReminder('Theresa Ouellet-Gauvin', healthId, 10,
      'Complete cross-reference of falsified staffing records against her redacted report.');
  });

  doSeed();
}
