#!/usr/bin/env bash
# Proconix – aplică migrațiile SQL în ordine (localhost sau VPS după deploy).
#
# Folosește același .env ca aplicația Node (rădăcina proiectului):
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
# (sau PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD)
#
# Utilizare:
#   bash scripts/bootstrap_database.sh
#
# Creează baza de date dacă nu există (conectare la DB "postgres"):
#   BOOTSTRAP_CREATE_DB=1 bash scripts/bootstrap_database.sh
#
# Apoi verifică tabelele:
#   bash scripts/verify_db_tables.sh
#
# Notă: create_site_snags_tables.sql șterge tabelul vechi site_snags_state (JSON).
# Dacă ai DB vechi cu proiecte fără coloanele „spec”, rulează separat
# scripts/migrate_projects_to_spec.sql (scriptul de mai jos îl include deja).

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

if [[ -z "${PGPASSWORD}" ]]; then
  echo "Avertisment: PGPASSWORD/DB_PASSWORD este gol. psql poate cere parola sau eșua (SCRAM)." >&2
fi

PSQL_BASE=(psql -h "$HOST" -p "$PORT" -U "$USER" -v ON_ERROR_STOP=1)

if [[ "${BOOTSTRAP_CREATE_DB:-}" == "1" ]]; then
  echo "=== Verific / creez baza de date: $DB ==="
  EXISTS="$("${PSQL_BASE[@]}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'" || true)"
  if [[ "${EXISTS:-}" != "1" ]]; then
    "${PSQL_BASE[@]}" -d postgres -c "CREATE DATABASE \"${DB}\""
    echo "Creată baza: $DB"
  else
    echo "Baza $DB există deja."
  fi
fi

run_sql() {
  local file="$1"
  echo ""
  echo "=== $(basename "$file") ==="
  "${PSQL_BASE[@]}" -d "$DB" -f "$ROOT/$file"
}

# Ordinea contează (dependențe FK). Doar scripturi idempotente (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
SQL_FILES=(
  scripts/create_companies_table.sql
  scripts/add_created_by_column.sql
  scripts/alter_companies_billing_columns.sql
  scripts/alter_companies_billing_status.sql
  scripts/create_manager_table.sql
  scripts/create_users_table.sql
  scripts/add_onboarded_to_users.sql
  scripts/add_onboarding_to_users.sql
  scripts/create_projects_table_spec.sql
  scripts/migrate_projects_to_spec.sql
  scripts/alter_projects_add_location.sql
  scripts/create_project_assignments_only.sql
  scripts/create_work_hours_table.sql
  scripts/alter_work_hours_add_geolocation.sql
  scripts/create_tasks_table.sql
  scripts/create_issues_table.sql
  scripts/create_uploads_table.sql
  scripts/create_planning_tables.sql
  scripts/alter_planning_add_qa_job_id.sql
  scripts/operative_task_photos_and_declined.sql
  scripts/create_work_logs_table.sql
  scripts/alter_work_logs_add_timesheet_jobs.sql
  scripts/alter_work_logs_add_operative_archived.sql
  scripts/create_material_tables.sql
  scripts/create_material_consumption_table.sql
  scripts/create_qa_tables.sql
  scripts/qa_templates_add_company_project.sql
  scripts/seed_qa_lookup.sql
  scripts/qa_jobs_use_users.sql
  scripts/alter_qa_jobs_job_title.sql
  scripts/create_proconix_admin_table.sql
  scripts/create_site_snags_tables.sql
)

echo "=== Proconix bootstrap DB ==="
echo "Conectare: ${USER}@${HOST}:${PORT} / ${DB}"

for f in "${SQL_FILES[@]}"; do
  if [[ ! -f "$ROOT/$f" ]]; then
    echo "Eroare: lipsește fișierul $f" >&2
    exit 1
  fi
  run_sql "$f"
done

echo ""
echo "=== Gata. Rulează verificarea: bash scripts/verify_db_tables.sh ==="
