import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../node_modules/esbuild/lib/main.js";
import fs from "node:fs/promises";
const here = path.dirname(fileURLToPath(import.meta.url));
const tables = [
  "employeesTable",
  "attendanceLogsTable",
  "attendanceTemplatesTable",
  "workPatternTemplatesTable",
  "holidayTemplatesTable",
  "leaveRequestsTable",
  "payrollTable",
  "crewDeductionsTable",
  "organizationDetailsTable",
  "rolesTable",
];
let records = {},
  events = [],
  failDeduction = false;
const schema = Object.fromEntries(
  tables.map((name) => [
    name,
    new Proxy(
      { $name: name },
      { get: (t, k) => (k === "$name" ? t.$name : String(k)) },
    ),
  ]),
);
const eq = (field, value) => (row) => row[field] === value;
const and =
  (...conditions) =>
  (row) =>
    conditions.every((c) => c(row));
const or =
  (...conditions) =>
  (row) =>
    conditions.some((c) => c(row));
const isNull = (field) => (row) => row[field] == null;
const query = (table, mutate) => {
  let predicate = () => true;
  const run = () => {
    const rows = (records[table.$name] || []).filter(predicate);
    return mutate ? mutate(rows) : structuredClone(rows);
  };
  return {
    where(p) {
      predicate = p;
      return this;
    },
    orderBy() {
      return this;
    },
    returning() {
      return this;
    },
    then(ok, bad) {
      return Promise.resolve().then(run).then(ok, bad);
    },
  };
};
const db = {
  select: () => ({ from: (table) => query(table) }),
  update: (table) => ({
    set: (values) =>
      query(table, (rows) => {
        rows.forEach((r) => Object.assign(r, structuredClone(values)));
        return structuredClone(rows);
      }),
  }),
  insert: (table) => ({
    values: (values) =>
      query(table, () => {
        if (failDeduction && table.$name === "crewDeductionsTable")
          throw new Error("Deduction write failed");
        const row = {
          id:
            Math.max(0, ...(records[table.$name] || []).map((r) => r.id || 0)) +
            1,
          ...structuredClone(values),
        };
        (records[table.$name] ||= []).push(row);
        return structuredClone([row]);
      }),
  }),
  delete: (table) =>
    query(table, (rows) => {
      records[table.$name] = records[table.$name].filter(
        (r) => !rows.includes(r),
      );
      return [];
    }),
  transaction: async (fn) => {
    const before = structuredClone(records);
    try {
      return await fn(db);
    } catch (error) {
      records = before;
      throw error;
    }
  },
};
globalThis.__attendanceTest = {
  db,
  eq,
  and,
  or,
  isNull,
  ...schema,
  publishNotification: async (event) => {
    events.push(event);
  },
};
async function load(file, mocked = false) {
  const result = await build({
    entryPoints: [path.resolve(here, file)],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: mocked
      ? [
          {
            name: "database-fixture",
            setup(b) {
              b.onResolve({ filter: /^@workspace\/db$/ }, () => ({
                path: "db",
                namespace: "fixture",
              }));
              b.onResolve(
                { filter: /\/notificationService$|^\.\/notificationService$/ },
                () => ({ path: "notifications", namespace: "fixture" }),
              );
              b.onResolve({ filter: /^\.\/logger$/ }, () => ({
                path: "logger",
                namespace: "fixture",
              }));
              b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
                contents:
                  args.path === "db"
                    ? `export const {db,eq,and,or,isNull,${tables.join(",")}} = globalThis.__attendanceTest;`
                    : args.path === "logger"
                      ? "export const logger = { error() {} };"
                      : "export const {publishNotification} = globalThis.__attendanceTest;",
              }));
            },
          },
        ]
      : [],
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
}
const rules = await load("../src/lib/attendanceRules.ts");
const engine = await load("../src/lib/crewApprovalEngine.ts");
const workflow = await load("../src/lib/attendanceWorkflow.ts", true);
const closure = await load("../src/lib/attendanceClosureScheduler.ts", true);
const chain = [
  { level: 1, employeeId: 2, employeeName: "Manager" },
  { level: 2, employeeId: 3, employeeName: "Director" },
];
const actor = (id) => ({
  userId: id + 10,
  employeeId: id,
  name: "Reviewer " + id,
  role: "manager",
  isSuperAdmin: false,
  isAdminRole: false,
});
const template = {
  id: 1,
  organizationId: 1,
  workStartTime: "09:00",
  workEndTime: "17:00",
  workHours: "8",
  bufferTime: true,
  bufferMinutes: 15,
  fineType: "based_on_salary",
  finePerHour: "0",
};
function fixture() {
  records = Object.fromEntries(tables.map((t) => [t, []]));
  events = [];
  failDeduction = false;
  records.employeesTable = [1, 2, 3].map((id) => ({
    id,
    organizationId: 1,
    name: "Employee " + id,
    userId: id + 10,
    status: "Active",
    joinDate: "2026-09-01",
    baseSalary: "26000",
    attendanceRulesTemplate: 1,
    workPatternTemplate: 1,
    holidayTemplate: 1,
    approvalChain: JSON.stringify(id === 1 ? chain : []),
  }));
  records.organizationDetailsTable = [
    {
      id: 1,
      organizationId: 1,
      attendanceApprovalEnabled: true,
      attendanceApprovalLevels: 2,
      allowApprovalOverride: true,
      timezone: "Asia/Kolkata",
    },
  ];
  records.attendanceTemplatesTable = [structuredClone(template)];
  records.workPatternTemplatesTable = [
    {
      id: 1,
      organizationId: 1,
      ...Object.fromEntries(
        [1, 2, 3, 4, 5].map((i) => ["week" + i + "OffDays", "[0]"]),
      ),
    },
  ];
  records.holidayTemplatesTable = [
    { id: 1, organizationId: 1, holidays: "[]" },
  ];
  records.attendanceLogsTable = [
    {
      id: 1,
      organizationId: 1,
      employeeId: 1,
      employeeName: "Employee 1",
      attendanceDate: "2026-09-01",
      checkInTime: "09:45",
      checkOutTime: "16:30",
      approvalStatus: "Pending",
      status: "Pending Approval",
      currentLevel: 1,
      approvalChain: JSON.stringify(chain),
      approvalHistory: "[]",
      auditLogs: "[]",
      revision: 0,
    },
  ];
}
const row = () => structuredClone(records.attendanceLogsTable[0]);
test("fixed shifts deduct late minutes after grace plus early exit, respecting disabled buffer", () => {
  const actual = { checkInTime: "09:45", checkOutTime: "16:30" };
  assert.equal(
    rules.attendanceMetrics(actual, template).totalDeductionMinutes,
    60,
  );
  assert.equal(
    rules.attendanceMetrics(actual, { ...template, bufferTime: false })
      .totalDeductionMinutes,
    75,
  );
  assert.equal(
    rules.attendanceMetrics(
      { checkInTime: "09:15", checkOutTime: "17:00" },
      template,
    ),
    null,
  );
  assert.equal(
    rules.attendanceMetrics(
      { checkInTime: "09:16", checkOutTime: "17:00" },
      { ...template, bufferMinutes: 0 },
    ).totalDeductionMinutes,
    1,
  );
});
test("flexible shifts use net work hours and handle half-day shortage and midnight", () => {
  const flex = { ...template, flexibleHours: true, workHours: "7" };
  assert.equal(
    rules.attendanceMetrics(
      { checkInTime: "10:00", checkOutTime: "17:00" },
      flex,
    ),
    null,
  );
  assert.equal(
    rules.attendanceMetrics(
      { checkInTime: "10:00", checkOutTime: "13:00" },
      flex,
    ).autoReason,
    "half_day",
  );
  assert.equal(
    rules.attendanceMetrics(
      { checkInTime: "22:00", checkOutTime: "05:00" },
      flex,
    ),
    null,
  );
  assert.equal(
    rules.attendanceMetrics({ checkInTime: "no", checkOutTime: "17:00" }, flex),
    null,
  );
});
test("all fine types and zero-fixed-fine salary fallback match Yugam", () => {
  assert.equal(
    rules.attendanceFine(
      { fineType: "fixed_per_hour", finePerHour: 100 },
      125,
      0.5,
    ),
    50,
  );
  assert.equal(
    rules.attendanceFine(
      { fineType: "fixed_per_hour", finePerHour: 0 },
      125,
      0.5,
    ),
    62.5,
  );
  assert.equal(
    rules.attendanceFine(
      { fineType: "percent_hourly_basis", finePerHour: 50 },
      125,
      0.5,
    ),
    31.25,
  );
});
test("strict L1 to L2 sequence and next approver notification; no financial posting until final approval", async () => {
  fixture();
  await assert.rejects(
    workflow.reviewAttendance(row(), "Approved", "", null, actor(3), true),
    /Only the L1/,
  );
  const first = await workflow.reviewAttendance(
    row(),
    "Approved",
    "Checked",
    null,
    actor(2),
    true,
  );
  assert.equal(first.approvalStatus, "Pending");
  assert.equal(first.currentLevel, 2);
  assert.equal(records.crewDeductionsTable.length, 0);
  assert.deepEqual(events.at(-1).directRecipientUserIds, [13]);
  const final = await workflow.reviewAttendance(
    row(),
    "Approved",
    "",
    null,
    actor(3),
    true,
  );
  assert.equal(final.approvalStatus, "Approved");
  assert.equal(final.status, "Late");
  assert.equal(records.crewDeductionsTable[0].amount, "125");
  assert.equal(JSON.parse(final.approvalHistory).length, 2);
  assert.deepEqual(events.at(-1).directRecipientUserIds, [11]);
});
test("approval requires both punches; incomplete rejection is terminal and requires remarks", async () => {
  fixture();
  records.attendanceLogsTable[0].checkOutTime = null;
  await assert.rejects(
    workflow.reviewAttendance(row(), "Approved", "", null, actor(2), true),
    /incomplete/,
  );
  await assert.rejects(
    workflow.reviewAttendance(row(), "Rejected", "", null, actor(2), true),
    /remarks/,
  );
  const rejected = await workflow.reviewAttendance(
    row(),
    "Rejected",
    "Missing punch-out",
    null,
    actor(2),
    true,
  );
  assert.equal(rejected.approvalStatus, "Rejected");
  assert.equal(rejected.status, "Absent");
  await assert.rejects(
    workflow.reviewAttendance(row(), "Approved", "", null, actor(2), true),
    /Only pending/,
  );
});
test("admin override is audited and disabling overrides enforces sequence", async () => {
  fixture();
  const admin = { ...actor(9), isAdminRole: true };
  records.organizationDetailsTable[0].allowApprovalOverride = false;
  await assert.rejects(
    workflow.reviewAttendance(row(), "Approved", "", null, admin, true),
    /Only the L1/,
  );
  records.organizationDetailsTable[0].allowApprovalOverride = true;
  const final = await workflow.reviewAttendance(
    row(),
    "Approved",
    "Override",
    null,
    admin,
    true,
  );
  assert.equal(final.approvalStatus, "Approved");
  assert.equal(JSON.parse(final.approvalHistory)[0].action, "OverrideApproved");
  assert.deepEqual(events.at(-1).directRecipientUserIds, [11, 12, 13]);
});
test("configured self-approval can approve own completed attendance without a general action grant", async () => {
  fixture();
  records.employeesTable[0].canApproveOwnAttendance = true;
  const final = await workflow.reviewAttendance(
    row(),
    "Approved",
    "",
    null,
    actor(1),
    false,
  );
  assert.equal(final.approvalStatus, "Approved");
  fixture();
  await assert.rejects(
    workflow.reviewAttendance(row(), "Approved", "", null, actor(2), false),
    /permission/,
  );
});
test("missing levels and cross-organization, duplicate, inactive or self approvers are rejected", async () => {
  fixture();
  records.employeesTable[0].approvalChain = "[]";
  records.employeesTable[0].reportingManager = 2;
  await assert.rejects(
    workflow.buildAttendanceChain(records.employeesTable[0], 1),
    /1 of 2/,
  );
  for (const input of [
    [{ employeeId: 99 }],
    [{ employeeId: 1 }],
    [{ employeeId: 2 }, { employeeId: 2 }],
  ])
    await assert.rejects(workflow.validateEmployeeApprovers(input, 1, 1));
  records.employeesTable[1].organizationId = 2;
  await assert.rejects(
    workflow.validateEmployeeApprovers([{ employeeId: 2 }], 1, 1),
    /active approvers/,
  );
});
test("disabled policy is permission-based one-step approval, not automatic approval", async () => {
  fixture();
  records.organizationDetailsTable[0].attendanceApprovalEnabled = false;
  assert.deepEqual(
    await workflow.buildAttendanceChain(records.employeesTable[0], 1),
    [],
  );
  await assert.rejects(
    workflow.reviewAttendance(row(), "Approved", "", null, actor(8), false),
    /permission/,
  );
  assert.equal(
    (
      await workflow.reviewAttendance(
        row(),
        "Approved",
        "",
        null,
        actor(8),
        true,
      )
    ).approvalStatus,
    "Approved",
  );
});
test("fine override of zero is retained while calculated amount and original punches remain auditable", async () => {
  fixture();
  const final = await workflow.reviewAttendance(
    row(),
    "Approved",
    "Waived",
    { lateFineAmount: 0, checkInTime: "10:15" },
    { ...actor(9), isSuperAdmin: true },
    true,
  );
  assert.equal(final.checkInTime, "10:15");
  assert.equal(records.crewDeductionsTable[0].amount, "0");
  assert.equal(records.crewDeductionsTable[0].calculatedAmount, "187.5");
  assert.equal(JSON.parse(final.originalPunchValues).checkInTime, "09:45");
});
test("invalid overrides fail without approving the request", async () => {
  for (const overrides of [
    { lateFineAmount: -1 },
    { lateFineAmount: null },
    { lateFineAmount: "bad" },
    { checkInTime: "25:00" },
  ]) {
    fixture();
    await assert.rejects(
      workflow.reviewAttendance(
        row(),
        "Approved",
        "",
        overrides,
        { ...actor(9), isSuperAdmin: true },
        true,
      ),
    );
    assert.equal(records.attendanceLogsTable[0].approvalStatus, "Pending");
    assert.equal(records.crewDeductionsTable.length, 0);
  }
});
test("paid payroll blocks approval and leaves attendance and deductions unchanged", async () => {
  fixture();
  records.payrollTable = [
    { organizationId: 1, employeeId: 1, payPeriod: "2026-09", status: "Paid" },
  ];
  await assert.rejects(
    workflow.reviewAttendance(
      row(),
      "Approved",
      "",
      null,
      { ...actor(9), isSuperAdmin: true },
      true,
    ),
    /Paid payroll/,
  );
  assert.equal(row().approvalStatus, "Pending");
  assert.equal(records.crewDeductionsTable.length, 0);
});
test("approval rolls back if deduction persistence fails", async () => {
  fixture();
  failDeduction = true;
  await assert.rejects(
    workflow.reviewAttendance(
      row(),
      "Approved",
      "",
      null,
      { ...actor(9), isSuperAdmin: true },
      true,
    ),
    /Deduction write failed/,
  );
  assert.equal(row().approvalStatus, "Pending");
  assert.equal(row().revision, 0);
  assert.equal(events.length, 0);
});
test("a stale reviewer cannot overwrite an intervening correction or approval", async () => {
  fixture();
  const stale = row();
  records.attendanceLogsTable[0].revision = 1;
  await assert.rejects(
    workflow.reviewAttendance(stale, "Approved", "", null, actor(2), true),
    /changed during review/,
  );
  assert.equal(row().currentLevel, 1);
  assert.equal(row().revision, 1);
});
test("scheduled-day salary divisor excludes assigned week-offs and holidays, not employment start", () => {
  fixture();
  records.holidayTemplatesTable[0].holidays = '[{"date":"2026-09-07"}]';
  assert.equal(
    rules.scheduledDays(
      { ...records.employeesTable[0], joinDate: "2026-09-15" },
      "2026-09",
      records.workPatternTemplatesTable,
      records.holidayTemplatesTable,
    ),
    25,
  );
  assert.equal(
    rules.calendarStatus(
      records.employeesTable[0],
      "2026-09-06",
      records.workPatternTemplatesTable,
      records.holidayTemplatesTable,
    ),
    "Week Off",
  );
});
test("pending/rejected punches never display as finalized presence", () => {
  assert.equal(
    rules.attendanceDisplayStatus({
      status: "Present",
      approvalStatus: "Pending",
      checkOutTime: "17:00",
    }),
    "Pending Approval",
  );
  assert.equal(
    rules.attendanceDisplayStatus({
      status: "Present",
      approvalStatus: "Pending",
    }),
    "Punch Out Pending",
  );
  assert.equal(
    rules.attendanceDisplayStatus({
      status: "Present",
      approvalStatus: "Rejected",
    }),
    "Absent",
  );
});
test("closure preserves complete pending days and evidence, rejects missed punch-outs, skips paid months", async () => {
  fixture();
  const today = workflow.dateInZone("Asia/Kolkata");
  const yesterday = new Date(Date.parse(today + "T00:00:00Z") - 86400000)
    .toISOString()
    .slice(0, 10);
  records.employeesTable = records.employeesTable.slice(0, 1);
  records.employeesTable[0].joinDate = yesterday;
  records.workPatternTemplatesTable = [];
  records.attendanceLogsTable[0].attendanceDate = yesterday;
  await closure.closeMissedAttendance(1);
  assert.equal(row().approvalStatus, "Pending");
  records.attendanceLogsTable[0].checkOutTime = null;
  records.attendanceLogsTable[0].checkInPhoto = "evidence.jpg";
  await closure.closeMissedAttendance(1);
  assert.equal(row().status, "Absent");
  assert.equal(row().approvalStatus, "Rejected");
  assert.equal(row().checkInPhoto, "evidence.jpg");
  records.attendanceLogsTable = [];
  records.payrollTable = [
    {
      organizationId: 1,
      employeeId: 1,
      payPeriod: yesterday.slice(0, 7),
      status: "Paid",
    },
  ];
  await closure.closeMissedAttendance(1);
  assert.equal(records.attendanceLogsTable.length, 0);
});

