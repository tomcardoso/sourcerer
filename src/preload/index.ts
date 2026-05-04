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
  UpdateContactInput,
  UpdateMembershipInput,
  ProjectContactRow,
  InteractionLogEntry,
  ScratchpadDraft,
  StatusOption,
  PriorityOption,
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
  updateContact: (data: UpdateContactInput): Promise<void> =>
    ipcRenderer.invoke('contacts:update', data),
  deleteContact: (id: string): Promise<void> => ipcRenderer.invoke('contacts:delete', id),
  listContactsForProject: (projectId: string): Promise<ProjectContactRow[]> =>
    ipcRenderer.invoke('contacts:list-for-project', projectId),

  // Project memberships
  addToProject: (contactId: string, projectId: string): Promise<void> =>
    ipcRenderer.invoke('memberships:add', { contactId, projectId }),
  removeFromProject: (contactId: string, projectId: string): Promise<void> =>
    ipcRenderer.invoke('memberships:remove', { contactId, projectId }),
  updateMembership: (data: UpdateMembershipInput): Promise<void> =>
    ipcRenderer.invoke('memberships:update', data),

  // Interaction log
  listInteractionLog: (membershipId: string): Promise<InteractionLogEntry[]> =>
    ipcRenderer.invoke('interaction-log:list', membershipId),
  addInteractionLogEntry: (membershipId: string, body: string): Promise<InteractionLogEntry> =>
    ipcRenderer.invoke('interaction-log:add', { membershipId, body }),

  // Scratchpad
  listScratchpad: (contactId: string, projectId: string): Promise<ScratchpadDraft[]> =>
    ipcRenderer.invoke('scratchpad:list', { contactId, projectId }),
  saveScratchpad: (data: {
    id?: string;
    contactId: string;
    projectId: string;
    label: string;
    body: string;
  }): Promise<ScratchpadDraft> => ipcRenderer.invoke('scratchpad:save', data),
  deleteScratchpad: (id: string): Promise<void> => ipcRenderer.invoke('scratchpad:delete', id),

  // Options
  listStatusOptions: (): Promise<StatusOption[]> => ipcRenderer.invoke('status-options:list'),
  listPriorityOptions: (): Promise<PriorityOption[]> => ipcRenderer.invoke('priority-options:list'),

  // Settings
  updateUser: (data: { firstName: string; lastName: string; email: string }): Promise<User> =>
    ipcRenderer.invoke('users:update', data),
  getIdleTimeout: (): Promise<number> => ipcRenderer.invoke('settings:get-idle-timeout'),
  setIdleTimeout: (seconds: number): Promise<void> =>
    ipcRenderer.invoke('settings:set-idle-timeout', seconds),

  createStatusOption: (label: string): Promise<StatusOption> =>
    ipcRenderer.invoke('status-options:create', label),
  renameStatusOption: (id: string, label: string): Promise<void> =>
    ipcRenderer.invoke('status-options:rename', { id, label }),
  deleteStatusOption: (id: string): Promise<void> =>
    ipcRenderer.invoke('status-options:delete', id),
  moveStatusOption: (id: string, direction: 'up' | 'down'): Promise<void> =>
    ipcRenderer.invoke('status-options:move', { id, direction }),

  createPriorityOption: (label: string): Promise<PriorityOption> =>
    ipcRenderer.invoke('priority-options:create', label),
  renamePriorityOption: (id: string, label: string): Promise<void> =>
    ipcRenderer.invoke('priority-options:rename', { id, label }),
  deletePriorityOption: (id: string): Promise<void> =>
    ipcRenderer.invoke('priority-options:delete', id),
  movePriorityOption: (id: string, direction: 'up' | 'down'): Promise<void> =>
    ipcRenderer.invoke('priority-options:move', { id, direction }),
};

contextBridge.exposeInMainWorld('sourceror', sourcerorApi);
