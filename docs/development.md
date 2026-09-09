# Development

[Back to README](../README.md)

## Run the current checkout

Install the requirements listed in the [quick start](../README.md#requirements), then:

```sh
npm ci
npm start
```

Open <http://127.0.0.1:43127>. The server binds to loopback. Use `?native=1` for the desktop layout or `?panel=1` for the runtime sidebar. A `thread` query parameter identifies a source conversation; use `runtime=cursor` for a Cursor conversation.

If the installed app service already occupies the default port, use a separate port and data directory:

```sh
REWIND_WEB_PORT=43139 REWIND_WEB_DATA_DIR=/tmp/threadline-dev npm start
```

A separate data directory isolates notes, but conversation discovery still reads the local runtime transcripts by default. Use fictional fixtures when preparing public screenshots.

The landing page is served at `/landing` when running the current checkout. See [landing-page notes](landing-page.md) for its assets and preview setup.

## Validate changes

```sh
npm test
swift test
swift build -c release --product Threadline
git diff --check
```

Use the checks relevant to your change. UI changes also need a rendered review at desktop and narrow widths. Read [AGENTS.md](../AGENTS.md), the [modal contract](modal-system.md), and the [button inventory](button-inventory.md) before changing controls or dialogs.

## Update the installed service

The Mac app runs an installed copy of the web files. Editing the checkout does not update that copy. Stop and start the service to synchronize it:

```sh
bash scripts/stop-web.sh
bash scripts/start-web.sh
```

Refresh the page or reopen the Mac app afterward. For native changes, rebuild with `bash scripts/install-mac.sh`; it archives the previous app bundle and preserves library data.

## Project layout

| Path | Responsibility |
| --- | --- |
| `web/` | Local HTTP service, SQLite storage, runtime transcript adapters, and UI. |
| `web/assets/` | Product icon, runtime avatars, and curated product screenshots. |
| `Sources/Threadline/` | Current macOS application shell. |
| `Sources/Rewind/`, `Sources/RewindCore/` | Earlier prototype and compatibility code. |
| `skills/threadline/` | Agent skill and Python CLI. |
| `scripts/` | Build and local installation helpers. |
| `docs/` | User and contributor documentation. |

Keep temporary screenshots, private conversations, exports, and build output out of version control. Public product screenshots must use sample content. Keep `README.md` in English and maintain `README.zh-CN.md` as its Chinese counterpart.
