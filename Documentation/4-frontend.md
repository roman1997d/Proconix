# 4. Documentație frontend

## Structura fișierelor și foldere

```
frontend/
├── index.html                 # Pagina principală / landing
├── register_company.html      # Înregistrare companie
├── register_manager.html      # Înregistrare manager (după onboarding token)
├── login_manager.html         # Login manager
├── dashboard_manager.html    # Dashboard manager (SPA-style, încarcă module din API)
├── operative_dashboard.html   # Dashboard operativ (login, ore, task-uri, work logs, issues)
├── Quality_Assurance.html     # Modul QA (templates, jobs) – manager
├── see_plans.html             # Planuri / abonamente
├── css/
│   ├── styles.css             # Stiluri globale
│   ├── dashboard.css          # Dashboard manager
│   ├── projects.css           # Modul Projects
│   ├── worklogs.css           # Modul Work Logs
│   ├── operative_dashboard.css
│   └── quality_assurance.css
├── js/
│   ├── index.js               # Logică pagină principală
│   ├── login_manager.js       # Login manager, salvare sesiune
│   ├── register_manager.js    # Register manager (onboarding token → company_id)
│   ├── dashboard.js           # Dashboard manager: navigare module, auth, încărcare partials
│   ├── projects.js            # CRUD proiecte, assignments (fetch la /api/projects/*)
│   ├── worklogs.js            # Listă work logs, filtre, approve/reject/archive, passkey
│   └── operative_dashboard.js # Logică dashboard operativ
└── dashboard/
    └── components/
        └── projects.html      # (Opțional) componentă reutilizabilă; conținutul principal Projects vine din API
```

**Care fișier se ocupă de ce modul**

| Fișier | Modul / pagină | Responsabilitate |
|--------|----------------|------------------|
| index.html | Landing | Prezentare, link-uri către register/login |
| register_company.html | Înregistrare companie | Formular → POST /api/companies/create |
| register_manager.html | Înregistrare manager | Token din URL → GET /api/onboarding/company; formular → POST /api/managers/create |
| login_manager.html + login_manager.js | Login manager | Formular → POST /api/managers/login; salvare sesiune în localStorage; redirect dashboard |
| dashboard_manager.html + dashboard.js | Dashboard manager | GET /api/auth/validate; încărcare module via GET /api/dashboard/:module; inițializare Projects, Operatives, Work Logs |
| projects.js | Projects | /api/projects/list, create, :id/update, :id/deactivate, :id/assignments, assign, delete assignment |
| worklogs.js | Work Logs | Passkey gate; /api/worklogs, /api/worklogs/workers; getOne, update, approve, reject, archive, archive-bulk |
| operative_dashboard.html + operative_dashboard.js | Dashboard operativ | Login operative; /api/operatives/me, work-hours, project/current, tasks, issues, uploads, work-log |
| Quality_Assurance.html | QA | Logică inline în pagină: qaApi (backend: /api/templates, /api/jobs), /api/projects/list pentru dropdown; localStorage fallback când nu e sesiune manager |

---

## Flux de interacțiune UI → API

### Ce script face fetch la ce endpoint

| Script / pagină | Endpoint-uri folosite |
|-----------------|------------------------|
| login_manager.js | POST /api/managers/login |
| register_manager.js | GET /api/onboarding/company?token=; POST /api/managers/create |
| dashboard.js | GET /api/auth/validate (header-e X-Manager-Id, X-Manager-Email); GET /api/dashboard/:module (project-overview, projects, operatives, worklogs, …) |
| projects.js | GET /api/projects/list; POST /api/projects/create; GET /api/projects/:id; PUT /api/projects/:id/update; PUT /api/projects/:id/deactivate; GET /api/projects/:id/assignments; POST /api/projects/:id/assign; DELETE /api/projects/assignment/:id; GET /api/operatives (pentru listă la assign) |
| worklogs.js | GET /api/worklogs/workers; GET /api/worklogs (query params); GET /api/worklogs/:id; PATCH /api/worklogs/:id; POST /api/worklogs/:id/approve; POST /api/worklogs/:id/reject; POST /api/worklogs/:id/archive; POST /api/worklogs/archive-bulk |
| operative_dashboard.js | POST /api/operatives/login (sau login-temp); GET /api/operatives/me; POST work-hours/clock-in, clock-out; GET work-hours/status, weekly; GET project/current; GET tasks; POST issues (multipart); POST uploads (multipart); GET work-log; POST work-log/upload; POST work-log |
| Quality_Assurance.html (inline) | GET /api/projects/list (dropdown proiect); GET/POST/PUT/DELETE /api/templates; GET/POST/PUT/DELETE /api/jobs; GET /api/jobs/next-number (logic poate fi în frontend pe baza listei de jobs) |

