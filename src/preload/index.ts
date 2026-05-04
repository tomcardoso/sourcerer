import { contextBridge, ipcRenderer } from 'electron';
import type { SetupFormData, SetupResult, FirstLaunchResult } from '@shared/types';

const sourcerorApi = {
  checkFirstLaunch: (): Promise<FirstLaunchResult> =>
    ipcRenderer.invoke('setup:check-first-launch'),

  completeSetup: (data: SetupFormData): Promise<SetupResult> =>
    ipcRenderer.invoke('setup:complete', data),
};

contextBridge.exposeInMainWorld('sourceror', sourcerorApi);
