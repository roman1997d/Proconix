#!/bin/bash
# Rulează toate verificările de audit și salvează un rezumat.
# Usage: bash scripts/audit/run-all-audit.sh [dir_rapoarte]

set -e
cd "$(dirname "$0")/../.."
REPORT_DIR="${1:-./scripts/audit/reports}"
mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/audit-$(date +%Y%m%d-%H%M).txt"

{
  echo "=============================================="
  echo "AUDIT PROCONIX – $(date)"
  echo "=============================================="

  echo ""
  bash scripts/audit/1-process-resources.sh 2>&1

  echo ""
  bash scripts/audit/5-ports-phantom.sh 2>&1

  echo ""
  bash scripts/audit/6-pm2-check.sh 2>&1

  echo ""
  bash scripts/audit/2-code-eslint.sh 2>&1

  echo ""
  bash scripts/audit/4-dependencies.sh 2>&1

  echo ""
  echo "--- 3️⃣ DB: rulează manual: psql -U postgres -d ProconixDB -f scripts/audit/3-database-audit.sql ---"
} | tee "$REPORT"

echo ""
echo "Raport salvat: $REPORT"
