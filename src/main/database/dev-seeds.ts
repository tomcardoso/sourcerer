import type Database from 'better-sqlite3-multiple-ciphers';

// Deterministic IDs so re-running in a fresh DB is idempotent
const IDS = {
  // Projects
  proj1: 'dev-proj-0001-0000-0000-000000000001',
  proj2: 'dev-proj-0002-0000-0000-000000000002',

  // Contacts
  c1: 'dev-cont-0001-0000-0000-000000000001', // Elena Vasquez
  c2: 'dev-cont-0002-0000-0000-000000000002', // Marcus Webb
  c3: 'dev-cont-0003-0000-0000-000000000003', // Dr. Priya Nair
  c4: 'dev-cont-0004-0000-0000-000000000004', // James Holroyd
  c5: 'dev-cont-0005-0000-0000-000000000005', // Sandra Obi
  c6: 'dev-cont-0006-0000-0000-000000000006', // Tom Fisk
  c7: 'dev-cont-0007-0000-0000-000000000007', // Claudette Renard
  c8: 'dev-cont-0008-0000-0000-000000000008', // Ray Dempsey
  c9: 'dev-cont-0009-0000-0000-000000000009', // Alicia Chung

  // Memberships
  m1: 'dev-memb-0001-0000-0000-000000000001', // Elena in proj1
  m2: 'dev-memb-0002-0000-0000-000000000002', // Marcus in proj1
  m3: 'dev-memb-0003-0000-0000-000000000003', // Dr. Nair in proj1
  m4: 'dev-memb-0004-0000-0000-000000000004', // James in proj1
  m5: 'dev-memb-0005-0000-0000-000000000005', // Sandra in proj2
  m6: 'dev-memb-0006-0000-0000-000000000006', // Tom in proj2
  m7: 'dev-memb-0007-0000-0000-000000000007', // Claudette in proj2
  m8: 'dev-memb-0008-0000-0000-000000000008', // Ray in proj1 + proj2
  m9: 'dev-memb-0009-0000-0000-000000000009', // Ray in proj2
  m10: 'dev-memb-0010-0000-0000-000000000010', // Alicia in proj2
};

const NOW = Date.now();
const DAY = 86400000;

function daysAgo(n: number): number {
  return NOW - n * DAY;
}

