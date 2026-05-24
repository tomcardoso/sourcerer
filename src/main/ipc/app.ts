import { ipcMain, BrowserWindow } from 'electron';
import { getDatabase } from '../database';
import { autoLock } from '../auto-lock';
import { getSafeUser } from './settings';

export function registerAppHandlers(): void {
  ipcMain.handle('app:expand-for-setup', (event): void => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setSize(560, 820, true);
  });

  ipcMain.handle('app:lock', (): void => {
    autoLock.lock();
  });

  ipcMain.handle('app:get-user', (): ReturnType<typeof getSafeUser> => {
    // calendar_token is a sensitive secret; it is exposed only via the dedicated
    // settings:get-calendar-url handler which constructs the full URL server-side.
    return getSafeUser(getDatabase());
  });
}
