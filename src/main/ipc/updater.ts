import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { is } from '@electron-toolkit/utils';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log/main';

log.initialize();
autoUpdater.logger = log;

// Cache the latest update event so renderers that mount after the event fires
// (e.g. the user was on the lock screen when the 10 s auto-check fired) can
// replay it via update:get-state on mount.
let cachedUpdateInfo: { event: 'available' | 'downloading' | 'downloaded'; version: string; percent?: number } | null = null;

// Set to true when the user explicitly invokes Help > Check for Updates.
// Used to show "up to date" / error feedback on user-initiated checks only;
// background auto-checks (the 10 s timer) are always silent.
let userInitiatedCheck = false;

function sendToWindow(channel: string, ...args: unknown[]): void {
  // Resolve the active window at send time — avoids stale reference if the
  // window is closed and re-created on macOS while the app stays running.
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, ...args);
}

/**
 * Call this from the Help > "Check for Updates…" menu item.
 * In dev, fires the simulated update banner immediately so the menu item is
 * testable. In production, delegates to autoUpdater.checkForUpdates().
 */
export function triggerUpdateCheck(): void {
  if (is.dev) {
    cachedUpdateInfo = { event: 'available', version: '99.0.0' };
    sendToWindow('update:available', { version: '99.0.0' });
    return;
  }
  if (!app.isPackaged) {
    // Running from a built but non-installed bundle — auto-updates require a
    // signed, packaged app. Inform the user rather than silently doing nothing.
    dialog.showMessageBox({
      type: 'info',
      title: 'Updates not available',
      message: 'Updates are only available in installed builds of Sourcerer.',
    });
    return;
  }
  userInitiatedCheck = true;
  autoUpdater.checkForUpdates().catch(() => {});
}

export function registerUpdaterHandlers(): void {
  // Dev simulation path: register stub handlers so the full UI flow is exercisable.
  if (is.dev) {
    let devDownloadInProgress = false;
    ipcMain.handle('update:check', () => {});
    ipcMain.handle('update:download', () => {
      // Guard against re-entry: clicking the button twice while a simulated
      // download is in progress would fire interleaved progress sequences.
      if (devDownloadInProgress) return;
      devDownloadInProgress = true;
      // Return a Promise that resolves after the simulated download completes,
      // matching production semantics where downloadUpdate() resolves post-download.
      return new Promise<void>((resolve) => {
        [25, 50, 75, 100].forEach((percent, i) => {
          setTimeout(() => {
            cachedUpdateInfo = { event: 'downloading', version: '99.0.0', percent };
            sendToWindow('update:download-progress', { percent });
            if (percent === 100) {
              setTimeout(() => {
                devDownloadInProgress = false;
                cachedUpdateInfo = { event: 'downloaded', version: '99.0.0' };
                sendToWindow('update:downloaded', { version: '99.0.0' });
                resolve();
              }, 300);
            }
          }, (i + 1) * 500);
        });
      });
    });
    ipcMain.handle('update:quit-and-install', () => {});
    ipcMain.handle('update:get-state', () => cachedUpdateInfo);
    // Trigger from DevTools console: window.sourcerer.simulateUpdate()
    ipcMain.handle('update:dev-simulate', () => {
      cachedUpdateInfo = { event: 'available', version: '99.0.0' };
      sendToWindow('update:available', { version: '99.0.0' });
    });
    ipcMain.handle('update:show-error', () => {
      return dialog.showMessageBox({
        type: 'error',
        title: 'Update failed',
        message: 'An update error occurred. Please restart the app and try again.',
      });
    });
    return;
  }

  // No-op in production so simulateUpdate() from DevTools doesn't reject.
  ipcMain.handle('update:dev-simulate', () => {});

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info) => {
    userInitiatedCheck = false;
    cachedUpdateInfo = { event: 'available', version: info.version };
    sendToWindow('update:available', { version: info.version });
  });

  // Only fires for user-initiated checks (the 10 s auto-check result is silent).
  autoUpdater.on('update-not-available', () => {
    if (userInitiatedCheck) {
      userInitiatedCheck = false;
      dialog.showMessageBox({
        type: 'info',
        title: 'No updates available',
        message: 'Sourcerer is up to date.',
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    // Also update the cache so a remount during download can restore 'downloading' state.
    if (cachedUpdateInfo) {
      cachedUpdateInfo = { event: 'downloading', version: cachedUpdateInfo.version, percent };
    }
    sendToWindow('update:download-progress', { percent });
  });

  autoUpdater.on('update-downloaded', (info) => {
    cachedUpdateInfo = { event: 'downloaded', version: info.version };
    sendToWindow('update:downloaded', { version: info.version });
  });

  // electron-updater reports download/check failures through the error event,
  // not by rejecting the promise — so this is the only reliable failure path.
  autoUpdater.on('error', (err) => {
    const wasUserCheck = userInitiatedCheck;
    userInitiatedCheck = false;
    const message = err instanceof Error ? err.message : String(err);

    // Capture prior state before mutating cache.
    const priorState = cachedUpdateInfo?.event ?? null;
    const priorVersion = cachedUpdateInfo?.version ?? null;

    if ((priorState === 'downloaded' || priorState === 'downloading') && priorVersion) {
      // Revert to 'available' so the user can retry and so a remount after
      // the error (e.g. lock/unlock) can still replay the banner correctly.
      cachedUpdateInfo = { event: 'available', version: priorVersion };
    }

    if (priorState === 'downloading' || priorState === 'downloaded') {
      // Download-phase error: tell the renderer so it can revert its UI.
      sendToWindow('update:error', { message });
    } else if (wasUserCheck) {
      // Check-phase error from a user-initiated check: show directly from main
      // (the renderer may still be on the lock screen with no listener attached).
      dialog.showMessageBox({
        type: 'error',
        title: 'Update check failed',
        message: 'Unable to check for updates. Please try again later.',
        detail: message,
      });
    }
    // Background auto-check errors are silently ignored.
  });

  ipcMain.handle('update:check', () => autoUpdater.checkForUpdates());
  ipcMain.handle('update:download', () => {
    // Mark cache as downloading immediately so an early error (before any
    // progress events fire) is correctly classified and surfaced to the user.
    if (cachedUpdateInfo) {
      cachedUpdateInfo = { event: 'downloading', version: cachedUpdateInfo.version };
    }
    return autoUpdater.downloadUpdate();
  });
  ipcMain.handle('update:quit-and-install', async () => {
    // On Electron 39+, Squirrel.Mac may not be ready to handle quitAndInstall
    // immediately after electron-updater fires update-downloaded. Retry with
    // backoff until Squirrel accepts the command, but only for the known
    // transient error — fail fast for anything else.
    let delay = 200;
    for (let i = 0; i < 8; i++) {
      try {
        autoUpdater.quitAndInstall(false, true);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('command is disabled')) {
          log.error('quitAndInstall failed with unexpected error:', err);
          return;
        }
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 2000);
      }
    }
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (err) {
      log.error('quitAndInstall failed after retries:', err);
      sendToWindow('update:error', { message: 'Unable to restart and install the update. Please restart Sourcerer manually.' });
    }
  });
  ipcMain.handle('update:get-state', () => cachedUpdateInfo);
  ipcMain.handle('update:show-error', (_event, message: string) => {
    return dialog.showMessageBox({
      type: 'error',
      title: 'Update failed',
      message: 'The update could not be downloaded. Please try again.',
      detail: message,
    });
  });

  // Check for updates 10 s after launch so it doesn't block startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10_000);
}
