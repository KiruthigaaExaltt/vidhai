import { Router } from "express";
import { z } from "zod/v4";
import { and, asc, db, eq, attendanceTemplatesTable, workPatternTemplatesTable, salaryTemplatesTable, holidayTemplatesTable, leaveTemplatesTable } from "@workspace/db";
import { organizationId, requirePermission } from "../lib/access";

const router = Router();
const name = z.string().trim().min(1).max(120);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const nonnegative = z.coerce.number().min(0);
const weekdayList = z.array(z.coerce.number().int().min(0).max(6)).transform(v => [...new Set(v)].sort());
const common = { templateName: name };

const attendance = z.object({ ...common, flexibleHours: z.boolean().default(false), bufferTime: z.boolean().default(true), bufferMinutes: nonnegative.int().default(15), totalWorkingHours: nonnegative.default(8), breakHours: nonnegative.default(0), workHours: nonnegative.default(8), workStartTime: time, workEndTime: time, fineType: z.enum(["fixed_per_hour", "percent_hourly_basis", "based_on_salary"]), finePerHour: nonnegative }).superRefine((v,ctx)=>{const [sh,sm]=v.workStartTime.split(":").map(Number),[eh,em]=v.workEndTime.split(":").map(Number);let duration=(eh*60+em)-(sh*60+sm);if(duration<=0)duration+=1440;const total=v.flexibleHours?v.totalWorkingHours:duration/60;if(v.flexibleHours&&total<=0)ctx.addIssue({code:"custom",message:"Total working hours must be greater than zero"});if(v.bufferTime&&v.bufferMinutes<=0)ctx.addIssue({code:"custom",message:"Buffer minutes must be greater than zero"});if(v.breakHours>total)ctx.addIssue({code:"custom",message:"Break hours cannot exceed total working hours"});}).transform(v=>{const [sh,sm]=v.workStartTime.split(":").map(Number),[eh,em]=v.workEndTime.split(":").map(Number);let minutes=(eh*60+em)-(sh*60+sm);if(minutes<=0)minutes+=1440;const total=v.flexibleHours?v.totalWorkingHours:Math.round((minutes/60)*100)/100;return {...v,totalWorkingHours:total,workHours:Math.max(0,Math.round((total-v.breakHours)*100)/100)};});
const workPattern = z.object({ ...common, week1OffDays: weekdayList, week2OffDays: weekdayList, week3OffDays: weekdayList, week4OffDays: weekdayList, week5OffDays: weekdayList });
const component = z.object({ id: z.string().min(1), name: z.string().min(1), calculationType: z.enum(["fixed", "percentage_of_ctc", "percentage_of_component", "residual"]), value: z.string().nullable().optional(), referenceComponentId: z.string().nullable().optional(), order: z.number().int().positive(), includeInPfWage: z.boolean().default(false), includeInEsiWage: z.boolean().default(true) }).superRefine((v, ctx) => { const n=Number(v.value); if (v.calculationType !== "residual" && (!Number.isFinite(n) || n < 0)) ctx.addIssue({ code:"custom", message:"A non-negative value is required" }); if (v.calculationType.startsWith("percentage") && n > 100) ctx.addIssue({ code:"custom", message:"Percentage cannot exceed 100" }); if (v.calculationType === "percentage_of_component" && !v.referenceComponentId) ctx.addIssue({ code:"custom", message:"Reference component is required" }); });
const salaryDeductionIds = new Set(["pf", "esi", "pt", "tds"]);
const salary = z.object({ ...common, description: z.string().max(500).nullable().optional(), components: z.array(component).min(1) }).superRefine((v,ctx)=>{
  const ids=v.components.map(c=>c.id);
  if(new Set(ids).size!==ids.length)ctx.addIssue({code:"custom",message:"The same salary component cannot be added more than once",path:["components"]});
  const names=v.components.map(c=>c.name.trim().toLowerCase());
  if(new Set(names).size!==names.length)ctx.addIssue({code:"custom",message:"Component names must be unique",path:["components"]});
  if(v.components.filter(c=>c.calculationType==="residual").length>1)ctx.addIssue({code:"custom",message:"Only one residual component is allowed",path:["components"]});
  v.components.forEach((c,index)=>{
    if(c.order!==index+1)ctx.addIssue({code:"custom",message:"Component order must match its position",path:["components",index,"order"]});
    if(c.calculationType==="residual"&&salaryDeductionIds.has(c.id.toLowerCase()))ctx.addIssue({code:"custom",message:"Deduction components cannot use residual calculation",path:["components",index,"calculationType"]});
    if(c.calculationType==="percentage_of_component"){
      const referenceIndex=v.components.findIndex(item=>item.id===c.referenceComponentId);
      if(referenceIndex<0)ctx.addIssue({code:"custom",message:"Reference component must exist in this template",path:["components",index,"referenceComponentId"]});
      else if(referenceIndex>=index)ctx.addIssue({code:"custom",message:"Reference component must appear earlier",path:["components",index,"referenceComponentId"]});
    }
  });
});
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const holiday = z.object({ ...common, effectiveYear: z.number().int().min(1970).max(3000), effectiveFrom: isoDate, holidays: z.array(z.object({ name: z.string().trim().min(1).max(120), date: isoDate })) }).superRefine((v,ctx)=>{if(Number(v.effectiveFrom.slice(0,4))!==v.effectiveYear)ctx.addIssue({code:"custom",message:"Effective date must be within the selected year"});});
const leave = z.object({ ...common, totalSickLeaves: nonnegative, totalCasualLeaves: nonnegative, earnedLeave: nonnegative.default(0), maxSickLeavesPerMonth: nonnegative, maxCasualLeavesPerMonth: nonnegative, maxEarnedLeavesPerMonth: nonnegative.default(0), totalPermissionHours: nonnegative.default(0), maxPermissionHoursPerMonth: nonnegative.default(0), carryForwardEnabled: z.boolean().default(true) }).superRefine((v,ctx)=>{if(v.maxSickLeavesPerMonth>v.totalSickLeaves)ctx.addIssue({code:"custom",message:"Monthly sick leave maximum cannot exceed yearly allocation"});if(v.maxCasualLeavesPerMonth>v.totalCasualLeaves)ctx.addIssue({code:"custom",message:"Monthly casual leave maximum cannot exceed yearly allocation"});if(v.maxPermissionHoursPerMonth>v.totalPermissionHours)ctx.addIssue({code:"custom",message:"Monthly permission maximum cannot exceed yearly allocation"});});

