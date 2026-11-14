// Fixtures and helpers shared by the end-to-end specs.
//
// Every test gets a throwaway home folder (`home`, plus any made with `newHome`, for a second
// reporter) and launches the built app against one (`launch`), so tests run side by side and never
// touch a real vault. The app isn't packaged, so it counts as a dev build: creating a vault and
// unlocking it fills it with the fictional dev seeds (src/main/database/dev-seeds*.ts), as
// `npm run screenshots` does.
//
// Any uncaught error in the window (`pageerror`, which includes unhandled promise rejections) fails
// the test. A failed test keeps a Playwright trace of each launch and the app's diagnostics trace
// in test-results/.

import { _electron as electron, expect, test as base, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { copyFileSync, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
export const PASSWORD = 'coral fence orbit lamp';

export interface Sourcerer {
  app: ElectronApplication;
  page: Page;
  home: string;
  /** Uncaught errors in the window so far. */
  errors: string[];
  /** Quits the app, as a reporter would. Safe to call once the app has quit by itself. */
  close: () => Promise<void>;
}

export function userDataOf(home: string): string {
  return join(home, 'user-data');
}

/** Where "Use default location" puts the vault. */
export function defaultVaultOf(home: string): string {
  return join(userDataOf(home), 'Vault.sourcerer');
}

function makeHome(): string {
  // realpath: on macOS the temporary folder is reached through a symlink (/var → /private/var).
  return realpathSync(mkdtempSync(join(tmpdir(), 'sourcerer-e2e-')));
}

export const test = base.extend<{
  home: string;
  newHome: () => string;
  launch: (home?: string) => Promise<Sourcerer>;
}>({
  // eslint-disable-next-line no-empty-pattern
  newHome: async ({}, use, testInfo) => {
    const homes: string[] = [];
    await use(() => {
      const h = makeHome();
      homes.push(h);
      return h;
    });
    for (const h of homes) {
      const trace = join(userDataOf(h), 'diagnostics-trace.json');
      if (existsSync(trace)) copyFileSync(trace, testInfo.outputPath(`diagnostics-trace-${basename(h)}.json`));
      removeTestFolder(h);
    }
  },

  home: async ({ newHome }, use) => {
    await use(newHome());
  },

  launch: async ({ home }, use, testInfo) => {
    const open: Sourcerer[] = [];
    const errors: string[] = [];
    let launches = 0;

    await use(async (where = home) => {
      const n = ++launches;
      const app = await electron.launch({
        args: [ROOT, '--no-sandbox'],
        env: {
          ...process.env,
          // HOME for the home folder on macOS and Linux, XDG_CONFIG_HOME for Linux's config folder,
          // and SOURCERER_USER_DATA for the app's own folder, which on Windows follows neither.
          // Not USERPROFILE: Windows then can't find its known folders (Documents, Downloads),
          // which the file dialogs use as their starting place.
          HOME: where,
          XDG_CONFIG_HOME: join(where, '.config'),
          SOURCERER_USER_DATA: userDataOf(where),
        },
      });
      const proc = app.process();
      await app.context().tracing.start({ screenshots: true, snapshots: true });
      // The dev seeds have overdue outreach reminders; their notifications would pop up on the
      // machine running the tests.
      await app.evaluate(({ Notification }) => {
        Notification.prototype.show = function () {};
      });
      // Every window the app opens, including one reopened after its first is closed.
      const watched = new Set<Page>();
      const watch = (p: Page) => {
        if (watched.has(p)) return;
        watched.add(p);
        p.on('pageerror', (e) => errors.push(`launch ${n}: ${e.message}`));
      };
      app.on('window', watch);
      const page = await app.firstWindow();
      watch(page);

      let closed = false;
      app.on('close', () => { closed = true; });
      const s: Sourcerer = {
        app,
        page,
        home: where,
        errors,
        close: async () => {
          // Kept only when the test fails (preserveOutput in playwright.config.ts).
          await app.context().tracing.stop({ path: testInfo.outputPath(`trace-launch-${n}.zip`) }).catch(() => {});
          if (!closed) await app.close();
          closed = true;
          // Playwright's close returns once its connection drops, which can be before the main
          // process has finished quitting (it writes an automatic backup first). Wait for it, or
          // a restart would open the vault while the old process still has it open.
          if (proc.exitCode === null && proc.signalCode === null) {
            await new Promise((done) => proc.once('exit', done));
          }
        },
      };
      open.push(s);
      return s;
    });

    for (const s of open) await s.close().catch(() => {});
    expect(errors, 'uncaught errors in the window').toEqual([]);
  },
});

export { expect };

/** Removes a test's home folder. On Windows a closed app's helper processes keep its Chromium
 *  files locked for a while, so a folder still locked after the retries is reported and left to
 *  the system's temporary-files cleanup rather than failing a test that passed. */
function removeTestFolder(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (process.platform !== 'win32' || (code !== 'EBUSY' && code !== 'EPERM')) throw e;
    console.warn(`Left ${root} behind: ${code}, still locked after the app closed`);
  }
}

export interface Reporter { first: string; last: string; email: string }
const ALEX: Reporter = { first: 'Alex', last: 'Morgan', email: 'alex.morgan@newsroom.ca' };

/** Fills in the reporter's details and password and creates the vault, which leaves the app on
 *  the lock screen. The vault location must already be chosen (or use createVault). */
async function fillSetupForm(page: Page, who: Reporter): Promise<void> {
  await page.fill('#firstName', who.first);
  await page.fill('#lastName', who.last);
  await page.fill('#email', who.email);
  await page.fill('#password', PASSWORD);
  await page.fill('#confirmPassword', PASSWORD);
  await page.check('input[name=acknowledgedNoRecovery]');
  await page.getByRole('button', { name: 'Create my vault' }).click();
  await expect(page.locator('.unlock-label')).toBeVisible({ timeout: 60_000 });
}

export async function waitForSetup(page: Page): Promise<void> {
  await expect(page.locator('.setup-root')).toBeVisible({ timeout: 90_000 });
}

/** First run: creates a vault in the default location, which leaves the app on the lock screen. */
export async function createVault(page: Page, who: Reporter = ALEX): Promise<void> {
  await waitForSetup(page);
  await page.getByRole('button', { name: 'Use default location' }).click();
  await fillSetupForm(page, who);
}

/** First run with "Choose a folder…": the vault goes where the (answered) dialog says. */
export async function createVaultAt(s: Sourcerer, bundlePath: string, who: Reporter = ALEX): Promise<void> {
  await waitForSetup(s.page);
  await answerFileDialog(s.app, 'save', bundlePath);
  await s.page.getByRole('button', { name: 'Choose a folder…' }).click();
  await fillSetupForm(s.page, who);
}

/** Unlocks from the lock screen and waits for the app (and, on the first unlock, the dev seeds). */
export async function unlock(page: Page, password = PASSWORD): Promise<void> {
  await expect(page.locator('.unlock-label')).toBeVisible({ timeout: 90_000 });
  await page.fill('#password', password);
  await page.keyboard.press('Enter');
  await expect(page.locator('.sidebar')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.sidebar-contact-count')).toBeVisible({ timeout: 30_000 });
}

/** A new app on a home that already has a vault, unlocked. */
export async function launchUnlocked(launch: (home?: string) => Promise<Sourcerer>, home?: string): Promise<Sourcerer> {
  const s = await launch(home);
  await unlock(s.page);
  return s;
}

/** Quits the app and starts it again on the same home, unlocked. */
export async function restart(s: Sourcerer, launch: (home?: string) => Promise<Sourcerer>): Promise<Sourcerer> {
  await s.close();
  return launchUnlocked(launch, s.home);
}

/** Makes the main process's file dialogs answer with `file` instead of opening, until changed. */
export async function answerFileDialog(app: ElectronApplication, kind: 'open' | 'save', file: string): Promise<void> {
  await app.evaluate(({ dialog }, { kind, file }) => {
    if (kind === 'open') {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
    } else {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: file })) as typeof dialog.showSaveDialog;
    }
  }, { kind, file });
}

