# Plan backend – Modul Quality Assurance

**Scop:** Toate datele modulului QA să fie persistate în baza de date (fără localStorage). Orice detaliu folosit în frontend trebuie salvat și, unde e cazul, referit prin chei străine.

**Documentație existentă:** `frontend/QA-BACKEND-API.md` (contract REST pentru templates și jobs). Acest plan extinde cu schema de bază de date, entități suplimentare și pași de implementare.

---

## 1. Analiza modulului QA (ce trebuie salvat)

### 1.1 Entități principale (deja în API)

| Entitate    | Descriere | Câmpuri / detalii |
|------------|-----------|--------------------|
| **Template** | Checklist cu pași și prețuri | id, name, createdAt, createdBy. Fiecare **step**: id, description, pricePerM2, pricePerUnit, pricePerLinear (toate salvate). |
| **Job**     | Lucrare asociată unui proiect | id, projectId, jobNumber, floor, location, sqm, linearMeters, specification, description, targetCompletionDate, createdAt, createdBy, costIncluded, costType, costValue, responsibleId, status. Plus **legături**: templateIds (N template-uri), workerIds (N workers). |

### 1.2 Date de referință (în frontend sunt mock / statice)

| Entitate | Utilizare în QA | Trebuie în DB |
|----------|-----------------|----------------|
| **Projects** | Select proiect; job.projectId | Deja există tabelul `projects`. Doar asigură-te că API-ul QA primește/returnează projectId valid. |
| **Floors** | Job: Select Floor; View Jobs: filtru Floor | Da. Etichete: Ground, Floor 1, 2, 3 (sau per proiect). |
| **Supervisors** | Job: „Assign responsible person” (un responsabil per job) | Da. Lista de persoane afișate ca supervizori (id + name). |
| **Workers** | Job: lista workers cu checkbox + filtru pe categorie | Da. id, name, category. |
| **Worker categories** | Filtru: Fixers, Plaster, Electricians, Painters | Da. Tabel lookup (id, code, label). |
| **Cost type** | Job: Day work / Hour work / Price work | Da. Lookup: day, hour, price (și eventual „none”). |
| **Job status** | Job: New / Active / Completed; Edit job doar status | Da. Lookup: new, active, completed. |
| **Users** | createdBy la template și job | Există `users`. Legătura: created_by = user_id (sau username) din sesiune. |

### 1.3 Ce trebuie „absolut tot” în DB

- Fiecare **template** cu **toți pașii** (fiecare step = un rând cu toate prețurile).
- Fiecare **job** cu toate câmpurile (inclusiv floor, location, sqm, linearMeters, specification, description, targetCompletionDate, cost type/value, responsibleId, status).
- **Asocierea job–template** (care template-uri sunt alese pentru job): tabel many-to-many.
- **Asocierea job–workers** (care workers sunt alocați): tabel many-to-many.
- **Audit:** created_at, created_by; pentru template/job și eventual **updated_at**, **updated_by**.
- **Referințe:** projects (există), users (există), floors, supervisors, workers, worker categories, cost types, job statuses – toate în tabele sau view-uri clare.

---

## 2. Schema bazei de date (PostgreSQL)

Convenții: `id` SERIAL/BIGSERIAL PRIMARY KEY unde nu se specifică altfel. Toate tabelele QA pot avea prefix `qa_` pentru claritate (opțional).

### 2.1 Tabele lookup / referință (stocate în DB, folosite peste tot)

```sql
-- Categorii workers (Fixers, Plaster, Electricians, Painters)
qa_worker_categories (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(50) UNIQUE NOT NULL,   -- fixers, plaster, electricians, painters
  label      VARCHAR(255) NOT NULL
);

-- Tip cost (day, hour, price)
qa_cost_types (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(50) UNIQUE NOT NULL,
  label      VARCHAR(255) NOT NULL
);

-- Status job (new, active, completed)
qa_job_statuses (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(50) UNIQUE NOT NULL,
  label      VARCHAR(255) NOT NULL
);

-- Etaje: per proiect sau globale (project_id NULL = global)
qa_floors (
  id         SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE SET NULL,  -- NULL = toate proiectele
  code       VARCHAR(50) NOT NULL,   -- ground, 1, 2, 3
  label      VARCHAR(255) NOT NULL,
  sort_order INT DEFAULT 0
);
-- Index: (project_id), UNIQUE(project_id, code) dacă vrei cod unic per proiect
```

### 2.2 Supervizori și workers (totul în DB)

Opțiuni:

