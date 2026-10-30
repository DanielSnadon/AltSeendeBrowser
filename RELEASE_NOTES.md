# AltSeende Browser 0.5.0

A quieter home page: just the eye, search and three small shortcuts. Saved spaces stay collapsed until needed.

- Horizontal trackpad/touch swipes navigate back and forward. Editable fields and horizontal scrollers are excluded; gestures can be disabled in Preferences.
- Saved accounts are suggested when a sign-in field is focused. Choose an account in the compact bar beneath the address; unlock the vault first if necessary. Exact-origin checks, navigation invalidation and explicit user selection protect filling. Private tabs and iframe forms do not show automatic suggestions. New password saving remains manual.
- Ten new tools: command palette (Ctrl+K), keyboard tab navigation, close other tabs, close tabs to the right, duplicate cleanup, mute others/restore, reload all, offline MHTML saving, site controls with scoped data clearing, and bookmark all regular tabs.
- Simple Russian README with four real app screenshots; development and privacy details moved to separate documents. The app interface remains English.

Verified with unit tests, real Chromium input/integration tests and full process restart. Linux x64 only.

Fedora install/update: `sudo dnf install ./AltSeende-0.5.0-x86_64.rpm`.
