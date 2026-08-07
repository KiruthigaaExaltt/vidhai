import { Router } from "express";
import { z } from "zod/v4";
import { and, asc, db, eq, attendanceTemplatesTable, workPatternTemplatesTable, salaryTemplatesTable, holidayTemplatesTable, leaveTemplatesTable } from "@workspace/db";
import { organizationId, requirePermission } from "../lib/access";

const router = Router();
const name = z.string().trim().min(1).max(120);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const nonnegative = z.coerce.number().min(0);
const weekdayList = z.array(z.coerce.number().int().min(0).max(6)).transform(v => [...new Set(v)].sort());
const common = { templateName: name, isDefault: z.boolean().default(false) };

const attendance = z.object({ ...common, flexibleHours: z.boolean().default(false), lateThresholdMinutes: nonnegative.int(), workStartTime: time, workEndTime: time, fineType: z.enum(["fixed_per_hour", "percent_hourly_basis"]), finePerHour: nonnegative });
const workPattern = z.object({ ...common, week1OffDays: weekdayList, week2OffDays: weekdayList, week3OffDays: weekdayList, week4OffDays: weekdayList, week5OffDays: weekdayList });
const component = z.object({ id: z.string().min(1), name: z.string().min(1), calculationType: z.enum(["fixed", "percentage_of_ctc", "percentage_of_component", "residual"]), value: z.string().nullable().optional(), referenceComponentId: z.string().nullable().optional(), order: z.number().int().positive() }).superRefine((v, ctx) => { const n=Number(v.value); if (v.calculationType !== "residual" && (!Number.isFinite(n) || n < 0)) ctx.addIssue({ code:"custom", message:"A non-negative value is required" }); if (v.calculationType.startsWith("percentage") && n > 100) ctx.addIssue({ code:"custom", message:"Percentage cannot exceed 100" }); if (v.calculationType === "percentage_of_component" && !v.referenceComponentId) ctx.addIssue({ code:"custom", message:"Reference component is required" }); });
const salaryCatalog:Record<string,{name:string;deduction:boolean}>={
  basic:{name:"Basic",deduction:false},hra:{name:"HRA",deduction:false},special_allowance:{name:"Special Allowance",deduction:false},conveyance:{name:"Conveyance",deduction:false},medical:{name:"Medical",deduction:false},bonus:{name:"Bonus",deduction:false},incentive:{name:"Incentive",deduction:false},pf:{name:"Provident Fund (PF)",deduction:true},esi:{name:"Employee State Insurance (ESI)",deduction:true},pt:{name:"Professional Tax (PT)",deduction:true},tds:{name:"Tax Deducted at Source (TDS)",deduction:true}
};
const salary = z.object({ ...common, description: z.string().max(500).nullable().optional(), components: z.array(component).min(1) }).superRefine((v,ctx)=>{
  const ids=v.components.map(c=>c.id);
  if(new Set(ids).size!==ids.length)ctx.addIssue({code:"custom",message:"The same salary component cannot be added more than once",path:["components"]});
  if(v.components.filter(c=>c.calculationType==="residual").length>1)ctx.addIssue({code:"custom",message:"Only one residual component is allowed",path:["components"]});
  v.components.forEach((c,index)=>{
    const catalog=salaryCatalog[c.id];
    if(!catalog)ctx.addIssue({code:"custom",message:`Unknown salary component: ${c.id}`,path:["components",index,"id"]});
    else if(c.name!==catalog.name)ctx.addIssue({code:"custom",message:`Component ${c.id} must use the name ${catalog.name}`,path:["components",index,"name"]});
    if(c.order!==index+1)ctx.addIssue({code:"custom",message:"Component order must match its position",path:["components",index,"order"]});
    if(c.calculationType==="residual"&&catalog?.deduction)ctx.addIssue({code:"custom",message:"Deduction components cannot use residual calculation",path:["components",index,"calculationType"]});
    if(c.calculationType==="percentage_of_component"){
      const referenceIndex=v.components.findIndex(item=>item.id===c.referenceComponentId);
      if(referenceIndex<0)ctx.addIssue({code:"custom",message:"Reference component must exist in this template",path:["components",index,"referenceComponentId"]});
      else if(referenceIndex>=index)ctx.addIssue({code:"custom",message:"Reference component must appear earlier",path:["components",index,"referenceComponentId"]});
    }
  });
});
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const holiday = z.object({ ...common, effectiveYear: z.number().int().min(1970).max(3000), effectiveFrom: isoDate, holidays: z.array(z.object({ name: z.string().trim().min(1).max(120), date: isoDate })) }).superRefine((v,ctx)=>{if(Number(v.effectiveFrom.slice(0,4))!==v.effectiveYear)ctx.addIssue({code:"custom",message:"Effective date must be within the selected year"});});
const leave = z.object({ ...common, totalSickLeaves: nonnegative, totalCasualLeaves: nonnegative, earnedLeave: nonnegative, maxSickLeavesPerMonth: nonnegative, maxCasualLeavesPerMonth: nonnegative, maxEarnedLeavesPerMonth: nonnegative, carryForwardEnabled: z.boolean().default(true) });

