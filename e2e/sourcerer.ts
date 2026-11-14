// Fixtures and helpers shared by the end-to-end specs.
//
// Every test gets a throwaway home folder (`home`) and launches the built app against it
// (`launch`), so tests run side by side and never touch a real vault. The app isn't packaged, so
// it counts as a dev build: creating a vault and unlocking it fills it with the fictional dev seeds
// (src/main/database/dev-seeds*.ts), as `npm run screenshots` does.
//
// Any uncaught error in the window (`pageerror`, which includes unhandled promise rejections) fails
// the test. A failed test keeps a Playwright trace of each launch and the app's diagnostics trace
// in test-results/.

import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test';
import { copyFileSync, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
export const PASSWORD = 'coral fence orbit lamp';

export interface Sourcerer {
  app: ElectronApplication;
  page: Page;
  /** Uncaught errors in the window so far. */
  errors: string[];
  /** Quits the app, as a reporter would. */
  close: () => Promise<void>;
}

export function userDataOf(home: string): string {
  return join(home, 'user-data');
}

export const test = base.extend<{ home: string; launch: () => Promise<Sourcerer> }>({
  // eslint-disable-next-line no-empty-pattern
  home: async ({}, use, testInfo) => {
    // realpath: on macOS the temporary folder is reached through a symlink (/var → /private/var).
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'sourcerer-e2e-')));
    await use(home);
    const trace = join(userDataOf(home), 'diagnostics-trace.json');
    if (existsSync(trace)) copyFileSync(trace, testInfo.outputPath('diagnostics-trace.json'));
    removeTestFolder(home);
  },

  launch: async ({ home }, use, testInfo) => {
    const open: Sourcerer[] = [];
    const errors: string[] = [];
    let launches = 0;

    await use(async () => {
      const n = ++launches;
      const app = await electron.launch({
        args: [ROOT, '--no-sandbox'],
        env: {
          ...process.env,
          // HOME and USERPROFILE for the home folder, XDG_CONFIG_HOME for Linux's config folder,
          // and SOURCERER_USER_DATA for the app's own folder, which on Windows follows neither.
          HOME: home,
          USERPROFILE: home,
          XDG_CONFIG_HOME: join(home, '.config'),
          SOURCERER_USER_DATA: userDataOf(home),
        },
      });
      await app.context().tracing.start({ screenshots: true, snapshots: true });
      // The dev seeds have overdue outreach reminders; their notifications would pop up on the
      // machine running the tests.
      await app.evaluate(({ Notification }) => {
        Notification.prototype.show = function () {};
      });
      const page = await app.firstWindow();
      page.on('pageerror', (e) => errors.push(`launch ${n}: ${e.message}`));

      let closed = false;
      const s: Sourcerer = {
        app,
        page,
        errors,
        close: async () => {
          if (closed) return;
          closed = true;
          // Kept only when the test fails (preserveOutput in playwright.config.ts).
          await app.context().tracing.stop({ path: testInfo.outputPath(`trace-launch-${n}.zip`) }).catch(() => {});
          await app.close();
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

/** First run: creates a vault in the default location, which leaves the app on the lock screen. */
export async function createVault(page: Page): Promise<void> {
  await page.waitForSelector('.setup-root', { timeout: 90_000 });
  await page.getByRole('button', { name: 'Use default location' }).click();
  await page.fill('#firstName', 'Alex');
  await page.fill('#lastName', 'Morgan');
  await page.fill('#email', 'alex.morgan@newsroom.ca');
  await page.fill('#password', PASSWORD);
  await page.fill('#confirmPassword', PASSWORD);
  await page.check('input[name=acknowledgedNoRecovery]');
  await page.getByRole('button', { name: 'Create my vault' }).click();
  await expect(page.locator('.unlock-label')).toBeVisible({ timeout: 60_000 });
}

/** Unlocks from the lock screen and waits for the app (and, on the first unlock, the dev seeds). */
export async function unlock(page: Page, password = PASSWORD): Promise<void> {
  await expect(page.locator('.unlock-label')).toBeVisible({ timeout: 90_000 });
  await page.fill('#password', password);
  await page.keyboard.press('Enter');
  await expect(page.locator('.sidebar')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.sidebar-contact-count')).toBeVisible({ timeout: 30_000 });
}

/** Makes the main process's next file dialog answer with `file` instead of opening. */
export async function answerFileDialog(app: ElectronApplication, kind: 'open' | 'save', file: string): Promise<void> {
  await app.evaluate(({ dialog }, { kind, file }) => {
    if (kind === 'open') {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
    } else {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: file })) as typeof dialog.showSaveDialog;
    }
  }, { kind, file });
}
