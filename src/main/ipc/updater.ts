import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { is } from '@electron-toolkit/utils';
import { autoUpdater } from 'electron-updater';

// Cache the latest update event so renderers that mount after the event fires
// (e.g. the user was on the lock screen when the 10 s auto-check fired) can
// replay it via update:get-state on mount.
let cachedUpdateInfo: { event: 'available' | 'downloaded'; version: string } | null = null;

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
      // Simulate download progress (25 → 50 → 75 → 100 %) then fire update:downloaded.
      [25, 50, 75, 100].forEach((percent, i) => {
        setTimeout(() => {
          sendToWindow('update:download-progress', { percent });
          if (percent === 100) {
            setTimeout(() => {
              devDownloadInProgress = false;
              cachedUpdateInfo = { event: 'downloaded', version: '99.0.0' };
              sendToWindow('update:downloaded', { version: '99.0.0' });
            }, 300);
          }
        }, (i + 1) * 500);
      });
    });
    ipcMain.handle('update:quit-and-install', () => {});
    ipcMain.handle('update:get-state', () => cachedUpdateInfo);
    // Trigger from DevTools console: window.sourcerer.simulateUpdate()
    ipcMain.handle('update:dev-simulate', () => {
      cachedUpdateInfo = { event: 'available', version: '99.0.0' };
      sendToWindow('update:available', { version: '99.0.0' });
    });
    return;
  }

  // No-op in production so simulateUpdate() from DevTools doesn't reject.
  ipcMain.handle('update:dev-simulate', () => {});

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info) => {
    cachedUpdateInfo = { event: 'available', version: info.version };
    sendToWindow('update:available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToWindow('update:download-progress', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    cachedUpdateInfo = { event: 'downloaded', version: info.version };
    sendToWindow('update:downloaded', { version: info.version });
  });

  // electron-updater reports download/check failures through the error event,
  // not by rejecting the promise — so this is the only reliable failure path.
  autoUpdater.on('error', (err) => {
    // If we had a fully-downloaded update, its artefacts are now suspect.
    if (cachedUpdateInfo?.event === 'downloaded') {
      cachedUpdateInfo = null;
    }
    sendToWindow('update:error', {
      message: err instanceof Error ? err.message : String(err),
    });
  });

  ipcMain.handle('update:check', () => autoUpdater.checkForUpdates());
  ipcMain.handle('update:download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('update:quit-and-install', () => {
    autoUpdater.quitAndInstall(false, true);
  });
  ipcMain.handle('update:get-state', () => cachedUpdateInfo);

  // Check for updates 10 s after launch so it doesn't block startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10_000);
}
