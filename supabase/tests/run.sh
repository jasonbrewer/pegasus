#!/usr/bin/env bash
# Builds a throwaway database that behaves like Supabase, applies every
# migration in order, then runs the test files.
#
# The harness applies Supabase's default grants (see 00_harness.sql). That is
# deliberate: without them, has_table_privilege() answers differently here than
# in production and grant-based assertions pass locally while failing a live
# `supabase db push`.
#
#   sudo -u postgres supabase/tests/run.sh [dbname]
set -euo pipefail

DB="${1:-pc_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

psql -q -c "drop database if exists ${DB}"
psql -q -c "create database ${DB}"
psql -q -d "${DB}" -c "create extension if not exists postgis; create extension if not exists pgcrypto;"

psql -q -v ON_ERROR_STOP=1 -d "${DB}" -f "${ROOT}/supabase/tests/00_harness.sql"

for f in "${ROOT}"/supabase/migrations/*.sql; do
  printf '%-58s' "$(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -d "${DB}" -f "$f" && echo "ok"
done

for f in "${ROOT}"/supabase/tests/*_test.sql; do
  echo
  echo "### $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -d "${DB}" -f "$f"
done
