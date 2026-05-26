#!/usr/bin/env bash
# Weekly sync: refresh all dashboard views, commit any data/ changes, push to
# origin/main so Vercel redeploys. Invoked by a launchd LaunchAgent.
#
# launchd's default PATH is /usr/bin:/bin, which doesn't include /usr/local/bin
# where node/npm live — so we set PATH explicitly.
#
# Install (Monday 5am local time, catches up missed runs after sleep):
#   ~/Library/LaunchAgents/com.mandrewj.bioblitz-sync.plist
#   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.mandrewj.bioblitz-sync.plist
#
# We use launchd rather than cron because cron silently skips runs scheduled
# while the Mac is asleep — launchd fires them on wake instead.

set -euo pipefail

REPO_DIR="/Users/andrew/Documents/Research/AI_workflows/Bioblitz"
export PATH="/usr/local/bin:/usr/bin:/bin"

cd "$REPO_DIR"

LOG_DIR="$REPO_DIR/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/sync-$(date +%Y-%m-%d).log"

{
  echo "=== sync run: $(date) ==="

  npm run sync

  git add data/
  if git diff --cached --quiet; then
    echo "no data changes — skipping commit"
    exit 0
  fi

  git commit -m "data: weekly sync $(date +%Y-%m-%d)"
  git push origin main

  echo "=== done: $(date) ==="
} >> "$LOG" 2>&1
