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
| GET | /api/companies/me | requireManagerAuth | — | `{ success, company }` – toate coloanele din `companies` pentru `company_id` al managerului logat |

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

#### Managers – profil, parolă, invitație (sesiune manager)

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| GET | /api/managers/me | requireManagerAuth | — | `{ success, manager: { id, company_id, name, surname, email, active, phone? }, phone_supported }` – dacă lipsește coloana `phone` în DB, `phone_supported: false` |
| PATCH | /api/managers/phone | requireManagerAuth | body: `phone` (string gol = șterge) | `{ success, manager: { phone } }` sau 400 dacă coloana `phone` nu există |
| POST | /api/managers/change-password | requireManagerAuth | body: `current_password`, `new_password` (min. 8 caractere) | `{ success, message }` |
| POST | /api/managers/invite | requireManagerAuth | body: `manager_type` (`general` \| `site`), `email`, `project_id` (obligatoriu pentru `site`) | Creează manager în aceeași companie cu parolă temporară; răspuns include date pentru onboarding (ex. parolă temporară) |

---

### Auth (validare sesiune manager)

| Method | Route | Auth | Headers | Returnat |
|--------|--------|------|---------|----------|
| GET | /api/auth/validate | requireManagerAuth | X-Manager-Id, X-Manager-Email | valid, company_name, manager { id, company_id, name, surname, email, active } |

---

### Projects (Manager)

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| POST | /api/projects/create | Manager | body: project_name/name, address, description, start_date, planned_end_date?, number_of_floors?, latitude?, longitude? | Project creat (include geolocație) |
| GET | /api/projects/list | Manager | — | success, projects[] (id, name/project_name, address, ...) |
| GET | /api/projects/:id | Manager sau Operative | id (path) | Detalii proiect (company check) – returnează și latitude/longitude dacă sunt setate |
| PUT | /api/projects/:id/update | Manager | id (path), body: project_name/name, address, start_date?, planned_end_date?, number_of_floors?, description?, latitude?, longitude? | Success |
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
| POST | /api/operatives/work-hours/clock-in | Operative | body: clock_in_latitude, clock_in_longitude (obligatorii) | 201 `{ success, message, on_site, distance_miles, work_hour }` – validează că operativul este la maxim ~0.01 mile de proiect; altfel 400 `You are not on site. Clock in not allowed.` |
| POST | /api/operatives/work-hours/clock-out | Operative | body: clock_out_latitude, clock_out_longitude (obligatorii) | 200 `{ success, message, on_site, distance_miles, work_hour }` – validează apropierea de proiect (aceeași marjă); altfel 400 `You are not on site. Clock out not allowed.` |
| GET | /api/operatives/work-hours/status | Operative | — | Status curent |
| GET | /api/operatives/work-hours/weekly | Operative | — | Ore săptămânale |
| GET | /api/operatives/project/current | Operative | — | Proiect curent (assignat) |
| GET | /api/operatives/tasks | Operative | — | Task-uri combinate: din tabelul `tasks` (`user_id`) + din `planning_plan_tasks` unde numele operativului (din `users.name`) apare în `assigned_to` (compania din `planning_plans`); excl. `completed` pentru planning. Răspuns: `tasks[]` cu `source`, `title`, `deadline`, `status`, opț. `priority`, `pickup_start_date` |
| GET | /api/operatives/tasks/:taskId | Operative | query: `source=legacy\|planning` | Detalii task + `confirmation_photos[]` (din `operative_task_photos`, max 10 per user/task) |
| PATCH | /api/operatives/tasks/:taskId | Operative | body: `source`, `action` (`decline` \| `in_progress` \| `complete`) | Actualizează `status`: legacy → `declined` / `in_progress` / `completed`; planning → același set (necesită migrare pentru `declined` pe `planning_plan_tasks`) |
| POST | /api/operatives/tasks/:taskId/photos | Operative | multipart: `file` (imagine), field `source` | Salvează URL în `operative_task_photos`; max 10 poze per user/task |
| POST | /api/operatives/issues | Operative | multipart (file) + fields | Issue creat, file_url injectat |
| POST | /api/operatives/uploads | Operative | multipart (file) + fields | Document upload, file_url injectat |
| GET | /api/operatives/work-log | Operative | — | Work logs ale operativului (filtrate: **fără** rânduri cu `operative_archived = true` pentru operativ) |
| GET | /api/operatives/qa/assigned-jobs | Operative | — | Joburi QA pe proiectul operativului (templates + steps + `remainingStepQuantities`) — folosit pentru **Price work booking** |
| POST | /api/operatives/work-log/upload | Operative | multipart: `file` | Salvează în `uploads/worklogs/`; răspuns `path` (ex. `/uploads/worklogs/...`) |
| POST | /api/operatives/work-log | Operative | body: câmpuri work log + opțional `photoUrls[]`, **`timesheetJobs`**, **`priceWorkJobs`** (array: cantități + `stepPhotoUrls` per pas pentru `qa_price_work` în `timesheet_jobs`) | Work log creat (persistă `timesheet_jobs` dacă coloana există); vezi [10-price-work-booking-qa-photos.md](10-price-work-booking-qa-photos.md) |
| POST | /api/operatives/work-log/:id/send-invoice-copy | Operative | id (path) | Trimite email companie + PDF rezumat (inclusiv poze din `stepPhotoUrls` dacă există) |
| POST | /api/operatives/work-log/:id/archive | Operative | id (path) | Setează `operative_archived`, `operative_archived_at` pentru intrarea proprie (nu șterge rândul) |
| POST | /api/operatives/timesheet/generate | Operative | body: JSON (`jobs[]`, `total_before_tax`, `work_type`, `period_from`, `period_to`, `workerName` / `project`, logo opțional, etc.) | Generează PDF pontaj (PDFKit); `{ success, pdfPath, pdfUrl }` |
| POST | /api/operatives/work-report/generate | Operative | body: JSON (`photos` / `photoUrls`, `work_performed`, `notes`, `total_before_tax`, date interval, `location`, logo, …) | Generează PDF raport lucrare (PDFKit); `{ success, pdfPath, pdfUrl }` |

