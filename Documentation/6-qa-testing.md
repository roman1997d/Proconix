# 6. Documentație QA & testare

## Test cases / scenarii

Ce trebuie să funcționeze și cum se verifică, pe fluxuri principale.

---

### Autentificare manager

| Scenariu | Pași | Rezultat așteptat |
|----------|------|--------------------|
| Login cu date valide | Deschide login_manager.html → email + parolă corecte → Submit | Redirect la dashboard_manager.html; sesiune în localStorage |
| Login cu parolă greșită | Email corect, parolă greșită → Submit | Mesaj de eroare; rămâne pe login |
| Login cu email inexistent | Email neînregistrat → Submit | Mesaj de eroare sau 401 |
| Validare sesiune | După login, deschide dashboard → încarcă modul (ex: Projects) | GET /api/auth/validate 200; conținutul modulului se încarcă |
| Fără sesiune | Șterge localStorage / deschide dashboard fără login | Redirect la login sau mesaj „Access denied” |

---

### CRUD proiecte (Manager)

| Scenariu | Pași | Rezultat așteptat |
|----------|------|--------------------|
| Listă proiecte | Dashboard → Projects | GET /api/projects/list 200; tabel cu proiectele companiei |
| Creare proiect | Add Project → completare nume (obligatoriu), adresă, descriere, date → Save | POST /api/projects/create 200/201; proiectul apare în listă |
| Editare proiect | Click Edit pe un proiect → modificări → Save | PUT /api/projects/:id/update 200; listă actualizată |
| Dezactivare proiect | Deactivate → confirmare | PUT /api/projects/:id/deactivate 200; proiect dezactivat (sau ascuns în listă) |
| Asignare operativ | Pe proiect → Assign → selectare user → Assign | POST /api/projects/:id/assign 200; assignment apare în listă |
| Eliminare asignare | Pe proiect → Remove assignment | DELETE /api/projects/assignment/:id 200; dispare din listă |

---

### Operatives (Manager)

| Scenariu | Pași | Rezultat așteptat |
|----------|------|--------------------|
| Listă operativi | Dashboard → Operatives | GET /api/operatives 200; tabel cu operativi/supervizori ai companiei |
| Adăugare operativ | Add Operative → nume, email, rol → Submit | POST /api/operatives/add 200/201; apare în listă |
| Adăugare supervisor | Add Supervisor → date → Submit | La fel, cu rol de supervisor |
| Editare | Edit pe rând → modificări → Save | PATCH /api/operatives/:id 200 |
| Ștergere | Delete → confirmare | DELETE /api/operatives/:id 200; dispare din listă |

---

### Material Management (Manager)

| Scenariu | Pași | Rezultat așteptat |
|----------|------|--------------------|
| Acces modul | Dashboard → Material Management | Pagina manage_material.html se încarcă (iframe sau tab); GET /api/materials/projects 200 dacă sesiune manager |
| Listă proiecte | Deschide Material Management | Dropdown proiecte populat cu proiectele companiei |
| Listă materiale | Selectează un proiect | GET /api/materials?projectId= 200; tabel materiale + GET /api/materials/forecast pentru Usage last week / Forecast this week |
| Creare categorie | Create Material Category → nume, descriere → Save | POST /api/materials/categories 201; categoria apare în dropdown-uri |
| Creare furnizor | Add Supplier → nume, contact, email/phone, adresă → Save | POST /api/materials/suppliers 201; furnizorul apare în dropdown-uri |
| Adăugare material | Add Material → nume, categorie, furnizor, unitate, cantitate, prag low-stock → Save | POST /api/materials 201; materialul apare în tabel; snapshot în material_consumption pentru ziua curentă |
| Stock check | Pe rând → Stock check → modifică Quantity remaining → Update | PUT /api/materials/:id cu quantityUsed/quantityRemaining; snapshot actualizat; listă reîncărcată |
| Edit full / Edit qty | Edit full sau Edit only qty → modificări → Update | PUT /api/materials/:id; listă actualizată |
| Ștergere material | Delete → confirmare | DELETE /api/materials/:id 204 (soft delete); materialul dispare din listă |
| Forecast | Selectează proiect cu istoric snapshot-uri | GET /api/materials/forecast?projectId= returnează thisWeek, lastWeek (din material_consumption); alertă dacă forecast > stoc |

