# Backend & logică API – aplicație mobilă (echivalent Operative Dashboard)

Ghid pentru **React Native** (sau orice client) care consumă aceleași endpoint-uri ca `frontend/js/operative_dashboard.js`. Base URL exemplu: `https://<host>`.

---

## 1. Autentificare operativ

### 1.1 Token

- După login operativ, stocați token-ul returnat.
- La request-uri autentificate: header **`X-Operative-Token: <token>`**.
- Pe web token-ul e în `localStorage` / `sessionStorage` cheie `proconix_operative_token` (echivalent în RN: SecureStore / EncryptedStorage).
- **`credentials: 'include'`** pe web; pe mobil nu e obligatoriu dacă nu folosiți cookie-uri de sesiune – token-ul în header e suficient dacă API e configurat astfel.

### 1.2 Sesiune / utilizator

| Metodă | Path | Rol |
|--------|------|-----|
| `GET` | `/api/operatives/me` | Profil, nume afișat, flags (ex. cont activ). La **403** cu mesaj/code dezactivare → arătați ecran „Cont dezactivat”. |

### 1.3 Logout

- Ștergere token local + navigare la ecran login (endpoint logout dedicat poate lipsi – pe web se golește storage și redirect `/`).

---

## 2. API principal operativ (`/api/operatives`)

Prefix: **`/api/operatives`**. Toate rutele de mai jos (exceptând login) necesită **`requireOperativeAuth`** → header token.

### 2.1 Pontaj (Clock)

| Metodă | Path | Body / query | Răspuns tipic |
|--------|------|--------------|----------------|
| `GET` | `/work-hours/status` | — | `success`, `clockedIn`, `current` (înregistrare deschisă cu `clock_in`), eventual istoric scurt |
| `POST` | `/work-hours/clock-in` | JSON: poate include `project_id` sau câmpuri legate de proiect (vezi controller) | succes / eroare |
| `POST` | `/work-hours/clock-out` | id înregistrare sau dedus din sesiune | succes / eroare |
| `GET` | `/work-hours/weekly` | — | total săptămână + breakdown pe zile (pentru barele „This Week”) |

**Logică UI**: dacă `clockedIn` → ascundeți Clock In, arătați Clock Out și mesaj cu ora clock-in; invers când nu e pontat.

---

### 2.2 Proiect curent

| Metodă | Path | Rol |
|--------|------|-----|
| `GET` | `/project/current` | Proiectul asignat operativului (nume, adresă, date, descriere). Gol sau 404 tratat pe client cu mesaj neutru. |

Reîncărcați după schimbări de asignare (sau la focus app).

---

### 2.3 Task-uri

| Metodă | Path | Note |
|--------|------|------|
| `GET` | `/tasks` | Listă task-uri (planning + legacy). Fiecare: `id`, `title`/`name`, `status`, `deadline`, `source` (`planning` / `legacy`), `priority`, etc. |
| `GET` | `/tasks/:taskId?source=<planning\|legacy>` | Detaliu complet pentru ecran modal (inclus `confirmation_photos`, descriere, note). |
| `PATCH` | `/tasks/:taskId` | JSON: actualizare status (ex. decline, in progress, complete) – vezi payload în `operative_dashboard.js` (`patchTaskAction`). |
| `POST` | `/tasks/:taskId/photos` | **Multipart**: `file` + middleware injectează `file_url` în body pentru handler. Max poze conform serverului; UI limitează la 10. |

**Logică**: la PATCH reușit, reîncărcați listă + detaliu deschis.

---

### 2.4 Issues & uploaduri generale

| Metodă | Path | Body |
|--------|------|------|
| `POST` | `/issues` | **Multipart**: `title`, `description`, `file` (opțional), + `file_url` injectat după upload |
| `POST` | `/uploads` | **Multipart**: fișier + metadata (descriere) – factură / booking |

---

### 2.5 Work log

| Metodă | Path | Rol |
|--------|------|-----|
| `GET` | `/work-log` | Lista intrărilor mele |
| `POST` | `/work-log/upload` | Multipart: încărcare fișier work log (înainte de create dacă e cazul) |
| `POST` | `/work-log` | JSON: creare intrare (worker, project, work type, sume, description, paths fișiere, metadata time sheet / price work) |
| `POST` | `/work-log/:id/send-invoice-copy` | Trimite email copie factură (după submit) |
| `POST` | `/work-log/:id/archive` | Arhivează intrarea |

**Work types** (web apelează `GET /api/operatives/work-types` – verificați în `operativeDashboardController.js` dacă ruta e montată; în caz contrar UI folosește **fallback** local listă de stringuri).

**PDF / rapoarte**

| Metodă | Path | Rol |
|--------|------|-----|
| `POST` | `/timesheet/generate` | Generează PDF time sheet din payload (perioadă, job-uri) |
| `POST` | `/work-report/generate` | Varianta work report (vezi diferențe în controller) |

