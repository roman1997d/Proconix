# Actualizări recente — extra (landing, dashboard, Site Snags, documentație marketing)

Document complementar la rezumatul din [README.md](README.md). Conține modificări adăugate în afara fluxurilor deja descrise acolo (overview dashboard, work logs PDF, planning photos etc.).

**Ultima actualizare:** 26 aprilie 2026

---

## 1. Pagina principală (`frontend/index.html` + `css/styles.css` + `js/index.js`)

### Hero — titlu cu efect typewriter
- Titlul principal nu mai este static: **trei fraze** de marketing se afișează pe rând cu efect **typewriter**, apoi se **șterg** și urmează următoarea, în buclă.
- Fișiere: `index.js` (`initHeroTypewriter`, tablou `HERO_TYPEWRITER_PHRASES`), clase CSS `.hero-typewriter-*`, cursor cu blink.
- **Accesibilitate:** `aria-label` pe `h1` cu toate frazele; conținut animat `aria-hidden="true"`. La `prefers-reduced-motion: reduce` se afișează doar prima frază, fără animație.
- **Remediere bug:** inițializarea `initMain()` trebuie apelată **după** definirea tabloului de fraze (altfel `HERO_TYPEWRITER_PHRASES` era încă `undefined` la primul paint).

### Hero — carusel ilustrație produs (3 slide-uri)
- În dreapta hero, în fereastra „browser”, conținutul se **rotisește automat** la ~**2 secunde** între trei slide-uri: overview dashboard, flux **site → office**, vizual **QA & materiale**.
- Tranziție **slide** cu durată ~**1s** și easing `cubic-bezier(0.33, 1, 0.53, 1)`.
- Bara de adresă simulată se actualizează (`proconix.uk/dashboard`, `/operations`, `/qa-materials`).
- **Pauză** la hover/focus pe cadru, la tab ascuns (`visibilitychange`), **dot-uri** clickabile pentru salt manual.
- `prefers-reduced-motion`: fără auto-advance; rămâne primul slide (navigare manuală posibilă).

### Secțiune „How Proconix fits into your day”
- Înlocuit lista simplă cu un **flux vizual în 3 pași**: ilustrații CSS interactive (console proiecte, telefon șantier + cască, grafic + approved), **săgeți** între pași, animații la scroll (`reveal-visible`) și la **hover**.
- Pe ecran îngust, săgețile devin **verticale**; pipeline-ul din pasul 2 se stivește pe coloană.

### Testimoniale și FAQ
- Secțiune **„What people are saying about Proconix”** — carduri cu citate illustrative (date de exemplu), stil `.testimonial-*`.
- Secțiune **FAQ** — accordion Bootstrap, stil întunecat `.landing-faq-accordion`, întrebări despre produs, date, planuri, contact.

### Eliminat ulterior
- Cutii software 3D **Manager / Operative Edition** (`px-edition-*`) — **scoase** din `index.html` și din `styles.css` la cerința utilizatorului.

---

## 2. Dashboard manager — module în iframe (`frontend/js/dashboard.js`, `css/dashboard.css`)

- **`iframeModuleSrc(filename)`** — `src` al iframe-urilor rezolvat cu `new URL(filename, window.location.href).href` pentru path-uri corecte (inclusiv subpath).
- **Site Snags:** după `load` pe iframe, `postMessage` cu sesiunea este trimis **și după 150 ms** (retry), pentru browsere unde `load` apare înainte ca documentul din iframe să fie gata.
- **Înălțime iframe pe touch:** regulă `@media (hover: none) and (pointer: coarse)` pentru `.dashboard-qa-iframe` cu `min-height: min(75dvh, 900px)` — ajută la **Chrome iOS / tabletă** unde flex + `min-height: 0` putea lăsa iframe-ul fără înălțime vizibilă (în special iPad landscape > 992px).

Module afectate tipic: Task & Planning, Site Snags, QA, Material Management, Profile Settings, My Company Settings.

---

## 3. Site Snags (`frontend/Site_Snags.html`)

- **Double-tap (touch)** pe desen: două tap-uri rapide în același loc (~380 ms, toleranță ~42 px), fără mișcare de pan semnificativă → deschide **snag nou** la poziție (echivalent cu plasare pin), fără a activa în prealabil „Place pin”.
- Logică comună în **`placeNewPinAtClient(clientX, clientY)`**; `onViewportClick` pentru modul „Place pin” o folosește; verificare `elementFromPoint` / `.ss-pin`.
- Variabile: `ssTouchDown`, `ssLastTap`, praguri `SS_DOUBLE_TAP_*`, `SS_TAP_MOVE_MAX_PX`.
- Hint-uri UI actualizate (double-tap / double-click).

---

## 4. Documentație marketing (rădăcina repo)

- Folder **`Doc_Marketing_Suite/`** cu **`Proconix_Marketing_Suite.md`**: ce este Proconix, problemă, valoare, multi-company, legături proiect–operatives–manageri, capabilități, securitate (orientativ), design, argumente „de ce Proconix” — în **română**, pentru pitch și site.

---

## 5. Unit Progress Tracking + timeline routing (aprilie 2026)

- Modulul `Unit_Progress_Tracking.html` a fost mutat în flux intern de dashboard manager (încărcat ca modul iframe, nu pagină externă separată).
- View-uri ajustate:
  - `View 1` include wizard-ul (`Start Guided Setup`) și search de unități.
  - `View 3` rămâne focus pe timeline + `Generate Documentation Snapshot` + `Add Progress` (modal).
- `Add Progress`:
  - pozele sunt opționale (max 5), selecție cumulativă,
  - preview miniaturi + buton remove (X),
  - comentariul este obligatoriu,
  - loader vizual la submit (`Floating Dots Loader`).
- `Generate Documentation Snapshot`:
  - modal cu nume document, toggle PDF, mod conținut (photos/text/both),
  - generează pachet ZIP cu fișier principal (PDF sau MD) + folder `timeline-photos` grupat pe stage,
  - loader dedicat (`Magnetic Field Loader`) și apoi download package.
- QR flow nou:
  - `timeline_access_router.html` verifică sesiunea și accesul la proiect,
  - redirect către `private_timeline.html` (manager/supervisor autorizat) sau `public_Timeline.html` (public read-only).
- Backend dedicat:
  - endpoint-uri `/api/unit-progress/*`,
  - persistență workspace JSONB în `unit_progress_state`,
  - suport timeline public/private + append progress manager/supervisor.
- Admin demo provisioning:
  - `Create Demo Records` seed-uiește acum și `unit_progress_state`, astfel încât modulul Unit Progress să fie gata imediat în tenant-ul demo.

---

## Fișiere atinse (referință rapidă)

| Zonă | Fișiere principale |
|------|---------------------|
| Landing | `frontend/index.html`, `frontend/css/styles.css`, `frontend/js/index.js` |
| Dashboard iframe | `frontend/js/dashboard.js`, `frontend/css/dashboard.css` |
| Site Snags | `frontend/Site_Snags.html` |
| Marketing | `Doc_Marketing_Suite/Proconix_Marketing_Suite.md` |

---

## Întreținere

- La **schimbări majore** pe landing sau Site Snags, actualizați acest fișier și paragraful scurt din `README.md`.
- La **noi module iframe** în dashboard, verificați dacă trebuie menționat același pattern `iframeModuleSrc` / înălțime touch.