Implementare PDF: **`pdfKitReportsController.js`** + **`backend/templates/pdfkit/proconixPdfTemplate.js`** (layout unic: header, perioadă **dd/mm/yy**, **Total (before tax)** în rezumat).

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
| POST | /api/worklogs/:id/archive | Manager | id (path) | `archived = true` (ascunde de listele manager „normale”; nu e același lucru cu `operative_archived`) |
| POST | /api/worklogs/archive-bulk | Manager | body: `jobIds[]` | Mai multe joburi arhivate |
| DELETE | /api/worklogs/:id | Manager | id (path) | **Ștergere definitivă**: `DELETE FROM work_logs` pentru `(id, company_id)`; șterge de pe disc fișierele referite sub `/uploads/` (factură, `photo_urls`, poze din `timesheet_jobs`) |

---

### Documents & digital signatures (Manager + Operative)

Fișiere PDF și PNG semnături: `backend/uploads/{NumeCompanieSanitizat}_{companyId}_docs/` (subfolder `signatures/` pentru PNG). Migrare: `scripts/create_digital_documents_tables.sql`.

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| GET | /api/documents | Manager | query: project_id?, status?, q? | `{ success, documents[] }` — include `assignees_count`, `signed_users_count`, `signatures_progress` |
| POST | /api/documents/upload | Manager | multipart: `file` (PDF), `title`, `description?`, `document_type?`, `project_id?` | `{ success, document }` — status `draft` |
| PATCH | /api/documents/:id/fields | Manager | body: `fields` (array JSON, min. 1 câmp `type: signature`) | `{ success, document }` |
| POST | /api/documents/:id/assign | Manager | body: `assignments[]`: `user_id`, `deadline?`, `mandatory?`, `recurrence_days?` | `{ success, document_id }` — setează `pending_signatures` |
| GET | /api/documents/:id | Manager | id | `{ success, document }` |
| GET | /api/documents/:id/audit | Manager | id | `{ success, audit[] }` |
| DELETE | /api/documents/:id | Manager | id | Șterge rânduri + fișiere PDF și PNG asociate |
| GET | /api/documents/operative/inbox | Operative | header `X-Operative-Token` | `{ success, documents[] }` — doar `pending_signatures` |
| GET | /api/documents/operative/document/:id | Operative | id | `{ success, document }` — doar dacă userul e asignat |
| POST | /api/documents/:id/sign | Operative | body: `field_id`, `signatureImageBase64`, `confirmed_read`, `client_meta?` | `{ success, signature_url }` |

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

