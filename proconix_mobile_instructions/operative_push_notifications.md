# Push notifications — doar operatives (mobile)

Notă: **managerii nu** folosesc aceste rute și **nu** primesc FCM prin acest modul. Token-urile sunt legate de `users.id` (operatives).

## Migrare DB

```bash
psql -U postgres -d ProconixDB -f scripts/create_operative_push_tables.sql
```

## Config server (FCM)

1. Creează un proiect Firebase / descarcă **Service Account JSON**.
2. Setează în `.env`:

`FIREBASE_SERVICE_ACCOUNT_PATH=/cale/către/serviceAccount.json`

Fără această variabilă, API-ul de înregistrare rămâne util, dar **nu se trimit** push-uri.

## API (toate sub `/api/operatives`, header `X-Operative-Token`)

| Metodă | Rută | Descriere |
|--------|------|-----------|
| `POST` | `/push/register` | Body: `{ "token": "<FCM>", "platform": "ios" \| "android" }` |
| `DELETE` | `/push/register` | Body: `{ "token": "<FCM>" }` — scoate dispozitivul |
| `GET` | `/push/preferences` | `{ success, preferences: { push_chat, push_tasks } }` |
| `PATCH` | `/push/preferences` | Body: `{ "push_chat"?: boolean, "push_tasks"?: boolean }` |

## Când se trimite push

1. **Chat (site):** după un mesaj nou în camera proiectului, către **ceilalți operatives** pe același proiect (nu către manageri prin FCM). Tip `data.type = site_chat`.
2. **Task planning:** după ce managerul salvează task-uri la plan (`POST /api/planning/plan-tasks`), către operatives al căror nume apare în `assigned_to` (dacă `send_to_assignees` nu e false). Tip `data.type = planning_task`.

Preferințele `push_chat` / `push_tasks` filtrează trimiterea.

## Payload FCM (date utile în app)

- `notification.title` / `notification.body`
- `data` (string-uri): `type`, `message_id`, `project_id`, `task_id`, `plan_id` (după caz)
