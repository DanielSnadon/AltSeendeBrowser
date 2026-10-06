# AltSeende Browser 0.4.0

Monochrome interface, compact side panels and a searchable Control center with built-in help. Quick split controls are available directly from the toolbar.

- Integrated browser tunnel: VLESS/REALITY, VMess, Trojan, Shadowsocks, SOCKS5 and HTTP(S), with NekoBox-compatible profile link import and a bundled sing-box core.
- Encrypted local password/profile vault, manual exact-origin fill, password generator and auto-lock.
- Isolated captive-network sign-in, local page QR codes, per-site dark mode, improved bookmarks.
- History, reopen/duplicate/pin/find tabs, read-later list, page notes, tracking-parameter removal, bookmark import/export.
- Six-engine 3 × 2 search, per-tab media volume, sessions, groups and existing tools remain available.

The tunnel requires your own working server profile. It routes browser traffic rather than the whole device, has no automatic direct fallback, and resumes in a blocked state after restart until reconnected or explicitly disconnected. Access from any particular network is not guaranteed. The password manager has no recovery or cloud synchronization. Linux x64 only; real external VPN servers/captive networks still need provider-specific testing.

Install/update on Fedora: `sudo dnf install ./AltSeende-0.4.0-x86_64.rpm`
Uninstall the RPM: `sudo dnf remove altseende-browser` (profile remains).
