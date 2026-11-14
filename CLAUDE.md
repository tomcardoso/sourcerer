# Sourcerer — Claude Code guide

## Stack

- **Electron** (main process) + **React + TypeScript** (renderer) via electron-vite
- **SQLite via better-sqlite3-multiple-ciphers** (SQLCipher 4) — all data is encrypted at rest
- **Argon2id** for key derivation (password + salt file → 32-byte hex key)
- Native modules: `better-sqlite3-multiple-ciphers`, `argon2` — must be rebuilt when switching between Electron and plain Node targets (see below)

## Dev workflow

```bash
npm install
npm run rebuild       # build native modules for Electron (required for npm run dev)
npm run dev           # start the app
```

**Running tests** (native modules must target plain Node, not Electron):

```bash
npm run rebuild:node  # build native modules for system Node
npm test
npm run rebuild       # restore Electron-targeted binaries before npm run dev
```

**Running the end-to-end tests** (`e2e/`, Playwright driving the built app; native modules must target Electron, the opposite of `npm test`):

```bash
npm run rebuild       # build native modules for Electron
npm run build         # the tests launch out/, so rebuild it after every change
npm run test:e2e      # under `xvfb-run -a` on headless Linux
```

- Each test launches the app in its own throwaway home folder (`e2e/sourcerer.ts`), with `SOURCERER_USER_DATA` pointing its userData there (needed on Windows, where userData doesn't follow `HOME`; an installed app ignores it). Unlocking fills the vault with the dev seeds, as `npm run screenshots` does
- Specs drive the UI by visible labels and class names, like `scripts/screenshots.mjs`, so renaming one of those can break them. Native file dialogs are answered in the main process with `answerFileDialog`, and notifications are silenced
- Any uncaught error in the window fails a test. A failed test keeps a Playwright trace of each launch and the app's diagnostics trace in `test-results/` (`npx playwright show-trace test-results/<test>/trace-launch-1.zip`)
- Tests run in parallel, so only the first app to start gets the extension server's port (27371); the others carry on without it. Don't write an e2e test that needs that server without making the port per-test
- CI: pull requests run the Linux leg (`ci.yml`'s `e2e` job). `.github/workflows/e2e.yml` runs macOS arm64, macOS x64, Windows and Linux; run it by hand to check a branch, and every release runs it before building installers

**Inspecting the database** (TablePlus, DB Browser, sqlite3, etc.):

```bash
npm run rebuild:node  # only needed once, or after switching targets
npm run db:export     # prompts for app password, writes sourcerer-plain.db
# open sourcerer-plain.db in TablePlus as a plain SQLite connection (no password)
# delete the file when done — it contains all data in plaintext
```

## Website and docs

The website (https://tomcardoso.github.io/sourcerer/) is built from `site/` and `docs/`:

- `docs/guide.md`, `docs/extension.md`, `docs/security.md` are the documentation — Markdown that GitHub shows as-is and `site/build.mjs` renders into `guide.html`, `extension.html` and `security.html` (the app's Help menu links to the first two, so keep those names). A new page must be added to `PAGES` in `site/build.mjs`, or the build fails. When a change affects something user-facing, update the relevant page in the same PR
- `site/src/index.html` is the landing page; its styles and scripts are in `site/src/assets/`. The site uses the app's own tokens, fonts (copied from `src/renderer/src/assets/fonts`) and hard design rules
- Preview with `cd site && npm ci && npm run dev` (http://localhost:4321)
- App screenshots live in `docs/images/` as `app-<name>.png` and `app-<name>-dark.png`. `npm run screenshots` (after `npm run rebuild && npm run build`; under `xvfb-run -a` on headless Linux) launches the built app in a throwaway home folder, creates a vault filled with the fictional dev seeds, and captures every screen in both themes. `scripts/screenshots.mjs` drives the UI by its visible labels and class names, so renaming one of those can break the capture
- The screenshots in `docs/images/` (shown by the README, the docs on GitHub and the website) are retaken after every release by `build.yml`'s `screenshots` job. It opens a pull request with them, runs CI on it by dispatch, merges it itself, then starts `.github/workflows/pages.yml` to rebuild the site. GitHub holds the `pull_request` runs of a pull request opened by `github-actions[bot]` for approval, and a held run blocks the merge, so CI and the website skip a pull request that changes only `docs/images/app-*.png`. This needs the repository setting "Allow GitHub Actions to create and approve pull requests". Between releases, run `npm run screenshots` locally to refresh them by hand
- `.github/workflows/pages.yml` builds the site from the committed screenshots; it runs on pushes to `main` that touch `docs/` or `site/` (not the app screenshots alone), after each release (started by the `screenshots` job), and by hand

## Git / PR rules

- `main` is protected — all changes must go through a pull request
- Branch naming: `feature/`, `fix/`, `dev/` prefixes
- Always push to a feature branch and open a PR via `gh pr create`
- CI runs a `test` status check on Linux — PRs won't merge until it passes. After a merge to `main` that touches code or dependencies, `.github/workflows/platforms.yml` runs the tests on Windows and macOS; a failure there shows on `main`'s commit, to fix in a follow-up PR (#461). It can also be run by hand on a branch
- To auto-close issues on merge, use one `Closes #N` line per issue — **not** `Closes #1, #2, #3` (GitHub only closes the first number in a comma-separated list)

## Cutting a release

Releases are built by `.github/workflows/build.yml`, started either by pushing a version tag (`v*`) or by running the workflow by hand on `main` with **release** ticked. Because `main` is protected, the version bump goes through a PR first; the release is started after merge.

1. Create a version bump branch: `git checkout -b chore/v{VERSION}`
2. Bump the version (updates `package.json` and creates a local git tag):
   ```bash
   npm version patch   # 0.1.x → 0.1.x+1
   # or
   npm version minor   # 0.1.x → 0.2.0
   ```
   (`preversion` runs typecheck + tests automatically before bumping)
3. Push the branch (**not** the tag yet) and open a PR:
   ```bash
   git push -u origin chore/v{VERSION}
   gh pr create ...
   ```
4. Add a `## What's new` section to the PR body — plain English, written for a lay audience (not a developer changelog). This becomes the public release notes, so it should cover **all meaningful changes since the previous version tag**: new features, significant fixes, removals, and anything a user would notice. Run `git log v{PREV_VERSION}..HEAD --oneline` to get the full list of commits to draw from. The release workflow will prepend it to the auto-generated PR list (which appears in a collapsible Details block below).
5. Once the PR is merged, start the release in one of two ways:
   - **Run the workflow by hand** (Actions → Build and Release → Run workflow, on `main`, with **release** ticked). It releases `package.json`'s version and creates the tag `v{VERSION}` itself, only after every build and test has passed. A cloud session can't push tags (the push is refused with HTTP 403), so this is its way to release, and it works from a phone.
   - **Or push the tag** from a local clone:
     ```bash
     git checkout main && git pull
     git push origin v{VERSION}
     ```
     The tag must match `package.json`'s version, or the workflow stops before building.
6. The `build.yml` workflow runs the end-to-end tests on every platform (`e2e.yml`), builds on macOS, Windows, and Linux, then creates a GitHub Release with all artifacts automatically. Run by hand **without** release ticked (on any branch), it is a test build: everything is built and tested, the installers are kept as the run's artifacts, and nothing is published

## UI design system

All design tokens are CSS custom properties defined in `src/renderer/src/global.css`.

**Typefaces** (self-hosted, no system font fallbacks):
- `--font-serif`: Spectral (400, 600, 700) — the primary UI font; used for almost everything
- `--font-mono`: JetBrains Mono (400, 500, 600) — buttons, labels, code, toggles

**Colour palette** (warm, paper-toned):
- Backgrounds: `--color-bg` `#faf9f5`, `--color-surface` `#f3f1ea`, `--color-surface-2` `#eceadf`
- Text: `--color-text` `#1a1815`, `--color-text-muted` `#5b5750`, `--color-text-dim` `#8a857c`
- Accent: `--color-primary` `#c87a1a` (warm amber-orange), `--color-amber` `#e8a840`
- Danger: `--color-danger` `#b91c1c`
- Borders: `rgba(26, 24, 21, 0.14)` / `0.28` for strong

**Mono type scale** — always uppercase, letter-spacing varies inversely with size:
| Size | Letter-spacing | Typical use |
|------|---------------|-------------|
| 10px | 0.16em | Labels, tags, toggles, small meta text |
| 11px | 0.14em | Buttons (global default), modal labels |
| 12px | 0.10–0.12em | Sidebar items, slightly larger labels |

**Components:**
- Always use `CalendarPicker` (`src/renderer/src/views/CalendarPicker.tsx`) for any date input — never use `<input type="date">` (see issue #46 for outstanding cases)
- Always use `Modal` (`src/renderer/src/shell/Modal.tsx`) for any new modal — never reimplement the overlay/card/title/Escape scaffold by hand. Pass `title`, `onDismiss`, and optionally `className` (appended to `modal-card`); put all content including `.modal-actions` as children. Use `modal-description` for the primary intro paragraph beneath the title

**Theming:**
- The app supports light, dark, and system themes. The active theme is stored as `theme` on the `users` row (`'light' | 'dark' | 'system'`) and applied by setting `data-theme` on `<html>` from AppShell.
- Dark tokens are defined in `[data-theme="dark"] { … }` in `global.css`. System follows the OS via `@media (prefers-color-scheme: dark) { [data-theme="system"] { … } }` — no JS logic needed.
- Always use CSS custom properties for colours. Never hardcode hex or rgba colour values in component CSS — every colour must come from a token defined in `global.css`. The only accepted exception is box-shadow `rgba(0,0,0,…)` values, which represent ambient shadow physics and are fine as-is in both themes.

**Hard rules — do not break these:**
- All interactive elements (buttons, inputs, selects, textareas) use `border-radius: 0` — square corners everywhere, no exceptions
- Mono type is almost always `text-transform: uppercase` — exceptions only for body-level mono (e.g. code snippets)
- **Never use `text-transform: uppercase` on serif (`--font-serif`) text** — all-caps serif is never used anywhere in the UI
- Do not introduce colours outside the palette above; do not use system fonts or web-safe fallbacks
- Never use inline styles. Always write a dedicated `.css` file co-located with the component

## Architecture notes

- **IPC:** all database access happens in the main process; renderer communicates via typed IPC handlers in `src/main/ipc/`. Each domain has a `register*Handlers()` function called from `src/main/index.ts` — new handlers always go in a domain file, never inline in `index.ts`
- **Shared types:** `src/shared/types.ts` is the single contract between main and renderer. All IPC payload types must be defined there
- **Renderer sandbox:** the renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` — no Node APIs are available in React code. Everything goes through the preload bridge
- **Schema + migrations:** `src/main/database/schema.ts` holds the full schema SQL; migrations use `user_version` as a counter (see `src/main/database/index.ts`). The shared DB has a parallel migration path in `src/main/database/shared-db.ts` — see issue #47 for known limitations around version compatibility between clients
- **Cipher setup:** cipher pragmas must be set in a specific order before the key pragma — see `openRaw()` in `src/main/database/index.ts` for the canonical sequence
- **Testing:** tests use an in-memory SQLite DB via `createTestDb()` in `src/test/vitest.setup.ts` — no database mocking. Helper functions (`insertProject`, `insertContact`, etc.) are defined there for test fixture setup. When building new features, consider whether a test is warranted — particularly for data logic, migrations, and sync behaviour
- **Chrome extension HTTP server:** runs on `localhost:27371` with one-time token auth; defined in `src/main/http-server.ts`. It is not a general API — do not add endpoints unrelated to the extension
- **Dev seeds:** seeded automatically on first unlock in dev mode; seed data lives in `src/main/database/dev-seeds*.ts`
- **`*.db` and `*.salt` files are gitignored** — never commit them
