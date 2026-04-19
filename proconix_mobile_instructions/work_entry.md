# New work entry – logică pas cu pas

Document derivat din `frontend/operative_dashboard.html` și `frontend/js/operative_dashboard.js` + `backend/controllers/operativeDashboardController.js` (`createWorkLog`). Descrie fluxul **Log Work → New work entry**, inclusiv **Price work booking** (builder QA) și **Time Sheet** (raport + PDF).

---

## 0. Context comun

### 0.1 Când se deschide formularul

- Utilizatorul apasă **New work entry** → se deschide modalul **New work entry** (`op-modal-worklog`).
- Se apelează **`GET /api/operatives/project/current`**:
  - Completează **Worker** (nume operativ) și **Project / Site** (readonly).
  - Dacă proiectul are **`trades`** (etichete), acestea devin opțiunile **Work type** (înlocuiesc lista generică).
  - Altfel se încearcă **`GET /api/operatives/work-types`**; dacă lipșește sau eșuează, UI folosește o listă fixă: *Plastering, Drylining, Fixing, Painting, Electricity, Plumbing, Carpentry, Other*.

### 0.2 Câmpuri obligatorii la submit (ambele fluxuri)

| Câmp | Regulă |
|------|--------|
| Proiect | Trebuie există `currentWorklogProject` (utilizator asignat unui proiect). Altfel: „You are not assigned to a project…” |
| **Work type** | Select obligatoriu |
| **Describe your jobs** (`description`) | Text obligatoriu, non-gol |
| **Total before tax (£)** | Poate fi parsat ca număr; dacă nu e număr valid, se tratează ca `null` |
| **Total after tax (£)** | Pe web: la fiecare modificare a „before tax”, se recalculează automat **`after = before × 0.8`** (două zecimale). Nu e neapărat TVA reală – e comportamentul actual al UI-ului. |

### 0.3 Două „moduri” în același formular (`activeWorklogFlow`)

- **`price`** (implicit): vizibil **Price work booking** (buton care deschide builder-ul QA) + zona **Price Work file** (upload manual PDF/Excel/imagine).
- **`timesheet`**: ascunde upload-ul de fișier „price work”; arată butonul **Open Time Sheet Jobs Builder** care deschide alt modal (Time Sheet Jobs Builder).

Comutarea nu șterge datele deja completate în modul celălalt până la reset la deschiderea din nou a modalului.

### 0.4 Submit final către server

1. Dacă există cale în câmpul ascuns **`invoiceFilePath`** (PDF generat din time sheet) → se folosește aceasta ca `invoiceFilePath`.
2. Altfel, dacă utilizatorul a ales un fișier la **Price Work file** → **`POST /api/operatives/work-log/upload`** (multipart, câmp `file`) → răspuns `{ success, path }`.
3. **`POST /api/operatives/work-log`** cu JSON (vezi secțiunea 4).

După succes:

- Se reîncarcă lista work log-uri.
- Se golesc **`pendingWorklogPhotoUrls`**, **`pendingWorklogTimesheetJobs`**, **`pendingPriceWorkEntries`**.
- Dacă răspunsul conține **`workLogId`**, după ~500 ms se închide modalul work log și se deschide modalul **„Submitted successfully”** cu opțiunea de a trimite copie email factură:  
  - **`POST /api/operatives/work-log/:id/send-invoice-copy`**.

---

## 1. Flux A: **Price work booking** (builder QA)

> În UI butonul se numește **Price work booking**; el deschide modalul **Price work booking** (QA job steps), **nu** înseamnă neapărat doar încărcarea fișierului din `op-wl-document`.

### Pasul A1 – Deschidere builder

- Apăsare **Price work booking** → `openPriceWorkBuilderModal()`:
  - `activeWorklogFlow` devine **`price`**.
  - Se resetează starea locală: liste job-uri QA, job curent, pași etc.
  - Se afișează faza **loading**, apoi **`GET /api/operatives/qa/assigned-jobs`**.

### Pasul A2 – Rezultat `qa/assigned-jobs`

- **`jobs` gol** → mesaj: nu există job-uri QA asignate pe proiect.
- **Toate job-urile au deja o linie în `pendingPriceWorkEntries`** (pentru această sesiune de work log) → mesaj: ai introdus deja cantități pentru toate job-urile; poți trimite work log-ul sau începe altul.
- Altfel → fază **pick**: listă de carduri „Job {number} — {title}”; tap pe un card selectează job-ul.

### Pasul A3 – Formular cantități pe job selectat

