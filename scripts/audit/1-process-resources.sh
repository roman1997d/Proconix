#!/bin/bash
# 1️⃣ Audit procese și resurse Node.js – Proconix
# Rulează pe VPS sau local: bash scripts/audit/1-process-resources.sh

echo "=============================================="
echo "1️⃣  AUDIT PROCESE ȘI RESURSE NODE.JS"
echo "=============================================="

echo ""
echo "--- Procese Node.js (ps aux | grep node) ---"
ps aux | grep -E 'node|nodemon|pm2' | grep -v grep

echo ""
echo "--- Număr procese Node (excl. grep) ---"
COUNT=$(ps aux | grep -E 'node|nodemon' | grep -v grep | wc -l)
echo "Total: $COUNT"

echo ""
echo "--- Porturi listen (Node) ---"
for port in 3000 3001 8080 5000; do
  if command -v lsof >/dev/null 2>&1; then
    lsof -i :$port 2>/dev/null | head -5
  elif command -v ss >/dev/null 2>&1; then
    ss -tlnp | grep ":$port " 2>/dev/null
  fi
done

echo ""
echo "--- Sugestie: rulează htop sau top în alt terminal pentru CPU/RAM în timp real ---"
echo "   (Procese fantomă = mai multe node cu același nume fără PM2 parent)"
