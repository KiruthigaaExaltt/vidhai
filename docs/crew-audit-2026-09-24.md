# Crew and payroll audit — 24 September 2026

Automated API/calculation checks and source review completed. This is a green light for the tested logic and continued acceptance testing, not a complete browser/device or production sign-off.

The browser runtime reported no connected browsers. Camera/GPS prompts, photo picker interaction, and the final PDF print preview could not be exercised visually. After the audit, the user requested restoring mandatory photography: both punch actions now require an uploaded camera photo in the UI and API. Regression checks cover missing, empty, and URL-only evidence rejection, and successful photo storage using a PNG fixture.

## Original 12 tasks

Original item 9 (claims in salary slips) remains excluded from the acceptance scope.

| Original item | Verification and result |
| --- | --- |
| 1. Attendance, salary, leave, work-pattern and holiday templates | All five API template types create and round-trip. Tested buffer default 15, buffer disabling, fixed/salary fine calculation, Sundays/holidays, custom salary component names, and monthly/yearly leave limits. UI defaults/layout reviewed. Live Google Calendar availability was not tested. |
| 2. Default password | Actual user creation returns `vidhaii123`; encrypted login succeeds with that password. Default-password labels reviewed. |
| 3. Numeric leading zero | Component event test proves `016` becomes `16`, decimals survive, and text identifiers retain leading zeros. |
| 4. HR/admin attendance approval | Actual HR role with approval but no update/create permission approves a completed record. Crew user cannot approve. No multi-level approval added. Fixed the outer update-permission gate. |
| 5. Unwanted symbols | UTF-8 source scan passes for common corrupted currency/punctuation sequences across frontend TS/TSX/CSS. Browser rendering remains unverified. |
| 6. Refresh/reopen session | Cookie-only restore tested; access-token renewal on `/auth/me` tested; network failures do not revoke auth; concurrent restore calls coalesce. Refresh lifetime is 72 hours, with local and staging settings aligned. Real elapsed three-day testing was not performed. |
| 7. Punch location | API round-trip preserves coordinates and address; register now returns stored addresses and approval status. Invalid coordinates rejected. Actual GPS/reverse-geocoding availability remains device/service dependent. |
| 8. Overtime amount | Two hours calculates ₹143.36 for the fixture; pending OT is excluded; approving OT adds the amount to payroll. |
| 10. Crew punch without permissions | Linked user with no role permissions can fetch own attendance and punch in/out. Duplicate punch, non-crew punch and unauthorized approval are rejected. UI access now includes linked crew self-service. |
| 11. Automatic deductions | Salary-based and fixed fines, late/early attendance, LOP, half-day Other leave, and idempotent regeneration tested. Missing working-day attendance reduces payroll even without an explicit absent log. |
| 12. No default templates | Fresh isolated app starts without template records. Member form requires explicit assignment; no fallback templates introduced. |
| 13. Edit-member form | Edit label and populated fields reviewed; employee update API exercised, including rejection of invalid phone and salary values. Visual interaction remains unverified. |

## Follow-up changes checked and repaired

- Attendance buffer is the user-facing tolerance field, default enabled at 15. Checkboxes are side by side and the minutes field is last. API does not require the removed late-threshold field.
- Leave template initial allocations are zero; salary component names are text inputs.
- Attendance photo is mandatory again for punch-in and punch-out, along with location.
- Punch state switches from in to out to completed; repeat calls are rejected by the API.
- Future register dates show a frozen dash, including any prematurely entered records.
- Individual employee register receives addresses and approval state. Raw coordinate labels and server-time text are absent from the punch UI.
- Shared 12-hour time formatter tested at midnight/noon/evening; template summary now uses it. Native time inputs retain browser-controlled presentation and 24-hour values internally.
- Salary ₹ dialog validates fixed amounts, filters inactive templates, clears stale overrides on template switch, handles deductions when calculating residuals, and supports read-only users. API rejects negative amounts and earnings above monthly CTC.
- Regenerating an open salary slip now refreshes its displayed data immediately.
- Profile and procurement phone inputs now have the same ten-digit restriction as Crew/CRM. Profile, employee and procurement API paths reject invalid lengths.
- Hourly permission requests no longer fall into daily-leave validation; hourly allocation and monthly-limit cases pass.
- Payslip printing uses an isolated body-level print view with A4 print rules. Visual PDF output needs browser confirmation.

## Verified August calculation

The isolated fixture uses ₹20,000 monthly salary, 09:30–18:30, 15-minute buffer, Sundays off, three explicitly supplied August holidays, one paid Casual day, one paid Sick day, one Other/LOP day, and the late/early events from the original example. Holidays are deterministic fixture data, not a fresh Google download.

| Result | Amount/count |
| --- | ---: |
| Present days | 20 |
| Payable days | 30 / 31 |
| Paid leave days | 2 |
| LOP days | 1 |
| LOP reduction included in earned salary | ₹645.16 |
| Earned gross pay | ₹19,354.84 |
| Additional late/early deductions | ₹197.13 |
| Combined reduction from monthly salary | ₹842.29 |
| Net pay | **₹19,157.71** |

The slip's “Total Deductions” is ₹197.13 because LOP is already removed from earnings. It must not deduct ₹645.16 again. The earlier conversation promising ₹842.29 in that particular field was incorrect.

## Evidence and rerun

- 17 isolated API regression groups: `pnpm --filter @workspace/scripts run test:crew`.
- 16 frontend/auth/input/error tests: `pnpm --filter @workspace/api-server run test:crew:frontend`.
- API and frontend `pnpm exec tsc --noEmit`: passed.
- API and frontend production builds: passed; frontend reports bundle-size and mixed XLSX import warnings.
- `git diff --check`: passed.

The API harness creates uniquely named local `vidhai_crew_audit_<timestamp>` databases, retained for inspection. It does not load the application database configuration or modify manual-testing records. Test HTTP servers are closed at completion. Yugam was only read as a reference.

Restart the API and reload the frontend before acceptance testing. Regenerate existing unpaid salary slips to apply the corrected calculation; saved slips are not silently rewritten. Before production sign-off, confirm real-device punch/location and photo selection, and inspect the PDF print preview.

This audit does not certify every possible input in every unrelated ERP module or guarantee third-party services; it covers the 12 tasks and the concrete follow-up flows above.
