# Crew, Templates, Salary and Accounts functional review

Reviewed 28 September 2026. No application source fixes were made.

## Confirmed application issues

### Leave carry-forward checkbox has no effect on balances

The isolated API fixture had five unused casual-leave days in 2026 and an annual allocation of six. January 2027 returned six remaining days with carry-forward enabled and the same six with it disabled. The calculation subtracts only current-year use from the base allocation; it returns the flag without applying any carry-forward. The UI explicitly offers “Enable unused leave carry-forward”.

Sources: `artifacts/api-server/src/routes/crew.ts:1735`, `:1820`, `:1841`; `artifacts/vidhai-erp/src/pages/settings/templates.tsx`.

### Resyncing Paid payroll overwrites payment history

Mark a payroll row Paid, then click Sync salary slips (target Processing). Status remains Paid, but both paidAt and processedAt are replaced with the resync time. The handler also sets paidBy/processedBy to the current caller. The live API reproduction observed paidAt changing from `2026-09-28T06:22:21.761Z` to `2026-09-28T06:22:21.964Z`. This reproduction did not show an extra payment or incorrect salary amount; the defect is the recorded payment/processing history.

Source: `artifacts/api-server/src/routes/crewpay.ts:649`–`:664`.

### Holiday API accepts impossible dates

Creating a holiday template with effectiveFrom and holiday date `2026-02-31` returned HTTP 201 and retained both invalid dates. Validation checks the string format and effective year, not whether the calendar date exists. Native browser date inputs may prevent ordinary users from entering this exact value, so this is a backend validation gap rather than a demonstrated UI failure.

Source: `artifacts/api-server/src/routes/templates.ts:33`–`:34`.

### Lower-priority earned-leave validation gap

The API accepts annual earned leave of 1 and monthly maximum of 10. Sick/casual/permission allocations have matching monthly-vs-yearly checks, but earned leave does not. These earned-leave inputs are not exposed in the current template editor; this is not a normal demo-screen blocker.

Source: `artifacts/api-server/src/routes/templates.ts:35`.

## Accounts observations

- Six additional manual-account-posting tests passed, covering credit, debit, transfer, journal movement and invalid inputs.
- The earlier complete suite covered account payment/approval/import/journaling handlers. Its seven failures remain stale expectations/fixtures, not confirmed application failures: five use the old client name, and two expect nameless Credit transactions contrary to the current UI/API requirement.
- Financial Statements “Download PDF” opens an HTML print window, requiring the user to choose Save as PDF. The popup is opened after awaiting an API call, which can trigger popup blocking depending on browser/timing. This is a source-review risk, not reproduced here.
- Both financial-statement export handlers fetch fresh server data but discard it and export the already-loaded frontend account state. If account data changes after opening the report, the exported amounts can be stale. A refresh before export avoids this scenario. Source: `artifacts/vidhai-erp/src/pages/accounts/FinancialStatements.tsx:356` and `:372`.

## Passing evidence and limitations

The focused harness reran all 19 existing live API groups successfully and added a passing holiday edit/duplicate/deactivate round-trip, for 20 passing groups. It also printed the reproductions above. Coverage includes template creation, Crew employee validation, punch evidence/location, approvals, leave limits, overtime inclusion, working-day salary calculation, deductions, attendance-triggered salary refresh, paid-payroll edit rejection, and session restoration/logout.

Earlier frontend/backend builds and type checks passed. Salary PDF generation regression passed; visual layout was not checked. No browser is connected, so camera/GPS hardware, native print preview, UI walkthroughs and client deployment remain unverified. No full sign-off for every input or workflow is implied.

Evidence: `demo-focused-audit.log`; reproduction harness: `scripts/test/demo-focused-audit.ts`. The latest isolated test database is `vidhai_crew_audit_1790576533830`; application/client records were not used. An earlier focused run retained `vidhai_crew_audit_1790576459296`.
