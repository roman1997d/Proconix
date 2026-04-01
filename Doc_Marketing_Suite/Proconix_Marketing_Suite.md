# Proconix — Marketing & poziționare (suite documentară)

Document de lucru pentru mesaje de vânzări, site, pitch și materiale externe. Conținut aliniat cu arhitectura multi-companie și rolurile Manager / Operative din platformă.

---

## 1. Ce este Proconix

**Proconix** este o platformă de **workflow pentru construcții**: un singur loc digital unde compania își ține **proiectele**, **echipele de șantier (operatives)**, **work log-uri**, **asigurarea calității (QA)**, **materiale**, **task & planning**, **site snags** pe desene și fluxul de **aprobare** între birou și teren.

Nu înlocuiește meseriașii sau proiectanții — **structurează informația** care altfel ajunge împrăștiată în Excel, WhatsApp și foldere locale, astfel încât managerii să poată **decide și factura** pe baza unor date coerente.

---

## 2. Ce problemă rezolvă

- **Fragmentarea datelor**: ore, poze, observații și statusuri în mai multe canale, fără istoric unic.
- **Întârzieri la aprobare**: work log-uri care stau „undeva” până se face luna sau facturarea.
- **Lipsă de vizibilitate**: greu de știut ce e pe șantier acum, ce e blocat, ce e gata de facturat.
- **QA și materiale decuplate** de restul fluxului de lucru, ceea ce crește riscul de erori și dispute.
- **Onboarding haotic** pentru oameni noi pe proiect, fără o „sursă unică de adevăr”.

Proconix aduce aceste fire într-o **aplicație cu roluri clare** (manager vs operative) și **granularitate pe companie și proiect**.

---

## 3. Cum ajută concret la rezolvarea problemei

| Nevoie | Cum răspunde Proconix |
|--------|------------------------|
| Dovezi de lucru | Work log-uri structurate, cu suport pentru conținut încărcat și flux de aprobare/respingere. |
| Control operațional | Dashboard manager: overview proiecte, operatives, jurnale de lucru, module QA / materiale / planning. |
| Claritate pe șantier | Experiență operative orientată pe **task-uri**, **ore**, **upload** și actualizări, inclusiv pe mobil. |
| Decizii financiare | Vizibilitate pe ce e aprobat și pe stadiul lucrărilor, pentru forecast și facturare încrezătoare. |
| Calitate & remedieri | QA și site snags legate de contextul proiectului și desenelor, nu doar liste izolate. |

Rezultatul practic: **mai puțin timp pierdut pe reconcilieri**, **mai puține „nu știam că…”** între birou și șantier.

---

## 4. Cum funcționează sistemul (multi-company)

Proconix este construit **multi-tenant la nivel de companie**:

- Fiecare **companie** are propriul cont și date izolate în modelul logic (companii, manageri, utilizatori/operatives, proiecte).
- Un **manager** este asociat unei **companii** (`company_id`); sesiunea și permisiunile sunt validate față de baza de date (manager activ, email corespunzător).
- **Operatives** (utilizatori de șantier) aparțin aceleiași companii; token-ul de sesiune poartă identitatea companiei și a utilizatorului.
- API-urile care servesc date sensibile verifică identitatea și **nu amestecă** date între companii fără drept de acces.

Pe scurt: **o instanță Proconix poate deservi mai multe companii**, fiecare cu **spațiu propriu de date** și propriii manageri și operatives.

---

## 5. Cum se leagă proiectele de operatives și de manageri

- **Managerii** (per companie) definesc sau gestionează **proiectele** și pot **atribui operatives** la proiecte, conform fluxului din aplicație.
- **Operatives** văd și lucrează în contextul **proiectelor la care sunt alocați** — task-uri, work log-uri, upload-uri relevante pentru acele proiecte.
- **Managerii** văd agregat la nivel de companie/proiect: cine lucrează unde, ce jurnale sunt în așteptare, ce module (QA, materiale etc.) sunt folosite pe fiecare linie de proiect.

Legătura este **explicită în modelul de date** (companie → proiect → persoane și înregistrări), nu doar „etichete” în interfață.

---

## 6. Ce poate face Proconix (funcționalități de evidențiat)

