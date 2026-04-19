# Roman → Cursor (date pentru conectarea la server)

Fișier pentru integrare React Native ↔ backend Proconix. **Cursor citește acest fișier** când îi spui să continue legătura la API.

**Sursă tehnică repo:** `proconix_mobile_instructions/start_back_end.md` + `proconix_mobile_instructions/work_entry.md` + `proconix_mobile_instructions/back_end.md`.  
*(Nu există `instruction/mobile_start_backend.md` în repo — folosiți căile de mai sus.)*

---

## 1. Rețea (dev)

- **Base URL dev:**  
  *(completează tu pe mediul local)*  
  - **Exemple:**  
    - Simulator **iOS:** `http://127.0.0.1:3000`  
    - Emulator **Android** → PC: `http://10.0.2.2:3000`  
    - **Telefon fizic** (același Wi‑Fi cu laptopul): `http://192.168.x.x:3000` (înlocuiește cu IP-ul real al PC-ului)  
  - Dacă rulezi Node pe **alt port** (ex. 8080), schimbă `3000` cu acel port.

- **Port (dacă nu e implicit):**  
  **Din `backend/server.js`:** `process.env.PORT` sau, dacă lipsește, **`3000`**. Setează `PORT=8080` în `.env` dacă vrei 8080.

- **Base URL producție** *(candidați; verifică cu `GET /api/health` de pe rețeaua clientului):*  
  - `https://proconix.uk` (fără slash final)  
  - `http://217.154.35.142` (acces direct la IP, frecvent HTTP)  
  Rutele API rămân: **`<base>/api/...`** (ex. `https://proconix.uk/api/operatives/login`).

---

## 2. Contract API

- **Folosim `proconix_mobile_instructions/start_back_end.md` ca sursă principală?** **da**

- **Dacă nu — ce s-a urmărit / s-a schimbat?**  
  *(complectează doar dacă pe serverul tău live ai deviat de la `operativeRoutes.js` / controllere)*

```
(lasă gol dacă totul e ca în repo; altfel notează aici path-uri noi, câmpuri noi, etc.)
```

---

## 3. Work log — exemple JSON (din `createWorkLog` + UI)

Câmpuri acceptate: `workType` / `work_type` (obligatoriu), `description`, `total`, `totalBeforeTax`, `totalAfterTax`, `quantity`, `unitPrice`, `photoUrls` / `photo_urls`, `timesheetJobs` / `timesheet_jobs`, `priceWorkJobs` / `price_work_jobs`, `invoiceFilePath` / `invoice_file_path`, opțional `block`, `floor`, `apartment`, `zone`.

Serverul concatenează în DB: dacă există `priceWorkJobs`, adaugă automat în payload JSON `timesheet_jobs` blocul `{ "type": "qa_price_work", "entries": [...] }`.

### Manual

*(doar totaluri + descriere + eventual fișier factură deja încărcat)*

```json
{
  "workType": "Drylining",
  "description": "Boarding Block A — level 4.",
  "total": 480.5,
  "totalBeforeTax": 480.5,
  "totalAfterTax": 384.4,
  "quantity": null,
  "unitPrice": null,
  "photoUrls": [],
  "timesheetJobs": [],
  "priceWorkJobs": [],
  "invoiceFilePath": "/uploads/worklogs/abc.pdf"
}
```

*(Înlocuiește `invoiceFilePath` cu path-ul real returnat după `POST .../work-log/upload`, sau `null` dacă nu ai fișier.)*

### Time sheet

*(după ce ai încărcat pozele per job și ai path-uri server)*

```json
{
  "workType": "Drylining",
  "description": "Weekly time sheet jobs.",
  "total": 1200,
  "totalBeforeTax": 1200,
  "totalAfterTax": 960,
  "quantity": null,
  "unitPrice": null,
  "photoUrls": [
    "/uploads/worklogs/photo1.jpg",
    "/uploads/worklogs/photo2.jpg"
  ],
  "timesheetJobs": [
    {
      "location": "Block A / Floor 2",
      "description": "Metal frame line",
      "duration": 7.5,
      "duration_unit": "hours",
      "stage": "ongoing",
      "progress_pct": 40,
      "photos": [
        "/uploads/worklogs/photo1.jpg"
      ]
    }
  ],
  "priceWorkJobs": [],
  "invoiceFilePath": "/uploads/worklogs/work_report_2026-04-16.pdf"
}
```

*(În UI, PDF-ul raportului time sheet ajunge la `invoiceFilePath`; `photoUrls` poate fi lista flat din toate pozele job-urilor.)*