### Material Management (Manager)

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| GET | /api/materials/projects | Manager | — | { success, projects: [{ id, name, address }] } |
| GET | /api/materials/categories | Manager | — | [{ id, name, description }] |
| POST | /api/materials/categories | Manager | body: name, description? | Category creat (201) |
| GET | /api/materials/suppliers | Manager | — | [{ id, name, contact, emailPhone, address }] |
| POST | /api/materials/suppliers | Manager | body: name, contact?, emailPhone?, address? | Supplier creat (201) |
| GET | /api/materials | Manager | query: projectId | Array materiale (id, name, categoryId, categoryName, supplierId, supplierName, unit, quantityInitial, quantityUsed, quantityRemaining, lowStockThreshold, status, emailNotify) |
| POST | /api/materials | Manager | body: projectId, name, categoryId?, supplierId?, unit, quantityInitial, lowStockThreshold?, emailNotify? | Material creat (201) |
| PUT | /api/materials/:id | Manager | id (path), body: name, categoryId, supplierId, unit, quantityInitial, quantityUsed, quantityRemaining, lowStockThreshold, emailNotify (parțial) | Material actualizat |
| DELETE | /api/materials/:id | Manager | id (path) | 204 (soft delete) |
| GET | /api/materials/forecast | Manager | query: projectId | { thisWeek, lastWeek } – calculat din material_consumption (snapshot zilnic) |

Toate rutele Material Management sunt protejate cu **requireManagerAuth** (X-Manager-Id, X-Manager-Email). Datele sunt filtrate după company_id al managerului. La create/update material se înregistrează snapshot zilnic în material_consumption pentru forecast.

---
### Planning (Task & Planning) – Manager

Endpoint dedicat pentru modulul `Task_Planning.html` (Gantt chart overview + Kanban).

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| POST | /api/planning/plans | requireManagerAuth | body: `type` (daily|weekly|monthly), `start_date` (YYYY-MM-DD), `end_date` (YYYY-MM-DD) | `{ success: true, plan_id }` |
| POST | /api/planning/plan-tasks | requireManagerAuth | body: `plan_id`, `tasks[]` | `{ success: true }` |
| PATCH | /api/planning/plan-tasks/:id | requireManagerAuth | body opționale: `title`, `description`, `assigned_to` (TEXT[]), `priority`, `deadline` (ISO), `pickup_start_date` (YYYY-MM-DD), `notes`, `status`, `send_to_assignees` | `{ success: true }` |
| GET | /api/planning/plan-tasks/:id/confirmation-photos | requireManagerAuth | path: `id` (task din `planning_plan_tasks`) | `{ success: true, photos: [{ file_url, user_id, user_name, created_at }] }` — poze de confirmare din `operative_task_photos` (`task_source=planning`) |
| DELETE | /api/planning/plan-tasks/:id | requireManagerAuth | path: `id` | `{ success: true, deleted: true }` |
| GET | /api/planning/list | requireManagerAuth | — | `{ success: true, plans: [...] }` |

#### Modelul task-ului (payload frontend → backend)
- `title` (string, obligatoriu)
- `description` (string, opțional)
- `assigned_to` (TEXT[], backend cere array nenul; UI folosește placeholder `Unassigned` când sunt zero asignees)
- `priority`: `low|medium|high|critical`
- `deadline`: ISO timestamp (TIMESTAMPTZ)
- `pickup_start_date`: `YYYY-MM-DD` (DATE)
- `notes`: opțional
- `status`: `not_started|in_progress|paused|completed|declined`
- `send_to_assignees`: boolean

### Note tehnice
- Planning este scos din local state după sync și se bazează pe DB (`planning_plans`, `planning_plan_tasks`).
- `upsertPlanTasks` face tranzacție: `BEGIN` → `DELETE` tasks pentru `plan_id` → `INSERT` → `COMMIT`.
- Toate operațiunile sunt filtrate pe `company_id` prin `req.manager.company_id`.
- QA Job → Planning (auto sync):
  - în `qaController.createJob` se creează automat un `planning_plans(type='daily')` pentru `target_completion_date` și un `planning_plan_tasks` care apare pe Gantt/Kanban.
  - în `qaController.updateJob` (status) se face update task-ului din planning.
  - în `qaController.deleteJob` se șterge task-ul din planning asociat.
  - legătura se face prin coloana `planning_plan_tasks.qa_job_id`.

---

### Dashboard (HTML partials)

