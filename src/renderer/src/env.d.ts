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
    sourceror: {
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
    };
  }
}
