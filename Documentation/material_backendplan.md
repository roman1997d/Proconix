# Plan backend: Material Management

Plan pas cu pas pentru implementarea API-ului și bazei de date pentru Material Management, incluzând audit (cine a adăugat/modificat/șters, când).

---

## 1. Baza de date

### 1.1 Tabele existente folosite

- **projects** – deja există; are `id`, `company_id`, `name`, `address`, etc. Proiectele companiei sunt folosite pentru dropdown și pentru a lega materialele.
- **Managers/Users** – există deja un mecanism de autentificare manager (ex. `managers` sau `users` cu rol); folosim `id` și `name` (sau email) pentru câmpurile de audit.

### 1.2 Tabele noi

#### A. `material_categories`

Categorii de materiale, per companie (comune pentru toate proiectele companiei).

| Coloană           | Tip            | Notă |
|-------------------|----------------|------|
| id                | UUID sau SERIAL| PK   |
| company_id        | (tipul din DB) | FK → companies, NOT NULL |
| name              | VARCHAR        | NOT NULL |
| description       | TEXT           | opțional |
| created_at        | TIMESTAMPTZ    | NOT NULL, default now() |
| created_by_id     | (tipul user)   | FK → managers/users, NOT NULL |
| created_by_name   | VARCHAR        | NOT NULL (snapshot la creare) |
| updated_at        | TIMESTAMPTZ    | NOT NULL, default now() |
| updated_by_id     | (tipul user)   | nullable, FK → managers/users |
| updated_by_name   | VARCHAR        | nullable (snapshot la ultima modificare) |
| deleted_at        | TIMESTAMPTZ    | nullable; dacă setat = șters (soft delete) |
| deleted_by_id     | (tipul user)   | nullable |
| deleted_by_name   | VARCHAR        | nullable |

- Index: `(company_id)`, eventual `(company_id, deleted_at)` pentru listă activă.

#### B. `material_suppliers`

Furnizori, per companie.

| Coloană           | Tip            | Notă |
|-------------------|----------------|------|
| id                | UUID sau SERIAL| PK   |
| company_id        | (tipul din DB) | FK → companies, NOT NULL |
| name              | VARCHAR        | NOT NULL |
| contact           | VARCHAR        | persoană de contact |
| email_phone       | VARCHAR        | email sau telefon |
| address           | TEXT           | opțional |
| created_at        | TIMESTAMPTZ    | NOT NULL, default now() |
| created_by_id     | (tipul user)   | FK, NOT NULL |
| created_by_name   | VARCHAR        | NOT NULL |
| updated_at        | TIMESTAMPTZ    | NOT NULL, default now() |
| updated_by_id     | (tipul user)   | nullable |
| updated_by_name   | VARCHAR        | nullable |
| deleted_at        | TIMESTAMPTZ    | nullable, soft delete |
| deleted_by_id     | (tipul user)   | nullable |
| deleted_by_name   | VARCHAR        | nullable |

- Index: `(company_id)`, eventual `(company_id, deleted_at)`.

#### C. `materials`

Materiale (stoc) per proiect. Fiecare rând = un tip de material pe un proiect.

| Coloană             | Tip            | Notă |
|---------------------|----------------|------|
| id                  | UUID sau SERIAL| PK   |
| project_id          | (tipul din DB) | FK → projects, NOT NULL |
| company_id          | (tipul din DB) | FK → companies, NOT NULL (redundant dar util pentru filtre) |
| name                | VARCHAR        | NOT NULL |
| category_id         | FK             | nullable → material_categories.id |
| supplier_id         | FK             | nullable → material_suppliers.id |
| unit                | VARCHAR        | NOT NULL (ex. kg, m, buc) |
| quantity_initial    | NUMERIC        | NOT NULL, >= 0 |
| quantity_used       | NUMERIC        | NOT NULL, >= 0 |
| quantity_remaining  | NUMERIC        | NOT NULL, >= 0 |
| low_stock_threshold | NUMERIC        | nullable, >= 0 |
| status              | VARCHAR        | NOT NULL, ex. 'normal' \| 'low' \| 'out' |
| email_notify        | BOOLEAN        | NOT NULL, default false |
| created_at          | TIMESTAMPTZ    | NOT NULL, default now() |
| created_by_id       | (tipul user)   | NOT NULL |
| created_by_name     | VARCHAR        | NOT NULL |
| updated_at          | TIMESTAMPTZ    | NOT NULL, default now() |
| updated_by_id       | (tipul user)   | nullable |
| updated_by_name     | VARCHAR        | nullable |
| deleted_at          | TIMESTAMPTZ    | nullable, soft delete |
| deleted_by_id       | (tipul user)   | nullable |
| deleted_by_name     | VARCHAR        | nullable |

