# Plan de Audit Node.js – Proconix

## Ce face fiecare script

| # | Script | Descriere |
|---|--------|------------|
| 1 | `1-process-resources.sh` | Procese Node (ps aux \| grep node), porturi, sugestie htop/top |
| 2 | `2-code-eslint.sh` | ESLint pe backend – variabile nefolosite, cod mort, warnings |
| 3 | `3-database-audit.sql` | PostgreSQL: \dt, seq_scan/idx_scan, indexuri, tabele cu multe seq_scan |
| 4 | `4-dependencies.sh` | npm outdated + npm audit (vulnerabilități) |
| 5 | `5-ports-phantom.sh` | lsof pe portul app, PIDs Node, identificare blocaje |
| 6 | `6-pm2-check.sh` | pm2 list, recomandare --max-memory-restart |
| 7 | `7-RAPORT-FINAL.md` | Șablon raport: procese fantomă, cod, DB, dependențe, prioritizare |

## Cum rulezi auditul

### Pe VPS (după SSH)

```bash
cd /var/www/proconix   # sau path-ul tău

# Procese și resurse
bash scripts/audit/1-process-resources.sh

# Porturi și procese fantomă (PORT_APP=3000 implicit)
PORT_APP=3000 bash scripts/audit/5-ports-phantom.sh

# PM2
bash scripts/audit/6-pm2-check.sh

# Dependențe
npm run audit:deps
```

### Cod (ESLint) – local sau VPS

```bash
npm install
npm run lint
# sau
bash scripts/audit/2-code-eslint.sh
```

### Baza de date (PostgreSQL)

```bash
psql -U postgres -d ProconixDB -f scripts/audit/3-database-audit.sql
```

### Toate verificările (fără DB)

```bash
npm run audit:all
# Rapoarte în scripts/audit/reports/audit-YYYYMMDD-HHMM.txt
```

## Clinic.js (profilare CPU / memory leak)

Rulează aplicația cu Clinic pentru a identifica funcții care consumă mult CPU sau memory leak:

```bash
npm install -g clinic
clinic doctor -- node index.js
# Oprește cu Ctrl+C; se generează raport HTML.
```

## PM2 cu limită memorie

Pentru a restarta automat la consum excesiv de RAM:

```bash
pm2 start ecosystem.config.cjs
# sau
pm2 start index.js --name proconix --max-memory-restart 500M
pm2 save
```

Configurația este în `ecosystem.config.cjs` (max_memory_restart: '500M').

## Prioritate acțiuni (din raport final)

1. **Înaltă:** Procese fantomă, port blocat, vulnerabilități critice, PM2 max_memory_restart.
2. **Medie:** ESLint warnings, indexuri DB, pachete outdated.
3. **Scăzută:** Tabele nefolosite (după verificare), refactor CPU-heavy.