export function sidebar(page: Page): Locator {
  return page.locator('.sidebar');
}

export async function nav(page: Page, name: 'All contacts' | 'Reminders' | 'Mentions'): Promise<void> {
  await sidebar(page).locator('.sidebar-nav-item', { hasText: name }).click();
}

export async function openSettings(page: Page): Promise<void> {
  await sidebar(page).getByTitle('Settings').click();
  await expect(page.locator('.view-headline', { hasText: 'Preferences' })).toBeVisible();
}

export function projectInSidebar(page: Page, name: string): Locator {
  return sidebar(page).locator('.sidebar-project-name', { hasText: name });
}

export async function createProject(page: Page, name: string): Promise<void> {
  await sidebar(page).getByRole('button', { name: 'New project' }).click();
  await page.fill('#proj-name', name);
  const modal = page.locator('.modal-card');
  await modal.getByRole('button', { name: 'Create project' }).click();
  await expect(modal).toBeHidden();
  await expect(projectInSidebar(page, name)).toBeVisible();
}

/** Adds a contact through "+ Add contact", optionally to projects and with an email or phone.
 *  The app then opens the new contact's details. */
export async function addContact(
  page: Page,
  name: string,
  opts: { projects?: string[]; email?: string; phone?: string; organization?: string } = {},
): Promise<void> {
  const modal = page.locator('.modal-card');
  await sidebar(page).getByRole('button', { name: '+ Add contact' }).click();
  await page.fill('#ac-name', name);
  if (opts.organization) await page.fill('#ac-org', opts.organization);
  if (opts.projects?.length || opts.email || opts.phone) {
    await modal.getByRole('button', { name: 'More details' }).click();
  }
  if (opts.email) await modal.getByPlaceholder('email@example.com').first().fill(opts.email);
  if (opts.phone) await modal.getByPlaceholder('+1 555 000 0000').first().fill(opts.phone);
  for (const p of opts.projects ?? []) {
    await modal.locator('.ac-project-search').click();
    await modal.locator('.ac-project-search').fill(p);
    await modal.locator('.ac-project-option', { hasText: p }).click();
  }
  await modal.getByRole('button', { name: 'Add contact', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator('.detail-panel')).toBeVisible();
}

export function searchResults(page: Page): Locator {
  return page.locator('.search-results');
}

/** Opens the search box and types `query`. */
export async function search(page: Page, query: string): Promise<void> {
  if (!(await page.locator('.search-input').isVisible())) {
    await sidebar(page).locator('.sidebar-search-btn').click();
  }
  await page.locator('.search-input').fill(query);
}

/** Opens a contact's details by searching for them (All contacts only draws the rows in view). */
export async function openContact(page: Page, name: string): Promise<Locator> {
  await search(page, name);
  await searchResults(page).getByText(name, { exact: true }).first().click();
  const panel = page.locator('.detail-panel');
  await expect(panel.locator('.detail-name')).toHaveText(name);
  return panel;
}

/** A section of a contact's Global tab, by its heading ("Interaction Log", "Reminders"). */
export function detailSection(page: Page, heading: string): Locator {
  return page.locator('.detail-panel .pt-section').filter({ has: page.locator('.pt-reminders-label', { hasText: heading }) });
}

/** A Settings field's control, by the text of its label. */
export function settingsField(page: Page, label: string, control = 'input, select'): Locator {
  return page.locator('.sv-field').filter({ has: page.locator('.sv-label', { hasText: label }) }).locator(control).first();
}

/** A Settings toggle, by the text beside it. */
export function settingsToggle(page: Page, label: string): Locator {
  return page.locator('.sv-toggle-row').filter({ hasText: label }).locator('.sv-toggle');
}
