import { Router } from "express";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import {
  and,
  asc,
  db,
  desc,
  eq,
  usersTable,
  attendanceTemplatesTable,
  workPatternTemplatesTable,
  holidayTemplatesTable,
  leaveTemplatesTable,
  salaryTemplatesTable,
} from "@workspace/db";
import {
  employeesTable,
  attendanceLogsTable,
  leaveRequestsTable,
  crewClaimsTable,
  crewDeductionsTable,
  crewAuditLogsTable,
} from "@workspace/db";
import { effectivePermissions, getAuthUser } from "../lib/access";

const router = Router();
const json = (v: any, f: any = []) => {
  try {
    return typeof v === "string" ? JSON.parse(v) : (v ?? f);
  } catch {
    return f;
  }
};
const iso = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const employeePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Employee photo must be JPG, JPEG, PNG or WEBP")),
});
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const phone = (v: any) => String(v ?? "").replace(/\D/g, ""),
  nullable = (v: any) => {
    const s = String(v ?? "").trim();
    return s || null;
  },
  tags = (v: any) => [
    ...new Set(
      (Array.isArray(v) ? v : String(v ?? "").split(","))
        .map((x: any) => String(x).trim())
        .filter(Boolean),
    ),
  ];
async function saveEmployeePhoto(file?: Express.Multer.File) {
  if (!file) return null;
  const ext =
      file.mimetype === "image/png"
        ? "png"
        : file.mimetype === "image/webp"
          ? "webp"
          : "jpg",
    dir = path.resolve(process.cwd(), "uploads", "crew", "employees");
  await mkdir(dir, { recursive: true });
  const full = path.join(dir, `${Date.now()}-${randomUUID()}.${ext}`);
  await writeFile(full, file.buffer);
  return { full, url: `/api/crew/files/employees/${path.basename(full)}` };
}
async function context(req: any, res: any, next: any) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  req.crew = {
    user,
    permissions: await effectivePermissions(user),
    org: Number(user.organizationId ?? 1),
  };
  next();
}
router.use(context);
router.get("/files/:folder/:file", async (req: any, res: any): Promise<any> => {
  if (
    !["employees", "attendance", "claims"].includes(req.params.folder) ||
    !req.crew.permissions.some(
      (p: string) => p === "*" || p.startsWith("crew."),
    )
  )
    return res.status(403).json({ error: "Crew file access denied" });
  const file = path.basename(req.params.file);
  return res.sendFile(
    path.resolve(process.cwd(), "uploads", "crew", req.params.folder, file),
    { dotfiles: "deny" },
  );
});
const can = (req: any, key: string) =>
  req.crew.permissions.includes("*") || req.crew.permissions.includes(key);
