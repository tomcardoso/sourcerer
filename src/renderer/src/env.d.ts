/// <reference types="vite/client" />

import type { Project, User } from '@shared/types';

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
    };
  }
}
