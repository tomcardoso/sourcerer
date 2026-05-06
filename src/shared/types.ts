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
  idle_timeout_seconds: number;
  phone_country: string;
  outreach_reminders_enabled: 0 | 1;
}

export interface ContactListItem {
  id: string;
  name: string;
  organization: string | null;
  notes: string | null;
  has_email: 0 | 1;
  has_phone: 0 | 1;
  date_last_contacted: number | null;
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
  priority: string | null;
  theme: string | null;
  first_outreach_at: number | null;
  reporter_name: string;
  reporter_email: string;
  outreach_interval_days: number | null;
  outreach_reminders_disabled: 0 | 1;
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

export interface ContactLinkInput {
  type: string;
  url: string;
  label?: string;
}

export interface CreateContactInput {
  name: string;
  organization?: string;
  notes?: string;
  emails?: string[];
  phones?: string[];
  links?: ContactLinkInput[];
}

export interface UpdateContactInput {
  id: string;
  name: string;
  organization?: string;
  notes?: string;
  emails?: string[];
  phones?: string[];
  links?: ContactLinkInput[];
}

export interface UpdateMembershipInput {
  membershipId: string;
  status?: string | null;
  priority?: string | null;
  theme?: string | null;
  firstOutreachAt?: number | null;
  outreachIntervalDays?: number | null;
  outreachRemindersDisabled?: 0 | 1;
}

export interface InteractionLogEntry {
  id: string;
  membership_id: string;
  reporter_name: string;
  reporter_email: string;
  body: string;
  created_at: number;
}

export interface ScratchpadDraft {
  id: string;
  contact_id: string;
  project_id: string;
  label: string;
  body: string;
  created_at: number;
  updated_at: number;
}

export interface StatusOption {
  id: string;
  label: string;
  sort_order: number;
  is_default: number;
}

export interface PriorityOption {
  id: string;
  label: string;
  sort_order: number;
  is_default: number;
  outreach_interval_days: number | null;
}

export interface ProjectContactRow {
  id: string;
  name: string;
  organization: string | null;
  notes: string | null;
  has_email: 0 | 1;
  has_phone: 0 | 1;
  date_last_contacted: number | null;
  membership_id: string;
  reporter_name: string;
  reporter_email: string;
  theme: string | null;
  priority: string | null;
  status: string | null;
}

export interface CreateSharedProjectResult {
  project: Project;
  payload: string;
}

export interface SyncStatusEvent {
  projectId: string;
  success: boolean;
  lastSyncAt: number;
  pendingWrites: number;
  error?: string;
}

export interface DecodePayloadResult {
  success: boolean;
  name?: string;
  description?: string | null;
  originalPath?: string;
  keyHex?: string;
  error?: string;
}

export interface ProjectReporter {
  id: string;
  project_id: string;
  name: string;
  email: string;
  is_self: 0 | 1;
}

export interface Reminder {
  id: string;
  contact_id: string;
  project_id: string;
  contact_name: string;
  project_name: string;
  due_date: number;
  note: string | null;
  created_at: number;
}

export interface ContactAlertRss {
  id: string;
  contact_id: string;
  rss_url: string;
  last_polled_at: number | null;
  is_invalid: 0 | 1;
}

export interface ContactAlertMention {
  id: string;
  contact_id: string;
  contact_name: string;
  headline: string;
  source_url: string;
  published_at: number | null;
  fetched_at: number;
  guid: string;
  seen: 0 | 1;
}
