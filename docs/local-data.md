# Local data and backups

[Back to README](../README.md)

## Storage

Threadline stores its library under `~/Library/Application Support/RewindWeb`. This compatibility name is retained from earlier versions.

| Path | Contents |
| --- | --- |
| `library.sqlite` | Notes and threads, stored through Node.js SQLite. |
| `attachments/` | Uploaded images and copies of collected local images and files. |
| `session-assets/` | Cached images embedded in runtime transcripts. |
| `app/` | Installed web service and dependencies. |

The database uses write-ahead logging (WAL). Search runs in SQLite and supports Chinese text, Unicode normalization, and multiword substring matching. The current library endpoint returns matching note bodies without pagination.

## Back up the library

1. Stop the local service with `bash scripts/stop-web.sh` from the project checkout.
2. Copy the **entire** `~/Library/Application Support/RewindWeb` directory to your backup destination.
3. Restart with `bash scripts/start-web.sh`.

Do not copy only the `.sqlite` file while the service is running: recent changes may still be in its WAL files. Markdown ZIP exports are useful for portability, but are not a full application backup.

## Migration from older versions

On first startup, Threadline migrates `library.json` and `threads.json` into SQLite in a transaction. The original files remain unchanged as migration-time backups. After a successful migration, Threadline stops reading and writing those JSON files. A failed migration rolls back and stops startup.

Old JSON files do not contain changes made after migration.

## Attachments and exports

When collecting a conversation, Threadline copies recognized, eligible local images and files into its library. The original paths remain in the note and attachment provenance; previews and Finder actions prefer the saved copies. ZIP exports include the copies and rewrite Markdown references to relative paths inside the archive.

Collection supports up to **50 attachments**, **25 MB per file**, and **100 MB in total**. Missing, empty, symbolic-link, or oversized files retain references and produce a note-level explanation. Remote images stay as links and are not downloaded automatically.

Codex collection supports image-only messages and explicit image/file resource blocks in tool results, including embedded Base64 images. It does not scan arbitrary paths in tool logs. Cursor supports message image blocks and local file links. Existing notes are not retroactively rewritten; collect the conversation again to save newly supported attachment copies.

Sharing destinations have separate limits; see the [sharing guide (Chinese)](sharing.md).

## Deletion, drafts, and review status

Deleting a note permanently removes its record and saved attachment copies. There is no recycle bin; referenced original files are unaffected. Composition drafts are stored in the current browser tab’s session storage.

Notes may be marked `outdated` or `updated`, with a required reason. Each mark appends a timestamp and explanation without replacing the original text. Reuse and export carry the current review status. An `updated` mark is not a claim that every statement has been independently verified; an unmarked note is not automatically current.
