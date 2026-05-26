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

export interface PickVaultLocationResult {
  path?: string;
  error?: string;
}

export interface OpenExistingVaultResult {
  success: boolean;
  error?: string;
}

export interface MoveVaultResult {
  success: boolean;
  error?: string;
  newPath?: string;
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
  is_archived: 0 | 1;
  shared_db_path: string | null;
  shared_pending_writes: 0 | 1;
  created_at: number;
  last_synced_at: number | null;
}

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  created_at: number;
  /** Not returned by app:get-user or settings:regenerate-calendar-token;
   *  exposed only via the settings:get-calendar-url handler. */
  calendar_token?: string;
  idle_timeout_seconds: number;
  phone_country: string;
  outreach_reminders_enabled: 0 | 1;
  outreach_require_interaction: 0 | 1;
  staleness_enabled: 0 | 1;
  staleness_threshold_days: number;
  alert_notifications_enabled: 0 | 1;
  reminder_notifications_enabled: 0 | 1;
  rss_poll_interval_hours: number;
  wayback_enabled: 0 | 1;
  wayback_keys_configured: 0 | 1;
  auto_backup_enabled: 0 | 1;
  auto_backup_dest_path: string | null;
  auto_backup_max_count: number;
}

export interface ContactListItem {
  id: string;
  name: string;
  organization: string | null;
  title: string | null;
  notes: string | null;
  created_at: number;
  has_email: 0 | 1;
  has_phone: 0 | 1;
  emails_raw: string | null;
  phones_raw: string | null;
  date_first_contacted: number | null;
  date_last_contacted: number | null;
  projects: Array<{ id: string; name: string }>;
}

export interface ContactEmail {
  id: string;
  email: string;
  label: string | null;
  sort_order: number;
}

export interface ContactPhone {
  id: string;
  phone: string;
  label: string | null;
  sort_order: number;
}

export interface ContactLink {
  id: string;
  type: 'linkedin' | 'x' | 'instagram' | 'facebook' | 'website' | 'other';
  label: string | null;
  url: string;
  wayback_url: string | null;
  sort_order: number;
}

export type ContactHandleType = 'signal' | 'whatsapp' | 'telegram' | 'other';

export interface ContactHandle {
  id: string;
  type: ContactHandleType;
  handle: string;
  sort_order: number;
}

export interface ContactHandleInput {
  type: ContactHandleType;
  handle: string;
}

export interface ContactProject {
  id: string;
  name: string;
  membership_id: string;
  status: string | null;
  priority: string | null;
  theme: string | null;
  first_outreach_at: number | null;
  first_log_at: number | null;
  date_last_contacted: number | null;
  reporter_name: string;
  reporter_email: string;
  outreach_reminders_enabled: 0 | 1;
  reporter_conflict: 0 | 1;
  reporters: Array<{ email: string; name: string }>;
}

export interface ContactDetail {
  id: string;
  name: string;
  organization: string | null;
  title: string | null;
  dob: string | null;
  notes: string | null;
  default_membership_id: string | null;
  created_at: number;
  updated_at: number;
  emails: ContactEmail[];
  phones: ContactPhone[];
  links: ContactLink[];
  handles: ContactHandle[];
  projects: ContactProject[];
}

export interface ContactLinkInput {
  type: 'linkedin' | 'x' | 'instagram' | 'facebook' | 'website' | 'other';
  url: string;
  label?: string;
}

export interface CreateContactInput {
  name: string;
  organization?: string;
  title?: string;
  dob?: string;
  notes?: string;
  emails?: Array<{ email: string; label?: string }>;
  phones?: Array<{ phone: string; label?: string }>;
  links?: ContactLinkInput[];
  handles?: ContactHandleInput[];
}

export interface UpdateContactInput {
  id: string;
  name: string;
  organization?: string;
  title?: string;
  dob?: string;
  notes?: string;
  emails?: Array<{ email: string; label?: string }>;
  phones?: Array<{ phone: string; label?: string }>;
  links?: ContactLinkInput[];
  handles?: ContactHandleInput[];
}

export interface UpdateMembershipInput {
  membershipId: string;
  status?: string | null;
  priority?: string | null;
  theme?: string | null;
  outreachRemindersEnabled?: 0 | 1;
  reporterEmail?: string;
  reporterName?: string;
  clearConflict?: boolean;
}

export interface InteractionLogEntry {
  id: string;
  contact_id: string;
  reporter_name: string;
  reporter_email: string;
  body: string;
  created_at: number;
}

export interface ContactLogEntry extends InteractionLogEntry {
  project_name: string | null;
}

export interface TimelineEntryProject {
  project_id: string;
  project_name: string;
  membership_id: string;
  theme: string | null;
  priority: string | null;
}

export interface TimelineEntry {
  id: string;
  body: string;
  created_at: number;
  reporter_name: string;
  reporter_email: string;
  contact_id: string;
  contact_name: string;
  contact_organization: string | null;
  projects: TimelineEntryProject[];
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
  emails_raw: string | null;
  phones_raw: string | null;
  date_first_contacted: number | null;
  date_last_contacted: number | null;
  membership_id: string;
  membership_created_at: number;
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
  originalFilename?: string;
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
  project_id: string | null;
  membership_id: string | null;
  contact_name: string;
  project_name: string | null;
  due_date: number;
  note: string | null;
  is_auto_outreach: 0 | 1;
  created_at: number;
  completed_at: number | null;
}

export interface ImportResult {
  imported: number;
  skipped: Array<{ name: string; reason: 'name' | 'email' | 'missing-name' }>;
  cancelled: boolean;
  error?: string;
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

export interface DedupContact {
  id: string;
  name: string;
  organization: string | null;
  notes: string | null;
  emails: string[];
  phones: string[];
  projectCount: number;
  projects: string[];
}

export interface DuplicatePair {
  a: DedupContact;
  b: DedupContact;
  reason: 'email' | 'phone' | 'name';
}

export type SearchResult =
  | { type: 'contact'; id: string; name: string; subtitle: string | null }
  | { type: 'project'; id: string; name: string; subtitle: string | null }
  | { type: 'log'; id: string; name: string; subtitle: string | null; excerpt: string; contactId: string };

export interface ContactScreenshot {
  id: string;
  contact_id: string;
  tab_url: string | null;
  captured_at: number;
}
