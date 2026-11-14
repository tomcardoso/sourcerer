// Projects: what's in one survives a restart, editing, archiving and deleting one, exporting it,
// and sharing one between two reporters through a shared file, each in their own app.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  addContact, answerFileDialog, createProject, createVault, expect, openContact, projectInSidebar,
  restart, sidebar, test, unlock, type Sourcerer,
} from './sourcerer';

test('a project, contact and interaction are still there after a restart', async ({ launch }) => {
  let s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  await createProject(s.page, 'Harbour Inquiry');
  await addContact(s.page, 'Rosalind Teague', { projects: ['Harbour Inquiry'] });

  const modal = s.page.locator('.modal-card');
  await sidebar(s.page).getByRole('button', { name: 'Log interaction' }).click();
  await modal.getByPlaceholder('Search contacts…').fill('Rosalind');
  await modal.locator('.qlm-dropdown-option', { hasText: 'Rosalind Teague' }).click();
  await modal.getByPlaceholder('What happened?').fill('Met at the harbour office about the dredging records.');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal).toBeHidden();

  s = await restart(s, launch);
  await projectInSidebar(s.page, 'Harbour Inquiry').click();
  await expect(s.page.locator('tr', { hasText: 'Rosalind Teague' })).toBeVisible();
  await sidebar(s.page).locator('.sidebar-project-sub-btn', { hasText: 'Timeline' }).click();
  await expect(s.page.locator('.ptl-entry-body', { hasText: 'Met at the harbour office about the dredging records.' })).toBeVisible();
});

test("a contact's status and priority in a project outlast a restart", async ({ launch }) => {
  let s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  await createProject(s.page, 'Water Board Audit');
  await addContact(s.page, 'Ignatius Pell', { projects: ['Water Board Audit'] });

  const fields = async (panel = s.page.locator('.detail-panel')) => {
    await panel.locator('.detail-tab', { hasText: 'Project' }).click();
    const select = (label: string) => panel.locator('.pt-field').filter({ has: s.page.locator('.pt-label', { hasText: label }) }).locator('select');
    return { status: select('Status'), priority: select('Priority') };
  };
  let { status, priority } = await fields();
  await status.selectOption({ index: 2 });
  await priority.selectOption({ index: 1 });
  const chosen = { status: await status.inputValue(), priority: await priority.inputValue() };
  expect(chosen.status).not.toBe('');
  expect(chosen.priority).not.toBe('');

  s = await restart(s, launch);
  ({ status, priority } = await fields(await openContact(s.page, 'Ignatius Pell')));
  await expect(status).toHaveValue(chosen.status);
  await expect(priority).toHaveValue(chosen.priority);
});

test('a project can be renamed, archived, restored and deleted', async ({ launch }) => {
  let s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  await createProject(s.page, 'Transit Contracts');
  const row = (name: string) => sidebar(s.page).locator('li').filter({ has: s.page.locator('.sidebar-project-name', { hasText: name }) });

  await projectInSidebar(s.page, 'Transit Contracts').click();
  await s.page.getByRole('button', { name: '✎ Edit' }).click();
  const modal = s.page.locator('.modal-card');
  await modal.locator('.form-input').first().fill('Transit Contracts 2026');
  await modal.getByPlaceholder('Short slug line').fill('Who won the bus tenders');
  await modal.locator('button[type=submit]').click();
  await expect(modal).toBeHidden();
  await expect(projectInSidebar(s.page, 'Transit Contracts 2026')).toBeVisible();

  await row('Transit Contracts 2026').getByRole('button', { name: 'Archive project' }).click();
  await expect(projectInSidebar(s.page, 'Transit Contracts 2026')).toBeHidden();

  s = await restart(s, launch);
  await expect(projectInSidebar(s.page, 'Transit Contracts 2026')).toBeHidden();
  await sidebar(s.page).getByRole('button', { name: /Show archived/ }).click();
  await row('Transit Contracts 2026').getByRole('button', { name: 'Unarchive project' }).click();
  await expect(projectInSidebar(s.page, 'Transit Contracts 2026')).toBeVisible();

  await row('Transit Contracts 2026').getByRole('button', { name: 'Delete project' }).click();
  await sidebar(s.page).locator('.sidebar-delete-yes').click();
  await expect(projectInSidebar(s.page, 'Transit Contracts 2026')).toBeHidden();

  s = await restart(s, launch);
  await expect(projectInSidebar(s.page, 'Transit Contracts 2026')).toHaveCount(0);
});

