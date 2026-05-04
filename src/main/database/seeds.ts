import type Database from 'better-sqlite3-multiple-ciphers';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_STATUSES = [
  'Not yet contacted',
  'Outreach attempted — no response',
  'Declined',
  'Declined — door left open',
  'Referred to communications',
  'Agreed — not yet scheduled',
  'Interviewed — off record',
  'Interviewed — on record',
  'Ghosted',
  'Do not contact',
];

const DEFAULT_PRIORITIES = ['Critical', 'High', 'Medium', 'Low', 'Monitor-only'];

export function seedDefaults(db: Database.Database): void {
  const insertStatus = db.prepare(
    'INSERT OR IGNORE INTO status_options (id, label, sort_order, is_default) VALUES (?, ?, ?, 1)',
  );
  const insertPriority = db.prepare(
    'INSERT OR IGNORE INTO priority_options (id, label, sort_order, is_default) VALUES (?, ?, ?, 1)',
  );

  for (let i = 0; i < DEFAULT_STATUSES.length; i++) {
    insertStatus.run(uuidv4(), DEFAULT_STATUSES[i], i);
  }

  for (let i = 0; i < DEFAULT_PRIORITIES.length; i++) {
    insertPriority.run(uuidv4(), DEFAULT_PRIORITIES[i], i);
  }
}
