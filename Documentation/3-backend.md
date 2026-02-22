# 3. Documentație backend

## Lista endpoint-urilor API (API Documentation)

Base URL: `/api`. Toate răspunsurile sunt JSON, cu excepția `GET /api/dashboard/:module` care returnează HTML.

---

### Health

| Method | Route | Auth | Descriere |
|--------|--------|------|-----------|
| GET | /api/health | — | Verifică conectivitatea la baza de date. Returnează `{ status, connected, database, message }`. |

---

### Companies

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| POST | /api/companies/create | — | body: name, industry_type, ... | Company creată (id, etc.) |

---

### Onboarding (pentru register_manager)

| Method | Route | Auth | Parametri | Returnat |
|--------|--------|------|-----------|----------|
| GET | /api/onboarding/company | token (query sau Bearer) | token=xxx | `{ success, company_id }` sau 401 |

---

### Managers

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| POST | /api/managers/create | — | body: company_id, name, surname, email, password, ... | Manager creat, success |
| POST | /api/managers/login | — | body: email, password | success, manager_id, email, company_id, name, surname; sau 401 |

---

### Auth (validare sesiune manager)

| Method | Route | Auth | Headers | Returnat |
|--------|--------|------|---------|----------|
| GET | /api/auth/validate | requireManagerAuth | X-Manager-Id, X-Manager-Email | valid, company_name, manager { id, company_id, name, surname, email, active } |

---

### Projects (Manager)

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| POST | /api/projects/create | Manager | body: name, address, description, start_date, ... | Project creat |
| GET | /api/projects/list | Manager | — | success, projects[] (id, name/project_name, address, ...) |
| GET | /api/projects/:id | Manager sau Operative | id (path) | Detalii proiect (company check) |
| PUT | /api/projects/:id/update | Manager | id (path), body: name, address, ... | Success |
| PUT | /api/projects/:id/deactivate | Manager | id (path) | Success |
| GET | /api/projects/:id/assignments | Manager | id (path) | Lista assignments (user, role) |
| POST | /api/projects/:id/assign | Manager | id (path), body: user_id, role? | Assignment creat |
| DELETE | /api/projects/assignment/:assignmentId | Manager | assignmentId (path) | Success |

---

### Operatives (Manager – CRUD utilizatori companie)

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| GET | /api/operatives | Manager | — | Lista operativi/supervizori (company) |
| POST | /api/operatives/add | Manager | body: firstName, surname, email, role, active | User creat |
| PATCH | /api/operatives/:id | Manager | id (path), body: name, email, role, active | Success |
| DELETE | /api/operatives/:id | Manager | id (path) | Success |

### Operatives (Login / setare parolă – fără auth)

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| POST | /api/operatives/login | — | body: email, password | Session / token pentru operative |
| POST | /api/operatives/login-temp | — | body: email, temp_password | Login temporar |
| POST | /api/operatives/set-password | — | body: email, token, new_password | Success |

### Operatives (Dashboard – sesiune operativ)

| Method | Route | Auth | Parametri | Returnat |
|--------|--------|------|------------|----------|
| GET | /api/operatives/me | Operative | — | Profil operativ |
| POST | /api/operatives/work-hours/clock-in | Operative | — | Success |
| POST | /api/operatives/work-hours/clock-out | Operative | — | Success |
| GET | /api/operatives/work-hours/status | Operative | — | Status curent |
| GET | /api/operatives/work-hours/weekly | Operative | — | Ore săptămânale |
| GET | /api/operatives/project/current | Operative | — | Proiect curent (assignat) |
| GET | /api/operatives/tasks | Operative | — | Lista task-uri |
| POST | /api/operatives/issues | Operative | multipart (file) + fields | Issue creat, file_url injectat |
| POST | /api/operatives/uploads | Operative | multipart (file) + fields | Document upload, file_url injectat |
| GET | /api/operatives/work-log | Operative | — | Work logs ale operativului |
| POST | /api/operatives/work-log/upload | Operative | multipart | Upload fișier work log |
| POST | /api/operatives/work-log | Operative | body: job_display_id, worker_name, ... | Work log creat |

---

### Work Logs (Manager)

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| GET | /api/worklogs | Manager | query: worker, dateFrom, dateTo, project, status, search | Lista work logs (company) |
| GET | /api/worklogs/workers | Manager | — | Lista workers pentru filtru |
| POST | /api/worklogs | Manager | body: ... | Work log creat (dacă există flow) |
| GET | /api/worklogs/:id | Manager | id (path) | Detalii job |
| PATCH | /api/worklogs/:id | Manager | id (path), body: quantity, unit_price, total | Job actualizat, edit_history |
| POST | /api/worklogs/:id/approve | Manager | id (path) | Status → approved |
| POST | /api/worklogs/:id/reject | Manager | id (path) | Status → rejected |
| POST | /api/worklogs/:id/archive | Manager | id (path) | archived = true |
| POST | /api/worklogs/archive-bulk | Manager | body: ids[] | Mai multe joburi arhivate |

---

### Quality Assurance (Templates & Jobs) – Manager

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| GET | /api/templates | Manager | — | Lista template-uri (id, name, steps, createdAt, createdBy) |
| GET | /api/templates/:id | Manager | id (path) | Un template cu pași |
| POST | /api/templates | Manager | body: name, steps[] | Template creat (201) |
| PUT | /api/templates/:id | Manager | id (path), body: name, steps[] | Template actualizat |
| DELETE | /api/templates/:id | Manager | id (path) | 204 |
| GET | /api/jobs/next-number | Manager | query: projectId | { jobNumber } |
| GET | /api/jobs | Manager | query: projectId | Lista joburi pentru proiect |
| GET | /api/jobs/:id | Manager | id (path) | Un job (cu templateIds, workerIds, status, etc.) |
| POST | /api/jobs | Manager | body: projectId, jobNumber?, status, costType, floor, location, templateIds[], workerIds[], ... | Job creat (201) |
| PUT | /api/jobs/:id | Manager | id (path), body: status, ... | Job actualizat |
| DELETE | /api/jobs/:id | Manager | id (path) | 204 |

