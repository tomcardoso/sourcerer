// Contacts: adding, editing, tagging and deleting them (each checked after a restart), importing
// and exporting them as files, and merging duplicates.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addContact, answerFileDialog, createVault, expect, nav, openContact, restart, search,
  searchResults, sidebar, test, unlock,
} from './sourcerer';

test('a contact can be edited, tagged and deleted, and each change outlasts a restart', async ({ launch }) => {
  let s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  await addContact(s.page, 'Bartholomew Quist', { organization: 'Calder Port Authority' });

  // Edit
  let panel = s.page.locator('.detail-panel');
  await panel.getByRole('button', { name: 'Edit', exact: true }).click();
  const field = (label: string) => panel.locator('.form-field').filter({ has: s.page.locator('.form-label', { hasText: label }) }).locator('input').first();
  await field('Organization').fill('Calder Harbour Commission');
  await field('Title / Role').fill('Deputy Harbourmaster');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel.locator('.detail-org')).toHaveText('Calder Harbour Commission · Deputy Harbourmaster');

  // Tag
  await panel.locator('.tags-input').fill('dredging');
  await panel.locator('.tags-input').press('Enter');
  await expect(panel.locator('.tags-chip', { hasText: 'dredging' })).toBeVisible();

  s = await restart(s, launch);
  panel = await openContact(s.page, 'Bartholomew Quist');
  await expect(panel.locator('.detail-org')).toHaveText('Calder Harbour Commission · Deputy Harbourmaster');
  await expect(panel.locator('.tags-chip', { hasText: 'dredging' })).toBeVisible();

  // Untag and delete
  await panel.getByRole('button', { name: 'Remove tag dredging' }).click();
  await expect(panel.locator('.tags-chip')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Delete contact' }).click();
  await panel.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(panel).toBeHidden();

  s = await restart(s, launch);
  await search(s.page, 'Bartholomew');
  await expect(s.page.locator('.search-empty')).toBeVisible();
});

test('contacts import from a CSV file', async ({ launch }) => {
  const { app, page } = await launch();
  await createVault(page);
  await unlock(page);

  await answerFileDialog(app, 'open', join(__dirname, 'fixtures', 'contacts.csv'));
  await sidebar(page).getByRole('button', { name: 'Import contacts' }).click();
  await page.getByRole('button', { name: 'Choose file & import' }).click();
  await expect(page.locator('.ir-count')).toHaveText('2');
  await page.keyboard.press('Escape');

  await search(page, 'Imogen');
  await expect(searchResults(page).getByText('Imogen Varga')).toBeVisible();
  await search(page, 'Achterberg');
  await expect(searchResults(page).getByText('Achterberg, Desmond')).toBeVisible();
});

test('contacts import from a vCard file', async ({ launch }) => {
  const { app, page } = await launch();
  await createVault(page);
  await unlock(page);

  await answerFileDialog(app, 'open', join(__dirname, 'fixtures', 'contacts.vcf'));
  await sidebar(page).getByRole('button', { name: 'Import contacts' }).click();
  await page.getByRole('button', { name: 'vCard (.vcf)' }).click();
  await page.getByRole('button', { name: 'Choose file & import' }).click();
  await expect(page.locator('.ir-count')).toHaveText('1');
  await page.keyboard.press('Escape');

  const panel = await openContact(page, 'Ottoline Prasad');
  await expect(panel.getByText('ottoline.prasad@example.org')).toBeVisible();
});

test('contacts export as CSV, Excel and vCard files', async ({ launch, home }) => {
  const { app, page } = await launch();
  await createVault(page);
  await unlock(page);
  await nav(page, 'All contacts');
  // The CSV and Excel exports rename a finished file into place; the vCard ones write it
  // directly, so wait for what it should end with.
  const exportAs = async (item: string, file: string, ending?: string) => {
    await answerFileDialog(app, 'save', file);
    await page.getByRole('button', { name: '↓ Export' }).click();
    await page.locator('.export-menu-item', { hasText: item }).click();
    await expect.poll(() => (existsSync(file) ? readFileSync(file, 'utf8').trimEnd().endsWith(ending ?? '') : false), { timeout: 30_000 }).toBe(true);
    return readFileSync(file);
  };

  const csv = await exportAs('Export as CSV / Excel', join(home, 'all contacts.csv'));
  expect(csv.toString('utf8')).toContain('Catherine Mwangi');
  const xlsx = await exportAs('Export as CSV / Excel', join(home, 'all contacts.xlsx'));
  expect(xlsx.subarray(0, 2).toString('latin1')).toBe('PK'); // an .xlsx is a zip
  const gmail = await exportAs('Export as Gmail CSV', join(home, 'gmail.csv'));
  expect(gmail.toString('utf8')).toContain('Catherine');
  const vcf = await exportAs('Export as vCard', join(home, 'all contacts.vcf'), 'END:VCARD');
  expect(vcf.toString('utf8')).toContain('BEGIN:VCARD');

  const one = join(home, 'one contact.vcf');
  await answerFileDialog(app, 'save', one);
  const panel = await openContact(page, 'Catherine Mwangi');
  await panel.getByRole('button', { name: '↓ vCard' }).click();
  await expect.poll(() => (existsSync(one) ? readFileSync(one, 'utf8').trimEnd().endsWith('END:VCARD') : false), { timeout: 30_000 }).toBe(true);
  expect(readFileSync(one, 'utf8')).toContain('Catherine Mwangi');
});

test('duplicate contacts merge into one', async ({ launch }) => {
  const { page } = await launch();
  await createVault(page);
  await unlock(page);
  // The dev seeds have duplicates of their own; the app scans for new ones in the background.
  await nav(page, 'All contacts');
  const dupButton = page.getByRole('button', { name: /duplicate/i }).first();
  const seeded = Number((await dupButton.textContent())?.match(/\d+/)?.[0] ?? 0);
  await addContact(page, 'Theodora Blackwood', { email: 'theo.blackwood@example.org' });
  await page.keyboard.press('Escape');
  await addContact(page, 'Theo Blackwood', { email: 'theo.blackwood@example.org' });
  await page.keyboard.press('Escape');

  await nav(page, 'All contacts');
  await expect(dupButton).toContainText(`${seeded + 1} duplicate`, { timeout: 30_000 });
  const count = sidebar(page).locator('.sidebar-contact-count');
  const before = Number(await count.textContent());
  await dupButton.click();
  const modal = page.locator('.dedup-modal');
  // Skip to the pair made here.
  for (let i = 0; i < 100; i++) {
    await expect(modal.locator('.dedup-progress')).toBeVisible();
    if (await modal.getByText('Theodora Blackwood').count()) break;
    const progress = await modal.locator('.dedup-progress').textContent();
    await modal.getByRole('button', { name: 'Skip' }).click();
    await expect(modal.locator('.dedup-progress')).not.toHaveText(progress ?? '');
  }
  await expect(modal.getByText('Theo Blackwood', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Merge both' }).click();
  await page.keyboard.press('Escape');

  await expect(count).toHaveText(String(before - 1));
  await search(page, 'Theo');
  await expect(searchResults(page).getByText(/^Theo(dora)? Blackwood$/)).toHaveCount(1);
});
