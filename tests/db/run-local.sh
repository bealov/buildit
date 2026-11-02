#!/usr/bin/env bash
# Rulează migrarea și testele RLS pe un Postgres temporar (nu atinge Supabase).
# Cerințe: Postgres 15+ instalat local (initdb, pg_ctl, psql).
# Rulează de două ori: cu expunerea automată a tabelelor dezactivată (ca în buildit-dev)
# și activată, pentru a dovedi că migrarea nu depinde de această setare.
set -euo pipefail
cd "$(dirname "$0")/../.."

PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
MIGRATIONS=(supabase/migrations/*.sql)
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$WORK"
  RUN_AS=(runuser -u postgres --)
fi
cleanup() { "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null

run() { psql -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d "$1" "${@:2}"; }

for mode in exposure_off exposure_on; do
  echo "== Mod: $mode =="
  run postgres -c "create database $mode" >/dev/null
  run "$mode" -f tests/db/supabase-stub.sql >/dev/null
  if [ "$mode" = exposure_on ]; then
    # Simulează „Automatically expose new tables” activat: tabelele noi primesc toate drepturile.
    run "$mode" -c "alter default privileges in schema public grant all on tables to anon, authenticated; alter default privileges in schema public grant all on functions to anon, authenticated;" >/dev/null
  fi
  for m in "${MIGRATIONS[@]}"; do run "$mode" -f "$m" >/dev/null; done
  # A doua aplicare trebuie să reușească (migrare reexecutabilă fără erori).
  for m in "${MIGRATIONS[@]}"; do run "$mode" -f "$m" >/dev/null; done
  run "$mode" -f tests/db/rls.test.sql
done
echo "Testele bazei de date au trecut în ambele moduri."
