# Document 1: System Overview and Business Logic (Full Platform)

## 1. Product Purpose

Proconix is a construction operations platform that unifies office control and site execution in one system:

- company onboarding and access control,
- project and workforce management,
- task planning and execution tracking,
- work logs and operational evidence,
- QA jobs and quality templates,
- material stock and forecast,
- unit-level progress tracking with public/private timeline views,
- platform-level administration for multi-tenant operations.

The core objective is to turn fragmented site data into structured, auditable, decision-ready operations.

## 1.1 Scope Boundaries

- In scope: operational construction workflows across manager, operative/supervisor, and platform admin contexts.
- Out of scope: accounting-grade ERP replacement, full HR payroll domain, and external regulatory compliance workflows not implemented in platform modules.

## 2. Key Problems Solved

1. Data spread across chats, paper notes, and spreadsheets.
2. Weak traceability of who did what, when, and where.
3. Slow approval loops between operatives and managers.
4. Limited project-level visibility for cost, quality, and timeline.
5. Missing tenant-level governance in a multi-company platform.

## 3. User Types and Responsibilities

### 3.1 Manager (Company scope)
- Owns project setup and execution control.
- Manages projects, operatives, planning, QA, work logs, and materials.
- Reviews and approves/rejects reported work.
- Uses Unit Progress module and document snapshot flows.

### 3.2 Operative / Supervisor (Site scope)
- Executes daily work on assigned projects.
- Submits work logs, confirmation photos, issues, and uploads.
- Uses task actions (`decline`, `in_progress`, `complete`) where allowed.
- Supervisor-specific access in unit timeline is project-bound.

### 3.3 Platform Admin (Cross-tenant scope)
- Maintains platform-level visibility and controls.
- Manages companies, platform users, billing state, system health.
- Provisions demo tenants for sales/ops workflows.

## 4. Real Site Business Logic

- Operational structure is company -> project -> team -> work evidence.
- Unit Progress structure is tower -> floor -> unit -> timeline events.
- Work execution and QA can influence planning views.
- Field evidence (photos, notes, statuses, timestamps) is first-class data.
- Manager decision points (approve/reject/archive/delete) define operational finality.

## 5. Core Business Rules by Domain

### 5.1 Authentication and Access
- Manager routes require validated manager headers.
- Operative routes require operative session/token.
- Supervisor unit timeline access requires matching project assignment.
- Platform admin routes require separate platform admin session headers.
- Real-world examples:
  - EX: a worker from Company A cannot see records from Company B.
  - EX: if manager headers do not match an active manager account, access is denied.

### 5.2 Work Logs
- Work logs are company-scoped and project-contextual.
- Manager can approve/reject/archive and permanently delete (with file cleanup path).
- Operative can archive own records in operative perspective.
- Price-work payloads may include nested step photo evidence.
- Real-world examples:
  - EX: a worker assigned to Project 12 can report work only in that project context.
  - EX: a manager from another company cannot approve those logs.

### 5.3 Planning and Tasks
- Planning tasks are company-scoped.
- Task status transitions must be explicit and persisted.
- Confirmation photos are linked to task completion flows.
- Real-world example:
  - EX: when an operative marks a task completed, the manager can review photo proof before accepting completion.

### 5.4 QA
- QA templates and QA jobs are project/company scoped.
- QA data supports execution quality controls and reporting views.
- Real-world example:
  - EX: QA checks on one project do not appear in another tenant's QA board.

### 5.5 Materials
- Materials are project-bound, tenant-filtered.
- Categories/suppliers are tenant resources.
- Forecast depends on historical stock/consumption snapshots.
- Real-world example:
  - EX: changing stock in Project A affects only Project A material view for that company.

### 5.6 Unit Progress
- Timeline is append-only history.
- New timeline event validation:
  - `stage` required,
  - `status` required,
  - `comment` required,
  - blocked status requires reason.
- Photo limit: max 5 per progress event.
- QR access goes through router flow; never direct assumptions.
- Public timeline is read-only.
- Real-world narrative:
  - EX: Unit 202, Floor 2, Tower A — electrician submits `stage="Electrical First Fix"`, `status="in_progress"`, adds 3 photos, and manager sees the timeline update immediately.

### 5.7 Demo Provisioning
- Demo creation should provision representative end-to-end data.
- Includes company, manager, projects, users, planning, QA, work logs, materials, and unit progress workspace where schema exists.

## 6. UX Rules (interaction and user-facing behavior)

- Timeline history is append-only in user interaction (no overwrite of prior entries).
- Unit Progress photo upload is limited to max 5 photos per event.
- Public timeline is view-only and does not expose mutation controls.
- QR links are routed first through access router flow.

## 7. Business Rules (platform enforcement and policy)

- Blocked status requires explicit reason.
- Multi-tenant data separation must be enforced in all scoped APIs.
- Manager review/decision flow applies to submitted work evidence.
- Supervisor permissions are constrained to assigned project scope.
- Session propagation must remain valid across dashboard module loading patterns.

## 8. Glossary

- **Tenant**: one company boundary in the platform.
- **Unit**: apartment/room execution node in tower-floor-unit hierarchy.
- **Timeline Event**: validated progress update appended to unit history.
- **Supervisor**: operative with additional project-scoped access privileges.
- **Demo Tenant**: generated tenant used for demos/onboarding/training.

## 9. Platform Success Criteria

The platform is considered functionally correct when:

1. Manager can run core operations across projects without cross-module data drift.
2. Operative inputs are visible, reviewable, and actionable by manager.
3. QA/planning/work logs/materials flows reflect real DB state.
4. Unit Progress public/private routing behaves correctly by auth and access.
5. Platform admin can inspect tenant/system state and provision demos safely.
6. No cross-tenant data leakage is allowed in shared infrastructure.
7. Unit timeline read target: under ~300ms from warm cache path and under ~1200ms from cold DB path (environment baseline dependent).

## 10. Assumptions

- Stable network connectivity is available for core API-driven workflows.
- Project assignment integrity is maintained before operative task/report actions.
- Platform admins operate with stricter operational controls than tenant users.
