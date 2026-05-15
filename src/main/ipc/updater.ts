import { app, BrowserWindow, ipcMain } from 'electron';
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
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch(() => {});
}

export function registerUpdaterHandlers(): void {
  // Dev simulation path: register stub handlers so the full UI flow is exercisable.
  if (is.dev) {
    ipcMain.handle('update:check', () => {});
    ipcMain.handle('update:download', () => {
      // Simulate download progress (25 → 50 → 75 → 100 %) then fire update:downloaded.
      [25, 50, 75, 100].forEach((percent, i) => {
        setTimeout(() => {
          sendToWindow('update:download-progress', { percent });
          if (percent === 100) {
            setTimeout(() => sendToWindow('update:downloaded', { version: '99.0.0' }), 300);
          }
        }, (i + 1) * 500);
      });
    });
    ipcMain.handle('update:quit-and-install', () => {});
    ipcMain.handle('update:get-state', () => cachedUpdateInfo);
    // Trigger from DevTools console: window.sourcerer.simulateUpdate()
    ipcMain.handle('update:dev-simulate', () => {
      sendToWindow('update:available', { version: '99.0.0' });
    });
    return;
  }

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
