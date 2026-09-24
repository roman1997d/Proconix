# My Drawings — API nativă (muncitori / supervizori)

Base URL: `https://<host>`. Toate rutele de date cer **`Authorization: Bearer <jwt>`**.

JWT-ul este izolat pe **companie + proiect**. Serverul ignoră orice `companyId` trimis de client.

---

## 1. Autentificare (cod 4 cifre pe email)

Cont nou: `POST /api/my-drawings/register` cu `firstName`, `lastName`, `email`, `hostAccessCode` (ex. `2026AA` / `1997AA`). Codul ajunge pe email.

Cont existent:

| Metodă | Path | Body |
|--------|------|------|
| `POST` | `/api/my-drawings/auth/request-code` | `{ "email": "...", "hostAccessCode": "2026AA" }` (`hostAccessCode` obligatoriu dacă emailul e la mai multe companii) |
| `POST` | `/api/my-drawings/auth/verify` | `{ "email": "...", "pin": "1234", "hostAccessCode": "2026AA" }` |

Răspuns verify (succes):

```json
{
  "success": true,
  "token": "<jwt>",
  "tokenType": "Bearer",
  "deviceToken": "<pwa-device-token>",
  "company": { "id": 1, "name": "Norfolk Drywall Ltd" },
  "project": { "id": 1, "name": "Norfolk Drywall Ltd", "companyId": 1 },
  "firstName": "Ion",
  "lastName": "Pop",
  "email": "ion@example.com"
}
```

Stocați `token` (SecureStore). La request-uri: `Authorization: Bearer <token>`.

Codul expiră în 24h. JWT implicit: 180 zile (`MY_DRAWINGS_JWT_EXPIRES`).

---

## 2. Listare desene

`GET /api/drawings?floor=2&category=Partitions`

Query opțional:

- `floor` — `ground` sau `1`–`5`
- `category` — nume exact de categorie
- `projectId` — trebuie să aparțină companiei din JWT

Răspuns: `company`, `project`, `categories[]`, `drawings[]` cu `id`, `number`, `title`, `category`, `revision`, `floors`, `updatedAt`, `sizeBytes`, `fileUrl`.

Alias: `GET /api/my-drawings/drawings`

---

## 3. Download PDF (autentificat)

`GET /api/drawings/:id/file`

- Header Bearer obligatoriu
- Fișierul e verificat pe `workspace_id` + `project_id` din token
- `?download=1` forțează attachment

Alias: `GET /api/my-drawings/drawings/:id/file`

PDF-urile **nu** sunt publice sub `/uploads/mydrawings`.

---

## 4. Înregistrare dispozitiv (FCM)

`POST /api/devices/register`

```json
{ "token": "<fcm-token>", "platform": "ios" }
```

(`fcmToken` e acceptat în loc de `token`. `platform`: `ios` | `android`)

`user_id` din tabelul `user_devices` = `my_drawings_worker.id`.

Când un admin încarcă sau actualizează un desen din panoul web, serverul trimite push către token-urile muncitorilor din aceeași companie.

Payload FCM `data`: `type` (`drawing_added` | `drawing_updated`), `drawing_id`, `company_id`, `project_id`, `number`, `revision`.

Fără `FIREBASE_SERVICE_ACCOUNT_PATH` în `.env`, înregistrarea merge, trimiterea e dezactivată.

---

## 5. Stocare pe disk

`backend/uploads/mydrawings/{companyId}/{projectId}/{file}.pdf`

La restart, fișierele vechi din `mydrawings/` sunt mutate automat în folderul tenantului.
