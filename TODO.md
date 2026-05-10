# Sourcerer — To Do

## Documentation (upcoming)

The app is approaching a stable v1 state. A documentation pass is needed before public release.

### Baked-in constants to document

**Contact statuses** (fixed, not user-editable):
- Not yet contacted
- Outreach attempted, no response
- Declined
- Declined, door left open
- Referred to communications
- Agreed, not yet scheduled
- Interviewed off-record
- Interviewed on-record
- Ghosted
- Do not contact

**Priority levels** (fixed, not user-editable):
| Level | Default interval |
|---|---|
| Critical | Weekly (7 days) |
| High | Every 2 weeks (14 days) |
| Medium | Every 4 weeks (28 days) |
| Low | Every 2 months (60 days) |
| Monitor-only | No reminders |

Intervals can be changed per-user in Settings → Priority levels. Priority labels are the same for all users, including on shared projects — this ensures consistency when multiple reporters collaborate on the same project.

### Other documentation items
- Shared project setup flow (payload exchange, file path, key)
- Backup and restore workflow
- Calendar subscription setup (Apple Calendar, Outlook, Google Calendar)
- Google Alerts RSS integration
- Wayback Machine archiving behaviour
- Export formats (XLSX, CSV, vCard)
- Keyboard shortcuts (⌘K search, Esc to close drawers/modals, ⌘↵ to submit log entries)
- Auto-lock and password change
- Deduplication workflow
- Staleness indicator threshold
