AltSeende Browser 0.3 introduces a luminous graphite/cyan design, smooth configurable animations, six-engine advanced search in a 3 × 2 split, and per-tab volume/mute with persistence.

New toolbar tools: audio mixer, bookmarks, find on page, zoom, fullscreen, PDF export, printing and copy link. Tools can be reordered or hidden.

Linux x64:
- RPM: install or update with `sudo dnf install ./AltSeende-0.3.0-x86_64.rpm`, then launch from the application menu.
- AppImage: mark executable and run; if FUSE 2 is unavailable, use `--appimage-extract-and-run`.
- tar.gz: extract everything and run `altseende-browser`.
- Uninstall RPM: `sudo dnf remove altseende-browser`. Profile data and downloaded files remain.

Volume sliders scale HTML audio/video, including frames and new players; native mute silences all tab sound. Web Audio synthesis is not amplitude-scaled. Private tabs are never restored. Existing limitations remain: partial unpacked Chrome extension support, direct-media video downloads, manual blocker updates and no automatic app updater.
