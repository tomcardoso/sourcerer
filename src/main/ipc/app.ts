import { ipcMain } from 'electron';
import { getDatabase } from '../database';
import type { User } from '@shared/types';

export function registerAppHandlers(): void {
  ipcMain.handle('app:get-user', (): User => {
    return getDatabase().prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });
}
