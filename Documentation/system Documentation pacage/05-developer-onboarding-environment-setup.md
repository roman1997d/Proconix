# Document 5: Developer Onboarding & Environment Setup (Full Platform)

## 1. Prerequisites

- Node.js LTS (v18+ recommended)
- npm
- PostgreSQL
- Git
- Optional: PM2 and Nginx for production-like local testing

## 2. First-Time Setup

```bash
npm install
```

### Database bootstrap

Run required SQL scripts for full platform capabilities:
- companies/managers/users/projects/assignments,
- work logs/work hours/issues/uploads,
- planning and QA tables,
- materials and consumption tables,
- platform admin table,
- unit progress table.

### 2.1 Quickstart checklist

- [ ] `.env` configured
- [ ] DB reachable and required scripts applied
- [ ] `npm install` successful
- [ ] `npm run dev` starts without fatal errors
- [ ] `/api/health` returns connected status

## 3. Local Run Commands

```bash
npm run dev
```

or:

```bash
npm start
```

Validate:

```bash
curl http://localhost:3000/api/health
```

## 4. Environment Variables

Example `.env`:

```env
PORT=3000
HOST=localhost

PGHOST=localhost
PGPORT=5432
PGDATABASE=ProconixDB
PGUSER=postgres
PGPASSWORD=your_password

ONBOARDING_SECRET=replace_me
PROCONIX_PUBLIC_URL=http://localhost:3000
```

## 5. Repository Structure (Practical)

```text
frontend/                     # static UI pages and JS logic
backend/                      # API server, controllers, middleware, db layer
scripts/                      # SQL and operational scripts
Documentation/                # product and engineering docs
backend/uploads/              # uploaded runtime files
output/                       # generated output artifacts
```

## 6. Development Workflow Standards

- Branches:
  - `feature/<name>`
  - `fix/<name>`
  - `docs/<name>`
- Commits:
  - Prefer Conventional Commits.
- PRs:
  - include scope, risk, and verification notes.

## 7. Platform-Wide Code Expectations

1. Respect tenant boundaries (`company_id` logic) in backend changes.
2. Keep auth pathways consistent by role.
3. Preserve append-only timeline semantics in Unit Progress.
4. Keep file paths and cleanup behavior safe for delete flows.
5. Update documentation when adding/changing API or DB schema.

## 8. Core QA Regression Checklist

### Manager Area
- login + dashboard load
- projects CRUD and assignments
- operatives CRUD
- work logs queue actions
- planning + QA views
- materials list/create/update/delete

### Operative Area
- login/session
- clock in/out
- tasks and task photos
- work log creation and archive
- issue/upload flows

### Unit Progress
- workspace get/put
- unit timeline append validation
- QR router private/public behavior

### Platform Admin
- login + me/session validation
- companies and platform users views
- create demo records
- system health panel data load

## 9. Production Readiness Notes

- Use PM2 for process management.
- Reverse proxy with Nginx and HTTPS.
- Keep backup/restore procedure tested.
- Never commit secrets in repository history.

## 10. Documentation Maintenance Rule

When changing architecture-relevant behavior, update the matching file in this package in the same PR:
- business rules -> `01`
- architecture/runtime -> `02`
- schema/integrity -> `03`
- API shape -> `04`
- cross-module flow contract -> `07`
