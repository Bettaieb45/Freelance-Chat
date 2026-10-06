#!/usr/bin/env bash
# Runs the migrations and RLS tests against a throwaway local Postgres.
# Needs Postgres server binaries (initdb, pg_ctl) on PATH or in /usr/lib/postgresql/*/bin.
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN=$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")
DIR=$(mktemp -d)
PORT=55432
RUNAS=()
if [ "$(id -u)" = 0 ]; then chown -R postgres "$DIR"; RUNAS=(runuser -u postgres --); fi
cleanup() { "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
"${RUNAS[@]}" "$PGBIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c wal_level=logical" -l "$DIR/log" start >/dev/null
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
# Migrate once into a template, then give every test file its own fresh copy.
"${PSQL[@]}" -d postgres -c "create database app_template"
"${PSQL[@]}" -d app_template -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -d app_template -f "$f"; done
"${PSQL[@]}" -d postgres -c "alter database app_template is_template true"
i=0
for t in supabase/tests/*_test.sql; do
  i=$((i + 1))
  "${PSQL[@]}" -d postgres -c "create database test_$i template app_template"
  "${PSQL[@]}" -d "test_$i" -o /dev/null -f "$t"
  echo "  ✓ $(basename "$t")"
done
echo "DB tests passed"
