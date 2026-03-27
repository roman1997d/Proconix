#!/usr/bin/env bash
# Verifică tabelele așteptate în PostgreSQL. Rulează din rădăcina proiectului.
# Folosește .env dacă există (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
# Exemplu: bash scripts/verify_db_tables.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export PGPASSWORD="${PGPASSWORD:-${DB_PASSWORD:-}}"

HOST="${PGHOST:-${DB_HOST:-127.0.0.1}}"
PORT="${PGPORT:-${DB_PORT:-5432}}"
DB="${PGDATABASE:-${DB_NAME:-ProconixDB}}"
USER="${PGUSER:-${DB_USER:-postgres}}"

echo "Conectare: $USER@$HOST:$PORT / $DB"
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/verify_database_tables.sql"

echo ""
echo "Gata. Caută rânduri MISSING — pentru acelea rulează scripturile SQL corespunzătoare din scripts/."
