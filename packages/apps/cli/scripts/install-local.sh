#!/usr/bin/env sh
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
"$SCRIPT_DIR/install.sh" \
  --local "$CLI_ROOT/bin" \
  --name lumpcode-beta