const configs: Record<string, { table:any; schema:z.ZodTypeAny; json:string[]; ensureDefault?:boolean }> = {
  "attendance-templates": { table: attendanceTemplatesTable, schema: attendance, json: [] },
  "work-pattern-templates": { table: workPatternTemplatesTable, schema: workPattern, json: ["week1OffDays","week2OffDays","week3OffDays","week4OffDays","week5OffDays"], ensureDefault: true },
  "salary-templates": { table: salaryTemplatesTable, schema: salary, json: ["components"], ensureDefault: true },
  "holiday-templates": { table: holidayTemplatesTable, schema: holiday, json: ["holidays"], ensureDefault: true },
  "leave-templates": { table: leaveTemplatesTable, schema: leave, json: [], ensureDefault: true },
};

const decode = (row:any, fields:string[]) => ({ ...row, ...Object.fromEntries(fields.map(k=>[k, (()=>{try{return JSON.parse(row[k]??"[]")}catch{return []}})()])), ...(row.effectiveYear ? holidayMeta(row) : {}) });
const holidayMeta = (row:any) => { const today=new Date().toISOString().slice(0,10), end=`${row.effectiveYear}-12-31`; const lifecycleStatus=end<today?"expired":row.effectiveFrom<=today?"active":"expiring-soon"; return { templateRef:String(row.id), lifecycleStatus, isAssignable:lifecycleStatus!=="expired" }; };
const encode = (value:any, fields:string[]) => ({ ...value, ...Object.fromEntries(fields.map(k=>[k,JSON.stringify(value[k]??[])])) });

for (const [path, config] of Object.entries(configs)) {
  const list = async (req:any,res:any,admin=false) => { const org=organizationId(req); let rows=await db.select().from(config.table).where(eq(config.table.organizationId,org)).orderBy(asc(config.table.templateName)); if(path==="salary-templates"&&!rows.some((r:any)=>r.isActive!==false)){const components=[{id:"basic",name:"Basic",calculationType:"percentage_of_ctc",value:"50",referenceComponentId:null,order:1},{id:"hra",name:"HRA",calculationType:"percentage_of_ctc",value:"20",referenceComponentId:null,order:2},{id:"special_allowance",name:"Special Allowance",calculationType:"residual",value:null,referenceComponentId:null,order:3}];await db.insert(salaryTemplatesTable).values({organizationId:org,templateName:"Default Salary Structure",description:"Standard 50% Basic, 20% HRA and residual Special Allowance",components:JSON.stringify(components),isDefault:true,isActive:true,updatedAt:new Date()});rows=await db.select().from(config.table).where(eq(config.table.organizationId,org)).orderBy(asc(config.table.templateName));} if(path==="leave-templates"&&!rows.some((r:any)=>r.isActive!==false)){await db.insert(leaveTemplatesTable).values({organizationId:org,templateName:"Default Leave Policy",totalSickLeaves:6,totalCasualLeaves:6,earnedLeave:0,maxSickLeavesPerMonth:6,maxCasualLeavesPerMonth:6,maxEarnedLeavesPerMonth:0,carryForwardEnabled:true,isDefault:true,isActive:true,updatedAt:new Date()});rows=await db.select().from(config.table).where(eq(config.table.organizationId,org)).orderBy(asc(config.table.templateName));} const visible=admin?rows:rows.filter((r:any)=>r.isActive!==false); return res.json(visible.map((r:any)=>decode(r,config.json)).sort((a:any,b:any)=>Number(b.isDefault)-Number(a.isDefault)||a.templateName.localeCompare(b.templateName))); };
  router.get(`/${path}`, requirePermission("settings.templates.view"), (req,res)=>list(req,res));
  router.get(`/${path}/admin`, requirePermission("settings.templates.view"), (req,res)=>list(req,res,true));
  router.post(`/${path}`, requirePermission("settings.templates.create"), async (req,res)=>{ const parsed=config.schema.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:z.prettifyError(parsed.error)}); const org=organizationId(req), value:any=parsed.data; const rows=await db.select().from(config.table).where(eq(config.table.organizationId,org)); if(rows.some((r:any)=>r.isActive!==false&&r.templateName.trim().toLowerCase()===value.templateName.toLowerCase()))return res.status(400).json({error:"An active template with this name already exists"}); if(value.isDefault)await db.update(config.table).set({isDefault:false,updatedAt:new Date()}).where(eq(config.table.organizationId,org)); const [created]=await db.insert(config.table).values({...encode(value,config.json),organizationId:org,isActive:true,updatedAt:new Date()}).returning(); return res.status(201).json(decode(created,config.json)); });
  router.put(`/${path}/:id`, requirePermission("settings.templates.update"), async (req,res)=>{ const parsed=config.schema.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:z.prettifyError(parsed.error)}); const org=organizationId(req), id=Number(req.params.id), value:any=parsed.data; if(!Number.isInteger(id))return res.status(400).json({error:"Invalid template id"}); const [existing]=await db.select().from(config.table).where(and(eq(config.table.id,id),eq(config.table.organizationId,org))); if(!existing)return res.status(404).json({error:"Template not found"}); const rows=await db.select().from(config.table).where(eq(config.table.organizationId,org)); if(rows.some((r:any)=>r.id!==id&&r.isActive!==false&&r.templateName.trim().toLowerCase()===value.templateName.toLowerCase()))return res.status(400).json({error:"An active template with this name already exists"}); if(value.isDefault)await db.update(config.table).set({isDefault:false,updatedAt:new Date()}).where(eq(config.table.organizationId,org)); const [updated]=await db.update(config.table).set({...encode(value,config.json),updatedAt:new Date()}).where(and(eq(config.table.id,id),eq(config.table.organizationId,org))).returning(); return res.json(decode(updated,config.json)); });
  router.delete(`/${path}/:id`, requirePermission("settings.templates.delete"), async (req,res)=>{ const org=organizationId(req),id=Number(req.params.id); const [row]=await db.update(config.table).set({isActive:false,isDefault:false,updatedAt:new Date()}).where(and(eq(config.table.id,id),eq(config.table.organizationId,org))).returning(); if(!row)return res.status(404).json({error:"Template not found"}); if(config.ensureDefault){const active=(await db.select().from(config.table).where(eq(config.table.organizationId,org))).filter((r:any)=>r.isActive!==false);if(active.length&&!active.some((r:any)=>r.isDefault))await db.update(config.table).set({isDefault:true,updatedAt:new Date()}).where(eq(config.table.id,active[0].id));} return res.status(204).send(); });
}