- Constraint: `quantity_remaining = quantity_initial - quantity_used` (sau trigger care actualizează status).
- Index: `(project_id)`, `(project_id, deleted_at)`; eventual `(company_id, deleted_at)`.

### 1.3 Migrare SQL

- Un singur fișier, ex. `backend/migrations/YYYYMMDD_material_tables.sql` sau `backend/sql/material_tables.sql`.
- Conține: `CREATE TABLE` pentru cele 3 tabele, indexuri, FK-uri, eventual trigger pentru `updated_at` și pentru calculul `status` (sau status setat în aplicație la insert/update).

---

## 2. Autentificare și autorizare

- Toate rutele Material Management sunt pentru **manager** (dashboard manager).
- Request-ul trebuie să conțină identificatorul managerului (ex. header `X-Manager-Id` sau sesiune JWT cu `manager_id`).
- **Reguli:**
  - `company_id` al managerului se obține din tabelul managers/users (manager → company_id).
  - Orice listare (proiecte, categorii, furnizori, materiale) se filtrează după `company_id` al managerului.
  - Proiectele returnate la `GET /api/materials/projects` sunt doar cele din `projects` unde `company_id = company_id` al managerului.
  - Categorii/furnizori: doar unde `company_id` = company manager.
  - Materiale: doar pentru proiecte care aparțin companiei managerului (prin `project_id` → `projects.company_id` sau prin `materials.company_id`).

---

## 3. API – contract (endpoints)

Baza URL: **`/api/materials`**. Toate cererile necesită autentificare manager (ex. header `X-Manager-Id`, eventual `X-Manager-Email`).

### 3.1 Proiecte

- **GET /api/materials/projects**  
  - Răspuns: `{ "success": true, "projects": [ { "id", "name", "address" } ] }`.  
  - Sursă: `projects` unde `company_id = manager.company_id`, activ (dacă există câmp `active`/`deleted_at`, exclude șterse).

### 3.2 Categorii

- **GET /api/materials/categories**  
  - Răspuns: `[ { "id", "name", "description" } ]` – doar categorii unde `company_id = manager.company_id` și `deleted_at IS NULL`.
- **POST /api/materials/categories**  
  - Body: `{ "name", "description" }`.  
  - Creare cu `company_id` din manager, `created_by_id`, `created_by_name` din sesiune, `created_at`/`updated_at` = now().

### 3.3 Furnizori

- **GET /api/materials/suppliers**  
  - Răspuns: `[ { "id", "name", "contact", "emailPhone", "address" } ]` – doar furnizori ai companiei, `deleted_at IS NULL`.
- **POST /api/materials/suppliers**  
  - Body: `{ "name", "contact", "emailPhone", "address" }`.  
  - La creare: setat `company_id`, `created_by_*`, `updated_at`.

### 3.4 Materiale

- **GET /api/materials?projectId=**  
  - Query: `projectId` obligatoriu.  
  - Verificare: proiectul aparține companiei managerului.  
  - Răspuns: array de materiale cu: `id`, `name`, `categoryId`, `categoryName`, `supplierId`, `supplierName`, `unit`, `quantityInitial`, `quantityUsed`, `quantityRemaining`, `lowStockThreshold`, `status`, `emailNotify`.  
  - Doar rânduri cu `deleted_at IS NULL`.  
  - `categoryName` / `supplierName` din JOIN cu `material_categories` / `material_suppliers`.

- **POST /api/materials**  
  - Body: `{ "projectId", "name", "categoryId", "supplierId", "unit", "quantityInitial", "lowStockThreshold", "emailNotify" }`.  
  - Verificare: `project_id` și opțional `category_id`/`supplier_id` aparțin companiei managerului.  
  - Calcul: `quantity_used = 0`, `quantity_remaining = quantity_initial`, `status` = 'normal' \| 'low' \| 'out' după regulă (ex. remaining <= 0 → 'out', remaining <= threshold → 'low').  
  - Setat: `created_by_*`, `updated_by_*`, `company_id` din proiect.

