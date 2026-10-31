#!/usr/bin/env bash
# Keep iCloud Drive away from the build directories.
#
# This checkout lives under ~/Documents, which macOS puts in the iCloud Drive
# file-provider domain. iCloud then syncs node_modules / .next / .open-next
# and, on conflicts, drops "dataless" duplicates named "name 2.js", "name 3.js"
# next to the originals. Reading one blocks on the network and Turbopack's
# file tracing times out (ship100, 2026-10-30: 46,674 such files; build failed
# with "reading file … edge-route-module-wrapper 4.js: Operation timed out").
#
# Fix, in two parts, both idempotent and cheap (a few seconds at most):
#   1. delete every "name N.ext" duplicate inside the build directories
#   2. mark the directories with com.apple.fileprovider.ignore#P so iCloud
#      stops syncing them. The attribute lives on the directory itself, so it
#      is lost whenever a tool deletes and recreates the directory (OpenNext
#      rm -rf's .open-next on every build; ship2 clears .next). Run this
#      before AND after a build, and before `next dev` (npm predev).
#
# No-op outside macOS. Never touches the source tree.
set -u
[ "$(uname -s)" = "Darwin" ] || exit 0

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ATTR='com.apple.fileprovider.ignore#P'
DIRS=(node_modules .next .open-next .wrangler .vercel)

# Stale trial worktrees under .claude/worktrees carry their own build dirs.
WORKTREE_DIRS=()
if [ -d "$ROOT/.claude/worktrees" ]; then
  for wt in "$ROOT"/.claude/worktrees/*/; do
    [ -d "$wt" ] || continue
    for d in "${DIRS[@]}"; do
      [ -d "$wt$d" ] && WORKTREE_DIRS+=("$wt$d")
    done
  done
fi

removed=0
marked=0
for rel in "${DIRS[@]}"; do
  dir="$ROOT/$rel"
  # Create node_modules/.next/.open-next up front so the attribute is in place
  # before the build writes into them; leave the optional ones alone.
  case "$rel" in node_modules|.next|.open-next) mkdir -p "$dir" ;; esac
  [ -d "$dir" ] || continue
  n=$(find "$dir" -name '* [0-9].*' -type f -print -delete 2>/dev/null | wc -l | tr -d ' ')
  removed=$((removed + n))
  if ! xattr -p "$ATTR" "$dir" >/dev/null 2>&1; then
    xattr -w "$ATTR" 1 "$dir" 2>/dev/null && marked=$((marked + 1))
  fi
done
for dir in "${WORKTREE_DIRS[@]}"; do
  n=$(find "$dir" -name '* [0-9].*' -type f -print -delete 2>/dev/null | wc -l | tr -d ' ')
  removed=$((removed + n))
  if ! xattr -p "$ATTR" "$dir" >/dev/null 2>&1; then
    xattr -w "$ATTR" 1 "$dir" 2>/dev/null && marked=$((marked + 1))
  fi
done

echo "icloud-nosync: removed $removed iCloud duplicate file(s), marked $marked dir(s) as not synced"
exit 0
