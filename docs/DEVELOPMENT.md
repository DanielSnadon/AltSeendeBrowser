# Development

AltSeende 0.5.0 uses Electron 44, sandboxed WebContentsViews and an isolated local shell. Linux x64 is the supported build target. Use Node.js 22.12+ (24 recommended) and a graphical Linux desktop.

```bash
npm ci
npm run filters
npm run tunnel
npm start
```

## Checks

```bash
npm test
npm run smoke
npm run test:restart
```

Tests use temporary profiles and local pages. The smoke run exercises real Chromium input, horizontal gesture navigation, carousel/disabled guards, automatic credential suggestions, locked-vault handling, stale requests and private-tab exclusion. It also verifies batch tools, MHTML output, origin-scoped storage clearing, ad blocking, split views, native media mute, independent volume, bookmarks, PDF output and a real HTTP proxy reached through the bundled sing-box core. Restart checks cover vault lock, protected routing, tab/pin/volume restore and gesture/suggestion settings.

Tests do not certify all websites, touchpad drivers, external VPN servers or captive networks. Unit tests cover encryption, tamper/wrong-key rejection, safe origins, metadata redaction, URL policy, queries, pane geometry and filter behavior.

## Build installers

```bash
npm run dist
```

Artifacts appear in `dist/installers/`: RPM, AppImage and a portable tar archive. Fedora packaging uses the host `rpmbuild`. The tunnel download is pinned and hash-verified; its license and upstream source archive ship with the executable. Windows packaging remains experimental and has not been validated; the bundled tunnel target is Linux x64.

GitHub Actions creates installers and a versioned release after code changes reach `main`. Existing versioned release assets are not overwritten. Installers are uploaded directly to Releases, without duplicating large files in Actions artifact storage. Documentation-only changes do not start a new build.

## Documentation screenshots

```bash
npx electron . --capture-docs
```

This starts a temporary profile and local demo server, then saves four real application screenshots to `docs/`. The capture combines the shell and native child-view surfaces in their actual bounds because Electron captures them separately. No real user credentials or browsing data are used. Normal smoke tests write their images to their temporary profile instead of replacing README images.

## Code map

- `src/main.cjs`: windows, sessions, routing, validated shell IPC and persistence.
- `src/page-tools.cjs`: trusted page IPC, account suggestions and navigation gestures.
- `src/content-preload.cjs`: isolated DOM helpers; no API exposed to websites.
- `src/vault.cjs`: encrypted password/profile storage.
- `src/workflow-tools.cjs`: batch tab tools, offline saving and site controls.
- `src/features.cjs`, `src/network.cjs`: tools and browser tunnel.
- `src/renderer.js`, `src/panels.js`, `src/style.css`: interface and built-in help.
- `src/docs-capture.cjs`: reproducible demo screenshots.