Trimiteți `Content-Type: application/json` cu token.

---

### 2.6 QA – Price work booking

| Metodă | Path | Rol |
|--------|------|-----|
| `GET` | `/qa/assigned-jobs` | Job-uri QA atașate operativului (pentru Price work builder): pași, cantități rămase, dovezi foto |

Submit booking: de obicei prin **POST work-log** sau endpoint dedicat în fluxul existent – urmăriți `operative_dashboard.js` (form `#op-form-pwb-job`, submit handler).

---

## 3. Site Chat (`/api/site-chat`)

Header: același **`X-Operative-Token`** (middleware `requireManagerOrOperativeAuth`).

| Metodă | Path | Rol |
|--------|------|-----|
| `GET` | `/room?project_id=` optional | Rezolvă `project_id` și nume proiect pentru cameră |
| `GET` | `/messages?project_id=&limit=&since=` | Mesaje + pentru `material_request` include array `photos` |
| `POST` | `/messages` | JSON (`type: text|material_request`, `text`, `project_id`, câmpuri request) **sau** `multipart/form-data` pentru `type: file` + câmp `file` |
| `PATCH` | `/messages/:messageId/status` | JSON: `status`, `project_id` |
| `PATCH` | `/messages/:messageId/complete` | JSON: `project_id` |
| `DELETE` | `/messages/:messageId?project_id=` | Șterge mesajul propriu (non-system) |
| `POST` | `/messages/:messageId/photos` | Multipart: poză pentru cerere materiale |
| `GET` | `/notifications?project_id=` | Notificări |
| `PATCH` | `/notifications/read-all` | JSON: `project_id` – marchează citit |

**Polling**: web reîncarcă la ~5s; pe mobil folosiți interval similar sau WebSocket dacă îl adăugați server-side.

**Fișiere statice**: URL-urile din chat (ex. `/uploads/documents/...`) trebuie încărcate cu același host + eventual același token dacă protejați static assets (în web sunt `express.static` publice – verificați producția).

---

## 4. Documente digitale (semnare)

| Metodă | Path | Auth |
|--------|------|------|
| `GET` | `/api/documents/operative/inbox` | Header token operativ (vezi `apiDocuments` în JS – același `X-Operative-Token`) |

Răspuns: listă documente cu `id`, `title`, `assignment_deadline` etc. Navigare la ecran nativ de semnare sau WebView către `operative_document_sign.html?id=...`.

---

## 5. Drawing Gallery (`/api/drawing-gallery`)

Auth: **`requireManagerOrOperativeAuth`** – același token operativ (sau mecanism echivalent dacă backend cere și manager – în practică operativul e suportat).

Flux tipic (din JS):

1. `GET /projects/:projectId/disciplines`
2. `GET /projects/:projectId/disciplines/:discipline/categories`
3. `GET /projects/:projectId/disciplines/:discipline/categories/:category/drawings`
4. `GET /series/:seriesId` (detaliu serie)
5. Fișier: `GET /versions/:versionId/file` (blob/PDF) și opțional `?download=1`
6. `GET /versions/:versionId/meta`
7. `POST /versions/:versionId/public-share` – link partajare

`projectId` vine din proiectul curent al operativului.

---

## 6. Coduri de eroare & comportament

- **401**: sesiune expirată → login.
- **403** + mesaj/code dezactivare: ecran blocat cont dezactivat.
- **503** pe site chat: tabele lipsă – mesaj prietenos „feature indisponibilă”.
- **Rețea**: retry backoff pentru polling; păstrați cache local opțional pentru chat (web folosește `localStorage` fallback).

---

## 7. Fișiere server de referință

| Fișier | Conținut |
|--------|----------|
| `backend/routes/operativeRoutes.js` | Rute `/api/operatives/*` |
| `backend/controllers/operativeDashboardController.js` | Logică pontaj, proiect, tasks, work log, issues |
| `backend/routes/siteChatRoutes.js` | Site chat |
| `backend/controllers/siteChatController.js` | Mesaje, cereri materiale, notificări |
| `backend/routes/drawingGalleryRoutes.js` | Drawing gallery |
| `backend/utils/uploadMiddleware.js` | Multer + `injectFileUrl` pentru căi `/uploads/...` |

---

## 8. Checklist integrare mobilă

- [ ] Login operativ + persistare token + header pe toate call-urile  
- [ ] `/me` la cold start + gestionare dezactivare  
- [ ] Pontaj in/out + weekly  
- [ ] Proiect curent  
- [ ] Tasks list + detail + PATCH + photos multipart  
- [ ] Work log CRUD flow + upload + PDF generate endpoints  
- [ ] QA assigned jobs  
- [ ] Site chat room/messages/post/patch/complete/delete/photos + notifications  
- [ ] Documents inbox  
- [ ] Drawing gallery navigare + file/meta/share  
- [ ] Issues + Uploads multipart  
