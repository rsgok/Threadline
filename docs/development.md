# Development

[Back to README](../README.md)

## Run the current checkout

The UI uses React Router Framework Mode with React, TypeScript and Vite. It builds a static SPA (`ssr: false`); the existing local Node service owns APIs, SQLite, transcript discovery and exports. The Swift WKWebView shell loads the same UI. No production React server is required.

```sh
npm ci
REWIND_WEB_DATA_DIR=/tmp/threadline-dev npm run dev
```

Open <http://127.0.0.1:5173>. Vite proxies APIs and static product assets to the local service on port 43139 (override with `REWIND_WEB_PORT`). Ctrl-C stops both processes. A separate data directory isolates notes; transcript discovery still reads local sessions from all five supported runtimes. For fictional data, use the browser-test fixture below.

For a production build:

```sh
npm run build
npm start
```

Open <http://127.0.0.1:43127>. The loopback service serves `build/client` and returns the SPA shell for `/collect`, `/collect/:runtime/:threadID`, `/library`, `/notes/:noteID`, `/thoughts`, `/thoughts/:topicID`, and `/settings`. Missing API and asset URLs remain 404s. `?native=1` and `?panel=1` survive client navigation. Existing `/?thread=...&runtime=cursor`, workspace and note links redirect to the corresponding route.

The landing page remains at `/landing`. See [landing-page notes](landing-page.md).

## Validate changes

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
swift test
swift build -c release --product Threadline
git diff --check
```

Browser tests start `Tests/ui-server.mjs` on port 43149 with disposable fictional notes, sessions and attachments; they never discover real user transcripts. Chromium and WebKit cover route reloads, native commands, imports, drafts, version conflicts, modal dismissal, narrow layouts, sharing exports, evidence relations and language persistence. Failure screenshots and traces are saved in `test-results/`. CI runs Node 22/24 checks, both browser engines on Node 24, and Swift tests/release compilation on macOS.

UI changes also need rendered review. Read [AGENTS.md](../AGENTS.md), the [modal contract](modal-system.md), and the [button inventory](button-inventory.md) before changing controls. Use a named browser automation session and close it when finished.

## Update the installed service

The Mac app uses an installed copy. Stop and start the service to build and synchronize the checkout:

```sh
bash scripts/stop-web.sh
bash scripts/start-web.sh
```

The installer preserves the `web/` and `build/client/` directory structure under `~/Library/Application Support/RewindWeb/app`. Refresh or reopen afterward. For native changes, run `bash scripts/install-mac.sh`; it archives the previous app bundle and preserves library data.

## Project layout

| Path | Responsibility |
| --- | --- |
| `app/routes/` | Framework route modules and typed client loaders. |
| `app/components/` | React dialogs, session rendering, sharing and integrations. |
| `app/lib/` | Typed APIs, native bridge, navigation, save queue, Markdown and translations. |
| `web/` | Local service, storage, transcript adapters, exports, landing page and shared styles. |
| `web/assets/` | Icons, avatars and curated screenshots. |
| `build/client/` | Generated static frontend; ignored by Git. |
| `Sources/Threadline/` | macOS application shell. |
| `Sources/Rewind/`, `Sources/RewindCore/` | Earlier prototype and compatibility code. |
| `Tests/e2e/` | Browser acceptance tests. |
| `skills/threadline/` | Agent skill and Python CLI. |
| `scripts/` | Development, build and installation helpers. |

Keep screenshots, private conversations, exports and build output out of Git. Public screenshots must use sample content. Keep English and Chinese READMEs aligned when changing product claims or installation instructions.

## Interface assets and styles

The interface never shows the application icon larger than 96 pixels, and a message avatar is 30 pixels wide. `web/assets/threadline-icon.png` and the avatars are therefore kept at the size the interface actually uses. `scripts/make-display-icon.swift` regenerates them from the approved artwork in `web/assets/threadline-app-icon.png`, which the Dock icon also uses.

```sh
swift scripts/make-display-icon.swift
```

`scripts/prune-css.mjs` reports stylesheet rules that no longer match anything in the interface. The React app loads `app/base.css`, `web/threadline.css`, `web/buttons.css` and `app/app.css` together, so a rule is only removed when every class it names is absent from the markup and scripts.

```sh
node scripts/prune-css.mjs          # report
node scripts/prune-css.mjs --write  # remove
```

A rule inside an at-rule such as `@media` is only ever removed on its own, so the conditions a stylesheet applies never change. `web/styles.test.mjs` keeps the shipped stylesheets inside a size budget.

## The interface palette

`app/base.css` owns the colour tokens. Every colour the interface paints comes from there, so the light and dark appearances share one palette and a colour is changed in one place.

| Group | Tokens |
| --- | --- |
| Surfaces | `--surface`, `--surface-raised`, `--surface-card`, `--surface-side`, `--surface-wash`, `--surface-soft`, `--surface-hover`, `--surface-line` |
| Ink | `--ink`, `--ink-strong`, `--ink-warm`, `--ink-cool`, `--ink-sage`, `--ink-sage-deep`, `--ink-sage-bright`, `--ink-blue`, `--ink-blue-soft`, `--ink-amber`, `--ink-danger`, `--ink-secondary`, `--ink-muted`, `--ink-quiet`, `--ink-faint`, `--ink-fainter` |
| Lines | `--line`, `--line-soft`, `--line-strong`, `--line-warm` |
| Accent | `--accent`, `--accent-ink`, `--accent-wash`, `--accent-line` |
| Buttons | `--button-primary`, `--button-hover`, `--button-ink`, `--button-line` |

The dark appearance keeps the same hues and inverts the lightness, so the relationships between surfaces and text survive. The macOS window and the first-use tour follow the system appearance as well.

`--paper`, `--side`, `--muted`, `--soft` and `--green` are older names kept as aliases of the current palette, because page styles still refer to them. A new rule should use the name that says what the colour is for.

Text is never set below 11 pixels. 9 and 10 pixel text is a blur at normal viewing distance, and the notes are meant to be read.
