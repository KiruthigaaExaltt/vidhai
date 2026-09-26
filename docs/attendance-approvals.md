# Attendance and approvals

Vidhai follows the attendance rules in the local Yugam reference. Vidhai keeps the unified daily punch request and finalized attendance in its existing `attendance_logs` collection; `approvalStatus` separates pending requests from finalized payroll attendance. Existing records remain readable without a data migration.

## Configuration

- Attendance requires one decision by HR or any user granted the attendance approval permission. Rejection requires the attendance rejection permission.
- Employee approver chains, reporting managers, self-approval flags and legacy company level settings do not control attendance approval.
- Existing pending requests at any legacy approval level can be finalized in one review; prior approval history is preserved.

## Daily workflow

1. Punch-in records server time in the organization's timezone, photograph and location. The day shows **Punch Out Pending**. Holidays, assigned week-offs and dates outside employment block self-service punches.
2. Punch-out completes the same daily request and shows **Pending Approval**. The employee can correct punch-out before the first approval; captured evidence and original values are retained.
3. Users with attendance approval/rejection permission review the request. Approval requires both punches; incomplete requests may be rejected with a reason. Decisions are recorded in history. Rejection is terminal for that request; the employee can submit a new punch on the same current day, preserving the previous attempt in the audit log.
4. Final approval applies time/fine corrections, marks attendance Present or Late, creates the approved deduction and refreshes the salary slip/payroll record. A payroll refresh failure is reported to the reviewer without undoing the committed attendance decision.
5. Hourly closure marks missed prior working days absent, preserves available punch-in evidence, and rejects incomplete punches. Complete requests awaiting approval, paid months, leave, holidays and week-offs are preserved.

## Calculation and integrity

- Fixed shifts use late arrival beyond the enabled buffer plus early departure. Flexible shifts use the configured net work hours; a shortage below half of required hours is tagged `half_day` while finalized attendance remains Late, as in Yugam.
- Fixed, percentage-of-hourly-salary and salary-based fines use the same rules. A zero fixed hourly fine falls back to salary. Hourly salary uses scheduled working days, excluding assigned holidays and week-offs.
- Fine overrides, including zero, survive deduction regeneration. The calculated amount remains available separately.
- Approval and its deduction are committed in a MongoDB transaction. Revision checks prevent stale reviews/corrections overwriting newer work. Punch creation is serialized per employee. MongoDB must support transactions, as used elsewhere in Vidhai.
- Paid payroll months cannot be changed by punches, approvals, corrections, manual overrides, closure or deduction regeneration.

## Verification

Run `node --test test/attendanceWorkflow.test.mjs` from `artifacts/api-server`. Tests use an isolated in-memory database adapter and cover calculations, policies, permission-based approval, legacy pending requests, overrides, rejection, rollback, stale reviews, paid-month protection and closure. They do not connect to application data.

## Attendance screens

- Dashboard and Crew use the same photo/GPS punch component. The dashboard endpoint returns only the signed-in employee's current day and basic identity.
- Crew's Approvals view includes requests from every date, with Pending, Approved and Rejected filters, employee filtering, search and pagination. No approval levels are shown.
- Reviewers see both photos and GPS map links. Edited punch times recalculate the fine preview before approval. The submitted record revision prevents approval of an unseen employee correction.
- Monthly and individual registers use the current selected month's data. Their detail dialogs include review actions, employee punch-out correction, decision history and audit history. Derived days use the same active holiday/work-pattern calendar rules as punches and closure.
- Manual overrides require update/change-time permissions and an audit reason. Nonworking categories clear punch times, retain original evidence and refresh payroll; refresh failures are reported after the attendance save.
- Punching for another employee requires both attendance create and for-others permissions. Own punches retain the existing membership-based access.

The local Yugam comparison covers `CrewAttendancePanel`, `AttendancePunchApprovalPanel`, `MonthlyAttendanceRegister`, `DashboardAttendancePunch`, attendance services, punch approval services, and closure. Vidhai retains its styling and unified attendance storage. Automated tests and type checks do not replace a real-device camera/GPS permission check.