### Cum se încarcă datele din DB în pagină

1. **Manager Dashboard**: La alegerea unui modul (ex: Projects), dashboard.js face GET /api/dashboard/projects → primește HTML; îl inserează în zona de conținut; apoi projects.js (deja încărcat) bindează evenimente și la (re)afișare face GET /api/projects/list cu header-ele de sesiune → primește JSON cu proiecte → renderează tabelul.
2. **Work Logs**: După „passkey”, worklogs.js face GET /api/worklogs (cu filtre) și GET /api/worklogs/workers → populează filtrele și tabelul. Detalii job: GET /api/worklogs/:id.
3. **QA**: La încărcare, dacă există sesiune manager, se setează QA_CONFIG.useBackend = true; dropdown-ul de proiect se populează cu GET /api/projects/list; la deschidere listă template-uri/joburi: GET /api/templates, GET /api/jobs?projectId=.
4. **Operative Dashboard**: După login, request-uri la /api/operatives/me, tasks, work-hours, project/current, work-log etc. → datele sunt afișate în UI (tabele, carduri, formulare).

---

## Manual de utilizare pentru UI

### Cum folosește managerul aplicația

1. **Înregistrare companie** (dacă nu există): pe register_company.html completează datele companiei și trimite. Primește link de onboarding (cu token) pentru înregistrarea managerului.
2. **Înregistrare manager**: deschide link-ul din email (register_manager.html?token=...). Introdu datele personale și parola. După succes, poate merge la login.
3. **Login**: pe login_manager.html introduce email și parolă. La succes e redirecționat la dashboard_manager.html.
4. **Dashboard**: din meniul lateral alege module: Project Overview, Projects, Operatives, Work Logs, Quality Assurance (link extern către Quality_Assurance.html), etc.
5. **Proiecte**: din modulul Projects poate adăuga proiect (Add Project), edita, dezactiva, vedea detalii și asigna operativi/supervizori la proiect (Assign Operatives/Managers).
6. **Operatives**: adaugă operativi sau supervizori (Add Operative / Add Supervisor), editează sau șterge. Lista e filtrată după companie.
7. **Work Logs**: (opțional) introduce passkey; apoi vede lista de joburi trimise de operativi, cu filtre (worker, dată, proiect, status). Poate deschide un job (detalii), edita cantitate/preț/total, aproba, respinge sau arhiva. Poate genera factură (Export PDF / Print) și arhiva în bulk.
8. **Quality Assurance**: deschide Quality_Assurance.html (din dashboard sau direct). Selectează proiectul; poate crea/edita șabloane (templates) cu pași și prețuri; poate crea/edita joburi (număr, etaj, locație, template-uri și workers asociați, status, cost). Toate acțiunile de creare/editare sunt persistate în DB când ești logat ca manager.

### Cum folosește operativul aplicația

1. **Login**: pe operative_dashboard.html introduce email și parolă (sau parolă temporară dacă e cazul).
2. **Dashboard**: vede proiectul curent, task-uri, status ore (clock-in/clock-out), opțiuni pentru raportare issue și upload documente.
3. **Ore**: clock-in / clock-out; poate vedea statusul curent și orele săptămânale.
4. **Task-uri**: listă task-uri atribuite.
5. **Issues**: raportare problemă cu opțiune de atașament fișier.
6. **Documents**: upload documente (invoices, bookings etc.).
7. **Work Log**: vizualizare work logs proprii; upload fișier sau creare work log nou (job_display_id, worker_name, locație, cantitate, preț etc.).

### Pași principali pentru funcții importante

| Funcție | Pași |
|---------|------|
| **Login manager** | Email + parolă → Submit → Redirect la dashboard. |
| **Adăugare proiect** | Projects → Add Project → completare formular → Save. |
| **Asignare operativ la proiect** | Projects → pe proiect → Assign → selectare user din listă → Assign. |
| **Aprobare work log** | Work Logs → filtre (opțional) → deschide job → Approve. |
| **Creare template QA** | Quality Assurance → Templates → creare template cu nume și pași → salvare. |
| **Creare job QA** | Quality Assurance → selectare proiect → Jobs → creare job (număr, etaj, template-uri, workers) → salvare. |
| **Operativ – clock-in** | Login → Work hours → Clock In. |
| **Operativ – submit work log** | Work Log → completează formular / upload → Submit. |

---

*Actualizează documentația la adăugarea de pagini sau fluxuri noi.*
