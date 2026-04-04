# Documentație Proconix

Acest folder conține documentația de arhitectură, bază de date, backend, frontend, instalare, QA și business. Păstrează totul **actualizat la fiecare schimbare majoră**.

---

## Cuprins

| Nr | Fișier | Conținut |
|----|--------|----------|
| 1 | [1-architecture.md](1-architecture.md) | Arhitectura generală, legătura frontend–backend–DB, flux de date, diagrama modulelor, flowchart/sequence (login, creare task) |
| 2 | [2-database.md](2-database.md) | ERD (Mermaid), schema tabelelor, câmpuri și restricții, indexuri, scripturi de creare și seed |
| 3 | [3-backend.md](3-backend.md) | Lista endpoint-urilor API (route, method, auth, parametri), controller overview, autentificare și middleware |
| 4 | [4-frontend.md](4-frontend.md) | Structura fișierelor (HTML, JS, CSS), ce script face fetch la ce endpoint, cum se încarcă datele, manual de utilizare (manager & operativ) |
| 5 | [5-installation-setup.md](5-installation-setup.md) | Setup local/VPS, Node.js, PostgreSQL, npm, variabile .env, PM2, Nginx, SSL, backup/restore DB, deployment |
| 6 | [6-qa-testing.md](6-qa-testing.md) | Test cases (login, CRUD proiecte, operatives, work logs, QA, dashboard operativ), loguri și debugging (PM2, Nginx, Node, frontend) |
| 7 | [7-business-product.md](7-business-product.md) | Scop și obiective, utilizatori țintă, roadmap/MVP vs viitor, plan monetizare (Free/Silver/Gold), strategie lansare |
| 8 | [8-recent-extras.md](8-recent-extras.md) | Extra recent: landing (typewriter, carusel hero, flux „How it works”, testimoniale, FAQ), dashboard iframe + touch, Site Snags double-tap, folder `Doc_Marketing_Suite` |
| 9 | [9-documents-digital-signatures-frontend-plan.md](9-documents-digital-signatures-frontend-plan.md) | Plan front-end modul Documente & semnături digitale: pagini, componente, state, API, validări, UX, checklist livrabile (vanilla vs React) |

---

## Diagrame

- **Arhitectură**: diagramă ASCII în `1-architecture.md` (browser → backend → DB).
- **Module**: tabel pagini/module și legătura cu backend/DB în `1-architecture.md`.
- **Flux**: sequence diagram (login manager, submit work log) în `1-architecture.md`.
- **ERD**: diagramă Mermaid (relații între tabele) în `2-database.md`.

