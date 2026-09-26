# Local manual testing — 26 September 2026

Data is populated in **local MongoDB `vidhaiic`**, used by the app at **http://localhost:5173** (API port 5001). Start the normal local frontend/API if they are stopped. The temporary verification servers shut down after testing.

From the repository root, run `pnpm.cmd --filter @workspace/api-server start` in one terminal and `pnpm.cmd --filter @workspace/vidhai-erp dev` in another. The API build is already up to date.

The two existing Aakash/Nishanth fixtures were preserved. New employees are named `Local QA …`, with codes `MF-EMP-0001` through `MF-EMP-0040`. Most operational documents have `MF-` identifiers; extra templates and account fixtures have `LOCAL-QA-` names.

## Accounts

- Use your existing administrator login for all modules, settings, approvals and payroll.
- Example employee login: **`arun_kumar` / `LocalQA!2026`**. Operator example: **`suresh_kumar` / `LocalQA!2026`**. These are newly seeded local-only accounts, not production credentials.
- All 12 seeded logins and their employee IDs are in the ignored file `tmp/local-manual-seed/logins.json`.
- The previously unconfigured local Ledger module now has the six-character password **`QA2026`**. Its normal unlock screen and access checks remain enabled.

## Data coverage

| Area | Populated data |
| --- | --- |
| Crew | 42 employees including the existing 2; 12 new usable accounts; active, on-leave and offboarded examples; ten detailed personal/bank profiles |
| Templates | 13 each of attendance, salary, work pattern, holiday and leave; 11 work-order templates |
| Attendance | 1,339 rows; normal, late, early exit, half-day, WFH, absent, pending, rejected and approved cases |
| Leave | 128 requests, including hourly permissions and half-day casual leave |
| Claims | 160 total: 40 each of overtime, bonus, reimbursement and allowance, across pending/approved/rejected states |
| Payroll | 80 newly calculated records across August/September 2026; August has 10 Paid, 10 Processed and 20 Processing examples; September remains editable |
| Inventory | Materials, item names, categories, warehouses, services, stock, adjustments and movements; 10 additional casing-soil lots |
| Production | 10+ batches per Annur/Coimbatore/Lab site; 40 growing batches, observations, harvests and traceability links; 12 growing rooms |
| Sales | 40 each of orders, quotes, proformas, challans, invoices and returns, with line items; 14 payments; 10 receivable adjustments and communication notes |
| Procurement | 40 each of requests, orders, receipts, invoices, vendor payments, returns and availability records |
| Tasks/assets | 42 tasks, 40 assignments/time logs/work orders, 40 assets, 32 allocations |
| Fleet | 10 each of vehicles, fuel logs, maintenance logs, usage logs and status-history records |
| Accounts | Chart of accounts, balanced journals/lines, payables, receivables and transactions; 10 each of groups, cost centres, transaction types, pending bank receipts and downloadable sample PDF documents |
| Other | 10 in-app notifications; departments, roles, alerts, scheduling and employee-code prefixes/suffixes |

Exact collection counts are in [local-seed-counts.json](local-seed-counts.json). At least 10 records are supplied for the populated business lists above. The application's four actual operational sites remain four. Organization/fleet/code settings remain singletons. Session/security records, live timers, legacy phase approvals and automatic posting/reservation bookkeeping are not padded with fictitious records; the corresponding actions generate those records when exercised. This is a manual-test dataset, not a reconstruction of every historical stock/financial posting.

## What to test

1. **Employees and fields:** search `Local QA`, open the first ten profiles, inspect personal/bank/emergency fields, edit an ordinary employee and assign another template. The first 12 employees have login accounts. Employee 39 is On Leave; employee 40 is Offboarded with a September 15 exit date.
2. **Templates:** search `LOCAL-QA`. Try salary-based, fixed and percentage fines; flexible hours and no buffer; Sunday-only, weekend and alternating-week patterns; fixed, percentage, dependent percentage and residual salary components. Each salary template has an editable Travel fixed component.
3. **Attendance:** choose **August 2026** for the complete historical scenarios. Inspect pending/rejected rows and approve a pending row for an employee with unpaid payroll. Try late/early corrections and fine preview. August payroll for employees 1–10 is deliberately Paid, so corrections/regeneration should be blocked there. Use employee 21 onward for unrestricted August recalculation.
4. **Live attendance:** sign in as a seeded employee and punch on today's date. The seed leaves today empty. Camera and GPS require the usual browser permissions. Historical seeded punches do not claim to contain real camera/GPS evidence.
5. **Leave/claims:** filter pending/approved/rejected records. Check half-days, permission hour balances, reimbursements, allowances, overtime and bonuses. Some leave/attendance overlaps deliberately exercise paid-day capping.
6. **CrewPay:** select **August 2026** to inspect a completed month, or September for the elapsed current month. Preview/download slips. Verify employer/employee contributions and deductions; bonuses remain separate under Yugam's behavior. August Paid records are simulated local payment states; no money was sent.
7. **Other ERP modules:** inspect list filters and details in each area above. Open linked document line items, assets/allocations, fleet histories, production details and traceability. Ledger Bank & Cash contains pending sample receipts with PDFs; the receipt files explicitly say they are local test fixtures.

## Verification and Yugam comparison

- **4,931 differential comparisons passed** by executing original functions from the local Yugam checkout against identical inputs: work calendars, employment windows, paid leave, half-days, LOP, fixed/flexible punch metrics, grace windows, all fine types, salary components, PF/VPF/ESI and contribution periods.
- Found and fixed a real rounding difference: at hourly salary 83.33 for half an hour, Vidhai returned 41.67 while Yugam returned 41.66. Vidhai now uses the same final rounding. A regression assertion is retained without requiring the Yugam checkout.
- **209 automated tests passed**; **27 integration/browser groups passed**, including desktop/mobile attendance and salary PDF flows.
- Full workspace TypeScript validation and the production build passed. The existing nonblocking bundle-size/mixed-import warnings remain.
- The populated local app passed **55 API list checks**, all declared foreign-key references and arithmetic/link checks for **80 payroll records**, plus **23 browser page smoke checks**. [Detailed evidence](local-data-verification.json), [Crew screenshot](local-browser/crew.png), [differential result](yugam-parity-result.json).
- Browser camera/GPS/face checks use simulation. Physical-device behavior remains unverified. Page smoke checks establish rendering/read access, not every action in unrelated ERP modules.
- **L1–L5 approval chains are excluded**, as requested. This evidence verifies the listed changed flows; it is not a claim that every Yugam screen, optional feature or edge case is identical. Vidhai retains its organization/access controls and explicit template assignment.

## Repeatable commands

```powershell
pnpm.cmd local:data:seed
pnpm.cmd --filter @workspace/scripts run test:yugam-parity
pnpm.cmd --filter @workspace/scripts run test:local-data
```

The local seed refuses remote MongoDB, production mode and any database other than `vidhaiic`. It does not invoke the production seed's cleanup. Completed reruns preserve manual edits; the ignored manifest tracks completed phases. A BSON Extended JSON backup from before seeding is retained at `tmp/local-manual-seed/before-seed.ejson`. Do not delete the manifest to reset data: interrupted initial imports deliberately require inspection instead of clearing existing records. The production/demo/staging seed commands retain their existing behavior and are not the commands for this local dataset.

Suggested TL update: “The changes are implemented and automated checks pass. Local test data is populated across ERP modules, and the changed payroll calculations were compared directly with Yugam. Manual acceptance can now be performed. L1–L5 approvals are excluded and physical-device checks are deferred.”
