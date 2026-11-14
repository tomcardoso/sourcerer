// The vault itself: its encryption (Argon2id + SQLCipher) on each platform, where it lives on
// disk, and taking it apart. File dialogs are answered in the main process (answerFileDialog).

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  addContact, answerFileDialog, createVault, createVaultAt, defaultVaultOf, expect,
  openContact, openSettings, PASSWORD, settingsField, test, unlock, userDataOf, waitForSetup,
} from './sourcerer';

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

test('a changed password replaces the old one, after a restart too', async ({ launch, home }) => {
  const s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  const NEW = 'harbour lantern quiet moss';

  await openSettings(s.page);
  await settingsField(s.page, 'Current password').fill(PASSWORD);
  await settingsField(s.page, 'New password').fill(NEW);
  await settingsField(s.page, 'Confirm new password').fill(NEW);
  await s.page.getByRole('button', { name: 'Update password' }).click();
  await expect(s.page.locator('.sv-success')).toBeVisible({ timeout: 60_000 });

  await s.close();
  const again = await launch(home);
  await again.page.fill('#password', PASSWORD);
  await again.page.keyboard.press('Enter');
  await expect(again.page.locator('.unlock-error')).toBeVisible({ timeout: 60_000 });
  await unlock(again.page, NEW);
});

test('a vault created in a chosen folder lives there', async ({ launch, home }) => {
  const bundle = join(home, 'Reporting Files', 'Desk Vault.sourcerer');
  const s = await launch();
  await createVaultAt(s, bundle);
  await unlock(s.page);
  expect(readdirSync(bundle).sort()).toEqual(expect.arrayContaining(['db.sqlite', 'salt']));
  expect(existsSync(defaultVaultOf(home))).toBe(false);
});

test('a moved vault opens from its new folder, here and on another computer', async ({ launch, home, newHome }) => {
  const s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  await addContact(s.page, 'Wilhelmina Oduya');

  const moved = join(home, 'Portable Drive', 'Moved Vault.sourcerer');
  await answerFileDialog(s.app, 'save', moved);
  await openSettings(s.page);
  await s.page.getByRole('button', { name: 'Move vault' }).click();
  // Moving locks the app, to unlock against the new location.
  await unlock(s.page);
  expect(readdirSync(moved)).toEqual(expect.arrayContaining(['db.sqlite', 'salt']));
  expect(existsSync(join(defaultVaultOf(home), 'db.sqlite'))).toBe(false);
  await openContact(s.page, 'Wilhelmina Oduya');
  await s.close();

  // Another computer: a fresh install opens the vault with "Open existing vault…".
  const other = await launch(newHome());
  await waitForSetup(other.page);
  await answerFileDialog(other.app, 'open', moved);
  await other.page.getByRole('button', { name: 'Open existing vault…' }).click();
  await unlock(other.page);
  await openContact(other.page, 'Wilhelmina Oduya');
});

test('wiping all data destroys the vault and starts over', async ({ launch, home }) => {
  const s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  const vault = defaultVaultOf(home);
  expect(existsSync(join(vault, 'db.sqlite'))).toBe(true);

  await openSettings(s.page);
  await s.page.getByRole('button', { name: 'Wipe all data' }).click();
  await s.page.getByPlaceholder('Type WIPE').fill('WIPE');
  const quit = s.app.waitForEvent('close');
  await s.page.getByRole('button', { name: 'Destroy all data' }).click();
  await quit; // The app quits once the files are gone.

  expect(existsSync(vault)).toBe(false);
  expect(existsSync(join(userDataOf(home), 'vault.json'))).toBe(false);
  const after = await launch(home);
  await waitForSetup(after.page);
});

test('the window can be reopened after it is closed (macOS keeps running)', async ({ launch }) => {
  test.skip(process.platform !== 'darwin', 'Only macOS keeps the app running with no window');
  const s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  const reopened = s.app.waitForEvent('window');
  await s.app.evaluate(({ BrowserWindow, app }) => {
    BrowserWindow.getAllWindows()[0].close();
    setTimeout(() => app.emit('activate'), 500);
  });
  const page = await reopened;
  // Closing the window closed the database, so the reporter unlocks again.
  await unlock(page);
});
