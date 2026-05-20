#!/usr/bin/env bash
# Weekly sync: refresh all dashboard views, commit any data/ changes, push to
# origin/main so Vercel redeploys. Designed to be invoked by cron.
#
# Cron's default PATH is /usr/bin:/bin, which doesn't include /usr/local/bin
# where Homebrew node/npm live — so we set PATH explicitly.
#
# Install (Monday 5am local time):
#   crontab -e
#   0 5 * * 1 /Users/andrew/Documents/Research/AI_workflows/Bioblitz/scripts/sync-and-push.sh

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