// Exercise the actual Express route bodies with isolated request/database adapters.
const routeSource = await fs.readFile(
  path.resolve(here, "../src/routes/crew.ts"),
  "utf8",
);
const attendanceRoutes = routeSource
  .slice(
    routeSource.indexOf('router.get("/attendance/settings"'),
    routeSource.indexOf("async function leaveContext"),
  )
  .replace(
    'await import("./crewpay")',
    "({ refreshAttendancePayroll: async () => {} })",
  );
globalThis.__attendanceRouteTest = {
  workflow,
  rules,
  own: (req) =>
    records.employeesTable.find(
      (e) => e.userId === req.crew.user.id && e.organizationId === req.crew.org,
    ),
};
const routesBuild = await build({
  stdin: {
    loader: "ts",
    contents: `
const {db,eq,and,or,isNull,${tables.join(",")}} = globalThis.__attendanceTest;
const {workflow,rules,own} = globalThis.__attendanceRouteTest;
const {activeAttendanceChain,attendanceActor,attendanceCalendar,attendanceFinePreview,attendanceSettings,attendanceVersion,assertAttendanceMonthOpen,buildAttendanceChain,dateInZone,notifyAttendance,reviewAttendance,validateEmployeeApprovers} = workflow;
const {attendanceDisplayStatus,timeMinutes} = rules;
const json=rules.readJson, today=()=>dateInZone('Asia/Kolkata'), iso=v=>/^\\d{4}-\\d{2}-\\d{2}$/.test(v), desc=v=>v;
const ownEmployee=async req=>own(req), can=(req,key)=>req.crew.permissions.includes('*')||req.crew.permissions.includes(key), need=(req,res,key)=>{if(can(req,key))return true;res.status(403).json({error:'Missing permission'});return false;};
const scopedRows=async(req,rows)=>req.crew.permissions.includes('*')?rows:rows.filter(r=>r.employeeId===own(req)?.id||r.id===own(req)?.id);
const scopedEmployee=async(req,res,id)=>{const [e]=await db.select().from(employeesTable).where(and(eq(employeesTable.id,id),eq(employeesTable.organizationId,req.crew.org)));return e;};
const saveAttendancePhoto=async()=>'/test-photo.jpg',reverseGeocode=async()=>null,audit=async()=>{},attendanceLocation=v=>json(v,null),minutes=v=>timeMinutes(v)||0,attendanceBufferMinutes=t=>t.bufferTime?t.bufferMinutes:0;
export const routes=[]; const router=Object.fromEntries(['get','post','patch'].map(method=>[method,(path,handler)=>routes.push({method,path,handler})]));
${attendanceRoutes}
`,
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { routes } = await import(
  "data:text/javascript;base64," +
    Buffer.from(routesBuild.outputFiles[0].text).toString("base64")
);
async function callRoute(
  method,
  route,
  { body = {}, id, userId = 11, permissions = [], query = {} } = {},
) {
  const req = {
    body,
    params: { id },
    query,
    crew: {
      org: 1,
      user: {
        id: userId,
        displayName: "Test",
        role: permissions.includes("*") ? "super_admin" : "employee",
      },
      permissions,
      attendanceSettings: await workflow.attendanceSettings(1),
    },
  };
  const result = { status: 200 };
  const res = {
    status(code) {
      result.status = code;
      return this;
    },
    json(value) {
      result.body = value;
      return this;
    },
  };
  await routes
    .find((r) => r.method === method && r.path === route)
    .handler(req, res);
  return result;
}
test("punch endpoints use server time, require evidence and ignore injected approval fields", async () => {
  fixture();
  records.attendanceLogsTable = [];
  records.workPatternTemplatesTable = [];
  const punch = {
    employeeId: 1,
    punchAction: "punchIn",
    location: { latitude: 11, longitude: 77 },
    photoDataUrl: "data:image/jpeg;base64,YQ==",
    approvalStatus: "Approved",
    checkInTime: "00:01",
    timezone: "America/New_York",
  };
  assert.equal(
    (
      await callRoute("post", "/attendance", {
        body: { ...punch, photoDataUrl: null },
      })
    ).status,
    400,
  );
  const first = await callRoute("post", "/attendance", { body: punch });
  assert.equal(first.status, 201);
  assert.equal(first.body.approvalStatus, "Pending");
  assert.equal(first.body.timezone, "Asia/Kolkata");
  assert.equal(first.body.status, "Punch Out Pending");
  assert.equal(
    (await callRoute("post", "/attendance", { body: punch })).status,
    409,
  );
  const out = await callRoute("patch", "/attendance/:id", {
    id: first.body.id,
    body: {
      punchAction: "punchOut",
      location: punch.location,
      photoDataUrl: punch.photoDataUrl,
      approvalStatus: "Approved",
      employeeId: 3,
      checkInTime: "00:00",
    },
  });
  assert.equal(out.status, 200);
  assert.equal(out.body.approvalStatus, "Pending");
  assert.equal(out.body.employeeId, 1);
  assert.equal(out.body.checkInTime, first.body.checkInTime);
  assert.equal(out.body.status, "Pending Approval");
  assert.equal(
    (
      await callRoute("patch", "/attendance/:id", {
        id: first.body.id,
        body: {
          punchAction: "punchOut",
          location: punch.location,
          photoDataUrl: punch.photoDataUrl,
        },
      })
    ).status,
    409,
  );
});
test("punch endpoints reject another employee and organization-local holidays", async () => {
  fixture();
  records.attendanceLogsTable = [];
  const punch = {
    employeeId: 1,
    punchAction: "punchIn",
    location: { latitude: 11, longitude: 77 },
    photoDataUrl: "data:image/jpeg;base64,YQ==",
  };
  assert.equal(
    (await callRoute("post", "/attendance", { body: punch, userId: 12 }))
      .status,
    403,
  );
  records.holidayTemplatesTable[0].holidays = JSON.stringify([
    { date: workflow.dateInZone("Asia/Kolkata") },
  ]);
  assert.equal(
    (await callRoute("post", "/attendance", { body: punch })).status,
    403,
  );
});
test("employee punch-out correction is allowed only before the first review and preserves evidence", async () => {
  fixture();
  const edited = await callRoute("patch", "/attendance/:id/punch-out-edit", {
    id: 1,
    body: { checkOutTime: "17:00" },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.checkOutTime, "17:00");
  assert.equal(
    JSON.parse(edited.body.originalPunchValues).checkOutTime,
    "16:30",
  );
  assert.equal(
    (
      await callRoute("patch", "/attendance/:id/punch-out-edit", {
        id: 1,
        userId: 12,
        body: { checkOutTime: "18:00" },
      })
    ).status,
    403,
  );
  await workflow.reviewAttendance(row(), "Approved", "", null, actor(2), true);
  assert.equal(
    (
      await callRoute("patch", "/attendance/:id/punch-out-edit", {
        id: 1,
        body: { checkOutTime: "18:00" },
      })
    ).status,
    409,
  );
});
test("attendance list exposes pending state and only grants actions to the current approver", async () => {
  fixture();
  const result = await callRoute("get", "/attendance", {
    userId: 12,
    permissions: ["crew.attendance.approve", "crew.attendance.reject"],
  });
  const pending = result.body.find((r) => r.id === 1);
  assert.equal(pending.status, "Pending Approval");
  assert.equal(pending.canApprove, true);
  assert.equal(pending.canReject, true);
  assert.equal(pending.lateFinePreview.amount, 125);
  const employee = await callRoute("get", "/attendance", { userId: 11 });
  assert.equal(employee.body.find((r) => r.id === 1).canApprove, false);
});

const syncSource = routeSource.slice(
  routeSource.indexOf("export async function syncAttendanceDeductions("),
  routeSource.indexOf('router.get("/deductions"'),
);
const syncBuild = await build({
  stdin: {
    loader: "ts",
    contents: `
const {db,eq,and,${tables.join(",")}}=globalThis.__attendanceTest;
const {workflow,rules}=globalThis.__attendanceRouteTest;
const json=rules.readJson, attendanceFinePreview=workflow.attendanceFinePreview;
const leaveContext=async()=>({}),chargeableDays=()=>26,datesBetween=()=>[];
${syncSource}
`,
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { syncAttendanceDeductions } = await import(
  "data:text/javascript;base64," +
    Buffer.from(syncBuild.outputFiles[0].text).toString("base64")
);
test("regeneration retains a waived fine and does not modify paid-month deductions", async () => {
  fixture();
  await workflow.reviewAttendance(
    row(),
    "Approved",
    "Waived",
    { lateFineAmount: 0 },
    { ...actor(9), isSuperAdmin: true },
    true,
  );
  await syncAttendanceDeductions(1, 8, 2026);
  assert.equal(records.crewDeductionsTable[0].amount, "0");
  assert.equal(records.crewDeductionsTable[0].calculatedAmount, "125");
  records.payrollTable = [
    { organizationId: 1, employeeId: 1, payPeriod: "2026-09", status: "Paid" },
  ];
  const before = structuredClone(records.crewDeductionsTable);
  records.attendanceLogsTable[0].approvalStatus = "Pending";
  await syncAttendanceDeductions(1, 8, 2026);
  assert.deepEqual(records.crewDeductionsTable, before);
});
