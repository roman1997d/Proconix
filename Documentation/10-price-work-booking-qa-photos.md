# Price work booking — cantități QA, poze dovadă, Work Logs & factură

**Ultima actualizare:** 5 aprilie 2026

Documentează modulul **Price work booking** din dashboard-ul operativ (flux „QA price work” legat de joburi QA), persistența **`stepPhotoUrls`** în **`work_logs.timesheet_jobs`**, și unde apar pozele în aplicație (manager, QA, email/PDF).

---

## 1. Scop

- Operativul rezervă cantități pe pași de șablon (m², linear m, units) pentru joburi QA la care este alocat.
- Poate atașa **dovezi foto** pe pas (una sau mai multe imagini per pas).
- Datele intră în work log-ul trimis managerului; după aprobare alimentează și **QA Jobs** (totaluri și linii de booking).

---

## 2. Flux utilizator (operativ)

1. **Log Work** → **Price work booking** se deschide modalul dedicat.
2. Faza **pick**: se alege un QA job din listă (intro scurt explică plafonul *remaining*).
3. Faza **form**: pentru fiecare pas facturabil — câmpuri numerice + secțiune **Photo evidence (optional)**; **Add photos** deschide selectorul de fișiere; după upload apar miniaturi cu buton **Remove** (X).
4. **Save booking for this job** salvează linia în lista temporară a intrării de work log; poți adăuga alt job sau **Overview**.
5. La **Submit** pe work log, `priceWorkJobs` se trimite în API împreună cu restul câmpurilor.

---

## 3. Structură JSON (`timesheet_jobs`)

În `work_logs.timesheet_jobs` (JSONB, array) există un bloc:

```json
{
  "type": "qa_price_work",
  "entries": [
    {
      "qaJobId": "...",
      "jobNumber": "...",
      "jobTitle": "...",
      "stepQuantities": { "templateId:stepKey": { "m2", "linear", "units" } },
      "stepLabels": { ... },
      "stepPhotoUrls": { "templateId:stepKey": ["/uploads/worklogs/...", "..."] }
    }
  ]
}
```

- **`stepPhotoUrls`**: chei aliniate cu `stepQuantities` (aceeași convenție ca `GET /api/operatives/qa/assigned-jobs`: `templateId` + `step_external_id` sau id intern).
- Backend acceptă și aliasuri **snake_case** la primire: `price_work_jobs`, `step_photo_urls` (normalizate la `stepPhotoUrls` la salvare).

---

## 4. Backend (referință)

| Zonă | Detaliu |
|------|---------|
| **Încărcare fișier** | `POST /api/operatives/work-log/upload` (multer → `backend/uploads/worklogs/`) → răspuns `{ success, path }` cu `path` de forma `/uploads/worklogs/<filename>`. |
| **Creare work log** | `POST /api/operatives/work-log` — `priceWorkJobs` validat; se concatenează în payload-ul `timesheet_jobs` ca `qa_price_work`. |
| **Factură email** | `POST /api/operatives/work-log/:id/send-invoice-copy` — citește `timesheet_jobs`, construiește `photoGroups` din `stepPhotoUrls`; PDF: `buildWorkLogInvoicePdfBuffer` + `renderWorkLogInvoice` (`proconixPdfTemplate.js`), imagini din disc via path `/uploads/...`. |
| **Manager Work Logs** | `GET /api/worklogs/*` — `timesheetJobs` parse din coloană, fără strip la câmpuri nested. |
| **QA job** | `GET /api/jobs/:id` — `fetchApprovedQaPriceWorkFullData`: agregă din work log-uri **approved**; `bookedStepDetails` include `photoUrls` per linie de pas. |
| **Ștergere fișiere** | La `DELETE /api/worklogs/:id`, colectare căi din `stepPhotoUrls` în `step_photo_urls` (vezi `worklogsController.js` — `collectPathsFromTimesheetJobs`). |

---

## 5. Frontend operativ (`operative_dashboard.html` / `operative_dashboard.js`)

- **Modal Price work booking**: header job cu etichetă „BOOKING”, subtitlu explicativ, pași în `<section>` cu badge numeric, grid responsive pentru câmpuri, etichete `for`/`id` pe inputuri, `inputmode` decimal/numeric.
- **Poze**: previzualizare imediată (blob), apoi înlocuire cu URL server; **nu** se apelează `URL.revokeObjectURL` pe blob înainte de a seta noul `src` — se folosește `revokeBlobWhenImgSettles` (load/error + timeout de siguranță).
- **Normalizare path**: `normalizeWorklogUploadPath` — dacă lipsește `/` inițial la `uploads/`, se prefixează `/`.
- **Evenimente**: delegare `change` pe `#op-pwb-steps` (sau fallback modal) pentru `input.op-pwb-photo-input`.
- **Colectare la submit**: `collectPwbStepPhotoUrls` include doar URL-uri care încep cu `/uploads/` (exclude blob și rânduri încă în upload).

**Fișiere CSS relevante:** `frontend/css/operative_dashboard.css` — clase `.op-pwb-*`, chip-uri foto, buton remove.

---

## 6. Alte UI-uri care consumă pozele

| Loc | Fișier / zonă |
|-----|----------------|
| **Work Logs — detalii job** | `frontend/js/worklogs.js` — `renderQaPriceWorkHtml` (miniaturi + link). |
| **QA — drawer job** | `frontend/js/quality_assurance.js` — `formatJobStepQuantitiesReadonly`: se afișează liniile de booking cu `photoUrls`; nu se ascunde pasul doar pentru că lipsesc liniile de cantitate dacă există linii de booking (inclusiv doar poze). |

---

## 7. Migrări SQL

Nu este nevoie de **script nou** doar pentru aceste funcții dacă tabelul **`work_logs`** are deja coloana **`timesheet_jobs`** (vezi `scripts/` existente / `Documentation/README.md` — secțiunea Work Logs). Dacă coloana lipsește, rulezi migrările standard pentru work logs din proiect.

---

## 8. Fișiere atinse (revizie 2026-Q2)

| Tip | Fișiere |
|-----|---------|
| Frontend | `frontend/operative_dashboard.html`, `frontend/js/operative_dashboard.js`, `frontend/css/operative_dashboard.css`, `frontend/js/worklogs.js`, `frontend/js/quality_assurance.js` |
| Backend | `backend/controllers/operativeDashboardController.js`, `backend/controllers/worklogsController.js`, `backend/controllers/qaController.js` |

---

## 9. Întreținere

- La schimbare convenție chei pas (`templateId:stepId`), aliniați **assigned-jobs**, **createWorkLog**, **QA drawer** și **worklogs** render.
- La schimbare folder upload, actualizați `uploadWorklogFile`, `express.static` pentru `/uploads`, și normalizarea path-urilor în PDF/email.