- **A)** Supervizorii și workers sunt **users** (roluri: supervisor / worker) → folosești `users` + eventual `users.role` și un câmp `qa_worker_category_id` pe users pentru workers.
- **B)** Listă separată doar pentru QA (independenți de users) → tabele dedicate.

Planul presupune **B** pentru „orice detaliu” distinct în QA; poți înlocui ulterior cu users dacă unifici.

```sql
-- Supervizori (persoane responsabile pe șantier pentru QA)
qa_supervisors (
  id         SERIAL PRIMARY KEY,
  company_id INT NOT NULL,           -- dacă ai companies; altfel poți lega de project
  name       VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
  -- Opțional: user_id INT REFERENCES users(id)
);

-- Workers (muncitori cu categorie pentru QA)
qa_workers (
  id          SERIAL PRIMARY KEY,
  company_id  INT NOT NULL,
  name        VARCHAR(500) NOT NULL,
  category_id INT NOT NULL REFERENCES qa_worker_categories(id),
  created_at  TIMESTAMP DEFAULT NOW()
  -- Opțional: user_id INT REFERENCES users(id)
);
```

### 2.3 Templates și pași (totul salvat)

```sql
qa_templates (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(500) NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  created_by  INT REFERENCES users(id),   -- sau VARCHAR(255) dacă păstrezi doar username
  updated_at  TIMESTAMP,
  updated_by  INT REFERENCES users(id)
);

-- Un rând per step; ordinea prin sort_order sau id
qa_template_steps (
  id                SERIAL PRIMARY KEY,
  template_id       INT NOT NULL REFERENCES qa_templates(id) ON DELETE CASCADE,
  sort_order        INT NOT NULL DEFAULT 0,
  description       TEXT,
  price_per_m2      VARCHAR(100),   -- păstrat ca în frontend (string)
  price_per_unit    VARCHAR(100),
  price_per_linear  VARCHAR(100),
  step_external_id  VARCHAR(100),   -- id din frontend (step_xxx) pentru idempotență la edit
  created_at        TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_qa_template_steps_template_id ON qa_template_steps(template_id);
```

### 2.4 Jobs și relații (totul salvat)

```sql
qa_jobs (
  id                    SERIAL PRIMARY KEY,
  project_id            INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_number            VARCHAR(50) NOT NULL,   -- J-000001, J-000002...
  floor_id              INT REFERENCES qa_floors(id),   -- sau VARCHAR dacă păstrezi codul direct
  location              VARCHAR(500),
  sqm                   VARCHAR(100),
  linear_meters         VARCHAR(100),
  specification         VARCHAR(500),
  description           TEXT,
  target_completion_date DATE,
  cost_included         BOOLEAN DEFAULT FALSE,
  cost_type_id          INT REFERENCES qa_cost_types(id),
  cost_value            VARCHAR(100),
  responsible_id        INT REFERENCES qa_supervisors(id),
  status_id             INT NOT NULL REFERENCES qa_job_statuses(id),
  created_at            TIMESTAMP DEFAULT NOW(),
  created_by            INT REFERENCES users(id),
  updated_at            TIMESTAMP,
  updated_by            INT REFERENCES users(id),
  CONSTRAINT uq_qa_jobs_project_number UNIQUE (project_id, job_number)
);
CREATE INDEX idx_qa_jobs_project_id ON qa_jobs(project_id);
CREATE INDEX idx_qa_jobs_status_id ON qa_jobs(status_id);
CREATE INDEX idx_qa_jobs_target_date ON qa_jobs(target_completion_date);
```

```sql
-- Job – Template (many-to-many)
qa_job_templates (
  id          SERIAL PRIMARY KEY,
  job_id      INT NOT NULL REFERENCES qa_jobs(id) ON DELETE CASCADE,
  template_id INT NOT NULL REFERENCES qa_templates(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_qa_job_templates UNIQUE (job_id, template_id)
);
CREATE INDEX idx_qa_job_templates_job ON qa_job_templates(job_id);
CREATE INDEX idx_qa_job_templates_template ON qa_job_templates(template_id);
```

```sql
-- Job – Workers (many-to-many)
qa_job_workers (
  id         SERIAL PRIMARY KEY,
  job_id     INT NOT NULL REFERENCES qa_jobs(id) ON DELETE CASCADE,
  worker_id  INT NOT NULL REFERENCES qa_workers(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_qa_job_workers UNIQUE (job_id, worker_id)
);
CREATE INDEX idx_qa_job_workers_job ON qa_job_workers(job_id);
CREATE INDEX idx_qa_job_workers_worker ON qa_job_workers(worker_id);
```

### 2.5 Rezumat tabele

