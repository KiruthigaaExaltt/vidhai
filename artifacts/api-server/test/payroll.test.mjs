import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../node_modules/esbuild/lib/main.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
async function moduleAt(file) {
 const result = await build({ entryPoints: [path.resolve(here, file)], bundle: true, write: false, format: 'esm', platform: 'node' });
 return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const salary = await moduleAt('../../../lib/db/src/payroll/salary.ts');
const calendar = await moduleAt('../../../lib/db/src/payroll/calendar.ts');
const components = [
 { id:'basic', name:'Basic', calculationType:'percentage_of_ctc', value:50, order:1 },
 { id:'hra', name:'HRA', calculationType:'percentage_of_component', referenceComponentId:'basic', value:40, order:2 },
 { id:'special', name:'Special Allowance', calculationType:'residual', order:3 },
];
const template = (extra={}) => salary.calculateSalaryTemplateComponents({templateComponents:components,monthlyCtc:30000,earnedRatio:1,...extra});
test('ordered component references, residual and attendance proration',()=> {
 const rows=template({templateComponents:[components[2],components[1],components[0]],earnedRatio:0.5});
 assert.deepEqual(rows.map(r=>r.monthlyAmount),[15000,6000,9000]);
 assert.deepEqual(rows.map(r=>r.earnedAmount),[7500,3000,4500]);
});
test('invalid structures fail rather than silently inventing balance or reference values',()=>{
 assert.throws(()=>template({templateComponents:components.slice(0,2)}),/total/);
 assert.throws(()=>template({templateComponents:[components[0],components[0]]}),/Duplicate/);
 assert.throws(()=>template({templateComponents:[{...components[1],order:0},components[0],components[2]]}),/earlier/);
 assert.throws(()=>template({templateComponents:[components[0],components[2],{...components[2],id:'second'}]}),/Only one residual/);
});
test('full month uses working-day divisor; holidays and Sundays are not payable working days',()=>{
 const nonWorkingPaidDates=calendar.buildNonWorkingPaidDateSet({monthStartIso:'2026-09-01',monthEndIso:'2026-09-30',workPattern:{week1OffDays:[0],week2OffDays:[0],week3OffDays:[0],week4OffDays:[0],week5OffDays:[0]},holidayDates:new Set(['2026-09-07'])});
 assert.equal(30-nonWorkingPaidDates.size,25);
 const attendanceLogs=Array.from({length:30},(_,i)=>({attendanceDate:'2026-09-'+String(i+1).padStart(2,'0'),status:'Present'}));
 const input={employmentStartIso:'2026-09-01',employmentEndIso:'2026-09-30',nonWorkingPaidDates,approvedLeaves:[],attendanceLogs};
 assert.equal(calendar.calculatePayableWorkingDays(input),25);
 assert.equal(calendar.calculateLopAmountFromPayableDays(30000,25,25,24),1200);
 assert.equal(calendar.calculateLopAmountFromPayableDays(30000,25,10,10),0);
});
test('half-day attendance and leave combine; pending attendance stays separate from absence',()=>{
 const input={employmentStartIso:'2026-09-01',employmentEndIso:'2026-09-03',nonWorkingPaidDates:new Set(),approvedLeaves:[{startDate:'2026-09-01',endDate:'2026-09-01',fromSession:'1',toSession:'1'}],attendanceLogs:[{attendanceDate:'2026-09-01',status:'Half Day'}],pendingAttendanceDates:new Set(['2026-09-02'])};
 assert.equal(calendar.calculatePayableWorkingDays(input),1);
 assert.equal(calendar.calculateAbsentWorkingDays(input),1);
 assert.equal(calendar.calculatePendingApprovalWorkingDays(input),1);
 assert.equal(calendar.isFinalizedAttendanceLog({status:'Present',checkInTime:'09:00',checkOutTime:'18:00',locked:false}),false);
});
const statutory=(config={},extra={})=>salary.calculateStatutorySalary({templateComponents:components,baseSalary:30000,fixedComponentValues:{},earnedRatio:1,payableDays:25,year:2026,month:9,employee:{name:'Test'},statutoryConfig:config,...extra});
test('PF wage ceiling prorates and employer PF reduces residual, not employee deductions twice',()=>{
 const result=statutory({pfEnabled:true},{earnedRatio:0.5});
 assert.equal(result.statutoryContributions.employeePf,900);
 assert.equal(result.statutoryContributions.employerPf,900);
 assert.equal(result.components[2].earnedAmount,3600);
 assert.equal(result.components.reduce((s,c)=>s+c.earnedAmount,0),14100);
});
test('manual overrides do not prorate and legacy PF/ESI rows do not double count',()=>{
 const result=statutory({pfEnabled:true,pfMode:'manual',manualEmployeePf:1000,manualEmployerPf:1000},{earnedRatio:0.5,templateComponents:[...components,{id:'pf',name:'PF',calculationType:'fixed',value:1800,order:4}]});
 assert.equal(result.statutoryContributions.employeePf,1000);
 assert.equal(result.components.some(c=>c.componentId==='pf'),false);
 assert.equal(result.components[2].earnedAmount,3500);
});
test('ESI contribution-period lock persists above eligibility ceiling',()=>{
 assert.equal(statutory({esiEnabled:true}).statutoryContributions.esiEligibleForPeriod,false);
 const result=statutory({esiEnabled:true},{employee:{name:'Test',esiEligibilityPeriods:{'2026-04 to 2026-09':true}}});
 assert.equal(result.statutoryContributions.esiEligibleForPeriod,true);
 assert.equal(result.statutoryContributions.esiWageBasis,29055.69);
 assert.equal(result.statutoryContributions.employerEsi,944.31);
 assert.equal(result.statutoryContributions.employeeEsi,217.92);
});
test('insufficient residual cannot hide employer contributions',()=>{
 assert.throws(()=>statutory({pfEnabled:true},{templateComponents:[{...components[0],value:100}]}),/cannot be absorbed/);
});
