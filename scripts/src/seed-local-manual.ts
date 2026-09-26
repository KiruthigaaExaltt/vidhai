/** Additive local manual-QA data. Never use a staging/production environment file. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI || "";
const target = new URL(uri);
assert.equal(target.protocol, "mongodb:");
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname),
  "Local MongoDB only",
);
assert.equal(
  target.pathname,
  "/vidhaiic",
  "This seed targets only the local vidhaiic database",
);
assert.notEqual(process.env.NODE_ENV, "production");
process.env.VIDHAI_SEED_VOLUME = "40";
const root = path.resolve(import.meta.dirname, "../..");
const stateDir = path.join(root, "tmp/local-manual-seed");
await fs.mkdir(stateDir, { recursive: true });
// A saved manifest makes reruns harmless and detects interrupted imports.
const stateFile = path.join(stateDir, "state.json");
let state: any = await fs
  .readFile(stateFile, "utf8")
  .then(JSON.parse)
  .catch(() => null);
const s = await import("@workspace/db");
const { db, eq } = s;
const rows = (t: any) => db.select().from(t);
const insert = async (t: any, data: any) =>
  (await db.insert(t).values(data).returning())[0];
const ensure = async (t: any, key: string, value: any, data: any) =>
  (await db.select().from(t).where(eq(t[key], value)).limit(1))[0] ||
  insert(t, { ...data, [key]: value });
const save = () => fs.writeFile(stateFile, JSON.stringify(state, null, 2));
const prefix = "LOCAL-QA";
const now = new Date();
const month = now.toISOString().slice(0, 7);
const prior = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
);
const priorMonth = prior.toISOString().slice(0, 7);
const year = prior.getUTCFullYear();
const day = (n: number) => `${priorMonth}-${String(n).padStart(2, "0")}`;

try {
  if (!state) {
    const existing = await rows(s.employeesTable);
    assert.ok(
      !existing.some((e) => String(e.employeeCode).startsWith("MF-")),
      "Existing MF dataset found; refusing to replace it",
    );
    // BSON Extended JSON retains decimals/dates for a private local backup.
    const backup: Record<string, unknown> = {};
    for (const c of await mongoose.connection.db!.listCollections().toArray())
      backup[c.name] = await mongoose.connection
        .db!.collection(c.name)
        .find()
        .toArray();
    await fs.writeFile(
      path.join(stateDir, "before-seed.ejson"),
      mongoose.mongo.BSON.EJSON.stringify(backup),
    );
    state = {
      database: "vidhaiic",
      createdAt: now.toISOString(),
      phase: "starting",
      priorMonth,
      month,
    };
    await save();
    const { seedProductionDataset } =
      await import("./mushroom-production-data");
    await seedProductionDataset({ preserveExisting: true });
    state.phase = "broad-seeded";
    await save();
  }
  assert.notEqual(
    state.phase,
    "starting",
    "Interrupted broad import: inspect the backup and partial MF records before resuming",
  );
  if (state.phase !== "complete") {
    assert.equal(
      state.month,
      month,
      "Resume the partial seed in its original month",
    );
    const templates: any[] = [];
    for (let i = 0; i < 10; i++) {
      const name = `${prefix}-${String(i + 1).padStart(2, "0")}`;
      const attendance = await ensure(
        s.attendanceTemplatesTable,
        "templateName",
        `${name} ${["Salary fine", "Fixed fine", "Percentage fine", "Flexible shift", "No buffer"][i % 5]}`,
        {
          workStartTime: "09:00",
          workEndTime: "18:00",
          totalWorkingHours: "9",
          breakHours: "0",
          workHours: "9",
          flexibleHours: i % 5 === 3,
          bufferTime: i % 5 !== 4,
          bufferMinutes: 15,
          fineType: [
            "based_on_salary",
            "fixed_per_hour",
            "percent_hourly_basis",
          ][i % 3],
          finePerHour: String(i % 3 === 1 ? 75 : i % 3 === 2 ? 50 : 0),
        },
      );
      const pattern = await ensure(
        s.workPatternTemplatesTable,
        "templateName",
        `${name} Work week`,
        Object.fromEntries(
          [1, 2, 3, 4, 5].map((w) => [
            `week${w}OffDays`,
            JSON.stringify(
              i % 3 === 0 ? [0, 6] : i % 3 === 1 && w % 2 === 0 ? [0, 6] : [0],
            ),
          ]),
        ),
      );
      const holiday = await ensure(
        s.holidayTemplatesTable,
        "templateName",
        `${name} Holidays`,
        {
          effectiveYear: year,
          effectiveFrom: `${year}-01-01`,
          holidays: JSON.stringify([
            { name: "QA holiday", date: day(15) },
            { name: "QA second holiday", date: day(26) },
          ]),
        },
      );
      const leave = await ensure(
        s.leaveTemplatesTable,
        "templateName",
        `${name} Leave policy`,
        {
          totalSickLeaves: 6 + i,
          totalCasualLeaves: 6 + i,
          earnedLeave: 12,
          maxSickLeavesPerMonth: 2,
          maxCasualLeavesPerMonth: 2,
          maxEarnedLeavesPerMonth: 3,
          totalPermissionHours: 24,
          maxPermissionHoursPerMonth: 4,
          carryForwardEnabled: i % 2 === 0,
        },
      );
      const salary = await ensure(
        s.salaryTemplatesTable,
        "templateName",
        `${name} Salary structure`,
        {
          description:
            "Local manual QA: percentage, dependent percentage, fixed and residual",
          components: JSON.stringify([
            {
              id: "basic",
              name: "Basic",
              calculationType: "percentage_of_ctc",
              value: 50,
              order: 1,
              includeInPfWage: true,
              includeInEsiWage: true,
            },
            {
              id: "hra",
              name: "HRA",
              calculationType: "percentage_of_component",
              referenceComponentId: "basic",
              value: 40,
              order: 2,
              includeInEsiWage: true,
            },
            {
              id: "travel",
              name: "Travel",
              calculationType: "fixed",
              value: 500 + i * 50,
              order: 3,
              includeInEsiWage: true,
            },
            {
              id: "special",
              name: "Special allowance",
              calculationType: "residual",
              order: 4,
              includeInEsiWage: true,
            },
          ]),
        },
      );
      templates.push({ attendance, pattern, holiday, leave, salary });
      await ensure(
        s.workOrderTemplatesTable,
        "name",
        `${name} Packing workflow`,
        {
          taskSteps: [
            "Inspect quality",
            "Weigh produce",
            "Pack and label",
            "Dispatch",
          ],
          materialRequirements: [],
        },
      );
      await ensure(
        s.servicesTable,
        "name",
        `${name} ${["Cold storage", "Transport", "Quality inspection", "Packing", "Equipment service"][i % 5]}`,
        {
          description: prefix,
          sellingPrice: String(250 + i * 50),
          unit: "service",
          isActive: true,
        },
      );
      await ensure(s.departmentsTable, "name", `${name} Department`, {
        organizationId: 1,
        description: prefix,
        status: i === 9 ? "Inactive" : "Active",
      });
      await ensure(s.rolesTable, "slug", `local_qa_${i + 1}`, {
        name: `${name} Role`,
        description: prefix,
        permissions: JSON.stringify({
          view: ["cross_site"],
          create: i % 2 ? ["cross_site"] : [],
          approve: [],
          delete: [],
        }),
        isActive: true,
      });
      await ensure(s.chartOfAccountsTable, "accountCode", `QA-${i + 1}`, {
        accountName: `${name} Expense`,
        accountType: "Expense",
        description: prefix,
        isActive: true,
      });
      await ensure(s.alertColorsTable, "name", `${name} Alert`, {
        hexColor: ["#16A34A", "#F59E0B", "#DC2626"][i % 3],
        condition: `Manual QA threshold ${i + 1}`,
        description: prefix,
        sortOrder: 10 + i,
      });
    }
    const staff = (await rows(s.employeesTable)).filter((e) =>
      String(e.employeeCode).startsWith("MF-"),
    );
    const { hashPassword } =
      await import("../../artifacts/api-server/src/lib/password");
    const passwordHash = await hashPassword("LocalQA!2026");
    const admin = (await rows(s.usersTable)).find(
      (u) => u.systemKey === "SUPER_ADMIN",
    )!;
    const { refreshAttendancePayroll } =
      await import("../../artifacts/api-server/src/routes/crewpay");
    for (let i = 0; i < staff.length; i++) {
      const e = staff[i],
        t = templates[i % 10];
      const baseSalary = 18000 + i * 500;
      const changes = {
        name: String(e.name).startsWith("Local QA")
          ? e.name
          : `Local QA ${String(i + 1).padStart(2, "0")} ${e.name}`,
        baseSalary: String(baseSalary),
        annualCtc: String(baseSalary * 12),
        isSystemGenerated: false,
        status: i === 39 ? "Inactive" : "Active",
        attendanceRulesTemplate: t.attendance.id,
        workPatternTemplate: t.pattern.id,
        holidayTemplate: t.holiday.id,
        leaveTemplate: t.leave.id,
        salaryTemplateId: t.salary.id,
        statutoryContributions: JSON.stringify({
          pfEnabled: i % 3 === 0,
          esiEnabled: i % 4 === 0,
        }),
        fixedComponentValues: JSON.stringify({ travel: 500 + (i % 10) * 50 }),
      };
      if (!String(e.name).startsWith("Local QA"))
        await db
          .update(s.employeesTable)
          .set(changes)
          .where(eq(s.employeesTable.id, e.id));
      const employee = { ...e, ...changes };
      if (e.userId)
        await db
          .update(s.usersTable)
          .set({
            passwordHash,
            isSystemGenerated: false,
            displayName: employee.name,
            name: employee.name,
          })
          .where(eq(s.usersTable.id, e.userId));
      for (
        let n = 1;
        n <= new Date(year, prior.getUTCMonth() + 1, 0).getDate();
        n++
      ) {
        const date = day(n),
          weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        const off = JSON.parse(
          t.pattern[`week${Math.min(5, Math.ceil(n / 7))}OffDays`],
        ).includes(weekday);
        if (off || [15, 26].includes(n)) continue;
        const scenario = (n + i) % 12;
        const status =
          scenario === 0
            ? "Absent"
            : scenario === 1
              ? "Half Day"
              : scenario === 2
                ? "Late"
                : scenario === 3
                  ? "WFH"
                  : "Present";
        await ensure(
          s.attendanceLogsTable,
          "notes",
          `${prefix}:${e.id}:${date}`,
          {
            employeeId: e.id,
            employeeName: employee.name,
            employeeCode: e.employeeCode,
            department: e.department,
            designation: e.designation,
            attendanceDate: date,
            status,
            approvalStatus:
              scenario === 4
                ? "Pending"
                : scenario === 5
                  ? "Rejected"
                  : "Approved",
            locked: true,
            checkInTime:
              status === "Absent" ? null : scenario === 2 ? "09:45" : "09:00",
            checkOutTime:
              status === "Absent"
                ? null
                : scenario === 1
                  ? "13:30"
                  : scenario === 6
                    ? "17:00"
                    : "18:00",
            timezone: "Asia/Kolkata",
          },
        );
      }
      // Historical approved/rejected/pending claims, permission and half-day leave.
      for (const [k, claimType] of ["reimbursement", "allowance"].entries())
        await ensure(
          s.crewClaimsTable,
          "notes",
          `${prefix}:${e.id}:${claimType}`,
          {
            employeeId: e.id,
            employeeName: employee.name,
            claimType,
            amount: String(250 + i * 10),
            title: `${prefix} ${claimType}`,
            attendanceDate: day(12 + k),
            payrollMonth: priorMonth,
            status: ["Pending", "Approved", "Rejected"][i % 3],
          },
        );
      await ensure(
        s.leaveRequestsTable,
        "reason",
        `${prefix}:${e.id}:permission`,
        {
          employeeId: e.id,
          employeeName: employee.name,
          leaveType: "Permission",
          startDate: day(18),
          endDate: day(18),
          fromSession: 1,
          toSession: 2,
          permissionStartTime: "09:00",
          permissionEndTime: "10:00",
          permissionHours: "1",
          requestedDays: "0",
          status: ["Pending", "Approved", "Rejected"][i % 3],
        },
      );
      await ensure(
        s.leaveRequestsTable,
        "reason",
        `${prefix}:${e.id}:halfday`,
        {
          employeeId: e.id,
          employeeName: employee.name,
          leaveType: "Casual",
          startDate: day(19),
          endDate: day(19),
          fromSession: 1,
          toSession: 1,
          requestedDays: "0.5",
          status: ["Approved", "Rejected", "Pending"][i % 3],
        },
      );
      for (const d of (await rows(s.crewDeductionsTable)).filter(
        (r) =>
          r.employeeId === e.id &&
          r.notes === "Routine mushroom farm operational record",
      ))
        await db
          .update(s.crewDeductionsTable)
          .set({
            month: now.getUTCMonth(),
            source: "manual",
            autoReason: null,
            autoApproved: false,
          })
          .where(eq(s.crewDeductionsTable.id, d.id));
      for (const claim of (await rows(s.crewClaimsTable)).filter(
        (r) => r.employeeId === e.id && r.claimType === "overtime",
      ))
        await db
          .update(s.crewClaimsTable)
          .set({
            amount: String(
              Math.round(
                (baseSalary /
                  (new Date(
                    now.getUTCFullYear(),
                    now.getUTCMonth() + 1,
                    0,
                  ).getDate() *
                    9)) *
                  Number(claim.requestedHours) *
                  100,
              ) / 100,
            ),
          })
          .where(eq(s.crewClaimsTable.id, claim.id));
      // Only this run's MF payroll placeholders are unlocked and recomputed.
      for (const p of (await rows(s.payrollTable)).filter(
        (r) => r.employeeId === e.id,
      ))
        await db
          .update(s.payrollTable)
          .set({ status: "Processing" })
          .where(eq(s.payrollTable.id, p.id));
      await refreshAttendancePayroll(1, e.id, priorMonth, admin);
      await refreshAttendancePayroll(1, e.id, month, admin);
    }
    for (const c of (await rows(s.contactsTable)).filter(
      (r) => r.notes === "Routine mushroom farm operational record",
    ))
      await db
        .update(s.contactsTable)
        .set({
          phone: String(c.phone).slice(-10),
          whatsappNumber: String(c.whatsappNumber).slice(-10),
        })
        .where(eq(s.contactsTable.id, c.id));
    const users = (await rows(s.usersTable)).filter((u) =>
      String(u.systemKey).startsWith("MUSHROOM_SEED_USER_"),
    );
    await fs.writeFile(
      path.join(stateDir, "logins.json"),
      JSON.stringify(
        {
          password: "LocalQA!2026",
          users: users.map((u) => ({
            username: u.username,
            role: u.role,
            employeeId: u.employeeId,
          })),
        },
        null,
        2,
      ),
    );
    state.phase = "complete";
    await save();
  }
  if (!state.extrasComplete) {
    const { seedLocalExtras } = await import("./local-manual-extras");
    await seedLocalExtras();
    state.extrasComplete = true;
    await save();
  }
  if (!state.ledgerReady) {
    const { hashPassword } =
      await import("../../artifacts/api-server/src/lib/password");
    const existing = (await rows(s.moduleEncryptionSettingsTable)).find(
      (r) => r.organizationId === 1 && r.moduleKey === "ledger",
    );
    if (!existing) {
      await insert(s.moduleEncryptionSettingsTable, {
        organizationId: 1,
        moduleKey: "ledger",
        passwordHash: await hashPassword("QA2026"),
        passwordUpdatedAt: new Date(),
      });
      state.ledgerPassword = "QA2026";
    }
    state.ledgerReady = true;
    await save();
  }
  if (!state.detailsComplete) {
    const { seedLocalDetails } = await import("./local-manual-details");
    await seedLocalDetails();
    state.detailsComplete = true;
    await save();
  }
  if (!state.payrollCasesComplete) {
    const admin = (await rows(s.usersTable)).find(
      (u) => u.systemKey === "SUPER_ADMIN",
    )!;
    const staff = (await rows(s.employeesTable)).filter((e) =>
      String(e.employeeCode).startsWith("MF-"),
    );
    const { refreshAttendancePayroll } =
      await import("../../artifacts/api-server/src/routes/crewpay");
    for (const e of staff.slice(0, 10)) {
      const historical = (await rows(s.payrollTable)).find(
        (p) => p.employeeId === e.id && p.payPeriod === state.priorMonth,
      );
      if (historical?.status !== "Paid")
        await refreshAttendancePayroll(1, e.id, state.priorMonth, admin);
      await refreshAttendancePayroll(1, e.id, state.month, admin);
    }
    await db
      .update(s.employeesTable)
      .set({ status: "On Leave" })
      .where(eq(s.employeesTable.id, staff[38].id));
    await db
      .update(s.employeesTable)
      .set({ status: "Offboarded", exitDate: `${state.month}-15` })
      .where(eq(s.employeesTable.id, staff[39].id));
    await refreshAttendancePayroll(1, staff[39].id, state.month, admin);
    const payroll = await rows(s.payrollTable);
    for (const [i, e] of staff.slice(0, 20).entries()) {
      const row = payroll.find(
        (p) => p.employeeId === e.id && p.payPeriod === state.priorMonth,
      )!;
      await db
        .update(s.payrollTable)
        .set({
          status: i < 10 ? "Paid" : "Processed",
          processedBy: admin.id,
          processedAt: new Date(),
          ...(i < 10 ? { paidBy: admin.id, paidAt: new Date() } : {}),
        })
        .where(eq(s.payrollTable.id, row.id));
    }
    state.payrollCasesComplete = true;
    await save();
  }
  if (!state.selectionValuesChecked) {
    for (const e of (await rows(s.employeesTable)).filter(
      (e) =>
        String(e.employeeCode).startsWith("MF-") &&
        e.employmentType === "Permanent",
    ))
      await db
        .update(s.employeesTable)
        .set({ employmentType: "Full-time" })
        .where(eq(s.employeesTable.id, e.id));
    for (const source of (await rows(s.casingSoilInventorySourcesTable)).filter(
      (r) =>
        String(r.sourceKey).startsWith("LOCAL-QA") &&
        r.sourceType === "external",
    ))
      await db
        .update(s.casingSoilInventorySourcesTable)
        .set({ sourceType: "purchased" })
        .where(eq(s.casingSoilInventorySourcesTable.id, source.id));
    state.selectionValuesChecked = true;
    await save();
  }
  const counts: Record<string, number> = {};
  for (const t of s.listMongoTables()) counts[t.$name] = await db.count(t);
  await fs.writeFile(
    path.join(root, "docs/qa/local-seed-counts.json"),
    JSON.stringify(
      {
        database: "vidhaiic",
        month: state.month,
        priorMonth: state.priorMonth,
        counts,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ phase: state.phase, counts }, null, 2));
} finally {
  await mongoose.disconnect();
}