const configs: Record<string, { table:any; schema:z.ZodTypeAny; json:string[] }> = {
  "attendance-templates": { table: attendanceTemplatesTable, schema: attendance, json: [] },
  "work-pattern-templates": { table: workPatternTemplatesTable, schema: workPattern, json: ["week1OffDays","week2OffDays","week3OffDays","week4OffDays","week5OffDays"] },
  "salary-templates": { table: salaryTemplatesTable, schema: salary, json: ["components"] },
  "holiday-templates": { table: holidayTemplatesTable, schema: holiday, json: ["holidays"] },
  "leave-templates": { table: leaveTemplatesTable, schema: leave, json: [] },
};

const decode = (row:any, fields:string[]) => ({ ...row, ...Object.fromEntries(fields.map(k=>[k, (()=>{try{return JSON.parse(row[k]??"[]")}catch{return []}})()])), ...(row.effectiveYear ? holidayMeta(row) : {}) });
const holidayMeta = (row:any) => { const today=new Date().toISOString().slice(0,10), end=`${row.effectiveYear}-12-31`; const lifecycleStatus=end<today?"expired":row.effectiveFrom<=today?"active":"expiring-soon"; return { templateRef:String(row.id), lifecycleStatus, isAssignable:lifecycleStatus!=="expired" }; };
const encode = (value:any, fields:string[]) => ({ ...value, ...Object.fromEntries(fields.map(k=>[k,JSON.stringify(value[k]??[])])) });