Pentru diagrame Mermaid poți folosi: [Mermaid Live Editor](https://mermaid.live/) sau render în GitHub/GitLab.

---

## Sfaturi de întreținere

- La **adăugare rute API**: actualizează `3-backend.md` și, dacă e cazul, `4-frontend.md` (ce script face fetch la noul endpoint).
- La **schimbare schemă DB**: actualizează `2-database.md` (ERD, schema, scripturi) și `5-installation-setup.md` dacă apar noi scripturi.
- La **pagină sau modul nou**: actualizează `1-architecture.md` (tabel module) și `4-frontend.md` (structură, flux, manual).
- La **schimbări majore pe landing / iframe dashboard / Site Snags**: actualizează `8-recent-extras.md` (și rezumatul din acest README).
- La **nou flux de business sau test**: actualizează `6-qa-testing.md` și, dacă e cazul, `7-business-product.md`.

---

## Modificări recente (rezumat consolidat)

### Extra (landing, iframe dashboard, Site Snags, marketing doc)
- Detaliat în **[8-recent-extras.md](8-recent-extras.md)** — rezumat scurt:
  - **Landing:** typewriter pe titlu hero (3 fraze); carusel 3 slide-uri în fereastra produs; secțiune interactivă „How Proconix fits…”; testimoniale + FAQ; cutii software 3D Manager/Operative **eliminate**.
  - **Dashboard:** `iframeModuleSrc`, retry `postMessage` Site Snags, `min-height` iframe pe dispozitive touch.
  - **Site Snags:** double-tap pentru pin nou; `placeNewPinAtClient`.
  - **Marketing:** `Doc_Marketing_Suite/Proconix_Marketing_Suite.md`.

### Dashboard manager – Project Overview (date reale)
- **Stat cards**: Total Projects, Active Tasks (număr `planning_plan_tasks` pe planuri ale companiei), Operatives (număr din `/api/operatives`), Total project cost (sumă `work_logs.total`, ne-arhivate) – sursă `GET /api/dashboard/overview-stats`.
- **Operative activity today**: câți operativi au făcut **clock-in astăzi** (zi calendaristică server: `date_trunc` pe `CURRENT_TIMESTAMP`) și la ce proiect (ultimul clock-in din zi) – `GET /api/dashboard/operative-activity-today`; join `work_hours` + `users` + `projects` (nume proiect: `project_name` sau `name` după schemă).
- **Tasks due in the next 7 days**: task-uri planning cu deadline în următoarele 7 zile, excluzând `completed` – din `GET /api/dashboard/overview-lists`.
- **Unapproved work logs**: coadă până la 20 joburi neaprobate (`pending` / `edited` / `waiting_worker`), sortate de la cele mai vechi (`COALESCE(submitted_at, created_at)`); câmp `is_stale` dacă au peste 7 zile (badge UI). Răspuns: `worklogs_unapproved_queue`; `worklogs_unapproved_over_7_days` = subset doar `is_stale` (compatibilitate).
- **Grafic QA (fost „Revenue Distribution”)**: doughnut cu **repartiția joburilor QA** după tip cost (`qa_cost_types`: day / hour / price / none), pe proiectele companiei – date în `overview-stats` (`qa_job_cost_by_type`); randare în `dashboard_manager.js` (`updateQaWorkTypePieChart`). **Activity Overview** (line chart) rămâne placeholder/demo până la conectare la date reale.
- **Eliminat**: secțiunea statică **Recent Activity** din HTML-ul Project Overview.

### Profil manager & companie (dashboard)
- **Profile Settings**: iframe `Profile_Settings.html` – `GET /api/managers/me`, `PATCH /api/managers/phone` (dacă există coloana `manager.phone`), `POST /api/managers/change-password`.
- **My Company Settings**: iframe `my_company_settings.html` – `GET /api/companies/me` (rând complet din `companies`); **Add manager** – `POST /api/managers/invite` (`manager_type`: `general` | `site`, `email`, `project_id` obligatoriu pentru site); UI în engleză.
- Sidebar: intrări `profile-settings`, `my-company-settings` în `dashboard_manager.html`; navigare în `dashboard.js`.

### Manager dashboard – sidebar stânga, mobil, fără footer pe ecrane mici
- **Sidebar fix stânga**: rail îngust cu **iconuri mereu vizibile**; pe **hover** sau **focus-within** (tastatură) se extinde cu text (`dashboard_manager.css` – tranziții ~0,25s). Pe **ecrane fără hover** dar ≥992px (ex. tabletă mare): meniu lățime completă cu etichete.
- **Mobil / tabletă îngustă (< 992px)**: meniu **off-canvas din stânga**; buton **hamburger stânga sus**; overlay; `dashboard.js` – `setMobileSidebarOpen`, `aria-expanded`, `aria-controls="manager-sidebar"`.
- **Footer fix**: pe **≤ 991.98px** footer-ul dashboard manager este **ascuns** (`display: none` pe `#dashboard-app .dashboard-footer`); **`padding-bottom`** pe `.dashboard-content-wrap` setat la **0** ca să nu rămână bandă goală sub conținut.
- **Fișiere**: `dashboard_manager.html`, `dashboard_manager.css`, `dashboard.css`, `dashboard.js`.

### Task & Planning – layout pe toată zona iframe (modul Planning)
- **`Task_Planning.html`**: `html`/`body` cu înălțime 100% pentru iframe-ul din dashboard; **fără `max-width`** pe shell; grid principal (`tp-layout`) ocupă **înălțimea rămasă** sub header; cardul **Planning** (Gantt + filtre) are clasă **`tp-planning-panel`**: zona calendar (`tp-calendar-body`) cu **`flex: 1`** și scroll; Kanban limitat în înălțime cu scroll propriu.

### Site Snags – viewport tactil (tabletă / telefon)
- **`Site_Snags.html`**: **pan** cu un deget și **pinch-zoom** pe viewport-ul desenului (Pointer Events, `setPointerCapture`); zoom +/- și wheel rămân pe desktop; hint: „Drag or one finger to pan · Wheel or pinch to zoom”.

### Task & Planning – poze confirmare (manager ↔ operativ)
- **Operativ** (`operative_dashboard.html` + `operative_dashboard.js`): la click pe task se deschide modalul de detalii – UI în **engleză** (butoane **Decline**, **Mark in progress**, **Complete**; secțiune **Confirmation photos (n / 10)**; **Add photos (max. 10 total)**). Încărcare poze: `POST /api/operatives/tasks/:taskId/photos`; status: `PATCH /api/operatives/tasks/:taskId` cu `source` + `action`. Detalii + listă URL-uri: `GET /api/operatives/tasks/:taskId?source=legacy|planning`.
- **Manager** (`Task_Planning.html`): în modalul **Task details**, dacă task-ul are status **completed** și există poze încărcate de operativ, se afișează un grid de miniaturi (link la imagine la dimensiune completă) – date din `GET /api/planning/plan-tasks/:id/confirmation-photos` (join `operative_task_photos`, `task_source=planning`).

### Material Management, Planning, QA, geolocație, landing
- **Material Management**: `manage_material.html`, `/api/materials/*`, tabele `material_*`, `material_consumption`, forecast – vezi `material_backendplan.md`, `material_forecast_logic.md`.
- **Task & Planning**: `Task_Planning.html`, `/api/planning/*`, `planning_plans`, `planning_plan_tasks` (+ endpoint-ul de mai sus pentru vizualizare poze la task completat).
- **QA Job → Planning**: sync automat via `planning_plan_tasks.qa_job_id` (`scripts/alter_planning_add_qa_job_id.sql`).
- **Geolocație**: `projects.latitude/longitude`, `work_hours` clock geo (`alter_projects_add_location.sql`, `alter_work_hours_add_geolocation.sql`); validare ~0.01 mile la clock in/out.
- **Landing & contact**: `index.html`, `ContactUs.html` – meta, preconnect, `defer`, contact public.

### Administrare platformă Proconix (operator app)
- **Login:** `frontend/proconix_administration_login.html` → `POST /api/platform-admin/login` (tabel `proconix_admin`, bcrypt); sesiune în `localStorage` / `sessionStorage` (`proconix_platform_admin_session`: `id`, `email`, …).
- **Consolă:** `frontend/proconix_administration.html` → `GET /api/platform-admin/me` cu header-e `X-Platform-Admin-Id`, `X-Platform-Admin-Email`; meniu placeholder; **Sign out** șterge sesiunea.

### Scripturi & deploy (referință)
- Audit VPS: `scripts/audit/*`, `scripts/deploy-to-vps.sh`, `scripts/DEPLOY-VPS.md`, `ecosystem.config.cjs` (PM2).

---

### Work Logs, pontaje, PDF (PDFKit), arhivare & ștergere (update major)

#### Bază de date (`work_logs`)
- **`timesheet_jobs`** (JSONB, default `[]`): structură per job (locație, descriere, durată/unitate, stadiu, progres, **`photos`**: array de căi `/uploads/...` după upload pe server). Migrare: `scripts/alter_work_logs_add_timesheet_jobs.sql` (inclus în `scripts/create_work_logs_table.sql` pentru instalări noi).
- **`operative_archived`** (BOOLEAN), **`operative_archived_at`** (TIMESTAMPTZ): arhivare doar în perspectiva operativului (înregistrarea dispare din „My work entries”); managerul vede în continuare intrarea, cu badge și notă. Migrare: `scripts/alter_work_logs_add_operative_archived.sql`.
- API-urile operative/manager includ câmpurile `timesheetJobs`, `operativeArchived`, `operativeArchivedAt` în răspuns când coloanele există (fallback grațios dacă migrarea nu a rulat).

#### Backend
- **Generare PDF (server)**: **PDFKit** (Node), **fără** Puppeteer/HTML. Șablon unic: `backend/templates/pdfkit/proconixPdfTemplate.js` — *Time Sheet Report* și *Work Report*: header întunecat, card perioadă, tabel rezumat, listă joburi cu poze 2/pe rând sub fiecare job, footer „Generated by Proconix Work Reports” + **WEB : proconix.uk**. **Perioada** afișată ca **dd/mm/yy** (interval: `dd/mm/yy to dd/mm/yy`). În PDF, totalul monetar este **Total (before tax)** (`total_before_tax` din payload), nu după taxe.
- **Rute operative**: `POST /api/operatives/timesheet/generate`, `POST /api/operatives/work-report/generate` → `pdfKitReportsController.js`. Fișiere scrise sub `backend/uploads/worklogs/timesheets/` și `work-reports/`.
- **`POST /api/operatives/work-log`**: acceptă `timesheetJobs`, `photoUrls`; inserează `timesheet_jobs` în DB. Upload fișiere: `POST /api/operatives/work-log/upload` → căi `/uploads/worklogs/...`.
- **`POST /api/operatives/work-log/:id/archive`**: setează `operative_archived` pentru intrarea proprie a operativului.
- **Manager** **`DELETE /api/worklogs/:id`**: șterge rândul din DB și încearcă ștergerea fișierelor de pe disc pentru căi `/uploads/...` (factură/PDF, `photo_urls`, poze din `timesheet_jobs`), cu verificare sigură de path.

#### Frontend – operativ (`operative_dashboard.html` / `operative_dashboard.js`)
- **New Work Entry / Time Sheet Jobs Builder**: perioadă obligatorie (from/to); generare raport pontaj: preferă backend PDFKit; fallback jsPDF aliniat (inclusiv **Total (before tax)** și **dd/mm/yy** pentru perioadă). Pozele joburilor se încarcă pe server înainte de PDF; trimitere work log cu `timesheetJobs` și `photoUrls`.
- **My work entries**: buton **Archive** per intrare → `POST .../work-log/:id/archive`; click pe intrare pentru deschidere / descărcare raport unde e cazul.

#### Frontend – manager (`worklogs.js` / `worklogs.css`)
- **Job Details**: **Delete permanently** (confirmare) → `DELETE /api/worklogs/:id`; descărcare fișier factură/raport din `invoiceFilePath` real; poze grupate pe **`timesheetJobs`** (fallback listă plată `photoUrls`). Badge **Operative archived** + notă în detalii.

#### Admin platformă (`proconix_administration` – unde e implementat)
- Panouri reorganizate: **System & health** (operațiuni sistem) vs **Audit & logs** (jurnale/audit).
- **Proconix project on disk**: utilizare spațiu pe categorii (imagini, documente, altele).

#### Curățare cod vechi
- Eliminate șabloanele HTML Puppeteer din `backend/templates/pdf/` și fluxul `pdfReportsController` / `renderPdf`; dependența **puppeteer** scoasă din `package.json` unde nu mai e folosită.

**Actualizat:** 27/03/2026 (inclusiv `8-recent-extras.md`)
