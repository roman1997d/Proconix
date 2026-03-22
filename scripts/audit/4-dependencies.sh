#!/bin/bash
# 4️⃣ Audit dependențe Node.js – Proconix
# Rulează: npm run audit:deps  sau  bash scripts/audit/4-dependencies.sh

cd "$(dirname "$0")/../.."

echo "=============================================="
echo "4️⃣  AUDIT DEPENDENȚE"
echo "=============================================="

echo ""
echo "--- Pachete depășite (npm outdated) ---"
npm outdated 2>/dev/null || true

echo ""
echo "--- Vulnerabilități (npm audit) ---"
npm audit 2>/dev/null || true

echo ""
echo "--- Pentru fix automat (atenție la breaking): npm audit fix ---"
echo "--- Pentru raport detaliat: npx snyk test (după snyk auth) ---"
