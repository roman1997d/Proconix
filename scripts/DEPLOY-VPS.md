# Deploy Proconix pe VPS (șterge vechi, pune proiect nou de pe Git)

## Variantă 1: Te conectezi tu cu SSH pe VPS și rulezi comenzile

### 1. Conectare la VPS
```bash
ssh root@IP_SAU_DOMENIU_VPS
```
(Înlocuiește `root` cu userul tău și `IP_SAU_DOMENIU_VPS` cu IP-ul sau domeniul VPS-ului.)

### 2. Ștergere proiect vechi
```bash
# Schimbă calea dacă proiectul e în alt folder
rm -rf /var/www/proconix
# sau unde ai tu: rm -rf /home/user/proconix
```

### 3. Clone proiect nou de pe GitHub
```bash
git clone https://github.com/roman1997d/Proconix.git /var/www/proconix
cd /var/www/proconix
```
(Dacă folosești alt path, schimbă `/var/www/proconix` peste tot.)

### 4. Instalare dependențe
```bash
cd /var/www/proconix
npm install
```

### 5. Fișier .env pe VPS
Dacă nu există `.env`, creează-l cu setările pentru producție (baza de date, PORT etc.):
```bash
nano .env
```
Exemplu conținut:
```
PORT=3000
PGHOST=localhost
PGPORT=5432
PGDATABASE=ProconixDB
PGUSER=postgres
PGPASSWORD=parola_ta
ONBOARDING_SECRET=un_secret_oarecare
```

### 6. Restart aplicație (PM2)
```bash
cd /var/www/proconix
pm2 delete proconix
pm2 start index.js --name proconix
pm2 save
```

---

## Variantă 2: Rulezi un script de pe PC (face SSH automat)

1. Deschide `scripts/deploy-to-vps.sh` și completează la început:
   - `VPS_USER` – userul SSH (ex: root, ubuntu)
   - `VPS_HOST` – IP-ul sau domeniul VPS-ului
   - `REMOTE_DIR` – path-ul unde vrei proiectul pe VPS (ex: /var/www/proconix)

2. Fă scriptul executabil și rulează-l (de pe PC-ul tău):
```bash
chmod +x scripts/deploy-to-vps.sh
./scripts/deploy-to-vps.sh
```
(Îți va cere parola SSH sau va folosi cheia SSH dacă e configurată.)

---

## După deploy

- Verifică: `pm2 status` și `pm2 logs proconix`
- Testează în browser: `http://IP_VPS:3000` sau domeniul tău (dacă ai Nginx proxy)
