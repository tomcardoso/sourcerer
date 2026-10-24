# User guide

A full walkthrough of every feature — from first launch to advanced collaboration.

## Getting started

### Installation

Pre-built installers for macOS (Apple Silicon), Windows (x64), and Linux (x64) are available on the [releases page](https://github.com/tomcardoso/sourcerer/releases/latest).

**macOS:** Download the `.dmg` and follow the standard installation steps. Because the app is not distributed through the Mac App Store, macOS may block it on first launch — right-click the app and choose **Open** to bypass the Gatekeeper warning.

**Windows:** Download the `.exe` installer and run it. Windows Defender SmartScreen may warn you because the app is not widely distributed — click **More info → Run anyway** to proceed.

**Linux:** Download the `.AppImage` file. Make it executable and run it:

```
chmod +x Sourcerer-*.AppImage
./Sourcerer-*.AppImage
```

On Ubuntu 22.04 and later, AppImage requires `libfuse2`, which is not installed by default. Install it with: `sudo apt install libfuse2`

### First launch

The first time you open Sourcerer, setup happens in two steps.

**Step 1 — Vault location.** Choose where to store your vault. The vault is a self-contained `.sourcerer` bundle — a folder containing the encrypted database, key file, and screenshots. On macOS, Finder shows it as a single opaque file. You have three options:

- **Choose a folder…** — opens a dialog to name and place the bundle. Recommended if you want full control over where your data lives, or plan to carry it to another machine.
- **Open existing vault…** — for reinstalls or moving from another computer. Point Sourcerer at your existing `.sourcerer` bundle and the app will go straight to the unlock screen.
- **Use default location** — places the vault in your system's application data folder without prompting (`~/Library/Application Support/sourcerer` on macOS).

**Step 2 — Profile and password.** Enter your name, email address, and master password.

- **Your name** — used to attribute interactions and project membership
- **Email address** — used as your identity in shared projects
- **Master password** — used to derive the encryption key

> **The master password cannot be recovered.** There is no reset mechanism and no fallback. If you forget it, your data is gone. Choose a passphrase — four or more random words are easier to remember and just as strong as a complex string.

### Unlocking

Every time you open Sourcerer, you will be prompted for your master password. The app derives the encryption key fresh each time — the key is never stored anywhere. If the password is wrong, the database cannot be opened.

The app can be set to lock automatically after a period of inactivity. See [Settings](#settings) for details.

## Your contacts

### Adding a contact

Click **New contact** from the contacts view or from within a project. The minimum required field is a name. All other fields are optional but useful for outreach tracking and deduplication.

### Contact fields

Each contact can hold:

- **Name**, **organisation**, and **title / role**
- **Notes** — a freeform scratchpad, not shared in sanitised exports
- **Email addresses** — as many as needed; mark one as primary
- **Phone numbers** — with labels (mobile, work, etc.); extensions are preserved (e.g., `+1 202 456 1111 ext. 567`)
- **Messaging handles** — Signal, WhatsApp, Telegram, and others, with a type label
- **Links** — LinkedIn, X, Instagram, Facebook, personal website, or a custom label

### Staleness indicator

Contacts you have not touched in a configurable number of days are flagged with a visual indicator in the contacts list. The threshold is set in [Settings](#settings). This is useful for keeping a source list warm — especially contacts you are not actively working but want to stay in periodic touch with.

### Duplicate detection

Sourcerer continuously checks for likely-duplicate contacts using fuzzy name matching and exact email and phone signals. When duplicates are found, a badge appears in the contacts view.

Clicking the badge opens the deduplication panel, which shows each suspected pair side-by-side. For each pair you can:

- **Merge** — choose which record to keep as primary. The other record's emails, phones, links, project memberships, and interactions are moved to the surviving contact, then the duplicate is deleted.
- **Dismiss** — mark the pair as intentionally distinct (two people with the same name, for instance).

## Projects

### What is a project?

A project groups contacts for a specific story, investigation, or beat. Each contact can belong to multiple projects simultaneously, and each project membership is tracked independently — with its own status, priority, reporter, notes, and interaction log.

### Creating a project

Click **New project** in the sidebar. Give it a name. That is all you need to get started.

### Adding sources to a project

From inside a project, use **Add contact** to add an existing contact or create a new one. You can also add contacts to a project from the global contacts view using the bulk-select checkbox menu.

### Per-project fields

Every contact in a project has its own separate fields, independent of any other project:

- **Status** — where you are in the outreach process (see [Outreach](#outreach))
- **Priority** — how urgently you want to reach this contact
- **Theme** — a freeform label for grouping (e.g. "Government", "Industry source")
- **Reporter** — which reporter owns this relationship in this project
- **Outreach enabled** — toggle to include or exclude from reminder tracking

### Reporter attribution

Multiple reporters can be assigned to the same contact within a project (e.g. if two reporters are jointly working a source). If the same contact is independently assigned to two reporters who are not collaborating, a conflict indicator will appear to flag the overlap.

### Shared projects

See [Collaboration](#collaboration) for details on shared projects.

## Outreach

### Status workflow

Each contact in a project has a status that tracks where you are in the outreach process. The available statuses are:

| Status | Meaning |
| --- | --- |
| Not yet contacted | Default. No outreach has been made. |
| Contacted, no reply | You have reached out but received no response. |
| In dialogue | An exchange is ongoing. |
| Interview arranged | A meeting or call is scheduled. |
| Interviewed, off-record | Interview completed, not for attribution. |
| Interviewed, on-record | Interview completed, for attribution. |
| Declined | Contact has declined to participate. |
| Declined, door open | Declined for now but may reconsider. |
| Referred to comms | Contact has directed you to a press or communications office. |
| Ghosted | Contact stopped responding after initial engagement. |
| Do not contact | Contact has asked not to be reached out to again. |

### Priority and reminder intervals

Priority controls how frequently Sourcerer reminds you to follow up on a contact. The intervals are fixed:

| Priority | Reminder interval |
| --- | --- |
| Critical | Every 7 days |
| High | Every 14 days |
| Medium | Every 28 days |
| Low | Every 60 days |
| Monitor-only | No automatic reminder |

Reminders appear in the **Reminders** view, and Sourcerer fires a desktop notification when a reminder becomes overdue. You can also subscribe to upcoming reminders as a calendar feed — see [Settings](#settings).

### Logging interactions

Each project membership has an interaction log. Every entry records the date, which reporter made the contact, and a freeform note. The log is included in full exports but stripped from sanitised exports.

The interaction log is also used to calculate the _last contacted_ date, which drives the staleness indicator and reminder schedule.

### Manual reminders

In addition to automatic priority-based reminders, you can set a manual reminder on any contact in any project. A manual reminder has a due date and an optional note. Manual reminders appear in the Reminders view alongside automatic ones.

## Alerts

### RSS feed monitoring

You can attach one or more RSS feeds to any contact. Sourcerer polls these feeds in the background while the app is open and surfaces new articles in the **Alerts** view, linked to the corresponding contact. This is useful for tracking press coverage of sources — for example, a Google News alert RSS feed for a person's name.

To add a feed, open a contact's detail panel and add a feed URL in the Alerts section.

### The Alerts view

The Alerts view shows all recent mentions across all your contacts, sorted by recency. Each item shows the article title, publication date, the source it is linked to, and the feed it came from.

### Wayback Machine snapshots

When saving a website link on a contact, Sourcerer can optionally submit it to the [Internet Archive's Wayback Machine](https://web.archive.org). This creates a permanent public snapshot of the page so you have a record even if the original URL disappears. The snapshot URL is saved to the contact and shown alongside the link.

Wayback archiving uses the [Save Page Now 2 (SPN2) API](https://docs.google.com/document/d/1Nsv52MvSjbLb2PCpHlat0gkzw0EvtSgpKHu4mk0MnrA/), which requires free Archive.org S3 API keys. To set up archiving:

1. Create a free account at [archive.org](https://archive.org).
2. Visit [archive.org/account/s3.php](https://archive.org/account/s3.php) to generate your access key and secret key.
3. In Sourcerer, go to **Settings → Website archiving**, enable the toggle, and enter both keys.

Archiving only fires for generic website links — social media profile URLs (LinkedIn, X, Instagram, Facebook) are excluded. Note that submitted URLs become public records on archive.org.

## Import & export

### Importing from CSV

You can import contacts from a CSV file. The only required column is **Name**. Other supported columns include: `Organization`, `Title`, `Notes`, `Email`, `Phone`, `LinkedIn`, `X`, and `Website`.

For fields that can hold multiple values (emails, phones, websites), use semicolons to separate values within a single cell:

> **Example:** A cell in the Email column reading `alice@example.com;alice@work.com` will create two email addresses on the imported contact.

On import you can choose whether to add contacts to a specific project.

### Importing from vCard (.vcf)

You can import contacts from a .vcf file exported by Apple Contacts, Google Contacts, or any standard address book. Both single-contact and multi-contact files are supported. The following fields are imported: `FN` (name), `ORG` (organisation), `NOTE` (notes), `EMAIL`, `TEL` (phone, normalised to international format), and `URL` (website links).

Contacts with a name or email matching an existing record are skipped. Duplicate fields within a single vCard entry are deduplicated automatically.

### Exporting contacts

Contacts can be exported from the global contacts view or from within a project. Three formats are available:

- **CSV** — one row per contact, with interaction logs as a newline-separated field
- **Excel (.xlsx)** — same structure as CSV, formatted for spreadsheet apps
- **vCard (.vcf)** — standard contact format, importable into address book apps

### Sanitised export

The sanitised export mode strips **notes** and the **interaction log** from every contact. Use this when sharing a contact list with someone who should not see reporter notes or the history of outreach attempts.

### Printing a contact sheet

From any contact's detail panel, click the print icon to open a formatted contact sheet in the system print dialog. The sheet includes the contact's name, organisation, all contact details, and their project memberships. Notes and interaction logs are not included.

## Browser extension

The Sourcerer browser extension lets you capture full-page screenshots, save selected text as contact fields, and add new contacts — all without leaving your browser. It works in Chrome, Edge, Brave, Arc, and Firefox. See the [extension guide](extension.html) for full details.

### Installation

**Chrome / Edge / Brave / Arc:** [Install from the Chrome Web Store](https://chromewebstore.google.com/detail/sourcerer/pipgdnekoknjbghnmhilapocpchdcadm)

**Firefox:** [Install from Firefox Add-ons](https://addons.mozilla.org/en-CA/firefox/addon/sourcerer-for-journalists/)

See the [extension guide](extension.html) for connection instructions and full feature details.

### Connecting

Click the Sourcerer icon in the browser toolbar. If this is your first time, click **Connect to Sourcerer** — an approval prompt will appear in the app. Click **Approve**. The connection persists across app restarts, but must be re-granted after the app is locked — either by the auto-lock timer or manually.

### What you can do

- **Save screenshot** — captures the full current page and queues it for assignment to a contact in the app.
- **Save selection to contact** — select text on any page first, then open the popup. You can save it as an email, phone number, or note on any existing contact.
- **New contact** — create a contact directly from the popup without switching to the app.
- **Right-click menu** — select text on any page, right-click, and choose _Save to Sourcerer_ to go straight to the save or new-contact screen.

## Settings

### Vault location

The vault location section shows the path to your current `.sourcerer` bundle. Click **Move vault** to relocate it — Sourcerer copies the database, key file, and screenshots to the new location, updates its internal config, and locks the app so the next unlock reads from the new path. The old vault is deleted after a successful copy.

If you choose a location inside a cloud-synced folder (Dropbox, OneDrive, iCloud Drive, Google Drive, or Box), Sourcerer will warn you that opening the vault on more than one device at the same time may corrupt the database. The vault is a live SQLite file, not a document — simultaneous writes from two machines are not safe.

### Changing your master password

Sourcerer re-encrypts the entire database with a new key derived from your new password. All database pages are re-written. You will need to use the new password on all machines that share the same database file.

### Auto-lock

Set a timeout (in minutes) after which Sourcerer will lock itself if no interaction is detected. Set to zero to disable auto-lock. When locked, the encryption key is cleared from memory and you must re-enter your password to continue.

### Staleness threshold

Configure how many days of inactivity cause a contact to be flagged as stale. The default is 90 days.

### Panic wipe

The panic wipe button irreversibly destroys:

- The encrypted database
- The salt file
- All stored screenshots

Clicking the button reveals a confirmation step that requires you to type **WIPE** before destruction begins. If you have a backup, it will not be affected — and unlike the live database, the backup embeds its own salt so it can be restored with just your password.

> **This cannot be undone.** Once you confirm, data is gone. Only use panic wipe when you need the data gone immediately.

### Backup and restore

The backup function exports an encrypted copy of your database. The backup uses the same master password as the current database. Store backups somewhere separate from the live vault — on an encrypted external drive or in a password-protected archive.

To restore, select a backup file. Sourcerer will validate the backup before overwriting the live database. The backup must have been made with the same password (or a password you still know).

> **Backup size limit:** Sourcerer will not restore a backup file larger than 250 MB, as a safeguard against accidentally selecting the wrong file.

### Automatic backup

Sourcerer can back up your vault automatically once per day. In Settings, enable auto-backup, choose a destination folder, and set how many backup files to keep (the oldest are pruned once the limit is reached). A backup also runs automatically when you quit the app, if auto-backup is enabled and a destination is set.

### Redaction mode

Press **Ctrl+Shift+R** at any time to toggle redaction mode. While active, all contact names, organisations, emails, phones, handles, links, and notes are blurred on screen. This is useful when working in a public place or sharing your screen. Press the shortcut again to disable it.

### Phone number country

Sourcerer normalises all phone numbers to international format (e.g. `+1 202 555 0100`) using a default country for numbers entered without a country code. The default is **Canada (CA)**. If you are based in a different country, update this setting so that locally-formatted numbers are parsed correctly. You can find it in Settings under **Phone number country**. Choose the two-letter country code that matches where your contacts are primarily located.

### Calendar feed

Sourcerer can expose your upcoming reminders as a calendar feed, which you can subscribe to from any local calendar app (Apple Calendar, Outlook, Thunderbird, and others). Copy the calendar URL from Settings and paste it into your calendar app's “Subscribe to calendar” dialog. The feed is served over `http://` on your local machine — it is only accessible while Sourcerer is running, and only from this computer. The feed URL contains a token — if you believe it has been compromised, click **Regenerate token** to invalidate the old URL.

## Collaboration

### How shared projects work

Sourcerer supports lightweight file-based collaboration. A shared project is simply a second SQLCipher database file stored somewhere two or more people can access — a shared Dropbox folder, a team OneDrive, or a network drive.

Each person points their Sourcerer installation at the same file using **Join shared project**. Everyone who accesses the file needs the same master password that was used when it was created.

### Sync behaviour

Sourcerer polls the shared file every two minutes. Changes are merged on a last-write-wins basis using `updated_at` timestamps — if two people update the same contact record at almost the same time, whichever save happened last will win.

Because sync is file-based, it only works when both users are online and the shared folder is in sync. If the cloud folder is paused or offline, changes will not propagate until connectivity is restored.

### What "sync" does and doesn't promise

Shared projects work by putting one database file in a folder your cloud provider keeps in step across machines. That is what makes collaboration possible without any Sourcerer server ever seeing your data — but it is worth being precise about what it can and cannot do.

**The practical rule: avoid two people editing the same project at the same moment.** Work a few minutes apart and everything merges cleanly. Changes normally appear on the other person's machine within a couple of minutes.

The reason for that rule is that cloud providers sync whole files. They do not merge two versions of a file — when two people save inside the same upload window, the provider keeps one version and sets the other aside.

> **If you see a "conflicted copy":** Dropbox (and the equivalent in OneDrive, iCloud Drive and Google Drive) will sometimes leave a second file next to your `.sourcerer` project with a name like _"project (Tom's conflicted copy 2026-07-20).sourcerer"_. That means two people wrote at once and the changes in that copy never made it into the main file. Don't delete it — it holds someone's work. Open it as a separate shared project to see what's inside and re-enter anything that's missing.

One more caveat: because there is no server, deciding "which save was last" relies on the clocks of the machines involved. If someone's computer clock is significantly wrong, their older change can beat a newer one. This is rare, but it is the reason the app can't promise perfect ordering.

### What is and isn't synced

All project data is synced: contact memberships, status, priority, reporter attribution, themes, interaction logs, and reminders.

> **Not synced:** The per-contact notes scratchpad (global notes on a contact, outside of project context) is local to each installation and is never written to the shared file. Whether you've seen or dismissed a news alert is also personal to your own installation — marking an alert as read doesn't clear it for your collaborators.

### Caveats

- There is no live conflict resolution UI — last-write-wins is silent.
- Deleting a contact or project in one installation will propagate to others on the next sync cycle.
- The shared database file is encrypted with SQLCipher — anyone who gains access to the file still needs the password to read it.
