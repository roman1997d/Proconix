#!/bin/bash
# 2️⃣ Audit cod – ESLint (variabile nefolosite, cod mort, posibile buguri)
# Rulează: npm run lint  sau  bash scripts/audit/2-code-eslint.sh

cd "$(dirname "$0")/../.."

echo "=============================================="
echo "2️⃣  AUDIT COD – ESLint"
echo "=============================================="

if ! command -v npx >/dev/null 2>&1; then
  echo "Instalează ESLint: npm install --save-dev eslint"
  exit 1
fi

if [ ! -f node_modules/.bin/eslint ] && [ ! -f node_modules/eslint/package.json ]; then
  echo "Instalare ESLint..."
  npm install --save-dev eslint
fi

echo ""
echo "--- ESLint (backend) ---"
npx eslint backend/ index.js server.js db.js 2>/dev/null || true

echo ""
echo "--- Pentru profilare CPU/memory: npx clinic doctor -- node index.js ---"
echo "   (oprește cu Ctrl+C, clinic generează raport HTML)"