---

### Dashboard (HTML partials)

| Method | Route | Auth | Parametri | Returnat |
|--------|--------|------|-----------|----------|
| GET | /api/dashboard/:module | Manager | module: project-overview, projects, operatives, worklogs, task-management, ... | HTML partial pentru modulul respectiv |

---

### Subscriptions / Contact

- **Subscriptions**: placeholder routes sub `/api/subscriptions` (See Plans).
- **Contact**: `/api/contact` – callback request (formular contact).

---

## Middleware necesar (auth, validation)

| Middleware | Fișier | Utilizare |
|------------|--------|-----------|
| requireManagerAuth | requireManagerAuth.js | Header-e `X-Manager-Id`, `X-Manager-Email`; verifică în DB că managerul există și e active. Pune `req.manager`. |
| requireOperativeAuth | requireOperativeAuth.js | Verifică sesiunea operativului (cookie sau token). Pune `req.user` (sau echivalent). |
| requireManagerOrOperativeAuth | requireManagerOrOperativeAuth.js | Acceptă fie manager (headers), fie operativ (session); folosit la GET project by id. |
| — | express.json(), express.urlencoded | Parsare body JSON/form. |
| uploadIssueFile, uploadDocumentFile, uploadWorklogFile | uploadMiddleware.js | Multer pentru upload fișiere; injectFileUrl injectează URL-ul fișierului în req.body. |

---

## Controller & Service Overview

| Controller | Responsabilitate principală |
|------------|-----------------------------|
| companyController | Creare companie (POST /api/companies/create). |
| managerController | Creare manager (după onboarding), login manager (email + parolă, bcrypt). |
| authRoutes (inline) | GET /api/auth/validate – returnează company_name și manager dacă header-ele sunt valide. |
| projectsController | CRUD proiecte (company_id din req.manager), list, getOne, create, update, deactivate, getAssignments, assign, removeAssignment. |
| operativeController | CRUD operativi (list, add, update, delete), login operative, set-password. |
| operativeDashboardController | getMe, clockIn/clockOut, workHours status/weekly, getCurrentProject, reportIssue, uploadDocument, getTasks, getMyWorkLogs, workLogUpload, createWorkLog. |
| worklogsController | list (cu filtre), workers, getOne, update (edit quantity/price/total + edit_history), approve, reject, archive, archiveBulk, create. |
| qaController | listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate; listJobs, getJob, getNextJobNumber, createJob, updateJob, deleteJob. Helpers: getStatusIdByCode, getCostTypeIdByCode, getFloorIdByCode, assertProjectAccess. |
| dashboardRoutes | Returnează HTML pentru fiecare modul (project-overview, projects, operatives, worklogs, placeholders pentru task, material, risk, plants, accounting, reports, complains, issues). |

Logica de business este în controller-e: validare input, interogări DB, formatare răspuns. Nu există un strat separat de „service” – controller-ele folosesc direct `pool` din `db/pool`.

---

## Autentificare & sesiuni

### Manager

- **Login**: POST /api/managers/login → răspuns conține id, email, company_id, name, surname.
- **Stocare**: frontend salvează în `localStorage` (sau sessionStorage) sub cheia `proconix_manager_session` un obiect `{ manager_id, email, company_id, name, surname }` (sau similar).
- **Header-e**: la fiecare request protejat, frontend trimite `X-Manager-Id` și `X-Manager-Email`. Backend nu folosește cookie pentru manager.
- **Validare**: GET /api/auth/validate cu aceste header-e; middleware requireManagerAuth verifică în tabelul `manager` (id, email, active = true).

### Operative

- **Login**: POST /api/operatives/login (sau login-temp) → server returnează token sau setează cookie de sesiune (implementarea exactă depinde de cod).
- **Protecție**: requireOperativeAuth citește cookie/token și pune utilizatorul în req pentru controller-e dashboard operativ (work-hours, tasks, work-log, issues, uploads).

### Onboarding (register_manager)

- **Token**: după crearea companiei, se generează un token (JWT sau signed) care conține `company_id`.
- **GET /api/onboarding/company?token=xxx**: returnează company_id dacă token-ul e valid; pagina register_manager folosește company_id la POST /api/managers/create.

---

## Middleware de protecție a rutei

- **requireManagerAuth**: obligatoriu pentru /api/auth/validate, /api/projects/* (exceptând eventual getOne dacă e partajat), /api/operatives (CRUD), /api/worklogs/*, /api/templates, /api/jobs, /api/dashboard/:module.
- **requireOperativeAuth**: pentru /api/operatives/me, work-hours/*, project/current, tasks, issues, uploads, work-log.
- **requireManagerOrOperativeAuth**: pentru GET /api/projects/:id (manager vede orice proiect al companiei; operativ doar proiectul la care e asignat).
- **Fără auth**: /api/health, /api/companies/create, /api/onboarding/company, /api/managers/create, /api/managers/login, /api/operatives/login, login-temp, set-password.

---

*Actualizează documentația la adăugarea de endpoint-uri sau middleware.*
