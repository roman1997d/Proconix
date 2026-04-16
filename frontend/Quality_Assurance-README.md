# Quality Assurance Module – Rezumat

## Pagina principală
- **Header:** logo Proconix + link către Dashboard.
- **Titlu:** „Quality Assurance Module”.
- **Select Project:** dropdown (ex.: Project Alpha, Beta, Gamma). Fără proiect selectat, butoanele de acțiune sunt dezactivate.
- **Mesaj:** „You must select a project before creating templates or jobs.”
- **Patru butoane principale** (active doar după selectarea proiectului):
  - **Create Template** (albastru)
  - **Open Existing Template** (gri)
  - **Create Job** (verde)
  - **View Jobs** – deschide lista de joburi pentru proiectul selectat.

---

## 1. Create Template (modal)
- **Template Name** – nume template (obligatoriu).
- **Steps** – pași adăugați unul câte unul:
  - Fiecare step: titlu „Step N”, textarea descriere, trei prețuri opționale:
    - Price per m² (£)
    - Price per unit (£)
    - Price per linear meter (£)
  - Sub fiecare step: buton **„Add more step”** (max 20 steps).
- **Validare la salvare:** nume obligatoriu, cel puțin un step, toate prețurile numerice ≥ 0; erorile se afișează în toast.
- **Footer:** Cancel, Save Template.
- Template-urile se salvează în **localStorage** (`qa_templates`). **Prețul total** se **calculează automat** (suma celor 3 prețuri pe toți pașii). La salvare se adaugă **createdAt** (ISO) și **createdBy** (din `window.qaCurrentUserName`, setat de app la încărcarea utilizatorului).

---

## 2. Open Existing Template (modal)
- **Toolbar:** Search (după nume), Sort by: Name (A–Z / Z–A), Total price (low → high / high → low).
- **Lista de template-uri:** pentru fiecare template se afișează:
  - Nume
  - Număr de steps
  - **Preț total** (calculat din step-uri)
  - **Created:** dată (DD/MM/YYYY) și „by {creator}”
  - Butoane: **Edit**, **Delete**
- **Edit:** formular cu Template Name, Steps (aceeași structură: descriere + 3 prețuri + „Add more step”). Acțiuni: **Cancel**, **Delete**, **Save**.
- **Footer modal:**
  - **Create price list** – descarcă fișier CSV cu lista de prețuri (nume, total, step, descriere, cele 3 prețuri per step).
  - **Close**.

---

## 3. Create Job (modal)
- **Taburi:** Job Details | Templates | Cost | Personnel.

### Tab Job Details
- **Job number** – notă: „Job number will be auto-generated.” (ex. J-000001, J-000002, …).
- **Select Floor** – dropdown (Ground, Floor 1, 2, 3).
- **Location**, **Total sqm**, **Total linear meters**, **Specification**, **Description**.
- **Target completion date** – câmp dată (opțional).

### Tab Templates
- Listă cu checkbox-uri: se pot selecta **unul sau mai multe** template-uri pentru job (opțional).

### Tab Cost
- Bifă: „Do you want to enter the total cost for this job?”
- Dacă da: **Day work** / **Hour work** / **Price work** și câmp corespunzător (days, hours sau total price £).

### Tab Personnel
- **Assign responsible person** – dropdown cu supervizori (un singur responsabil per job).
- **Workers** – listă cu checkbox-uri, filtrare după **categorie**: All, Fixers, Plaster, Electricians, Painters. Selecțiile se păstrează la schimbarea filtrului.

- **Footer:** Cancel, Create Job.
- La salvare: jobul se adaugă în **localStorage** (`qa_jobs`) cu **createdAt**, **createdBy** (din `window.qaCurrentUserName`) și **targetCompletionDate**.

---

## 4. View Jobs (modal, ~80% lățime)
- **Titlu:** „Jobs for Project: {nume proiect}”.
- **Header:** câmp Search (job number, location, specification) + buton Close (X).

