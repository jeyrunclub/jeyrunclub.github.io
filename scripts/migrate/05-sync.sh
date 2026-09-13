#!/usr/bin/env bash
# Catch up anything written to the old project since the dump.
#
# --column-inserts names every column, which matters: the old project grew its
# columns through ALTER TABLE over months and the new one got them in the order
# schema.sql declares them, so a positional INSERT lines the wrong values up
# with the wrong columns. --on-conflict-do-nothing makes it safe to run as many
# times as you like: rows already on the far side are skipped rather than
# colliding, so
# it can be run before the switch and again after, to sweep up whatever landed
# in the window between them.
#
# What it does NOT carry across is an UPDATE — a day log that was ticked and
# then un-ticked, a plan rewritten in place. Those rows exist on both sides
# already, so the conflict clause leaves the old value standing. For a window of
# minutes that is the right trade; for hours it would not be.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
mkdir -p out

echo "→ dumping delta…"
pg_dump "$SOURCE_DB_URL" \
  --data-only --no-owner --no-privileges \
  --column-inserts --on-conflict-do-nothing \
  --schema public \
  --exclude-table-data 'public.notifications' \
  --file out/delta.sql

echo "→ applying…"
psql "$TARGET_DB_URL" \
  --single-transaction --variable ON_ERROR_STOP=1 \
  --command 'SET session_replication_role = replica;' \
  --quiet --file out/delta.sql

echo "✓ synced"