- Pentru fiecare **template** al job-ului și fiecare **step** cu preț pozitiv (`pricePerM2` / `pricePerLinear` / `pricePerUnit`), se afișează câmpuri numerice:
  - **m²**, **Linear (m)**, **Units** – doar dimensiunile care au rată de preț > 0.
- **Remaining** afișat per dimensiune vine din **`remainingStepQuantities`** returnat de API pentru acel job, **minus** cantitățile deja puse în **`pendingPriceWorkEntries`** pentru același `qaJobId` (validare client înainte de save).

### Pasul A4 – Dovezi foto (opțional, per pas)

- La selectare fișiere: pentru fiecare imagine, **`POST /api/operatives/work-log/upload`**; după succes, chip-ul trece de la „pending” la URL server (`/uploads/worklogs/...`).
- La submit pe formularul job-ului: se colectează **`stepPhotoUrls`**: map `stepKey → string[]` de URL-uri încărcate.

### Pasul A5 – Salvare job în memoria work log-ului curent (nu trimite încă work log-ul)

- La **Save booking for this job**:
  1. Colectare **`stepQuantities`**: pentru fiecare input `.op-pwb-inp`, cheie = `data-pwb-key`, dimensiune = `data-pwb-dim`, valoare = string din câmp (gol permis).
  2. **`validatePwbStepQuantities`**: nicio cantitate nu poate depăși **remaining efectiv** (după regulile de mai sus).
  3. Se face **`push`** în **`pendingPriceWorkEntries`** cu structură:
     - `qaJobId`, `jobNumber`, `jobTitle`
     - `stepQuantities`
     - `stepLabels` (etichete umane pentru manager)
     - `stepPhotoUrls`
  4. UI: fază **after job** – mesaj salvat + butoane **Add another job** / **Review booking overview**.

### Pasul A6 – Mai multe job-uri sau overview

- **Add another job** → revine la **pick** doar cu job-urile încă **ne**folosite în `pendingPriceWorkEntries`.
- **Review booking overview** → sumar cantități + thumbs foto per pas; **Done — back to work log** închide builder-ul; utilizatorul completează totaluri/descriere în formularul principal și apasă **Submit for manager review**.

### Pasul A7 – Fișier „Price Work document” (opțional, paralel)

- În modul **`price`**, utilizatorul poate încărca manual un fișier (PDF/Excel/imagine) în **`op-wl-document`**. La submit final, dacă **nu** există deja `invoiceFilePath` din PDF time sheet, acest fișier e încărcat și calea devine **`invoiceFilePath`**.

---

## 2. Flux B: **Time Sheet** (Time Sheet Jobs Builder + PDF)

### Pasul B1 – Activare mod time sheet

- Apăsare **Time Sheet** → `setWorklogFlow('timesheet')`:
  - Ascunde **`op-wl-price-upload-wrap`**.
  - Afișează **`op-wl-timesheet-wrap`** cu butonul **Open Time Sheet Jobs Builder**.

### Pasul B2 – Deschidere „Time Sheet Jobs Builder”

- Golește lista de job cards, adaugă **un** job gol, setează **period from / to** la data curentă (ambele), deschide modalul **`op-modal-work-report`**.

### Pasul B3 – Structura unui „job” în builder

Fiecare card (dinamic, „Add another job” adaugă încă unul):

| Câmp | Rol |
|------|-----|
| Location | text |
| Description | text |
| Duration | număr ≥ 0, step 0.25 |
| Unit | `hours` sau `days` |
| Job stage | `ongoing` sau `complete` |
| Progress % | 0–100; ascuns dacă stage ≠ ongoing |
| Photos | max **15** fișiere imagine per job; preview local până la upload |

### Pasul B4 – La **Generate Time Sheet Report** (submit form work report)

1. **Validare**: minim un job; **period from** și **period to** obligatorii (string non-gol din input `date`).
2. Pentru fiecare job se calculează **`totalHours`**:  
   - dacă unitatea e **`days`** → `duration * 8`  
   - dacă e **`hours`** → `duration`  
   (valori NaN tratate ca 0).