---

### Work Logs (Manager)

| Scenariu | Pași | Rezultat așteptat |
|----------|------|--------------------|
| Acces cu passkey | Work Logs → introducere passkey → Access | Dacă passkey corect: conținutul se afișează; GET /api/worklogs, /api/worklogs/workers |
| Ștergere definitivă work log | Manager → Job Details → Delete permanently → confirmare | DELETE /api/worklogs/:id — rând șters; fișiere `/uploads/...` asociate eliminate (dacă există) |
| Arhivare operativ | Operativ → My work entries → Archive | POST /api/operatives/work-log/:id/archive — dispare din lista operativului; manager vede badge „Operative archived” |
| PDF pontaj | Operativ → Time Sheet → Generate (backend activ) | POST /api/operatives/timesheet/generate → PDF în uploads; rezumat cu perioadă dd/mm/yy și Total (before tax) |
| Listă și filtre | Selectare worker, dată from/to, proiect, status, search | Lista se filtrează conform parametrilor |
| Detalii job | Click pe un job | GET /api/worklogs/:id; modal cu detalii |
| Editare job | În modal → Edit → modificare quantity/unit price/total → Save | PATCH /api/worklogs/:id 200; edit_history actualizat |
| Aprobare | În modal → Approve | POST /api/worklogs/:id/approve 200; status approved |
| Respingere | În modal → Reject | POST /api/worklogs/:id/reject 200; status rejected |
| Arhivare | Archive (sau bulk) | POST archive 200; joburi arhivate |
| Export / factură | Generate Invoice (dacă implementat) | Conținut pentru print/PDF |

---

### Quality Assurance (Manager)

| Scenariu | Pași | Rezultat așteptat |
|----------|------|--------------------|
| Listă template-uri | Quality Assurance → tab Templates | GET /api/templates 200; listă template-uri |
| Creare template | New template → nume + pași (descriere, prețuri) → Save | POST /api/templates 201; template creat |
| Editare template | Edit template → modificări → Save | PUT /api/templates/:id 200 |
| Ștergere template | Delete template → confirmare | DELETE /api/templates/:id 204 |
| Dropdown proiecte | Select Project | GET /api/projects/list 200; dropdown populat (doar cu sesiune manager) |
| Listă joburi | Selectare proiect → Jobs | GET /api/jobs?projectId= 200 |
| Creare job | New job → project, număr (sau auto), status, etaj, template-uri, workers → Save | POST /api/jobs 201; job creat |
| Editare job | Edit job → modificări (ex: status) → Save | PUT /api/jobs/:id 200 |
| Ștergere job | Delete job → confirmare | DELETE /api/jobs/:id 204 |

---

### Project Overview (Manager Dashboard)

| Scenariu | Pași | Rezultat așteptat |
|----------|------|--------------------|
| Stat cards | Dashboard → Project Overview | GET /api/dashboard/overview-stats 200; valori pentru proiecte, task-uri planning, operatives (din /api/operatives), cost total work logs; grafic doughnut populat din `qa_job_cost_by_type` |
| Task-uri deadline 7 zile | Aceeași pagină | GET /api/dashboard/overview-lists; tabel „Tasks due in the next 7 days” sau mesaj gol |
| Work logs neaprobate | Aceeași pagină | `worklogs_unapproved_queue` în overview-lists; rânduri „Stale” pentru >7 zile |
| Activitate operativi azi | Aceeași pagină | GET /api/dashboard/operative-activity-today; număr + tabel (proiect, clock in, status) |
| Fără sesiune | Header-e lipsă | Carduri „—” sau mesaj sesiune expirată |

### Profile Settings & My Company (Manager)

| Scenariu | Pași | Rezultat așteptat |
|----------|------|--------------------|
| Profil | Profile Settings | GET /api/managers/me 200; schimbare parolă POST /api/managers/change-password; telefon PATCH /api/managers/phone dacă suportat în DB |
| Companie | My Company Settings | GET /api/companies/me 200; formular cu date companie |
| Invite manager | My Company → Add manager | POST /api/managers/invite; general vs site (cu project_id); răspuns cu parolă temporară |

---

