#!/usr/bin/env bash
# Runs the schema + behaviour tests against a throwaway local PostgreSQL.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=cryomanager_test_$$
createdb "$DB"
trap 'dropdb "$DB" >/dev/null 2>&1 || true' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -qtA -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/01_schema_tests.sql 2>&1 | grep -v -e "^$" -e "^{" | sed "s/^psql:[^ ]* NOTICE:  /  /"
