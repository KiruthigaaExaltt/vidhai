/** Isolated punch / employment-status regression audit. Never connects to the app database. */
import assert from "node:assert/strict";
import { randomBytes, publicEncrypt, constants } from "node:crypto";
import mongoose from "mongoose";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const database = `vidhai_punch_audit_${Date.now()}`;
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
process.env.UPLOAD_ROOT = await mkdtemp(path.join(tmpdir(), "vidhai-punch-audit-"));
const photoDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const location = { latitude: 11.0168, longitude: 76.9558, address: "QA address Coimbatore" };

const { default: app } = await import("../../artifacts/api-server/src/app");
const { db, eq, usersTable, rolesTable, employeesTable } = await import("@workspace/db");
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const shift = (days: number) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

const results: { name: string; ok: boolean; detail?: string }[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ name, ok: true }); console.log(`PASS ${name}`); }
  catch (error: any) { results.push({ name, ok: false, detail: error.message }); console.log(`FAIL ${name}\n     ${error.message.split("\n")[0]}`); }
}
type Client = { token?: string };
async function request(client: Client, path: string, method = "GET", body?: any) {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(client.token ? { Authorization: `Bearer ${client.token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
}
async function ok(client: Client, path: string, method = "GET", body?: any, expected = 200) {
  const { status, data } = await request(client, path, method, body);
  assert.equal(status, expected, `${method} ${path} -> ${status}: ${JSON.stringify(data)}`);
  return data;
}
async function login(username: string, password: string) {
  const client: Client = {};
  const { publicKey } = await ok(client, "/auth/login-key");
  const encrypted = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(password)).toString("base64");
  client.token = (await ok(client, "/auth/login", "POST", { username, password: encrypted, passwordEncoding: "rsa-oaep-256" })).accessToken;
  return client;
}

try {
  const admin = await login("audit_admin", process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  // ── Dummy master data: templates (no week-offs/holidays so today is a working day) ──
  const attendance = await ok(admin, "/attendance-templates", "POST", { templateName: "General shift", workStartTime: "09:30", workEndTime: "18:30", fineType: "based_on_salary", finePerHour: 0 }, 201);
  const pattern = await ok(admin, "/work-pattern-templates", "POST", { templateName: "All days", ...Object.fromEntries([1, 2, 3, 4, 5].map((w) => [`week${w}OffDays`, []])) }, 201);
  const leave = await ok(admin, "/leave-templates", "POST", { templateName: "Standard leave", totalSickLeaves: 6, totalCasualLeaves: 6, maxSickLeavesPerMonth: 1, maxCasualLeavesPerMonth: 1 }, 201);
  const salary = await ok(admin, "/salary-templates", "POST", { templateName: "Standard salary", components: [{ id: "basic", name: "Basic", calculationType: "fixed", value: "20000", order: 1 }] }, 201);
  const holiday = await ok(admin, "/holiday-templates", "POST", { templateName: "No holidays", effectiveYear: Number(today.slice(0, 4)), effectiveFrom: `${today.slice(0, 4)}-01-01`, holidays: [] }, 201);

  // ── Dummy roles: a crew role with NO permissions at all, and a supervisor role ──
  await db.insert(rolesTable).values({ name: "Field Crew", slug: "field_crew", permissions: JSON.stringify([]) });
  await db.insert(rolesTable).values({ name: "Supervisor", slug: "supervisor", permissions: JSON.stringify(["crew.attendance.view", "crew.attendance.approve", "crew.attendance.for_others"]) });

  // ── Dummy members, each linked to a user (same path as Settings → Users → Add) ──
  let seq = 0;
  async function member(name: string, extra: Record<string, any> = {}) {
    seq++;
    const [employee] = await db.insert(employeesTable).values({
      name, employeeCode: `QA-${seq}`, email: `qa${seq}@example.com`, role: "Field Crew", designation: "Worker", department: "Farm",
      employmentType: "Full Time", workMode: "On-site", location: "Farm", status: "Active", joinDate: shift(-30),
      baseSalary: "20000", annualCtc: "240000", attendanceRulesTemplate: attendance.id, workPatternTemplate: pattern.id,
      leaveTemplate: leave.id, salaryTemplateId: salary.id, holidayTemplate: holiday.id, ...extra,
    }).returning();
    const username = `qa_member_${seq}`;
    const user = await ok(admin, "/users", "POST", { username, name, role: "Field Crew", employeeId: employee.id }, 201);
    return { employee, user, username, password: user.temporaryPassword as string };
  }
  const employeeRow = async (id: number) => (await db.select().from(employeesTable).where(eq(employeesTable.id, id)))[0];
  const userRow = async (id: number) => (await db.select().from(usersTable).where(eq(usersTable.id, id)))[0];
  const todayStatus = async (client: Client) => (await ok(client, "/crew/attendance/self")).logs.find((l: any) => l.attendanceDate === today)?.status;
  const punchIn = (client: Client, employeeId: number) => request(client, "/crew/attendance", "POST", { employeeId, punchAction: "punchIn", photoDataUrl, location });

  // 1. Original question: does punch need any Roles permission?
  await check("1. Crew member whose role has ZERO permissions can punch in and out", async () => {
    const m = await member("Ravi (no permissions)");
    const c = await login(m.username, m.password);
    assert.equal(await todayStatus(c), "Absent");
    const inRes = await punchIn(c, m.employee.id);
    assert.equal(inRes.status, 201, JSON.stringify(inRes.data));
    const out = await request(c, `/crew/attendance/${inRes.data.id}`, "PATCH", { punchAction: "punchOut", photoDataUrl, location });
    assert.equal(out.status, 200, JSON.stringify(out.data));
  });
  await check("1b. Crew member cannot punch for someone else", async () => {
    const a = await member("Kumar"), b = await member("Latha");
    const c = await login(a.username, a.password);
    assert.equal((await punchIn(c, b.employee.id)).status, 403);
  });

  // 2. Role drift: role set in Users must survive an unrelated employee edit.
  await check("2. Role given in Users is NOT reverted by a later Crew employee edit", async () => {
    const m = await member("Selvi");
    await ok(admin, `/users/${m.user.id}`, "PATCH", { role: "Supervisor" });
    const form = await employeeRow(m.employee.id); // the edit form re-sends the stored employee role
    await ok(admin, `/crew/employees/${m.employee.id}`, "PUT", { role: form.role, phone: "9876543210" });
    assert.equal((await userRow(m.user.id)).role, "Supervisor", "user role was reset by the employee save");
  });
  await check("2b. Changing Role on the employee form still updates the user", async () => {
    const m = await member("Arun");
    await ok(admin, `/crew/employees/${m.employee.id}`, "PUT", { role: "Supervisor" });
    assert.equal((await userRow(m.user.id)).role, "Supervisor");
  });

  // 3. Users → Deactivate then Activate.
  await check("3. Deactivate stores a plain YYYY-MM-DD exit date", async () => {
    const m = await member("Murugan");
    await ok(admin, `/users/${m.user.id}/deactivate`, "PATCH");
    const exitDate = (await employeeRow(m.employee.id)).exitDate;
    assert.match(String(exitDate), /^\d{4}-\d{2}-\d{2}$/, `exitDate stored as ${JSON.stringify(exitDate)}`);
  });
  await check("3b. Deactivate → Activate restores status 'Active' and member can punch", async () => {
    const m = await member("Priya");
    await ok(admin, `/users/${m.user.id}/deactivate`, "PATCH");
    await ok(admin, `/users/${m.user.id}/activate`, "PATCH", { restoreEmployee: true });
    const e = await employeeRow(m.employee.id);
    assert.equal(e.status, "Active");
    const c = await login(m.username, m.password);
    assert.notEqual(await todayStatus(c), "Not Employed");
    const res = await punchIn(c, m.employee.id);
    assert.equal(res.status, 201, JSON.stringify(res.data));
  });

  // 4. Crew: Offboarded → back to Active (the edit form re-sends the old exit date).
  await check("4. Offboarded → Active in Crew clears the old exit date and member can punch", async () => {
    const m = await member("Ganesh");
    await ok(admin, `/crew/employees/${m.employee.id}`, "PUT", { status: "Offboarded", exitDate: shift(-5) });
    await ok(admin, `/crew/employees/${m.employee.id}`, "PUT", { status: "Active", exitDate: shift(-5) });
    const c = await login(m.username, m.password);
    assert.notEqual(await todayStatus(c), "Not Employed");
    const res = await punchIn(c, m.employee.id);
    assert.equal(res.status, 201, JSON.stringify(res.data));
  });

  // 5. Existing bad data already on the client's server (no DB clean-up).
  await check("5. Active member with legacy timestamp exit date (old bug data) can punch", async () => {
    const m = await member("Deepa", { exitDate: `${shift(-3)}T10:15:00.000+05:30` });
    const c = await login(m.username, m.password);
    assert.notEqual(await todayStatus(c), "Not Employed");
    const res = await punchIn(c, m.employee.id);
    assert.equal(res.status, 201, JSON.stringify(res.data));
  });

  // 6. Legitimate Not Employed cases must still block.
  await check("6. Future join date still shows Not Employed and blocks punch (expected)", async () => {
    const m = await member("Future Joiner", { joinDate: shift(10) });
    const c = await login(m.username, m.password);
    assert.equal(await todayStatus(c), "Not Employed");
    assert.equal((await punchIn(c, m.employee.id)).status, 403);
  });
  await check("6b. Invalid join date on employee edit is rejected", async () => {
    const m = await member("Bad Date");
    assert.equal((await request(admin, `/crew/employees/${m.employee.id}`, "PUT", { joinDate: "05/10/2026" })).status, 400);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULT: ${results.length - failed.length}/${results.length} passed. Isolated database: ${database}`);
  process.exitCode = failed.length ? 1 : 0;
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
}
