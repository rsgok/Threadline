#!/bin/bash
set -euo pipefail
launchctl kill SIGTERM "gui/$(id -u)/local.rewind.web"
printf 'Rewind stopped. Saved clips remain on disk.\n'
