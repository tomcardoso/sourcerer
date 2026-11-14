// Smoke test: creates a vault, unlocks it (which fills it with the dev seeds), and visits every
// main screen in the light and the dark theme. An uncaught error in the window, or an error
// message on a screen, fails it.

import type { Page } from '@playwright/test';
import { createVault, expect, test, unlock } from './sourcerer';

// Messages the app shows when something has gone wrong. (Not `.sv-error`: Settings uses it for a
// warning about the reporter's own setup, which the dev seeds trigger.)
const ERROR_STATES = [
  '.sv-error-inline',
  '.sync-error-banner',
  '.setup-error',
  '.unlock-error',
  '.ac-submit-error',
  '.ir-error',
  '.diagnostics-error',
].join(', ');

test('every screen renders in both themes', async ({ launch }) => {
  const { page, errors } = await launch();
  await createVault(page);
  await unlock(page);

  const sidebar = page.locator('.sidebar');
  const nav = (name: string) => sidebar.locator('.sidebar-nav-item', { hasText: name }).click();
  const project = sidebar.locator('.sidebar-project-name', { hasText: 'Millgate Land Deal' });
  const subTimeline = sidebar.locator('.sidebar-project-sub-btn', { hasText: 'Timeline' });

  const screens: [string, (page: Page) => Promise<void>][] = [
    ['all contacts', async () => {
      await nav('All contacts');
      await expect(page.locator('tr', { hasText: 'Catherine Mwangi' }).first()).toBeVisible();
    }],
    ['contact detail', async () => {
      await page.locator('tr', { hasText: 'Catherine Mwangi' }).first().click();
      await expect(page.locator('.detail-panel')).toBeVisible();
    }],
    ['all contacts timeline', async () => {
      await page.keyboard.press('Escape');
      await expect(page.locator('.detail-panel')).toBeHidden();
      await subTimeline.click();
    }],
    ['project', async () => {
      await project.click();
      await expect(page.locator('tr').nth(1)).toBeVisible();
    }],
    ['project timeline', () => subTimeline.click()],
    ['reminders', () => nav('Reminders')],
    ['mentions', () => nav('Mentions')],
    ['settings', async () => {
      await sidebar.getByTitle('Settings').click();
      await expect(page.getByRole('button', { name: 'Export backup' })).toBeVisible();
    }],
    ['search', async () => {
      await sidebar.locator('.sidebar-search-btn').click();
      await page.keyboard.type('okafor');
      await expect(page.locator('.modal-card, .search-modal').first()).toBeVisible();
    }],
  ];

  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    for (const [name, visit] of screens) {
      await visit(page);
      await page.waitForTimeout(500);
      await expect(page.locator(ERROR_STATES).filter({ visible: true }), `${name} (${theme}) shows an error`).toHaveCount(0);
      expect(errors, `${name} (${theme})`).toEqual([]);
    }
    await page.keyboard.press('Escape');
  }
});
