# Nishanth - August 2026

Employee: nishanth (ID 3, code QA-NISHANTH-AUG26); username nishanth. Created in local database vidhaiic, organization 1. Slip status: Generated. Inspect through your administrator account; the test user has a random password.

## Setup

- Monthly salary INR 20,000. Basic INR 10,000; HRA INR 4,000; Special allowance INR 6,000.
- Shift 09:30-18:30, 9 hours; 15-minute morning grace, salary-based fine.
- Sundays off: August 2, 9, 16, 23, 30.
- Google India holidays: August 15 (Independence Day / Parsi New Year), August 26 (Onam / Milad un-Nabi), August 28 (Raksha Bandhan). Multiple events on one date count as one holiday.
- Calendar: https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics (downloaded September 26, 2026; raw snapshot saved alongside this report).
- Absent August 3 and 4. Approved paid casual leave August 5; approved paid sick leave August 6.
- Late August 7: 10:30-18:30, one hour after shift start.
- Remaining working dates have normal approved attendance. PF/ESI disabled; no other deductions, overtime or claims.

## Calculations

Working days = 31 - 5 Sundays - 3 holiday dates = 23.

Attendance: 18 normal present + 1 late + 2 paid leave + 2 absent = 23 working days.

Payable days = 23 - 2 absent = 21. Both approved leaves are paid.

| Salary component | Monthly (INR) | Earned: monthly x 21 / 23 (INR) |
|---|---:|---:|
| Basic | 10,000.00 | 9,130.43 |
| HRA | 4,000.00 | 3,652.17 |
| Special allowance | 6,000.00 | 5,478.26 |
| Gross | 20,000.00 | 18,260.86 |

LOP display = round(20,000 / 23, 2) x 2 = 869.57 x 2 = INR 1,739.14.

Chargeable late time = 60 - 15 grace = 45 minutes = 0.75 hour.

Late fine = round((20,000 / (23 x 9)) x 0.75, 2) = INR 72.46.

**Net pay = 18,260.86 - 72.46 = INR 18,188.40.**

LOP is already reflected in gross salary; do not subtract it again. Yugam rounds individual salary components to paise before adding them. Directly rounding 20,000 x 21 / 23 gives INR 18,260.87, which differs by one paisa from the component sum used by both applications.

## Daily attendance

| Date | Case | In | Out | Payable working days | Paid leave |
|---|---|---|---|---:|---|
| 2026-08-01 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-02 | Sunday off | - | - | Excluded | - |
| 2026-08-03 | Absent | - | - | 0 | - |
| 2026-08-04 | Absent | - | - | 0 | - |
| 2026-08-05 | Paid casual leave | - | - | 1 | Casual |
| 2026-08-06 | Paid sick leave | - | - | 1 | Sick |
| 2026-08-07 | One hour late; 45 minutes fined after grace | 10:30 | 18:30 | 1 | - |
| 2026-08-08 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-09 | Sunday off | - | - | Excluded | - |
| 2026-08-10 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-11 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-12 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-13 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-14 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-15 | Independence Day / Parsi New Year | - | - | Excluded | - |
| 2026-08-16 | Sunday off | - | - | Excluded | - |
| 2026-08-17 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-18 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-19 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-20 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-21 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-22 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-23 | Sunday off | - | - | Excluded | - |
| 2026-08-24 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-25 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-26 | Onam / Milad un-Nabi | - | - | Excluded | - |
| 2026-08-27 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-28 | Raksha Bandhan | - | - | Excluded | - |
| 2026-08-29 | Normal attendance | 09:30 | 18:30 | 1 | - |
| 2026-08-30 | Sunday off | - | - | Excluded | - |
| 2026-08-31 | Normal attendance | 09:30 | 18:30 | 1 | - |

Vidhai's saved payable days, paid leave days, components, LOP, late fine, gross and net matched Yugam's original functions on identical inputs. PDF amounts were verified. No payroll source changes were needed for this scenario.

[Salary slip](nishanth-august-2026.pdf) | [Raw comparison](nishanth-august-2026.json)
