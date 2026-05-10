import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { registerSetupHandlers } from './ipc/setup';
import { registerUnlockHandlers } from './ipc/unlock';
import { registerProjectHandlers } from './ipc/projects';
import { registerAppHandlers } from './ipc/app';
import { registerContactHandlers } from './ipc/contacts';
import { registerSettingsHandlers } from './ipc/settings';
import { registerHttpHandlers } from './ipc/http';
import { registerSyncHandlers } from './ipc/sync';
import { registerExportHandlers } from './ipc/export';
import { registerAlertHandlers } from './ipc/alerts';
import { registerReminderHandlers } from './ipc/reminders';
import { registerImportHandlers } from './ipc/import';
import { registerAuditHandlers } from './ipc/audit';
import { registerBackupHandlers } from './ipc/backup';
import { registerScreenshotHandlers } from './ipc/screenshots';
import { registerSearchHandlers } from './ipc/search';
import { autoLock } from './auto-lock';
import { closeDatabase } from './database';
import { closeAllSharedDbs } from './database/shared-db';
import { startHttpServer } from './http-server';
import { stopPoller } from './sync/poller';

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 560,
    height: 720,
    show: false,
    resizable: false,
    center: true,
    title: 'Sourcerer',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#faf9f5',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  autoLock.start(win);

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  registerSetupHandlers();
  registerUnlockHandlers();
  registerProjectHandlers();
  registerAppHandlers();
  registerContactHandlers();
  registerSettingsHandlers();
  registerHttpHandlers();
  registerSyncHandlers();
  registerExportHandlers();
  registerAlertHandlers();
  registerReminderHandlers();
  registerImportHandlers();
  registerAuditHandlers();
  registerBackupHandlers();
  registerScreenshotHandlers();
  registerSearchHandlers();
  startHttpServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopPoller();
  closeAllSharedDbs();
  closeDatabase();
  autoLock.stop();
  if (process.platform !== 'darwin') app.quit();
});

