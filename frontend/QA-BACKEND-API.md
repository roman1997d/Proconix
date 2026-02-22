# Quality Assurance – Backend API contract

The frontend uses a data layer (`qaApi`) that currently reads/writes **localStorage**. When the backend is ready, the same `qaApi` methods can be implemented with HTTP calls. This document describes the expected **REST API** so the backend can be implemented and connected with minimal changes.

**Config:** The frontend checks `window.QA_CONFIG.useBackend` and `window.QA_CONFIG.apiBase` (e.g. `'/api'`). When `useBackend` is true, the app will call the endpoints below (relative to `apiBase`).

---

## Templates

### GET `/templates`
**Response:** `200 OK`, body: array of template objects.

```json
[
  {
    "id": "string",
    "name": "string",
    "steps": [
      {
        "id": "string",
        "description": "string",
        "pricePerM2": "string",
        "pricePerUnit": "string",
        "pricePerLinear": "string"
      }
    ],
    "createdAt": "ISO8601",
    "createdBy": "string"
  }
]
```

### GET `/templates/:id`
**Response:** `200 OK` – single template object; or `404` if not found.

### POST `/templates`
**Body:**
```json
{
  "name": "string",
  "steps": [
    {
      "id": "string",
      "description": "string",
      "pricePerM2": "string",
      "pricePerUnit": "string",
      "pricePerLinear": "string"
    }
  ]
}
```
**Response:** `201 Created` – created template object (include `id`, `createdAt`, `createdBy`). The frontend sends `createdBy` from `window.qaCurrentUserName`; the backend may overwrite from session.

### PUT `/templates/:id`
**Body:** same as POST (name, steps).  
**Response:** `200 OK` – updated template object. Preserve `createdAt` and `createdBy`.

### DELETE `/templates/:id`
**Response:** `204 No Content` or `200 OK`.

---

## Jobs

### GET `/jobs?projectId=:projectId`
**Query:** `projectId` (required).  
**Response:** `200 OK`, body: array of job objects for that project.

```json
[
  {
    "id": "string",
    "projectId": "string",
    "jobNumber": "string",
    "floor": "string",
    "location": "string",
    "sqm": "string",
    "linearMeters": "string",
    "specification": "string",
    "description": "string",
    "targetCompletionDate": "YYYY-MM-DD or empty",
    "createdAt": "ISO8601",
    "createdBy": "string",
    "templateIds": ["string"],
    "costIncluded": true,
    "costType": "day|hour|price",
    "costValue": "string",
    "responsibleId": "string",
    "workerIds": ["string"],
    "status": "new|active|completed"
  }
]
```

### GET `/jobs/:id`
**Response:** `200 OK` – single job object; or `404` if not found.

### POST `/jobs`
**Body:** full job object **without** `id` (server may generate id and/or jobNumber). Same shape as in GET response. Frontend sends: `projectId`, `jobNumber`, `floor`, `location`, `sqm`, `linearMeters`, `specification`, `description`, `targetCompletionDate`, `createdAt`, `createdBy`, `templateIds`, `costIncluded`, `costType`, `costValue`, `responsibleId`, `workerIds`, `status`.  
**Response:** `201 Created` – created job object (with `id` and optionally server-generated `jobNumber`).

### PUT `/jobs/:id`
**Body:** partial update, e.g. `{ "status": "active" }`.  
**Response:** `200 OK` – updated job object.

### DELETE `/jobs/:id`
**Response:** `204 No Content` or `200 OK`.

---

## Optional: next job number

The frontend currently derives the next job number from existing jobs (e.g. `J-000001`, `J-000002`). If the backend prefers to generate it:

- **GET `/jobs/next-number?projectId=:projectId`**  
  **Response:** `200 OK`, body: `{ "jobNumber": "J-000003" }`.

The frontend can be updated to call this when `useBackend` is true instead of computing from the list.

---

## Auth and creator

- `createdBy` for templates and jobs is set from **`window.qaCurrentUserName`** (set by the app when the user is loaded from session/DB). The backend may ignore the request body and set `createdBy` from the authenticated user.
- All endpoints may require authentication (e.g. session cookie or Bearer token). Return `401` or `403` as appropriate; the frontend can show a toast on error.

---

## CORS and errors

- If the frontend is served from a different origin, the backend must allow CORS for the API base path.
- On error: `4xx`/`5xx` with a JSON body like `{ "message": "..." }` is enough; the frontend shows `err.message` in a toast.
