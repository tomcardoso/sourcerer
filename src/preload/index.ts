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
  ImportResult,
  DuplicatePair,
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
  onRemindersChanged: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('reminders:changed', handler);
    return () => ipcRenderer.removeListener('reminders:changed', handler);
  },
  onScreenshotReceived: (callback: (tempId: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, tempId: string) => callback(tempId);
    ipcRenderer.on('extension:screenshot-received', handler);
    return () => ipcRenderer.removeListener('extension:screenshot-received', handler);
  },

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
  convertProjectToShared: (projectId: string): Promise<{ project: Project; payload: string } | null> =>
    ipcRenderer.invoke('projects:convertToShared', projectId),
  regenerateSharedProject: (projectId: string): Promise<{ payload: string } | null> =>
    ipcRenderer.invoke('projects:regenerateShared', projectId),
  renameProject: (id: string, name: string): Promise<void> =>
    ipcRenderer.invoke('projects:rename', { id, name }),
  updateProject: (id: string, name: string, description: string | null): Promise<Project> =>
    ipcRenderer.invoke('projects:update', { id, name, description }),
  unshareProject: (id: string): Promise<Project> => ipcRenderer.invoke('projects:unshare', id),
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
  setMembershipReporters: (membershipId: string, reporters: Array<{ email: string; name: string }>): Promise<void> =>
    ipcRenderer.invoke('memberships:set-reporters', { membershipId, reporters }),
  listProjectReporters: (projectId: string): Promise<Array<{ email: string; name: string }>> =>
    ipcRenderer.invoke('projects:list-reporters', projectId),

  // Interaction log
  listInteractionLog: (membershipId: string): Promise<InteractionLogEntry[]> =>
    ipcRenderer.invoke('interaction-log:list', membershipId),
  addInteractionLogEntry: (membershipId: string, body: string, createdAt?: number): Promise<InteractionLogEntry> =>
    ipcRenderer.invoke('interaction-log:add', { membershipId, body, createdAt }),
  getContactCount: (): Promise<number> => ipcRenderer.invoke('contacts:count'),
  getContactInteractionCount: (contactId: string): Promise<number> =>
    ipcRenderer.invoke('contacts:interaction-count', contactId),
  validatePhone: (raw: string): Promise<boolean> => ipcRenderer.invoke('contacts:validate-phone', raw),

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
  setPhoneCountry: (country: string): Promise<User> =>
    ipcRenderer.invoke('settings:set-phone-country', country),
  setStalenessEnabled: (enabled: boolean): Promise<User> =>
    ipcRenderer.invoke('settings:set-staleness-enabled', enabled),
  setStalenessThreshold: (days: number): Promise<User> =>
    ipcRenderer.invoke('settings:set-staleness-threshold', days),
  setOutreachRemindersEnabled: (enabled: boolean): Promise<User> =>
    ipcRenderer.invoke('settings:set-outreach-reminders-enabled', enabled),
  setOutreachRequireInteraction: (required: boolean): Promise<User> =>
    ipcRenderer.invoke('settings:set-outreach-require-interaction', required),
  setRssPollInterval: (hours: number): Promise<User> =>
    ipcRenderer.invoke('settings:set-rss-poll-interval', hours),
  setWaybackEnabled: (enabled: boolean): Promise<User> =>
    ipcRenderer.invoke('settings:set-wayback-enabled', enabled),
  setAlertNotificationsEnabled: (enabled: boolean): Promise<User> =>
    ipcRenderer.invoke('settings:set-alert-notifications-enabled', enabled),
  setReminderNotificationsEnabled: (enabled: boolean): Promise<User> =>
    ipcRenderer.invoke('settings:set-reminder-notifications-enabled', enabled),
  setPriorityInterval: (id: string, days: number | null): Promise<void> =>
    ipcRenderer.invoke('priority-options:set-interval', { id, days }),
  getCalendarUrl: (): Promise<string> => ipcRenderer.invoke('settings:get-calendar-url'),
  regenerateCalendarToken: (): Promise<User> => ipcRenderer.invoke('settings:regenerate-calendar-token'),
  changePassword: (currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('settings:change-password', { currentPassword, newPassword }),
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
  exportBackup: (password: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('backup:export', { password }),
  restoreBackup: (password: string): Promise<{ success: boolean; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('backup:restore', { password }),
  searchGlobal: (query: string): Promise<import('@shared/types').SearchResult[]> =>
    ipcRenderer.invoke('search:global', query),
  assignScreenshot: (data: { tempId: string; contactId: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('screenshots:assign', data),
  listScreenshots: (contactId: string): Promise<import('@shared/types').ContactScreenshot[]> =>
    ipcRenderer.invoke('screenshots:list', contactId),
  loadScreenshot: (screenshotId: string): Promise<{ data: string } | { error: string }> =>
    ipcRenderer.invoke('screenshots:load', screenshotId),
  deleteScreenshot: (screenshotId: string): Promise<void> =>
    ipcRenderer.invoke('screenshots:delete', screenshotId),
  saveScreenshot: (screenshotId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('screenshots:save', screenshotId),
  onScreenshotAssigned: (callback: (contactId: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, contactId: string) => callback(contactId);
    ipcRenderer.on('screenshots:assigned', handler);
    return () => ipcRenderer.removeListener('screenshots:assigned', handler);
  },

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
  dismissMention: (id: string): Promise<void> =>
    ipcRenderer.invoke('alerts:dismiss-mention', id),
  clearAllMentions: (): Promise<void> =>
    ipcRenderer.invoke('alerts:clear-all-mentions'),
  getUnseenMentionCount: (): Promise<number> =>
    ipcRenderer.invoke('alerts:unseen-count'),
  pollAlertsNow: (): Promise<void> =>
    ipcRenderer.invoke('alerts:poll-now'),
  getFeedCount: (): Promise<number> =>
    ipcRenderer.invoke('alerts:feed-count'),
  getLastFetched: (): Promise<number | null> =>
    ipcRenderer.invoke('alerts:last-fetched'),
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
  completeReminder: (id: string): Promise<void> => ipcRenderer.invoke('reminders:complete', id),
  deleteReminder: (id: string): Promise<void> => ipcRenderer.invoke('reminders:delete', id),

  // vCard export
  exportVCardContact: (contactId: string): Promise<void> =>
    ipcRenderer.invoke('export:vcard-contact', contactId),
  exportVCardProject: (projectId: string): Promise<void> =>
    ipcRenderer.invoke('export:vcard-project', projectId),
  exportAllContacts: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('export:all-contacts'),

  // CSV import
  importCsv: (data: { projectId?: string }): Promise<ImportResult> =>
    ipcRenderer.invoke('import:csv', data),
  downloadSampleCsv: (): Promise<void> => ipcRenderer.invoke('import:download-sample-csv'),



  // Panic wipe
  panicWipe: (): Promise<void> => ipcRenderer.invoke('settings:panic-wipe'),

  // Dedup
  getDuplicatePairs: (): Promise<DuplicatePair[]> =>
    ipcRenderer.invoke('contacts:get-duplicates'),
  mergeContacts: (data: {
    winnerId: string;
    loserId: string;
    strategy: 'keep' | 'merge' | 'skip';
  }): Promise<void> => ipcRenderer.invoke('contacts:merge', data),
  onDuplicatePairsUpdated: (callback: (count: number) => void): (() => void) => {
    const handler = (_: unknown, count: number) => callback(count);
    ipcRenderer.on('contacts:duplicates-updated', handler);
    return () => ipcRenderer.removeListener('contacts:duplicates-updated', handler);
  },
};

contextBridge.exposeInMainWorld('sourcerer', sourcererApi);
