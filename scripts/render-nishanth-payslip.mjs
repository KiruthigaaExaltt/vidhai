import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../artifacts/api-server/node_modules/esbuild/lib/main.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root,'artifacts/vidhai-erp');
const temporary = path.join(frontend,'.nishanth-pdf.mjs');
const report = JSON.parse(await fs.readFile(path.join(root,'docs/qa/nishanth-august-2026.json'),'utf8'));
try {
 await build({stdin:{contents:`import React from 'react'; import {renderToBuffer} from '@react-pdf/renderer'; import Slip from './src/pages/crewpay/SalarySlipPdf'; export const tree = slip=>Slip({slip}); export const render = slip=>renderToBuffer(React.createElement(Slip,{slip}));`,resolveDir:frontend,loader:'tsx'},outfile:temporary,bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic'});
 const renderer = await import(pathToFileURL(temporary).href);
 const slip = {...report.vidhai};
 for(const key of ['salaryTemplateComponents','statutoryContributions','otherDeductionItems']) if(typeof slip[key]==='string') slip[key]=JSON.parse(slip[key]);
 const text = node=>node==null?'':Array.isArray(node)?node.map(text).join(' '):typeof node==='object'?text(node.props?.children):String(node);
 const printed = text(renderer.tree(slip));
 for(const value of ['nishanth','18,260.86','18,188.40','72.46','1,739.14','9,130.43','3,652.17','5,478.26']) assert.ok(printed.includes(value),`Missing ${value}`);
 await fs.writeFile(path.join(root,'docs/qa/nishanth-august-2026.pdf'),await renderer.render(slip));
 const rows=report.daily.map(day=>{
  const log=report.logs.find(log=>log.attendanceDate===day.date);
  const leave=report.leaves.find(leave=>leave.startDate===day.date);
  const holidays=report.assumptions.googleHolidays.filter(h=>h.date===day.date).map(h=>h.name).join(' / ');
  const excluded=day.case==='Sunday off'||day.case==='Holiday';
  return `| ${day.date} | ${holidays||day.case} | ${log?.checkInTime||'-'} | ${log?.checkOutTime||'-'} | ${excluded?'Excluded':log?.status==='Absent'?0:1} | ${leave?.leaveType||'-'} |`;
 });
 await fs.writeFile(path.join(root,'docs/qa/nishanth-august-2026.md'),`# Nishanth - August 2026

Employee: nishanth (ID ${report.employee.id}, code ${report.employee.code}); username nishanth. Created in local database ${report.database}, organization 1. Slip status: Generated. Inspect through your administrator account; the test user has a random password.

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
${rows.join('\n')}

Vidhai's saved payable days, paid leave days, components, LOP, late fine, gross and net matched Yugam's original functions on identical inputs. PDF amounts were verified. No payroll source changes were needed for this scenario.

[Salary slip](nishanth-august-2026.pdf) | [Raw comparison](nishanth-august-2026.json)
`);
 console.log('Nishanth PDF and daily report generated; printed amounts verified.');
} finally { await fs.rm(temporary,{force:true}); }
