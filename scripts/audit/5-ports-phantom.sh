#!/bin/bash
# 5️⃣ Audit porturi și procese fantomă – Proconix
# Setează PORT_APP dacă aplicația folosește alt port.

PORT_APP="${PORT_APP:-3000}"

echo "=============================================="
echo "5️⃣  AUDIT PORTURI ȘI PROCESE FANTOMĂ"
echo "=============================================="

echo ""
echo "--- Procese pe portul $PORT_APP ---"
if command -v lsof >/dev/null 2>&1; then
  lsof -i :$PORT_APP 2>/dev/null || echo "Nimic pe portul $PORT_APP"
else
  echo "lsof nu e disponibil. Încearcă: ss -tlnp | grep $PORT_APP"
  ss -tlnp 2>/dev/null | grep ":$PORT_APP " || true
fi

echo ""
echo "--- Toate porturile în listen (Node) ---"
if command -v lsof >/dev/null 2>&1; then
  lsof -i -P -n 2>/dev/null | grep LISTEN | grep node || true
fi

echo ""
echo "--- PIDs Node (pentru verificare dubluri) ---"
pgrep -a node || true

echo ""
echo "--- Dacă blochează portul: pm2 delete proconix; pm2 start index.js --name proconix ---"
