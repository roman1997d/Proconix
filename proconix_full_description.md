# Proconix – Descriere generală a proiectului

Rezumat al structurii, fluxurilor și legăturilor dintre frontend, backend și baza de date.

---

## 1. Ce este Proconix

Proconix este o aplicație web pentru **gestionarea proceselor de lucru** în construcții: companii, manageri, operativi (muncitori/supervizori), proiecte, work logs, task-uri și module de tip dashboard (QA, work logs, projects, operatives). Aplicația are două tipuri principale de utilizatori: **Manager** (companie, dashboard cu multe module) și **Operative** (dashboard simplu: clock in/out, task-uri, work log, issues).

---

## 2. Punctul de intrare și serverul

- **`index.js`** (rădăcină): doar `require('./backend/server.js')`. Pornește serverul Express.
- **`backend/server.js`**:
  - Încarcă `.env` și creează aplicația Express.
  - Middleware: `express.json()`, `express.urlencoded`.
  - **Rute API** montate sub `/api/...` (vezi mai jos).
  - **Static:** `express.static(frontendDir)` – servește tot ce e în `frontend/` (HTML, CSS, JS, imagini).
  - **Health:** `GET /api/health` – verifică conectivitatea la PostgreSQL.
  - **Uploads:** `GET /uploads/*` – fișiere încărcate (issues, documents) din `backend/uploads`.
  - Port: `process.env.PORT || 3000`, host: `process.env.HOST || 'localhost'`.

Concluzie: tot traficul trece prin același server; nu există un frontend separat (ex. React build), ci fișiere statice din `frontend/`.

---

## 3. Backend – structură

### 3.1 Baza de date

- **PostgreSQL**, pool în `backend/db/pool.js` (variabile: `PG*` sau `DB_*`, database implicit `ProconixDB`).
- **Scripturi SQL** în `scripts/`: tabele pentru companies, manager, users (operatives), projects, project_assignments, work_logs, work_hours, tasks, issues, uploads etc. Migrări și seed-uri (ex. `create_companies_table.sql`, `create_manager_table.sql`, `create_users_table.sql`, `create_projects_table.sql`, `create_work_logs_table.sql`).

### 3.2 Rute API (montate în server)

| Prefix | Fișier | Rol |
|--------|--------|-----|
| `/api/companies` | companyRoutes | Creare companie (înregistrare). |
| `/api/subscriptions` | subscriptionRoutes | Planuri (See Plans) – placeholder GET per plan. |
| `/api/contact` | contactRoutes | Cerere callback (contact). |
| `/api/dashboard` | dashboardRoutes | Conținut HTML pentru modulele Manager Dashboard (project-overview, projects, worklogs, operatives, etc.). Toate cer **manager autentificat**. |
| `/api/onboarding` | onboardingRoutes | GET company_id din token (pentru register_manager). |
| `/api/managers` | managerRoutes | POST create (înregistrare manager), POST login (autentificare manager). |
| `/api/auth` | authRoutes | GET validate – validare sesiune manager (X-Manager-Id, X-Manager-Email); returnează company_name și date manager. |
| `/api/operatives` | operativeRoutes | Listă operativi, add/patch/delete (manager); login, set-password, work-hours, tasks, issues, uploads, work-log (operative). |
| `/api/projects` | projectsRoutes | CRUD proiecte, assignments (manager); GET one (manager sau operative). |
| `/api/worklogs` | worklogsRoutes | Listă, filtre, approve/reject/archive, edit job, invoice (manager). |

### 3.3 Autentificare

- **Manager:** header-e `X-Manager-Id` și `X-Manager-Email`. Middleware `requireManagerAuth` verifică în DB că managerul există și este `active = true`; pune `req.manager` pe request.
- **Operative:** sesiune/token (ex. operative session store); middleware `requireOperativeAuth` pentru rutele de operative; `requireManagerOrOperativeAuth` pentru rute partajate (ex. GET project by id).

Sesiunea manager este stocată în **localStorage** sau **sessionStorage** (cheie `proconix_manager_session`) cu: `manager_id`, `company_id`, `name`, `surname`, `email`, `active`. La fiecare request către API-uri protejate, frontend-ul trimite aceste header-e (din `dashboard.js` – `getSessionHeaders()`).

---

## 4. Frontend – pagini și roluri

### 4.1 Pagini publice (fără login)

| Pagină | Cale | Scop |
|--------|------|------|
| **Home / Landing** | `index.html` | Alegere rol: „I'm Manager” → login_manager.html; „I'm Operative” → modal login operative pe aceeași pagină. Link-uri: Register a Company, See Plans, Contact. |
| **Register Company** | `register_company.html` | Formular înregistrare companie. La succes, backend returnează (sau trimite) un **onboarding token**; utilizatorul e redirecționat la register_manager.html (cu token în localStorage). |
| **See Plans** | `see_plans.html` | Afișare planuri (Free, Silver, Gold, Platinum); butoane către `/api/subscriptions/...` (placeholder). |
| **Manager Login** | `login_manager.html` | Email + parolă; „Keep me logged in” (localStorage vs sessionStorage). POST `/api/managers/login` → salvare sesiune → redirect la `dashboard_manager.html`. |
| **Register Manager** | `register_manager.html` | Se deschide după register company; citește token din localStorage, GET `/api/onboarding/company?token=...` pentru company_id. Formular: name, surname, email, password etc. POST `/api/managers/create` → după succes poate redirect la login sau dashboard. |

### 4.2 Manager Dashboard (după login manager)

