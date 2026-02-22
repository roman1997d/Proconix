# 1. Documentație de arhitectură și structură

## Arhitectura generală a aplicației

Proconix este o aplicație web **monolită** cu trei straturi:

- **Frontend**: HTML, CSS, JavaScript (pagini statice servite de Express, logică în JS).
- **Backend**: Node.js + Express (API REST, autentificare, business logic).
- **Baza de date**: PostgreSQL (persistență companii, manageri, utilizatori, proiecte, work logs, QA).

Comunicarea este **request/response**: browser-ul face request-uri HTTP la API; serverul interoghează DB și returnează JSON (sau HTML pentru partials).

---

## Cum sunt legate frontend, backend și baza de date

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BROWSER (Client)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐  ┌───────────┐ │
│  │ index.html  │  │ dashboard_  │  │ operative_       │  │ Quality_   │ │
│  │ register_*  │  │ manager.html│  │ dashboard.html   │  │ Assurance  │ │
│  │ login_*     │  │ + modules   │  │                  │  │ .html      │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘  └─────┬──────┘ │
│         │                │                   │                   │       │
│         │    fetch()     │    fetch()        │    fetch()        │       │
└─────────┼────────────────┼───────────────────┼───────────────────┼───────┘
          │                │                   │                   │
          ▼                ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    NODE.JS + EXPRESS (Backend)                          │
│  /api/health  /api/companies  /api/auth  /api/projects  /api/worklogs    │
│  /api/operatives  /api/templates  /api/jobs  /api/dashboard/:module     │
│         │                │                   │                   │       │
│  requireManagerAuth / requireOperativeAuth / onboarding token            │
└─────────┼────────────────┼───────────────────┼───────────────────┼─────┘
          │                │                   │                   │
          ▼                ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         POSTGRESQL (DB)                                  │
│  companies | manager | users | projects | project_assignments          │
│  work_logs | qa_templates | qa_jobs | qa_* lookup tables                │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Frontend → Backend**: `fetch()` la URL-uri `/api/...`; header-e opționale: `X-Manager-Id`, `X-Manager-Email` (manager) sau cookie/token pentru operative.
- **Backend → DB**: pool PostgreSQL (`pg`); fiecare controller folosește `pool.query()` sau servicii care îl folosesc.
- **Răspuns**: API returnează JSON (`res.json()`); erorile sunt tot JSON cu câmp `message`. Dashboard-ul încarcă și HTML partials via `GET /api/dashboard/:module`.

---

## Flux de date între module (exemplu: Dashboard → API → Controller → DB)

Exemplu: **Manager deschide lista de proiecte** în Manager Dashboard.

1. **Frontend** (`dashboard_manager.html` + `projects.js`): la încărcarea modulului "Projects", scriptul citește sesiunea din `localStorage` (`proconix_manager_session`), trimite `GET /api/projects/list` cu header-ele `X-Manager-Id` și `X-Manager-Email`.
2. **Backend** (`server.js` → `projectsRoutes`): ruta `GET /list` este protejată cu `requireManagerAuth`.
3. **Middleware** (`requireManagerAuth.js`): verifică header-ele, interoghează `manager` (id + email + active), încarcă `req.manager`; dacă e invalid returnează 401 JSON.
4. **Controller** (`projectsController.list`): folosește `req.manager.company_id`, face `SELECT ... FROM projects WHERE company_id = $1`, returnează lista în JSON.
5. **Frontend**: primește JSON, renderează tabelul de proiecte în DOM.

Alt exemplu: **Operativ trimite un work log**.

1. **Frontend** (`operative_dashboard.html` + logic work log): trimite `POST /api/operatives/work-log` cu body (job_display_id, worker_name, project, quantity, etc.) și sesiunea operativului (cookie/token).
2. **Backend** (`operativeRoutes`): ruta protejată cu `requireOperativeAuth`.
3. **Controller** (`operativeDashboardController.createWorkLog`): validează datele, inserează în `work_logs`, returnează 201 + job creat.

---

## Diagrama modulelor / paginilor (Module Diagram)

