# Note reading and editing

The title and body are always editable on the reading surface; focus does not change their typography, dimensions, or indentation. No edit-mode toggle is required; supplementary fields use a modal. Existing versioned autosave, recovery, and navigation guards remain in use. Rich editing is loaded on demand.

Research: Multica's issue detail embeds ContentEditor directly and keeps Markdown as its storage format. Its ContentEditor uses Tiptap with the official Markdown pipeline. Threadline independently implements this interaction with Tiptap; no Multica source is copied.

- https://github.com/multica-ai/multica/blob/main/packages/views/issues/components/issue-detail.tsx
- https://github.com/multica-ai/multica/blob/main/packages/views/editor/content-editor.tsx
- https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage

Imported transcript headings are presentation metadata, not article headings. Only known top-level imported role headings are split, excluding fenced code and quoted headings. Message timestamps display in local time, with the original timestamp on hover. The banner uses createdAt for collection time, distinct from message timestamps.

Opening and closing editing without changes does not rewrite Markdown. Editing one message preserves surrounding messages and their raw headings. Unsupported rich-text round trips keep the rendered preview and expose an Edit this section button. Source editing happens in the shared modal with an isolated draft; Escape discards changes and Save waits for persistence before closing. Existing user content, review records, and original provenance are retained.

Supplementary fields live in the shared modal, opened from the note header's more menu. The modal keeps its own draft and submits all supplementary fields together.

Only the actually focused editor owns a floating toolbar; it is removed on blur or unmount. The toolbar appears only for a non-empty text or node selection and includes inline formatting, headings, lists, block quotes, code blocks, tables, and image/file-link insertion. Image nodes and linked text have explicit deletion controls. Insertion accepts an HTTPS/HTTP URL or an absolute local path. Clipboard files and dropped files are uploaded locally (12 MB per file), inserted at the mapped document position, and archived with the note when autosave completes. Removing a reference does not delete the source file on disk.
