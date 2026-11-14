// Backups: one saved by hand restores the vault as it was, and automatic ones are written to the
// chosen folder, on demand and when the app quits.

import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  addContact, answerFileDialog, createVault, expect, launchUnlocked, openContact, openSettings,
  PASSWORD, search, settingsToggle, test, unlock,
} from './sourcerer';

test('a backup restores the vault as it was when saved', async ({ launch, home }) => {
  const { app, page } = await launch();
  await createVault(page);
  await unlock(page);
  await addContact(page, 'Before Backup Marchetti');
  await page.keyboard.press('Escape');

  // A folder name with a space, as many real ones have.
  const folder = join(home, 'My Backups');
  mkdirSync(folder);
  const file = join(folder, 'vault.sourcerer-backup');
  await answerFileDialog(app, 'save', file);
  await openSettings(page);
  await page.getByRole('button', { name: 'Export backup' }).click();
  await page.getByPlaceholder('Master password').fill(PASSWORD);
  await page.locator('.sv-wipe-confirm').getByRole('button', { name: 'Export backup' }).click();
  await expect(page.getByText('Backup saved.')).toBeVisible({ timeout: 60_000 });
  expect(statSync(file).size).toBeGreaterThan(4096);

  await addContact(page, 'After Backup Lindqvist');
  await page.keyboard.press('Escape');

  // A wrong password is refused, and the vault is left alone.
  await answerFileDialog(app, 'open', file);
  await openSettings(page);
  await page.getByRole('button', { name: 'Restore from backup' }).click();
  await page.getByPlaceholder('Backup password').fill(`${PASSWORD} nope`);
  await page.getByRole('button', { name: 'Choose backup file…' }).click();
  await expect(page.locator('.sv-error-inline', { hasText: 'Incorrect password' })).toBeVisible({ timeout: 60_000 });

  // The right one replaces the vault and locks the app.
  await page.getByPlaceholder('Backup password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Choose backup file…' }).click();
  await unlock(page);
  await openContact(page, 'Before Backup Marchetti');
  await search(page, 'Lindqvist');
  await expect(page.locator('.search-empty')).toBeVisible();
});

test('automatic backups go to the chosen folder, on demand and on quitting', async ({ launch, home }) => {
  const s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  const folder = join(home, 'Auto Backups');
  mkdirSync(folder);
  const backups = () => readdirSync(folder).filter((f) => f.endsWith('.sourcerer-backup'));

  await answerFileDialog(s.app, 'open', folder);
  await openSettings(s.page);
  await s.page.getByRole('button', { name: 'Choose folder…' }).click();
  await expect(s.page.locator('.sv-path-code', { hasText: 'Auto Backups' })).toBeVisible();
  await settingsToggle(s.page, 'Enable automatic backups').click();
  await expect(settingsToggle(s.page, 'Enable automatic backups')).toHaveAttribute('aria-pressed', 'true');
  await s.page.getByRole('button', { name: 'Back up now' }).click();
  await expect.poll(() => backups().length, { timeout: 60_000 }).toBe(1);

  // Backup file names are timestamped to the millisecond, so the one written on quit is another.
  await s.close();
  expect(backups().length).toBe(2);

  const again = await launchUnlocked(launch);
  await openSettings(again.page);
  await expect(settingsToggle(again.page, 'Enable automatic backups')).toHaveAttribute('aria-pressed', 'true');
});
