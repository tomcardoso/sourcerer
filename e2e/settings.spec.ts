// Settings: each one outlasts a restart, the ones with visible effects have them, and the
// diagnostics report (Help menu) saves to a file.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addContact, answerFileDialog, createVault, expect, openSettings, settingsField,
  settingsToggle, sidebar, test, unlock,
} from './sourcerer';

test('preferences outlast a restart', async ({ launch }) => {
  const s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  await openSettings(s.page);

  // The theme applies at once.
  await s.page.locator('.sv-theme-seg-btn', { hasText: 'dark' }).click();
  await expect(s.page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await settingsField(s.page, 'Auto-lock after', 'select').selectOption({ label: '1 hour' });
  await settingsToggle(s.page, 'Enable staleness indicator').click();
  await expect(settingsToggle(s.page, 'Enable staleness indicator')).toHaveAttribute('aria-pressed', 'false');
  await settingsField(s.page, 'First name', 'input').fill('Alexandra');
  await s.page.getByRole('button', { name: 'Save profile' }).click();
  await expect(sidebar(s.page).locator('.sidebar-user-name')).toHaveText('Alexandra Morgan');
  const calendar = s.page.locator('.sv-calendar-url');
  const oldUrl = await calendar.inputValue();
  await s.page.getByRole('button', { name: 'Regenerate token' }).click();
  await s.page.getByRole('button', { name: 'Yes, regenerate' }).click();
  await expect(calendar).not.toHaveValue(oldUrl);
  const newUrl = await calendar.inputValue();
  await s.close();

  // The theme is kept in the vault, so it applies once the vault is unlocked.
  const again = await launch();
  await unlock(again.page);
  await expect(again.page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await openSettings(again.page);
  await expect(again.page.locator('.sv-theme-seg-btn--active')).toHaveText('dark');
  await expect(settingsField(again.page, 'Auto-lock after', 'select')).toHaveValue('3600');
  await expect(settingsToggle(again.page, 'Enable staleness indicator')).toHaveAttribute('aria-pressed', 'false');
  await expect(sidebar(again.page).locator('.sidebar-user-name')).toHaveText('Alexandra Morgan');
  await expect(again.page.locator('.sv-calendar-url')).toHaveValue(newUrl);
});

test('phone numbers without a country code follow the default country', async ({ launch }) => {
  const { page } = await launch();
  await createVault(page);
  await unlock(page);
  await openSettings(page);
  await settingsField(page, 'Default country', 'select').selectOption('GB');

  await addContact(page, 'Philippa Hartnell', { phone: '07911 123456' });
  await expect(page.locator('.detail-panel').getByText('+44 7911 123456')).toBeVisible();
});

test('the diagnostics report saves to a file', async ({ launch, home }) => {
  const s = await launch();
  await createVault(s.page);
  await unlock(s.page);
  const file = join(home, 'diagnostics report.txt');
  await answerFileDialog(s.app, 'save', file);

  await s.app.evaluate(({ Menu }) => {
    const help = Menu.getApplicationMenu()?.items.find((i) => i.label === 'Help');
    help?.submenu?.items.find((i) => i.label.startsWith('Export Diagnostics Report'))?.click();
  });
  const modal = s.page.locator('.diagnostics-modal');
  await expect(modal.locator('.diagnostics-text')).toBeVisible({ timeout: 30_000 });
  await modal.getByRole('button', { name: 'Save…' }).click();
  await expect(modal).toBeHidden(); // closes once saved
  const report = readFileSync(file, 'utf8');
  expect(report.length).toBeGreaterThan(100);
  // The report describes the setup, never the vault's contents.
  expect(report).not.toContain('Catherine Mwangi');
  expect(report).not.toContain('alex.morgan@newsroom.ca');
});