| Method | Route | Auth | Parametri | Returnat |
|--------|--------|------|-----------|----------|
| GET | /api/dashboard/overview-stats | Manager | — | JSON: `projects_count`, `planning_tasks_count` (Task & Planning), `work_logs_total_cost` (sumă `total` din work logs ne-arhivate), `qa_job_cost_by_type` (array `{ code, label, count }` – joburi QA pe proiectele companiei, grupate după `qa_cost_types`: day / hour / price / none) |
| GET | /api/dashboard/overview-lists | Manager | — | JSON: `tasks_deadline_next_7_days` (task-uri planning cu deadline în următoarele 7 zile, fără `completed`), `worklogs_unapproved_queue` (max 20 work logs neaprobate: `pending`/`edited`/`waiting_worker`, ne-arhivate, sortate după `COALESCE(submitted_at, created_at)` crescător; câmp `is_stale` dacă au peste 7 zile). `worklogs_unapproved_over_7_days` rămâne ca subset doar cele cu `is_stale` (compatibilitate) |
| GET | /api/dashboard/operative-activity-today | Manager | — | JSON: `count`, `operatives[]` — utilizatori din companie cu cel puțin un `work_hours.clock_in` în ziua curentă (calendar server `CURRENT_TIMESTAMP`); pentru fiecare: ultimul clock-in din acea zi, `project_id`/`project_name`, `clock_in`/`clock_out`, `is_on_shift` (`clock_out` null) |
| GET | /api/dashboard/:module | Manager | module: project-overview, projects, operatives, worklogs, manage-material, task-management, ... | HTML partial pentru modulul respectiv |

---

### Platform administration (operator Proconix, tabel `proconix_admin`)

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| POST | /api/platform-admin/login | — | body: `email`, `password` | `{ success, message, platform_admin: { id, full_name, email, admin_rank, access_level, enroll_date, address, active } }` sau 401 |
| GET | /api/platform-admin/me | Headers: `X-Platform-Admin-Id`, `X-Platform-Admin-Email` | — | `{ success, platform_admin }` — verifică `proconix_admin` (activ); 401 dacă sesiune invalidă |
| GET | /api/platform-admin/system-health | Același header-e | — | `{ success, console_banner: { lines[] }, uptime_seconds, api, database, pool, pg_connections, metrics: { buckets[] }, queue, slow_queries, slow_queries_meta, feature_flags[] }` — `console_banner` = același text ca la startup în terminal (oglindire UI); metrici in-memory pentru `/api`; pool `pg`; slow queries; flag-uri din env `FEATURE_*`, `PROCONIX_FLAG_*`, `FEATURE_FLAGS_JSON` |
| GET | /api/platform-admin/platform-users | Același header-e | — | `{ success, items: [...] }` — toate rândurile din `manager` și `users` (join `companies` pentru `company_name`). Fără coloana `password`; `password_set: boolean`; fiecare rând are `kind`: `manager` \| `user` (ID-urile pot coincide între tabele). |
| GET | /api/platform-admin/platform-users/:kind/:id | Același header-e | `kind` = `manager` \| `user`, `id` numeric | `{ success, record }` — un rând complet (fără parolă) |
| PATCH | /api/platform-admin/platform-users/:kind/:id | Același header-e | body: câmpuri permise per tabel + `new_password` opțional (min. 8). Manager: `company_id`, name, surname, email, active, project_onboard_name, is_head_manager, active_status, dezactivation_date. User: `company_id`, project_id, role, name, email, active, active_status, onboarding, onboarded. | `{ success, record }` — 409 la unicitate `(email, company_id)` la `users` |
| DELETE | /api/platform-admin/platform-users/:kind/:id | Același header-e | — | `{ success, deleted: { kind, id } }` sau 409 dacă există FK către rând |
| GET | /api/platform-admin/billing-subscriptions | Același header-e | — | `{ success, subscriptions: [{ …, billing_status, calendar_expired }] }` — coloane billing pe `companies` |
| PATCH | /api/platform-admin/billing-subscriptions/:id | Același header-e | body JSON: `plan_expires_at` (YYYY-MM-DD sau null), `payment_method`, `billing_status` (`paid_active` \| `unpaid_suspended` \| `unpaid_active`) — oricare subset | `{ success, subscription }` |
| GET | /api/platform-admin/companies | Același header-e | — | `{ success, companies: [{ id, name, head_manager_id, head_manager_name, head_manager_email }] }` — manager cu `company_id` = companie: întâi `is_head_manager` = yes, altfel `id` minim; `head_manager_name` = nume+surname, `head_manager_email` = `email` |
| GET | /api/platform-admin/companies/:id | Același header-e | path `id` | `{ success, company: (rând complet `companies`), head_manager: (fără parolă) \| null }` |
| PATCH | /api/platform-admin/companies/:id | Același header-e | body: `company` (…), `head_manager` (name, surname, email, **active**, new_password opțional). La `head_manager.active`: `true` → și `manager.is_head_manager = 'Yes'`; `false` → `'No'`. | `{ success, company, head_manager }` |
| DELETE | /api/platform-admin/companies/:id | Același header-e | path `id` | Ștergere în cascadă (best-effort: planning, tasks, materials, projects, QA legate de companie, users, manager, work_logs, apoi `companies`). `{ success, deleted_id }` sau 409 la FK rămas |
| POST | /api/platform-admin/create-demo-records | Același header-e | body: `company_name`, `head_manager_name`, `email`, `password` | Creează tenant demo complet (companie + manager + proiecte + operativi + planning + QA + materials + work logs + **unit_progress_state** demo dacă tabela există) |
| POST | /api/platform-admin/send-demo-login-email | Același header-e | body: `to`, `company_name`, `head_manager_name?`, `head_manager_email`, `primary_operative_email`, `password` | Trimite clientului email cu datele de login demo |