function need(req: any, res: any, key: string) {
  if (can(req, key)) return true;
  res.status(403).json({ error: `Missing permission: ${key}` });
  return false;
}
async function ownEmployee(req: any) {
  const uid = Number(req.crew.user.id);
  const rows = await db
    .select()
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.organizationId, req.crew.org),
        eq(employeesTable.userId, uid),
      ),
    );
  return rows.find((e: any) => !e.isDeleted) || null;
}
async function scopedEmployee(req: any, res: any, id: number, sub: string) {
  const [e] = await db
    .select()
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, id),
        eq(employeesTable.organizationId, req.crew.org),
      ),
    );
  if (!e || e.isDeleted) {
    res.status(404).json({ error: "Employee not found" });
    return null;
  }
  if (can(req, `crew.${sub}.forOthers`)) return e;
  const own = await ownEmployee(req);
  if (can(req, `crew.${sub}.forOwn`) && own?.id === e.id) return e;
  res.status(403).json({ error: "Employee is outside your permitted scope" });
  return null;
}
async function scopedRows(req: any, rows: any[], sub: string) {
  if (can(req, `crew.${sub}.forOthers`)) return rows;
  if (!can(req, `crew.${sub}.forOwn`)) return [];
  const own = await ownEmployee(req);
  return own
    ? rows.filter((r) => Number(r.employeeId ?? r.id) === Number(own.id))
    : [];
}
async function audit(
  req: any,
  type: string,
  id: number,
  name: string,
  action: string,
  before: any,
  after: any,
) {
  try {
    await db.insert(crewAuditLogsTable).values({
      organizationId: req.crew.org,
      module: "crew",
      entityType: type,
      entityId: id,
      recordName: name,
      action,
      actorUserId: req.crew.user.id,
      actorName: req.crew.user.displayName,
      beforeValues: JSON.stringify(before ?? null),
      afterValues: JSON.stringify(after ?? null),
      updatedAt: new Date(),
    });
  } catch {}
}
async function saveDataUrl(value: any, folder: string) {
  if (!value || typeof value !== "string" || !value.startsWith("data:"))
    return value || null;
  const m = value.match(/^data:([\w/+.-]+);base64,(.+)$/s);
  if (!m) throw new Error("Invalid uploaded file");
  const ext = m[1].includes("png")
    ? "png"
    : m[1].includes("pdf")
      ? "pdf"
      : m[1].includes("webp")
        ? "webp"
        : "jpg";
  const dir = path.resolve(process.cwd(), "uploads", "crew", folder);
  await mkdir(dir, { recursive: true });
  const file = `${Date.now()}-${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, file), Buffer.from(m[2], "base64"));
  return `/api/crew/files/${folder}/${file}`;
}

router.get("/employees", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.employees.view")) return;
  let rows = (
    await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, req.crew.org))
      .orderBy(asc(employeesTable.name))
  ).filter((x: any) => !x.isDeleted);
  rows = await scopedRows(req, rows, "employees");
  const q = String(req.query.search || "").toLowerCase(),
    status = String(req.query.status || "");
  if (q)
    rows = rows.filter((x: any) =>
      `${x.name} ${x.role} ${x.department} ${x.employeeCode}`
        .toLowerCase()
        .includes(q),
    );
  if (status && status !== "All")
    rows = rows.filter((x: any) =>
      status === "System"
        ? x.systemKey || x.isSystemGenerated
        : x.status === status,
    );
  const total = rows.length,
    skip = Math.max(0, Number(req.query.skip || 0)),
    limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  res.json({
    data: rows.slice(skip, skip + limit).map((x: any) => ({
      ...x,
      skills: json(x.skills),
      certifications: json(x.certifications),
    })),
    total,
    skip,
    limit,
  });
});
router.get("/employees/next-code", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.employees.view")) return;
  const rows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, req.crew.org));
  const n =
    rows.reduce(
      (m: any, x: any) =>
        Math.max(
          m,
          Number(String(x.employeeCode || "").match(/\d+/)?.[0] || 0),
        ),
      0,
    ) + 1;
  res.json({ employeeCode: `EMP${String(n).padStart(4, "0")}` });
});
router.get(
  "/employees/form-options",
  async (req: any, res: any): Promise<any> => {
    if (
      !need(req, res, "crew.employees.create") ||
      !need(req, res, "crew.employees.forOthers")
    )
      return;
    const org = req.crew.org,
      employees = (
        await db
          .select()
          .from(employeesTable)
          .where(eq(employeesTable.organizationId, org))
      ).filter((e: any) => !e.isDeleted),
      linked = new Set(
        employees.map((e: any) => Number(e.userId)).filter(Boolean),
      );
    const users = (
      await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.organizationId, org))
    )
      .filter((u: any) => !u.isDeleted && !linked.has(Number(u.id)))
      .map((u: any) => ({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        username: u.username,
      }));
    const active = async (table: any) =>
      (
        await db.select().from(table).where(eq(table.organizationId, org))
      ).filter((x: any) => x.isActive !== false);
    const holidays = await active(holidayTemplatesTable);
    return res.json({
      users,
      attendance: await active(attendanceTemplatesTable),
      workPatterns: await active(workPatternTemplatesTable),
      holidays,
      leave: await active(leaveTemplatesTable),
      salary: await active(salaryTemplatesTable),
    });
  },
);
router.post(
  "/employees",
  employeePhotoUpload.single("employeePhoto"),
  async (req: any, res: any): Promise<any> => {
    if (
      !need(req, res, "crew.employees.create") ||
      !need(req, res, "crew.employees.forOthers")
    )
      return;
    let stored: any = null, createdEmployeeId: number | null = null;
    try {
      const b =
          typeof req.body.employee === "string"
            ? JSON.parse(req.body.employee)
            : req.body,
        org = req.crew.org;
      const required = [
        "name",
        "dateOfBirth",
        "email",
        "phone",
        "emergencyContactRelation",
        "emergencyContactPhone",
        "role",
        "designation",
        "department",
        "employmentType",
        "status",
        "workMode",
        "location",
        "joinDate",
        "attendanceRulesTemplate",
        "workPatternTemplate",
        "holidayTemplate",
        "leaveTemplate",
        "salaryTemplateId",
        "annualCtc",
        "baseSalary",
        "bankName",
        "accountHolderName",
        "accountNumber",
        "ifscCode",
      ];
      for (const key of required)
        if (!String(b[key] ?? "").trim())
          return res.status(400).json({ error: `${key} is required` });
      const v: any = {
        ...b,
        name: String(b.name).trim(),
        email: String(b.email).trim().toLowerCase(),
        phone: phone(b.phone),
        alternatePhone: nullable(phone(b.alternatePhone)),
        emergencyContactPhone: phone(b.emergencyContactPhone),
        panNumber: String(b.panNumber ?? "")
          .trim()
          .toUpperCase(),
        ifscCode: String(b.ifscCode ?? "")
          .trim()
          .toUpperCase(),
        aadhaarNumber: nullable(phone(b.aadhaarNumber)),
        userId: b.userId ? Number(b.userId) : null,
        reportingManager: b.reportingManager
          ? Number(b.reportingManager)
          : null,
        attendanceRulesTemplate: Number(b.attendanceRulesTemplate),
        workPatternTemplate: Number(b.workPatternTemplate),
        holidayTemplate: Number(b.holidayTemplate),
        leaveTemplate: Number(b.leaveTemplate),
        salaryTemplateId: Number(b.salaryTemplateId),
        annualCtc: Number(b.annualCtc),
        baseSalary: Number(b.baseSalary),
        skills: tags(b.skills),
        certifications: tags(b.certifications),
      };
      if (!emailPattern.test(v.email))
        return res.status(400).json({ error: "A valid email is required" });
      if (
        v.phone.length !== 10 ||
        v.emergencyContactPhone.length !== 10 ||
        (v.alternatePhone && v.alternatePhone.length !== 10)
      )
        return res
          .status(400)
          .json({ error: "Phone numbers must contain exactly 10 digits" });
      if (!iso(v.dateOfBirth) || v.dateOfBirth > today())
        return res.status(400).json({
          error: "Date of birth must be valid and cannot be in the future",
        });
      if (
        !iso(v.joinDate) ||
        (v.exitDate && (!iso(v.exitDate) || v.exitDate < v.joinDate)) ||
        (v.status === "Offboarded" && !v.exitDate)
      )
        return res
          .status(400)
          .json({ error: "Valid employment dates are required" });
      if (
        !Number.isFinite(v.annualCtc) ||
        v.annualCtc < 0 ||
        !Number.isFinite(v.baseSalary) ||
        v.baseSalary < 0
      )
        return res
          .status(400)
          .json({ error: "Salary values must be non-negative numbers" });
      if (
        (v.aadhaarNumber && !/^\d{12}$/.test(v.aadhaarNumber)) ||
        (v.panNumber && !panPattern.test(v.panNumber)) ||
        !ifscPattern.test(v.ifscCode)
      )
        return res
          .status(400)
          .json({ error: "Aadhaar, PAN or IFSC format is invalid" });
      const rows = (
        await db
          .select()
          .from(employeesTable)
          .where(eq(employeesTable.organizationId, org))
      ).filter((x: any) => !x.isDeleted);
      let code = String(v.employeeCode || "").trim();
      if (!code) {
        const n =
          rows.reduce(
            (m: any, x: any) =>
              Math.max(
                m,
                Number(String(x.employeeCode || "").match(/\d+/)?.[0] || 0),
              ),
            0,
          ) + 1;
        code = `EMP${String(n).padStart(4, "0")}`;
      }
      if (
        rows.some(
          (x: any) =>
            x.employeeCode === code ||
            String(x.email || "").toLowerCase() === v.email,
        )
      )
        return res
          .status(409)
          .json({ error: "Employee code or email already exists" });
      if (v.userId) {
        const [u] = await db
          .select()
          .from(usersTable)
          .where(
            and(
              eq(usersTable.id, v.userId),
              eq(usersTable.organizationId, org),
            ),
          );
        if (!u || u.isDeleted)
          return res
            .status(400)
            .json({ error: "Selected user is unavailable" });
        if (rows.some((x: any) => Number(x.userId) === v.userId))
          return res
            .status(409)
            .json({ error: "User is already linked to an employee" });
      }
      if (
        v.reportingManager &&
        !rows.some((x: any) => Number(x.id) === v.reportingManager)
      )
        return res
          .status(400)
          .json({ error: "Reporting manager is unavailable" });
      const checks: any[] = [
        [attendanceTemplatesTable, v.attendanceRulesTemplate, "Attendance"],
        [workPatternTemplatesTable, v.workPatternTemplate, "Work pattern"],
        [holidayTemplatesTable, v.holidayTemplate, "Holiday"],
        [leaveTemplatesTable, v.leaveTemplate, "Leave"],
        [salaryTemplatesTable, v.salaryTemplateId, "Salary"],
      ];
      for (const [table, id, label] of checks) {
        const [item] = await db
          .select()
          .from(table)
          .where(and(eq(table.id, id), eq(table.organizationId, org)));
        if (!item || item.isActive === false)
          return res
            .status(400)
            .json({ error: `${label} template is unavailable` });
        if (
          table === holidayTemplatesTable &&
          (Number(item.effectiveYear) < Number(today().slice(0, 4)) ||
            Number(item.effectiveYear) !== Number(v.joinDate.slice(0, 4)))
        )
          return res.status(400).json({
            error:
              "Holiday template is expired or not applicable to the joining year",
          });
      }
      stored = await saveEmployeePhoto(req.file);
      const [row] = await db
        .insert(employeesTable)
        .values({
          ...v,
          id: undefined,
          organizationId: org,
          employeeCode: code,
          annualCtc: String(v.annualCtc),
          baseSalary: String(v.baseSalary),
          skills: JSON.stringify(v.skills),
          certifications: JSON.stringify(v.certifications),
          photoUrl: stored?.url || null,
          isDeleted: false,
          isSystemGenerated: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      createdEmployeeId = Number(row.id);
      if (row.userId)
        await db
          .update(usersTable)
          .set({ employeeId: row.id, employeeName: row.name })
          .where(
            and(
              eq(usersTable.id, row.userId),
              eq(usersTable.organizationId, org),
            ),
          );
      void audit(req, "employee", row.id, row.name, "create", null, row);
      return res.status(201).json(row);
    } catch (e: any) {
      if (stored?.full) await unlink(stored.full).catch(() => {});
      return res
        .status(400)
        .json({ error: e.message || "Unable to create employee" });
    }
  },
);
router.put("/employees/:id", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.employees.update")) return;
  const old = await scopedEmployee(
    req,
    res,
    Number(req.params.id),
    "employees",
  );
  if (!old) return;
  if (old.isSystemGenerated || old.systemKey)
    return res
      .status(403)
      .json({ error: "Protected employee cannot be edited" });
  try {
    const b = { ...req.body };
    if (b.photoDataUrl)
      b.photoUrl = await saveDataUrl(b.photoDataUrl, "employees");
    delete b.photoDataUrl;
    delete b.id;
    delete b.organizationId;
    delete b.employeeCode;
    b.updatedAt = new Date();
    if (b.skills) b.skills = JSON.stringify(b.skills);
    if (b.certifications) b.certifications = JSON.stringify(b.certifications);
    const [row] = await db
      .update(employeesTable)
      .set(b)
      .where(eq(employeesTable.id, old.id))
      .returning();
    if (row.userId)
      await db
        .update(usersTable)
        .set({ employeeId: row.id, employeeName: row.name })
        .where(eq(usersTable.id, row.userId));
    void audit(req, "employee", row.id, row.name, "update", old, row);
    res.json(row);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
router.delete("/employees/:id", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.employees.delete")) return;
  const old = await scopedEmployee(
    req,
    res,
    Number(req.params.id),
    "employees",
  );
  if (!old) return;
  if (old.isSystemGenerated || old.systemKey)
    return res
      .status(403)
      .json({ error: "Protected employee cannot be deleted" });
  await db
    .update(employeesTable)
    .set({
      isDeleted: true,
      status: "Offboarded",
      exitDate: today(),
      updatedAt: new Date(),
    })
    .where(eq(employeesTable.id, old.id));
  if (old.userId)
    await db
      .update(usersTable)
      .set({ employeeId: null, employeeName: null })
      .where(eq(usersTable.id, old.userId));
  void audit(req, "employee", old.id, old.name, "delete", old, null);
  res.status(204).send();
});

router.get("/attendance", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.attendance.view")) return;
  let rows = await db
    .select()
    .from(attendanceLogsTable)
    .where(eq(attendanceLogsTable.organizationId, req.crew.org))
    .orderBy(desc(attendanceLogsTable.attendanceDate));
  rows = await scopedRows(req, rows, "attendance");
  if (req.query.startDate)
    rows = rows.filter(
      (x: any) => x.attendanceDate >= String(req.query.startDate),
    );
  if (req.query.endDate)
    rows = rows.filter(
      (x: any) => x.attendanceDate <= String(req.query.endDate),
    );
  res.json(rows.map((x: any) => ({ ...x, auditLogs: json(x.auditLogs) })));
});
router.post("/attendance", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.attendance.create")) return;
  const employee = await scopedEmployee(
    req,
    res,
    Number(req.body.employeeId),
    "attendance",
  );
  if (!employee) return;
  const date = req.body.attendanceDate || today();
  const existing = (
    await db
      .select()
      .from(attendanceLogsTable)
      .where(
        and(
          eq(attendanceLogsTable.organizationId, req.crew.org),
          eq(attendanceLogsTable.employeeId, employee.id),
        ),
      )
  ).find((x: any) => x.attendanceDate === date);
  if (existing)
    return res
      .status(409)
      .json({ error: "Attendance already exists for this employee and date" });
  try {
    const photo = await saveDataUrl(req.body.photoDataUrl, "attendance");
    if (req.body.punchAction === "punchIn" && !photo)
      return res.status(400).json({ error: "Punch-in photograph is required" });
    const now = new Date(),
      time =
        req.body.checkInTime ||
        now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        });
    let status = req.body.status || "Present";
    const [template] = employee.attendanceRulesTemplate
      ? await db
          .select()
          .from(attendanceTemplatesTable)
          .where(
            eq(attendanceTemplatesTable.id, employee.attendanceRulesTemplate),
          )
      : [];
    if (
      template &&
      time > template.workStartTime &&
      minutes(time) - minutes(template.workStartTime) >
        Number(template.lateThresholdMinutes || 0)
    )
      status = "Late";
    const [row] = await db
      .insert(attendanceLogsTable)
      .values({
        organizationId: req.crew.org,
        employeeId: employee.id,
        employeeName: employee.name,
        employeeCode: employee.employeeCode,
        department: employee.department,
        designation: employee.designation,
        attendanceDate: date,
        status,
        checkInTime: time,
        checkInAtUtc: now,
        timezone: req.body.timezone || "Asia/Kolkata",
        checkInPhoto: photo,
        checkInLocation: JSON.stringify(req.body.location || null),
        notes: req.body.notes,
        auditLogs: JSON.stringify([
          { action: "check-in", actor: req.crew.user.displayName, at: now },
        ]),
        updatedAt: now,
      })
      .returning();
    void audit(req, "attendance", row.id, employee.name, "create", null, row);
    res.status(201).json(row);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
router.patch("/attendance/:id", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.attendance.update")) return;
  const [old] = await db
    .select()
    .from(attendanceLogsTable)
    .where(
      and(
        eq(attendanceLogsTable.id, Number(req.params.id)),
        eq(attendanceLogsTable.organizationId, req.crew.org),
      ),
    );
  if (!old) return res.status(404).json({ error: "Attendance not found" });
  if (!(await scopedEmployee(req, res, old.employeeId, "attendance"))) return;
  try {
    const b: any = { ...req.body, updatedAt: new Date() };
    delete b.employeeId;
    delete b.attendanceDate;
    if (
      (b.checkInTime || b.checkOutTime) &&
      !can(req, "crew.attendance.changeTime") &&
      b.punchAction !== "punchOut"
    )
      return res.status(403).json({
        error: "Manual time changes require crew.attendance.changeTime",
      });
    if (b.punchAction === "punchOut") {
      if (old.checkOutTime)
        return res
          .status(409)
          .json({ error: "Attendance is already punched out" });
      if (!old.checkInTime)
        return res.status(400).json({ error: "Punch-in is required first" });
      const photo = await saveDataUrl(b.photoDataUrl, "attendance");
      if (!photo)
        return res
          .status(400)
          .json({ error: "Punch-out photograph is required" });
      const now = new Date();
      b.checkOutTime =
        b.checkOutTime ||
        now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        });
      if (minutes(b.checkOutTime) < minutes(old.checkInTime))
        return res
          .status(400)
          .json({ error: "Punch-out cannot be earlier than punch-in" });
      b.checkOutAtUtc = now;
      b.checkOutPhoto = photo;
      b.checkOutLocation = JSON.stringify(b.location || null);
    }
    delete b.photoDataUrl;
    delete b.location;
    delete b.punchAction;
    b.auditLogs = JSON.stringify([
      ...json(old.auditLogs),
      {
        action: req.body.punchAction || "manual-edit",
        actor: req.crew.user.displayName,
        at: new Date(),
        reason: req.body.overrideReason,
      },
    ]);
    const [row] = await db
      .update(attendanceLogsTable)
      .set(b)
      .where(eq(attendanceLogsTable.id, old.id))
      .returning();
    void audit(req, "attendance", row.id, row.employeeName, "update", old, row);
    res.json(row);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get(
  "/leaves",
  async (req: any, res: any): Promise<any> =>
    list(req, res, leaveRequestsTable, "leave"),
);
router.post("/leaves", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.leave.create")) return;
  const e = await scopedEmployee(
    req,
    res,
    Number(req.body.employeeId),
    "leave",
  );
  if (!e) return;
  const b = req.body;
  if (!iso(b.startDate) || !iso(b.endDate) || b.startDate > b.endDate)
    return res
      .status(400)
      .json({ error: "Valid leave date range is required" });
  const rows = await db
    .select()
    .from(leaveRequestsTable)
    .where(
      and(
        eq(leaveRequestsTable.organizationId, req.crew.org),
        eq(leaveRequestsTable.employeeId, e.id),
      ),
    );
  if (
    rows.some(
      (x: any) =>
        ["Pending", "Approved"].includes(x.status) &&
        x.startDate <= b.endDate &&
        x.endDate >= b.startDate,
    )
  )
    return res
      .status(409)
      .json({ error: "An overlapping leave request already exists" });
  const [row] = await db
    .insert(leaveRequestsTable)
    .values({
      ...b,
      organizationId: req.crew.org,
      employeeId: e.id,
      employeeName: e.name,
      status: "Pending",
      updatedAt: new Date(),
    })
    .returning();
  void audit(req, "leave", row.id, e.name, "create", null, row);
  res.status(201).json(row);
});
router.patch("/leaves/:id/status", (req: any, res: any) =>
  decision(req, res, leaveRequestsTable, "leave"),
);

for (const type of ["claims", "overtime", "bonus"]) {
  const sub = type === "claims" ? "claims" : type;
  router.get(`/${type}`, async (req: any, res: any): Promise<any> => {
    let rows = (
      await db
        .select()
        .from(crewClaimsTable)
        .where(eq(crewClaimsTable.organizationId, req.crew.org))
        .orderBy(desc(crewClaimsTable.createdAt))
    ).filter((x: any) =>
      type === "claims"
        ? ["reimbursement", "allowance"].includes(x.claimType)
        : x.claimType === type,
    );
    rows = await scopedRows(req, rows, sub);
    res.json(
      rows.map((x: any) => ({ ...x, attachments: json(x.attachments) })),
    );
  });
  router.post(`/${type}`, async (req: any, res: any): Promise<any> => {
    if (!need(req, res, `crew.${sub}.create`)) return;
    const e = await scopedEmployee(req, res, Number(req.body.employeeId), sub);
    if (!e) return;
    const b = req.body;
    if (Number(b.amount) <= 0)
      return res
        .status(400)
        .json({ error: "Amount must be greater than zero" });
    const attachments = [];
    for (const f of (b.attachments || []).slice(0, 10))
      attachments.push({
        name: f.name,
        url: await saveDataUrl(f.dataUrl, "claims"),
        type: f.type,
        size: f.size,
      });
    const claimType = type === "claims" ? b.claimType || "reimbursement" : type;
    if (
      type === "overtime" &&
      (!iso(b.attendanceDate) || Number(b.requestedHours) <= 0)
    )
      return res
        .status(400)
        .json({ error: "Attendance date and requested hours are required" });
    const [row] = await db
      .insert(crewClaimsTable)
      .values({
        ...b,
        organizationId: req.crew.org,
        employeeId: e.id,
        employeeName: e.name,
        claimType,
        amount: String(b.amount),
        attachments: JSON.stringify(attachments),
        status: "Pending",
        updatedAt: new Date(),
      })
      .returning();
    void audit(req, type.slice(0, -1), row.id, e.name, "create", null, row);
    res.status(201).json(row);
  });
  router.patch(`/${type}/:id/status`, (req: any, res: any) =>
    decision(
      req,
      res,
      crewClaimsTable,
      sub,
      type === "claims" ? ["reimbursement", "allowance"] : type,
    ),
  );
}

router.get(
  "/deductions",
  async (req: any, res: any): Promise<any> =>
    list(req, res, crewDeductionsTable, "deductions"),
);
router.post("/deductions", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.deductions.create")) return;
  const e = await scopedEmployee(
    req,
    res,
    Number(req.body.employeeId),
    "deductions",
  );
  if (!e) return;
  const b = req.body;
  if (!iso(b.date) || Number(b.amount) <= 0)
    return res
      .status(400)
      .json({ error: "Valid date and amount are required" });
  const d = new Date(`${b.date}T00:00:00Z`);
  const [row] = await db
    .insert(crewDeductionsTable)
    .values({
      ...b,
      organizationId: req.crew.org,
      employeeId: e.id,
      employeeName: e.name,
      amount: String(b.amount),
      month: d.getUTCMonth(),
      year: d.getUTCFullYear(),
      status: "Approved",
      source: "manual",
      autoApproved: true,
      approvedBy: req.crew.user.id,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  void audit(req, "deduction", row.id, e.name, "create", null, row);
  res.status(201).json(row);
});
router.patch("/deductions/:id/status", (req: any, res: any) =>
  decision(req, res, crewDeductionsTable, "deductions"),
);
router.delete("/deductions/:id", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.deductions.delete")) return;
  const [old] = await db
    .select()
    .from(crewDeductionsTable)
    .where(
      and(
        eq(crewDeductionsTable.id, Number(req.params.id)),
        eq(crewDeductionsTable.organizationId, req.crew.org),
      ),
    );
  if (!old) return res.status(404).json({ error: "Deduction not found" });
  if (!(await scopedEmployee(req, res, old.employeeId, "deductions"))) return;
  await db
    .delete(crewDeductionsTable)
    .where(eq(crewDeductionsTable.id, old.id));
  void audit(req, "deduction", old.id, old.employeeName, "delete", old, null);
  res.status(204).send();
});

async function list(req: any, res: any, table: any, sub: string) {
  if (!need(req, res, `crew.${sub}.view`)) return;
  let rows = await db
    .select()
    .from(table)
    .where(eq(table.organizationId, req.crew.org))
    .orderBy(desc(table.createdAt));
  rows = await scopedRows(req, rows, sub);
  res.json(rows);
}
async function decision(
  req: any,
  res: any,
  table: any,
  sub: string,
  type?: string | string[],
) {
  const status = String(req.body.status || "");
  if (!["Approved", "Rejected"].includes(status))
    return res
      .status(400)
      .json({ error: "Status must be Approved or Rejected" });
  if (
    !need(
      req,
      res,
      `crew.${sub}.${status.toLowerCase() === "approved" ? "approve" : "reject"}`,
    )
  )
    return;
  const [old] = await db
    .select()
    .from(table)
    .where(
      and(
        eq(table.id, Number(req.params.id)),
        eq(table.organizationId, req.crew.org),
      ),
    );
  if (
    !old ||
    (type &&
      !(Array.isArray(type)
        ? type.includes(old.claimType)
        : old.claimType === type))
  )
    return res.status(404).json({ error: "Record not found" });
  if (!(await scopedEmployee(req, res, old.employeeId, sub))) return;
  if (old.status !== "Pending")
    return res
      .status(409)
      .json({ error: "Only pending records can be decided" });
  const [row] = await db
    .update(table)
    .set({
      status,
      rejectionRemarks:
        status === "Rejected" ? req.body.rejectionRemarks || "Rejected" : null,
      decidedBy: req.crew.user.id,
      approvedBy: status === "Approved" ? req.crew.user.id : null,
      approvedAt: status === "Approved" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(table.id, old.id))
    .returning();
  void audit(
    req,
    sub,
    row.id,
    row.employeeName,
    status.toLowerCase(),
    old,
    row,
  );
  res.json(row);
}
function minutes(v: string) {
  const [h, m] = String(v || "0:0")
    .split(":")
    .map(Number);
  return h * 60 + m;
}
export default router;
