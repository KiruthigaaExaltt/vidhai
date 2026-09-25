# Attendance and approvals

Vidhai follows the attendance rules in the local Yugam reference. Vidhai keeps the unified daily punch request and finalized attendance in its existing `attendance_logs` collection; `approvalStatus` separates pending requests from finalized payroll attendance. Existing records remain readable without a data migration.

## Configuration

- Company Profile → Attendance approvals: enable the employee approval chain, select 1–5 required levels, and allow or disable administrator overrides.
- Crew → Add/Edit employee: select L1–L5 approvers. With no explicit chain, the reporting manager is L1. Approvers must be distinct, active employees in the same organization.
- An employee explicitly allowed to approve their own attendance can approve their completed day.
- Disabling the chain still requires a single decision by a user with attendance approval permission; it does not silently auto-approve punches.

## Daily workflow

1. Punch-in records server time in the organization's timezone, photograph and location. The day shows **Punch Out Pending**. Holidays, assigned week-offs and dates outside employment block self-service punches.
2. Punch-out completes the same daily request and shows **Pending Approval**. The employee can correct punch-out before the first approval; captured evidence and original values are retained.
3. Assigned approvers act in order. Approval requires both punches; incomplete requests may be rejected with a reason. Administrator overrides are recorded in history. Rejection is terminal for that request; the employee can submit a new punch on the same current day, preserving the previous attempt in the audit log.
4. Final approval applies time/fine corrections, marks attendance Present or Late, creates the approved deduction and refreshes the salary slip/payroll record. A payroll refresh failure is reported to the reviewer without undoing the committed attendance decision.
5. Hourly closure marks missed prior working days absent, preserves available punch-in evidence, and rejects incomplete punches. Complete requests awaiting approval, paid months, leave, holidays and week-offs are preserved.

## Calculation and integrity

- Fixed shifts use late arrival beyond the enabled buffer plus early departure. Flexible shifts use the configured net work hours; a shortage below half of required hours is tagged `half_day` while finalized attendance remains Late, as in Yugam.
- Fixed, percentage-of-hourly-salary and salary-based fines use the same rules. A zero fixed hourly fine falls back to salary. Hourly salary uses scheduled working days, excluding assigned holidays and week-offs.
- Fine overrides, including zero, survive deduction regeneration. The calculated amount remains available separately.
- Approval and its deduction are committed in a MongoDB transaction. Revision checks prevent stale reviews/corrections overwriting newer work. Punch creation is serialized per employee. MongoDB must support transactions, as used elsewhere in Vidhai.
- Paid payroll months cannot be changed by punches, approvals, corrections, manual overrides, closure or deduction regeneration.

## Verification

Run `node --test test/attendanceWorkflow.test.mjs` from `artifacts/api-server`. Tests use an isolated in-memory database adapter and cover calculations, policies, approval sequencing, overrides, rejection, rollback, stale reviews, paid-month protection and closure. They do not connect to application data.
