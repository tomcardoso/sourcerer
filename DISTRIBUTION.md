# Distribution guide

How to build and ship the Sourcerer desktop app and browser extensions.

---

## Desktop app

### Build commands

```bash
# macOS (Apple Silicon .dmg)
npm run dist:mac

# Windows (x64 NSIS installer .exe)
npm run dist:win

# Linux (x64 AppImage)
npm run dist:linux
```

Output lands in `dist-electron/`. Run `npm run build` first if you want to check the compiled output without packaging.

### Prerequisites

- Run each platform build **on that platform** (or a matching CI runner). Cross-compilation is not supported by electron-builder for native modules (`better-sqlite3-multiple-ciphers`, `argon2`).
- If you see native module errors after an `npm install`, run `npm run rebuild` to recompile them against the bundled Electron version.

### Code signing

Both platforms are signed in CI. Local builds are unsigned.

**macOS** — signed and notarized via Apple Developer ID. Requires `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` secrets in the GitHub repo.

**Windows** — signed via Azure Artifact Signing. Requires `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_PUBLISHER_NAME` secrets in the GitHub repo. Signing is configured in `electron-builder.config.js` and only activates when `AZURE_PUBLISHER_NAME` is set.

### Publishing a release

Releases are triggered automatically by CI when a version tag is pushed. Because `main` is protected, the version bump goes through a PR first.

1. Create a version bump branch: `git checkout -b chore/v<version>`
2. Bump the version (runs typecheck + tests automatically before bumping):
   ```bash
   npm version patch   # 0.1.x → 0.1.x+1
   # or
   npm version minor   # 0.1.x → 0.2.0
   ```
3. Push the branch and open a PR:
   ```bash
   git push -u origin chore/v<version>
   gh pr create ...
   ```
4. Once the PR is merged, push the tag to trigger the build:
   ```bash
   git checkout main && git pull
   git push origin v<version>
   ```

The `build.yml` workflow builds on macOS, Windows, and Linux and creates a GitHub Release with all artifacts automatically.

---

## Browser extensions

### Build the packages

```bash
npm run build:extension
```

This produces two zip files in `dist-extension/` (gitignored):

| File | Target |
|------|--------|
| `sourcerer-chrome-<version>.zip` | Chrome Web Store |
| `sourcerer-firefox-<version>.zip` | Firefox Add-ons (AMO) |

The two zips are identical except for the manifest: the Firefox zip uses `manifest.firefox.json` (which adds `browser_specific_settings.gecko`).

**Always run `npm run build:extension` after any changes to the `extension/` folder.**
**Bump `version` in both `manifest.json` and `manifest.firefox.json` before each release.**

---

### Chrome Web Store

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Pay the one-time $5 developer registration fee (first time only).
3. Click **New item** → **Upload** and upload `sourcerer-chrome-<version>.zip`.
4. Fill in the store listing:
   - Description
   - Screenshots (1280×800 or 640×400)
   - Category: **Productivity**
   - Privacy policy URL (the extension only contacts `127.0.0.1`, so the policy can be minimal)
5. In the **Permissions** justification field, explain:
   - `scripting` + `activeTab` — captures full-page screenshots of the active tab
   - `contextMenus` — adds a right-click "Save to Sourcerer" menu
   - `storage` (session) — holds the session token issued by the desktop app
   - `http://127.0.0.1:27371/*` — communicates exclusively with the locally-running desktop app; no external network access
6. Submit for review. Initial reviews typically take a few days.

---

### Firefox Add-ons (AMO)

1. Go to [addons.mozilla.org/developers](https://addons.mozilla.org/en-US/developers/) and sign in with a Mozilla account.
2. Click **Submit a New Add-on**.
   - Choose **On this site** for a public AMO listing, or **On your own** for self-hosted distribution.
3. Upload `sourcerer-firefox-<version>.zip`.
4. If prompted for source code (AMO requires it for add-ons with bundled/minified code), upload a zip of the repository root. The extension is plain JS so this is usually not required.
5. Fill in the listing details. AMO auto-signs the add-on once approved; the signed `.xpi` is then installable by users directly.

The `browser_specific_settings.gecko.id` in `manifest.firefox.json` (`sourcerer@sourcerer.app`) is required by AMO and must match the ID registered on your AMO developer account.

#### Temporary installation for testing

```
about:debugging#/runtime/this-firefox → Load Temporary Add-on → select extension/manifest.firefox.json
```

Temporary add-ons are removed when Firefox closes. For persistent local installs, use Firefox Developer Edition (signature enforcement can be disabled via `about:config` → `xpinstall.signatures.required = false`) and install the built zip via `about:addons`.

---

## Checklist before any release

- [ ] `version` bumped in `package.json`, `manifest.json`, and `manifest.firefox.json`
- [ ] `npm run typecheck` passes
- [ ] `npm test` exits 0 (all tests pass)
- [ ] `npm run build:extension` run after any extension changes
- [ ] Desktop installers built and smoke-tested on each target platform
- [ ] GitHub release created and assets attached
