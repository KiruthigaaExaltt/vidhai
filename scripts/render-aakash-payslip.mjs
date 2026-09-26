import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../artifacts/api-server/node_modules/esbuild/lib/main.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'artifacts/vidhai-erp');
const temporary = path.join(frontend, '.aakash-pdf.mjs');
try {
  await build({stdin:{contents:`import React from 'react'; import { renderToBuffer } from '@react-pdf/renderer'; import Slip from './src/pages/crewpay/SalarySlipPdf'; export const tree = (slip) => Slip({slip}); export const render = (slip) => renderToBuffer(React.createElement(Slip,{slip}));`,resolveDir:frontend,loader:'tsx'},outfile:temporary,bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic'});
  const renderer = await import(pathToFileURL(temporary).href);
  const report = JSON.parse(await fs.readFile(path.join(root,'docs/qa/aakash-august-2026.json'),'utf8'));
  const slip = {...report.vidhai};
  for (const key of ['salaryTemplateComponents','statutoryContributions','otherDeductionItems']) if (typeof slip[key] === 'string') slip[key] = JSON.parse(slip[key]);
  const text = node => node == null ? '' : Array.isArray(node) ? node.map(text).join(' ') : typeof node === 'object' ? text(node.props?.children) : String(node);
  const printed = text(renderer.tree(slip));
  for (const value of ['24,600.00','1,633.34','22,966.66','12,300.00','4,920.00','7,380.00','5,400.00']) assert.ok(printed.includes(value),`Printed slip missing ${value}`);
  const vidhai = await fs.readFile(path.join(frontend,'src/pages/crewpay/SalarySlipPdf.tsx'),'utf8');
  const yugam = await fs.readFile(path.join(root,'yugam-source-code/artifacts/yugam/src/features/crewpay/components/CrewPaySalarySlipPdfDocument.tsx'),'utf8');
  const calculations = source => source.slice(source.indexOf('  // Calculate amounts'),source.indexOf('  return (')).replace(/\r/g,'');
  assert.equal(calculations(vidhai),calculations(yugam),'PDF calculation logic must match Yugam');
  await fs.writeFile(path.join(root,'docs/qa/aakash-august-2026.pdf'),await renderer.render(slip));
  const rows = report.daily.map(day=>{
    const dateNumber = Number(day.date.slice(-2));
    const nonworking = day.case === 'Sunday off' || day.case === 'Holiday';
    const credit = nonworking ? null : [3,18,19,20].includes(dateNumber) ? 0 : dateNumber===7 ? 0.5 : 1;
    const log = report.logs.find(log=>log.attendanceDate===day.date);
    const fine = report.yugam.fines.find(fine=>fine.date===day.date)?.amount || 0;
    return `| ${day.date} | ${day.case} | ${log?.checkInTime || '-'} / ${log?.checkOutTime || '-'} | ${credit ?? 'Excluded'} | ${credit===null ? '0.00' : ((1-credit)*1200).toFixed(2)} | ${fine.toFixed(2)} |`;
  });
  const markdown = `# Aakash - August 2026 salary comparison

Created in local MongoDB database ${report.database}, organization 1. Username: aakash. Employee ID: ${report.employee.id}; code: ${report.employee.code}. Salary slip is Generated, not Paid. The test login has a random password; use the existing administrator to inspect the employee.

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
${rows.join('\n')}

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
`;
  await fs.writeFile(path.join(root,'docs/qa/aakash-august-2026.md'),markdown);
  console.log('Printed amounts and Yugam PDF calculation parity verified; PDF saved.');
} finally { await fs.rm(temporary,{force:true}); }
