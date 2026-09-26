# Aakash - August 2026 salary comparison

Created in local MongoDB database vidhaiic, organization 1. Username: aakash. Employee ID: 2; code: QA-AAKASH-AUG26. Salary slip is Generated, not Paid. The test login has a random password; use the existing administrator to inspect the employee.

## Test setup

- Monthly salary: INR 30,000; annual CTC INR 360,000.
- Shift: 09:30-18:30, 9 hours, 15-minute arrival buffer.
- Sundays off: August 2, 9, 16, 23, 30. Assigned test holiday: August 15.
- Working-day divisor: 31 - 5 - 1 = 25.
- Daily rate: 30,000 / 25 = INR 1,200.
- Hourly rate: 30,000 / (25 x 9) = INR 133.333333...; round each fine to two decimals.
- PF/ESI disabled; no claims, overtime or manual deductions in this fixture.

## Every day

| Date | Case | In / Out | Payable working days | LOP (INR) | Punch fine (INR) |
|---|---|---|---:|---:|---:|
| 2026-08-01 | Normal attendance | 09:30 / 18:30 | 1 | 0.00 | 0.00 |
| 2026-08-02 | Sunday off | - / - | Excluded | 0.00 | 0.00 |
| 2026-08-03 | Absent | - / - | 0 | 1200.00 | 0.00 |
| 2026-08-04 | Paid casual leave | - / - | 1 | 0.00 | 0.00 |
| 2026-08-05 | Paid sick leave | - / - | 1 | 0.00 | 0.00 |
| 2026-08-06 | Approved Other leave (paid by Yugam) | - / - | 1 | 0.00 | 0.00 |
| 2026-08-07 | Half day worked | 09:30 / 14:00 | 0.5 | 600.00 | 600.00 |
| 2026-08-08 | Late within 15-minute buffer | 09:40 / 18:30 | 1 | 0.00 | 0.00 |
| 2026-08-09 | Sunday off | - / - | Excluded | 0.00 | 0.00 |
| 2026-08-10 | 30 minutes late after buffer | 10:15 / 18:30 | 1 | 0.00 | 66.67 |
| 2026-08-11 | 60 minutes early exit | 09:30 / 17:30 | 1 | 0.00 | 133.33 |
| 2026-08-12 | 15 minutes late plus 60 early | 10:00 / 17:30 | 1 | 0.00 | 166.67 |
| 2026-08-13 | Approved permission 09:30–10:30 | 10:30 / 18:30 | 1 | 0.00 | 100.00 |
| 2026-08-14 | Half day worked plus paid half-day casual leave | 14:00 / 18:30 | 1 | 0.00 | 566.67 |
| 2026-08-15 | Holiday | - / - | Excluded | 0.00 | 0.00 |
| 2026-08-16 | Sunday off | - / - | Excluded | 0.00 | 0.00 |
| 2026-08-17 | Remote work | 09:30 / 18:30 | 1 | 0.00 | 0.00 |
| 2026-08-18 | Attendance pending approval | 09:30 / 18:30 | 0 | 1200.00 | 0.00 |
| 2026-08-19 | No attendance record | - / - | 0 | 1200.00 | 0.00 |
| 2026-08-20 | Rejected casual leave; no attendance | - / - | 0 | 1200.00 | 0.00 |
| 2026-08-21 | Normal attendance | 09:30 / 18:30 | 1 | 0.00 | 0.00 |
| 2026-08-22 | Normal attendance | 09:30 / 18:30 | 1 | 0.00 | 0.00 |
| 2026-08-23 | Sunday off | - / - | Excluded | 0.00 | 0.00 |
| 2026-08-24 | Normal attendance | 09:30 / 18:30 | 1 | 0.00 | 0.00 |
| 2026-08-25 | Normal attendance | 09:30 / 18:30 | 1 | 0.00 | 0.00 |
| 2026-08-26 | Normal attendance | 09:30 / 18:30 | 1 | 0.00 | 0.00 |
| 2026-08-27 | Normal attendance | 09:30 / 18:30 | 1 | 0.00 | 0.00 |
| 2026-08-28 | Normal attendance | 09:30 / 18:30 | 1 | 0.00 | 0.00 |
| 2026-08-29 | Normal attendance | 09:30 / 18:30 | 1 | 0.00 | 0.00 |
| 2026-08-30 | Sunday off | - / - | Excluded | 0.00 | 0.00 |
| 2026-08-31 | Normal attendance | 09:30 / 18:30 | 1 | 0.00 | 0.00 |

## Salary calculation

Unpaid days: absent August 3 (1), half-day August 7 (0.5), pending August 18 (1), missing August 19 (1), rejected leave August 20 (1) = 4.5 days.

Payable days = 25 - 4.5 = 20.5. Earned ratio = 20.5 / 25 = 82%.

| Component | Full month (INR) | Earned (INR) |
|---|---:|---:|
| Basic (50% of CTC) | 15,000.00 | 12,300.00 |
| HRA (40% of Basic) | 6,000.00 | 4,920.00 |
| Special allowance (residual) | 9,000.00 | 7,380.00 |
| Gross salary | 30,000.00 | 24,600.00 |

LOP = 4.5 x 1,200 = INR 5,400, already reflected in gross salary.

Punch fines = 600 + 66.67 + 133.33 + 166.67 + 100 + 566.67 = INR 1,633.34.

**Net pay = 24,600 - 1,633.34 = INR 22,966.66.**

## Yugam behavior retained

All approved leave types earn working-day credit, including Other and Permission. Permission on August 13 overlaps a full attendance day and does not add a second day. The leave counter is 4.5 days (Casual 1.5, Sick 1, Other 1, Permission 1); do not add that counter to worked days without removing overlaps.

Approved permission does not waive punch fines: August 13 arrival at 10:30 incurs 45 minutes after the buffer, INR 100. Half-day attendance still incurs punch fines: August 7 loses half a day's salary AND incurs INR 600 early-exit fine. August 14 receives a full day's salary through half-day attendance plus approved half-day leave, but incurs INR 566.67 late fine. These reproduce the reference logic, rather than assuming leave excuses late/early punches.

## Comparison and fixes

| Result | Original Vidhai | Corrected Vidhai | Yugam functions |
|---|---:|---:|---:|
| Payable days | 19.5 | 20.5 | 20.5 |
| Gross (INR) | 23,400.00 | 24,600.00 | 24,600.00 |
| LOP (INR) | 6,600.00 | 5,400.00 | 5,400.00 |
| Punch fines (INR) | 466.67 | 1,633.34 | 1,633.34 |
| Net (INR) | 22,933.33 | 22,966.66 | 22,966.66 |

Vidhai now includes all approved leave types and uses punch-time deductions for half-day logs. Removed synthetic Other-leave LOP deductions. PDF monetary calculation code already matches Yugam; its displayed amounts were checked using Aakash's saved slip and a PDF was generated.

Reference comparison executes Yugam's original calendar, salary-component and punch-deduction functions on the same input. Yugam files and database were not modified. This fixture verifies the listed cases; it does not establish every possible statutory, overtime, claim or employment-history combination.

Artifacts: [printed salary slip](aakash-august-2026.pdf), [raw comparison](aakash-august-2026.json).
