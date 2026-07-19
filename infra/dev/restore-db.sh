#!/usr/bin/env bash
#
# Restore the dev control-plane DB from a backup made by backup-db.sh.
# Defaults to the most recent dump; pass a path to pick a specific one.
#
#   pnpm db:restore                                   # newest backup
#   bash infra/dev/restore-db.sh                      # newest backup
#   bash infra/dev/restore-db.sh infra/dev/backups/content_dashboard-20260711-191320.dump
#
# --clean --if-exists drops+recreates objects, so this fully replaces current
# DB contents with the dump. Safe to run over a stale/empty DB to get your work
# back.
#
set -euo pipefail

CONTAINER="content-dashboard-db"
DB="content_dashboard"
USER_="app"
DIR="$(cd "$(dirname "$0")" && pwd)/backups"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "✗ container '$CONTAINER' is not running — start it with 'pnpm db:up' first." >&2
  exit 1
fi

DUMP="${1:-$(ls -1t "$DIR"/${DB}-*.dump 2>/dev/null | head -1 || true)}"
if [ -z "${DUMP:-}" ] || [ ! -f "$DUMP" ]; then
  echo "✗ no backup found in $DIR (run 'pnpm db:backup' first, or pass a dump path)." >&2
  exit 1
fi

echo "Restoring $DB from $(basename "$DUMP") …"
docker exec -i "$CONTAINER" pg_restore -U "$USER_" -d "$DB" --clean --if-exists --no-owner <"$DUMP"
ROWS="$(docker exec "$CONTAINER" psql -U "$USER_" -d "$DB" -tAc 'select count(*) from "ContentItem"' 2>/dev/null || echo '?')"
echo "✓ restored — ${ROWS} ContentItems now in $DB"
