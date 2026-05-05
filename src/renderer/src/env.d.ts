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

      // App data
      getUser: () => Promise<User>;

      // Projects
      listProjects: () => Promise<Project[]>;
      createProject: (data: { name: string; description?: string }) => Promise<Project>;
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
    };
  }
}