| Tabel | Rol |
|-------|-----|
| `qa_worker_categories` | Lookup categorii workers |
| `qa_cost_types` | Lookup tip cost (day/hour/price) |
| `qa_job_statuses` | Lookup status job |
| `qa_floors` | Etaje (per proiect sau globale) |
| `qa_supervisors` | Supervizori (nume, company) |
| `qa_workers` | Workers (nume, categorie) |
| `qa_templates` | Template-uri QA |
| `qa_template_steps` | Pașii fiecărui template (toate câmpurile) |
| `qa_jobs` | Joburi (toate câmpurile) |
| `qa_job_templates` | Legătura job ↔ template |
| `qa_job_workers` | Legătura job ↔ workers |

Dependențe existente: `projects`, `users` (și eventual `companies` dacă ai company_id).

---

## 3. Ce trebuie pentru backend (resurse și dependențe)

### 3.1 Tehnologii / mediu

- **Bază de date:** PostgreSQL (deja folosită în proiect).
- **Backend:** Node.js + Express (există în `backend/`).
- **Autentificare:** Sesie / JWT (existente). Pentru `created_by` / `updated_by` trebuie user_id (sau username) din request (middleware auth).
- **Compatibilitate:** API-ul trebuie să respecte contractul din `QA-BACKEND-API.md` (rute, corpuri JSON). Frontendul trimite deja `createdBy`; backend-ul poate suprascrie din `req.user`.

### 3.2 Dependențe de date

- **Projects:** Lista de proiecte pentru dropdown vine din API-ul existent de projects (sau un endpoint nou GET `/api/projects` dacă nu există). QA folosește doar `projectId`.
- **Users:** Pentru `created_by` / `updated_by` – trebuie `req.user.id` (sau `req.user.username`) setat de middleware-ul de auth.
- **Company / multi-tenant:** Dacă aplicația e per company, toate tabelele QA care au `company_id` trebuie filtrate după company-ul utilizatorului curent.

### 3.3 Seed / date inițiale

- Inserare în `qa_worker_categories`: fixers, plaster, electricians, painters.
- Inserare în `qa_cost_types`: day, hour, price.
- Inserare în `qa_job_statuses`: new, active, completed.
- Inserare în `qa_floors`: minim Ground, 1, 2, 3 (fie cu `project_id` NULL, fie per proiect).
- (Opțional) Inserare supervizori și workers de test, sau migrare din mock-uri.

---

## 4. Plan de implementare (pași, fără execuție)

### Faza 1 – Baza de date

1. **Scripturi SQL**
   - Creare tabele în ordine: lookup (`qa_worker_categories`, `qa_cost_types`, `qa_job_statuses`, `qa_floors`) → `qa_supervisors`, `qa_workers` → `qa_templates`, `qa_template_steps` → `qa_jobs` → `qa_job_templates`, `qa_job_workers`.
   - Script de seed pentru categorii, cost types, job statuses, eventual floors.
   - (Opțional) Migrare / script de migrare dacă ai versiuni.

2. **Verificare**
   - Rulare scripturi pe DB de dev; verificare constrângeri și indecși.

### Faza 2 – API referințe (totul din DB)

3. **Endpoint-uri pentru dropdown-uri / filtre**
   - GET `/api/qa/projects` sau refolosire GET `/api/projects` – lista proiecte (id, name).
   - GET `/api/qa/floors` cu query `?projectId= optional` – lista etaje (id, code, label).
   - GET `/api/qa/supervisors` – lista supervizori (id, name); filtrat pe company dacă e cazul.
   - GET `/api/qa/workers` – lista workers (id, name, category_id sau category code/label); query `?category= optional` pentru filtru.
   - GET `/api/qa/worker-categories` – lista categorii (id, code, label).
   - GET `/api/qa/cost-types` – lista tipuri cost.
   - GET `/api/qa/job-statuses` – lista statusuri.

4. **Frontend**
   - În loc de date mock, frontendul încarcă aceste liste la deschiderea paginii QA (sau la deschiderea modalei Create Job). Dropdown-urile (proiect, etaj, responsabil, workers, categorii, cost type, status) să folosească răspunsurile API.

### Faza 3 – API Templates (conform QA-BACKEND-API.md)

5. **Rute templates**
   - GET `/api/templates` – listă toate template-urile (cu steps încorporat sau separat).
   - GET `/api/templates/:id` – un template cu steps.
   - POST `/api/templates` – body: name, steps[]; creare template + rânduri în `qa_template_steps`; setare created_by din req.user.
   - PUT `/api/templates/:id` – actualizare name + ștergere/inserare/actualizare steps (păstrare created_at/created_by).
   - DELETE `/api/templates/:id` – ștergere în cascadă steps apoi template.

