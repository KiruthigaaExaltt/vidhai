# Salary calculations and salary slips

Vidhai uses the salary component and working-day algorithms from the Yugam reference, adapted to its organization-scoped database tables. Yugam is not a runtime dependency.

## Calculation rules

- Salary component order controls percentage references. Earnings must balance monthly CTC; PF, ESI, PT and TDS are deductions. A residual allowance absorbs the remaining earnings.
- Proration uses scheduled working days in the full month, excluding the assigned work pattern's weekly offs and holidays. Attendance is limited to the employment window and the elapsed portion of the current month.
- Finalized attendance and approved paid leave earn salary. Half-day attendance and leave retain fractional days. Pending attendance is shown separately.
- LOP is shown for the elapsed unpaid working days and is already reflected in earned salary. It is not subtracted a second time.
- Approved overtime and allowance/reimbursement claims increase gross pay. Bonuses are recorded separately.
- Employee PF, VPF and ESI, template deductions, late fines and other approved deductions reduce net pay. Employer contributions reduce the residual allowance within CTC and are shown separately.
- Automatic PF uses eligible earned wages and the configured ceiling. Manual contributions are fixed monthly overrides. ESI eligibility is retained for the contribution period.
- The first generated slip stores its template component snapshot for that month. Paid payroll cannot be regenerated or overwritten through synchronization.

## Configuration and use

1. Set organization rates in Settings > Company Profile > Payroll statutory rates.
2. Assign the employee's salary, work pattern and holiday templates. Set employee-specific fixed component values and PF/ESI options in Crew > Salary Structure. Contribution changes have an effective month.
3. Generate slips in CrewPay. Review earnings, attendance, deductions and employer contributions; preview or download the PDF.
4. Use the Payroll tab to synchronize generated slips and advance records through Processing, Processed and Paid.
5. Regenerate existing unpaid slips to apply the updated calculation engine. Existing saved slips are not bulk rewritten by this code change.

## Verification

Run `pnpm --filter @workspace/api-server run test:payroll` for component, calendar, statutory, persistence, paid-lock and PDF-rendering regressions. Persistence tests use an in-memory database adapter; they do not modify application data.
