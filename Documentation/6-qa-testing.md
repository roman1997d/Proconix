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

### Work Logs (Manager)

| Scenariu | Pași | Rezultat așteptat |
|----------|------|--------------------|
| Acces cu passkey | Work Logs → introducere passkey → Access | Dacă passkey corect: conținutul se afișează; GET /api/worklogs, /api/worklogs/workers |
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

### Operative Dashboard

| Scenariu | Pași | Rezultat așteptat |
|----------|------|--------------------|
| Login operativ | Email + parolă (sau temp) → Submit | 200; sesiune; redirect în dashboard |
| Clock-in / Clock-out | Butoane Clock In / Clock Out | POST work-hours/clock-in, clock-out 200; status actualizat |
| Vizualizare proiect curent | Secțiunea Project / Tasks | GET project/current, tasks 200; date afișate |
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