### Price work *(QA booking — structură minimală tipică)*

*`qaJobId` și `stepQuantities` trebuie să respecte cantitățile rămase — validare server (`validatePriceWorkJobsAgainstRemaining`).*

```json
{
  "workType": "Drylining",
  "description": "QA price work booking for WL submit.",
  "total": 2500,
  "totalBeforeTax": 2500,
  "totalAfterTax": 2000,
  "quantity": null,
  "unitPrice": null,
  "photoUrls": [],
  "timesheetJobs": [],
  "priceWorkJobs": [
    {
      "qaJobId": "42",
      "jobNumber": "QA-001",
      "jobTitle": "Example QA job",
      "stepQuantities": {
        "tplId:stepKey": { "m2": "120", "linear": "", "units": "" }
      },
      "stepLabels": {},
      "stepPhotoUrls": {
        "tplId:stepKey": [
          "/uploads/worklogs/evidence1.jpg"
        ]
      }
    }
  ],
  "invoiceFilePath": null
}
```

*(Înlocuiește cheile step cu cele reale din `GET /api/operatives/qa/assigned-jobs`; `qaJobId` conform jobului tău.)*

### Upload foto — răspuns server după multipart

**Request:** `POST /api/operatives/work-log/upload`  
Headers: `X-Operative-Token: <token>` (sau Bearer).  
Body: **`multipart/form-data`**, câmp **`file`** (un fișier).

**Răspuns 200** (`workLogUpload` în `operativeDashboardController.js`):

```json
{
  "success": true,
  "path": "/uploads/worklogs/1735123456789-abc123.jpg"
}
```

Folosești exact string-ul din **`path`** în `photoUrls`, în `photos[]` pe job-uri time sheet sau în `invoiceFilePath` dacă încarci PDF.

*(Limită mărime work log upload: **10 MB** — `uploadWorklogFile` în `uploadMiddleware.js`.)*

---

## 4. Cont sandbox dev *(doar test)*

- **Email:** *(completează tu — cont dedicat sandbox)*

- **Parolă:** *(completează tu)*

*(Nu folosi credențiale de producție.)*

---

## 5. Note extra

*(firewall pe router, VPN, dacă nginx ascultă pe 443 și face proxy la Node pe 3000, staging separat — scrie ce te blochează la conectare mobilă)*

```
(exemplu: „Port 3000 trebuie deschis în firewall pentru IP LAN”; „HTTPS doar pe proconix.uk, nu pe IP”)
```

---

## 6. Cursor → Roman (raspunsuri finale confirmate)

- **Dev URL "adevar"**: in sesiunea curenta nu exista server backend pornit detectat, deci nu se poate confirma un URL activ din runtime.  
  **Valori recomandate pentru lucru imediat:**
  - iOS simulator: `http://127.0.0.1:3000`
  - Android emulator: `http://10.0.2.2:3000`
  - telefon fizic: `http://<IP-LAN-laptop>:3000`

- **PORT curent `.env`**: `.env` nu este versionat in repo, deci valoarea nu e vizibila aici. Din cod (`backend/server.js`) fallback-ul este **`3000`**.

- **Productie default pentru release (`__DEV__ === false`)**: **`https://proconix.uk`** (recomandat TLS/ATS iOS).  
  `http://217.154.35.142` ramane doar alternativa (HTTP pe IP).

- **Sandbox credențiale**: `nu pun credentiale in fisier`.

- **Nota infra scurta**: daca nu merge pe telefon fizic, cauzele frecvente sunt firewall/VPN sau configurare nginx (443) diferita fata de Node pe 3000.

---

## 7. Config mobil - `appConfig.apiBaseUrl` (scris explicit)

Setare recomandata:

```ts
const appConfig = {
  apiBaseUrl: __DEV__ ? 'http://127.0.0.1:3000' : 'https://proconix.uk',
  useMockApi: false,
};
```

**Notă:** dacă backend-ul **nu** rulează pe portul așteptat (implicit **3000**), **`login`** și **`GET /api/health`** vor eșua — e comportament normal. Pentru un **demo doar cu mock**, pune temporar **`useMockApi: true`** (și revino la `false` când testezi contra serverului real).

Alternative dev dupa device:
- Android emulator: `http://10.0.2.2:3000`
- Telefon fizic: `http://<IP-LAN-laptop>:3000`

---

*Ultima actualizare: completat cu raspunsurile finale + `appConfig.apiBaseUrl`.*
