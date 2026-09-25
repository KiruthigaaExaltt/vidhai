/** Isolated local API regression audit. Never connects to the app database. */
import assert from "node:assert/strict";
import { randomBytes, publicEncrypt, constants } from "node:crypto";
import mongoose from "mongoose";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const database = `vidhai_crew_audit_${Date.now()}`;
process.env.MONGODB_URI = `mongodb://127.0.0.1:27017/${database}?replicaSet=rs0`;
process.env.BOOTSTRAP_ADMIN_USERNAME = "audit_admin";
process.env.BOOTSTRAP_ADMIN_PASSWORD = randomBytes(24).toString("hex");
process.env.SESSION_SECRET = randomBytes(32).toString("hex");
process.env.JWT_ACCESS_SECRET = randomBytes(32).toString("hex");
process.env.JWT_REFRESH_SECRET = randomBytes(32).toString("hex");
process.env.JWT_ACCESS_EXPIRY = "15m";
process.env.JWT_REFRESH_EXPIRY = "3d";
process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS = "259200000";
process.env.SESSION_COOKIE_MAX_AGE_MS = "259200000";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.UPLOAD_ROOT = await mkdtemp(path.join(tmpdir(), "vidhai-crew-audit-"));
// Small PNG fixture exercises upload validation/storage, not camera hardware.
const photoDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

