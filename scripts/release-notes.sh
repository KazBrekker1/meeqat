#!/usr/bin/env bash
# What changed in a release, written for users: the conventional-commit subjects since
# the previous release tag, grouped into New / Improved / Fixed. Housekeeping commits
# (chore, release, ci, docs, test, refactor, build) are left out.
# A release-notes/<version>.md file, if present, is used instead.
#
# Usage:  scripts/release-notes.sh meeqat-v4.2.0   → markdown on stdout
# Needs full history and tags (actions/checkout with fetch-depth: 0).
set -euo pipefail

TAG="${1:?usage: release-notes.sh <tag>}"

# Hand-written notes win: release-notes/<version>.md, when a release deserves better
# wording than its commit subjects.
WRITTEN="$(dirname "$0")/../release-notes/${TAG#meeqat-v}.md"
if [ -f "$WRITTEN" ]; then
  cat "$WRITTEN"
  exit 0
fi

# The tag may not exist yet (first run of a release) — then the release is HEAD.
END=HEAD
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && END="$TAG"
PREV="$(git describe --tags --abbrev=0 --match 'meeqat-v*' "$END^" 2>/dev/null || true)"
RANGE="${PREV:+$PREV..}$END"

# "feat(moon): selectable styles" → "- Moon: selectable styles"
section() {
  local title="$1" types="$2" items
  items="$(git log --no-merges --format=%s "$RANGE" | awk -v types="$types" '
    match($0, "^(" types ")(\\([^)]*\\))?!?: *") {
      head = substr($0, 1, RLENGTH); text = substr($0, RLENGTH + 1); scope = ""
      if (match(head, /\([^)]*\)/)) scope = substr(head, RSTART + 1, RLENGTH - 2)
      if (scope != "") text = toupper(substr(scope, 1, 1)) substr(scope, 2) ": " text
      else text = toupper(substr(text, 1, 1)) substr(text, 2)
      print "- " text
    }')"
  [ -z "$items" ] || printf '### %s\n%s\n\n' "$title" "$items"
}

NOTES="$(section "New" "feat"; section "Improved" "perf"; section "Fixed" "fix")"
[ -n "$NOTES" ] || NOTES="Maintenance and stability improvements."
printf '%s\n' "$NOTES"
