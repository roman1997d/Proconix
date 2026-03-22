# 7️⃣ Raport final – Plan de Audit Node.js Proconix

După rularea scripturilor de audit, completează acest raport și prioritizează acțiunile.

---

## 1️⃣ Procese inutile / fantomă

| Descriere | Acțiune |
|-----------|---------|
| (ex: 3 procese node fără PM2) | `pkill -f "node index.js"` sau restart PM2 |
| | |

**Prioritate:** 🔴 Înaltă – poate bloca portul sau consuma RAM inutil.

---

## 2️⃣ Cod neoptimizat / warnings ESLint

| Fișier | Warning / problemă | Acțiune |
|--------|--------------------|---------|
| (ex: backend/server.js – variabilă nefolosită) | Eliminare variabilă / refactor |
| | |

**Prioritate:** 🟡 Medie – curățare la fiecare sprint.

---

## 3️⃣ Funcții cu consum mare CPU/RAM

| Unde (Clinic.js / profiler) | Recomandare |
|------------------------------|-------------|
| (ex: qaController listJobs – multe query-uri) | Cache, indexuri DB, paginare |
| | |

**Prioritate:** 🔴 Înaltă dacă afectează utilizatorii.

---

## 4️⃣ Tabele nefolosite în baza de date

| Tabel | seq_scan / idx_scan | Acțiune |
|-------|----------------------|---------|
| (ex: old_logs – 0 acces) | Arhivare sau ștergere după confirmare |
| | |

**Prioritate:** 🟢 Scăzută – după verificare că nu sunt referite în cod.

---

## 5️⃣ Dependențe vulnerabile sau depășite

| Pachet | Versiune / vulnerabilitate | Acțiune |
|--------|----------------------------|---------|
| (ex: express – CVE-xxx) | npm audit fix sau actualizare majoră |
| | |

**Prioritate:** 🔴 Înaltă pentru vulnerabilități; 🟡 pentru outdated.

---

## Prioritizare curățare / optimizare

1. **Imediat:** Procese fantomă, port blocat, vulnerabilități critice.
2. **Scurt:** PM2 `max_memory_restart`, indexuri DB pentru tabele cu multe seq_scan.
3. **Mediu:** ESLint warnings, pachete outdated.
4. **Lung:** Tabele nefolosite (după arhivare/backup), refactor funcții CPU-heavy.

---

*Raport generat în cadrul Planului de Audit Node.js – Proconix.*
