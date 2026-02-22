# 5. Documentație de instalare și setup

## Setup local / server VPS

### Cerințe

- **Node.js**: v16 sau mai nou (recomandat LTS).
- **PostgreSQL**: 12+ (pentru JSONB, SERIAL, etc.).
- **npm**: vine cu Node.js.

### Instalare Node.js

- **Windows / macOS**: descarcă instalatorul de pe [nodejs.org](https://nodejs.org/) (LTS).
- **Linux (Debian/Ubuntu)**:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- Verificare: `node -v`, `npm -v`.

### Instalare PostgreSQL

- **Windows**: [PostgreSQL installer](https://www.postgresql.org/download/windows/).
- **macOS**: `brew install postgresql@15` (sau altă versiune).
- **Linux (Debian/Ubuntu)**:
  ```bash
  sudo apt update
  sudo apt install postgresql postgresql-contrib
  sudo systemctl start postgresql
  sudo -u postgres createuser -P your_user   # opțional
  sudo -u postgres createdb ProconixDB
  ```

### Clone / copiere proiect

```bash
cd /path/to/workspace
# Dacă e din git:
# git clone <repo_url> node_proconix
cd node_proconix
```

### npm dependencies

```bash
npm install
```

Pachete principale: `express`, `pg`, `bcrypt`, `dotenv`, `multer`. Toate sunt în `package.json`.

---

## Variabile de mediu (.env)

Creează în rădăcina proiectului un fișier **.env** (nu se comite în git). Exemplu:

```env
# Server
PORT=3000
HOST=localhost

# PostgreSQL (prefix PG* sau DB_*)
PGHOST=localhost
PGPORT=5432
PGDATABASE=ProconixDB
PGUSER=postgres
PGPASSWORD=your_password

# Alternativ (același efect)
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=ProconixDB
# DB_USER=postgres
# DB_PASSWORD=your_password

# Onboarding token (pentru link-ul de înregistrare manager)
# Dacă lipsește, se folosește DB_NAME ca secret
ONBOARDING_SECRET=your-random-secret-string
```

**Notă**: `backend/server.js` și `backend/db/pool.js` încarcă `.env` din rădăcina proiectului (`path.resolve(__dirname, '../.env')`).

---

## Crearea bazei de date și a tabelelor

1. Creează baza (dacă nu există):
   ```bash
   sudo -u postgres psql -c "CREATE DATABASE ProconixDB;"
   # sau: createdb -U postgres ProconixDB
   ```

2. Rulează scripturile SQL în ordine (vezi **documentation/2-database.md**):
   ```bash
   psql -U postgres -d ProconixDB -f scripts/create_companies_table.sql
   psql -U postgres -d ProconixDB -f scripts/create_manager_table.sql
   psql -U postgres -d ProconixDB -f scripts/create_users_table.sql
   psql -U postgres -d ProconixDB -f scripts/setup_projects_and_assignments.sql
   psql -U postgres -d ProconixDB -f scripts/create_work_logs_table.sql
   psql -U postgres -d ProconixDB -f scripts/setup_qa_database.sql
   ```
   (Ajustează user-ul și baza dacă nu folosești `postgres` / `ProconixDB`.)

3. Verificare: deschide aplicația și accesează `http://localhost:3000/api/health` – ar trebui să vezi `connected: true`.

---

## Pornire aplicație (local)

```bash
npm start
# sau
node index.js
```

Aplicația pornește pe `http://HOST:PORT` (implicit `http://localhost:3000`). Frontend-ul este servit static din `frontend/`; API-ul este sub `/api`.

Pentru development cu auto-reload:

```bash
npm run dev
# (folosește nodemon – dacă e în package.json)
```

---

## Configurare PM2, Nginx, SSL (producție / VPS)

### PM2 (process manager)

1. Instalare globală: `npm install -g pm2`
2. Pornire:
   ```bash
   cd /path/to/node_proconix
   pm2 start index.js --name proconix
   ```
3. Salvare listă procese: `pm2 save`
4. Start la boot: `pm2 startup` (rulează comanda afișată de pm2)
5. Loguri: `pm2 logs proconix`, `pm2 logs proconix --err`
6. Restart: `pm2 restart proconix`

Variabile de mediu: pot fi setate în `ecosystem.config.js` (PM2) sau exportate în shell înainte de `pm2 start`.

### Nginx (reverse proxy)

Exemplu de server block pentru domeniul tău:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

După modificări: `sudo nginx -t` și `sudo systemctl reload nginx`.

### SSL (HTTPS)

- Folosește **Let's Encrypt** cu **Certbot**:
  ```bash
  sudo apt install certbot python3-certbot-nginx
  sudo certbot --nginx -d your-domain.com
  ```
- Certbot configurează automat Nginx pentru HTTPS și redirect 80 → 443. Reînnoire: `sudo certbot renew` (cron recomandat).

---

## Backup & restore DB

### Backup

```bash
# Backup complet (schema + date)
pg_dump -U postgres -d ProconixDB -F c -f proconix_backup_$(date +%Y%m%d).dump

# Sau SQL plain
pg_dump -U postgres -d ProconixDB > proconix_backup_$(date +%Y%m%d).sql
```

Recomandat: copiază fișierul de backup într-un storage extern (S3, alt server, etc.).

### Restore în caz de eroare

```bash
# Din format custom (-F c)
pg_restore -U postgres -d ProconixDB -c proconix_backup_YYYYMMDD.dump

# Din SQL
psql -U postgres -d ProconixDB < proconix_backup_YYYYMMDD.sql
```

**Atenție**: la restore, dacă baza există deja, poți avea conflicte (ex. „relation already exists”). Pentru o bază goală: `dropdb ProconixDB`, `createdb ProconixDB`, apoi restore.

---

## Deployment steps

1. **Pe server**: clone sau upload cod (ex: `git pull` sau rsync/scp).
2. **Instalare dependențe**: `npm ci` sau `npm install --production`.
3. **Configurare .env**: copiază `.env.example` în `.env` și completează valorile pentru producție (DB, PORT, ONBOARDING_SECRET).
4. **Migrări DB** (dacă există): rulează scripturi SQL noi sau migrări.
5. **Restart aplicație**:
   ```bash
   pm2 restart proconix
   # sau
   pm2 reload proconix
   ```
6. **Verificare**: `curl https://your-domain.com/api/health` și test rapid în browser.

### Comenzi pentru update / restart

```bash
cd /path/to/node_proconix
git pull
npm install
pm2 restart proconix
pm2 logs proconix --lines 50
```

---

*Păstrează documentația actualizată la schimbări de env, scripturi sau infrastructură.*
