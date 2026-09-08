#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
# A standalone standard-library script: no checkout path or Node dependency.
THREADLINE_BIN_DIR="${THREADLINE_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$THREADLINE_BIN_DIR"
install -m 755 skills/threadline/scripts/threadline.py "$THREADLINE_BIN_DIR/threadline"
printf 'Installed: %s/threadline\n' "$THREADLINE_BIN_DIR"
