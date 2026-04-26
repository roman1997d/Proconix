# Proconix – totalizare proiect

**Proconix** este o platformă web pentru firme de construcții (și activități similare): un singur loc pentru proiecte, oameni de pe șantier, planificare, materiale, lucrări facturabile, calitate (QA) și setări firmă. Există două lumi de utilizatori: **managerii** (birou / coordonare) și **operativii** (teren), plus o **consolă de administrare** pentru echipa Proconix.

Mai jos: modulele platformei, pe scurt **ce face** fiecare și **ce problemă rezolvă**.

---

## 1. Intrare, înregistrare și marketing (fără cont sau înainte de dashboard)

| Modul | Ce face | Ce problemă rezolvă |
|--------|---------|----------------------|
| **Landing (home)** | Alege Manager vs Operativ; linkuri spre înregistrare, planuri, contact. | Evită confuzia de roluri și direcționează corect utilizatorul. |
| **Înregistrare companie** | Creează firma în sistem; urmează pasul „primul manager” cu token de onboarding. | Separă entitatea juridică/organizațională de persoana care o administrează. |
| **Planuri (See plans)** | Afișează pachete (Free, Silver, Gold etc.); alegerea poate fi folosită la signup. | Clarifică oferta și pregătește abonamente / limite pe viitor. |
| **Contact** | Formular / cerere de contact către backend. | Lead-uri și suport fără a depinde doar de email public. |
| **Înregistrare manager** | Cont manager legat de compania deja creată (după token). | Închide ciclul „firmă + primul administrator”. |
| **Login manager** | Autentificare și acces la dashboard-ul de management. | Acces controlat la datele companiei. |

---

## 2. Dashboard manager (după login)

| Modul | Ce face | Ce problemă rezolvă |
|--------|---------|----------------------|
| **Project Overview** | Pulsul zilei: câte proiecte, task-uri planning active, operativi, cost total din work logs; cine s-a pontat azi și unde; task-uri cu deadline în 7 zile; coadă de work logs neaprobate; grafic QA după tip de cost (zi/oră/preț). | „Unde suntem acum?” într-un singur ecran — fără tabele Excel și telefoane paralele. |
| **Projects (Proiecte)** | CRUD proiecte, detalii, ascundere din listă, asignare operativi pe proiect; locație proiect (hartă) pentru verificări la pontaj. | Organizare clară a șantierelor și a echipei alocate; suport pentru reguli de prezență pe locație. |
| **Material Management** | Materiale, consum pe proiect, previziuni (forecast) de consum. | Pierderi și lipsuri de stoc; decizii de reaprovizionare fără estimări „din cap”. |
| **Task & Planning** | Planuri de lucru, task-uri (inclusiv vizualizări tip planificare), legătură opțională cu joburi QA; manager vede poze de confirmare la task-uri încheiate de operativ. | Planificarea din birou se leagă de execuția din teren; probă vizuală la finalizare. |
| **Operatives** | Listă, adăugare, activare/dezactivare, gestionare conturi pentru muncitori/supervizori. | Evidența echipei de teren și cine poate folosi aplicația operativă. |
| **Work Logs** | Listă lucrări raportate, filtre, detalii, editare linii, aprobare / respingere, previzualizare factură, arhivare. | Flux „raportat → verificat → aprobat → facturat/arhivat” în loc de foi și mesaje dispersate. |
| **Quality Assurance (QA)** | Șabloane de control (pași, costuri), joburi QA pe proiect (status, personal, tip cost, etaje etc.); poate fi legat de task-uri din planning. | Standardizare controale de calitate și urmărire costuri/tipuri de lucrări QA pe proiecte. |
| **Profile Settings** | Date personale manager, telefon, schimbare parolă. | Auto-gestionare cont fără intervenție manuală a unui admin. |
| **My Company Settings** | Date companie; invitare manageri noi (general sau pe șantier / proiect). | Mai mulți manageri cu roluri diferite; administrare firmă centralizată. |

---

## 3. Dashboard operativ (muncitor / supervizor)

| Modul | Ce face | Ce problemă rezolvă |
|--------|---------|----------------------|
| **Operative app (întreg fluxul)** | Login dedicat; pontaj (clock in/out) cu verificare apropiere de proiect; proiect curent; task-uri (inclusiv poze la finalizare, refuz, în progres); work log; raportare probleme cu fișiere; încărcare documente. | Tot ce vine din teren intră structurat în același sistem pe care îl vede managerul — nu mai e nevoie de hârtii dublate sau canale separate. |

---

## 4. Administrare platformă (echipa Proconix, nu clientul)

| Modul | Ce face | Ce problemă rezolvă |
|--------|---------|----------------------|
| **Proconix Administration** | Login separat pentru administratori platformă; consolă internă (evolutivă). | Separare clară între **tenant** (fiecare firmă client) și **operatorul** care întreține Proconix. |

---

## 5. Module pregătite / roadmap (încă fără funcționalitate completă în UI)

Acestea există în arhitectura dashboard-ului ca extensii viitoare (placeholder sau rute pregătite): **Project builder**, **Task management** (variantă legacy față de Task & Planning), **Risk management**, **Plants** (utilaje), **Accounting**, **Resources & files**, **Reports**, **Complains**, **Issues** (tabel manager lângă raportarea operative).

**Problema pe care o vizează:** același cockpit pentru riscuri, flotă, contabilitate, documente, rapoarte și reclamații — fără a schimba modelul de „module în dashboard”.

---

## 6. Ce rezolvă Proconix, în propoziție

Fragmentarea între **Excel, email, foi și Whatsapp** pentru proiecte, oameni, materiale, planuri, pontaj, lucrări de plătit și QA — înlocuită cu **o platformă unică**, **roluri definite** (manager vs operativ) și **date într-o singură bază**, cu posibilitate de a crește spre facturare, rapoarte și abonamente.

---

## 7. Tehnic (o linie)

Backend **Node.js (Express)** + **PostgreSQL**; frontend **static** (HTML/CSS/JS) servit de același server; fișiere încărcate expuse separat; health check și metrici pentru operare.

---

*Document de totalizare. Detalii tehnice: `Documentation/proconix_full_description.md`.*