6. **Mapare JSON ↔ DB**
   - Template: id, name, createdAt (ISO), createdBy (username sau user id).
   - Step: id (sau step_external_id), description, pricePerM2, pricePerUnit, pricePerLinear; ordine prin sort_order.

### Faza 4 – API Jobs (conform QA-BACKEND-API.md)

7. **Rute jobs**
   - GET `/api/jobs?projectId=:projectId` – listă joburi pentru proiect; fiecare job cu templateIds[], workerIds[], floor (id sau code), costType (code), status (code), etc.
   - GET `/api/jobs/:id` – un job cu toate relațiile.
   - POST `/api/jobs` – body: toate câmpurile (fără id); generare job_number (J-000001, …) per proiect; inserare în `qa_jobs` + `qa_job_templates` + `qa_job_workers`; created_by din req.user.
   - PUT `/api/jobs/:id` – update parțial (minim status); eventual toate câmpurile editabile; updated_at, updated_by.
   - DELETE `/api/jobs/:id` – ștergere în cascadă job_templates, job_workers, apoi job.

8. **Mapare JSON ↔ DB**
   - Job: projectId → project_id, jobNumber → job_number, floor → floor_id (sau cod stocat), location, sqm, linearMeters, specification, description, targetCompletionDate, costIncluded, costType (code → cost_type_id), costValue, responsibleId → responsible_id, status (code → status_id), createdAt, createdBy.
   - templateIds[] → inserare în `qa_job_templates`.
   - workerIds[] → inserare în `qa_job_workers`.

### Faza 5 – Integrare frontend

9. **Config**
   - Setare `window.QA_CONFIG = { useBackend: true, apiBase: '/api' };` (sau prefixul corect pentru QA, ex. `/api/qa` dacă grupezi sub un router).

10. **Încărcare date referință**
    - La încărcarea paginii QA: fetch projects, floors, supervisors, workers, worker-categories (și eventual cost-types, job-statuses dacă sunt folosite în formulare). Populare dropdown-uri și listă workers cu categorii.

11. **Compatibilitate API**
    - Verificare că răspunsurile GET/POST/PUT pentru templates și jobs respectă exact structura așteptată de frontend (nume câmpuri: camelCase sau snake_case dacă frontendul le mapează). Documentație: `QA-BACKEND-API.md`.

### Faza 6 – Opțional / îmbunătățiri

12. **GET next job number**
    - GET `/api/jobs/next-number?projectId=:projectId` – returnare `{ "jobNumber": "J-000003" }` (calculat din MAX(job_number) per proiect). Frontendul poate folosi acest endpoint în loc să calculeze din listă.

13. **Audit**
    - updated_at / updated_by la fiecare PUT pe template și job.

14. **Permisiuni**
    - Restricționare rute QA după rol (doar manager / doar anumite companii); 401/403 cu mesaj JSON.

15. **Export price list**
    - Exportul CSV „Create price list” poate rămâne în frontend (folosind GET `/api/templates`); sau endpoint GET `/api/templates/export/csv` care returnează fișierul generat pe server.

---

## 5. Ordinea recomandată (rezumat)

1. Creare tabele + seed lookup (categorii, cost types, statuses, floors).
2. Creare tabele qa_supervisors, qa_workers (+ seed dacă e cazul).
3. Creare qa_templates, qa_template_steps.
4. Creare qa_jobs, qa_job_templates, qa_job_workers.
5. Implementare API referințe (projects, floors, supervisors, workers, categories).
6. Implementare API templates (CRUD).
7. Implementare API jobs (CRUD + mapare relații).
8. Conectare frontend (QA_CONFIG.useBackend, încărcare dropdown-uri din API).
9. Testare end-to-end și ajustări (nume câmpuri, ordine, filtre).

---

## 6. Fișiere de creat (sugestie, fără a executa)

- `scripts/create_qa_tables.sql` – toate tabelele QA (sau separate: lookup, templates, jobs).
- `scripts/seed_qa_lookup.sql` – categorii, cost types, job statuses, floors.
- `backend/routes/qaRoutes.js` sau `templatesRoutes.js` + `jobsRoutes.js`.
- `backend/controllers/qaTemplatesController.js`, `qaJobsController.js`, eventual `qaReferencesController.js`.
- Middleware auth pe rutele QA (dacă nu e deja global).
- (Opțional) `backend/models/` sau mapping clar JSON ↔ rânduri DB în controllere.

---

**Notă:** Acest document este doar planificare. Implementarea efectivă (cod backend, migrări, teste) se face separat, conform acestui plan și al contractului din `QA-BACKEND-API.md`.
