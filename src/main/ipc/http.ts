import { ipcMain } from 'electron';
import { approveExtensionAccess, denyExtensionAccess } from '../http-server';

export function registerHttpHandlers(): void {
  ipcMain.handle('http:approve-extension', (): void => {
    approveExtensionAccess();
  });
  ipcMain.handle('http:deny-extension', (): void => {
    denyExtensionAccess();
  });
}
