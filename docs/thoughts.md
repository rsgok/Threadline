# Thought timeline and AI relations

Open My threads, then a thought. Timeline is the default, ordered newest first by collection time. Relations displays confirmed links and evidence-backed suggestions. Changes are stored in the existing SQLite library in additive tables; existing notes are untouched.

Discover relations creates a versioned analysis job scoped to the thought's current conversations. Copy the task into Codex or Cursor. The prompt includes the bundled CLI path as a fallback when the plugin is not installed. Analysis does not start merely by copying. The user's AI may use cloud inference. Return and refresh the Relations view after completion.

Plugin source: `plugins/threadline`, with `skills/discover-relations/SKILL.md` and `scripts/threadline.mjs`. Requires Node 22+. The plugin can be installed by a compatible host; the CLI can also run directly:

```sh
node plugins/threadline/scripts/threadline.mjs topics
node plugins/threadline/scripts/threadline.mjs analyze <topic-id>
node plugins/threadline/scripts/threadline.mjs input <job-id>
node plugins/threadline/scripts/threadline.mjs submit <job-id> <relations.json>
```

Set `THREADLINE_URL` for an alternate localhost port. Submission accepts an array of `{from,to,type,reason,fromQuote,toQuote}` with types supports, extends, contradicts, related. Quotes must be exact substrings of each note's original body. Only suggestions are written. The UI confirms or dismisses them. Unchanged results are idempotent; duplicate relationships cannot override reviewed records. Changed/deleted sources reject a pending job; stale saved links leave the graph and cannot be confirmed. Reanalyze to obtain suggestions against new source versions.

This first version analyzes the full thought on demand. It does not invoke a model in the background, perform incremental scheduling, infer factual continuation from timestamps, or offer manual graph editing. Graph edges are backed by their evidence cards below. Confirmed links and suggestions remain local until the user supplies the selected source material to their AI.
