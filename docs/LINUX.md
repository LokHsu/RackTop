# Linux desktop support

RackTop's Linux desktop uses the same SSH, terminal, SQLite, project and job
implementations as the macOS and Windows clients. The initial packaging target
is Ubuntu x86_64. CI builds on Ubuntu 22.04 to preserve its glibc baseline;
packages built locally on Ubuntu 24.04 should be used on 24.04 or newer.

## Build on Ubuntu 22.04 / 24.04

Install Node.js 22, stable Rust (edition 2024 support), and the system libraries:

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf libssl-dev \
  libdbus-1-dev openssh-client xterm gnome-keyring
npm ci
npm run test
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

Linux automatically loads `src-tauri/tauri.linux.conf.json`. The window uses
custom window controls shared with Windows, and a repeated launch activates the
existing instance. Drag the sidebar/topbar background to move the window;
double-click the topbar to maximize or restore it.
Floating Linux windows use a 12px radius, matching Ubuntu Yaru unified window
decorations. Transparent corners are enabled only in the Linux configuration;
maximized/fullscreen windows use square corners. Windows mouse-down controls
and macOS native decorations retain their existing behavior.
The Linux entry point defaults `WEBKIT_DISABLE_DMABUF_RENDERER=1` before
starting Tauri to avoid blank windows on incompatible graphics drivers. An
explicit environment value takes precedence (set it to `0` to test DMA-BUF).
Saved passwords use the desktop Secret Service through the session D-Bus
(GNOME Keyring on Ubuntu). An unlocked keyring is required to save passwords;
the application reports keyring errors, and SSH Agent/key authentication remains
available. No plaintext credential storage is introduced.

## Packages for review

```bash
npm run bundle:linux -- --config '{"bundle":{"createUpdaterArtifacts":false}}'
sha256sum src-tauri/target/release/bundle/deb/*.deb \
  src-tauri/target/release/bundle/appimage/*.AppImage
```

The override produces unsigned review packages without requiring the production
updater signing key. For a release, omit the override and configure the existing
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets.
Review builds are not published to the stable updater feed.

Install the DEB with `sudo apt install ./RackTop_1.25.6_amd64.deb` (use the actual
filename from the bundle directory). DEB dependencies include the SSH client,
a terminal emulator and GNOME Keyring. For AppImage, install `openssh-client`,
`xterm`, `gnome-keyring` and `libfuse2` (22.04) or `libfuse2t64` (24.04), then
make the AppImage executable and launch it. `--appimage-extract-and-run` can
be used where FUSE is unavailable. SSH setup opens `x-terminal-emulator`.

Ubuntu's AppIndicator extension is needed to display the tray icon. Notifications
use the desktop notification service. Test both features in a graphical login;
Xvfb does not provide those services. Database and local assets are stored under
`${XDG_DATA_HOME:-~/.local/share}/com.racktop.desktop/`.

## Validation

Run the native startup/duplicate-instance smoke test in an isolated data directory:

```bash
bash scripts/smoke-linux.sh src-tauri/target/release/racktop
```

On a desktop with an unlocked Secret Service, verify actual password persistence:

```bash
cargo test --locked --manifest-path src-tauri/Cargo.toml \
  --test linux_keyring -- --ignored
```

For maintainer review, also verify adding an SSH server, host-key confirmation,
live collection, terminal input/paste/resize, saving credentials followed by an
application restart, project synchronization, tray actions and notifications.
Never use the default integration-probe addresses without explicit authorization.

Linux stable auto-update requires a signed AppImage and a `linux-x86_64` entry
in the separate updater branch's `latest.json`. The current stable feed has only
macOS and Windows packages; Linux upgrade installation must be tested by the
maintainer before publishing that entry. DEB installations should be upgraded
through a new DEB package. ARM64 and distributions other than Ubuntu have not
been validated.
