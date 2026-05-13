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

The current config has `"identity": null` and `"hardenedRuntime": false` on macOS, meaning the build is **unsigned**. Users will need to allow it via System Settings → Privacy & Security → Open Anyway.

To sign for distribution:
1. Enrol in the Apple Developer Program ($99/year).
2. In developer.apple.com → Certificates, create a **Developer ID Application** certificate (the one explicitly for distribution outside the Mac App Store). Download and double-click it to add it to your keychain.
3. In `package.json` → `build.mac`, remove the `"identity": null` line and set `"hardenedRuntime": true`. Add a `"notarize"` hook (electron-builder supports `@electron/notarize`).
4. Re-run `npm run dist:mac`. The build will sign and notarize automatically if your certificate is in the keychain.

On Windows, signing requires a code-signing certificate (EV or OV) from a CA such as DigiCert or Sectigo. Set the `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables before running `npm run dist:win`.

### Publishing a release

1. Bump `version` in `package.json`.
2. Build the installers for each platform.
3. Create a GitHub release tagged `v<version>` and attach the `.dmg`, `.exe`, and `.AppImage` files.

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
- [ ] `npm test` passes (100/100)
- [ ] `npm run build:extension` run after any extension changes
- [ ] Desktop installers built and smoke-tested on each target platform
- [ ] GitHub release created and assets attached
