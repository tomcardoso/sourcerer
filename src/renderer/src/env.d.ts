/// <reference types="vite/client" />

interface Window {
  sourceror: {
    checkFirstLaunch: () => Promise<{ isFirstLaunch: boolean }>;
    completeSetup: (data: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
    }) => Promise<{ success: boolean; error?: string }>;
    unlock: (password: string) => Promise<{ success: boolean; error?: string }>;
    onLocked: (callback: () => void) => () => void;
  };
}
