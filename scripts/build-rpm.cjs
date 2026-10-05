// Build with the host rpmbuild, avoiding an embedded Ruby/FPM runtime.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const pkg = require("../package.json");
const output = path.join(root, "dist/installers");
const top = path.join(output, "rpm-build");
for (const d of ["BUILD", "BUILDROOT", "RPMS", "SOURCES", "SPECS", "SRPMS"])
  fs.mkdirSync(path.join(top, d), { recursive: true });
const desktop = `[Desktop Entry]\nName=AltSeende Browser\nComment=Research browser with split views\nExec=/opt/altseende-browser/altseende-browser %U\nIcon=altseende-browser\nType=Application\nTerminal=false\nCategories=Network;WebBrowser;\nStartupWMClass=altseende-browser\n`;
fs.writeFileSync(path.join(top, "SOURCES/altseende-browser.desktop"), desktop);
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const spec = `Name: altseende-browser
Version: ${pkg.version}
Release: 1
Summary: Minimal Chromium research browser
License: LicenseRef-Proprietary
URL: ${pkg.homepage}
BuildArch: x86_64
AutoReqProv: no
Requires: gtk3, nss, libXScrnSaver, libXtst, xdg-utils, at-spi2-core, libuuid, libdrm, mesa-libgbm
%global debug_package %{nil}
%global __os_install_post %{nil}
%global _build_id_links none
%description
AltSeende Browser with split views, tab groups and ad blocking.
%install
mkdir -p "%{buildroot}/opt/altseende-browser" "%{buildroot}/usr/share/applications" "%{buildroot}/usr/share/icons/hicolor/512x512/apps"
cp -a ${quote(path.join(output, "linux-unpacked"))}/. "%{buildroot}/opt/altseende-browser/"
install -m 644 ${quote(path.join(top, "SOURCES/altseende-browser.desktop"))} "%{buildroot}/usr/share/applications/altseende-browser.desktop"
install -m 644 ${quote(path.join(root, "assets/icon.png"))} "%{buildroot}/usr/share/icons/hicolor/512x512/apps/altseende-browser.png"
%files
%defattr(-,root,root)
/opt/altseende-browser
/usr/share/applications/altseende-browser.desktop
/usr/share/icons/hicolor/512x512/apps/altseende-browser.png
%post
if command -v update-desktop-database >/dev/null; then update-desktop-database -q || :; fi
if command -v gtk-update-icon-cache >/dev/null; then gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || :; fi
%postun
if command -v update-desktop-database >/dev/null; then update-desktop-database -q || :; fi
`;
const specPath = path.join(top, "SPECS/altseende.spec");
fs.writeFileSync(specPath, spec);
execFileSync(
  "rpmbuild",
  [
    "-bb",
    "--define",
    "_binary_payload w3.zstdio",
    "--define",
    `_topdir ${top}`,
    specPath,
  ],
  {
    stdio: "inherit",
  },
);
const rpm = path.join(
  top,
  `RPMS/x86_64/altseende-browser-${pkg.version}-1.x86_64.rpm`,
);
fs.copyFileSync(rpm, path.join(output, `AltSeende-${pkg.version}-x86_64.rpm`));
console.log(
  "RPM ready:",
  path.join(output, `AltSeende-${pkg.version}-x86_64.rpm`),
);
