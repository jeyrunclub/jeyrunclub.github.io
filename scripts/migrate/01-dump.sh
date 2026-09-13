#!/usr/bin/env bash
# Dump the data worth moving, in two passes.
#
# Two rather than one because mixing --schema and --table in a single pg_dump
# invocation has ambiguous semantics — union or intersection depending on
# version and reading — and a migration is not the place to find out which.
#
# Not dumped: the schema itself (schema.sql builds it on the far side, so the
# new project gets today's definitions rather than a replay of history),
# storage rows (the files are copied separately and recreate them), sessions and
# refresh tokens (everyone signs in again regardless), and notifications (a log
# of things already read).
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "no .env — copy .env.example and fill it in"; exit 1; }
set -a; . ./.env; set +a
mkdir -p out

echo "→ auth (who people are, and their password hashes)…"
pg_dump "$SOURCE_DB_URL" \
  --data-only --no-owner --no-privileges \
  --table auth.users \
  --table auth.identities \
  --file out/auth.sql

echo "→ public (everything the club has done)…"
pg_dump "$SOURCE_DB_URL" \
  --data-only --no-owner --no-privileges \
  --schema public \
  --exclude-table-data 'public.notifications' \
  --file out/public.sql

for f in auth public; do
  printf '  out/%-11s %6s  %s tables with rows\n' \
    "$f.sql" "$(du -h out/$f.sql | cut -f1)" "$(grep -c '^COPY ' out/$f.sql || true)"
done
echo "✓ dumped"
