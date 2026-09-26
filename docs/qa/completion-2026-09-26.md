# Final verification — 26 September 2026

The changes from `5481f3f` and `bf5fb4b`, the pending attendance/salary-structure work, and the fixes below have passed automated verification. Physical-device testing was explicitly deferred in favor of automated browser checks.

## Fixed during verification

- Scripts now typecheck their imported workspace sources and integration tests. Optional Yugam comparison imports no longer require the local reference checkout during a normal build. Corrected the Nishanth fixture's impossible literal comparison and its generator.
- Attendance review checks permission before incomplete-punch validation. Updated integration expectations to the working-day salary rules: 23 scheduled days, three paid leave days, INR 265.70 punch fines and INR 19,734.30 net for the existing August integration fixture. Overtime retains its separately defined calendar-day hourly calculation. LOP follows reference rounding of the daily rate before multiplying unpaid days.
- The outer API middleware now allows self-attendance/settings, own punch-out correction, HR fine preview, and scoped salary reads to reach their action-specific authorization. Real-API regressions cover these paths and denied access.
- Login now uses the permission-aware landing route instead of forcing every user onto Dashboard. Authentication waits for the current user's permissions before selecting a destination.
- Empty dashboard chamber data now displays 0% occupancy instead of NaN.
- Payroll documentation now accurately describes the salary dialog's fixed-component controls and the existing API-only statutory settings.

## Results

| Verification | Result |
| --- | --- |
| Workspace TypeScript | Passed |
| Complete workspace build | Passed, including mockup sandbox, API, frontend and PWA service worker; `PORT=5173`, `BASE_PATH=/` supplied as required |
| All API test files with the TypeScript loader | **209 passed; 0 failed** |
| Real MongoDB integration + browser suite | **27 groups passed: 18 integration + 9 browser** |
| Browser | Chrome 155.0.8059.12; no uncaught page errors |
| Downloaded PDF visual inspection | Passed; single-page payslip is readable, aligned, and unclipped |
| Diff whitespace | Passed |

The build still reports nonblocking bundle-size/mixed-import warnings. Commands and prerequisites are in [README](README.md). Raw logs remain local and are ignored by Git. Test data is isolated in timestamped `vidhai_crew_audit_*` databases; the successful browser run used `vidhai_crew_audit_1790392653791`.

## Browser coverage and evidence

1. Employee without dashboard permission lands on Crew and can access self-attendance.
2. Dashboard-authorized employee login and reload restore the attendance screen.
3. Denied geolocation blocks confirmation and shows recovery guidance.
4. Photo capture and GPS enable punch-in; simulated no-face state blocks capture; geocoder failure preserves GPS.
5. A 390 × 844 mobile viewport completes punch-out, saves both photos, and has no horizontal document overflow.
6. A fresh browser context restores the employee session using persistent cookies.
7. Salary dialog blocks excessive fixed amounts and saves/reloads valid values.
8. HR can preview and approve corrected punch times without employee/update permissions; approved attendance persists.
9. Salary preview produces a valid PDF and the download completes.

Evidence: [desktop dashboard](browser/desktop-dashboard.png), [captured evidence](browser/desktop-punch-evidence.png), [mobile dashboard](browser/mobile-dashboard.png), [salary structure](browser/salary-structure.png), [HR approval](browser/hr-approval.png), [downloaded payslip](browser/browser-salary-slip.pdf), [rendered payslip](browser/downloaded-payslip.png), [browser result](browser/result.json).

Camera frames, GPS and face detection are simulated in the browser harness. The API, authentication, UI, and database persistence are real. These checks do not establish physical camera/GPS quality, real face-model accuracy, live geocoder availability, or a real elapsed 72-hour session. The saved Aakash/Nishanth comparisons were retained, not rerun against the application database. The older September 24 audit's excluded claims task remains outside its original acceptance scope.

Suggested TL update: “The assigned changes are implemented and committed. Workspace validation/builds, 209 automated tests, and 27 integration/browser checks pass. Automated desktop/mobile attendance and payslip checks are complete; physical-device testing is deferred.”