router.post("/holiday-templates/:id/duplicate", requirePermission("settings.templates.create"), async (req,res)=>{const org=organizationId(req),[source]=await db.select().from(holidayTemplatesTable).where(and(eq(holidayTemplatesTable.id,Number(req.params.id)),eq(holidayTemplatesTable.organizationId,org)));if(!source||source.isActive===false)return res.status(404).json({error:"Template not found"});const rows=await db.select().from(holidayTemplatesTable).where(eq(holidayTemplatesTable.organizationId,org));let name=`${source.templateName} Copy`,i=2;while(rows.some((r:any)=>r.isActive!==false&&r.templateName.toLowerCase()===name.toLowerCase()))name=`${source.templateName} Copy ${i++}`;const [created]=await db.insert(holidayTemplatesTable).values({...source,id:undefined,templateName:name,isDefault:false,createdAt:new Date(),updatedAt:new Date()}).returning();return res.status(201).json(decode(created,["holidays"]));});
router.get("/holiday-templates/google-holidays", requirePermission("settings.templates.view"), async (req,res)=>{
  const year=Number(req.query.year);
  if(!Number.isInteger(year)||year<1970||year>3000)return res.status(400).json({error:"Valid year is required"});
  const timeZone=process.env.ORGANIZATION_TIMEZONE||"Asia/Kolkata";
  const calendarId=timeZone.startsWith("Asia/Kolkata")||timeZone.startsWith("Asia/Calcutta")?"en.indian#holiday@group.v.calendar.google.com":"en.usa#holiday@group.v.calendar.google.com";
  const base=(process.env.HOLIDAYS_API_URL||"https://calendar.google.com/calendar/ical").replace(/\/$/,"");
  try{
    const response=await fetch(`${base}/${encodeURIComponent(calendarId)}/public/basic.ics`,{headers:{Accept:"text/calendar"}});
    if(!response.ok)throw new Error(`Google Calendar returned ${response.status}`);
    const unfolded=(await response.text()).replace(/\r?\n[ \t]/g,"");
    const holidays=unfolded.split("BEGIN:VEVENT").slice(1).map(block=>{
      const date=block.match(/(?:^|\r?\n)DTSTART(?:;[^:]*)?:(\d{4})(\d{2})(\d{2})/)?.slice(1,4).join("-");
      const rawName=block.match(/(?:^|\r?\n)SUMMARY(?:;[^:]*)?:(.*?)(?:\r?\n|$)/)?.[1]?.trim();
      const name=rawName?.replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\n/gi," ").replace(/\\\\/g,"\\");
      return date&&name?{name,date}:null;
    }).filter((h):h is {name:string;date:string}=>Boolean(h&&h.date.startsWith(`${year}-`)));
    const unique=[...new Map(holidays.map(h=>[h.date,h])).values()].sort((a,b)=>a.date.localeCompare(b.date));
    return res.json({holidays:unique,source:"google",timeZone,calendarId});
  }catch(error:any){return res.status(502).json({error:`Unable to fetch Google holidays: ${error.message}`});}
});

export default router;
