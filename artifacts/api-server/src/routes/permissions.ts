import { Router } from "express";
import { effectivePermissions, getAuthUser, requirePermission } from "../lib/access";

const router = Router();
export const permissionCatalog = [
  { module:"Dashboard", key:"dashboard", actions:["view"] },
  { module:"User Management", key:"settings.user_management", actions:["view","create","update","delete","manage_settings"] },
  { module:"Templates", key:"settings.templates", actions:["view","create","update","delete"] },
  { module:"Inventory", key:"inventory", actions:["view","create","update","delete"] },
  { module:"Production", key:"production", actions:["view","create","update","delete","approve","export"] },
  { module:"Sales & Dispatch", key:"sales", actions:["view","create","update","delete","approve","export"] },
  { module:"Reports", key:"reports", actions:["view","export"] },
  { module:"Crew · Employees", key:"crew.employees", actions:["view","create","update","delete","forOwn","forOthers"] },
  { module:"Crew · Attendance", key:"crew.attendance", actions:["view","create","update","delete","notification","forOwn","forOthers","changeTime"] },
  { module:"Crew · Leave", key:"crew.leave", actions:["view","create","update","delete","approve","reject","forOwn","forOthers"] },
  { module:"Crew · Claims", key:"crew.claims", actions:["view","create","update","approve","reject","forOwn","forOthers"] },
  { module:"Crew · Overtime", key:"crew.overtime", actions:["view","create","update","approve","reject","forOwn","forOthers"] },
  { module:"Crew · Bonus", key:"crew.bonus", actions:["view","create","update","approve","reject","forOwn","forOthers"] },
  { module:"Crew · Deductions", key:"crew.deductions", actions:["view","create","update","delete","approve","reject","forOwn","forOthers"] },
];
router.get("/permissions/me", async(req,res)=>{const user=await getAuthUser(req);if(!user)return res.status(401).json({error:"Not authenticated"});return res.json({permissions:await effectivePermissions(user)});});
router.get("/settings/permissions/catalog", requirePermission("settings.user_management.view"), (_req,res)=>res.json(permissionCatalog));
export default router;
