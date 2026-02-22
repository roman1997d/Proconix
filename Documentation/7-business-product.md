# 7. Documentație de business / product

## Scop și obiective

- **Ce problemă rezolvă aplicația**: Proconix oferă un spațiu unificat pentru companii de construcții (sau similare) să își gestioneze **proiectele**, **echipa** (manageri, operativi, supervizori), **evidența orelor și a lucrărilor** (work logs), **aprobări și facturare**, precum și **Quality Assurance** (șabloane și joburi pe proiect). Reduce fragmentarea între hârtii, foi Excel și emailuri și centralizează datele într-o singură aplicație cu roluri clare (manager vs operativ).
- **Obiettive**: (1) Înregistrare companie și manager; (2) Gestionare proiecte și asignare echipă; (3) Evidență work logs și aprobare/respingere/arhivare; (4) QA – template-uri și joburi; (5) Dashboard operativ – ore, task-uri, raportare issue, upload documente. Pe termen lung: facturare, rapoarte, planuri de abonament.

---

## Cine sunt utilizatorii țintă

| Rol | Descriere |
|-----|-----------|
| **Companie** | Firmă de construcții / reparații care dorește un singur loc pentru proiecte, oameni și evidență lucrări. |
| **Manager** | Utilizator care se înregistrează după companie; gestionează proiecte, operativi, work logs, QA. Poate avea mai mulți manageri per companie. |
| **Operativ / Supervizor** | Angajat al companiei; se loghează separat, vede proiectul curent, task-uri, ore (clock-in/out), poate raporta issue-uri, încărca documente și trimite work logs. |

---

## Roadmap / prioritizare funcționalități

### Ce este în MVP (lansat / în scope actual)

- Înregistrare companie și manager (onboarding + token).
- Login manager și sesiune (localStorage + header-e).
- Dashboard manager cu module: Project Overview, Projects (CRUD + assignments), Operatives (CRUD), Work Logs (listă, filtre, approve/reject/archive, edit, passkey), placeholder-e pentru Task Management, Material, Risk, Plants, Accounting, Reports, Complains, Issues.
- Quality Assurance: template-uri (CRUD) și joburi (CRUD) pe proiect, cu pași, workers, status, cost type, floor.
- Dashboard operativ: login, ore (clock-in/out), proiect curent, task-uri, raportare issue cu fișier, upload documente, work log (vizualizare și creare).
- API REST cu autentificare (manager headers, operative session); erori în JSON; 404/error handler pentru /api.

### Ce poate veni în versiuni ulterioare

- Task Management real (task-uri create de manager, asignate operativilor).
- Material Management, Risk Management, Plants – conținut real în loc de placeholder.
- Accounting: integrare cu work logs aprobate, facturi, costuri.
- Reports: rapoarte pe proiect / perioadă / worker.
- Complains / Issues: flux complet (manager vede issue-uri, schimbă status).
- Notificări (email / in-app) la aprobare/respingere work log.
- Planuri de abonament (Silver/Gold) cu limite sau funcții extra.
- Multi-tenancy îmbunătățit (invitații manager, permisiuni granulare).

---

## Plan monetizare și abonamente

- **Free plan**: (dacă va fi definit) – limitat la un număr de proiecte sau utilizatori, sau perioadă de trial.
- **Silver / Gold** (sau echivalent): 
  - **Silver**: mai multe proiecte, mai mulți operativi, work logs și QA incluse; suport email.
  - **Gold**: toate funcțiile, rapoarte avansate, prioritate suport, eventual API pentru integrări.
- Câmpul `companies.subscription_plan` și rutele placeholder `/api/subscriptions` pregătesc terenul pentru verificare plan și limitări pe viitor.
- **Facturare**: lunară/anuală per companie; plăți prin Stripe/PayPal etc. (de implementat).

---

## Strategia de lansare pe piață

- **Lansare inițială**: segmentare pe firme mici și mijlocii de construcții/reparații care lucrează deja cu foi și emailuri; ofertă clară de „totul într-un singur loc”.
- **Câștigare utilizatori**: trial gratuit (ex. 14 zile sau 2 proiecte); onboarding ghidat (register company → register manager → primul proiect → primul operativ).
- **Reținere**: dashboard clar, aprobare rapidă a work logs, rapoarte utile; suport și actualizări regulate.
- **Extindere**: pe baza feedback-ului – prioritizare task management, facturare, rapoarte; apoi planuri Silver/Gold și integrări (contabilitate, salarizare).

---

*Actualizează acest document la schimbări de scop, roadmap sau monetizare.*