### Filtre
- **Filter by Floor** – All floors / Ground / Floor 1, 2, 3.
- **Filter by Cost type** – All / Day work / Hour work / Price work / No cost provided.
- **Filter by Status** – All / New / Active / Completed.
- **Due by:** – câmp dată; afișează doar joburile cu **dată țintă setată** și **dată țintă ≤ data selectată** (trebuie completate până la acea dată).

### Lista de joburi (carduri)
Fiecare card afișează:
- Job number, badge Status (New / Active / Completed)
- Location, Templates used (max 3 + „+ N more”), sqm · linear m
- Cost, Responsible, Workers (număr + tooltip cu nume)
- **Created:** DD/MM/YYYY by {creator}
- **Target completion:** DD/MM/YYYY (sau —)
- Butoane: **View** | **Edit** | **Delete**

### Acțiuni pe job
- **View** – modal read-only **Job details** cu toate câmpurile (inclusiv Created, Target completion, Floor, Templates, Cost, Responsible, Workers, Status).
- **Edit** – modal mic în care se poate schimba doar **Status** (New / Active / Completed); Save / Cancel.
- **Delete** – confirmare, apoi jobul este șters din `qa_jobs` și lista se reîmprospătează.

La deschiderea modalei View Jobs toate filtrele (inclusiv Search și Due by) sunt resetate.

---

## Date și persistare

### Template-uri (`localStorage`: `qa_templates`)
- **Câmpuri:** id, name, steps (fiecare step: id, description, pricePerM2, pricePerUnit, pricePerLinear), createdAt (ISO), createdBy.
- Prețul total **nu** se salvează; se calculează la afișare.

### Joburi (`localStorage`: `qa_jobs`)
- **Câmpuri:** id, projectId, jobNumber, floor, location, sqm, linearMeters, specification, description, **targetCompletionDate**, **createdAt**, **createdBy**, templateIds, costIncluded, costType, costValue, responsibleId, workerIds, status.
- Job number este generat automat (J-000001, J-000002, …).

### Alte date
- **Workers:** date mock (8 persoane) cu categorii: fixers, plaster, electricians, painters.
- **Supervizori:** date mock (3 persoane).
- **Creator (createdBy):** pentru template-uri și joburi se folosește `window.qaCurrentUserName` (trebuie setat de aplicație la încărcarea sesiunii/utilizatorului din DB).

---

## Export
- **Create price list** (în Open Existing Template): generează și descarcă **template-price-list.csv** (UTF-8), cu coloane: Template Name, Total (£), Step, Description, Price per m² (£), Price per unit (£), Price per linear meter (£). Dacă nu există template-uri, se afișează mesaj și nu se descarcă fișier.

---

## Acces
- Modulul se deschide din **Dashboard Manager** prin link-ul **Quality Assurance** din sidebar.

---

## Fișiere
- **Quality_Assurance.html** – pagina, toate modalele și logica JS (templates, jobs, View Jobs, filtre, formatări dată).
- **css/quality_assurance.css** – stilurile modulului (inclusiv carduri job, filtre, meta Created/Target).
- **QA-BACKEND-API.md** – contractul API pentru backend (endpoint-uri, payload-uri) pentru conectare ulterioară.

## Pregătire pentru backend
- Toate operațiunile de date (templates, jobs) trec prin stratul **qaApi** (Promise-based). Implementarea curentă folosește **localStorage**.
- **Config:** `window.QA_CONFIG = { useBackend: false, apiBase: '/api' }`. Când backend-ul este gata: setați `useBackend: true` și `apiBase` la rădăcina API-ului; aplicația va folosi automat **fetch** către endpoint-urile descrise în **QA-BACKEND-API.md**.
- Nu este nevoie să modificați logica UI: doar implementați API-ul pe server și activați `useBackend`.

---

## Note tehnice
- **Format dată afișat:** DD/MM/YYYY (helper `formatJobDate` pentru joburi; `formatCreatedAt` pentru template-uri).
- **Escape** închide orice modal deschis.
- Toast pentru mesaje de eroare/validare la Create Template și la acțiuni în View Jobs.
