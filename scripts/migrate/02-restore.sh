#!/usr/bin/env bash
# Restore into the new project.
#
# One transaction across both files, so a failure anywhere leaves the target
# exactly as it was. session_replication_role = replica turns off triggers and
# foreign-key checks for the load: without it every restored announcement and
# plan would fire the notification triggers and manufacture a history of things
# nobody did.
#
# Auth goes first so the profiles rows have users to belong to — which the
# replica setting makes unnecessary, but a restore that would survive without
# the trick is a restore worth having.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "no .env"; exit 1; }
set -a; . ./.env; set +a
[ -f out/auth.sql ] && [ -f out/public.sql ] || { echo "run 01-dump.sh first"; exit 1; }

echo "→ restoring into target…"
psql "$TARGET_DB_URL" \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --command 'SET session_replication_role = replica;' \
  --file out/auth.sql \
  --file out/public.sql

echo "✓ restored"