| Pagină / Modul              | Rol utilizator | Backend principal                    | DB / tabele principale        |
|-----------------------------|----------------|--------------------------------------|--------------------------------|
| **index.html**              | Vizitator      | —                                    | —                              |
| **register_company.html**   | Vizitator      | POST /api/companies/create           | companies                      |
| **register_manager.html**   | Vizitator      | GET /api/onboarding/company, POST /api/managers/create | manager, companies   |
| **login_manager.html**      | Manager        | POST /api/managers/login             | manager                        |
| **dashboard_manager.html** | Manager        | GET /api/auth/validate, GET /api/dashboard/:module, /api/projects/*, /api/operatives/*, /api/worklogs/* | manager, companies, projects, users, work_logs |
| **Modul Projects**          | Manager        | GET/POST/PUT /api/projects/list, create, :id/update, :id/assignments, assign | projects, project_assignments, users |
| **Modul Operatives**       | Manager        | GET/POST/PATCH/DELETE /api/operatives | users                          |
| **Modul Work Logs**        | Manager        | GET/POST/PATCH /api/worklogs, approve, reject, archive | work_logs                    |
| **Quality_Assurance.html** | Manager        | GET/POST/PUT/DELETE /api/templates, /api/jobs, GET /api/projects/list | qa_templates, qa_jobs, qa_* lookup, projects |
| **operative_dashboard.html**| Operativ       | POST /api/operatives/login, GET/POST /api/operatives/me, work-hours/*, tasks, work-log, issues, uploads | users, work_logs, work_hours, issues, etc. |
| **see_plans.html**         | Vizitator      | eventual /api/subscriptions          | —                              |

Legătura fiecărei pagini cu backend și DB: toate acțiunile persistente (CRUD, login, submit) trec prin API; API-ul folosește controller-e care citesc/scriu în PostgreSQL.

---

## Diagramă de flux (Flowchart / Sequence Diagram)

### Login manager

```
Utilizator          Frontend                Backend                 DB
    │                   │                       │                     │
    │  email + parolă   │                       │                     │
    │──────────────────>│                       │                     │
    │                   │  POST /api/managers/login                   │
    │                   │  body: { email, password }                 │
    │                   │──────────────────────>│                     │
    │                   │                       │  SELECT manager     │
    │                   │                       │  WHERE email, active │
    │                   │                       │────────────────────>│
    │                   │                       │<────────────────────│
    │                   │                       │  bcrypt.compare      │
    │                   │  200 { success, manager_id, email, ... }     │
    │                   │<──────────────────────│                     │
    │                   │  localStorage.setItem('proconix_manager_session', ...)
    │                   │  redirect dashboard   │                     │
    │  Dashboard        │                       │                     │
    │<──────────────────│                       │                     │
```

### Creare task / submit work log (operativ)

```
Operativ         Frontend (Operative Dashboard)    Backend              DB
   │                        │                         │                  │
   │  complete form + Submit │                         │                  │
   │────────────────────────>│                         │                  │
   │                        │  POST /api/operatives/work-log            │
   │                        │  headers: session       │                  │
   │                        │  body: { job_display_id, worker_name, ... }│
   │                        │────────────────────────>│                  │
   │                        │                         │  requireOperativeAuth
   │                        │                         │  INSERT work_logs
   │                        │                         │─────────────────>│
   │                        │                         │<─────────────────│
   │                        │  201 { ... }            │                  │
   │                        │<────────────────────────│                  │
   │  Success toast         │                         │                  │
   │<────────────────────────│                         │                  │
```

### Ordinea pașilor (generic)

1. **Frontend**: user action → validare client (opțional) → `fetch(apiUrl, { method, headers, body })`.
2. **Backend**: middleware (auth) → controller (business logic) → `pool.query()`.
3. **DB**: execută SQL, returnează rows.
4. **Backend**: controller formatează răspuns → `res.status(xxx).json(...)`.
5. **Frontend**: `res.ok` → actualizează UI; altfel → afișează `body.message` sau "Request failed".

---

*Documentația trebuie actualizată la fiecare schimbare majoră de structură sau flux.*
