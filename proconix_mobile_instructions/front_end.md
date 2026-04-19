# React Native – ghid UI/UX (echivalent Operative Dashboard)

Acest document descrie **cum trebuie să arate și să se comporte** aplicația mobilă, pornind de la `frontend/operative_dashboard.html` și `frontend/css/operative_dashboard.css`. Scop: paritate funcțională și coerență vizuală cu dashboard-ul web operativ.

---

## 1. Principii generale

- **Platformă**: telefon primar; zone de atingere min. ~44pt; scroll vertical pe ecranul principal.
- **Autentificare**: după login, persistă token-ul sesiunii (echivalent `localStorage` / secure storage) și trimite-lă la fiecare request API (vezi `back_end.md`).
- **Stări**: loading, empty, error, „cont dezactivat” (ecran full separat, fără restul app-ului).
- **Navigare**: echivalent **bottom tab bar** cu 4 destinații: **Project**, **Clock**, **Work**, **Tasks** (ultimul deschide lista de task-uri, nu doar anchor).
- **Tema**: fundal închis / carduri cu contrast bun; accent **teal/emerald** (`#147563`, `#25b394`, carduri `#ecfbf7` / gradient hero); text principal închis (`#103731`, `#12342f`); muted `#5f7d77` / `var(--op-text-muted)`.
- **Iconițe**: Bootstrap Icons pe web; în RN folosiți **@expo/vector-icons** (Ionicons/Material) mapate semantic (ex. `list-task`, `clock-history`, `building`, `chat-dots`, `bell`).

---

## 2. Shell aplicație

### 2.1 Header fix (sau stack primul ecran)

- **Logo / brand** (stânga) – link opțional „home”.
- **Nume utilizator** (din `/me`) – truncat cu ellipsis.
- **Logout** – icon-only, confirmare opțională.

### 2.2 Ecran „Cont dezactivat”

- Card centrat, icon `person-x`, titlu + text + buton „Back to login”.
- Blochează restul UI până la logout.

---

## 3. Flux principal (scroll) – ordinea secțiunilor

Reproduceți **această ordine** pe un singur ecran „Home” sau echivalent:

| # | Secțiune | Comportament UI |
|---|-----------|-------------------|
| 1 | **Current Project** | Card: titlu + icon `building`. Conținut dinamic (nume proiect, adresă, date, descriere scurtă – ce returnează API). Stare goală: text muted. |
| 2 | **Site chat** | Card tip „hero”: kicker mic „OPERATIVE DASHBOARD”, titlu **Site chat**, hint 1–2 rânduri, **rând butoane**: primar **Open site chat** (full width flex), secundar **notificări** (pătrat, badge roșu pe colț dacă necitite). Sub: **chips** „Project room”, „Team updates”. |
| 3 | **Clock** | Card: status („Clocked in at …” / „Not clocked in”), ore azi, butoane **Clock In** / **Clock Out** (unul vizibil după logică), zonă feedback succes/eroare. |
| 4 | **Drawing Gallery** | Hint + rezumat serie (`op-dg-summary`), buton primar **Open Drawing Gallery** → flux ecran complet / modal (navigare discipline → categorii → listă desene). |
| 5 | **Documents to sign** | Listă linkuri rânduri (titlu + meta deadline). Gol: hint. Tap → ecran semnare PDF (separat, `operative_document_sign.html` pe web). |
| 6 | **My tasks** | Hint + buton primar **View my tasks** → **modal/sheet** listă task-uri (scroll). |
| 7 | **This Week** | Total ore săptămână + bare progres per zi (label stânga, bară, ore dreapta). |
| 8 | **Log Work** | Hint + **New work entry** + subtitlu „My work entries” + listă intrări (tap → overview read-only; acțiuni archive unde e cazul). |
| 9 | **Acțiuni rapide** | Grid 2 coloane: **Report Issue**, **Upload Invoice / Booking** – butoane mari, icon + label. |

**Spacer** jos pentru a nu ascunde conținutul sub bottom tabs.

---

## 4. Modale / ecrane full (mapare 1:1)

### 4.1 Site Chat (full screen recomandat)

- **Header**: back, titlu „Site Chat”, subtitlu nume proiect, toggle **Request only** (stare activă vizibilă), buton notificări cu badge.
- **Feed**: bule mesaje; ale mele aliniate dreapta, fundal diferit; mesaje **material request** cu badge status, sumar, thumbnails poze, **View details**; **file** cu thumbnail dacă e imagine; **system** / Chat Agent cu stil distinct (reminder roșu pentru „Undelivered request”).
- **Composer**: input text, atașament, **Request**, send.
- **Toast** discret jos pentru evenimente scurte.

