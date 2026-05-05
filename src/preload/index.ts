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
  CreateSharedProjectResult,
  SyncStatusEvent,
  DecodePayloadResult,
  ContactAlertRss,
  ContactAlertMention,
  Reminder,
} from '@shared/types';
// ContactLinkInput used indirectly via CreateContactInput/UpdateContactInput

const sourcererApi = {
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
  onExtensionAccessRequest: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('extension:access-request', handler);
    return () => ipcRenderer.removeListener('extension:access-request', handler);
  },
  approveExtension: (): Promise<void> => ipcRenderer.invoke('http:approve-extension'),
  denyExtension: (): Promise<void> => ipcRenderer.invoke('http:deny-extension'),

  // App data
  getUser: (): Promise<User> => ipcRenderer.invoke('app:get-user'),

  // Projects
  listProjects: (): Promise<Project[]> => ipcRenderer.invoke('projects:list'),
  createProject: (data: { name: string; description?: string }): Promise<Project> =>
    ipcRenderer.invoke('projects:create', data),
  createSharedProject: (data: {
    name: string;
    description?: string;
  }): Promise<CreateSharedProjectResult | null> =>
    ipcRenderer.invoke('projects:createShared', data),
  joinSharedProject: (data: {
    encodedPayload: string;
    localPath: string;
  }): Promise<Project | null> => ipcRenderer.invoke('projects:joinShared', data),
  getSetupPayload: (projectId: string): Promise<string | null> =>
    ipcRenderer.invoke('projects:getSetupPayload', projectId),
  relocateSharedProject: (projectId: string, newPath: string): Promise<void> =>
    ipcRenderer.invoke('projects:relocateShared', { projectId, newPath }),
  regenerateSharedProject: (projectId: string): Promise<{ payload: string } | null> =>
    ipcRenderer.invoke('projects:regenerateShared', projectId),
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
  checkCollision: (data: {
    emails: string[];
    phones: string[];
    excludeId?: string;
  }): Promise<{ email: Record<string, string>; phone: Record<string, string> }> =>
    ipcRenderer.invoke('contacts:check-collision', data),

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
  getCalendarUrl: (): Promise<string> => ipcRenderer.invoke('settings:get-calendar-url'),
  regenerateCalendarToken: (): Promise<User> => ipcRenderer.invoke('settings:regenerate-calendar-token'),
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

  // Export
  exportProject: (projectId: string, mode: 'full' | 'sanitized'): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('export:project', { projectId, mode }),

  // Sync
  triggerSync: (projectId: string): Promise<SyncStatusEvent> =>
    ipcRenderer.invoke('sync:trigger', projectId),
  pollAll: (): Promise<void> => ipcRenderer.invoke('sync:poll-all'),
  openFileDialog: (options?: { defaultPath?: string }): Promise<string | null> =>
    ipcRenderer.invoke('sync:open-file-dialog', options),
  decodePayload: (encoded: string): Promise<DecodePayloadResult> =>
    ipcRenderer.invoke('sync:decode-payload', encoded),
  onSyncStatus: (callback: (event: SyncStatusEvent) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: SyncStatusEvent) => callback(event);
    ipcRenderer.on('sync:status', handler);
    return () => ipcRenderer.removeListener('sync:status', handler);
  },

  // Alerts / RSS mentions
  getAlertRss: (contactId: string): Promise<ContactAlertRss | null> =>
    ipcRenderer.invoke('alerts:get-rss', contactId),
  setAlertRss: (contactId: string, rssUrl: string): Promise<void> =>
    ipcRenderer.invoke('alerts:set-rss', { contactId, rssUrl }),
  clearAlertRss: (contactId: string): Promise<void> =>
    ipcRenderer.invoke('alerts:clear-rss', contactId),
  listMentions: (): Promise<ContactAlertMention[]> =>
    ipcRenderer.invoke('alerts:list-mentions'),
  markMentionSeen: (id: string): Promise<void> =>
    ipcRenderer.invoke('alerts:mark-seen', id),
  markAllMentionsSeen: (): Promise<void> =>
    ipcRenderer.invoke('alerts:mark-all-seen'),
  getUnseenMentionCount: (): Promise<number> =>
    ipcRenderer.invoke('alerts:unseen-count'),
  pollAlertsNow: (): Promise<void> =>
    ipcRenderer.invoke('alerts:poll-now'),
  onMentionsUpdated: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('mentions:updated', handler);
    return () => ipcRenderer.removeListener('mentions:updated', handler);
  },

  // Reminders
  listRemindersForContactProject: (
    contactId: string,
    projectId: string,
  ): Promise<Reminder[]> =>
    ipcRenderer.invoke('reminders:list-for-contact-project', { contactId, projectId }),
  listAllReminders: (): Promise<Reminder[]> => ipcRenderer.invoke('reminders:list-all'),
  createReminder: (data: {
    contactId: string;
    projectId: string;
    dueDate: number;
    note?: string;
  }): Promise<Reminder> => ipcRenderer.invoke('reminders:create', data),
  deleteReminder: (id: string): Promise<void> => ipcRenderer.invoke('reminders:delete', id),
};

contextBridge.exposeInMainWorld('sourcerer', sourcererApi);
