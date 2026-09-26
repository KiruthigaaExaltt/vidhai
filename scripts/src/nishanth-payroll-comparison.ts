import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import * as database from '../../lib/db/src/index';
import * as calendar from '../../lib/db/src/payroll/calendar';
import { calculateStatutorySalary } from '../../lib/db/src/payroll/salary';
import { syncAttendanceDeductions } from '../../artifacts/api-server/src/routes/crew';
import { hashPassword } from '../../artifacts/api-server/src/lib/password';
// Execute source functions without importing Yugam's application or modifying its files/database.
const root = path.resolve(import.meta.dirname, '../..');
// Optional reference checkout is needed only when this comparison is executed.
const yugamCalendar = await import(pathToFileURL(path.join(root, 'yugam-source-code/artifacts/api-server/src/features/hr/utils/payrollCalendar.ts')).href);
const { build } = await import(pathToFileURL(path.join(root, 'artifacts/api-server/node_modules/esbuild/lib/main.js')).href);
const { db, eq } = database;
const marker = 'NISHANTH_PARITY_AUG2026';
const org = 1;
const month = '2026-08';
const loadCode = async (contents: string) => {
  const result = await build({stdin:{contents,loader:'ts',resolveDir:root},bundle:false,write:false,format:'esm',platform:'node'});
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
};
const ensure = async (table: any, key: string, value: string, data: any) => {
  const rows = await db.select().from(table).where(eq(table.organizationId, org));
  const found = rows.find((r: any) => r[key] === value);
  return found || (await db.insert(table).values({organizationId:org,[key]:value,...data}).returning())[0];
};
try {
 const ics = (await fs.readFile(path.join(root,'docs/qa/google-india-holidays.ics'),'utf8')).replace(/\r?\n[ \t]/g,'');
 const googleHolidays = ics.split('BEGIN:VEVENT').slice(1).flatMap(block=>{
   const stamp = block.match(/(?:^|\r?\n)DTSTART(?:;[^:]*)?:(\d{4})(\d{2})(\d{2})/);
   const name = block.match(/(?:^|\r?\n)SUMMARY(?:;[^:]*)?:(.*?)(?:\r?\n|$)/)?.[1]?.trim();
   const date = stamp?.slice(1,4).join('-');
   return date?.startsWith('2026-') && name ? [{date,name}] : [];
 });
 const holidayDates = new Set(googleHolidays.map(h=>h.date));
 assert.deepEqual([...holidayDates].filter(d=>d.startsWith(month)).sort(), ['2026-08-15','2026-08-26','2026-08-28']);
 const scheduledDays = 31 - new Set([...holidayDates].filter(d=>d.startsWith(month)).concat(['02','09','16','23','30'].map(d=>month+'-'+d))).size;

 const template = {workStartTime:'09:30',workEndTime:'18:30',workHours:'9',totalWorkingHours:'9',breakHours:'0',flexibleHours:false,bufferTime:true,bufferMinutes:15,fineType:'based_on_salary',finePerHour:'0',isActive:true};
 const attendanceTemplate = await ensure(database.attendanceTemplatesTable,'templateName',marker,template);
 const patternData = Object.fromEntries([1,2,3,4,5].map(w=>['week'+w+'OffDays','[0]']));
 const pattern = await ensure(database.workPatternTemplatesTable,'templateName',marker,{...patternData,isActive:true});
 const holiday = await ensure(database.holidayTemplatesTable,'templateName',marker,{effectiveYear:2026,effectiveFrom:'2026-01-01',holidays:JSON.stringify(googleHolidays),isActive:true});
 const components = [{id:'basic',name:'Basic',calculationType:'percentage_of_ctc',value:50,order:1},{id:'hra',name:'HRA',calculationType:'percentage_of_component',referenceComponentId:'basic',value:40,order:2},{id:'special',name:'Special allowance',calculationType:'residual',order:3}];
 const salary = await ensure(database.salaryTemplatesTable,'templateName',marker,{components:JSON.stringify(components),isActive:true});
 const leaveTemplate = await ensure(database.leaveTemplatesTable,'templateName',marker,{totalSickLeaves:12,totalCasualLeaves:12,maxSickLeavesPerMonth:3,maxCasualLeavesPerMonth:3,totalPermissionHours:24,maxPermissionHoursPerMonth:4,isActive:true});
 const existingUsers = await db.select().from(database.usersTable).where(eq(database.usersTable.username,'nishanth'));
 if(existingUsers.some(u=>u.systemKey !== marker)) throw new Error('Existing nishanth belongs to another record; refusing to replace it.');
 const user = await ensure(database.usersTable,'username','nishanth',{systemKey:marker,displayName:'nishanth',name:'nishanth',role:'operator',passwordHash:await hashPassword(randomBytes(32).toString('hex')),isActive:true});
 const employee = await ensure(database.employeesTable,'systemKey',marker,{name:'nishanth',employeeCode:'QA-NISHANTH-AUG26',userId:user.id,workMode:'On-site',location:'QA Test',department:'Quality Assurance',designation:'Payroll QA',role:'QA Crew',employmentType:'Full Time',status:'Active',joinDate:'2026-01-01',baseSalary:'20000',annualCtc:'240000',attendanceRulesTemplate:attendanceTemplate.id,workPatternTemplate:pattern.id,holidayTemplate:holiday.id,leaveTemplate:leaveTemplate.id,salaryTemplateId:salary.id,fixedComponentValues:'{}',statutoryContributions:JSON.stringify({pfEnabled:false,esiEnabled:false}),isDeleted:false});
 await db.update(database.usersTable).set({employeeId:employee.id,employeeName:'nishanth'}).where(eq(database.usersTable.id,user.id));
 const special: Record<number,any> = {
  3:{status:'Absent',checkInTime:null,checkOutTime:null,label:'Absent'},
  4:{status:'Absent',checkInTime:null,checkOutTime:null,label:'Absent'},
  5:{skip:true,label:'Paid casual leave'},6:{skip:true,label:'Paid sick leave'},
  7:{status:'Late',checkInTime:'10:30',label:'One hour late; 45 minutes fined after grace'},
 };
 const daily:any[]=[];
 for(let day=1;day<=31;day++) {
  const date=month+'-'+String(day).padStart(2,'0');
  const off=new Date(date+'T00:00:00Z').getUTCDay()===0;
  const change=special[day]||{};
  daily.push({date,case:off?'Sunday off':holidayDates.has(date)?'Holiday':change.label||'Normal attendance'});
  if(off||holidayDates.has(date)||change.skip) continue;
  const values={employeeId:employee.id,employeeName:employee.name,employeeCode:employee.employeeCode,attendanceDate:date,status:'Present',approvalStatus:'Approved',locked:true,checkInTime:'09:30',checkOutTime:'18:30',timezone:'Asia/Kolkata',notes:marker,...change};
  delete values.label;
  await ensure(database.attendanceLogsTable,'notes',marker+':'+date,{...values,notes:marker+':'+date});
 }
 for(const [day,type,from,to,status] of [[5,'Casual',1,2,'Approved'],[6,'Sick',1,2,'Approved']] as const) {
  const date=month+'-'+String(day).padStart(2,'0');
  await ensure(database.leaveRequestsTable,'reason',marker+':'+date,{employeeId:employee.id,employeeName:'nishanth',startDate:date,endDate:date,leaveType:type,fromSession:from,toSession:to,status,requestedDays:'1',permissionStartTime:null,permissionEndTime:null,permissionHours:'0'});
 }
 const source=await fs.readFile(path.join(root,'artifacts/api-server/src/routes/crewpay.ts'),'utf8');
 const helpers=source.slice(source.indexOf('  round ='),source.indexOf('router.use(')).replace(/^  round =/,'const round =');
 const body=source.slice(source.indexOf('async function buildSlip('),source.indexOf('const decode ='));
 (globalThis as any).__nishanth={...database,...calendar,calculateStatutorySalary,syncAttendanceDeductions};
 const names=[...Object.keys(database).filter(key=>key!=="json"),...Object.keys(calendar),'calculateStatutorySalary','syncAttendanceDeductions'];
 const compiled=await loadCode(`const {${[...new Set(names)].join(',')}}=globalThis.__nishanth; ${helpers}\nexport ${body}`);
 const slip=await compiled.buildSlip({pay:{org,user:{id:user.id}}},employee,month);
 const logs=(await db.select().from(database.attendanceLogsTable).where(eq(database.attendanceLogsTable.employeeId,employee.id))).filter(r=>r.attendanceDate.startsWith(month));
 const leaves=(await db.select().from(database.leaveRequestsTable).where(eq(database.leaveRequestsTable.employeeId,employee.id))).filter(r=>r.status==='Approved');
 const deductions=(await db.select().from(database.crewDeductionsTable).where(eq(database.crewDeductionsTable.employeeId,employee.id))).filter(r=>r.month===7&&r.year===2026);
 const nonWorking=yugamCalendar.buildNonWorkingPaidDateSet({monthStartIso:month+'-01',monthEndIso:month+'-31',workPattern:Object.fromEntries([1,2,3,4,5].map(w=>['week'+w+'OffDays',[0]])),holidayDates});
 const referenceInput={employmentStartIso:month+'-01',employmentEndIso:month+'-31',nonWorkingPaidDates:nonWorking,approvedLeaves:leaves.map(r=>({...r,fromSession:String(r.fromSession),toSession:String(r.toSession)})),attendanceLogs:logs.filter(r=>r.approvalStatus==='Approved'&&yugamCalendar.isFinalizedAttendanceLog(r))};
 const yugamSource=await fs.readFile(path.join(root,'yugam-source-code/artifacts/api-server/src/features/hr/routes/crewPay.ts'),'utf8');
 const salaryCode=yugamSource.slice(yugamSource.indexOf('function money('),yugamSource.indexOf('function normalizePayrollStatus('));
 const referenceSalary=await loadCode(salaryCode+'\nexport { calculateSalaryTemplateComponents };');
 const paySource=await fs.readFile(path.join(root,'yugam-source-code/artifacts/api-server/src/features/hr/services/payCalculationService.ts'),'utf8');
 const bufferSource=await fs.readFile(path.join(root,'yugam-source-code/lib/db/src/schema/attendanceTemplates.ts'),'utf8');
 const referenceMetricsCode=paySource.slice(paySource.indexOf('export function calculateAttendanceDeductionAmount('),paySource.indexOf('export function buildDeductionNotes('));
 const parseCode=paySource.slice(paySource.indexOf('export function parseTimeToMinutes('),paySource.indexOf('export async function resolveScheduledWorkingDaysForEmployeeMonth('));
 const bufferMatch=bufferSource.match(/export function resolveBufferMinutes[\s\S]*?\n}/);
 if(!bufferMatch) throw new Error('Cannot locate Yugam buffer function');
 const referenceMetrics=await loadCode(`const ATTENDANCE_BUFFER_MINUTES=15; ${bufferMatch[0]} const roundMoney=n=>Number(n.toFixed(2)); const AUTO_REASON_HALF_DAY='half_day',AUTO_REASON_FLEXIBLE_SHORTAGE='flexible_hours_shortage',AUTO_REASON_BOTH='both',AUTO_REASON_LATE_PUNCH_IN='late_punch_in',AUTO_REASON_EARLY_PUNCH_OUT='early_punch_out'; ${parseCode}\n${referenceMetricsCode}`);
 const payable=yugamCalendar.calculatePayableWorkingDays(referenceInput);
 const referenceComponents=referenceSalary.calculateSalaryTemplateComponents({templateComponents:components,monthlyCtc:20000,fixedComponentValues:{},earnedRatio:payable/scheduledDays});
 const referenceFines=referenceInput.attendanceLogs.flatMap(log=>{
  if(!log.checkInTime||!log.checkOutTime) return [];
  const metrics=referenceMetrics.computeAttendanceDeductionMetrics({...template,checkInTime:log.checkInTime,checkOutTime:log.checkOutTime});
  if(!metrics) return [];
  return [{date:log.attendanceDate,...metrics,amount:referenceMetrics.calculateAttendanceDeductionAmount({hourlySalary:20000/(scheduledDays*9),fineType:'based_on_salary',finePerHour:0,deductionHours:metrics.deductionHours})}];
 });
 const gross=referenceComponents.reduce((n:any,c:any)=>n+c.earnedAmount,0);
 const fines=Number(referenceFines.reduce((n:any,c:any)=>n+c.amount,0).toFixed(2));
 const reference={payableDays:payable,paidLeaveDays:yugamCalendar.calculateLeaveWorkingDays(referenceInput),lopAmount:yugamCalendar.calculateLopAmountFromPayableDays(20000,scheduledDays,scheduledDays,payable),components:referenceComponents,fines:referenceFines,lateFines:fines,grossPay:gross,netPay:Number((gross-fines).toFixed(2))};
 for (const key of ['payableDays','lopAmount','lateFines','grossPay','netPay'] as const) assert.equal(Number(slip[key]), reference[key], key);
 assert.equal(Number(slip.leaveDays), reference.paidLeaveDays, 'paid leave days');
 const savedComponents = JSON.parse(slip.salaryTemplateComponents);
 for (const component of referenceComponents) assert.equal(savedComponents.find((c:any)=>c.componentId===component.componentId)?.earnedAmount, component.earnedAmount, component.name);
 assert.equal(Number(slip.payableDays),21);
 assert.equal(Number(slip.absentDays),2);
 assert.equal(Number(slip.leaveDays),2);
 assert.equal(logs.filter(r=>r.status==='Late').length,1);
 const report={database:mongoose.connection.name,employee:{id:employee.id,name:employee.name,code:employee.employeeCode,userId:user.id},assumptions:{month,monthlySalary:20000,scheduledDays,googleHolidays:googleHolidays.filter(h=>h.date.startsWith(month)),shift:template,statutory:'PF/ESI disabled; no claims or manual deductions'},daily,logs,leaves,deductions,vidhai:slip,yugam:reference,scope:'Vidhai persisted salary slip; Yugam original calendar, salary component and punch deduction functions executed on identical input. Yugam app/database not started or modified; no PF/ESI in this scenario.'};
 await fs.mkdir(path.join(root,'docs/qa'),{recursive:true});
 await fs.writeFile(path.join(root,'docs/qa/nishanth-august-2026.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({employee:report.employee,vidhai:{payableDays:slip.payableDays,grossPay:slip.grossPay,lopAmount:slip.lopAmount,lateFines:slip.lateFines,netPay:slip.netPay},yugam:reference},null,2));
} finally { await mongoose.disconnect(); }
