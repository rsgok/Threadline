# Mac and feature updates

Threadline updates the native shell and its feature package independently. Node is supplied by the existing installation and is not included in either update. Settings → About shows the Mac version/build and feature version, checks for updates, displays release notes and starts installation. The automatic-check preference is persisted in macOS defaults; checking is opt-in, at most once a day for features, and installation requires a user action.

The menu groups everyday actions before app integrations. Data-folder access lives in About. The application menu's About action opens the same page.

## Distribution configuration

Normal builds load the public channel configuration from `updater/release-config.json`. Both feeds are hosted in the latest GitHub release of rsgok/Threadline. Set `THREADLINE_DISABLE_UPDATES=1` for an explicitly offline development build; only that build reports online updates as unconfigured.

`bash scripts/build-mac.sh` assembles and verifies `dist/Threadline.app` without changing the installed app or local service. `scripts/install-mac.sh` installs both the feature package and the shell for local development.

A release build accepts:

| Variable | Purpose |
| --- | --- |
| `THREADLINE_BUILD_NUMBER` | Monotonically increasing native build number; current default is 8 |
| `THREADLINE_RUNTIME_FEED_URL` | HTTPS URL for the signed `runtime.json` manifest |
| `THREADLINE_RUNTIME_PUBLIC_KEY_FILE` | Ed25519 public key in PEM/SPKI format, embedded in the shell |
| `THREADLINE_SPARKLE_FEED_URL` | HTTPS Sparkle appcast URL |
| `THREADLINE_SPARKLE_PUBLIC_KEY` | Sparkle's base64 Ed25519 public key |
| `THREADLINE_SIGN_IDENTITY` | Developer ID Application identity; omitted for local ad-hoc builds |

Feed/key variables override the committed public defaults. Feature and Sparkle keys use different formats and are independently managed. The feature private key is stored locally in `~/.config/threadline-release/runtime-ed25519.pem` with owner-only access; Sparkle uses the login Keychain account `threadline-release`. Back up both keys securely. Neither private key is included in the repository or downloads. Do not rotate public keys without a migration plan for installed clients.

## Feature releases

Increment `package.json`'s version using a numeric `major.minor.patch`. Keep the lockfile consistent. Build the frontend, then run:

```sh
npm ci
npm run build
THREADLINE_RELEASE_NOTES='Changes in this release' node scripts/release-runtime.mjs \
  dist/feature-updates https://github.com/rsgok/Threadline/releases/download/0.0.3/ \
  "$HOME/.config/threadline-release/runtime-ed25519.pem" 8
```

Replace the version in the download URL for each release. Upload both the feature archive and `runtime.json` as assets of that release. The committed feed URL follows the latest release automatically; every future latest release must contain both update feeds.

The command packages the compiled frontend, server, plugins and locked production dependencies, excluding Node, the Mac app, development dependencies and browser downloads. It emits a gzip-compressed file archive and a signed manifest. Publish the versioned archive first, then atomically publish `runtime.json`. Both must be downloadable via HTTPS; up to five HTTPS-only redirects are supported, including GitHub Releases CDN redirects. Versioned archives should be immutable; serve the manifest with cache revalidation.

The signed payload binds version, URL, byte size, SHA-256, release notes, minimum Node version, minimum Mac build and the compatible library schema (`dataSchema: 1`). Download or signature failures, incompatible versions, and archive path escapes never switch the active package. Feature releases in this format must preserve schema 1 and backward data compatibility; destructive database migrations require a separately designed migration/backup procedure and a new native updater format.

Node upgrades remain separate: a release needing a newer runtime is blocked with an explanation. This updater does not download or modify the user's system Node installation.

## Switching and recovery

The trusted installer lives in the Mac app's Resources, outside the feature package it replaces. Only the native bridge on the app's own loopback origin can request fixed update actions; there is no network-accessible install API and web messages cannot provide a download URL, command, key or filesystem path.

`~/Library/Application Support/RewindWeb/app` becomes an atomic symlink into `releases/`. The updater:

1. Acquires an installation lock and rechecks the signed release.
2. Verifies the full download before extracting into a new directory.
3. Writes a recovery journal, preserving the previous release (including migration from the old real `app` directory).
4. Atomically switches the symlink and restarts `local.rewind.web` with launchctl.
5. Requires `/health` to identify Threadline and the expected new version.
6. On failure, switches back, restarts and checks the old version. The journal remains if recovery cannot finish.

An interrupted install is recovered by the next native status/check operation. A stale lock is released only if its owner process is gone. Successful upgrades retain the current and immediately previous release; user databases, attachments, settings, browser caches and logs remain outside release directories. An update does not roll back user data.

## Native shell releases

Sparkle 2.9.6 is pinned via Swift Package Manager. The build copies its framework and signs its nested executables inside out. The native shell includes the small feature installer, not the feature package or Node. Manual “Check for updates” checks features and invokes Sparkle for the shell; shell download, verification, installation and relaunch use Sparkle's standard UI.

Sparkle signing uses the existing `threadline-release` Keychain account (`generate_keys --account threadline-release`). Build with the release configuration above, sign with Developer ID, notarize and staple the app, then create the update archive:

```sh
ditto -c -k --sequesterRsrc --keepParent dist/Threadline.app dist/Threadline.zip
```

Use the bundled `generate_appcast --account threadline-release --download-url-prefix https://github.com/rsgok/Threadline/releases/download/VERSION/` tool to generate/sign the appcast for the archive directory. Upload `appcast.xml` alongside the shell archive and feature assets. Publish its outputs at the configured HTTPS URL. See [Sparkle setup and distribution](https://sparkle-project.org/documentation/) for the signing, notarization and appcast procedure. Validate a real old → new release before enabling the production channel; local ad-hoc verification is not a notarization or production-update test.

## Validation

- `npm test`: manifest tampering, checksums, compatibility, archive paths, locks, successful switches, recovery, and real child-process restart/rollback
- `npm run typecheck` and `npm run build`
- `npx playwright test Tests/e2e/updates.spec.ts`: native-bridge states, release notes, preference changes, installation state, actual icon loading, and browser-only/unconfigured builds
- `swift test` and `bash scripts/build-mac.sh`: native compilation and bundle signature verification

Tests use temporary releases, generated disposable signing keys, and fictional library data. They do not publish releases or replace the user's library.
