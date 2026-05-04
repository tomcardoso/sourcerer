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

export interface Project {
  id: string;
  name: string;
  description: string | null;
  is_shared: 0 | 1;
  shared_db_path: string | null;
  shared_pending_writes: 0 | 1;
  created_at: number;
}

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  created_at: number;
  calendar_token: string;
}
