// Contacts: adding, editing, tagging and deleting them (each checked after a restart), importing
// and exporting them as files, and merging duplicates.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addContact, answerFileDialog, createProject, createVault, detailSection, expect, nav, openContact, restart, search,
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

test('unsaved edits in a contact are kept, saved or discarded on request before they would be lost', async ({ launch }) => {
  let s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  await createProject(s.page, 'Harbour Inquiry');
  await addContact(s.page, 'Odessa Quill', { projects: ['Harbour Inquiry'] });

  let panel = s.page.locator('.detail-panel');
  const prompt = s.page.locator('.modal-card', { hasText: 'Unsaved changes' });
  const tab = (name: string) => panel.locator('.detail-tab', { hasText: name });
  const notes = panel.locator('.form-textarea');

  // Switching tabs mid-edit asks first; keeping on editing leaves the text alone.
  await panel.getByRole('button', { name: 'Edit', exact: true }).click();
  await notes.fill('Met at the port authority hearing.');
  await tab('Project').click();
  await expect(prompt).toContainText('Changes to Odessa Quill’s details');
  await prompt.getByRole('button', { name: 'Keep editing' }).click();
  await expect(prompt).toBeHidden();
  await expect(notes).toHaveValue('Met at the port authority hearing.');

  // Discarding throws the text away and goes on.
  await tab('Project').click();
  await prompt.getByRole('button', { name: 'Discard' }).click();
  await expect(tab('Project')).toHaveClass(/detail-tab--active/);
  await tab('Global').click();
  await expect(panel.locator('.detail-notes')).toHaveCount(0);

  // Saving keeps it and goes on.
  await panel.getByRole('button', { name: 'Edit', exact: true }).click();
  await notes.fill('Met at the port authority hearing.');
  await tab('Project').click();
  await prompt.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(tab('Project')).toHaveClass(/detail-tab--active/);

  // A half-written log entry asks before Escape closes the drawer, and can be saved from there.
  await detailSection(s.page, 'Interaction Log').getByRole('button', { name: '+ Add' }).click();
  await panel.getByPlaceholder('Log an interaction…').fill('Left a voicemail.');
  await s.page.keyboard.press('Escape');
  await expect(prompt).toContainText('New interaction log entry for Harbour Inquiry');
  await prompt.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel).toBeHidden();

  s = await restart(s, launch);
  panel = await openContact(s.page, 'Odessa Quill');
  await expect(panel.locator('.detail-notes')).toHaveText('Met at the port authority hearing.');
  await expect(panel.locator('.pt-log-row-body')).toHaveText('Left a voicemail.');
});

test('changing project, opening another contact or going elsewhere asks only about edits it would lose', async ({ launch }) => {
  let s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  await createProject(s.page, 'Harbour Inquiry');
  await createProject(s.page, 'Ferry Contracts');
  await addContact(s.page, 'Cyrus Holt');
  await addContact(s.page, 'Rosalind Vane', { projects: ['Harbour Inquiry', 'Ferry Contracts'] });
  await s.page.keyboard.press('Escape');
  await expect(s.page.locator('.detail-panel')).toBeHidden();

  const prompt = s.page.locator('.modal-card', { hasText: 'Unsaved changes' });
  let panel = await openContact(s.page, 'Rosalind Vane');
  await panel.locator('.detail-tab', { hasText: 'Project' }).click();
  const projectSelect = panel.locator('.pt-project-select');
  const startEntry = async (text: string) => {
    await detailSection(s.page, 'Interaction Log').getByRole('button', { name: '+ Add' }).click();
    await panel.getByPlaceholder('Log an interaction…').fill(text);
  };

  // Changing project
  const first = await projectSelect.inputValue();
  const second = await projectSelect.locator('option').evaluateAll((os, v) => os.map((o) => (o as HTMLOptionElement).value).find((x) => x !== v)!, first);
  await startEntry('Asked about the ferry tender.');
  await projectSelect.selectOption(second);
  await expect(prompt).toContainText('New interaction log entry');
  await prompt.getByRole('button', { name: 'Keep editing' }).click();
  await expect(projectSelect).toHaveValue(first);
  await expect(panel.getByPlaceholder('Log an interaction…')).toHaveValue('Asked about the ferry tender.');
  await projectSelect.selectOption(second);
  await prompt.getByRole('button', { name: 'Discard' }).click();
  await expect(projectSelect).toHaveValue(second);
  await expect(panel.getByPlaceholder('Log an interaction…')).toHaveCount(0);

  // Going to another view leaves the drawer opened from search, and its edits, alone.
  await startEntry('Waiting on the minutes.');
  await nav(s.page, 'Reminders');
  await expect(prompt).toBeHidden();
  await expect(panel.getByPlaceholder('Log an interaction…')).toHaveValue('Waiting on the minutes.');

  // Opening another contact
  await search(s.page, 'Cyrus Holt');
  await searchResults(s.page).getByText('Cyrus Holt', { exact: true }).first().click();
  await expect(prompt).toContainText('New interaction log entry');
  await prompt.getByRole('button', { name: 'Discard' }).click();
  await expect(panel.locator('.detail-name')).toHaveText('Cyrus Holt');

  // A typed theme saves, without asking, when Escape closes the drawer.
  panel = await openContact(s.page, 'Rosalind Vane');
  await panel.locator('.detail-tab', { hasText: 'Project' }).click();
  await panel.getByPlaceholder('e.g. accounting issues, police investigation…').fill('Procurement');
  await s.page.keyboard.press('Escape');
  await expect(prompt).toBeHidden();
  await expect(panel).toBeHidden();

  s = await restart(s, launch);
  panel = await openContact(s.page, 'Rosalind Vane');
  await panel.locator('.detail-tab', { hasText: 'Project' }).click();
  await expect(panel.getByPlaceholder('e.g. accounting issues, police investigation…')).toHaveValue('Procurement');
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
