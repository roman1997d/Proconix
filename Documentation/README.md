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
- La **nou flux de business sau test**: actualizează `6-qa-testing.md` și, dacă e cazul, `7-business-product.md`.

---

## Modificări recente (rezumat consolidat)

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

**Actualizat:** 16/03/2026
