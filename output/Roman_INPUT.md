# Roman_INPUT — checklist integrare mobilă ↔ backend Proconix

Completare pentru Cursor / integrare. Referință tehnică: **`proconix_mobile_instructions/start_back_end.md`** (în repo; echivalent checklist „mobile start backend”). Ultima actualizare: completat automat unde s-a putut din cod + URL-uri site.

---

## 1. Rețea

- [ ] **URL complet de bază la dev** pe mașina ta locală — exemplu tipic:  
  `http://10.0.2.2:3000` (Android emulator către PC dacă Node rulează pe port **3000**)  
  sau `http://192.168.x.x:3000` (telefon fizic; înlocuiești `x.x` cu IP-ul laptopului).
- [x] **Port implicit server Node în repo**: **`3000`** dacă lipsește `PORT` în `.env` (`backend/server.js`). Alte deployment-uri pot folosi **8080** dacă `PORT=8080`.
- [x] **Production / VPS — hostname-uri cunoscute (landing + API același stack)**  
  - Site: **[https://proconix.uk/](https://proconix.uk/)**  
  - Alternativ HTTP pe IP: **`http://217.154.35.142/`**  
  **Baza API probabilă**: **`https://proconix.uk`** sau **`http://217.154.35.142`** → path-uri **`/api/...`** (ex. `GET /api/health`).  
  **[ ] Confirmă tu** că `GET https://proconix.uk/api/health` (și/sau IP) returnează JSON `status: ok` din app/rețea mobilă — depinde de nginx/firewall.

**Fără slash final** pe „API base” în client: exemplu `https://proconix.uk` + concatenate `/api/operatives/login`.

---

## 2. API documentat în repo — confirmare contract

- [x] **Da**, contractul din **`proconix_mobile_instructions/start_back_end.md`** este sursa tehnică: prefix **`/api`**, **fără `/v1`**, login **`POST /api/operatives/login`**, token **opaque**, header **`X-Operative-Token`** sau **`Authorization: Bearer`**, **`GET /api/operatives/me`**, work log **`POST /api/operatives/work-log`**, upload **`POST /api/operatives/work-log/upload`**, etc.

- [ ] **Diferențe față de ce rulează pe serverul tău live** (completează dacă ai schimbat ceva manual):  
  _…_

---

## 3. Work log

- [x] **Exemplu JSON minim** — vezi secțiunea **1.1** din `start_back_end.md` (copy-paste acolo).

- [x] **Ordine poze**: da — întâi **`POST /api/operatives/work-log/upload`** (multipart, câmp **`file`**), răspuns **`{ success, path }`**, apoi în JSON-ul work-log pui **`photoUrls`** și/sau **`photos`** pe intrările din **`timesheetJobs`** cu acele path-uri string.

- [ ] **Exemplu real din Postman** (opțional, dacă vrei să validezi pe mediul tău):  
  _…_

---

## 4. Secrete / conturi (doar dev local / sandbox)

- [ ] **Email + parolă cont de test** (nu credențiale producție):  
  _…_

*(Nu completat de AI — introdu tu un cont dedicat sandbox.)*

---

## 5. Ce face integrarea după completare

- [ ] Actualizezi `appConfig` (URL, `useMockApi: false`).
- [ ] Verifici maparea endpoint-uri vs `start_back_end.md`.
- [ ] Legi upload multipart work log — formă răspuns: **`{ "success": true, "path": "/uploads/worklogs/..." }`** (`operativeDashboardController.workLogUpload`).

---

## Cursor → Roman (întrebări deschise — răspuns scurt aici sau în secțiunile de mai sus)

Contractul API e acoperit; mai jos **linia unică dev**, **prod default**, **sandbox**, **note rețea**.

### Dev — o singură linie „adevăr” *(Roman)*

- [ ] **URL-ul pe care îl folosesc eu acum din app** (host fără `/api`; clientul concatenează `/api/...`):  
  **`________________________________________________________________`**

  *Ghizi:* iOS sim → `http://127.0.0.1:3000` · Android emu → `http://10.0.2.2:3000` · telefon fizic → `http://<IP-LAN-PC>:3000`

- [ ] **PORT efectiv la mine acum:** **`____`**  
  *(În repo nu există `.env` versionat; din cod: `process.env.PORT || 3000`. Dacă în client aveai **8080**, aliniază fie `.env` cu `PORT=8080`, fie `appConfig` cu **3000**.)*

### Producție — default `appConfig` pentru `__DEV__ === false` *(Roman)*

- [ ] Aleg explicit **baza API** (fără slash final):

  - **Recomandat (TLS + ATS iOS):** `https://proconix.uk`  
  - **Alternativ HTTP pe IP:** `http://217.154.35.142` (poate necesita excepții ATS pe iOS)

- **Default propus pentru release** *(bifează sau schimbă):* [ ] `https://proconix.uk` · [ ] `http://217.154.35.142`

### Sandbox (secțiunea 4 checklist) *(opțional)*

- [ ] Cont de test echipă: email `________________` · parolă `________________`  
  **sau** scrie în chat / note: **„nu pun credențiale în fișier”** — integrarea merge fără; sunt doar pentru test comun.

### Note rețea / infra *(o frază)*

- [ ] (ex.: nginx `443 → 127.0.0.1:3000`, firewall LAN, VPN)  
  **`________________________________________________________________`**

### După răspuns

Setare așteptată în mobile: **`appConfig.apiBaseUrl`**, **`useMockApi: false`** când testezi contra serverului real; apoi `POST .../work-log/upload` + legare path-uri la submit work-log / cozi offline.

---

## Note pentru Roman

1. **Site marketing** vs **API**: [proconix.uk](https://proconix.uk/) și [217.154.35.142](http://217.154.35.142/) sunt documentate ca puncte de intrare web; API-ul mobil folosește **aceeași origine + `/api`** dacă deployment-ul unifică Node + static (ca în `server.js`).
2. Dacă integrarea cere **doar** fișiere de intrare: citește **`proconix_mobile_instructions/start_back_end.md`** și **`work_entry.md`**, apoi actualizează secțiunile `[ ]` de mai sus și spune-i lui Cursor să continue din branch-ul tău.