Sesiunea în frontend: după login, `localStorage` / `sessionStorage` (`proconix_platform_admin_session`) stochează `id` + `email` (+ date afișate); request-urile protejate trimit aceleași header-e ca la manager.

---

### Unit Progress Tracking (Manager / Supervisor / Public)

| Method | Route | Auth | Parametri / Body | Returnat |
|--------|--------|------|------------------|----------|
| GET | /api/unit-progress/workspace | requireManagerAuth | — | `{ success, workspace }` (workspace complet pe compania managerului) |
| PUT | /api/unit-progress/workspace | requireManagerAuth | body: `workspace` (sau obiect direct) | `{ success, workspace }` (upsert în `unit_progress_state`) |
| GET | /api/unit-progress/supervisor/workspace | requireSupervisorAuth | — | `{ success, workspace }` pe compania supervisorului |
| PUT | /api/unit-progress/supervisor/workspace | requireSupervisorAuth | body: `workspace` (sau obiect direct) | `{ success, workspace }` |
| GET | /api/unit-progress/public-timeline/:unitId | public | path `unitId` | `{ success, unit, timeline }` read-only (fără auth) |
| GET | /api/unit-progress/private-timeline/manager/:unitId | requireManagerAuth | path `unitId` | timeline privat pentru manager (din workspace companie) |
| GET | /api/unit-progress/private-timeline/supervisor/:unitId | requireSupervisorAuth | path `unitId` | timeline privat pentru supervisor (cu verificare acces proiect) |
| POST | /api/unit-progress/private-timeline/manager/:unitId/progress | requireManagerAuth | body: `stage`, `status`, `comment`, opțional `reason`, `photos[]` (max 5) | adaugă intrare append-only în `unit.timeline` |
| POST | /api/unit-progress/private-timeline/supervisor/:unitId/progress | requireSupervisorAuth | body ca mai sus | adaugă progres dacă supervisorul are acces la proiectul unității |

Notă: dacă tabela lipsește, endpoint-urile răspund cu cod/mesaj ce indică rularea scriptului `scripts/create_unit_progress_tables.sql`.

---

### Subscriptions / Contact

- **Subscriptions**: placeholder routes sub `/api/subscriptions` (See Plans).
- **Contact**: `/api/contact` – callback request (formular contact).

---

## Middleware necesar (auth, validation)

| Middleware | Fișier | Utilizare |
|------------|--------|-----------|
| requireManagerAuth | requireManagerAuth.js | Header-e `X-Manager-Id`, `X-Manager-Email`; verifică în DB că managerul există și e active. Pune `req.manager`. |
| requirePlatformAdminAuth | requirePlatformAdminAuth.js | Header-e `X-Platform-Admin-Id`, `X-Platform-Admin-Email`; verifică `proconix_admin` activ. Pune `req.platformAdmin`. |
| requireOperativeAuth | requireOperativeAuth.js | Verifică sesiunea operativului (cookie sau token). Pune `req.user` (sau echivalent). |
| requireSupervisorAuth | requireSupervisorAuth.js | Verifică sesiunea operativului pentru rol supervisor (`X-Operative-Token`). Pune `req.supervisor`. |
| requireManagerOrOperativeAuth | requireManagerOrOperativeAuth.js | Acceptă fie manager (headers), fie operativ (session); folosit la GET project by id. |
| — | express.json(), express.urlencoded | Parsare body JSON/form. |
| uploadIssueFile, uploadDocumentFile, uploadWorklogFile | uploadMiddleware.js | Multer pentru upload fișiere; injectFileUrl injectează URL-ul fișierului în req.body. |

