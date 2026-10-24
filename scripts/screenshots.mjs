// Screenshots of the app for the README, the docs and the website (`npm run screenshots`, after
// `npm run build` and `npm run rebuild`; needs xvfb-run on headless Linux).
//
// Launches the built app in a throwaway home folder, creates a vault, and unlocks it. The app is
// not packaged, so it counts as a dev build and fills the vault with the fictional dev seeds
// (src/main/database/dev-seeds*.ts). Each screen is then captured at twice the pixel density, in
// the light and the dark theme, into docs/images/ (`app-<name>.png` and `app-<name>-dark.png`).
// Nothing here is a test: it fails only if a screen cannot be reached.

import { _electron as electron } from 'playwright-core';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'images');
const W = 1600;
const H = 1000;
const PASSWORD = 'coral fence orbit lamp';

const home = mkdtempSync(join(tmpdir(), 'sourcerer-shots-'));
mkdirSync(OUT, { recursive: true });

const app = await electron.launch({
  args: [ROOT, '--no-sandbox'],
  // A fresh HOME (and XDG_CONFIG_HOME, which Linux's userData follows) keeps the capture's vault
  // apart from any real one.
  env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), TZ: 'America/Toronto' },
});

try {
  const page = await app.firstWindow();
  const cdp = await page.context().newCDPSession(page);
  const pause = (ms) => page.waitForTimeout(ms);

  // Chrome's own capture, which honours the 2x device metrics (page.screenshot does not, in
  // Electron).
  async function capture(name, { width = W, height = H, themes = ['light', 'dark'], before } = {}) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
    for (const theme of themes) {
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
      if (before) await before();
      await page.mouse.move(width - 4, 4);
      await pause(700);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const file = `app-${name}${theme === 'dark' ? '-dark' : ''}.png`;
      writeFileSync(join(OUT, file), Buffer.from(data, 'base64'));
      console.log(`  ${file}`);
    }
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  }

  // ── Set up and unlock a vault ────────────────────────────────────────────────────────────
  await page.waitForSelector('.setup-root', { timeout: 90_000 });
  await page.getByRole('button', { name: 'Use default location' }).click();
  await page.fill('#firstName', 'Alex');
  await page.fill('#lastName', 'Morgan');
  await page.fill('#email', 'alex.morgan@newsroom.ca');
  await page.fill('#password', PASSWORD);
  await page.fill('#confirmPassword', PASSWORD);
  await page.check('input[name=acknowledgedNoRecovery]');
  await page.getByRole('button', { name: 'Create my vault' }).click();

  await page.waitForSelector('.unlock-label', { timeout: 60_000 });
  await capture('unlock', { width: 560, height: 520 });
  await page.fill('#password', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.sidebar', { timeout: 60_000 });
  await page.setViewportSize({ width: W, height: H });
  await pause(2500);

  const sidebar = page.locator('.sidebar');
  const project = (name) => sidebar.locator('.sidebar-project-name', { hasText: name });

  // ── The screens ──────────────────────────────────────────────────────────────────────────
  await capture('contacts');

  await page.locator('tr', { hasText: 'Catherine Mwangi' }).first().click();
  await page.waitForSelector('.detail-panel');
  await pause(800);
  await capture('contact');
  // Redaction mode, as the app's own shortcut toggles it.
  await page.evaluate(() => document.body.classList.add('redacted'));
  await capture('redacted');
  await page.evaluate(() => document.body.classList.remove('redacted'));
  await page.keyboard.press('Escape');
  await pause(600);

  await page.getByRole('button', { name: /duplicate/i }).first().click();
  await page.waitForSelector('.modal-card');
  await capture('duplicates');
  await page.keyboard.press('Escape');
  await pause(600);

  await project('Millgate Land Deal').click();
  await pause(1500);
  await capture('project');

  await sidebar.locator('.sidebar-project-sub-btn', { hasText: 'Timeline' }).click();
  await pause(1500);
  await capture('timeline');

  await sidebar.getByRole('button', { name: /Reminders/ }).click();
  await pause(1500);
  await capture('reminders');

  await sidebar.getByRole('button', { name: /Mentions/ }).click();
  await pause(1500);
  await capture('mentions');

  await sidebar.getByRole('button', { name: /All contacts/ }).click();
  await pause(1000);
  await page.keyboard.press('Control+k');
  await page.waitForSelector('.modal-card, .search-modal', { timeout: 10_000 });
  await page.keyboard.type('okafor', { delay: 40 });
  await pause(1200);
  await capture('search');
  await page.keyboard.press('Escape');
} finally {
  await app.close();
  rmSync(home, { recursive: true, force: true });
}
