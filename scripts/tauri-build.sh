#!/usr/bin/env bash
# Local signed Tauri build. Loads the updater signing key so `createUpdaterArtifacts`
# can sign the bundles (CI sets these from repo secrets; locally we read the backup).
#
# Usage:  bun run build:signed [-- <extra tauri build args>]
# e.g.    bun run build:signed
#         bun run build:signed --target aarch64-apple-darwin
set -euo pipefail

KEY_DIR="${MEEQAT_KEY_DIR:-$HOME/meeqat-updater-key-BACKUP}"
KEY_FILE="$KEY_DIR/tauri-updater.key"
PW_FILE="$KEY_DIR/tauri-updater-key-password.txt"

# Only source from the backup if the env vars aren't already provided.
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  if [[ -f "$KEY_FILE" ]]; then
    export TAURI_SIGNING_PRIVATE_KEY="$KEY_FILE"
  else
    echo "error: signing key not found at $KEY_FILE" >&2
    echo "  set TAURI_SIGNING_PRIVATE_KEY yourself, or MEEQAT_KEY_DIR to the backup dir." >&2
    exit 1
  fi
fi

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" && -f "$PW_FILE" ]]; then
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat "$PW_FILE")"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
fi

exec bun tauri build "$@"
