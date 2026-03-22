#!/bin/bash
# Deploy Proconix de pe Git pe VPS
# Rulează de pe VPS (după SSH) SAU de pe PC (cu SSH în interior).
#
# Variabile – schimbă cu valorile tale:
VPS_USER="root"                    # user SSH pe VPS (ex: root, ubuntu, deploy)
VPS_HOST="IP_SAU_DOMENIU_VPS"     # ex: 123.45.67.89 sau server.example.com
REMOTE_DIR="/var/www/proconix"    # folderul unde stă proiectul pe VPS
REPO_URL="https://github.com/roman1997d/Proconix.git"
PM2_APP_NAME="proconix"           # numele app în PM2 (dacă folosești PM2)

set -e

echo "=== 1. Conectare la VPS și ștergere proiect vechi ==="
ssh "$VPS_USER@$VPS_HOST" "rm -rf $REMOTE_DIR"

echo "=== 2. Clone proiect nou de pe Git ==="
ssh "$VPS_USER@$VPS_HOST" "git clone $REPO_URL $REMOTE_DIR"

echo "=== 3. Instalare dependențe ==="
ssh "$VPS_USER@$VPS_HOST" "cd $REMOTE_DIR && npm install"

echo "=== 4. Creare .env (dacă nu există) ==="
ssh "$VPS_USER@$VPS_HOST" "cd $REMOTE_DIR && [ -f .env ] || echo 'Creează manual .env pe VPS cu PORT, PGDATABASE, PGUSER, PGPASSWORD etc.'"

echo "=== 5. Restart aplicație (PM2) ==="
ssh "$VPS_USER@$VPS_HOST" "cd $REMOTE_DIR && (pm2 delete $PM2_APP_NAME 2>/dev/null || true) && pm2 start index.js --name $PM2_APP_NAME && pm2 save"

echo "=== Gata. Aplicația rulează pe VPS. ==="
