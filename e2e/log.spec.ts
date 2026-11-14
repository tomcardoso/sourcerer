// Interactions and reminders: adding, editing, completing and deleting them, each checked after a
// restart.

import {
  addContact, createVault, detailSection, expect, nav, openContact, restart, sidebar, test, unlock,
} from './sourcerer';

test('an interaction can be logged, edited and deleted, and each change outlasts a restart', async ({ launch }) => {
  let s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  await addContact(s.page, 'Esmeralda Rook');

  let log = detailSection(s.page, 'Interaction Log');
  await log.getByRole('button', { name: '+ Add' }).click();
  await log.getByPlaceholder('Log an interaction…').fill('Phoned about the zoning appeal.');
  await log.locator('.pt-log-submit').click();
  await expect(log.locator('.pt-log-row-body')).toHaveText('Phoned about the zoning appeal.');

  await log.getByRole('button', { name: 'Edit entry' }).click();
  await log.locator('.pt-log-input').fill('Phoned about the zoning appeal; she will send the minutes.');
  await log.locator('.pt-log-submit').click();
  await expect(log.locator('.pt-log-row-body')).toHaveText('Phoned about the zoning appeal; she will send the minutes.');

  s = await restart(s, launch);
  await openContact(s.page, 'Esmeralda Rook');
  log = detailSection(s.page, 'Interaction Log');
  await expect(log.locator('.pt-log-row-body')).toHaveText('Phoned about the zoning appeal; she will send the minutes.');
  await expect(s.page.locator('.detail-panel .view-kicker')).toContainText('1 interaction');

  await log.getByRole('button', { name: 'Delete entry' }).click();
  await log.locator('.pt-log-row-confirm-yes').click();
  await expect(log.locator('.pt-log-row')).toHaveCount(0);

  s = await restart(s, launch);
  await openContact(s.page, 'Esmeralda Rook');
  await expect(detailSection(s.page, 'Interaction Log').getByText('No entries yet.')).toBeVisible();
});

test('a reminder can be set, edited, completed, reopened and deleted, and each change outlasts a restart', async ({ launch }) => {
  let s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  await addContact(s.page, 'Florian Gatsby');
  await s.page.keyboard.press('Escape');

  const modal = s.page.locator('.modal-card');
  await sidebar(s.page).getByRole('button', { name: 'Set reminder' }).click();
  await modal.getByPlaceholder('Search contacts…').fill('Florian');
  await modal.locator('.qlm-dropdown-option', { hasText: 'Florian Gatsby' }).click();
  await modal.getByPlaceholder('What do you want to be reminded about?').fill('Ask for the tender documents');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal).toBeHidden();

  const inList = (note: string) => s.page.locator('.reminders-item', { hasText: 'Florian Gatsby' }).filter({ hasText: note });
  await nav(s.page, 'Reminders');
  await expect(inList('Ask for the tender documents')).toBeVisible();

  // Edit, then complete it, from the contact's details.
  let reminders = detailSection(s.page, 'Reminders');
  await openContact(s.page, 'Florian Gatsby');
  await reminders.getByRole('button', { name: 'Edit', exact: true }).click();
  await reminders.getByPlaceholder('Note').fill('Ask for the signed tender documents');
  await reminders.locator('.pt-log-submit').click();
  await expect(reminders.locator('.pt-reminder-row')).toContainText('Ask for the signed tender documents');
  await reminders.getByTitle('Mark complete').check();

  s = await restart(s, launch);
  await nav(s.page, 'Reminders');
  await expect(inList('Ask for the signed tender documents')).toHaveCount(0);
  await openContact(s.page, 'Florian Gatsby');
  reminders = detailSection(s.page, 'Reminders');
  await expect(reminders.getByTitle('Mark incomplete')).toBeChecked();

  // Reopen it, then delete it from the Reminders view.
  await reminders.getByTitle('Mark incomplete').uncheck();
  await expect(reminders.getByTitle('Mark complete')).not.toBeChecked();
  await s.page.keyboard.press('Escape');
  await nav(s.page, 'Reminders');
  await expect(inList('Ask for the signed tender documents')).toBeVisible();
  await inList('Ask for the signed tender documents').getByTitle('Delete reminder').click();
  await expect(inList('Ask for the signed tender documents')).toHaveCount(0);

  s = await restart(s, launch);
  await nav(s.page, 'Reminders');
  await expect(inList('Ask for the signed tender documents')).toHaveCount(0);
  await openContact(s.page, 'Florian Gatsby');
  await expect(detailSection(s.page, 'Reminders').getByText('No reminders set.')).toBeVisible();
});
