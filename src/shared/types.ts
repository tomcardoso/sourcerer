export interface SetupFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface SetupResult {
  success: boolean;
  error?: string;
}

export interface FirstLaunchResult {
  isFirstLaunch: boolean;
}

export interface UnlockResult {
  success: boolean;
  error?: string;
}
