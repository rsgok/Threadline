# Local conversation index

The collection page reads `/api/sessions/index`. This serves a persisted compact snapshot without reading transcripts. The snapshot includes titles, project grouping, update times, status, and at most 500 characters from the last visible message. Original conversation files stay with their runtime.

`session-index.json` lives beside `library.sqlite` and `session-organization.json` in the data directory. It is atomically replaced with private permissions; invalid or incompatible indexes rebuild safely. The schema records runtime source directories so an index is not reused for another source configuration.

The production service starts synchronization on listen and checks every five seconds. Discovery scans file metadata. Only new or changed file signatures are parsed, with two concurrent readers per runtime. Codex also tracks title and workspace label changes. Failed scans retain the last known data; failed files retry when their signature changes. Successful scans reconcile deleted files. Readers retain their existing recent-session limits.

The first build shows a fixed placeholder. Existing snapshots render immediately, including after restart. The browser polls a lightweight revision endpoint while visible and checks when focus returns. A new revision produces an update button; only the user's click applies it, keeping filters and scroll position. An empty first build transitions to the empty state automatically.

The server factory keeps background indexing opt-in for isolated tests. Production enables it; fixture servers explicitly prepare fictional data. Tests cover restart reuse, incremental changes, deletion, unreadable sources, coalescing, unchanged metadata timestamps, and update-notice behavior.
