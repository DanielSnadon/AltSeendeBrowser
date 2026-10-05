# Third-party components

Electron/Chromium and bundled Node packages retain their licenses in the distributed application. Ghostery's @ghostery/adblocker engine is MPL-2.0; see node_modules/@ghostery/adblocker/LICENSE.

Ad-blocking lists are downloaded by `npm run filters` and bundled in installers for offline startup. Their original license headers and full source text are shipped in `assets/filters/` beside the compiled engine:

- EasyList: https://easylist.to/easylist/easylist.txt — upstream license in file header.
- EasyPrivacy: https://easylist.to/easylist/easyprivacy.txt — upstream license in file header.
- RU AdList: https://easylist-downloads.adblockplus.org/advblock.txt — upstream license in file header.

The Settings refresh control fetches these three URLs explicitly. Runtime filtering uses network and CSS rules; scriptlets and extended procedural selectors are not implemented. No acceptable-ads allowlist is enabled.

The optional speed test contacts https://speed.cloudflare.com/ and downloads up to 8 MB. It runs only when the user starts a test.
