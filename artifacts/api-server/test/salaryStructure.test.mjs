import test from "node:test";
import assert from "node:assert/strict";
import { build } from "../node_modules/esbuild/lib/main.js";
const accessBuild = await build({
 entryPoints: [new URL("../src/lib/access.ts", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, "")],
 bundle: true, write: false, format: "esm", platform: "node",
 plugins: [{name:"mock-db",setup(build) {
  build.onResolve({filter:/^@workspace\/db$/}, () => ({path:"db",namespace:"mock"}));
  build.onLoad({filter:/.*/,namespace:"mock"}, () => ({contents:'export const db = {select: () => ({from: () => ({where: async () => []})})}; export const eq = () => null; export const rolesTable = {}; export const usersTable = {};'}));
 }}],
});
const { permissionSetHas, effectivePermissions } = await import("data:text/javascript;base64," + Buffer.from(accessBuild.outputFiles[0].text).toString("base64"));

test("real RBAC accepts salary access for superadmin and explicit grants, but rejects missing and unknown permissions", async () => {
 const permissions = await effectivePermissions({role:"super_admin", organizationId:7});
 assert.equal(permissionSetHas(permissions, "crew.employees.salary_structure"), true);
 assert.equal(permissionSetHas(["crew.employees.salary_structure"], "crew.employees.salary_structure"), true);
 assert.equal(permissionSetHas(["crew.employees.update", "settings.templates.view"], "crew.employees.salary_structure"), false);
 assert.equal(permissionSetHas(permissions, "crew.employees.nonexistent_action"), false);
 const granted = await effectivePermissions({role:"employee", organizationId:7, permissionOverrides:[{permissionKey:"crew.employees.salary_structure",allowed:true}]});
 assert.equal(permissionSetHas(granted, "crew.employees.salary_structure"), true);
});
const result = await build({ entryPoints: [new URL("../../vidhai-erp/src/pages/crew/salaryStructure.ts", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, "")], bundle: true, write: false, format: "esm", platform: "node" });
const { initializeSalaryFixedValues, calculateSalaryTemplateComponents } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
const template = {id:1,components:[{id:"basic",name:"Basic",calculationType:"fixed",value:1000,order:1},{id:"special",name:"Special",calculationType:"residual",order:2}]};
test("fixed values use saved IDs or legacy names, preserve zero, and reset for a different template", () => {
 assert.deepEqual(initializeSalaryFixedValues(template,{salaryTemplateId:1,fixedComponentValues:{basic:0}}),{basic:"0"});
 assert.deepEqual(initializeSalaryFixedValues(template,{salaryTemplateId:1,fixedComponentValues:{Basic:1250}}),{basic:"1250"});
 assert.deepEqual(initializeSalaryFixedValues(template,{salaryTemplateId:2,fixedComponentValues:{basic:1250}}),{basic:""});
 assert.deepEqual(initializeSalaryFixedValues(template,{salaryTemplateId:1}),{basic:""});
});
test("salary preview computes fixed and residual amounts and rejects excess earnings", () => {
 const rows = calculateSalaryTemplateComponents({templateComponents:template.components,monthlyCtc:3000,fixedComponentValues:{basic:1250},earnedRatio:1});
 assert.equal(rows[0].monthlyAmount,1250);
 assert.equal(rows[1].yearlyAmount,21000);
 assert.throws(() => calculateSalaryTemplateComponents({templateComponents:template.components,monthlyCtc:3000,fixedComponentValues:{basic:4000},earnedRatio:1}),/exceed/);
});


test("salary endpoints enforce salary permission and employee scope without Settings permission", async () => {
 const { readFile } = await import("node:fs/promises");
 const source = await readFile(new URL("../src/routes/crew.ts", import.meta.url), "utf8");
 const start = source.indexOf('router.get("/employees/:id/salary-structure"');
 const end = source.indexOf('router.put("/employees/:id"', start);
 const routes = new Map();
 const templates = [{id:1,organizationId:7,isActive:true,components:'[]'}, {id:2,organizationId:8,isActive:true,components:'[]'}, {id:3,organizationId:7,isActive:false,components:'[]'}];
 globalThis.__structureRoutes = {
  router: {get:(path, handler) => routes.set(path, handler)},
  need: (req,res,permission) => permissionSetHas(req.permissions, permission) || (res.status(403).json({error:"Denied"}), false),
  scopedEmployee: async (req,res) => req.inScope ? {id:1,fixedComponentValues:'{"basic":1200}'} : (res.status(403).json({error:"Out of scope"}), null),
  db: {select:() => ({from:() => ({where:predicate => ({orderBy:async() => templates.filter(predicate)})})})},
  salaryTemplatesTable:{organizationId:"organizationId",templateName:"templateName"},
  eq:(field,value) => row => row[field] === value, asc:field => field,
  json:(value,fallback) => {try{return JSON.parse(value)}catch{return fallback}},
 };
 const output = await build({stdin:{contents:'const {router,need,scopedEmployee,db,salaryTemplatesTable,eq,asc,json}=globalThis.__structureRoutes;'+source.slice(start,end),loader:"ts"},write:false,format:"esm",platform:"node"});
 await import("data:text/javascript;base64,"+Buffer.from(output.outputFiles[0].text).toString("base64"));
 for (const [path,handler] of routes) {
  for (const [permissions,inScope,expected] of [[[],true,403],[["crew.employees.salary_structure"],false,403],[["crew.employees.salary_structure"],true,200],[["*"],true,200],[["*"],false,403]]) {
   const response={code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}};
   await handler({params:{id:"1"},crew:{org:7},permissions,inScope},response);
   assert.equal(response.code,expected);
   if(expected===200) {
    if(path.endsWith("salary-templates")) assert.deepEqual(response.body.map(row=>row.id),[1]);
    else assert.deepEqual(response.body.fixedComponentValues,{basic:1200});
   }
  }
 }
 delete globalThis.__structureRoutes;
});
