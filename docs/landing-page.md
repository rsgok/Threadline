# English landing page

The marketing page is available at `/landing` (also `/landing/` and `/landing.html`). The existing application remains at `/`.

Run `npm start` and open <http://127.0.0.1:43127/landing>. For an isolated preview, set `REWIND_WEB_PORT` and `REWIND_WEB_DATA_DIR` before starting the server.

The page uses `web/landing.html`, `web/landing.css`, and `web/landing.js`, plus the existing shared `web/buttons.css` and product favicon. It makes no library API requests and uses illustrative sample content, not personal conversations.

All visitor-facing copy is English. Installation links lead to an expandable source setup guide because a standalone distribution is not currently available. The page includes three selectable example notes, native expandable FAQ items, clipboard feedback, responsive layouts, keyboard focus styles, and reduced-motion support.

For standalone static hosting, serve `landing.html` as the document and keep `/landing.css`, `/landing.js`, `/buttons.css`, and `/assets/threadline-icon.png` available at their absolute paths. No deployment or public download is configured by this change.
