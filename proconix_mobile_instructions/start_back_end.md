# Date backend – legare app mobilă React Native ↔ API Proconix (repo actual)

Document **înlocuiește checklist-ul generic** cu ce este **implementat astăzi** în acest codebase. Tot ce nu apare aici nu există în server (sau lipsește din rute); pentru producție proprie înlocuiește hostname-ul și eventual adaugă `/v1` doar dacă îl introduceți în infrastructură.

---

## 1. Acces rețea

| Aspect | Valoare în proiect |
|--------|---------------------|
| **Prefix API** | **`/api`** — **nu** există versiune tip `/v1` montată în `backend/server.js`. Operațiuni operative: **`/api/operatives`** + restul modulelor la fel ca web. |
| **Site marketing / landing (web)** | **[https://proconix.uk/](https://proconix.uk/)** — pagina publică Proconix (demo, register, operative quick access în UI). |
| **Acces alternativ la același site (IP)** | **`http://217.154.35.142/`** — același tip de conținut public; folosit când DNS/certificate nu sunt disponibile sau pentru test rapid. **Nu** înlocuiește automat TLS; pentru API pe mobil preferă **HTTPS** pe domeniu când e configurat. |
| **URL de bază API (producție) — candidați** | Dacă același proces Node servește frontend + API (ca în `server.js`), baza pentru client este **`<origin>/api`**, fără slash final pe „API root”: ex. **`https://proconix.uk/api`** sau **`http://217.154.35.142/api`**. Confirmă cu `GET .../api/health` de pe telefon/emulator (uneori nginx ascultă pe **80/443** și face proxy către Node pe **3000** intern — iOS/Android văd doar portul public). |
| **Port proces Node (repo)** | **`process.env.PORT` sau implicit `3000`** (`backend/server.js`). **`HOST`** implicit `localhost` — în producție trebuie **`0.0.0.0`** dacă ascultă direct (setare env pe server). |
| **Dev local** | **`http://127.0.0.1:3000/api`** (dacă PORT=3000). Schimbă portul dacă în `.env` ai alt `PORT`. |
| **Android emulator** → host PC | **`http://10.0.2.2:<PORT>/api`** (ex. `http://10.0.2.2:3000/api`). |
| **iOS simulator** | **`http://127.0.0.1:<PORT>/api`** sau IP LAN al laptopului. |
| **Telefon fizic pe același Wi‑Fi** | **`http://<IP-LAN-laptop>:<PORT>/api`** — firewall/router trebuie să permită conexia. |
| **HTTPS / certificate** | `proconix.uk` folosește HTTPS în mod normal; IP-ul publice poate fi HTTP. Codul aplicației nu impune certificate pinning. |
| **Staging separat** | Separare prin alt **base URL** + altă bază PostgreSQL — nu există staging dedicat în repo; e decizie de deployment. |

**Verificare rapidă**: `GET https://proconix.uk/api/health` sau `GET http://217.154.35.142/api/health` — răspuns JSON cu `status`, `connected`, `database` dacă API-ul e expus pe acel host.

**Nu există** în repo un fișier OpenAPI/Swagger generat automat; „contractul” e definit de rutele Express și controllere. Document paralel pentru checklist integrare: **`output/Roman_INPUT.md`** (completat parțial de echipă / Roman).

### 1.1 Exemplu `POST /api/operatives/work-log` (JSON minim acceptat de server)

Corp `application/json` (câmpuri folosite în `createWorkLog` — multe pot fi `null` omise):

```json
{
  "workType": "Drylining",
  "description": "Worked on boards in Block A.",
  "total": 500,
  "totalBeforeTax": 500,
  "totalAfterTax": 400,
  "quantity": null,
  "unitPrice": null,
  "block": null,
  "floor": null,
  "apartment": null,
  "zone": null,
  "photoUrls": [],
  "timesheetJobs": [],
  "priceWorkJobs": [],
  "invoiceFilePath": null
}
```

- **Cu time sheet**: `timesheetJobs` = array de obiecte `{ location, description, duration, duration_unit, stage, progress_pct, photos: ["/uploads/worklogs/..."] }` (căi după upload).
- **Cu price work QA**: `priceWorkJobs` = array de înregistrări booking; serverul validează cantități + atașează bloc `qa_price_work` în `timesheet_jobs` în DB.
- **Poze**: ordine recomandată — **`POST /api/operatives/work-log/upload`** (multipart, câmp **`file`**) → răspuns **`{ "success": true, "path": "/uploads/worklogs/<filename>" }`** → include acel string în `photoUrls` sau în `photos` pe job-uri timesheet, apoi POST work-log. Același pattern pentru PDF atașat: `invoiceFilePath` = `path` returnat de upload.

Detaliu flux: **`proconix_mobile_instructions/work_entry.md`**.

---

## 2. Autentificare

| Aspect | Implementare actuală |
|--------|----------------------|
| **Flux** | **Email + parolă** pentru operativ deja onboardinguit. **`POST /api/operatives/login`** body JSON: `{ "email": string, "password": string }`. |
| **Login prima dată** | **`POST /api/operatives/login-temp`** + **`POST /api/operatives/set-password`** — flux cu parolă temporară (vezi `operativeController.js`). Nu OTP/SSO în aceste rute. |
| **Ce returnează login-ul reușit** (`200`) | `{ "success": true, "token": "<opaque hex>", "user": { id, name, email, role, project_id } }`. **Un singur token** sesiune (opaque), **nu** JWT pair access/refresh. |
| **Expirare token** | **`SESSION_TTL_MS = 7 zile`** în memorie (`backend/utils/operativeSessionStore.js`). După TTL, sesiunea nu mai e validă → **401**. |
| **Refresh token** | **Nu există** endpoint de refresh; utilizatorul se **loghează din nou** pentru token nou. |
| **Logout server-side** | **`deleteSession` există în util**, dar **nu este expus** unei rute `POST /logout` pentru operativ în `operativeRoutes.js`. Logout-ul practic în app = **ștergi token-ul local**. |
| **Transmitere token la API** | Header **`X-Operative-Token: <token>`** sau **`Authorization: Bearer <token>`** (`requireOperativeAuth.js`). |

**Important**: sesiunile sunt în **memorie proces Node**. La **restart server**, toate sesiunile dispar — utilizatorii trebuie să se autentifice din nou (comportament dev/devops).

---

## 3. Contract API – minim pe zone app (în baza codului)

### 3.1 Login / user

| Metodă | Path | Rol |
|--------|------|-----|
| `POST` | `/api/operatives/login` | Login (vezi mai sus). |
| `POST` | `/api/operatives/login-temp` | Prima autentificare cu parolă temporară. |
| `POST` | `/api/operatives/set-password` | Setare parolă după login-temp. |
| `GET` | `/api/operatives/me` | Profil: `{ success, user: { id, name, email, company_id, project_id, role } }`. |

**403 cont dezactivat**: pentru rute cu `requireOperativeAuth`, dacă utilizatorul are `active_status === false`: `{ success: false, message: '...', code: 'account_deactivated' }` (mesaj configurat în middleware).

### 3.2 Proiect curent

| Metodă | Path |
|--------|------|
| `GET` | `/api/operatives/project/current` |

Structura exactă în JSON depinde de `getCurrentProject` în `operativeDashboardController.js` (success + obiect `project`: nume, adresă, trades, etc.). Folosit de dashboard pentru work log și context.

### 3.3 Task-uri

| Metodă | Path |
|--------|------|
| `GET` | `/api/operatives/tasks` |

**Paginare explicită în query**: **nu** apare în controller — se întoarce lista **completă** (legacy `tasks` + Task & Planning filtrate după numele operativului). Tipuri în răspuns: `source: 'legacy' | 'planning'`, plus câmpuri diferite între ele.

| Metodă | Path |
|--------|------|
| `GET` | `/api/operatives/tasks/:taskId?source=legacy|planning` |
| `PATCH` | `/api/operatives/tasks/:taskId` |
| `POST` | `/api/operatives/tasks/:taskId/photos` (multipart `file`) |

### 3.4 Work types

| Situație |
|----------|
| Dashboard-ul apelează **`GET /api/operatives/work-types`** în JS, dar **nu există** rută montată în `operativeRoutes.js` în snapshot-ul actual. În UI se folosește **fallback** hardcodat dacă API lipsește sau `project.current` furnizează **`trades`** ca etichete work type. |

Deci pentru mobil: ori implementați aceeași rută pe server, ori lista fallback + trades din `/project/current`.

### 3.5 Work logs (trimite intrare)

| Metodă | Path |
|--------|------|
| `GET` | `/api/operatives/work-log` |
| `POST` | `/api/operatives/work-log/upload` — multipart, câmp **`file`** → `{ success, path }` către `/uploads/worklogs/...` |
| `POST` | `/api/operatives/work-log` — JSON corp (vezi `createWorkLog` și `work_entry.md`) |
| `POST` | `/api/operatives/work-log/:id/send-invoice-copy` |
| `POST` | `/api/operatives/work-log/:id/archive` |
| `POST` | `/api/operatives/timesheet/generate` |
| `POST` | `/api/operatives/work-report/generate` |

**Body POST `/work-log`** (camelCase cum trimite frontend-ul): câmpuri inclusiv  
`workType`, `description`, `total`, `totalBeforeTax`, `totalAfterTax`, `quantity`, `unitPrice` (pot fi null),  
`photoUrls` (array string URI), **`timesheetJobs`** (array), **`priceWorkJobs`** (array înregistrări QA booking), **`invoiceFilePath`** (string path server după upload). Serverul construiește JSON `timesheet_jobs` inclusiv bloc `{ type: 'qa_price_work', entries }` dacă ai price work.

Detaliu pas cu pas: **`proconix_mobile_instructions/work_entry.md`**.

### 3.6 QA job-uri (price work booking)

| Metodă | Path |
|--------|------|
| `GET` | `/api/operatives/qa/assigned-jobs` |

### 3.7 Upload fișiere (limite Multer în repo)

| Flux | Middleware | Limită fișier |
|------|------------|----------------|
| Issue operative | `uploadIssueFile` | **10 MB** |
| Invoice/document generic (`/uploads`) | `uploadDocumentFile` | **15 MB** |
| Work log upload | `uploadWorklogFile` | **10 MB** |
| Fotografii confirmare task | `uploadTaskPhotoFile` | **8 MB** |

Toate sunt **multipart direct pe server**, fișier salvat pe disk, **`file_url` / path** în răspuns unde e cazul. **Nu** există în acest flux presigned S3 pentru operativ dashboard.

### 3.8 Site chat

**REST**, nu WebSocket în implementarea curentă; dashboard face **polling** periodic.

Montat sub **`/api/site-chat`**: room, messages GET/POST, PATCH complete/status, DELETE mesaj propriu, photos, notifications (vezi `backend/routes/siteChatRoutes.js`).

### 3.9 Drawing gallery / documente semnături

- **`/api/drawing-gallery/*`** — `requireManagerOrOperativeAuth`.
- **`/api/documents/operative/inbox`** — documente pentru semnat (header token operativ pentru clientul din `operative_dashboard.js`).

### 3.10 Health

| Metodă | Path |
|--------|------|
| `GET` | **`/api/health`** |

Răspuns `{ status, connected, database, message }` — folosit pentru ping DB (`testConnection`).

---

## 4. Format erori

Pattern frecvent (nu e uniform RFC 7807 peste tot):

```json
{ "success": false, "message": "Human readable..." }
```

Opțional:

- **`code`** — ex. `account_deactivated` la 403.
- La **404 API**: `{ "message": "API endpoint not found.", "path", "originalUrl", "method" }` (din `server.js`).

**401**: sesiune lipsă/expirată — mesaj tip „Session expired…”.  
**403**: acces interzis sau cont dezactivat (vezi mai sus).

---

## 5. Bază de date – perspectivă mobilă

| Aspect | În practică cu API-ul actual |
|--------|------------------------------|
| **ID-uri** | Majoritatea ID-uri în JSON sunt **numerice** (int) din Postgres (`tasks.id`, `work_logs.id`, mesaje chat `BIGSERIAL`, etc.). **Nu** depinde de UUID generate pe client pentru submit. |
| **Draft offline** | Serverul **nu** definește id-uri client pentru draft — orice strategie offline e strict în aplicația mobilă până la POST. |
| **Date/timp** | Răspunsuri folosesc tipic **ISO string** din PG/dates; nu există header care forțează timezone în middleware pentru operativ — tratează ca **UTC sau local serializat** și afișează în TZ utilizator. |
| **Conflict două device-uri** | **Nu** există logică dedicată de merge sau versioning în API-ul work log pentru conflicte; ultimul write câștigă la nivel de server pentru aceeași resursă dacă faci PATCH-uri distincte. |

---

## 6. Offline / sync

| Cerință checklist | În repo |
|-------------------|---------|
| **POST idempotent (`Idempotency-Key`)** | **Nu** implementat pentru work logs. |
| **Batch work logs din coadă** | **Nu** există endpoint batch dedicat. |
| **Dublu submit același log** | Fără idempotency, două POST-uri creează **două înregistrări** distincte (`job_display_id` diferit). |

Recomandare mobilă: idempotency **client-side** (nu retrimite același payload până nu primești răspuns sau folosește un UUID client doar ca deduplicare locală, nu ca ID server).

---

## 7. Securitate

| Element | Situație |
|---------|----------|
| **Certificate pinning** | Nu e cerut de codul server; politică client (RN) la alegere. |
| **Headers obligatorii** | Pentru rute protejate operativ: **`X-Operative-Token`** sau **`Authorization: Bearer`**. Nu există **`X-Api-Key`** global pentru operativ în middleware-ul citit. |
| **Tenant** | Izolare pe **`company_id`** din sesiune + date utilizator — nu header tenant separat pentru operativ. |

---

## 8. Minimum viable pentru `endpoints.ts` + tipuri + înlocuire mock-uri

1. **`API_BASE_URL`** (dev + prod).  
2. **Login** → salvează `token` → interceptor cu header auth.  
3. **`GET /api/operatives/me`** după login.  
4. Pentru work log: **`POST /work-log/upload`** + **`POST /work-log`** cu corpul din `work_entry.md` și `operativeDashboardController.js` (`createWorkLog`).  
5. **`GET /api/health`** pentru verificare conectivitate.

**Livrabil OpenAPI**: nu există în repo; poți genera ulterior cu un tool din rute sau menține acest fișier + `back_end.md`.

---

## 9. Fișiere sursă utile în repo

| Fișier |
|--------|
| `backend/server.js` — montare `/api`, `/api/health` |
| `backend/routes/operativeRoutes.js` |
| `backend/middleware/requireOperativeAuth.js` |
| `backend/utils/operativeSessionStore.js` |
| `backend/controllers/operativeDashboardController.js` |
| `backend/routes/siteChatRoutes.js` |
| `proconix_mobile_instructions/back_end.md` |
| `proconix_mobile_instructions/work_entry.md` |