3. **`uploadJobPhotosToServer`**: pentru fiecare fișier foto din fiecare job, **`POST /work-log/upload`**; rezultatele se pun în **`job.photoPaths`** și se agregă în **`pendingWorklogPhotoUrls`** (flat list pentru `photoUrls` la submit work log).
4. Se construiește **`pendingWorklogTimesheetJobs`**: array de obiecte `{ location, description, duration, duration_unit, stage, progress_pct, photos: [...paths] }` (fără fișiere brute).
5. **Generare PDF**:
   - Întâi **`POST /api/operatives/timesheet/generate`** cu JSON mare: `jobs` (meta + `photos` ca paths), `total_before_tax`, `total_after_tax`, `work_type`, `notes`, `description`, `period_from`, `period_to`, `workerName`, `project`, `logoDataUrl` (opțional din `window` / localStorage).
   - Dacă răspunsul are **`success`** și un path (`pdfPath` / `pdfUrl` / `path`) → acel path se scrie în **`invoicePathEl`** (hidden), se afișează link „Download generated report”, se închide modalul time sheet, mesaj „PDF report attached…”.
   - Dacă eșuează serverul sau rețeaua → **fallback client**: bibliotecă **jsPDF** în browser generează PDF, apoi blob-ul se încarcă tot prin **`POST /work-log/upload`** și calea se pune la fel în `invoicePathEl`.

### Pasul B5 – Înapoi la formularul principal

- Utilizatorul verifică **Work type**, **Description**, **Total before/after tax** (de obicei aceleași ca înainte de builder; time sheet nu le modifică automat în cod).
- La **Submit for manager review**, `invoiceFilePath` trimis la server = calea PDF generată (prioritar față de upload manual).

---

## 3. Ce trimite exact **`POST /api/operatives/work-log`**

Corp JSON (camelCase – cum construiește frontend-ul):

| Cheie | Semnificație |
|--------|----------------|
| `workType` | string obligatoriu |
| `description` | string |
| `total` | de obicei = total înainte de taxă (număr) |
| `totalBeforeTax` / `totalAfterTax` | numere sau omise |
| `quantity`, `unitPrice` | trimise ca `null` în implementarea actuală |
| `block`, `floor`, `apartment`, `zone` | `null` în fluxul actual din dashboard |
| `photoUrls` | array de string-uri (căi `/uploads/worklogs/...`) – agregat din pozele job-urilor time sheet |
| `timesheetJobs` | array de „job-uri” time sheet (obiecte simple); **fără** bloc QA aici |
| `priceWorkJobs` | array de înregistrări din **Price work booking** (builder QA) |
| `invoiceFilePath` | cale server: PDF generat **sau** fișier încărcat manual |

**Pe server** (`createWorkLog`):

- Rezolvă `companyId`, `projectId`, `workerName` din user + proiect (inclus fallback `project_assignments`).
- Dacă **`priceWorkJobs`** nu e gol → validează cantitățile față de **remaining** și apartenența operativului la job (`validatePriceWorkJobsAgainstRemaining`).
- Construiește **`timesheetPayload`** = copie `timesheetJobs` + dacă există price work: **`push({ type: 'qa_price_work', entries: priceWorkJobs })`**.
- Inserează în `work_logs` cu `timesheet_jobs` = JSON.stringify(`timesheetPayload`), `status` = **`pending`**, `job_display_id` = WL-xxx.

---

## 4. Combinarea fluxurilor (important pentru RN)

- **Poți avea simultan**:
  - **`pendingWorklogTimesheetJobs`** + `photoUrls` (din time sheet), **și**
  - **`pendingPriceWorkEntries`** (din QA builder), **și**
  - un **fișier** la price upload sau **PDF** în `invoicePathEl`,
- …**dacă** utilizatorul le completează pe rând în aceeași sesiune de modal work log. La deschiderea fresh a „New work entry”, toate acestea se resetează.

Recomandare pentru aplicația mobilă: fie **separă clar** pașii (wizard: „1 Time sheet sau 2 QA booking sau 3 Fișier”), fie replicați comportamentul web cu atenție la reset și la ordinea priorității **`invoiceFilePath`** (PDF time sheet bate upload-ul manual dacă e setat).

---

## 5. După submit

- **`GET /api/operatives/work-log`** reîncarcă lista; intrările afișează status, total, link „overview”.
- **`POST .../archive`** pe o intrare o marchează arhivată pentru operativ (dacă migrația DB există).
- Modal opțional **email copie factură** după succes.

---

## 6. Fișiere sursă

| Fișier |
|--------|
| `frontend/js/operative_dashboard.js` – `openWorklogModal`, `setWorklogFlow`, `generateAndUploadWorkReport`, `openPriceWorkBuilderModal`, `formPwbJob`, `formWorklog`, `formWorkReport` |
| `backend/controllers/operativeDashboardController.js` – `workLogUpload`, `createWorkLog`, `validatePriceWorkJobsAgainstRemaining`, `getRemainingStepQuantitiesForQaJob` |
| `backend/routes/operativeRoutes.js` – rute `/work-log`, `/work-log/upload`, `/qa/assigned-jobs`, `/timesheet/generate` |
