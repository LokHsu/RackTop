# Linux Packaging and Updates

## Scope

These fixes apply to Linux DEB and AppImage packages. The application version,
Windows/macOS configuration, assets, installer handoff, update-check timeout
(30 seconds) and error propagation are unchanged. Sidebar layout overrides are
limited to `data-platform="linux"`. The native updater module, IPC command and
GIO dependency are compiled only on Linux.

## Icons and Names

Linux PNG icons reuse the existing transparent Windows ICO without background
removal or new artwork. To reproduce them, run
`python3 scripts/export-linux-icons.py` with Pillow installed. Generated icons
are included, so normal builds require neither Python nor Pillow.

Both Linux packages include AppStream metadata with the display name RackTop.
The Debian package identifier remains `rack-top` to preserve upgrade
compatibility and follow Debian's lowercase naming policy. Installers displaying
the package identifier directly may still show `rack-top`; AppStream metadata
cannot force every local DEB installer to use the display name.

For a menu/Dock launcher and per-file GNOME icon, run:

```bash
bash scripts/install-appimage.sh /absolute/path/to/RackTop.AppImage
```

The script installs a writable copy at `~/.local/lib/racktop/RackTop.AppImage`
and registers `racktop.desktop` with name RackTop and StartupWMClass Racktop.
It applies a per-file icon through GVfs, without changing icons for other
AppImages. File icon metadata is local to the desktop; after moving to another
computer, run the installer there. Previously pinned launchers may need to be
unpinned and pinned again.

## Network and Package Routing

The Linux updater reads manual GNOME HTTPS proxy settings through GSettings.
Explicit `HTTPS_PROXY`/`ALL_PROXY` process settings retain precedence.
The GNOME `ignore-hosts` list is combined with
`NO_PROXY` (or lowercase `no_proxy`). Matching requests bypass the proxy during
both update checks and package downloads, including redirects. Domain entries
support GNOME wildcard/port rules and NO_PROXY domain/IP/CIDR rules: `github.com` also covers `api.github.com`;
`githubusercontent.com` covers Raw and release asset hosts. Bypassing
`github.com` alone does not bypass the separate `githubusercontent.com` domain. GNOME PAC,
SOCKS-only configuration and other desktops' proxy preferences are not imported;
use an HTTP(S) proxy environment variable for those setups.

Linux checks the GitHub Contents API with
`Accept: application/vnd.github.raw+json`, then falls back to the original Raw
URL. Both read the same updater-branch file; GitHub's HTML blob page is not a
manifest endpoint. The API media type is removed before downloading packages.
The official updater retains the selected proxy and verifies TLS and production
signatures. Connection timeout is 10 seconds, each check endpoint timeout is
30 seconds and Linux downloads allow 15 minutes.

DEB explicitly selects `linux-<arch>-deb`. AppImage uses the official format
selection: `linux-<arch>-appimage`, then legacy `linux-<arch>`. Never point the
DEB entry to an AppImage or reuse its signature. Linux CI signs DEBs separately
and uploads their `.sig` files.

The release publisher must provide a matching version, package URL and signature
for each format. A missing DEB entry produces an explicit error rather than
falling back to AppImage. This change does not edit `latest.json`, publish
artifacts or introduce a test-version downgrade.

## Verification

```bash
npm run test -- src/services/appUpdater.test.ts src/utils/appUpdate.test.ts
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib linux_app_update::
appstreamcli validate --no-net src-tauri/linux/com.racktop.desktop.metainfo.xml
```

With a local dev/preview server, Playwright and Chromium available:

```bash
RACKTOP_PREVIEW_URL=http://127.0.0.1:1421/ node scripts/check-linux-brand-layout.mjs
```

The layout check stresses crowded sidebar headers at three viewport widths.
Linux retains a 32x32 logo; Windows/macOS retain their original flex behavior.

Build with `npm run bundle:linux`. Extract both packages and inspect their
desktop entries, icon alpha and AppStream metadata. Run the existing Linux smoke
test with isolated DBus/data directories. Test DEB and AppImage separately: they
share the application identifier and data directory. Do not install the two
formats simultaneously for update testing.

A previous local test build verified live manifest access, an 86,964,728-byte
AppImage download and its production signature. That is not a complete upgrade
test for this branch. Full acceptance still requires a correctly published
higher-version feed, successful download/signature verification, DEB system
authorization or AppImage replacement, restart and retained data. Windows/macOS
native runtime checks require those operating systems; Linux cannot certify
their native execution.
