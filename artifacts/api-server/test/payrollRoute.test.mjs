import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../node_modules/esbuild/lib/main.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const tables = ['employeesTable','attendanceLogsTable','leaveRequestsTable','crewClaimsTable','crewDeductionsTable','salaryTemplatesTable','workPatternTemplatesTable','holidayTemplatesTable','salarySlipsTable','payrollTable','organizationDetailsTable'];
let records = {};
const schema = Object.fromEntries(tables.map(name => [name, new Proxy({name}, {get:(target,key)=>key==='name'?target.name:String(key)})]));
const db = {
 select: () => ({from: table => ({where: async predicate => (records[table.name] || []).filter(predicate)})}),
 update: table => ({set: values => ({where: predicate => { const rows=(records[table.name] || []).filter(predicate); rows.forEach(row=>Object.assign(row,values)); return {returning:async()=>rows}; }})}),
 insert: table => ({values: values => ({returning: async () => {const row={id:100,...values}; (records[table.name] ||= []).push(row); return [row];}})}),
};
globalThis.__salaryTest = {db,...schema,eq:(field,value)=>row=>row[field]===value,and:(...predicates)=>row=>predicates.every(fn=>fn(row))};
const source = await fs.readFile(path.resolve(here,'../src/routes/crewpay.ts'),'utf8');
const body=source.slice(source.indexOf('async function buildSlip('),source.indexOf('const decode ='));
const helpers=source.slice(source.indexOf('  round ='),source.indexOf('router.use(')).replace(/^  round =/,'const round =');
const result = await build({stdin:{contents:`import { calculateStatutorySalary } from '@workspace/db/payroll/salary'; import { buildNonWorkingPaidDateSet, calculatePayableWorkingDays, calculateLeaveWorkingDays, calculateAbsentWorkingDays, calculatePendingApprovalWorkingDays, countScheduledWorkingDaysInRange, calculateLopAmountFromPayableDays, isFinalizedAttendanceLog } from '@workspace/db/payroll/calendar'; const {db,eq,and,${tables.join(',')}}=globalThis.__salaryTest; const syncAttendanceDeductions=async()=>{}; ${helpers}\nexport ${body}`,loader:'ts',resolveDir:path.resolve(here,'..')},bundle:true,write:false,format:'esm',platform:'node'});
const {buildSlip} = await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const employee={id:1,name:'Employee',organizationId:1,baseSalary:'30000',joinDate:'2020-01-01',salaryTemplateId:1,workPatternTemplate:1,holidayTemplate:1};
const request={pay:{org:1,user:{id:1}}};
function fixture() {
 records=Object.fromEntries(tables.map(name=>[name,[]]));
 records.employeesTable=[{...employee}];
 records.salaryTemplatesTable=[{id:1,organizationId:1,templateName:'Standard',components:JSON.stringify([{id:'basic',name:'Basic',calculationType:'percentage_of_ctc',value:50,order:1},{id:'special',name:'Special',calculationType:'residual',order:2}])}];
 records.workPatternTemplatesTable=[{id:1,organizationId:1,...Object.fromEntries([1,2,3,4,5].map(n=>['week'+n+'OffDays','[0]']))}];
 records.holidayTemplatesTable=[{id:1,organizationId:1,effectiveYear:2026,holidays:'[{"date":"2026-08-15"}]'}];
 records.attendanceLogsTable=Array.from({length:31},(_,i)=>({organizationId:1,employeeId:1,attendanceDate:'2026-08-'+String(i+1).padStart(2,'0'),status:i===2?'Absent':'Present',approvalStatus:'Approved',locked:true,checkInTime:'09:00',checkOutTime:'17:00'}));
 records.crewClaimsTable=[{organizationId:1,employeeId:1,claimType:'bonus',amount:'9999',status:'Approved',attendanceDate:'2026-08-01'},{organizationId:1,employeeId:1,claimType:'overtime',amount:'500',status:'Approved',attendanceDate:'2026-08-01'}];
 records.crewDeductionsTable=[{organizationId:1,employeeId:1,month:7,year:2026,status:'Approved',source:'Auto',autoReason:'Absent and LOP',amount:'1200'},{organizationId:1,employeeId:1,month:7,year:2026,status:'Approved',source:'attendance_auto_deduction',autoReason:'Late arrival',amount:'100'},{organizationId:1,employeeId:1,month:7,year:2026,status:'Approved',source:'manual',notes:'Loan',amount:'300'}];
}
test('persisted salary slip balances earnings, LOP, fines and claims without bonus or double LOP',async()=>{
 fixture(); const slip=await buildSlip(request,employee,'2026-08');
 assert.equal(slip.payableDays,'24');
 assert.equal(slip.grossPay,'29300');
 assert.equal(slip.lopAmount,'1200');
 assert.equal(slip.totalDeductions,'400');
 assert.equal(slip.netPay,'28900');
 assert.equal(slip.bonusAmount,'0');
 assert.equal(slip.lateFines,'100');
 assert.equal(slip.otherDeductionsAmount,'300');
 assert.equal(records.salarySlipsTable.length,1);
 // Template edits cannot rewrite the saved month's component structure.
 records.salaryTemplatesTable[0].components='[{"id":"bad","name":"Bad","calculationType":"fixed","value":999999,"order":1}]';
 const regenerated=await buildSlip(request,employee,'2026-08');
 assert.equal(regenerated.netPay,'28900');
 assert.equal(records.salarySlipsTable.length,1);
});
test('paid salary slips are locked before any recalculation or deduction synchronization',async()=>{
 fixture(); records.payrollTable=[{organizationId:1,employeeId:1,payPeriod:'2026-08',status:'Paid'}];
 await assert.rejects(buildSlip(request,employee,'2026-08'),/Paid payroll is locked/);
 assert.equal(records.salarySlipsTable.length,0);
});
test('partial-month join date uses full scheduled-month divisor and does not count pre-join salary as LOP',async()=>{
 fixture(); const newEmployee={...employee,joinDate:'2026-08-17'};
 const slip=await buildSlip(request,newEmployee,'2026-08');
 assert.equal(slip.payableDays,'13');
 assert.equal(slip.lopAmount,'0');
 assert.equal(slip.earnedBaseSalary,'15600');
});
