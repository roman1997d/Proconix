# Proconix Full System Documentation Package

This package is a full-project documentation set for the entire Proconix platform
(manager area, operative area, QA, planning, work logs, materials, unit progress,
site snags integration, platform administration, storage, and deployment context).

## Document quality goals

- Consistent terminology across all files (`tenant`, `manager`, `operative`, `unit timeline`, `demo tenant`).
- Architecture-to-API-to-data traceability.
- Role and tenant safety explicitly documented.
- Practical onboarding value for new developers and QA.

## Package contents (8 files)

1. `README.md`  
   Package index and scope.
2. `01-system-overview-business-logic.md`  
   Product vision, business goals, user roles, core business rules across all modules.
3. `02-system-architecture-sad.md`  
   System Architecture Document (SAD): architecture, modules, integrations, decisions.
4. `03-database-schema-erd.md`  
   Database model overview, core entities, relationships, constraints, indexing guidance.
5. `04-rest-api-openapi.yaml`  
   OpenAPI 3.0 spec for key platform APIs (auth, dashboard, projects, operatives,
   work logs, planning, QA, materials, unit progress, platform admin).
6. `05-developer-onboarding-environment-setup.md`  
   Setup, environment, development workflow, quality gates, runbook basics.
7. `06-business-operations-user-manual.md`  
   Practical user manual for manager, operative, and platform admin core flows.
8. `07-glossary-and-cross-module-flows.md`  
   Shared vocabulary and cross-module end-to-end operational flows.

## Format policy

- Documentation files: Markdown (`.md`)
- API contract: OpenAPI YAML (`.yaml`)

## Scope note

This package intentionally documents the full platform, not a single module.

## Read order (recommended)

1. `01-system-overview-business-logic.md`
2. `02-system-architecture-sad.md`
3. `03-database-schema-erd.md`
4. `04-rest-api-openapi.yaml`
5. `07-glossary-and-cross-module-flows.md`
6. `05-developer-onboarding-environment-setup.md`
7. `06-business-operations-user-manual.md`

## Canonical Status Dictionary

Use these values as canonical contracts across docs, API payload validation, and QA checks.

### Work Logs (`work_logs.status`)

- `pending`
- `edited`
- `waiting_worker`
- `approved`
- `rejected`

### Planning Tasks (`planning_plan_tasks.status`)

- `not_started`
- `in_progress`
- `paused`
- `declined`
- `completed`

### Unit Timeline Events (API/storage canonical)

- `in_progress`
- `blocked`
- `done`

### Unit Timeline Labels (UI display)

- `In progress`
- `Blocked`
- `Done`

### Usage rule

- If a status domain changes, update `README.md`, `03-database-schema-erd.md`, `04-rest-api-openapi.yaml`, and `07-glossary-and-cross-module-flows.md` in the same PR.
