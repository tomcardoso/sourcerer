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
  AuditLogEntry,
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
      deleteProject: (id: string) => Promise<void>;

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

      // Interaction log
      listInteractionLog: (membershipId: string) => Promise<InteractionLogEntry[]>;
      addInteractionLogEntry: (membershipId: string, body: string) => Promise<InteractionLogEntry>;

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
      setPriorityInterval: (id: string, days: number | null) => Promise<void>;
      getCalendarUrl: () => Promise<string>;
      regenerateCalendarToken: () => Promise<User>;
      getIdleTimeout: () => Promise<number>;
      setIdleTimeout: (seconds: number) => Promise<void>;

      createStatusOption: (label: string) => Promise<StatusOption>;
      renameStatusOption: (id: string, label: string) => Promise<void>;
      deleteStatusOption: (id: string) => Promise<void>;
      moveStatusOption: (id: string, direction: 'up' | 'down') => Promise<void>;

      createPriorityOption: (label: string) => Promise<PriorityOption>;
      renamePriorityOption: (id: string, label: string) => Promise<void>;
      deletePriorityOption: (id: string) => Promise<void>;
      movePriorityOption: (id: string, direction: 'up' | 'down') => Promise<void>;

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
      clearAllMentions: () => Promise<void>;
      getUnseenMentionCount: () => Promise<number>;
      pollAlertsNow: () => Promise<void>;
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
      deleteReminder: (id: string) => Promise<void>;

      // vCard export
      exportVCardContact: (contactId: string) => Promise<void>;
      exportVCardProject: (projectId: string) => Promise<void>;

      // CSV import
      importCsv: (data: { projectId?: string }) => Promise<ImportResult>;
      downloadSampleCsv: () => Promise<void>;

      // Audit log
      listAuditLog: () => Promise<AuditLogEntry[]>;

      // Panic wipe
      panicWipe: () => Promise<void>;
    };
  }
}
