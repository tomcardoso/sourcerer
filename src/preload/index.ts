import { contextBridge, ipcRenderer } from 'electron';
import type {
  SetupFormData,
  SetupResult,
  FirstLaunchResult,
  UnlockResult,
  Project,
  User,
  ContactListItem,
  ContactDetail,
  CreateContactInput,
  ProjectContactRow,
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

  // Contacts
  listContacts: (): Promise<ContactListItem[]> => ipcRenderer.invoke('contacts:list'),
  getContact: (id: string): Promise<ContactDetail> => ipcRenderer.invoke('contacts:get', id),
  createContact: (data: CreateContactInput): Promise<ContactListItem> =>
    ipcRenderer.invoke('contacts:create', data),
  deleteContact: (id: string): Promise<void> => ipcRenderer.invoke('contacts:delete', id),
  listContactsForProject: (projectId: string): Promise<ProjectContactRow[]> =>
    ipcRenderer.invoke('contacts:list-for-project', projectId),

  // Project memberships
  addToProject: (contactId: string, projectId: string): Promise<void> =>
    ipcRenderer.invoke('memberships:add', { contactId, projectId }),
  removeFromProject: (contactId: string, projectId: string): Promise<void> =>
    ipcRenderer.invoke('memberships:remove', { contactId, projectId }),
};

contextBridge.exposeInMainWorld('sourceror', sourcerorApi);