for (const [path, config] of Object.entries(configs)) {
  const list = async (req:any,res:any,admin=false) => { const org=organizationId(req); const rows=await db.select().from(config.table).where(eq(config.table.organizationId,org)).orderBy(asc(config.table.templateName)); const visible=admin?rows:rows.filter((r:any)=>r.isActive!==false); return res.json(visible.map((r:any)=>decode(r,config.json)).sort((a:any,b:any)=>a.templateName.localeCompare(b.templateName))); };
  router.get(`/${path}`, requirePermission("settings.templates.view"), (req,res)=>list(req,res));
  router.get(`/${path}/admin`, requirePermission("settings.templates.view"), (req,res)=>list(req,res,true));
  router.post(`/${path}`, requirePermission("settings.templates.create"), async (req,res)=>{ const parsed=config.schema.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:z.prettifyError(parsed.error)}); const org=organizationId(req), value:any=parsed.data; const rows=await db.select().from(config.table).where(eq(config.table.organizationId,org)); if(rows.some((r:any)=>r.isActive!==false&&r.templateName.trim().toLowerCase()===value.templateName.toLowerCase()))return res.status(400).json({error:"An active template with this name already exists"}); const [created]=await db.insert(config.table).values({...encode(value,config.json),organizationId:org,isActive:true,updatedAt:new Date()}).returning(); return res.status(201).json(decode(created,config.json)); });
  router.put(`/${path}/:id`, requirePermission("settings.templates.update"), async (req,res)=>{ const parsed=config.schema.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:z.prettifyError(parsed.error)}); const org=organizationId(req), id=Number(req.params.id), value:any=parsed.data; if(!Number.isInteger(id))return res.status(400).json({error:"Invalid template id"}); const [existing]=await db.select().from(config.table).where(and(eq(config.table.id,id),eq(config.table.organizationId,org))); if(!existing)return res.status(404).json({error:"Template not found"}); const rows=await db.select().from(config.table).where(eq(config.table.organizationId,org)); if(rows.some((r:any)=>r.id!==id&&r.isActive!==false&&r.templateName.trim().toLowerCase()===value.templateName.toLowerCase()))return res.status(400).json({error:"An active template with this name already exists"}); const [updated]=await db.update(config.table).set({...encode(value,config.json),updatedAt:new Date()}).where(and(eq(config.table.id,id),eq(config.table.organizationId,org))).returning(); return res.json(decode(updated,config.json)); });
  router.delete(`/${path}/:id`, requirePermission("settings.templates.delete"), async (req,res)=>{ const org=organizationId(req),id=Number(req.params.id); const [row]=await db.update(config.table).set({isActive:false,updatedAt:new Date()}).where(and(eq(config.table.id,id),eq(config.table.organizationId,org))).returning(); if(!row)return res.status(404).json({error:"Template not found"}); return res.status(204).send(); });
}

router.post("/holiday-templates/:id/duplicate", requirePermission("settings.templates.create"), async (req,res)=>{const org=organizationId(req),[source]=await db.select().from(holidayTemplatesTable).where(and(eq(holidayTemplatesTable.id,Number(req.params.id)),eq(holidayTemplatesTable.organizationId,org)));if(!source||source.isActive===false)return res.status(404).json({error:"Template not found"});const rows=await db.select().from(holidayTemplatesTable).where(eq(holidayTemplatesTable.organizationId,org));let name=`${source.templateName} Copy`,i=2;while(rows.some((r:any)=>r.isActive!==false&&r.templateName.toLowerCase()===name.toLowerCase()))name=`${source.templateName} Copy ${i++}`;const { id: _id, isDefault: _isDefault, ...copy } = source;const [created]=await db.insert(holidayTemplatesTable).values({...copy,templateName:name,createdAt:new Date(),updatedAt:new Date()}).returning();return res.status(201).json(decode(created,["holidays"]));});
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