**Modale secundare chat**

- **Material Request** (form): summary, details, urgency (Normal/High/Critical), location, submit.
- **Material Request Details**: câmpuri read-only + galerie poze (tap → viewer fullscreen cu prev/next).
- **Notifications**: listă necitite, tap închide sheet și poate deschide chat.

### 4.2 My tasks (listă)

- Header + close, hint, listă rânduri: titlu, sursă „Planning”, prioritate, meta deadline, badge status colorat (pending / in-progress / completed / declined etc.).

### 4.3 Task detail

- Loading → conținut: meta, descriere, note, **Confirmation photos** (grid), upload (max 10), feedback.
- Butoane: **Decline**, **Mark in progress**, **Complete** (vizibilitate conform statusului curent).

### 4.4 Drawing Gallery

- **Browser**: breadcrumb/path, listă foldere/desen, back.
- **Viewer**: toolbar (back, calibrate, share, download), PDF în `WebView` sau native preview, navigare prev/next desen, overlay calibrare pentru PDF-uri, mesaj pentru fișiere .dwg nepreviewabile.

### 4.5 Report Issue

- Title*, description, fișier opțional (imagine/PDF), submit, feedback.

### 4.6 Upload Invoice / Booking

- Fișier*, descriere opțională, upload, feedback.

### 4.7 Log Work – formular nou

- Worker readonly, project readonly, **Work type** select, total before tax, total after tax (readonly dacă e calculat pe client), description*, workflow: **Price work booking** vs **Time Sheet** (butoane sau segment control).
- Price work: fișier document, nume fișier afișat, link PDF generat dacă există.
- Time Sheet: buton deschide **Time Sheet Jobs Builder** (formular perioadă, job-uri dinamice, add job, generate).
- Submit: „Submit for manager review”.

### 4.8 Price work builder (QA)

- Intro text, loading / empty / pick job / form steps cu cantități + poze per pas, feedback, submit booking.

### 4.9 După submit work log – email factură

- Mesaj succes + întrebare email copie la companie: **Yes** / **No thanks**.

### 4.10 Work entry overview

- Conținut read-only generat din datele intrării.

---

## 5. Componente și stil reutilizabil

- **Card** (`op-card`): border-radius ~16–20px, border subtil, padding 14–16px, margin-bottom uniform.
- **Titlu card** (`op-card-title`): icon + text, font ~1rem, font-weight 600.
- **Buton primar** (`op-btn-primary`): fundal accent, text alb/contrast; înălțime min ~44px.
- **Buton secundar**: outline / fundal discret.
- **Hint** (`op-tasks-hint`): font ~0.85rem, culoare muted, line-height 1.4.
- **Feedback** (`op-feedback`): verde succes / roșu eroare, fără a înlocui tot formularul.
- **Modal**: backdrop semi-transparent, sheet de jos sau card centrat pe tabletă; `z-index` ierarhie: listă task-uri < detail task < chat < viewer desene (dacă suprapunere).
- **Listă task în modal**: scroll în interiorul body-ului modalului.

---

## 6. Accesibilitate și i18n

- Labels asociate câmpurilor; `aria-label` pe icon-only; live region pentru feedback critic.
- Pregătiți copy-ul pentru EN (ca în web); puteți adăuga RO ulterior prin i18n.

---

## 7. Fișiere sursă de referință în repo

| Fișier | Rol |
|--------|-----|
| `frontend/operative_dashboard.html` | Structură DOM, id-uri, modale |
| `frontend/css/operative_dashboard.css` | Dimensiuni, culori, layout modale, chat, tasks, DG |
| `frontend/js/operative_dashboard.js` | Comportament detaliat (validări, navigare DG, chat polling) |

---

## 8. Checklist livrare UI

- [ ] Home cu ordinea secțiunilor de mai sus  
- [ ] Bottom tabs: Project, Clock, Work, Tasks  
- [ ] Chat full screen + toate sub-flow-urile (request, detalii, poze, notificări)  
- [ ] Task list modal + task detail + poze  
- [ ] Drawing gallery + viewer  
- [ ] Work log complet (inclusiv QA price work și time sheet builder)  
- [ ] Documents inbox → deep link la semnare  
- [ ] Issue + Upload modale  
- [ ] Stări loading/empty/error + dezactivare cont  
