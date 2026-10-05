AltSeende Browser 0.2 adds split views, tab groups, session restore, an icon toolbar, configurable home spaces, network/cosmetic ad blocking, screenshots, image downloads and a manual download speed test.

Linux x64 downloads:
- `.rpm`: install with Fedora's software installer, then open AltSeende from the application menu.
- `.AppImage`: mark executable in file properties and run. Requires FUSE 2; if unavailable, run with `--appimage-extract-and-run`.
- `.tar.gz`: extract the entire folder and run `altseende-browser`.

No separate Node.js installation is needed. Keep the Chromium sandbox enabled.

Private tabs are excluded from restore. The blocker uses bundled EasyList, EasyPrivacy and RU AdList with manual updates in Settings; no blocker guarantees every ad is removed. Chrome extension support remains partial and video downloads currently require direct media URLs. The browser is an early version without automatic updates or a security audit.