### QA Job → Task & Planning Sync (Gantt + Kanban)
| Scenariu | Pași | Rezultat așteptat |
|----------|------|--------------------|
| Auto-create în Planning | Quality Assurance → Create job → Save | Se creează automat `planning_plans(type='daily')` pentru `target_completion_date` și un `planning_plan_tasks` asociat; apare pe `Task_Planning.html` în Gantt și Kanban. |
| Sync status | QA: edit job cu status `active/completed` → Save | Task-ul din Planning se actualizează status (`active → in_progress`, `completed → completed`). |
| Sync delete | QA: Delete job → confirm | Task-ul asociat din Planning dispare (și planul poate fi curățat dacă rămâne fără task-uri). |
| Legătură stabilă (DB) | Verificare în DB | `planning_plan_tasks.qa_job_id` este setat corect pentru joburile create prin QA. |

---

### Task & Planning – poze confirmare (manager + operativ)
| Scenariu | Pași | Rezultat așteptat |
|----------|------|--------------------|
| Operativ – modal task (EN) | Login operativ → click pe un task din listă | Se deschide modal cu etichete în engleză: **Confirmation photos (n / 10)**, **Add photos (max. 10 total)**, butoane **Decline** / **Mark in progress** / **Complete** |
| Operativ – upload + finalizare | Alege imagini → Complete (după progres) | POST `/api/operatives/tasks/:id/photos` 200; la finalizare PATCH cu `action: complete`; pozele apar în `operative_task_photos` |
| Manager – vizualizare poze | Dashboard → Task & Planning → task **completed** cu poze → deschide **Task details** | Secțiune **Confirmation photos** cu miniaturi; GET `/api/planning/plan-tasks/:id/confirmation-photos` 200; click deschide imaginea |

---

### Operative Dashboard
| Scenariu | Pași | Rezultat așteptat |
|----------|------|--------------------|
| Login operativ | Email + parolă (sau temp) → Submit | 200; sesiune; redirect în dashboard |
| Clock-in / Clock-out | Butoane Clock In / Clock Out | POST work-hours/clock-in, clock-out 200; status actualizat |
| Vizualizare proiect curent | Secțiunea Project / Tasks | GET project/current, tasks 200; date afișate |
| Detalii task + acțiuni | Click pe task în listă | GET `/api/operatives/tasks/:id?source=` 200; PATCH status după acțiune; mesaj **Updated.** la succes |
| Raportare issue | Formular issue + opțional fișier → Submit | POST /api/operatives/issues 200; issue în DB |
| Upload document | Upload document → fișier → Submit | POST /api/operatives/uploads 200 |
| Creare work log | Work Log → completare date → Submit | POST /api/operatives/work-log 201 |

---

## Loguri și debugging

### Cum verifici logurile PM2

```bash
# Loguri live (stdout + stderr)
pm2 logs proconix

# Doar erori
pm2 logs proconix --err

# Ultimele N linii
pm2 logs proconix --lines 200

# Informații proces
pm2 show proconix
```

Logurile sunt scrise în directorul configurat de PM2 (ex: `~/.pm2/logs/`).

### Nginx

- **Error log**: de obicei `/var/log/nginx/error.log`.
- **Access log**: `/var/log/nginx/access.log`.
- Verificare config: `sudo nginx -t`.

### Node / backend

- Erorile din controller-e sunt logate cu `console.error` (ex: `console.error('QA createTemplate:', err)`).
- Pentru debugging local: rulează cu `node index.js` și urmărește consola; sau adaugă temporar `console.log(req.body, req.headers)` în middleware/rute.

### Frontend

- **Browser**: F12 → Network tab pentru request-uri și răspunsuri (status, body).
- **Console**: erorile JavaScript și mesajele din `catch` (ex: „Request failed (401): …”) apar în Console.
- La erori API: verifică status code și body-ul răspunsului (JSON cu `message`).

### Urmărirea erorilor

1. **401 la API**: verifică că header-ele X-Manager-Id și X-Manager-Email sunt trimise și că sesiunea din localStorage este validă (manager activ în DB).
2. **500 la API**: verifică logurile Node (PM2 sau consolă); mesajul din `res.json({ message })` apare și în frontend dacă răspunsul e JSON.
3. **DB**: conexiune refuzată → verifică .env (host, port, user, password) și că PostgreSQL rulează; `psql -U postgres -d ProconixDB -c "SELECT 1"`.

---

*Actualizează test cases la adăugarea de funcționalități noi.*

**Actualizat:** 16/03/2026
