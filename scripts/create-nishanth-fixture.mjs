// Build a separate fixture from the existing comparison harness, preserving Aakash.
import fs from 'node:fs/promises';
const input = await fs.readFile(new URL('./src/aakash-payroll-comparison.ts',import.meta.url),'utf8');
let source = input.replaceAll('aakash','nishanth').replaceAll('AAKASH','NISHANTH').replaceAll('30000','20000').replaceAll('360000','240000');
source = source.replace("try {", `try {
 const ics = (await fs.readFile(path.join(root,'docs/qa/google-india-holidays.ics'),'utf8')).replace(/\\r?\\n[ \\t]/g,'');
 const googleHolidays = ics.split('BEGIN:VEVENT').slice(1).flatMap(block=>{
   const stamp = block.match(/(?:^|\\r?\\n)DTSTART(?:;[^:]*)?:(\\d{4})(\\d{2})(\\d{2})/);
   const name = block.match(/(?:^|\\r?\\n)SUMMARY(?:;[^:]*)?:(.*?)(?:\\r?\\n|$)/)?.[1]?.trim();
   const date = stamp?.slice(1,4).join('-');
   return date?.startsWith('2026-') && name ? [{date,name}] : [];
 });
 const holidayDates = new Set(googleHolidays.map(h=>h.date));
 assert.deepEqual([...holidayDates].filter(d=>d.startsWith(month)).sort(), ['2026-08-15','2026-08-26','2026-08-28']);
 const scheduledDays = 31 - new Set([...holidayDates].filter(d=>d.startsWith(month)).concat(['02','09','16','23','30'].map(d=>month+'-'+d))).size;
`);
source = source.replace("JSON.stringify([{date:'2026-08-15',name:'QA holiday'}])",'JSON.stringify(googleHolidays)');
const start = source.indexOf(' const special: Record<number,any> = {');
const end = source.indexOf(' const daily:any[]=[];',start);
source = source.slice(0,start)+` const special: Record<number,any> = {
  3:{status:'Absent',checkInTime:null,checkOutTime:null,label:'Absent'},
  4:{status:'Absent',checkInTime:null,checkOutTime:null,label:'Absent'},
  5:{skip:true,label:'Paid casual leave'},6:{skip:true,label:'Paid sick leave'},
  7:{status:'Late',checkInTime:'10:30',label:'One hour late; 45 minutes fined after grace'},
 };
`+source.slice(end);
source = source.replaceAll("day===15",'holidayDates.has(date)');
source = source.replace(/\[\[4,'Casual'.*?\]\] as const/, "[[5,'Casual',1,2,'Approved'],[6,'Sick',1,2,'Approved']] as const");
source = source.replace("requestedDays:from===to?'0.5':'1'", "requestedDays:'1'");
source = source.replaceAll("type==='Permission'?'09:30':null",'null').replaceAll("type==='Permission'?'10:30':null",'null').replaceAll("type==='Permission'?'1':'0'","'0'");
source = source.replace("holidayDates:new Set([month+'-15'])",'holidayDates');
source = source.replaceAll('payable/25','payable/scheduledDays').replaceAll('20000/(25*9)','20000/(scheduledDays*9)').replaceAll('(20000,25,25,payable)','(20000,scheduledDays,scheduledDays,payable)').replaceAll('scheduledDays:25','scheduledDays,googleHolidays:googleHolidays.filter(h=>h.date.startsWith(month))');
source = source.replace(' const report={', ` assert.equal(Number(slip.payableDays),21);
 assert.equal(Number(slip.absentDays),2);
 assert.equal(Number(slip.leaveDays),2);
 assert.equal(logs.filter(r=>r.status==='Late').length,1);
 const report={`);
await fs.writeFile(new URL('./src/nishanth-payroll-comparison.ts',import.meta.url),source);
