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

export interface ContactListItem {
  id: string;
  name: string;
  organization: string | null;
  projects: Array<{ id: string; name: string }>;
}

export interface ContactEmail {
  id: string;
  email: string;
  sort_order: number;
}

export interface ContactPhone {
  id: string;
  phone: string;
  sort_order: number;
}

export interface ContactLink {
  id: string;
  type: string;
  label: string | null;
  url: string;
  sort_order: number;
}

export interface ContactProject {
  id: string;
  name: string;
  membership_id: string;
  status: string | null;
  reporter_name: string;
}

export interface ContactDetail {
  id: string;
  name: string;
  organization: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
  emails: ContactEmail[];
  phones: ContactPhone[];
  links: ContactLink[];
  projects: ContactProject[];
}

export interface CreateContactInput {
  name: string;
  organization?: string;
  notes?: string;
  emails?: string[];
  phones?: string[];
  linkedinUrl?: string;
}

export interface ProjectContactRow {
  id: string;
  name: string;
  organization: string | null;
  membership_id: string;
  reporter_name: string;
  theme: string | null;
  priority: string | null;
  status: string | null;
}