- **Înregistrare companie & onboarding** manageri.
- **Dashboard manager**: overview proiecte, operatives, work logs (aprobare/respingere), materiale, task & planning, site snags, QA, setări profil și companie (în funcție de modulul activ).
- **Dashboard operative**: acces focalizat pentru teren — autentificare (inclusiv parolă temporară la primul acces), task-uri, ore, rapoarte/upload.
- **Work logs** ca obiecte de lucru trecute printr-un flux de decizie manager.
- **QA** (șabloane, job-uri) și **site snags** pe desene (unde modulul e activ).
- **Materiale** și **planificare** ca suport operațional pentru șantier și birou.
- **Sincronizare / stocare** pentru anumite module (ex. Site Snags) cu server când sesiunea manager este disponibilă.
- **Roluri separate** în interfață: experiență „birou” vs „pocket / teren”.

Lista exactă poate fi ajustată pe baza paginilor live și a contractului cu clientul.

---

## 7. Ce sisteme de securitate sunt implementate (orientativ)

- **Autentificare manager**: validare pe server cu **ID manager + email** și verificare că utilizatorul este **activ** în baza de date; răspuns **401** dacă sesiunea nu este validă.
- **Autentificare operative**: **token de sesiune** (header `X-Operative-Token` sau `Authorization: Bearer`); sesiune invalidă/expirată → relogare; cont **dezactivat** poate fi blocat la nivel de API.
- **Separare pe companie**: datele sunt accesate în contextul `company_id` asociat utilizatorului autentificat; middleware-uri dedicate pe rute sensibile.
- **Parole**: flux operative cu **setare parolă** după autentificare temporară (conform implementării curente).
- **Infrastructură**: aplicația poate rula pe **server propriu / VPS**; conexiunea la baza de date prin pool configurat; recomandare standard: **HTTPS**, firewall, backup-uri DB, secrete în variabile de mediu (`.env`), nu în cod.

*Notă pentru marketing*: detaliile tehnice pot fi extinse într-un document separat „Security & compliance” sub NDA, fără a promite certificări care nu există încă.

---

## 8. Ce „timp” / tip de design are

Interpretări utile pentru pitch:

- **Tip de design (UX/UI)**: interfață tip **SaaS modernă** — dashboard întunecat pentru manageri, componente responsive (Bootstrap), accent pe **claritate ierarhică** (CTA-uri, module în sidebar), **mobile-first** pentru operative.
- **Design tehnic (arhitectură)**: orientare **database-first** — schema documentată în proiect, date relaționale pentru companii, proiecte, utilizatori și jurnale; API REST sub `/api/...`.
- **Evoluție în timp**: platforma este **iterativă** (module adăugate: QA, snags, materiale etc.); mesajul de marketing poate sublinia **îmbunătățire continuă** fără a fixa un „an de design” dacă nu e acordat oficial.

Dacă întrebarea vizează **durata unui proiect de implementare** la client: depinde de numărul de proiecte, training și date migrate — de obicei **zile–săptămâni** pentru o primă utilizare productivă, nu luni de „big bang”.

---

## 9. De ce să aleagă Proconix?

1. **O singură platformă** pentru firma de construcții: de la teren la aprobare și vizibilitate financiară.
2. **Construit pentru realitatea IMM-urilor** din construcții — nu doar demo-uri enterprise greu de adoptat.
3. **Roluri reale**: manager vs operative, fără a forța același ecran pentru toată lumea.
4. **Multi-company** gândit din start — potrivit pentru hosting multi-client sau grupuri cu mai multe entități.
5. **Control asupra datelor**: poate fi găzduit **pe infrastructura clientului**, cu PostgreSQL și API-uri explicite.
6. **Transparență operațională**: mai puține surprize la sfârșit de lună între șantier, QS și management.
7. **Extensibilitate**: module (QA, snags, materiale, planning) care se adaugă la același nucleu de proiecte și oameni.

---

## Meta

- **Locație fișier**: `Doc_Marketing_Suite/Proconix_Marketing_Suite.md`
- **Întreținere**: actualizați secțiunea 6 și 7 când apar module noi sau schimbări majore de securitate.
- **Limbi**: acest document este în **română**; se poate deriva o versiune EN pentru site-ul `proconix.uk`.