| Pagină | Cale | Scop |
|--------|------|------|
| **Manager Dashboard** | `dashboard_manager.html` | Layout: sidebar (navigare module) + header (titlu, company name, user, logout) + zonă de conținut. La încărcare: GET `/api/auth/validate` (cu header-e sesiune). Dacă 401 → „Access denied”; dacă 200 → se afișează aplicația. Conținutul din zonă principală se încarcă dinamic: fie prin **fetch** la `GET /api/dashboard/:module` (HTML partial), fie pentru **Quality Assurance** prin **iframe** cu `Quality_Assurance.html`. |

**Module din sidebar (data-module):**

- project-overview, projects, project-builder, task-management, material-management, risk-management, operatives, worklogs, plants, accounting, resources-files, reports, complains, issues → conținut din **dashboardRoutes** (HTML generat în backend).
- **quality-assurance** → iframe `Quality_Assurance.html` (fără fetch la `/api/dashboard/quality-assurance`).

Scripturi încărcate pe dashboard: `dashboard_manager.js` (charts), `dashboard.js` (access control, sidebar, loadModule, operatives/worklogs/projects handlers), `projects.js`, `worklogs.js`.

### 4.3 Operative Dashboard (după login operative)

| Pagină | Cale | Scop |
|--------|------|------|
| **Operative Dashboard** | `operative_dashboard.html` | Acces după login operative (de pe index.html: email + parolă sau parolă temporară + set new password). Conținut: clock in/out, proiect curent, task-uri, work log, raportare issues, upload documente. API-uri cu `requireOperativeAuth`. |

### 4.4 Modul Quality Assurance

| Pagină | Cale | Scop |
|--------|------|------|
| **Quality Assurance** | `Quality_Assurance.html` | Modul QA: template-uri (pași, prețuri), joburi (detalii, cost, personnel), View Jobs (filtre, carduri, View/Edit/Delete). Date în **localStorage** (qa_templates, qa_jobs) cu strat **qaApi** pregătit pentru backend. Poate fi deschis: **standalone** (navigare directă) sau **în dashboard** (iframe din dashboard_manager; link „Dashboard” din QA face top.location către dashboard_manager). |

---

## 5. Legături între pagini (flux)

```
index.html (Home)
├── "I'm Manager"     → login_manager.html
│   └── Login OK     → dashboard_manager.html
│       └── Sidebar: Project Overview, Projects, Work Logs, Operatives, Quality Assurance (iframe), etc.
│       └── Logout   → index.html
├── "I'm Operative"  → modal login pe index.html
│   └── Login OK     → operative_dashboard.html
├── "Register a Company" → register_company.html
│   └── Success (+ token) → register_manager.html
│       └── POST create manager → (redirect login sau dashboard)
└── "See Plans"      → see_plans.html

Quality_Assurance.html
├── Deschis direct (URL) sau în iframe din dashboard_manager
└── "Dashboard"      → dashboard_manager.html (dacă e în iframe, top.location)
```

- **Manager:** index → login_manager → dashboard_manager. Din dashboard, toate modulele (inclusiv QA) sunt accesibile fără a părăsi dashboard_manager.
- **Operative:** index → login (modal) → operative_dashboard.
- **Înregistrare:** register_company → (token) → register_manager → (create manager) → login sau dashboard.

---

## 6. Componente frontend importante

- **dashboard.js:** verificare acces (validate), loadModule (fetch `/api/dashboard/:module` sau iframe pentru quality-assurance), setActiveItem, updateHeaderTitle, event handlers pentru operatives (add/delete/activate), projects (modals), worklogs (modals), history (pushState/popstate).
- **login_manager.js:** submit form → POST login → storeSession → redirect dashboard_manager.
- **register_manager.js:** loadCompanyFromToken (GET onboarding/company), submit → POST managers/create.
- **index.js (frontend):** modal login operative (email+password sau temp password + set password), redirect la operative_dashboard la succes.
- **projects.js:** inițializare modul Projects (listă, add/edit/details, assign operatives), apeluri la `/api/projects/*`.
- **worklogs.js:** modul Work Logs (passkey gate, filtre, listă, approve/reject/edit, invoice, archive), apeluri la `/api/worklogs/*`.
- **Quality_Assurance.html:** logică inline (qaApi, templates, jobs, View Jobs); fără script extern dedicat.

---

## 7. Componente backend importante

- **middleware:** requireManagerAuth, requireOperativeAuth, requireManagerOrOperativeAuth.
- **controllers:** companyController, managerController, operativeController, operativeDashboardController, projectsController, worklogsController; dashboardRoutes conține funcții care returnează HTML (getProjectOverviewHtml, getProjectsHtml, getOperativesHtml, getWorkLogsHtml, placeholder pentru celelalte module).
- **db/pool.js:** pool PostgreSQL și testConnection.

---

## 8. Rezumat tehnic

| Aspect | Detalii |
|--------|---------|
| **Stack** | Node.js, Express, PostgreSQL; frontend static (HTML/CSS/JS), fără framework SPA. |
| **Auth manager** | Session în localStorage/sessionStorage; header-e X-Manager-Id, X-Manager-Email; validare prin requireManagerAuth. |
| **Auth operative** | Session/token; requireOperativeAuth pe rutele de operative. |
| **Dashboard conținut** | HTML partiale din backend (GET /api/dashboard/:module) + excepție QA (iframe). |
| **QA** | Frontend-only (localStorage + qaApi); pregătit pentru backend (QA_CONFIG.useBackend, QA-BACKEND-API.md, qa_backend_action_plan.md). |

Acest document oferă o imagine de ansamblu pentru a înțelege cum funcționează Proconix și cum se leagă între ele index.js, componentele frontend și cele backend.
