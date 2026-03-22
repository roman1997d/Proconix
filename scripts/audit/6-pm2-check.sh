#!/bin/bash
# 6️⃣ Audit PM2 / management procese – Proconix

echo "=============================================="
echo "6️⃣  AUDIT PM2 / MANAGEMENT PROCESE"
echo "=============================================="

if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 nu e instalat. Instalare: npm install -g pm2"
  exit 1
fi

echo ""
echo "--- PM2 list ---"
pm2 list

echo ""
echo "--- PM2 status (detalii) ---"
pm2 show proconix 2>/dev/null || pm2 show 0 2>/dev/null || true

echo ""
echo "--- Recomandare: --max-memory-restart ---"
echo "   Exemplu: pm2 start index.js --name proconix --max-memory-restart 500M"
echo "   Sau în ecosystem.config.js: max_memory_restart: '500M'"