---

## Controller & Service Overview

| Controller | Responsabilitate principală |
|------------|-----------------------------|
| companyController | POST /api/companies/create; GET /api/companies/me (profil companie pentru manager logat). |
| managerController | Creare manager (după onboarding), login manager (email + parolă, bcrypt); getManagerMe, updateManagerPhone, changeManagerPassword, inviteManager. |
| platformAdminController | Login platform admin (`proconix_admin`, bcrypt); `me` pentru validare sesiune. |
| unitProgressController | Workspace Unit Progress: get/put manager-supervisor, timeline public/private, append progress pe unitate. |
| authRoutes (inline) | GET /api/auth/validate – returnează company_name și manager dacă header-ele sunt valide. |
| projectsController | CRUD proiecte (company_id din req.manager), list, getOne, create, update, deactivate, getAssignments, assign, removeAssignment. |
| operativeController | CRUD operativi (list, add, update, delete), login operative, set-password. |
| operativeDashboardController | getMe, clockIn/clockOut, workHours status/weekly, getCurrentProject, reportIssue, uploadDocument, getTasks, getTaskDetail, updateTaskStatus, uploadTaskConfirmationPhoto, **getMyWorkLogs** (exclude `operative_archived` pentru operativ), **workLogUpload**, **createWorkLog** (inclusiv `timesheet_jobs`), **archiveMyWorkLog**. |
| worklogsController | list, workers, getOne, update, approve, reject, archive, archiveBulk, create, **remove** (hard delete + unlink fișiere `/uploads/`). |
| pdfKitReportsController | **generateTimesheetPdf**, **generateWorkReportPdf** (PDFKit; meta operativ/proiect din DB când lipsește din body). |
| qaController | listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate; listJobs, getJob, getNextJobNumber, createJob, updateJob, deleteJob. Helpers: getStatusIdByCode, getCostTypeIdByCode, getFloorIdByCode, assertProjectAccess. |
| materialsController | getProjects, getCategories, createCategory, getSuppliers, createSupplier, getMaterials, createMaterial, updateMaterial, deleteMaterial (soft delete), getForecast. Helper: recordConsumptionSnapshot (snapshot zilnic în material_consumption la create/update material). Toate operațiunile sunt filtrate după company_id; audit: created_by, updated_by, deleted_at/deleted_by. |
| dashboardRoutes | HTML partials: `GET /api/dashboard/:module`; înregistrează **înainte** de `/:module` rutele JSON: `overview-stats`, `overview-lists`, `operative-activity-today` (vezi `dashboardOverviewController`). |
| dashboardOverviewController | getOverviewStats (inclusiv `qa_job_cost_by_type`), getOverviewLists, getOperativeActivityToday. |

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

- **requireManagerAuth**: obligatoriu pentru /api/auth/validate, /api/companies/me, /api/managers/me, /api/managers/phone, /api/managers/change-password, /api/managers/invite, /api/projects/* (exceptând eventual getOne dacă e partajat), /api/operatives (CRUD), /api/worklogs/*, /api/materials/*, /api/templates, /api/jobs, /api/dashboard/* (partials + overview-stats, overview-lists, operative-activity-today), `/api/unit-progress/workspace`, `/api/unit-progress/private-timeline/manager/*`.
- **requireOperativeAuth**: pentru /api/operatives/me, work-hours/*, project/current, tasks, tasks/:id/photos, issues, uploads, work-log (GET, POST, upload, **/:id/archive**), **timesheet/generate**, **work-report/generate**.
- **requireSupervisorAuth**: pentru `/api/unit-progress/supervisor/*` și `/api/unit-progress/private-timeline/supervisor/*`.
- **requireManagerOrOperativeAuth**: pentru GET /api/projects/:id (manager vede orice proiect al companiei; operativ doar proiectul la care e asignat).
- **Fără auth**: /api/health, /api/companies/create, /api/onboarding/company, /api/managers/create, /api/managers/login, /api/operatives/login, login-temp, set-password.

---

*Actualizează documentația la adăugarea de endpoint-uri sau middleware.*

**Actualizat:** 26/04/2026
