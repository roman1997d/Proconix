# Document 6: Business Operations & User Manual (Full Platform)

## 1. Manager Daily Operating Flow

1. Login to manager dashboard.
2. Review Project Overview:
   - active tasks,
   - operative activity today,
   - unapproved work logs,
   - QA distribution.
3. Open modules based on priorities:
   - Projects,
   - Operatives,
   - Work Logs,
   - Task & Planning,
   - QA,
   - Materials,
   - Unit Progress.

## 2. Project and Team Setup

### Projects
- Create/edit/deactivate project.
- Set project details and assignment scope.

### Operatives
- Add or update operative/supervisor accounts.
- Ensure project assignment alignment with planned work.

## 3. Work Logs Operations

### Operative side
- Submit work log with relevant details and optional evidence.

### Manager side
- Review queue.
- Approve or reject.
- Archive or hard delete when required by operations policy.

## 4. Planning and QA Coordination

- Use Task & Planning to schedule and monitor execution.
- Use QA module for templates and job quality tracking.
- Validate completion evidence (including confirmation photos where flow applies).

## 5. Materials Management

1. Select project.
2. Maintain categories and suppliers.
3. Add/update material stock.
4. Perform stock checks.
5. Monitor forecast and reorder risk.

## 6. Unit Progress Operations

1. Enter Unit Progress module.
2. Configure or review tower/floor/unit structure.
3. Open unit timeline.
4. Add progress event (comment required, photo max 5).
5. Generate documentation snapshot package (mode + PDF preference).
6. Use QR flow for private/public timeline sharing.

## 7. Platform Admin Operations

1. Login to platform admin console.
2. Monitor companies, users, and billing states.
3. Use system health and audit panels.
4. Create demo records for sales/onboarding scenarios.
5. Optionally send demo login details by email.

## 8. Operational Do/Don’t

### Do
- Keep statuses and updates current daily.
- Validate access boundaries when sharing QR paths.
- Keep evidence attached close to event time.

### Don’t
- Bypass role checks through manual URL assumptions.
- Overwrite historical timeline entries.
- Mix tenant data across company contexts.

## 9. Incident Handling (Operational)

- If upload-related actions fail, retry once and verify file storage availability before repeating bulk actions.
- If cross-module status appears inconsistent (planning vs QA vs work log), validate authoritative endpoint data before manual correction.
- If tenant isolation is suspected to be broken, freeze tenant-facing admin actions and escalate immediately.

## 10. Minimal Service Expectations

- Managers should be able to load daily project overview without module-level errors.
- Operatives should be able to submit work logs in assigned project scope.
- Unit timeline access should remain available in public read-only mode even if private access is blocked by auth state.
