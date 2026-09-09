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

## Other runtimes

Copy the entire `skills/threadline` directory into a compatible runtime’s skill directory. Configure `THREADLINE_URL` or the CLI’s global `--url` option if the service uses a different local address. Only loopback HTTP is accepted. A remote runtime needs an SSH tunnel to the local service or a service running on its own machine.

Collection reads transcripts from the **service machine**, not necessarily the machine running the CLI.

## Local conversation support

| Runtime | Supported source |
| --- | --- |
| Codex | Local session transcripts from the configured Codex home. |
| Cursor Agents | UUID JSONL main conversations under `~/.cursor/projects/*/agent-transcripts/`, including nested directories. |

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
