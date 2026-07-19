#!/usr/bin/env bash
#
# Snapshot the dev control-plane DB (drafts, articles, threads — everything in
# ContentItem) to a timestamped dump on the host filesystem.
#
# The Docker named volume already survives container restarts. This is a second
# line of defense against DATA-LEVEL loss: an accidental `prisma migrate reset`,
# `prisma db push --accept-data-loss`, a manual TRUNCATE, or an external tool
# restoring a stale snapshot over your work. If that happens, run restore-db.sh.
#
#   pnpm db:backup            # from repo root
#   bash infra/dev/backup-db.sh
#
set -euo pipefail

CONTAINER="content-dashboard-db"
DB="content_dashboard"
USER_="app"
DIR="$(cd "$(dirname "$0")" && pwd)/backups"
KEEP=30

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "✗ container '$CONTAINER' is not running — start it with 'pnpm db:up' first." >&2
  exit 1
fi

mkdir -p "$DIR"
TS="$(docker exec "$CONTAINER" date +%Y%m%d-%H%M%S)"
OUT="$DIR/${DB}-${TS}.dump"

# -Fc = custom (compressed, restorable with pg_restore --clean).
docker exec "$CONTAINER" pg_dump -U "$USER_" -d "$DB" -Fc >"$OUT"

ROWS="$(docker exec "$CONTAINER" psql -U "$USER_" -d "$DB" -tAc 'select count(*) from "ContentItem"' 2>/dev/null || echo '?')"
echo "✓ backed up $DB → $OUT ($(du -h "$OUT" | cut -f1), ${ROWS} ContentItems)"

# Prune to the most recent $KEEP dumps.
ls -1t "$DIR"/${DB}-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
