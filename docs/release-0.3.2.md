# 0.3.2 review and validation

## Architecture decisions

Keep the existing native shell, loopback service and React client boundaries. The native shell owns installation and service lifetime. The service owns versioned writes and local attachment archival. Rich editor state stays client-side; Markdown remains the portable storage format. No data-schema migration is introduced.

Conversation discovery maintains a persisted compact index and reads changed sources only. Cache the sorted snapshot by revision; the status response still reflects current syncing state. Project grouping now uses one pass rather than scanning the list per project. Projects initially render five conversations, with independent expansion.

Remove duplicate session-menu dismissal listeners in favor of the app-level header-menu owner. Only the focused rich editor listens for global selection/scroll/resize changes. Remove unused direct bubble/floating-menu dependencies (Tiptap may still require them transitively).

Attachment copies created during a failed note save are removed, while the uploaded originals remain available for retry. Image Markdown angle-quotes destinations; legacy note-upload references remain readable. The same tests use a data directory containing spaces.

## Measured scope

Synthetic local benchmark, 10,000 conversations / 200 projects, 30 grouping iterations: previous grouping 8.19 ms, single-pass grouping 0.17 ms. First 10,000-row index snapshot 10.05 ms; 1,000 subsequent cached snapshot calls averaged 0.00012 ms, excluding JSON serialization and HTTP. These are computation timings, not end-to-end load claims.

## Remaining boundaries

Initial source discovery and changes to very large transcripts still need source parsing. Rich editor code is lazy-loaded, but a long imported note still creates one editor per editable message. The compact index payload is complete rather than paginated; revisit virtualization/pagination if real libraries exceed current measured scale. Existing theme palettes remain supported for exported cards.

Validation results and distribution links are recorded in the PR and GitHub release. Local installation scope is ~/Applications/Threadline.app only.