const { default: app } = await import("../../artifacts/api-server/src/app");
const schema = await import("@workspace/db");
const { db, eq, usersTable, rolesTable, employeesTable, attendanceLogsTable, leaveRequestsTable, crewDeductionsTable } = schema;
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
let passed = 0;
const pass = (name: string) => { passed++; console.log(`PASS ${name}`); };
type Client = { token?: string; cookies?: string };
async function request(client: Client, path: string, method = "GET", body?: any, expected = 200) {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(client.token ? { Authorization: `Bearer ${client.token}` } : {}), ...(client.cookies ? { Cookie: client.cookies } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  const cookies = response.headers.getSetCookie();
  if (cookies.length) {
    const jar = new Map((client.cookies || "").split("; ").filter(Boolean).map((entry) => { const index = entry.indexOf("="); return [entry.slice(0, index), entry.slice(index + 1)]; }));
    for (const cookie of cookies) { const pair = cookie.split(";")[0]; const index = pair.indexOf("="); jar.set(pair.slice(0, index), pair.slice(index + 1)); }
    client.cookies = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  }
  return data;
}
async function login(username: string, password: string) {
  const client: Client = {};
  const { publicKey } = await request(client, "/auth/login-key");
  const encrypted = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(password)).toString("base64");
  const result = await request(client, "/auth/login", "POST", { username, password: encrypted, passwordEncoding: "rsa-oaep-256" });
  client.token = result.accessToken;
  return client;
}
try {
  const admin = await login("audit_admin", process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  for (const kind of ["attendance", "work-pattern", "salary", "leave", "holiday"]) assert.equal((await request(admin, `/${kind}-templates`)).length, 0);
  pass("No default templates created on app initialization");
  const attendance = await request(admin, "/attendance-templates", "POST", { templateName: "QA attendance", workStartTime: "09:30", workEndTime: "18:30", fineType: "based_on_salary", finePerHour: 0 }, 201);
  assert.equal(attendance.bufferTime, true); assert.equal(Number(attendance.bufferMinutes), 15); assert.equal(Number(attendance.workHours), 9);
  await request(admin, "/attendance-templates", "POST", { templateName: "Invalid", workStartTime: "25:00", workEndTime: "18:30", fineType: "based_on_salary", finePerHour: 0 }, 400);
  const pattern = await request(admin, "/work-pattern-templates", "POST", { templateName: "QA Sundays", ...Object.fromEntries([1,2,3,4,5].map(week => [`week${week}OffDays`, [0]])) }, 201);
  const leaveTemplate = await request(admin, "/leave-templates", "POST", { templateName: "QA leave", totalSickLeaves: 6, totalCasualLeaves: 6, maxSickLeavesPerMonth: 1, maxCasualLeavesPerMonth: 1 }, 201);
  const salary = await request(admin, "/salary-templates", "POST", { templateName: "QA salary", components: [{ id: "basic", name: "Custom Basic Name", calculationType: "fixed", value: "20000", order: 1 }] }, 201);
  const holiday = await request(admin, "/holiday-templates", "POST", { templateName: "QA holiday", effectiveYear: 2026, effectiveFrom: "2026-01-01", holidays: [{ name: "Independence Day", date: "2026-08-15" }, { name: "QA calendar holiday", date: "2026-08-26" }, { name: "QA calendar holiday", date: "2026-08-28" }] }, 201);
  pass("All five templates create and round-trip; buffer defaults, times, custom component name validated");
  const [employee] = await db.insert(employeesTable).values({ name: "Audit Crew", employeeCode: "AUDIT-1", designation: "Tester", department: "QA", employmentType: "Full Time", workMode: "On-site", location: "QA", joinDate: "2026-01-01", baseSalary: "20000", annualCtc: "240000", attendanceRulesTemplate: attendance.id, workPatternTemplate: pattern.id, leaveTemplate: leaveTemplate.id, salaryTemplateId: salary.id, holidayTemplate: holiday.id }).returning();
  const created = await request(admin, "/users", "POST", { username: "audit_crew", name: "Audit Crew", role: "audit_crew", employeeId: employee.id }, 201);
  assert.equal(created.temporaryPassword, "vidhaii123");
  const crew = await login("audit_crew", "vidhaii123");
  pass("New user default password and linked employee login");
  const self = await request(crew, "/crew/employees?scope=attendance"); assert.equal(self.data.length, 1);
  await request(crew, "/crew/attendance");
  const location = { latitude: 11.0168, longitude: 76.9558, address: "QA address Coimbatore" };
  for (const invalidPhoto of [undefined, "", "/old-photo.png", "data:image/png;base64,"]) {
    const denied = await request(crew, "/crew/attendance", "POST", { employeeId: employee.id, punchAction: "punchIn", location, photoDataUrl: invalidPhoto }, 400);
    assert.match(denied.error, /photo/i);
  }
  await request(crew, "/crew/attendance", "POST", { employeeId: employee.id, punchAction: "punchIn", photoDataUrl, location: { latitude: 999, longitude: 76 } }, 400);
  const punch = await request(crew, "/crew/attendance", "POST", { employeeId: employee.id, punchAction: "punchIn", photoDataUrl, location }, 201);
  assert.ok(punch.checkInPhoto);
  assert.equal(punch.approvalStatus, "Pending");
  await request(crew, "/crew/attendance", "POST", { employeeId: employee.id, punchAction: "punchIn", location }, 409);
  await request(crew, `/crew/attendance/${punch.id}/approval`, "PATCH", { decision: "Approved" }, 403);
  for (const invalidPhoto of [undefined, "", "/old-photo.png", "data:image/png;base64,"]) {
    const denied = await request(crew, `/crew/attendance/${punch.id}`, "PATCH", { punchAction: "punchOut", location, photoDataUrl: invalidPhoto }, 400);
    assert.match(denied.error, /photo/i);
  }
  const out = await request(crew, `/crew/attendance/${punch.id}`, "PATCH", { punchAction: "punchOut", photoDataUrl, location, checkInTime: "00:00", organizationId: 99 });
  assert.ok(out.checkOutPhoto);
  assert.equal(out.checkInTime, punch.checkInTime); assert.equal(out.organizationId, 1); assert.equal(out.locked, true);
  await request(crew, `/crew/attendance/${punch.id}`, "PATCH", { punchAction: "punchOut", photoDataUrl, location }, 409);
  const logs = await request(crew, "/crew/attendance");
  assert.equal(logs[0].checkOutLocation.latitude, location.latitude); assert.equal(logs[0].checkOutAddress, location.address);
  pass("Crew self-punch requires photos for both actions; missing/empty/URL evidence blocked; uploaded photos and location preserved; duplicate/unauthorized approval blocked");
  await db.insert(rolesTable).values({ name: "Audit Approver", slug: "audit_approver", permissions: JSON.stringify(["crew.attendance.approve", "crew.attendance.view", "crew.attendance.for_others"]) });
  await request(admin, "/users", "POST", { username: "audit_hr", name: "Audit HR", role: "audit_approver" }, 201);
  const hr = await login("audit_hr", "vidhaii123");
  const approved = await request(hr, `/crew/attendance/${punch.id}/approval`, "PATCH", { decision: "Approved" }); assert.equal(approved.approvalStatus, "Approved");
  pass("HR approve permission works without attendance update/create permission");
  await request(admin, "/users", "POST", { username: "audit_outsider", name: "Outside Crew", role: "viewer" }, 201);
  const outsider = await login("audit_outsider", "vidhaii123");
  await request(outsider, "/crew/attendance", "POST", { employeeId: employee.id, punchAction: "punchIn", location }, 403);
  await request(outsider, `/crew/attendance/${punch.id}`, "PATCH", { punchAction: "punchOut", location }, 403);
  pass("Non-crew users cannot punch for an employee; invalid coordinates rejected");
  const nextYear = new Date().getFullYear() + 1;
  const register = await request(crew, `/crew/attendance/register?month=${nextYear}-01`); assert.equal(register.rows.length, 1); assert.ok(register.rows[0].days.every((day: any) => day.future));
  pass("Future register days are frozen and own register is accessible");
  await request(admin, `/crew/employees/${employee.id}`, "PUT", { phone: "12345678901" }, 400);
  await request(admin, `/crew/employees/${employee.id}`, "PUT", { fixedComponentValues: { basic: -1 } }, 400);
  await request(admin, `/crew/employees/${employee.id}`, "PUT", { fixedComponentValues: { basic: 21000 } }, 400);
  await request(admin, `/crew/employees/${employee.id}`, "PUT", { fixedComponentValues: { basic: "20000" }, phone: "9876543210" });
  pass("Employee updates reject invalid phone and negative salary components");
  for (let day = 1; day <= 31; day++) {
    const date = `2026-08-${String(day).padStart(2, "0")}`;
    if ([3,4,5,15,26,28].includes(day) || new Date(`${date}T00:00:00Z`).getUTCDay() === 0) continue;
    await db.insert(attendanceLogsTable).values({ employeeId: employee.id, employeeName: employee.name, attendanceDate: date, status: [6,10].includes(day) ? "Late" : "Present", approvalStatus: "Approved", checkInTime: day === 6 ? "10:15" : day === 10 ? "10:00" : "09:30", checkOutTime: [7,10].includes(day) ? "17:30" : "18:30", locked: true });
  }
  for (const [date,type] of [["03","Casual"],["04","Sick"],["05","Other"]]) await db.insert(leaveRequestsTable).values({ employeeId: employee.id, employeeName: employee.name, startDate: `2026-08-${date}`, endDate: `2026-08-${date}`, leaveType: type, status: "Approved", fromSession: 1, toSession: 2, requestedDays: "1" });
  const generate = async () => (await request(admin, "/crewpay/salary-slips/generate", "POST", { employeeId: employee.id, year: 2026, month: 8 })).results[0].slip;
  let slip = await generate();
  assert.equal(Number(slip.netPay), 19157.71); assert.equal(Number(slip.payableDays), 30); assert.equal(Number(slip.absentDays), 1); assert.equal(Number(slip.leaveDays), 2);
  assert.equal(Number(slip.presentDays), 20);
  assert.equal(slip.deductionSummary.lopAmount, 645.16); assert.equal(slip.deductionSummary.otherDeductionsAmount, 197.13);
  assert.equal(Number(slip.grossPay), 19354.84); assert.equal(Number(slip.totalDeductions), 197.13);
  const before = await db.select().from(crewDeductionsTable); await generate(); assert.equal((await db.select().from(crewDeductionsTable)).length, before.length);
  pass("August salary is 19157.71; 30 payable days, 1 LOP, 2 paid leaves; no double deduction or duplicate auto rows");
  await request(admin, "/crew/leaves", "POST", { employeeId: employee.id, leaveType: "Sick", startDate: "2026-08-12", endDate: "2026-08-12", fromSession: 1, toSession: 2, reason: "Exceeded" }, 400);
  pass("Monthly sick-leave limit enforced");
  for (const date of ["2026-01-05", "2026-02-02", "2026-03-02", "2026-04-06", "2026-05-04"])
    await db.insert(leaveRequestsTable).values({ employeeId: employee.id, employeeName: employee.name, startDate: date, endDate: date, leaveType: "Sick", status: "Approved", requestedDays: "1" });
  await request(admin, "/crew/leaves", "POST", { employeeId: employee.id, leaveType: "Sick", startDate: "2026-09-07", endDate: "2026-09-07", fromSession: 1, toSession: 2, reason: "Year limit" }, 400);
  pass("Annual six-day sick leave allocation enforced independently of monthly limit");
  const [otLog] = (await db.select().from(attendanceLogsTable)).filter((row: any) => row.attendanceDate === "2026-08-11");
  await db.update(attendanceLogsTable).set({ checkOutTime: "20:30" }).where(eq(attendanceLogsTable.id, otLog.id));
  const calc = await request(admin, `/crew/overtime/calculation?employeeId=${employee.id}&date=2026-08-11`); assert.equal(calc.overtimeHours, 2); assert.equal(calc.amount, 143.36);
  const ot = await request(admin, "/crew/overtime", "POST", { employeeId: employee.id, attendanceDate: "2026-08-11", title: "QA overtime" }, 201);
  assert.equal(Number((await generate()).overtimeAmount), 0);
  await request(admin, `/crew/overtime/${ot.id}/status`, "PATCH", { status: "Approved" });
  slip = await generate(); assert.equal(Number(slip.overtimeAmount), 143.36); assert.equal(Number(slip.netPay), 19301.07);
  pass("Overtime calculation, request, approval, and salary inclusion; pending OT excluded");
  const [otherLeave] = (await db.select().from(leaveRequestsTable)).filter((row: any) => row.leaveType === "Other");
  await db.update(leaveRequestsTable).set({ toSession: 1 }).where(eq(leaveRequestsTable.id, otherLeave.id));
  slip = await generate();
  assert.equal(Number(slip.payableDays), 30.5); assert.equal(slip.deductionSummary.lopAmount, 322.58);
  const halfLop = (await db.select().from(crewDeductionsTable)).find((row: any) => String(row.autoReason).includes("Other leave"));
  assert.equal(Number(halfLop?.amount), 322.58);
  await db.update(leaveRequestsTable).set({ toSession: 2 }).where(eq(leaveRequestsTable.id, otherLeave.id));
  pass("Half-day Other leave produces half-day LOP in both deductions and payslip");
  const [missingLog] = (await db.select().from(attendanceLogsTable)).filter((row: any) => row.attendanceDate === "2026-08-12");
  await db.update(attendanceLogsTable).set({ attendanceDate: "2026-07-12" }).where(eq(attendanceLogsTable.id, missingLog.id));
  slip = await generate(); assert.equal(Number(slip.payableDays), 29); assert.equal(slip.deductionSummary.lopAmount, 1290.32);
  await db.update(attendanceLogsTable).set({ attendanceDate: "2026-08-12" }).where(eq(attendanceLogsTable.id, missingLog.id));
  pass("Missing working-day attendance is unpaid and displayed in LOP without an explicit absent log");
  await request(admin, `/attendance-templates/${attendance.id}`, "PUT", { ...attendance, bufferTime: false });
  await generate();
  const noBuffer = (await db.select().from(crewDeductionsTable)).find((row: any) => row.date === "2026-08-06");
  assert.equal(noBuffer?.lateMinutes, 45); assert.equal(Number(noBuffer?.amount), 53.76);
  await request(admin, `/attendance-templates/${attendance.id}`, "PUT", { ...attendance, fineType: "fixed_per_hour", finePerHour: 100 });
  await generate();
  const fixedFine = (await db.select().from(crewDeductionsTable)).find((row: any) => row.date === "2026-08-06");
  assert.equal(Number(fixedFine?.amount), 50);
  await request(admin, `/attendance-templates/${attendance.id}`, "PUT", attendance);
  pass("Buffer enable/disable and fixed hourly fine recalculate correctly");
  await request(admin, `/leave-templates/${leaveTemplate.id}`, "PUT", { ...leaveTemplate, totalPermissionHours: 12, maxPermissionHoursPerMonth: 2 });
  const permission = await request(admin, "/crew/leaves", "POST", { employeeId: employee.id, leaveType: "Permission", startDate: "2026-08-12", endDate: "2026-08-12", permissionStartTime: "10:00", permissionEndTime: "11:00", reason: "QA permission" }, 201);
  assert.equal(Number(permission.permissionHours), 1);
  await request(admin, "/crew/leaves", "POST", { employeeId: employee.id, leaveType: "Permission", startDate: "2026-08-13", endDate: "2026-08-13", permissionStartTime: "10:00", permissionEndTime: "12:00" }, 400);
  pass("Hourly permission requests use hour balances rather than daily leave validation");
  const reopened: Client = { cookies: crew.cookies };
  const restored = await request(reopened, "/auth/refresh", "POST"); reopened.token = restored.accessToken;
  assert.equal((await request(reopened, "/auth/me")).username, "audit_crew");
  const refreshValue = reopened.cookies!.split("; ").find(entry => entry.startsWith("refreshToken="))!.slice("refreshToken=".length);
  const claims = JSON.parse(Buffer.from(refreshValue.split(".")[1], "base64url").toString());
  assert.ok(claims.exp - claims.iat <= 259200 && claims.exp - claims.iat > 259100);
  await request(reopened, "/auth/logout", "POST"); await request(reopened, "/auth/refresh", "POST", undefined, 401);
  pass("Cookie-only restoration, 72-hour refresh expiry, explicit logout revocation");
  console.log(`AUDIT COMPLETE: ${passed} groups passed. Isolated database retained: ${database}`);
} finally {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await mongoose.disconnect();
}
