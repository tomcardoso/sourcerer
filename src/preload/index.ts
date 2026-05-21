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
  ContactLogEntry,
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
  TimelineEntry,
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
  lock: (): Promise<void> =>
    ipcRenderer.invoke('app:lock'),
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
  onContactsChanged: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('contacts:changed', handler);
    return () => ipcRenderer.removeListener('contacts:changed', handler);
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
  rotateSharedKey: (projectId: string): Promise<{ payload: string } | null> =>
    ipcRenderer.invoke('projects:rotateSharedKey', projectId),
  renameProject: (id: string, name: string): Promise<void> =>
    ipcRenderer.invoke('projects:rename', { id, name }),
  updateProject: (id: string, name: string, description: string | null): Promise<Project> =>
    ipcRenderer.invoke('projects:update', { id, name, description }),
  unshareProject: (id: string): Promise<Project> => ipcRenderer.invoke('projects:unshare', id),
  archiveProject: (id: string): Promise<void> => ipcRenderer.invoke('projects:archive', id),
  unarchiveProject: (id: string): Promise<void> => ipcRenderer.invoke('projects:unarchive', id),
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
  bulkUpdateMemberships: (data: { membershipIds: string[]; status?: string | null; priority?: string | null }): Promise<void> =>
    ipcRenderer.invoke('memberships:bulk-update', data),
  setMembershipReporters: (membershipId: string, reporters: Array<{ email: string; name: string }>): Promise<void> =>
    ipcRenderer.invoke('memberships:set-reporters', { membershipId, reporters }),
  listProjectReporters: (projectId: string): Promise<Array<{ email: string; name: string }>> =>
    ipcRenderer.invoke('projects:list-reporters', projectId),
  listProjectTimeline: (projectId: string): Promise<TimelineEntry[]> =>
    ipcRenderer.invoke('projects:list-timeline', projectId),
  listAllTimeline: (): Promise<TimelineEntry[]> =>
    ipcRenderer.invoke('contacts:list-timeline'),

  // Interaction log
  listInteractionLog: (membershipId: string): Promise<InteractionLogEntry[]> =>
    ipcRenderer.invoke('interaction-log:list', membershipId),
  addInteractionLogEntry: (membershipId: string, body: string, createdAt?: number, extraMembershipIds?: string[]): Promise<InteractionLogEntry> =>
    ipcRenderer.invoke('interaction-log:add', { membershipId, body, createdAt, extraMembershipIds }),
  listContactLog: (contactId: string): Promise<ContactLogEntry[]> =>
    ipcRenderer.invoke('interaction-log:list-for-contact', contactId),
  addGlobalLogEntry: (contactId: string, body: string, createdAt?: number, membershipIds?: string[]): Promise<ContactLogEntry> =>
    ipcRenderer.invoke('interaction-log:add-global', { contactId, body, createdAt, membershipIds }),
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
  setArchiveKeys: (accessKey: string, secretKey: string): Promise<User> =>
    ipcRenderer.invoke('settings:set-archive-keys', { accessKey, secretKey }),
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

  // Export
  exportProject: (projectId: string, mode: 'full' | 'sanitized', contactIds?: string[]): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('export:project', { projectId, mode, contactIds }),
  exportBackup: (password: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('backup:export', { password }),
  restoreBackup: (password: string): Promise<{ success: boolean; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('backup:restore', { password }),
  runAutoBackup: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('backup:run-auto'),
  getAutoBackupSettings: (): Promise<{ enabled: boolean; destPath: string | null; maxCount: number }> =>
    ipcRenderer.invoke('settings:get-auto-backup'),
  setAutoBackupSettings: (data: { enabled?: boolean; destPath?: string | null; maxCount?: number }): Promise<void> =>
    ipcRenderer.invoke('settings:set-auto-backup', data),
  chooseBackupFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('settings:choose-backup-folder'),
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
  getScreenshotFolderSize: (): Promise<number> =>
    ipcRenderer.invoke('screenshots:get-folder-size'),
  openScreenshotFolder: (): Promise<void> =>
    ipcRenderer.invoke('screenshots:open-folder'),
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
  listAlertRss: (contactId: string): Promise<ContactAlertRss[]> =>
    ipcRenderer.invoke('alerts:list-rss', contactId),
  addAlertRss: (contactId: string, rssUrl: string): Promise<void> =>
    ipcRenderer.invoke('alerts:add-rss', { contactId, rssUrl }),
  removeAlertRss: (id: string): Promise<void> =>
    ipcRenderer.invoke('alerts:remove-rss', id),
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
  uncompleteReminder: (id: string): Promise<void> => ipcRenderer.invoke('reminders:uncomplete', id),
  deleteReminder: (id: string): Promise<void> => ipcRenderer.invoke('reminders:delete', id),
  updateReminder: (data: { id: string; dueDate: number; note: string | null }): Promise<Reminder> =>
    ipcRenderer.invoke('reminders:update', data),

  // vCard export
  exportVCardContact: (contactId: string): Promise<void> =>
    ipcRenderer.invoke('export:vcard-contact', contactId),
  exportVCardProject: (projectId: string, contactIds?: string[]): Promise<void> =>
    ipcRenderer.invoke('export:vcard-project', { projectId, contactIds }),
  exportVCardAllContacts: (contactIds?: string[]): Promise<void> =>
    ipcRenderer.invoke('export:vcard-all-contacts', { contactIds }),
  exportAllContacts: (contactIds?: string[]): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('export:all-contacts', { contactIds }),

  // CSV / vCard import
  importCsv: (data: { projectId?: string }): Promise<ImportResult> =>
    ipcRenderer.invoke('import:csv', data),
  importVcf: (data: { projectId?: string }): Promise<ImportResult> =>
    ipcRenderer.invoke('import:vcf', data),
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
  onWaybackUpdated: (callback: (contactId: string) => void): (() => void) => {
    const handler = (_: unknown, contactId: string) => callback(contactId);
    ipcRenderer.on('contacts:wayback-updated', handler);
    return () => ipcRenderer.removeListener('contacts:wayback-updated', handler);
  },
  onWaybackStatus: (callback: (payload: { contactId: string; url: string; status: 'pending' | 'failed' }) => void): (() => void) => {
    const handler = (_: unknown, payload: { contactId: string; url: string; status: 'pending' | 'failed' }) => callback(payload);
    ipcRenderer.on('contacts:wayback-status', handler);
    return () => ipcRenderer.removeListener('contacts:wayback-status', handler);
  },

  // Updater
  onUpdateAvailable: (callback: (info: { version: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on('update:downloaded', handler);
    return () => ipcRenderer.removeListener('update:downloaded', handler);
  },
  onUpdateDownloadProgress: (callback: (info: { percent: number }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: { percent: number }) => callback(info);
    ipcRenderer.on('update:download-progress', handler);
    return () => ipcRenderer.removeListener('update:download-progress', handler);
  },
  onUpdateError: (callback: (info: { message: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: { message: string }) => callback(info);
    ipcRenderer.on('update:error', handler);
    return () => ipcRenderer.removeListener('update:error', handler);
  },
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('update:download'),
  quitAndInstall: (): Promise<void> => ipcRenderer.invoke('update:quit-and-install'),
  simulateUpdate: (): Promise<void> => ipcRenderer.invoke('update:dev-simulate'),
  getUpdateState: (): Promise<{ event: 'available' | 'downloading' | 'downloaded'; version: string; percent?: number } | null> =>
    ipcRenderer.invoke('update:get-state'),
  showUpdateError: (message: string): Promise<void> => ipcRenderer.invoke('update:show-error', message),
};

contextBridge.exposeInMainWorld('sourcerer', sourcererApi);
