import { contextBridge, ipcRenderer } from 'electron';
import type {
  SetupFormData,
  SetupResult,
  FirstLaunchResult,
  UnlockResult,
  Project,
  User,
} from '@shared/types';

const sourcerorApi = {
  // Auth
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

  // App data
  getUser: (): Promise<User> => ipcRenderer.invoke('app:get-user'),

  // Projects
  listProjects: (): Promise<Project[]> => ipcRenderer.invoke('projects:list'),
  createProject: (data: { name: string; description?: string }): Promise<Project> =>
    ipcRenderer.invoke('projects:create', data),
  renameProject: (id: string, name: string): Promise<void> =>
    ipcRenderer.invoke('projects:rename', { id, name }),
  deleteProject: (id: string): Promise<void> => ipcRenderer.invoke('projects:delete', id),
};

contextBridge.exposeInMainWorld('sourceror', sourcerorApi);
