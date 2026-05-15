import { app, BrowserWindow, ipcMain } from 'electron';
import { is } from '@electron-toolkit/utils';
import { autoUpdater } from 'electron-updater';

function sendToWindow(channel: string, ...args: unknown[]): void {
  // Resolve the active window at send time — avoids stale reference if the
  // window is closed and re-created on macOS while the app stays running.
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, ...args);
}

/**
 * Call this from the Help > "Check for Updates…" menu item.
 * Safe to call before registerUpdaterHandlers — the listeners are set up
 * during app.whenReady() and any user-triggered check happens after that.
 */
export function triggerUpdateCheck(): void {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch(() => {});
}

export function registerUpdaterHandlers(): void {
  // Dev simulation: fire a fake update-available banner after 3s so UI states can be tested.
  // The IPC handlers below are also registered in dev so the Download/Restart buttons work.
  if (is.dev) {
    ipcMain.handle('update:check', () => {});
    ipcMain.handle('update:download', () => {
      sendToWindow('update:downloaded', { version: '99.0.0' });
    });
    ipcMain.handle('update:quit-and-install', () => {});
    // Trigger from DevTools console: window.sourcerer.simulateUpdate()
    ipcMain.handle('update:dev-simulate', () => {
      sendToWindow('update:available', { version: '99.0.0' });
    });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info) => {
    sendToWindow('update:available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToWindow('update:download-progress', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendToWindow('update:downloaded', { version: info.version });
  });

  ipcMain.handle('update:check', () => autoUpdater.checkForUpdates());
  ipcMain.handle('update:download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('update:quit-and-install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Check for updates 10 s after launch so it doesn't block startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10_000);
}
