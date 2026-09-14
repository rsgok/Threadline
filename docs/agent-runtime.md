# Agent integration

[Back to README](../README.md)

The skill, CLI, and app use the same local HTTP service and library. The CLI does not open SQLite directly.

## Codex skill

From the project checkout:

```sh
bash scripts/install-skill.sh
```

The script installs the Threadline skill and its compatibility companion into the Codex skills directory, honoring `CODEX_HOME` when set. Start a new Codex session, then invoke `$threadline` for the current conversation.

## CLI

The CLI requires Python 3 and has no third-party Python dependencies. The local service must already be running.

```sh
bash scripts/install-cli.sh
export PATH="$HOME/.local/bin:$PATH"
threadline health
threadline list --query 'design decision'
threadline save --title 'Design direction' --file ./progress.md --source 'Agent Runtime'
threadline get NOTE_UUID
```

The `save` example reads an existing Markdown file; create `progress.md` first or supply your own path. Replace `NOTE_UUID` with an ID returned by `list` or `save`.

The installer defaults to `~/.local/bin/threadline`; set `THREADLINE_BIN_DIR` to choose another directory. You can also run the script directly:

```sh
python3 skills/threadline/scripts/threadline.py --help
```

Use `threadline COMMAND --help` for command-specific arguments. Available operations include `health`, `panel`, `list`, `get`, `save`, `update`, `delete`, `export`, `sessions`, `session`, `import`, `topics`, `topic-create`, and `mark`.

## Terminal agents and exact conversation links

```sh
bash scripts/install-skill.sh --runtime claude
bash scripts/install-skill.sh --runtime pi
bash scripts/install-skill.sh --runtime deepseek
threadline sessions --runtime all
threadline session --runtime claude --thread SESSION_ID
threadline open --runtime claude --thread SESSION_ID
```

Choose the install command for the runtime you use. These copy the skill into `~/.claude/skills`, `~/.pi/agent/skills`, or `~/.dsh/skills` respectively, honoring the runtime home overrides below. The Codex installation remains the default. The Claude skill passes its `${CLAUDE_SESSION_ID}` template substitution explicitly to `--thread`. Pi and DeepSeek Harness shell tools expose `PI_SESSION_ID` and `DSH_SESSION_ID`, which their CLI commands can use directly. These variables may be absent in an ordinary terminal; pass the exact ID explicitly. Never fall back to the latest conversation.

`threadline open` verifies the session before asking macOS to open `threadline://collect/RUNTIME/SESSION_ID`. Rebuild/install the Mac App to register this scheme. It opens only the corresponding local collection page, including after a cold launch. It does not save anything. For a browser or a development service use `--browser`; the native App always uses port 43127. `panel --runtime RUNTIME --thread SESSION_ID` only returns an HTTP sidebar link. IDEs with embedded browsers can display that same page.

The CLI `session` response includes the runtime. `import --snapshot FILE --message MESSAGE_ID` routes to that runtime automatically, including Cursor. `save`, `list`, `get`, and the rest of the note commands share the same library across all runtimes.

## Other runtimes

Copy the entire `skills/threadline` directory into a compatible runtime’s skill directory. Configure `THREADLINE_URL` or the CLI’s global `--url` option if the service uses a different local address. Only loopback HTTP is accepted. A remote runtime needs an SSH tunnel to the local service or a service running on its own machine.

Collection reads transcripts from the **service machine**, not necessarily the machine running the CLI.

## Local conversation support

| Runtime | Supported source |
| --- | --- |
| Codex | Local session transcripts from the configured Codex home. |
| Cursor Agents | UUID JSONL main conversations under `~/.cursor/projects/*/agent-transcripts/`, including nested directories. |
| Claude Code (`claude`) | UUID JSONL conversations under `~/.claude/projects/`; `CLAUDE_CONFIG_DIR` overrides the Claude home. |
| Pi (`pi`) | v1–v3 JSONL under `~/.pi/agent/sessions/`; `PI_CODING_AGENT_DIR` overrides the agent home and `PI_CODING_AGENT_SESSION_DIR` overrides the session root. |
| DeepSeek Harness (`deepseek`) | v3 `session.v3.jsonl` / `.jsonl.zstd` in project/session directories under `~/.dsh/sessions/`; `DSH_HOME` overrides the Harness home. |

These directories belong to the service machine. Home overrides must be set in the **service process**, not just in an agent shell. Per-run `--session` / `--session-dir` files outside the configured root are not discovered. Runtime IDs for Pi/DeepSeek may be UUIDs or 1–200 ASCII letters, digits, `_`, and `-`, starting with a letter or digit.

The terminal adapters skip symlinks, subagent directories, tool outputs, and reasoning. Claude also omits sidechain, metadata and compaction-summary records. Pi follows parent IDs from the last persisted entry and retains original precompaction text; an in-memory tree selection without a new write is not observable. DeepSeek retains original human/model append events across compaction and omits injected context and surface replacements; this is a collection of original discussion, not reconstruction of the current model context. Unsupported DeepSeek generations are reported rather than falling back to stale older generations.

Plain and expanded transcripts are limited to 64 MB; each runtime lists up to 100 recently modified files. Missing directories are empty; unreadable or incompatible files appear as warnings while other sessions remain available. Runtime state is shown as unknown rather than inferred from file modification time. New adapters use exact message IDs and fingerprints to determine whether the current original has been collected.

Claude and Pi embedded images can be copied using the existing attachment handling. DeepSeek's managed attachment IDs are displayed as unresolved references and preserved with a warning; their bytes are not copied. Compressed DeepSeek logs require Node.js 22.15 or newer, and are decoded per Zstandard frame, ignoring an incomplete final batch without modifying the source.

Format references checked for this implementation: [Claude Skills](https://code.claude.com/docs/en/skills), [Pi session format](https://pi.dev/docs/latest/session-format), [Pi shell environment](https://pi.dev/docs/latest/environment-variables), and [DeepSeek Harness source at c291e79](https://github.com/deepseek-ai/deepseek-harness/tree/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session). DeepSeek is a rapidly evolving preview; new format versions need explicit adapter validation.

The Cursor adapter filters tool results, system messages, reasoning blocks, and subagent sessions. Missing timestamps or runtime state remain unknown. It does not download cloud history or recover legacy IDE databases. If no local transcripts exist, the UI shows an empty state.

The runtime sidebar can be opened through its local URL. Cursor’s Browser can use a copied link; this does not automatically select the active Cursor conversation. Choose an available local conversation explicitly.

## Automation behavior

- Commands other than help emit JSON on stdout; errors emit JSON on stderr. Exit codes are `0` for success, `2` for argument errors, and `1` for execution failures.
- Updates require the `version` returned by `get` to prevent overwriting intervening changes.
- Imports require the session snapshot and explicit message IDs. The service validates fingerprints and deduplicates imports.
- Ordinary saves are not idempotent. After a timeout, query the library before retrying.
- ZIP export does not overwrite an existing output file.

For review status, provide a version and a meaningful reason:

```sh
threadline mark NOTE_UUID --version VERSION --status outdated --reason 'The API contract changed; revisit this decision.'
```

Use `updated` when recording a completed revision or corrected conclusion, and explain what changed. See [local data](local-data.md) for how review history is preserved.
