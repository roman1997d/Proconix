# Documentație Proconix

Acest folder conține documentația de arhitectură, bază de date, backend, frontend, instalare, QA și business. Păstrează totul **actualizat la fiecare schimbare majoră**.

---

## Cuprins

| Nr | Fișier | Conținut |
|----|--------|----------|
| 1 | [1-architecture.md](1-architecture.md) | Arhitectura generală, legătura frontend–backend–DB, flux de date, diagrama modulelor, flowchart/sequence (login, creare task) |
| 2 | [2-database.md](2-database.md) | ERD (Mermaid), schema tabelelor, câmpuri și restricții, indexuri, scripturi de creare și seed |
| 3 | [3-backend.md](3-backend.md) | Lista endpoint-urilor API (route, method, auth, parametri), controller overview, autentificare și middleware |
| 4 | [4-frontend.md](4-frontend.md) | Structura fișierelor (HTML, JS, CSS), ce script face fetch la ce endpoint, cum se încarcă datele, manual de utilizare (manager & operativ) |
| 5 | [5-installation-setup.md](5-installation-setup.md) | Setup local/VPS, Node.js, PostgreSQL, npm, variabile .env, PM2, Nginx, SSL, backup/restore DB, deployment |
| 6 | [6-qa-testing.md](6-qa-testing.md) | Test cases (login, CRUD proiecte, operatives, work logs, QA, dashboard operativ), loguri și debugging (PM2, Nginx, Node, frontend) |
| 7 | [7-business-product.md](7-business-product.md) | Scop și obiective, utilizatori țintă, roadmap/MVP vs viitor, plan monetizare (Free/Silver/Gold), strategie lansare |

---

## Diagrame

- **Arhitectură**: diagramă ASCII în `1-architecture.md` (browser → backend → DB).
- **Module**: tabel pagini/module și legătura cu backend/DB în `1-architecture.md`.
- **Flux**: sequence diagram (login manager, submit work log) în `1-architecture.md`.
- **ERD**: diagramă Mermaid (relații între tabele) în `2-database.md`.

Pentru diagrame Mermaid poți folosi: [Mermaid Live Editor](https://mermaid.live/) sau render în GitHub/GitLab.

---

## Sfaturi de întreținere

- La **adăugare rute API**: actualizează `3-backend.md` și, dacă e cazul, `4-frontend.md` (ce script face fetch la noul endpoint).
- La **schimbare schemă DB**: actualizează `2-database.md` (ERD, schema, scripturi) și `5-installation-setup.md` dacă apar noi scripturi.
- La **pagină sau modul nou**: actualizează `1-architecture.md` (tabel module) și `4-frontend.md` (structură, flux, manual).
- La **nou flux de business sau test**: actualizează `6-qa-testing.md` și, dacă e cazul, `7-business-product.md`.
