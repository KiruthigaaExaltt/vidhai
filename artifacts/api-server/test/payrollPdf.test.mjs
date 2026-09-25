import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../node_modules/esbuild/lib/main.js';
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../vidhai-erp');
test('salary PDF renders with earnings, statutory deductions, employer costs and long deduction names', async () => {
 const temporary = path.join(frontend, '.salary-pdf-test.mjs');
 try {
  await build({ stdin: { contents: `import React from 'react'; import { renderToBuffer } from '@react-pdf/renderer'; import SalarySlip from './src/pages/crewpay/SalarySlipPdf'; export async function render(slip) { return renderToBuffer(React.createElement(SalarySlip, { slip, organization: {companyName:'VIDHAI SYSTEMS', address:'Coimbatore, Tamil Nadu'} })); }`, resolveDir: frontend, loader:'tsx' }, outfile: temporary, bundle:true, packages:'external', platform:'node', format:'esm', jsx:'automatic' });
  const { render } = await import(pathToFileURL(temporary).href);
  const pdf = await render({employeeId:1,employeeName:'Salary Regression Employee',employeeCode:'VID001',department:'Operations',designation:'Manager',salaryTemplateName:'Standard CTC',payrollMonth:'2026-08',joinDate:'2020-01-01',monthDays:31,employmentDays:31,presentDays:24,absentDays:1,halfDays:0,lateDays:0,weekOffDays:5,holidayDays:1,leaveDays:0,payableDays:24,baseSalary:30000,earnedBaseSalary:27000,grossPay:27500,deductionsAmount:2300,netPay:25200,lopAmount:1200,lateFines:100,otherDeductionsAmount:400,otherDeductionItems:[{deductionId:1,name:'Approved employee equipment purchase installment',amount:400,isRecurring:true,installmentNumber:2,numberOfInstallments:6}],salaryTemplateComponents:[{componentId:'basic',name:'Basic',monthlyAmount:15000,earnedAmount:14400},{componentId:'special',name:'Special allowance',monthlyAmount:14000,earnedAmount:12600}],overtimeAmount:500,claimsAmount:0,statutoryContributions:{employeePf:1800,employerPf:1800,employeeContributionTotal:1800,employerContributionTotal:1800,totalEmployerCost:29300}});
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.ok(pdf.length > 3000);
 } finally { await fs.rm(temporary,{force:true}); }
});