test("a project's contacts export as CSV, Excel and vCard files", async ({ launch, home }) => {
  const { app, page } = await launch();
  await createVault(page);
  await unlock(page);
  await projectInSidebar(page, 'Millgate Land Deal').click();
  await expect(page.locator('tr').nth(1)).toBeVisible();

  // The CSV and Excel exports rename a finished file into place; the vCard one writes it
  // directly, so wait for what it should end with.
  const exportAs = async (item: string, file: string, ending?: string) => {
    await answerFileDialog(app, 'save', file);
    await page.getByRole('button', { name: '↓ Export' }).click();
    await page.locator('.export-menu-item', { hasText: item }).click();
    await expect.poll(() => (existsSync(file) ? readFileSync(file, 'utf8').trimEnd().endsWith(ending ?? '') : false), { timeout: 30_000 }).toBe(true);
    return readFileSync(file);
  };
  expect((await exportAs('Full export', join(home, 'millgate.csv'))).toString('utf8').split('\n').length).toBeGreaterThan(2);
  expect((await exportAs('Sanitized export', join(home, 'millgate.xlsx'))).subarray(0, 2).toString('latin1')).toBe('PK');
  expect((await exportAs('Export as Outlook CSV', join(home, 'outlook.csv'))).length).toBeGreaterThan(0);
  expect((await exportAs('Export as vCard', join(home, 'millgate.vcf'), 'END:VCARD')).toString('utf8')).toContain('BEGIN:VCARD');
});

/** Opens a shared project and syncs it with the shared file. */
async function syncProject(s: Sourcerer, name: string): Promise<void> {
  await projectInSidebar(s.page, name).click();
  await s.page.getByRole('button', { name: '↻ Sync' }).click();
  await expect(s.page.getByRole('button', { name: '↻ Sync' })).toBeEnabled({ timeout: 30_000 });
  await expect(s.page.locator('.sync-error-banner')).toHaveCount(0);
}

test('two reporters share a project through a shared file', async ({ launch, home, newHome }) => {
  // The shared file sits in a folder both "computers" can reach, as a synced folder would.
  const sharedFile = join(home, 'Shared Folder', 'harbour-desk.sourcerer');
  mkdirSync(dirname(sharedFile));

  const alex = await launch();
  await createVault(alex.page);
  await unlock(alex.page);
  await answerFileDialog(alex.app, 'save', sharedFile);
  await alex.page.locator('.sidebar').getByRole('button', { name: 'New project' }).click();
  await alex.page.fill('#proj-name', 'Harbour Desk');
  await alex.page.locator('.modal-card').getByText('Shared project').click();
  await alex.page.locator('.modal-card').getByRole('button', { name: 'Create project' }).click();
  const link = await alex.page.locator('.setup-payload-text').inputValue();
  expect(link.length).toBeGreaterThan(20);
  await alex.page.getByRole('button', { name: 'Done' }).click();
  expect(existsSync(sharedFile)).toBe(true);

  await addContact(alex.page, 'Cordelia Fenwick', { projects: ['Harbour Desk'] });
  await alex.page.keyboard.press('Escape');
  await syncProject(alex, 'Harbour Desk');

  // A second reporter, with a vault of their own, joins with the link.
  const sam = await launch(newHome());
  await createVault(sam.page, { first: 'Sam', last: 'Okoye', email: 'sam.okoye@newsroom.ca' });
  await unlock(sam.page);
  await sam.page.locator('.sidebar-join-project').click();
  const join_ = sam.page.locator('.modal-card');
  await join_.locator('#join-payload').fill(link);
  await expect(join_.locator('.join-preview-value')).toHaveText('Harbour Desk');
  await answerFileDialog(sam.app, 'open', sharedFile);
  await join_.getByRole('button', { name: 'Locate shared file…' }).click();
  await join_.getByRole('button', { name: 'Join project' }).click();
  await expect(join_).toBeHidden({ timeout: 30_000 });

  await projectInSidebar(sam.page, 'Harbour Desk').click();
  await expect(sam.page.locator('tr', { hasText: 'Cordelia Fenwick' })).toBeVisible({ timeout: 30_000 });

  // And what the second reporter adds reaches the first.
  await addContact(sam.page, 'Percival Amsel', { projects: ['Harbour Desk'] });
  await sam.page.keyboard.press('Escape');
  await syncProject(sam, 'Harbour Desk');
  await syncProject(alex, 'Harbour Desk');
  await expect(alex.page.locator('tr', { hasText: 'Percival Amsel' })).toBeVisible({ timeout: 30_000 });
});

test('a local project can be turned into a shared one', async ({ launch, home }) => {
  const s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  const file = join(home, 'Shared Folder', 'millgate.sourcerer');
  mkdirSync(dirname(file));
  await answerFileDialog(s.app, 'save', file);

  await projectInSidebar(s.page, 'Millgate Land Deal').click();
  await s.page.getByRole('button', { name: '+ Share project' }).click();
  await expect(s.page.locator('.setup-payload-text')).not.toHaveValue('');
  await s.page.getByRole('button', { name: 'Done' }).click();
  expect(existsSync(file)).toBe(true);
  await syncProject(s, 'Millgate Land Deal');
  await expect(sidebar(s.page).locator('.sidebar-project-btn', { hasText: 'Millgate Land Deal' }).getByRole('img', { name: 'Shared' })).toBeVisible();

  const again = await restart(s, launch);
  await syncProject(again, 'Millgate Land Deal');
});
