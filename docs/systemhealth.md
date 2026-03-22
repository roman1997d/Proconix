# System & health — documentație

Panoul **System & health** din consola de administrare platformă (`proconix_administration.html`) afișează starea API-ului, a bazei de date, metrici de trafic, statistici PostgreSQL, indicii despre interogări lente și un viewer pentru *feature flags* din mediu.

---

## Fișiere implicate

| Fișier | Rol |
|--------|-----|
| `backend/lib/apiMetricsStore.js` | Stochează în memorie (în procesul Node) agregate **pe minut** pentru request-urile `/api`: timp mediu de răspuns, număr de erori 4xx/5xx, rate de eroare combinate. Maxim **30 de bucket-uri** (minute). |
| `backend/middleware/metricsMiddleware.js` | Middleware Express: pentru fiecare cerere către **`/api`**, măsoară durata până la `res.on('finish')` și înregistrează statusul HTTP în `apiMetricsStore`. |
| `backend/controllers/systemHealthAdminController.js` | Implementează `GET /api/platform-admin/system-health`: health DB, latency ping, pool `pg`, conexiuni PostgreSQL, slow queries, coadă (placeholder), feature flags. |
| `backend/routes/platformAdminRoutes.js` | Înregistrează ruta protejată `GET /system-health` (sub prefixul `/api/platform-admin`). |
| `backend/server.js` | Aplică `metricsMiddleware` după `express.json()` / `urlencoded`, astfel încât toate rutele `/api` să fie măsurate. La pornire, afișează în terminal banner-ul din `startupConsoleBanner.js`. |
| `backend/lib/startupConsoleBanner.js` | Generează **aceleași linii** ca log-ul de startup din terminal (URL-uri din `HOST`/`PORT`, status DB). Folosit și de `GET /system-health` în câmpul `console_banner.lines` pentru oglindire în UI. |
| `frontend/proconix_administration.html` | Markup pentru secțiunea **System & health**: carduri status, canvas grafic, tabele pool/PG/slow queries/feature flags, buton Refresh. |
| `frontend/js/proconix_administration_dashboard.js` | `loadSystemHealthPanel`, `drawSystemHealthChart` (canvas), polling la **30s** cât timp panoul este vizibil, handler navigare + Refresh. |
| `frontend/css/proconix_administration.css` | Stiluri pentru canvas și legenda graficului. |
| `Documentation/3-backend.md` | Tabel API — linie scurtă pentru endpoint-ul `system-health`. |

---

## Endpoint API

**`GET /api/platform-admin/system-health`**

- **Autentificare:** aceleași header-e ca restul consolei platformă: `X-Platform-Admin-Id`, `X-Platform-Admin-Email` (vezi `requirePlatformAdminAuth`).
- **Răspuns (succes):** JSON cu câmpuri precum:
  - `console_banner.lines` — array de stringuri, **identic** cu textul din terminal la startup (actualizat **live** pentru starea DB la fiecare request; URL-urile folosesc aceleași `HOST`/`PORT` ca serverul).
  - `uptime_seconds` — timp de la pornirea procesului Node.
  - `api.ok` — procesul răspunde (health logic).
  - `database.ok`, `database.latency_ms` — rezultat `SELECT 1` + timp round-trip.
  - `pool` — `totalCount`, `idleCount`, `waitingCount` (pool `pg`).
  - `pg_connections` — număr de sesiuni către baza curentă + `max_connections` (din `pg_settings`).
  - `metrics.buckets` — array de bucket-uri pe minut (vezi store), pentru grafic.
  - `metrics.description` — text explicativ pentru UI.
  - `queue` — `depth: 0`, `backend: "none"`, mesaj că nu există coadă de job-uri (Bull/Redis etc.) în această versiune.
  - `slow_queries` — rânduri cu query trunchiat, `calls`, `mean_ms` (sau echivalent pentru fallback).
  - `slow_queries_meta` — `source` (ex. `pg_stat_statements`, `pg_stat_activity`) și `note` explicativă.
  - `feature_flags` — listă din variabile de mediu și opțional JSON.

---

## Metrici API (timp / erori)

- Se colectează **doar** pentru path-uri care încep cu **`/api`**.
- Agregare **per minut calendaristic** (bucket unic per minut).
- **Erori:** se numără separat **5xx** și **4xx**; în UI / bucket există și **`error_rate_any_pct`** (4xx + 5xx).
- Datele sunt **în RAM** — se pierd la **restart** server și reflectă doar traficul de după pornire.

---

## Slow queries

1. Dacă extensia PostgreSQL **`pg_stat_statements`** este instalată și interogarea reușește: se returnează un top de statement-uri după **timp mediu de execuție** (limitat, query trunchiat).
2. Dacă extensia lipsește sau interogarea eșuează (permisiuni): fallback la **`pg_stat_activity`** — interogări **active** care rulează de mai mult de ~**1 secundă** (nu este istoric complet, ci „ce rulează acum”).

---

## Feature flags (viewer)

Citire **doar** din procesul Node curent:

- Orice variabilă de mediu al cărei nume începe cu **`FEATURE_`** sau **`PROCONIX_FLAG_`**.
- Opțional: **`FEATURE_FLAGS_JSON`** — JSON obiect; cheile devin intrări separate; dacă JSON-ul este invalid, apare o intrare de eroare de parsare.

Nu există în această versiune **editare** sau persistare a flag-urilor din UI — doar vizualizare.

---

## Interfața utilizator (admin)

- **Server log (terminal mirror):** container cu **înălțime fixă** (~13rem), scroll dacă textul e lung, font monospace, fundal închis — afișează `console_banner.lines` de la API.
- **Carduri:** API OK, Database OK + latency, Uptime proces, Queue depth (placeholder).
- **Grafic (canvas):** linie turcoaz = medie ms/minut; linie roșie = rată erori (4xx+5xx) %.
- **Liste:** pool `pg`, conexiuni PostgreSQL.
- **Tabel:** slow / expensive queries (conform sursei de mai sus).
- **Tabel:** feature flags (cheie, valoare, enabled, sursă).
- **Refresh** manual; **reîncărcare automată la 30s** doar cât timp secțiunea System & health este deschisă (polling oprit la navigare în altă secțiune).

---

## Limitări cunoscute

- Nu există **coadă reală** de job-uri în proiect — câmpul queue este informativ.
- Metricile nu sunt persistate pe disc și nu sunt agregate între mai multe instanțe (dacă rulezi mai multe procese Node).
- Graficul necesită trafic **`/api`** ca să arate date semnificative după pornire.

---

## Pornire / verificare rapidă

1. Pornește serverul (`npm start` sau echivalent).
2. Autentifică-te în consola platformă (`proconix_administration_login.html`).
3. Deschide **System & health** din meniu; folosește **Refresh** dacă e nevoie.
4. Pentru a umple graficul, generează câteva apeluri către API (ex. navigare în aplicație, health check, etc.).

---

*Document generat pentru modulul System & health — Proconix.*
