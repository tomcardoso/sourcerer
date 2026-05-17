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

**Inspecting the database** (TablePlus, DB Browser, sqlite3, etc.):

```bash
npm run rebuild:node  # only needed once, or after switching targets
npm run db:export     # prompts for app password, writes sourcerer-plain.db
# open sourcerer-plain.db in TablePlus as a plain SQLite connection (no password)
# delete the file when done — it contains all data in plaintext
```

## Git / PR rules

- `main` is protected — all changes must go through a pull request
- Branch naming: `feature/`, `fix/`, `dev/` prefixes
- Always push to a feature branch and open a PR via `gh pr create`
- CI runs a `test` status check — PRs won't merge until it passes

## Cutting a release

Releases are triggered by pushing a version tag (`v*`). Because `main` is protected, the version bump goes through a PR first, then the tag is pushed separately after merge.

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
4. Optionally add a `## What's new` section to the PR body — the release workflow will use it as the GitHub Release description instead of the auto-generated PR list
5. Once the PR is merged, push the tag to trigger the build:
   ```bash
   git checkout main && git pull
   git push origin v{VERSION}
   ```
6. The `build.yml` workflow builds on macOS, Windows, and Linux, then creates a GitHub Release with all artifacts automatically

> The old `npm run release:patch` / `npm run release:minor` scripts do steps 2+5 in one shot but bypass the PR requirement — don't use them now that `main` is protected.

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

**Hard rules — do not break these:**
- All interactive elements (buttons, inputs, selects, textareas) use `border-radius: 0` — square corners everywhere, no exceptions
- Mono type is almost always `text-transform: uppercase` — exceptions only for body-level mono (e.g. code snippets)
- Do not introduce colours outside the palette above; do not use system fonts or web-safe fallbacks

## Architecture notes

- **IPC:** all database access happens in the main process; renderer communicates via typed IPC handlers in `src/main/ipc/`
- **Schema + migrations:** `src/main/database/schema.ts` holds the full schema SQL; migrations use `user_version` as a counter (see `src/main/database/index.ts`)
- **Cipher setup:** cipher pragmas must be set in a specific order before the key pragma — see `openRaw()` in `src/main/database/index.ts` for the canonical sequence
- **Dev seeds:** seeded automatically on first unlock in dev mode; seed data lives in `src/main/database/dev-seeds*.ts`
- **`*.db` and `*.salt` files are gitignored** — never commit them
