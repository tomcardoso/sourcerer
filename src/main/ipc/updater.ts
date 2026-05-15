import { app, BrowserWindow, ipcMain } from 'electron';
import { is } from '@electron-toolkit/utils';
import { autoUpdater } from 'electron-updater';

/**
 * Call this from the Help > "Check for Updates…" menu item.
 * Safe to call before registerUpdaterHandlers — the listeners are set up
 * during app.whenReady() and any user-triggered check happens after that.
 */
export function triggerUpdateCheck(): void {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch(() => {});
}

export function registerUpdaterHandlers(win: BrowserWindow): void {
  // Dev simulation: fire a fake update-available banner after 3s so UI states can be tested.
  // The IPC handlers below are also registered in dev so the Download/Restart buttons work.
  if (is.dev) {
    ipcMain.handle('update:check', () => {});
    ipcMain.handle('update:download', () => {
      win.webContents.send('update:downloaded', { version: '99.0.0' });
    });
    ipcMain.handle('update:quit-and-install', () => {});
    // Trigger from DevTools console: window.sourcerer.simulateUpdate()
    ipcMain.handle('update:dev-simulate', () => {
      win.webContents.send('update:available', { version: '99.0.0' });
    });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update:available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send('update:download-progress', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update:downloaded', { version: info.version });
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
