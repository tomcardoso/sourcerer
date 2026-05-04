import { contextBridge, ipcRenderer } from 'electron';
import type { SetupFormData, SetupResult, FirstLaunchResult, UnlockResult } from '@shared/types';

const sourcerorApi = {
  checkFirstLaunch: (): Promise<FirstLaunchResult> =>
    ipcRenderer.invoke('setup:check-first-launch'),

  completeSetup: (data: SetupFormData): Promise<SetupResult> =>
    ipcRenderer.invoke('setup:complete', data),

  unlock: (password: string): Promise<UnlockResult> =>
    ipcRenderer.invoke('unlock:attempt', password),

  onLocked: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('app:locked', handler);
    return () => ipcRenderer.removeListener('app:locked', handler);
  },
};

contextBridge.exposeInMainWorld('sourceror', sourcerorApi);
