// The paths most likely to break on one platform but not another: the vault's encryption
// (Argon2id + SQLCipher), data surviving a restart, and features that read or write files.
// File dialogs are answered in the main process (answerFileDialog), so no native dialog opens.

import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { answerFileDialog, createVault, expect, PASSWORD, test, unlock } from './sourcerer';

test('a vault opens with its password and not with another', async ({ launch }) => {
  const { page } = await launch();
  await createVault(page);
  await unlock(page);

  await page.getByRole('button', { name: 'Lock Sourcerer' }).click();
  await expect(page.locator('.unlock-label')).toBeVisible();

  await page.fill('#password', `${PASSWORD} nope`);
  await page.keyboard.press('Enter');
  await expect(page.locator('.unlock-error')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.sidebar')).toBeHidden();

  await unlock(page);
});

test('a project, contact and interaction are still there after a restart', async ({ launch }) => {
  const first = await launch();
  const page = first.page;
  await createVault(page);
  await unlock(page);
  const sidebar = page.locator('.sidebar');
  const modal = page.locator('.modal-card');

  await sidebar.getByRole('button', { name: 'New project' }).click();
  await page.fill('#proj-name', 'Harbour Inquiry');
  await modal.getByRole('button', { name: 'Create project' }).click();
  await expect(modal).toBeHidden();
  await expect(sidebar.locator('.sidebar-project-name', { hasText: 'Harbour Inquiry' })).toBeVisible();

  await sidebar.getByRole('button', { name: '+ Add contact' }).click();
  await page.fill('#ac-name', 'Rosalind Teague');
  await modal.getByRole('button', { name: 'More details' }).click();
  await modal.locator('.ac-project-search').click();
  await modal.locator('.ac-project-search').fill('Harbour');
  await modal.locator('.ac-project-option', { hasText: 'Harbour Inquiry' }).click();
  await modal.getByRole('button', { name: 'Add contact', exact: true }).click();
  await expect(modal).toBeHidden();

  await sidebar.getByRole('button', { name: 'Log interaction' }).click();
  await modal.getByPlaceholder('Search contacts…').fill('Rosalind');
  await modal.locator('.qlm-dropdown-option', { hasText: 'Rosalind Teague' }).click();
  await modal.getByPlaceholder('What happened?').fill('Met at the harbour office about the dredging records.');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal).toBeHidden();

  await first.close();
  const second = await launch();
  await unlock(second.page);
  const sidebar2 = second.page.locator('.sidebar');

  await sidebar2.locator('.sidebar-project-name', { hasText: 'Harbour Inquiry' }).click();
  await expect(second.page.locator('tr', { hasText: 'Rosalind Teague' })).toBeVisible();
  await sidebar2.locator('.sidebar-project-sub-btn', { hasText: 'Timeline' }).click();
  await expect(second.page.locator('.ptl-entry-body', { hasText: 'Met at the harbour office about the dredging records.' })).toBeVisible();
});

test('contacts import from a CSV file', async ({ launch }) => {
  const { app, page } = await launch();
  await createVault(page);
  await unlock(page);

  await answerFileDialog(app, 'open', join(__dirname, 'fixtures', 'contacts.csv'));
  await page.locator('.sidebar').getByRole('button', { name: 'Import contacts' }).click();
  await page.getByRole('button', { name: 'Choose file & import' }).click();
  await expect(page.locator('.ir-count')).toHaveText('2');
  await page.keyboard.press('Escape');

  // All contacts draws only the rows in view, so look the new contacts up instead.
  const results = page.locator('.search-results');
  await page.locator('.sidebar-search-btn').click();
  await page.locator('.search-input').fill('Imogen');
  await expect(results.getByText('Imogen Varga')).toBeVisible();
  await page.locator('.search-input').fill('Achterberg');
  await expect(results.getByText('Achterberg, Desmond')).toBeVisible();
});

test('a backup is written where the reporter saves it', async ({ launch, home }) => {
  const { app, page } = await launch();
  await createVault(page);
  await unlock(page);

  // A folder name with a space, as many real ones have.
  const folder = join(home, 'My Backups');
  mkdirSync(folder);
  const file = join(folder, 'vault.sourcerer-backup');
  await answerFileDialog(app, 'save', file);

  await page.locator('.sidebar').getByTitle('Settings').click();
  await page.getByRole('button', { name: 'Export backup' }).click();
  await page.getByPlaceholder('Master password').fill(PASSWORD);
  await page.locator('.sv-wipe-confirm').getByRole('button', { name: 'Export backup' }).click();
  await expect(page.getByText('Backup saved.')).toBeVisible({ timeout: 60_000 });
  expect(statSync(file).size).toBeGreaterThan(4096);
});
