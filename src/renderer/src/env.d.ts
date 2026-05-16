/// <reference types="vite/client" />

import type {
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
  ContactScreenshot,
  SearchResult,
  TimelineEntry,
  ContactHandle,
  ContactHandleInput,
} from '@shared/types';

declare global {
  interface Window {
    sourcerer: {
      // Auth
      checkFirstLaunch: () => Promise<{ isFirstLaunch: boolean }>;
      completeSetup: (data: {
        firstName: string;
        lastName: string;
        email: string;
        password: string;
      }) => Promise<{ success: boolean; error?: string }>;
      unlock: (password: string) => Promise<{ success: boolean; error?: string }>;
      lock: () => Promise<void>;
      onLocked: (callback: () => void) => () => void;
      onExtensionAccessRequest: (callback: () => void) => () => void;
      approveExtension: () => Promise<void>;
      denyExtension: () => Promise<void>;

      // App data
      getUser: () => Promise<User>;

      // Projects
      listProjects: () => Promise<Project[]>;
      createProject: (data: { name: string; description?: string }) => Promise<Project>;
      createSharedProject: (data: {
        name: string;
        description?: string;
      }) => Promise<CreateSharedProjectResult | null>;
      joinSharedProject: (data: {
        encodedPayload: string;
        localPath: string;
      }) => Promise<Project | null>;
      getSetupPayload: (projectId: string) => Promise<string | null>;
      relocateSharedProject: (projectId: string, newPath: string) => Promise<void>;
      convertProjectToShared: (projectId: string) => Promise<{ project: Project; payload: string } | null>;
      regenerateSharedProject: (projectId: string) => Promise<{ payload: string } | null>;
      renameProject: (id: string, name: string) => Promise<void>;
      updateProject: (id: string, name: string, description: string | null) => Promise<Project>;
      archiveProject: (id: string) => Promise<void>;
      unarchiveProject: (id: string) => Promise<void>;
      deleteProject: (id: string) => Promise<void>;
      unshareProject: (id: string) => Promise<Project>;

      // Contacts
      listContacts: () => Promise<ContactListItem[]>;
      getContact: (id: string) => Promise<ContactDetail>;
      createContact: (data: CreateContactInput) => Promise<ContactListItem>;
      updateContact: (data: UpdateContactInput) => Promise<void>;
      deleteContact: (id: string) => Promise<void>;
      listContactsForProject: (projectId: string) => Promise<ProjectContactRow[]>;
      checkCollision: (data: {
        emails: string[];
        phones: string[];
        excludeId?: string;
      }) => Promise<{ email: Record<string, string>; phone: Record<string, string> }>;

      // Memberships
      addToProject: (contactId: string, projectId: string) => Promise<void>;
      removeFromProject: (contactId: string, projectId: string) => Promise<void>;
      updateMembership: (data: UpdateMembershipInput) => Promise<void>;
      bulkUpdateMemberships: (data: { membershipIds: string[]; status?: string | null; priority?: string | null }) => Promise<void>;
      setMembershipReporters: (membershipId: string, reporters: Array<{ email: string; name: string }>) => Promise<void>;
      listProjectReporters: (projectId: string) => Promise<Array<{ email: string; name: string }>>;
      listProjectTimeline: (projectId: string) => Promise<TimelineEntry[]>;
      listAllTimeline: () => Promise<TimelineEntry[]>;

      // Interaction log
      listInteractionLog: (membershipId: string) => Promise<InteractionLogEntry[]>;
      addInteractionLogEntry: (membershipId: string, body: string, createdAt?: number) => Promise<InteractionLogEntry>;
      getContactCount: () => Promise<number>;
      getContactInteractionCount: (contactId: string) => Promise<number>;
      validatePhone: (raw: string) => Promise<boolean>;

      // Scratchpad
      listScratchpad: (contactId: string, projectId: string) => Promise<ScratchpadDraft[]>;
      saveScratchpad: (data: {
        id?: string;
        contactId: string;
        projectId: string;
        label: string;
        body: string;
      }) => Promise<ScratchpadDraft>;
      deleteScratchpad: (id: string) => Promise<void>;

      // Options
      listStatusOptions: () => Promise<StatusOption[]>;
      listPriorityOptions: () => Promise<PriorityOption[]>;

      // Settings
      updateUser: (data: { firstName: string; lastName: string; email: string }) => Promise<User>;
      setPhoneCountry: (country: string) => Promise<User>;
      setStalenessEnabled: (enabled: boolean) => Promise<User>;
      setStalenessThreshold: (days: number) => Promise<User>;
      setOutreachRemindersEnabled: (enabled: boolean) => Promise<User>;
      setOutreachRequireInteraction: (required: boolean) => Promise<User>;
      changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
      setAlertNotificationsEnabled: (enabled: boolean) => Promise<User>;
      setReminderNotificationsEnabled: (enabled: boolean) => Promise<User>;
      setRssPollInterval: (hours: number) => Promise<User>;
      setWaybackEnabled: (enabled: boolean) => Promise<User>;
      setArchiveKeys: (accessKey: string, secretKey: string) => Promise<User>;
      setPriorityInterval: (id: string, days: number | null) => Promise<void>;
      getCalendarUrl: () => Promise<string>;
      regenerateCalendarToken: () => Promise<User>;
      getIdleTimeout: () => Promise<number>;
      setIdleTimeout: (seconds: number) => Promise<void>;

      // Export
      exportProject: (projectId: string, mode: 'full' | 'sanitized') => Promise<{ success: boolean; error?: string }>;

      // Sync
      triggerSync: (projectId: string) => Promise<SyncStatusEvent>;
      pollAll: () => Promise<void>;
      openFileDialog: (options?: { defaultPath?: string }) => Promise<string | null>;
      decodePayload: (encoded: string) => Promise<DecodePayloadResult>;
      onSyncStatus: (callback: (event: SyncStatusEvent) => void) => () => void;

      // Alerts / RSS mentions
      getAlertRss: (contactId: string) => Promise<ContactAlertRss | null>;
      setAlertRss: (contactId: string, rssUrl: string) => Promise<void>;
      clearAlertRss: (contactId: string) => Promise<void>;
      listMentions: () => Promise<ContactAlertMention[]>;
      markMentionSeen: (id: string) => Promise<void>;
      markAllMentionsSeen: () => Promise<void>;
      dismissMention: (id: string) => Promise<void>;
      clearAllMentions: () => Promise<void>;
      getUnseenMentionCount: () => Promise<number>;
      pollAlertsNow: () => Promise<void>;
      getFeedCount: () => Promise<number>;
      getLastFetched: () => Promise<number | null>;
      onMentionsUpdated: (callback: () => void) => () => void;

      // Reminders
      listRemindersForContactProject: (contactId: string, projectId: string) => Promise<Reminder[]>;
      listAllReminders: () => Promise<Reminder[]>;
      createReminder: (data: {
        contactId: string;
        projectId: string;
        dueDate: number;
        note?: string;
      }) => Promise<Reminder>;
      completeReminder: (id: string) => Promise<void>;
      deleteReminder: (id: string) => Promise<void>;

      // vCard export
      exportVCardContact: (contactId: string) => Promise<void>;
      exportVCardProject: (projectId: string) => Promise<void>;
      exportAllContacts: () => Promise<{ success: boolean; error?: string }>;

      // CSV / vCard import
      importCsv: (data: { projectId?: string }) => Promise<ImportResult>;
      importVcf: (data: { projectId?: string }) => Promise<ImportResult>;
      downloadSampleCsv: () => Promise<void>;

      // Backup
      exportBackup: (password: string) => Promise<{ success: boolean; error?: string }>;
      restoreBackup: (password: string) => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
      runAutoBackup: () => Promise<{ success: boolean; error?: string }>;
      getAutoBackupSettings: () => Promise<{ enabled: boolean; destPath: string | null; maxCount: number }>;
      setAutoBackupSettings: (data: { enabled?: boolean; destPath?: string | null; maxCount?: number }) => Promise<void>;
      chooseBackupFolder: () => Promise<string | null>;

      // Search
      searchGlobal: (query: string) => Promise<SearchResult[]>;

      onRemindersChanged: (callback: () => void) => () => void;

      // Screenshots
      onScreenshotReceived: (callback: (tempId: string) => void) => () => void;
      assignScreenshot: (data: { tempId: string; contactId: string }) => Promise<{ success: boolean; error?: string }>;
      listScreenshots: (contactId: string) => Promise<ContactScreenshot[]>;
      loadScreenshot: (screenshotId: string) => Promise<{ data: string } | { error: string }>;
      deleteScreenshot: (screenshotId: string) => Promise<void>;
      saveScreenshot: (screenshotId: string) => Promise<{ success: boolean; error?: string }>;
      getScreenshotFolderSize: () => Promise<number>;
      openScreenshotFolder: () => Promise<void>;
      onScreenshotAssigned: (callback: (contactId: string) => void) => () => void;

      // Panic wipe
      panicWipe: () => Promise<void>;

      // Dedup
      getDuplicatePairs: () => Promise<DuplicatePair[]>;
      mergeContacts: (data: {
        winnerId: string;
        loserId: string;
        strategy: 'keep' | 'merge' | 'skip';
      }) => Promise<void>;
      onDuplicatePairsUpdated: (callback: (count: number) => void) => () => void;
      onWaybackUpdated: (callback: (contactId: string) => void) => () => void;
      onWaybackStatus: (callback: (payload: { contactId: string; url: string; status: 'pending' | 'failed' }) => void) => () => void;

      // Updater
      onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
      onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
      onUpdateDownloadProgress: (callback: (info: { percent: number }) => void) => () => void;
      onUpdateError: (callback: (info: { message: string }) => void) => () => void;
      downloadUpdate: () => Promise<void>;
      quitAndInstall: () => Promise<void>;
      simulateUpdate: () => Promise<void>;
      getUpdateState: () => Promise<{ event: 'available' | 'downloading' | 'downloaded'; version: string; percent?: number } | null>;
      showUpdateError: (message: string) => Promise<void>;
    };
  }
}
