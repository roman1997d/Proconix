# 4. Documentație frontend

## Structura fișierelor și foldere

```
frontend/
├── index.html                 # Pagina principală / landing
├── register_company.html      # Înregistrare companie
├── register_manager.html      # Înregistrare manager (după onboarding token)
├── login_manager.html         # Login manager
├── proconix_administration_login.html  # Sign-in administrator platformă Proconix (redirect către consolă)
├── proconix_administration.html   # Consolă admin platformă (după login; tool-uri placeholder)
├── dashboard_manager.html    # Dashboard manager (SPA-style: partials API + iframes QA/Planning/Materials/Profile/Company)
├── Profile_Settings.html     # Profil manager (parolă, telefon) – iframe din dashboard
├── my_company_settings.html  # Setări companie + invite manager – iframe din dashboard
├── ContactUs.html            # Pagină contact (public)
├── operative_dashboard.html   # Dashboard operativ (login, ore, task-uri, work logs, issues)
├── Quality_Assurance.html     # Modul QA (templates, jobs) – manager
├── manage_material.html       # Material Management – manager (stoc per proiect, categorii, furnizori, forecast)
├── material.html              # Pagină landing / informațională materiale (SEO)
├── see_plans.html             # Planuri / abonamente
├── css/
│   ├── styles.css             # Stiluri globale
│   ├── proconix_administration.css # Stiluri pagină admin platformă
│   ├── dashboard_manager.css  # Temă manager: sidebar stânga (rail + hover), variabile, componente dashboard manager
│   ├── dashboard.css          # Dashboard manager: layout app, iframe, footer, overlay mobil, content-wrap
│   ├── projects.css           # Modul Projects
│   ├── worklogs.css           # Modul Work Logs
│   ├── operative_dashboard.css
│   ├── quality_assurance.css
│   └── manage_materials.css   # Stiluri pentru material.html (landing)
├── js/
│   ├── index.js               # Logică pagină principală
│   ├── login_manager.js       # Login manager, salvare sesiune
│   ├── proconix_administration_login.js  # Login admin: sesiune client (localStorage/sessionStorage) → redirect consolă
│   ├── proconix_administration_dashboard.js  # Gate consolă + navigare secțiuni + Sign out
│   ├── register_manager.js    # Register manager (onboarding token → company_id)
│   ├── dashboard.js           # Dashboard: navigare module, auth, partials; Project Overview: stats, liste, operative activity, work logs queue; ordinea initCharts înainte de fetch overview
│   ├── dashboard_manager.js   # Chart.js: line (Activity Overview – demo), doughnut QA (`updateQaWorkTypePieChart` din date `overview-stats`)
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
| index.html | Landing | Prezentare, link-uri către register/login; optimizat SEO (meta description, theme-color), preconnect CDN, scripturi `defer`; buton Operative quick access → login modal multi-pas |
| register_company.html | Înregistrare companie | Formular → POST /api/companies/create; poate pre-selecta planul din `see_plans.html` (storage `proconix_selected_plan`) |
| see_plans.html + see_plans.js | Planuri | Click pe plan → salvează tier (`free`/`silver`/`gold`/`platinum`) în localStorage + sessionStorage → `register_company.html` |
| register_manager.html | Înregistrare manager | Token din URL → GET /api/onboarding/company; formular → POST /api/managers/create |
| login_manager.html + login_manager.js | Login manager | Formular → POST /api/managers/login; salvare sesiune în localStorage; redirect dashboard |
| proconix_administration_login.html + proconix_administration_login.js | Sign-in admin platformă | `POST /api/platform-admin/login`; salvează `proconix_platform_admin_session` (`id`, `email`, …); redirect consolă |
| proconix_administration.html + proconix_administration_dashboard.js | Consolă admin | `GET /api/platform-admin/me` cu header-e `X-Platform-Admin-Id` / `Email`; secțiuni: companies, billing, **System & health** (operațiuni sistem), **Audit & logs** (jurnale); **Proconix project on disk**: utilizare pe tipuri (imagini, documente, altele). |
| dashboard_manager.html + dashboard.js + dashboard_manager.js | Dashboard manager | GET /api/auth/validate; module HTML via GET /api/dashboard/:module; **Project Overview**: GET /api/dashboard/overview-stats, overview-lists, operative-activity-today; iframes: Task_Planning, Quality_Assurance, manage_material, Site_Snags, Profile_Settings, my_company_settings; Projects, Operatives, Work Logs. **UI**: sidebar fix **stânga** (rail icon-only, extindere hover/focus); mobil off-canvas stânga; **footer ascuns** pe ecrane ≤991px; `dashboard_manager.css` + `dashboard.css` |
| Profile_Settings.html | Profil manager | GET /api/managers/me; PATCH /api/managers/phone; POST /api/managers/change-password (headers manager) |
| my_company_settings.html | Companie + invite | GET /api/companies/me; POST /api/managers/invite; GET /api/projects/list pentru dropdown site manager |
| projects.js | Projects | /api/projects/list, create, :id/update, :id/deactivate, :id/assignments, assign, delete assignment; formular Edit Project include și `latitude`/`longitude` + buton „Use current location” (HTML5 geolocation) |
| worklogs.js | Work Logs | Passkey gate; listă/filtrare; detalii cu **poze grupate pe `timesheetJobs`**; descărcare fișier din **`invoiceFilePath`**; approve/reject/edit/archive-bulk; **Delete permanently** → `DELETE /api/worklogs/:id`; badge **Operative archived** |
| operative_dashboard.html + operative_dashboard.js | Dashboard operativ | Login; me, work-hours (GPS), project/current, **tasks** (legacy + Planning), issues, uploads; **Log Work**: `GET/POST /api/operatives/work-log`, upload, **Time Sheet Jobs Builder** + perioadă obligatorie, generare PDF via **`POST /timesheet/generate`** (PDFKit pe server, fallback jsPDF), **Create Work Report** (modal) cu încărcare PDF generat; **`timesheetJobs`** + `photoUrls` la submit; **Archive** pe intrări în „My work entries” (`POST .../work-log/:id/archive`). **Modal task**: poze confirmare, acțiuni Decline / Mark in progress / Complete |
| Quality_Assurance.html | QA | Logică inline în pagină: qaApi (backend: /api/templates, /api/jobs), /api/projects/list pentru dropdown; localStorage fallback când nu e sesiune manager |
| manage_material.html | Material Management | Logică inline: materialApi la /api/materials (projects, categories, suppliers, materials CRUD, forecast); USE_MOCK pentru demo fără backend; dropdown proiect, tabel materiale cu filtre/sortare, Stock check, Edit full/Edit qty, export Excel, carduri Critical/Alerts, grafic forecast |
| material.html | Landing materiale | Pagină informațională (hero, features, CTA); fără logică de gestiune |
| Task_Planning.html | Task & Planning | UI manager: formular task + `Gantt chart overview` (Day/Week/Month) + Kanban + `Task details` modal; validează `Start date (pickup)` și `Deadline`; `Assigned to` este opțional (UI salvează în DB ca `Unassigned`); sincronizare cu DB prin `/api/planning/*`; listează operativi pentru autocomplete prin `/api/operatives`. Pentru task **completed**, modalul încarcă pozele de confirmare ale operativului: `GET /api/planning/plan-tasks/:id/confirmation-photos`. **Layout**: în iframe ocupă **înălțimea și lățimea** disponibile (fără max-width centrat); panel Planning (`tp-planning-panel`) întinde zona Gantt. |
| Site_Snags.html | Site Snags | Desen/proiect, pin-uri, măsurători; în dashboard prin iframe; sesiune trimisă prin `postMessage`. **Touch**: pan cu un deget, pinch-zoom pe viewport (Pointer Events). |

---

## Flux de interacțiune UI → API

### Ce script face fetch la ce endpoint

| Script / pagină | Endpoint-uri folosite |
|-----------------|------------------------|
| login_manager.js | POST /api/managers/login |
| proconix_administration_login.js | POST /api/platform-admin/login |
| proconix_administration_dashboard.js | GET /api/platform-admin/me; GET /api/platform-admin/companies (modul Companies & tenants) |
| register_manager.js | GET /api/onboarding/company?token=; POST /api/managers/create |
| dashboard.js | GET /api/auth/validate; GET /api/dashboard/:module; **Project Overview**: GET /api/dashboard/overview-stats; GET /api/dashboard/overview-lists; GET /api/dashboard/operative-activity-today; GET /api/operatives (număr card Operatives) |
| Profile_Settings.html | GET /api/managers/me; PATCH /api/managers/phone; POST /api/managers/change-password |
| my_company_settings.html | GET /api/companies/me; POST /api/managers/invite; GET /api/projects/list |
| dashboard_manager.js | Chart.js – `updateQaWorkTypePieChart(qa_job_cost_by_type)` după încărcarea overview-stats |
| projects.js | GET /api/projects/list; POST /api/projects/create; GET /api/projects/:id; PUT /api/projects/:id/update; PUT /api/projects/:id/deactivate; GET /api/projects/:id/assignments; POST /api/projects/:id/assign; DELETE /api/projects/assignment/:id; GET /api/operatives (pentru listă la assign) |
| worklogs.js | GET /api/worklogs/workers; GET /api/worklogs; GET /api/worklogs/:id; PATCH; POST …/approve, …/reject, …/archive; POST /api/worklogs/archive-bulk; **DELETE /api/worklogs/:id** |
| operative_dashboard.js | POST login; GET me; work-hours/*; GET project/current; tasks + PATCH + photos; issues; uploads; **GET work-log**; **POST work-log/upload**; **POST work-log** (inclusiv `timesheetJobs`, `photoUrls`); **POST work-log/:id/archive**; **POST timesheet/generate**; **POST work-report/generate** (headers sesiune operativ) |
| Quality_Assurance.html (inline) | GET /api/projects/list (dropdown proiect); GET/POST/PUT/DELETE /api/templates; GET/POST/PUT/DELETE /api/jobs; GET /api/jobs/next-number (logic poate fi în frontend pe baza listei de jobs) |
| manage_material.html (inline) | GET /api/materials/projects; GET/POST /api/materials/categories; GET/POST /api/materials/suppliers; GET /api/materials?projectId=; POST /api/materials; PUT /api/materials/:id; DELETE /api/materials/:id; GET /api/materials/forecast?projectId=. Headers: X-Manager-Id, X-Manager-Email (proconix_manager_session). Opțional: MATERIAL_USE_MOCK=true pentru date mock |
| Task_Planning.html | GET /api/operatives; GET /api/planning/list; POST /api/planning/plans; POST /api/planning/plan-tasks; PATCH /api/planning/plan-tasks/:id; DELETE /api/planning/plan-tasks/:id; GET /api/planning/plan-tasks/:id/confirmation-photos (task completat – poze operativ). Headers: X-Manager-Id, X-Manager-Email (din `proconix_manager_session`). |

### Cum se încarcă datele din DB în pagină

1. **Manager Dashboard**: La alegerea unui modul (ex: Projects), dashboard.js face GET /api/dashboard/projects → primește HTML; îl inserează în zona de conținut; apoi projects.js (deja încărcat) bindează evenimente și la (re)afișare face GET /api/projects/list cu header-ele de sesiune → primește JSON cu proiecte → renderează tabelul.
2. **Work Logs**: După „passkey”, worklogs.js face GET /api/worklogs (cu filtre) și GET /api/worklogs/workers → populează filtrele și tabelul. Detalii job: GET /api/worklogs/:id.
3. **QA**: La încărcare, dacă există sesiune manager, se setează QA_CONFIG.useBackend = true; dropdown-ul de proiect se populează cu GET /api/projects/list; la deschidere listă template-uri/joburi: GET /api/templates, GET /api/jobs?projectId=.
4. **Operative Dashboard**: După login, request-uri la /api/operatives/me, tasks, work-hours, project/current, work-log etc. → datele sunt afișate în UI (tabele, carduri, formulare). Task-urile din listă sunt clickabile: se deschide modal cu descriere/note, poze de confirmare (thumbnail + link), încărcare fișiere (până la 10) și butoane de acțiune până la închiderea task-ului (completed/declined).
5. **Material Management**: Dashboard → Material Management (iframe manage_material.html) sau deschidere în tab nou. Selectare proiect → GET /api/materials?projectId= și GET /api/materials/forecast; listă categorii/furnizori din GET /api/materials/categories și /suppliers. Create/update/delete material și snapshot zilnic în backend pentru forecast.

---

## Manual de utilizare pentru UI

### Cum folosește managerul aplicația

1. **Înregistrare companie** (dacă nu există): pe register_company.html completează datele companiei și trimite. Primește link de onboarding (cu token) pentru înregistrarea managerului.
2. **Înregistrare manager**: deschide link-ul din email (register_manager.html?token=...). Introdu datele personale și parola. După succes, poate merge la login.
3. **Login**: pe login_manager.html introduce email și parolă. La succes e redirecționat la dashboard_manager.html.
4. **Dashboard**: din **meniul stânga** (rail: iconuri; extinde la hover sau deschide din hamburger pe mobil): **Project Overview** (statistici reale, task-uri cu deadline în 7 zile, coadă work logs neaprobate cu marcaj „Stale” >7 zile, activitate operativi azi, grafic QA day/hour/price work, grafic Activity – demo), Projects, Operatives, Work Logs, Task & Planning (iframe), Material Management (iframe), Site Snags (iframe), Quality Assurance (iframe), **Profile Settings** (iframe), **My Company Settings** (iframe). Pe **telefon / tabletă mică** banda de footer cu credit dispare pentru mai mult spațiu de lucru.
5. **Proiecte**: din modulul Projects poate adăuga proiect (Add Project), edita, dezactiva, vedea detalii și asigna operativi/supervizori la proiect (Assign Operatives/Managers).
6. **Operatives**: adaugă operativi sau supervizori (Add Operative / Add Supervisor), editează sau șterge. Lista e filtrată după companie.
7. **Work Logs**: (opțional) passkey; filtre; deschide job (detalii cu poze per job din pontaj, descărcare fișier încărcat); edit/aprobă/respinge/arhivare; **ștergere definitivă** (cu confirmare) șterge înregistrarea și fișierele asociate pe server; factură export; arhivare în bulk. Intrările **arhivate de operativ** apar cu indic vizual și notă în detalii.
8. **Material Management**: din dashboard → Material Management (sau „Open in new window”). Selectează proiectul; poate crea categorii și furnizori; adaugă materiale (nume, categorie, furnizor, unitate, cantitate inițială, prag low-stock). Tabel: filtre (căutare, categorie, status, furnizor), sortare, Stock check (actualizare quantity remaining), Edit full / Edit only qty, ștergere. Carduri: Total stock, Stock by categories, Critical materials, Alerts. Forecast: Usage last week / Forecast this week (din snapshot-uri zilnice); alertă dacă forecast > stoc. Export Excel.
9. **Task & Planning**: deschide `Task_Planning.html` din dashboard. Completează `Task name`, `Start date (pickup)` (obligatoriu), `Deadline (pickup date & time)` (obligatoriu), `Assigned to` (opțional), `Priority` (implicit Medium), `Task description`, `Notes` (opțional). Apasă **Save Task** pentru a crea/sincroniza task-ul în DB. Gantt-ul (Day/Week/Month) și Kanban-ul se actualizează din DB; filtre după persoană/prioritate/status; click pe task deschide modal pentru schimbare status (in progress/paused/completed), delivery (send/remove), assigned, start/deadline și delete (actualizează în DB). Dacă task-ul este **completed** și operativul a încărcat poze, în același modal apare secțiunea **Confirmation photos** cu miniaturi (deschidere în tab nou).
10. **Quality Assurance**: deschide Quality_Assurance.html (din dashboard sau direct). Selectează proiectul; poate crea/edita șabloane (templates) cu pași și prețuri; poate crea/edita joburi (număr, etaj, locație, template-uri și workers asociați, status, cost). Toate acțiunile de creare/editare sunt persistate în DB când ești logat ca manager.

### Cum folosește operativul aplicația

1. **Login**: pe operative_dashboard.html introduce email și parolă (sau parolă temporară dacă e cazul).
2. **Dashboard**: vede proiectul curent, task-uri, status ore (clock-in/clock-out), opțiuni pentru raportare issue și upload documente.
3. **Ore**: clock-in / clock-out; poate vedea statusul curent și orele săptămânale.
4. **Task-uri**: listă task-uri atribuite; click pe un task → modal (EN): status, deadline, descriere, **Confirmation photos**, adăugare poze (max 10), **Decline** / **Mark in progress** / **Complete** cât timp task-ul nu e închis.
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
| **Adăugare material** | Material Management → selectare proiect → Create Category / Add Supplier (dacă e nevoie) → Add Material → completare → Save. |
| **Stock check material** | Material Management → proiect selectat → pe rând → Stock check → editare Quantity remaining → Update. |
| **Operativ – clock-in** | Login → Work hours → Clock In. |
| **Operativ – submit work log** | Work Log → completează formular / upload → Submit. |

---

*Actualizează documentația la adăugarea de pagini sau fluxuri noi.*

**Actualizat:** 27/03/2026
