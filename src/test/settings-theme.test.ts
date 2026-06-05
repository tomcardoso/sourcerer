import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './vitest.setup';
import type Database from 'better-sqlite3-multiple-ciphers';

function getTheme(db: Database.Database): string {
  const row = db.prepare('SELECT theme FROM users WHERE id = 1').get() as { theme: string } | undefined;
  return row?.theme ?? 'light';
}

function setTheme(db: Database.Database, mode: string): void {
  db.prepare('UPDATE users SET theme = ? WHERE id = 1').run(mode);
}

describe('settings: theme', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('defaults to "light"', () => {
    expect(getTheme(db)).toBe('light');
  });

  it('persists "dark"', () => {
    setTheme(db, 'dark');
    expect(getTheme(db)).toBe('dark');
  });

  it('persists "system"', () => {
    setTheme(db, 'system');
    expect(getTheme(db)).toBe('system');
  });

  it('can round-trip back to "light"', () => {
    setTheme(db, 'dark');
    setTheme(db, 'light');
    expect(getTheme(db)).toBe('light');
  });
});