export function seedDevData(db: Database.Database, reporterEmail: string, reporterName: string): void {
  // Skip if already seeded
  const existing = db.prepare('SELECT COUNT(*) as n FROM contacts WHERE id LIKE ?').get('dev-cont-%') as { n: number };
  if (existing.n > 0) return;

  const insertProject = db.prepare(`
    INSERT INTO projects (id, name, description, is_shared, shared_pending_writes, created_at)
    VALUES (?, ?, ?, 0, 0, ?)
  `);

  const insertContact = db.prepare(`
    INSERT INTO contacts (id, name, organization, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertEmail = db.prepare(`
    INSERT INTO contact_emails (id, contact_id, email, sort_order) VALUES (?, ?, ?, ?)
  `);

  const insertPhone = db.prepare(`
    INSERT INTO contact_phones (id, contact_id, phone, sort_order) VALUES (?, ?, ?, ?)
  `);

  const insertLink = db.prepare(`
    INSERT INTO contact_links (id, contact_id, type, url, sort_order) VALUES (?, ?, ?, ?, ?)
  `);

  const insertMembership = db.prepare(`
    INSERT INTO project_memberships
      (id, contact_id, project_id, reporter_email, reporter_name, priority, status, theme, first_outreach_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLog = db.prepare(`
    INSERT INTO interaction_log_entries (id, membership_id, reporter_email, reporter_name, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertScratchpad = db.prepare(`
    INSERT INTO message_scratchpad_drafts (id, contact_id, project_id, label, body, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    // ── Projects ────────────────────────────────────────────────────────────
    insertProject.run(
      IDS.proj1,
      'Pentagon Slush Fund',
      'Investigating off-books payments from Halcyon Defense Group to senior DoD procurement officials via shell companies in Delaware and the Cayman Islands.',
      daysAgo(45),
    );
    insertProject.run(
      IDS.proj2,
      'City Hall Contracts',
      'Probe into no-bid contracts awarded to Mayor Alderman\'s former business partner. Three city departments implicated.',
      daysAgo(20),
    );

    // ── Contacts ────────────────────────────────────────────────────────────

    // 1. Elena Vasquez — former Halcyon CFO, primary whistleblower
    insertContact.run(
      IDS.c1, 'Elena Vasquez', 'Formerly: Halcyon Defense Group',
      'Primary whistleblower. Left Halcyon in 2022 after refusing to sign off on quarterly filings. Has copies of internal wire transfer approvals. Prefers Signal over email. Do not contact at her home address — estranged from husband who is still a Halcyon employee.',
      daysAgo(44), daysAgo(5),
    );
    insertEmail.run('dev-email-c1-1', IDS.c1, 'e.vasquez.private@proton.me', 0);
    insertPhone.run('dev-phone-c1-1', IDS.c1, '+1 703 555 0142', 0);
    insertLink.run('dev-link-c1-1', IDS.c1, 'linkedin', 'https://linkedin.com/in/elenavasquez-cfo', 0);

    // 2. Marcus Webb — DoD contracting officer (subject, not cooperative)
    insertContact.run(
      IDS.c2, 'Marcus Webb', 'U.S. Department of Defense',
      'Senior procurement officer, GS-15. Named in three of the wire transfers. Declined comment through DoD press office. Personal lawyer is Catherine Park at Boies Schiller. Do not approach at home.',
      daysAgo(40), daysAgo(12),
    );
    insertEmail.run('dev-email-c2-1', IDS.c2, 'marcus.webb@osd.mil', 0);
    insertLink.run('dev-link-c2-1', IDS.c2, 'linkedin', 'https://linkedin.com/in/marcuswebb-dod', 0);

    // 3. Dr. Priya Nair — academic expert on defense procurement
    insertContact.run(
      IDS.c3, 'Dr. Priya Nair', 'Georgetown University — Center for Security Studies',
      'Go-to expert on off-books defense contracting. Very responsive. Will go on record. Ask about her 2019 paper on shell company layering in procurement fraud — directly relevant to what Elena described.',
      daysAgo(38), daysAgo(8),
    );
    insertEmail.run('dev-email-c3-1', IDS.c3, 'p.nair@georgetown.edu', 0);
    insertEmail.run('dev-email-c3-2', IDS.c3, 'priya.nair.research@gmail.com', 1);
    insertPhone.run('dev-phone-c3-1', IDS.c3, '+1 202 555 0198', 0);
    insertLink.run('dev-link-c3-1', IDS.c3, 'twitter', 'https://x.com/drpriyanair', 0);
    insertLink.run('dev-link-c3-2', IDS.c3, 'linkedin', 'https://linkedin.com/in/drpriyanair', 0);

    // 4. James Holroyd — Halcyon VP of Government Relations (subject)
    insertContact.run(
      IDS.c4, 'James Holroyd', 'Halcyon Defense Group',
      'VP Gov\'t Relations since 2019. Formerly at the Pentagon as a civilian advisor (2014–2018). The revolving-door angle. Responded once to say he\'d "look into it" — nothing since. Aggressive on LinkedIn when challenged publicly.',
      daysAgo(35), daysAgo(18),
    );
    insertEmail.run('dev-email-c4-1', IDS.c4, 'jholroyd@halcyondefense.com', 0);
    insertLink.run('dev-link-c4-1', IDS.c4, 'linkedin', 'https://linkedin.com/in/jamesholroyd', 0);
    insertLink.run('dev-link-c4-2', IDS.c4, 'twitter', 'https://x.com/jholroyd_dc', 0);

    // 5. Sandra Obi — City Hall budget analyst (cooperative, City Hall story)
    insertContact.run(
      IDS.c5, 'Sandra Obi', 'City of Millhaven — Office of Budget & Management',
      'Mid-level budget analyst who flagged anomalies in the Parks & Rec contract line internally and was told to drop it. Willing to talk, nervous about job security. Met in person at the coffee shop on Archer St (she chose the location). Bring nothing with a Millhaven logo.',
      daysAgo(18), daysAgo(3),
    );
    insertEmail.run('dev-email-c5-1', IDS.c5, 'sandra.obi@millhaven.gov', 0);
    insertEmail.run('dev-email-c5-2', IDS.c5, 'sandraobiwork@gmail.com', 1);
    insertPhone.run('dev-phone-c5-1', IDS.c5, '+1 555 201 4477', 0);

    // 6. Tom Fisk — local developer, former business partner of Mayor Alderman
    insertContact.run(
      IDS.c6, 'Tom Fisk', 'Fisk & Calloway Development LLC',
      'Recipient of the no-bid contracts in question. Alderman\'s college roommate and former business partner until 2018 (on paper — operating relationship may continue). Public records show three Fisk LLC invoices totaling $2.1M paid in 14 months. Has not responded to any outreach.',
      daysAgo(17), daysAgo(17),
    );
    insertEmail.run('dev-email-c6-1', IDS.c6, 'tom@fiskcalloway.com', 0);
    insertPhone.run('dev-phone-c6-1', IDS.c6, '+1 555 334 9021', 0);
    insertLink.run('dev-link-c6-1', IDS.c6, 'linkedin', 'https://linkedin.com/in/tomfisk-developer', 0);
    insertLink.run('dev-link-c6-2', IDS.c6, 'instagram', 'https://instagram.com/tomfiskbuilds', 0);

    // 7. Claudette Renard — city council member, potential ally
    insertContact.run(
      IDS.c7, 'Claudette Renard', 'Millhaven City Council — District 4',
      'Minority-caucus member. Has been publicly critical of the Mayor\'s procurement process without mentioning contracts directly. Reached out to us first via a mutual contact. Will speak on background but not on record yet. Her chief of staff is the day-to-day contact.',
      daysAgo(15), daysAgo(6),
    );
    insertEmail.run('dev-email-c7-1', IDS.c7, 'councilmember.renard@millhaven.gov', 0);
    insertEmail.run('dev-email-c7-2', IDS.c7, 'crenard.district4@gmail.com', 1);
    insertPhone.run('dev-phone-c7-1', IDS.c7, '+1 555 407 8832', 0);
    insertLink.run('dev-link-c7-1', IDS.c7, 'twitter', 'https://x.com/claudetterenard', 0);
    insertLink.run('dev-link-c7-2', IDS.c7, 'facebook', 'https://facebook.com/renarddistrict4', 0);

    // 8. Ray Dempsey — financial forensics expert (used on both stories)
    insertContact.run(
      IDS.c8, 'Ray Dempsey', 'Dempsey Forensic Consulting',
      'CPA and certified fraud examiner. Has testified in 12 federal cases. We used him for the 2022 hospital billing story and he was meticulous. Available on background or on record. Charges $400/hr for consultation — worth it for the shell company analysis.',
      daysAgo(43), daysAgo(9),
    );
    insertEmail.run('dev-email-c8-1', IDS.c8, 'ray@dempseyforensic.com', 0);
    insertPhone.run('dev-phone-c8-1', IDS.c8, '+1 212 555 0067', 0);
    insertLink.run('dev-link-c8-1', IDS.c8, 'linkedin', 'https://linkedin.com/in/raydempsey-cpa', 0);

    // 9. Alicia Chung — investigative reporter at rival outlet (City Hall)
    insertContact.run(
      IDS.c9, 'Alicia Chung', 'The Millhaven Ledger',
      'She\'s sniffing around the same story. Had a casual coffee — she\'s focused on the Parks & Rec angle, we\'re focused on the infrastructure contracts. May be worth coordinating on public-records requests to avoid tipping the city off. Proceed cautiously.',
      daysAgo(10), daysAgo(10),
    );
    insertEmail.run('dev-email-c9-1', IDS.c9, 'achung@millhavenledger.com', 0);
    insertLink.run('dev-link-c9-1', IDS.c9, 'twitter', 'https://x.com/alichiachung', 0);

    // ── Memberships ─────────────────────────────────────────────────────────

    // Elena → Pentagon Slush Fund (primary source, critical priority)
    insertMembership.run(
      IDS.m1, IDS.c1, IDS.proj1,
      reporterEmail, reporterName,
      'Critical', 'Interviewed — on record', 'Financial transfers / shell companies',
      daysAgo(41), daysAgo(44), daysAgo(5),
    );

    // Marcus → Pentagon Slush Fund (subject, no response)
    insertMembership.run(
      IDS.m2, IDS.c2, IDS.proj1,
      reporterEmail, reporterName,
      'High', 'Referred to communications', 'DoD procurement official',
      daysAgo(38), daysAgo(40), daysAgo(12),
    );

    // Dr. Nair → Pentagon Slush Fund (expert)
    insertMembership.run(
      IDS.m3, IDS.c3, IDS.proj1,
      reporterEmail, reporterName,
      'Medium', 'Agreed — not yet scheduled', 'Expert comment',
      daysAgo(36), daysAgo(38), daysAgo(8),
    );

    // James Holroyd → Pentagon Slush Fund (subject)
    insertMembership.run(
      IDS.m4, IDS.c4, IDS.proj1,
      reporterEmail, reporterName,
      'High', 'Outreach attempted — no response', 'Revolving door / lobbying',
      daysAgo(33), daysAgo(35), daysAgo(18),
    );

    // Sandra → City Hall Contracts (cooperative source)
    insertMembership.run(
      IDS.m5, IDS.c5, IDS.proj2,
      reporterEmail, reporterName,
      'Critical', 'Interviewed — off record', 'Budget anomalies',
      daysAgo(16), daysAgo(18), daysAgo(3),
    );

    // Tom Fisk → City Hall (subject, no response)
    insertMembership.run(
      IDS.m6, IDS.c6, IDS.proj2,
      reporterEmail, reporterName,
      'High', 'Outreach attempted — no response', 'Contract recipient',
      null, daysAgo(17), daysAgo(17),
    );

    // Claudette → City Hall (on-background council member)
    insertMembership.run(
      IDS.m7, IDS.c7, IDS.proj2,
      reporterEmail, reporterName,
      'High', 'Interviewed — off record', 'Political context',
      daysAgo(13), daysAgo(15), daysAgo(6),
    );

    // Ray → Pentagon Slush Fund (financial expert)
    insertMembership.run(
      IDS.m8, IDS.c8, IDS.proj1,
      reporterEmail, reporterName,
      'Medium', 'Agreed — not yet scheduled', 'Shell company analysis',
      daysAgo(40), daysAgo(43), daysAgo(9),
    );

    // Ray → City Hall Contracts (same expert, second story)
    insertMembership.run(
      IDS.m9, IDS.c8, IDS.proj2,
      reporterEmail, reporterName,
      'Medium', 'Not yet contacted', 'Invoice irregularities',
      null, daysAgo(15), daysAgo(15),
    );

    // Alicia → City Hall (rival reporter, monitoring)
    insertMembership.run(
      IDS.m10, IDS.c9, IDS.proj2,
      reporterEmail, reporterName,
      'Low', 'Not yet contacted', 'Coordination / rival outlet',
      null, daysAgo(10), daysAgo(10),
    );

    // ── Interaction log entries ──────────────────────────────────────────────

    // Elena / Slush Fund
    insertLog.run('dev-log-0001', IDS.m1, reporterEmail, reporterName,
      'Initial contact via Signal after tip from mutual source at Senate Armed Services Committee. She confirmed she has internal Halcyon documents. Very cautious — took 20 minutes to establish ground rules. Background only for now.',
      daysAgo(41));
    insertLog.run('dev-log-0002', IDS.m1, reporterEmail, reporterName,
      'Two-hour in-person meeting at the Dulles Marriott. She showed me three pages of wire transfer approvals, all dated Q3 2021. Halcyon listed the recipient entity as "Meridian Strategic Services LLC" — which our incorporation search shows was registered in Delaware 10 days before the first transfer.',
      daysAgo(30));
    insertLog.run('dev-log-0003', IDS.m1, reporterEmail, reporterName,
      'She agreed to go on record after I described how we\'d frame the story — focusing on the institutional failure rather than singling her out as the whistleblower. Sending the legal team\'s source protection memo for her lawyer to review.',
      daysAgo(12));
    insertLog.run('dev-log-0004', IDS.m1, reporterEmail, reporterName,
      'Her lawyer (Nathan Cho at EFF) reviewed the memo and signed off. Formal on-record interview scheduled for next Tuesday at our office. She\'s bringing a USB with the documents.',
      daysAgo(5));

    // Marcus / Slush Fund
    insertLog.run('dev-log-0005', IDS.m2, reporterEmail, reporterName,
      'Sent written questions via DoD press office. Generic form acknowledgment received 48 hours later saying request had been forwarded to "appropriate staff."',
      daysAgo(38));
    insertLog.run('dev-log-0006', IDS.m2, reporterEmail, reporterName,
      'Follow-up after 10 days. DoD press office called back — said Webb is "not the appropriate spokesperson" on procurement matters and directed us to the Office of the Under Secretary for Acquisition. Classic runaround.',
      daysAgo(28));

    // Dr. Nair / Slush Fund
    insertLog.run('dev-log-0007', IDS.m3, reporterEmail, reporterName,
      'Cold outreach by email referencing her 2019 paper on layered shell companies in defense procurement. Responded within an hour — very enthusiastic. Said she\'s been watching the Halcyon contracts for 18 months.',
      daysAgo(36));
    insertLog.run('dev-log-0008', IDS.m3, reporterEmail, reporterName,
      'Quick background call. She pointed to SEC registration gaps in Meridian Strategic Services. Confirmed she\'ll go on record once we\'re closer to publication. Will schedule formal quote-check call then.',
      daysAgo(22));

    // Sandra / City Hall
    insertLog.run('dev-log-0009', IDS.m5, reporterEmail, reporterName,
      'First meeting — she reached out through a city hall contact who knows my editor. Very nervous. Only agreed to meet off-site. Described a budget line in Parks & Rec FY23 that jumped $800k with no supporting documentation she could find.',
      daysAgo(16));
    insertLog.run('dev-log-0010', IDS.m5, reporterEmail, reporterName,
      'Second meeting, same coffee shop. She brought a photo of the contract header on her personal phone. Fisk & Calloway LLC listed as contractor. Scope of work description is vague — "facilities assessment and strategic planning." No RFP attached.',
      daysAgo(9));
    insertLog.run('dev-log-0011', IDS.m5, reporterEmail, reporterName,
      'Follow-up by text. She says her supervisor asked her why she requested those contract files from procurement last week — someone tipped them off. Told her to pause and not request any more records from inside the building. We\'ll get what we need via FOIA.',
      daysAgo(3));

    // Claudette / City Hall
    insertLog.run('dev-log-0012', IDS.m7, reporterEmail, reporterName,
      'Her chief of staff Tomas Reyes made the initial outreach. Met Claudette at her district office after hours. Very sharp — she\'s been tracking the contracts independently and already has the FOIA calendar. On background, nothing quotable yet.',
      daysAgo(13));
    insertLog.run('dev-log-0013', IDS.m7, reporterEmail, reporterName,
      'She sent over a spreadsheet she\'d compiled of all no-bid contracts over $250k since 2020. Fisk & Calloway appears six times totaling $3.8M — more than our earlier estimate. She wants to see a draft before publication.',
      daysAgo(6));

    // Ray / Slush Fund
    insertLog.run('dev-log-0014', IDS.m8, reporterEmail, reporterName,
      'Introductory email reminding him of the hospital billing project. Sent the public incorporation docs for Meridian Strategic Services and the three Delaware shell addresses that appear across the Halcyon transfer docs.',
      daysAgo(40));
    insertLog.run('dev-log-0015', IDS.m8, reporterEmail, reporterName,
      'Ray called back same day — said he could trace the beneficial ownership chain "with some certainty" once he has the bank routing numbers. Flagged that the Cayman address on the Halcyon docs matches a known nominee-director service. Sending engagement letter.',
      daysAgo(32));

    // ── Scratchpad drafts ────────────────────────────────────────────────────

    insertScratchpad.run(
      'dev-scratch-0001', IDS.c2, IDS.proj1,
      'Right of reply — DoD press office',
      `Mr. Webb,\n\nWe are preparing an article on procurement contracts between Halcyon Defense Group and the Department of Defense between 2020 and 2023. Documents in our possession raise questions about payments routed through Meridian Strategic Services LLC.\n\nWe would like to offer you the opportunity to respond before publication. Specifically:\n\n1. Were you involved in approving contracts with Halcyon Defense Group between 2020 and 2023?\n2. Do you have a personal or financial relationship with any officer of Meridian Strategic Services LLC?\n3. Is there any context you would like us to include?\n\nWe will need a response by [DATE]. If you prefer to have your attorney respond, please have them contact us at [EMAIL].\n\n—`,
      daysAgo(25), daysAgo(20),
    );

    insertScratchpad.run(
      'dev-scratch-0002', IDS.c6, IDS.proj2,
      'Initial outreach — Tom Fisk',
      `Mr. Fisk,\n\nI'm a reporter at [OUTLET] working on a story about city contracting. Public records show Fisk & Calloway Development LLC was awarded several no-bid contracts by the City of Millhaven between 2021 and 2023 totaling more than $2 million.\n\nI'd welcome the chance to speak with you before we publish. Please reach me at [PHONE] or [EMAIL].\n\n—`,
      daysAgo(17), daysAgo(17),
    );

    insertScratchpad.run(
      'dev-scratch-0003', IDS.c3, IDS.proj1,
      'On-record quote check questions',
      `Draft questions for quote-check call with Dr. Nair:\n\n- "Is it common for defense contractors to use layered LLC structures when making payments to government officials?" — can she say this plainly for a general audience?\n- Her characterization of the Cayman address — can she be specific about the nominee-director practice?\n- Does she want to see the full wire transfer docs before the call or just the excerpts?\n- Timeline: publication is targeting [DATE], quote-check call ~2 weeks prior`,
      daysAgo(15), daysAgo(8),
    );
  })();
}