- **PUT /api/materials/:id**  
  - Body: parțial – ex. `name`, `categoryId`, `supplierId`, `unit`, `quantityInitial`, `quantityUsed`, `quantityRemaining`, `lowStockThreshold`, `emailNotify`.  
  - Verificare: materialul există și aparține unei companii care e a managerului.  
  - La update: recalculare `status`; setat `updated_at`, `updated_by_id`, `updated_by_name`.

- **DELETE /api/materials/:id**  
  - Soft delete: setat `deleted_at = now()`, `deleted_by_id`, `deleted_by_name`.  
  - Răspuns: 204 No Content.  
  - Verificare: materialul aparține companiei managerului.

### 3.5 Forecast (opțional)

- **GET /api/materials/forecast?projectId=**  
  - Răspuns: `{ "thisWeek", "lastWeek" }` – poate fi 0/0 dacă nu există logic de forecast; frontend-ul acceptă și răspuns gol.

---

## 4. Ordinea implementării (pași)

### Pas 1: Migrare DB

1. Creezi fișierul SQL (ex. `backend/migrations/..._material_tables.sql`) cu cele 3 tabele, indexuri și FK-uri.
2. Verifici că tabelele `projects` și `companies` (sau echivalent) există și că tipurile pentru `company_id` / `project_id` / user id sunt corecte.
3. Rulezi migrarea pe DB (manual sau prin script).

### Pas 2: Helper auth / company

1. În backend, un middleware sau helper care din header/sesiune extrage `manager_id` (și eventual `manager_name`/email).
2. Un helper care returnează `company_id` pentru acel manager (query la `managers`/`users`).
3. Toate rutele materials folosesc acest `company_id` pentru filtrare și pentru câmpurile `created_by_*` / `updated_by_*` / `deleted_by_*`.

### Pas 3: Controller materials

1. Creezi `backend/controllers/materialsController.js` (sau `materialController.js`).
2. Funcții pentru fiecare endpoint:  
   - getProjects  
   - getCategories, createCategory  
   - getSuppliers, createSupplier  
   - getMaterials, createMaterial, updateMaterial, deleteMaterial  
   - getForecast (opțional, poate returna { thisWeek: 0, lastWeek: 0 })
3. În fiecare funcție: obții `company_id` din manager; la create/update/delete completezi câmpurile de audit (`created_by_*`, `updated_by_*`, `deleted_by_*`, `*_at`).
4. Pentru GET-uri: filtrezi mereu după `company_id` și `deleted_at IS NULL` unde e cazul.

### Pas 4: Rute

1. Creezi `backend/routes/materialsRoutes.js`.
2. Definesți rutele:  
   - GET `/projects`  
   - GET/POST `/categories`  
   - GET/POST `/suppliers`  
   - GET `/` (query projectId), POST `/`, PUT `/:id`, DELETE `/:id`  
   - GET `/forecast` (query projectId)
3. Toate rutele trec prin middleware-ul de autentificare manager.
4. În `server.js`: `app.use('/api/materials', materialsRoutes)`.

### Pas 5: Validare și erori

1. Validare body la POST/PUT (ex. name obligatoriu, quantity >= 0, projectId obligatoriu la POST material).
2. La 401 (neautentificat): răspuns JSON cu mesaj „Session expired” sau similar, ca în frontend.
3. La 403/404 (proiect sau material care nu aparține companiei): răspuns JSON clar.
4. La 500: mesaj generic, detaliu în log.

### Pas 6: Testare

1. Testezi cu frontend-ul: `MATERIAL_USE_MOCK = false`, sesiune manager setată.
2. Verifici: listare proiecte, categorii, furnizori; CRUD material; soft delete; că listările sunt filtrate corect pe companie.
3. Verifici în DB că `created_by_*`, `updated_at`, `deleted_at`/`deleted_by_*` se completează corect.

---

## 5. Rezumat

- **DB:** 3 tabele noi (`material_categories`, `material_suppliers`, `materials`), toate cu `company_id`, plus câmpuri audit (created_by, updated_by, deleted_at/deleted_by) și pentru materiale: unit, qty initial/used/remaining, status.
- **API:** sub `/api/materials` – projects, categories, suppliers, materials CRUD, forecast; toate filtrate după compania managerului și folosind soft delete unde e cazul.
- **Implementare:** migrare SQL → auth/company helper → controller → rute → montare în server → validare/erori → testare cu frontend.

După ce acest plan e implementat, frontend-ul existent (cu `USE_MOCK = false`) va comunica direct cu backend-ul fără modificări de contract.
