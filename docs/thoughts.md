# Thought timeline and AI relations

Open My threads, then a thought. Timeline is the default, ordered newest first by collection time. Relations displays confirmed links and evidence-backed suggestions. Changes are stored in the existing SQLite library in additive tables; existing notes are untouched.

Discover relations immediately starts a local Codex CLI task and returns a persisted job. The page shows progress and automatically loads suggestions when it finishes, including after leaving and returning to the thought. Requires Codex installed and signed in; source conversations are sent to its model provider. The runner uses a temporary working directory, read-only sandbox and JSON output schema, ignores user tool configuration, and validates exact evidence before storing suggestions. Repeated clicks reuse a running job. At most two tasks run simultaneously; each times out after four minutes. Interrupted tasks can be retried from the same button.

Plugin source: `plugins/threadline`, with `skills/discover-relations/SKILL.md` and `scripts/threadline.mjs`. Requires Node 22+. The plugin supports external AI hosts as an alternative. Its analyze command prepares a job through /prepare without launching a second Codex process; the CLI can run directly:

```sh
node plugins/threadline/scripts/threadline.mjs topics
node plugins/threadline/scripts/threadline.mjs analyze <topic-id>
node plugins/threadline/scripts/threadline.mjs input <job-id>
node plugins/threadline/scripts/threadline.mjs submit <job-id> <relations.json>
```

Set `THREADLINE_URL` for an alternate localhost port. Submission accepts an array of `{from,to,type,reason,fromQuote,toQuote}` with types supports, extends, contradicts, related. Quotes must be exact substrings of each note's original body. Only suggestions are written. The UI confirms or dismisses them. Unchanged results are idempotent; duplicate relationships cannot override reviewed records. Changed/deleted sources reject a pending job; stale saved links leave the graph and cannot be confirmed. Reanalyze to obtain suggestions against new source versions.

Analysis covers the full thought on demand. There is no scheduled incremental analysis or drag-and-drop graph editing. Confirmed connections use readable title cards and directional labels, with evidence available below. Timeline displays plain excerpts with Markdown markup, role headings and code blocks removed.

Use Connect two conversations manually to select two conversations, click source paragraphs as evidence and describe their relationship. Saving creates a confirmed manual relation. Edit can revise a suggestion or an existing relationship; concurrent edits are rejected. Dismiss removes the relationship without deleting its source conversations.
