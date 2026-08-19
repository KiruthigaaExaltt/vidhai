import { Router } from "express";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { paginateQuery, paginationMetadata } from "../lib/pagination";
import { publishNotification } from "../lib/notificationService";
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
  departmentsTable,
  rolesTable,
} from "@workspace/db";
import {
  employeesTable,
  attendanceLogsTable,
  leaveRequestsTable,
  crewClaimsTable,
  crewDeductionsTable,
  crewAuditLogsTable,
} from "@workspace/db";
import {
  effectivePermissions,
  getAuthUser,
  permissionSetHas,
  resolveScopeFromPermissions,
} from "../lib/access";
import {
  crewUploadFolder,
  resolveCrewUploadPath,
  resolveUploadPath,
  type CrewUploadFolder,
} from "../lib/uploadStorage";

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
    dir = resolveCrewUploadPath("employees");
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
  const folder = req.params.folder as CrewUploadFolder;
  if (
    !(folder in crewUploadFolder) ||
    !req.crew.permissions.some(
      (permission: string) =>
        permission === "*" || permission.startsWith("crew."),
    )
  )
    return res.status(403).json({ error: "Crew file access denied" });
  const file = path.basename(req.params.file);
  let target = resolveCrewUploadPath(folder, file);
  if (folder === "employees") {
    try {
      await access(target);
    } catch {
      target = resolveUploadPath("crew", "employees", file);
    }
  }
  return res.sendFile(target, { dotfiles: "deny" });
});
const can = (req: any, key: string) =>
  permissionSetHas(req.crew.permissions, key);
function need(req: any, res: any, key: string) {
  if (can(req, key)) return true;
  res.status(403).json({ error: `Missing permission: ${key}` });
  return false;
}
async function ownEmployee(req: any) {
  const linkedEmployeeId = Number(req.crew.user.employeeId);
  if (Number.isInteger(linkedEmployeeId) && linkedEmployeeId > 0) {
    const [linked] = await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.id, linkedEmployeeId),
          eq(employeesTable.organizationId, req.crew.org),
        ),
      );
    if (linked && !linked.isDeleted && linked.status !== "Offboarded")
      return linked;
  }
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
  const linked = rows.find(
    (e: any) => !e.isDeleted && e.status !== "Offboarded",
  );
  if (linked) return linked;

  // Older employee records may predate the explicit userId/employeeId link.
  // Use a unique organization-scoped email match as a safe fallback.
  const email = String(req.crew.user.email || "").trim().toLowerCase();
  if (!email) return null;
  const matches = (
    await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, req.crew.org))
  ).filter(
    (e: any) =>
      !e.isDeleted &&
      e.status !== "Offboarded" &&
      String(e.email || "").trim().toLowerCase() === email,
  );
  return matches.length === 1 ? matches[0] : null;
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
  const scope = resolveScopeFromPermissions(req.crew.permissions, "crew", sub);
  if (scope.canForOthers) return e;
  const own = await ownEmployee(req);
  if (scope.canForOwn && own?.id === e.id) return e;
  res.status(403).json({ error: "Employee is outside your permitted scope" });
  return null;
}
async function scopedRows(req: any, rows: any[], sub: string) {
  const scope = resolveScopeFromPermissions(req.crew.permissions, "crew", sub);
  if (scope.canForOthers) return rows;
  if (!scope.canForOwn) return [];
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
async function saveAttendancePhoto(
  value: any,
  folder: "attendance-punch-in" | "attendance-punch-out",
) {
  if (!value || typeof value !== "string" || !value.startsWith("data:"))
    return value || null;
  const m = value.match(
    /^data:(image\/(jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/s,
  );
  if (!m) throw new Error("Photo must be a valid JPG, PNG or WEBP image");
  const buffer = Buffer.from(m[3].replace(/\s/g, ""), "base64");
  if (!buffer.length) throw new Error("Photo data is malformed");
  if (buffer.length > 5 * 1024 * 1024)
    throw new Error("Photo must not exceed 5 MB");
  const ext = m[1].includes("png")
    ? "png"
    : m[1].includes("webp")
      ? "webp"
      : "jpg";
  const dir = resolveCrewUploadPath(folder);
  await mkdir(dir, { recursive: true });
  const file = `${Date.now()}-${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, file), buffer);
  return `/api/crew/files/${folder}/${file}`;
}
async function saveDataUrl(value: any, folder: "employees" | "claims") {
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
  const dir = resolveCrewUploadPath(folder);
  await mkdir(dir, { recursive: true });
  const file = `${Date.now()}-${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, file), Buffer.from(m[2], "base64"));
  return `/api/crew/files/${folder}/${file}`;
}

router.get("/employees", async (req: any, res: any): Promise<any> => {
  const requestedScope = String(req.query.scope || "employees");
  const allowedScopes = new Set([
    "employees",
    "attendance",
    "leave",
    "claims",
    "overtime",
    "bonus",
    "deductions",
  ]);
  if (!allowedScopes.has(requestedScope))
    return res.status(400).json({ error: "Invalid Crew employee scope" });
  if (
    !can(req, `crew.${requestedScope}.view`) &&
    !can(req, `crew.${requestedScope}.create`) &&
    !can(req, `crew.${requestedScope}.update`)
  )
    return res.status(403).json({ error: "Crew employee access denied" });
  let rows = (
    await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, req.crew.org))
      .orderBy(asc(employeesTable.name))
  ).filter((x: any) => !x.isDeleted);

  rows = await scopedRows(req, rows, requestedScope);

  const counts = {
    total: rows.length,
    active: rows.filter((row: any) => row.status === "Active").length,
    leave: rows.filter((row: any) => row.status === "On Leave").length,
    off: rows.filter((row: any) => row.status === "Offboarded").length,
  };
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
    pagination = paginateQuery(req.query, 20),
    { skip, limit } = pagination;
  res.json({
    data: rows.slice(skip, skip + limit).map((x: any) => ({
      ...x,
      skills: json(x.skills),
      certifications: json(x.certifications),
      fixedComponentValues: json(x.fixedComponentValues, {}),
    })),
    total,
    skip,
    limit,
    ...paginationMetadata(total, pagination),
    counts,
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
    const scope = resolveScopeFromPermissions(
      req.crew.permissions,
      "crew",
      "employees",
    );
    const mayCreateForOthers =
      can(req, "crew.employees.create") && scope.canForOthers;
    const mayUpdateInScope =
      can(req, "crew.employees.update") &&
      (scope.canForOwn || scope.canForOthers);
    if (!mayCreateForOthers && !mayUpdateInScope)
      return res.status(403).json({
        error: "Missing scoped Crew employee create or update permission",
      });
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
        role: u.role,
        department: u.department,
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
      departments: (await active(departmentsTable)).filter(
        (department: any) => department.status !== "Inactive",
      ),
      roles: (await active(rolesTable)).filter(
        (role: any) =>
          !role.isSuperAdmin && role.systemKey !== "SUPER_ADMIN",
      ),
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
    let stored: any = null,
      createdEmployeeId: number | null = null;
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
        baseSalary: Number(b.baseSalary || 0),
        skills: tags(b.skills),
        certifications: tags(b.certifications),
        fixedComponentValues:
          b.fixedComponentValues && typeof b.fixedComponentValues === "object"
            ? b.fixedComponentValues
            : {},
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
          fixedComponentValues: JSON.stringify(v.fixedComponentValues || {}),
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
          .set({
            employeeId: row.id,
            employeeName: row.name,
            role: row.role,
            department: row.department,
          })
          .where(
            and(
              eq(usersTable.id, row.userId),
              eq(usersTable.organizationId, org),
            ),
          );
      void audit(req, "employee", row.id, row.name, "create", null, row);
      const actorId = Number(req.crew.user.id);
      await publishNotification({
        organizationId: org,
        actorId,
        permissionKey: "crew.employees.notification",
        additionalPermissionKeys: ["crew.employees.view"],
        directRecipientUserIds: [
          ...new Set([
            actorId,
            ...(row.userId ? [Number(row.userId)] : []),
          ]),
        ],
        eventType: "CREW_EMPLOYEE_CREATED",
        eventKey: `crew-employee:${row.id}:created`,
        sourceModule: "crew",
        targetModule: "crew",
        submodule: "employees",
        title: "New employee added",
        message: `${row.name} (${row.employeeCode}) was added to ${row.department}.`,
        sourceEntityType: "employee",
        sourceEntityId: row.id,
        sourceReference: row.employeeCode,
        navigationUrl: "/crew",
        metadata: { employeeUserId: row.userId, department: row.department },
      });
      res.locals.notificationHandled = true;
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
    if (b.userId !== undefined) b.userId = b.userId ? Number(b.userId) : null;
    if (b.photoDataUrl)
      b.photoUrl = await saveDataUrl(b.photoDataUrl, "employees");
    delete b.photoDataUrl;
    delete b.id;
    delete b.organizationId;
    delete b.employeeCode;
    b.updatedAt = new Date();
    if (b.skills !== undefined) b.skills = JSON.stringify(tags(b.skills));
    if (b.certifications !== undefined)
      b.certifications = JSON.stringify(tags(b.certifications));
    if (b.fixedComponentValues !== undefined)
      b.fixedComponentValues = JSON.stringify(b.fixedComponentValues || {});
    if (b.userId && Number(b.userId) !== Number(old.userId)) {
      const [candidate] = await db
        .select()
        .from(usersTable)
        .where(
          and(
            eq(usersTable.id, b.userId),
            eq(usersTable.organizationId, req.crew.org),
          ),
        );
      if (!candidate || candidate.isDeleted)
        return res.status(400).json({ error: "Selected user is unavailable" });
      const conflict = (
        await db
          .select()
          .from(employeesTable)
          .where(eq(employeesTable.organizationId, req.crew.org))
      ).some(
        (employee: any) =>
          !employee.isDeleted &&
          Number(employee.id) !== Number(old.id) &&
          Number(employee.userId) === Number(b.userId),
      );
      if (conflict)
        return res
          .status(409)
          .json({ error: "User is already linked to an employee" });
    }
    const [row] = await db
      .update(employeesTable)
      .set(b)
      .where(eq(employeesTable.id, old.id))
      .returning();
    if (old.userId && Number(old.userId) !== Number(row.userId))
      await db
        .update(usersTable)
        .set({ employeeId: null, employeeName: null })
        .where(
          and(
            eq(usersTable.id, old.userId),
            eq(usersTable.organizationId, req.crew.org),
          ),
        );
    if (row.userId)
      await db
        .update(usersTable)
        .set({
          employeeId: row.id,
          employeeName: row.name,
          role: row.role,
          department: row.department,
        })
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
      deletedAt: new Date(),
      deletedBy: req.crew.user.id,
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
  const currentDate = today();
  let visibleEmployees = (
    await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, req.crew.org))
  ).filter((employee: any) => !employee.isDeleted && employee.status !== "Offboarded");
  visibleEmployees = await scopedRows(req, visibleEmployees, "attendance");
  for (const employee of visibleEmployees)
    if (
      !rows.some(
        (row: any) =>
          Number(row.employeeId) === Number(employee.id) &&
          row.attendanceDate === currentDate,
      )
    )
      rows.push({
        id: `derived-${employee.id}-${currentDate}`,
        employeeId: employee.id,
        employeeName: employee.name,
        employeeCode: employee.employeeCode,
        department: employee.department,
        attendanceDate: currentDate,
        status: "Absent",
        checkInTime: null,
        checkOutTime: null,
        locked: false,
        notes: null,
        derived: true,
      });
  rows.sort((a: any, b: any) =>
    String(b.attendanceDate).localeCompare(String(a.attendanceDate)),
  );
  res.json(rows.map((x: any) => ({ ...x, auditLogs: json(x.auditLogs) })));
});
router.get("/attendance/register", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.attendance.view")) return;
  const month = String(req.query.month || today().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(month))
    return res.status(400).json({ error: "Valid month is required" });
  const [year, monthNumber] = month.split("-").map(Number),
    daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  let employees = (
    await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, req.crew.org))
  ).filter((e: any) => !e.isDeleted && e.status !== "Offboarded");
  employees = await scopedRows(req, employees, "attendance");
  const [logs, leaves, holidayTemplates, patterns] = await Promise.all([
    db
      .select()
      .from(attendanceLogsTable)
      .where(eq(attendanceLogsTable.organizationId, req.crew.org)),
    db
      .select()
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.organizationId, req.crew.org)),
    db
      .select()
      .from(holidayTemplatesTable)
      .where(eq(holidayTemplatesTable.organizationId, req.crew.org)),
    db
      .select()
      .from(workPatternTemplatesTable)
      .where(eq(workPatternTemplatesTable.organizationId, req.crew.org)),
  ]);
  const rows = employees.map((employee: any) => {
    const holidayTemplate = holidayTemplates.find(
      (t: any) => Number(t.id) === Number(employee.holidayTemplate),
    );
    const holidayDates = new Set(
      json(holidayTemplate?.holidays).map((h: any) => h.date),
    );
    const pattern = patterns.find(
      (t: any) => Number(t.id) === Number(employee.workPatternTemplate),
    );
    const days = Array.from({ length: daysInMonth }, (_, offset) => {
      const day = offset + 1,
        date = `${month}-${String(day).padStart(2, "0")}`,
        actual = logs.find(
          (log: any) =>
            Number(log.employeeId) === Number(employee.id) &&
            log.attendanceDate === date,
        );
      if (actual)
        return {
          date,
          status: actual.status,
          derived: false,
          attendanceId: actual.id,
          checkInTime: actual.checkInTime,
          checkOutTime: actual.checkOutTime,
          checkInPhoto: actual.checkInPhoto,
          checkOutPhoto: actual.checkOutPhoto,
          checkInLocation: actual.checkInLocation,
          checkOutLocation: actual.checkOutLocation,
          notes: actual.notes,
          locked: actual.locked,
        };
      const leave = leaves.find(
        (item: any) =>
          Number(item.employeeId) === Number(employee.id) &&
          item.status === "Approved" &&
          item.startDate <= date &&
          item.endDate >= date,
      );
      if (leave) return { date, status: "On Leave", derived: true };
      if (holidayDates.has(date))
        return { date, status: "Holiday", derived: true };
      const week = Math.min(5, Math.floor((day - 1) / 7) + 1),
        weekday = new Date(`${date}T00:00:00Z`).getUTCDay(),
        offDays = json(pattern?.[`week${week}OffDays`]);
      if (offDays.map(Number).includes(weekday))
        return { date, status: "Week Off", derived: true };
      return { date, status: "Absent", derived: true };
    });
    return {
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.employeeCode,
      department: employee.department,
      days,
    };
  });
  return res.json({ month, daysInMonth, rows });
});
router.post("/attendance", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.attendance.create")) return;
  if (
    req.body.checkInTime &&
    !can(req, "crew.attendance.changeTime") &&
    req.body.punchAction !== "punchIn"
  )
    return res
      .status(403)
      .json({ error: "Manual attendance time changes are not allowed" });
  const employee = await scopedEmployee(
    req,
    res,
    Number(req.body.employeeId),
    "attendance",
  );
  if (!employee) return;
  const isPunchIn = req.body.punchAction === "punchIn";
  const date = isPunchIn ? today() : req.body.attendanceDate || today();
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
    if (
      isPunchIn &&
      (!req.body.location ||
        !Number.isFinite(Number(req.body.location.latitude)) ||
        !Number.isFinite(Number(req.body.location.longitude)))
    )
      return res.status(400).json({ error: "Punch-in location is required" });
    const photo = await saveAttendancePhoto(
      req.body.photoDataUrl,
      "attendance-punch-in",
    );
    if (isPunchIn && !photo)
      return res.status(400).json({ error: "Punch-in photograph is required" });
    const now = new Date(),
      time = isPunchIn
        ? now.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Kolkata",
          })
        : req.body.checkInTime ||
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
        userId: employee.userId || null,
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
router.post("/attendance/override", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.attendance.update")) return;
  if (!need(req, res, "crew.attendance.change_time")) return;
  const reason = String(req.body.overrideReason || "").trim();
  if (reason.length < 10)
    return res.status(400).json({
      error: "Attendance override reason must contain at least 10 characters",
    });
  if (!iso(req.body.attendanceDate))
    return res.status(400).json({ error: "Valid attendance date is required" });
  const employee = await scopedEmployee(
    req,
    res,
    Number(req.body.employeeId),
    "attendance",
  );
  if (!employee) return;
  const allowedStatuses = new Set([
    "Present", "Absent", "Late", "Half Day", "On Leave",
    "Week Off", "Holiday", "Remote", "WFH",
  ]);
  if (!allowedStatuses.has(String(req.body.status)))
    return res.status(400).json({ error: "Invalid attendance status" });
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
  ).find((row: any) => row.attendanceDate === req.body.attendanceDate);
  const values: any = {
    status: req.body.status,
    checkInTime: req.body.checkInTime || null,
    checkOutTime: req.body.checkOutTime || null,
    notes: req.body.notes || null,
    locked: Boolean(req.body.checkOutTime),
    auditLogs: JSON.stringify([
      ...json(existing?.auditLogs),
      {
        action: "attendance-override",
        actor: req.crew.user.displayName,
        at: new Date(),
        reason,
      },
    ]),
    updatedAt: new Date(),
  };
  const [row] = existing
    ? await db
        .update(attendanceLogsTable)
        .set(values)
        .where(eq(attendanceLogsTable.id, existing.id))
        .returning()
    : await db
        .insert(attendanceLogsTable)
        .values({
          ...values,
          organizationId: req.crew.org,
          userId: employee.userId || null,
          employeeId: employee.id,
          employeeName: employee.name,
          employeeCode: employee.employeeCode,
          department: employee.department,
          designation: employee.designation,
          attendanceDate: req.body.attendanceDate,
        })
        .returning();
  void audit(
    req,
    "attendance",
    row.id,
    employee.name,
    "override",
    existing || null,
    row,
  );
  return res.json(row);
});
router.patch("/attendance/:id", async (req: any, res: any): Promise<any> => {
  const isPunchOut = req.body.punchAction === "punchOut";
  if (isPunchOut) {
    if (
      !can(req, "crew.attendance.update") &&
      !can(req, "crew.attendance.create")
    )
      return res
        .status(403)
        .json({ error: "Missing attendance punch permission" });
  } else if (!need(req, res, "crew.attendance.update")) return;
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
  if (old.locked && !isPunchOut) {
    if (!can(req, "crew.attendance.change_time"))
      return res.status(403).json({
        error: "Attendance override requires change-time permission",
      });
    if (String(req.body.overrideReason || "").trim().length < 10)
      return res.status(400).json({
        error: "Attendance override reason must contain at least 10 characters",
      });
  }
  try {
    const b: any = { ...req.body, updatedAt: new Date() };
    const overrideReason = String(b.overrideReason || "").trim() || null;
    delete b.employeeId;
    delete b.attendanceDate;
    delete b.overrideReason;
    if (
      (b.checkInTime || b.checkOutTime) &&
      !can(req, "crew.attendance.changeTime") &&
      b.punchAction !== "punchOut"
    )
      return res.status(403).json({
        error: "Manual time changes require crew.attendance.changeTime",
      });
    if (isPunchOut) {
      if (old.checkOutTime)
        return res
          .status(409)
          .json({ error: "Attendance is already punched out" });
      if (!old.checkInTime)
        return res.status(400).json({ error: "Punch-in is required first" });
      if (
        !b.location ||
        !Number.isFinite(Number(b.location.latitude)) ||
        !Number.isFinite(Number(b.location.longitude))
      )
        return res
          .status(400)
          .json({ error: "Punch-out location is required" });
      const photo = await saveAttendancePhoto(
        b.photoDataUrl,
        "attendance-punch-out",
      );
      if (!photo)
        return res
          .status(400)
          .json({ error: "Punch-out photograph is required" });
      const now = new Date();
      b.checkOutTime = now.toLocaleTimeString("en-GB", {
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
      b.checkOutLocation = JSON.stringify(b.location);
      const employee = (
        await db
          .select()
          .from(employeesTable)
          .where(eq(employeesTable.id, old.employeeId))
      )[0];
      const template = employee?.attendanceRulesTemplate
        ? (
            await db
              .select()
              .from(attendanceTemplatesTable)
              .where(
                eq(
                  attendanceTemplatesTable.id,
                  employee.attendanceRulesTemplate,
                ),
              )
          )[0]
        : null;
      if (template) {
        const start = minutes(old.checkInTime),
          end =
            minutes(b.checkOutTime) +
            (minutes(b.checkOutTime) < start ? 1440 : 0),
          required =
            (minutes(template.workEndTime) -
              minutes(template.workStartTime) +
              1440) %
              1440 || 1440,
          worked = end - start;
        if (template.flexibleHours)
          b.status =
            worked < required / 2
              ? "Half Day"
              : worked < required
                ? "Late"
                : "Present";
        else {
          const shiftEnd =
              minutes(template.workEndTime) +
              (minutes(template.workEndTime) < minutes(template.workStartTime)
                ? 1440
                : 0),
            late =
              start >
              minutes(template.workStartTime) +
                Number(template.lateThresholdMinutes || 0),
            early = end < shiftEnd;
          b.status = late || early ? "Late" : "Present";
        }
      }
      b.locked = true;
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
        reason: overrideReason,
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

async function leaveContext(org: number, employee: any, year: number) {
  const [leaveTemplates, patterns, holidayTemplates] = await Promise.all([
    db
      .select()
      .from(leaveTemplatesTable)
      .where(eq(leaveTemplatesTable.organizationId, org)),
    db
      .select()
      .from(workPatternTemplatesTable)
      .where(eq(workPatternTemplatesTable.organizationId, org)),
    db
      .select()
      .from(holidayTemplatesTable)
      .where(eq(holidayTemplatesTable.organizationId, org)),
  ]);
  const active = (row: any) => row && row.isActive !== false;
  const leaveTemplate =
    leaveTemplates.find(
      (row: any) =>
        Number(row.id) === Number(employee.leaveTemplate) && active(row),
    ) || leaveTemplates.find((row: any) => row.isDefault && active(row));
  const workPattern =
    patterns.find(
      (row: any) =>
        Number(row.id) === Number(employee.workPatternTemplate) && active(row),
    ) || patterns.find((row: any) => row.isDefault && active(row));
  const assignedHoliday = holidayTemplates.find(
    (row: any) =>
      Number(row.id) === Number(employee.holidayTemplate) && active(row),
  );
  const holidayTemplate =
    assignedHoliday && Number(assignedHoliday.effectiveYear) === year
      ? assignedHoliday
      : holidayTemplates.find(
          (row: any) =>
            active(row) &&
            Number(row.effectiveYear) === year &&
            assignedHoliday &&
            row.templateName === assignedHoliday.templateName,
        ) ||
        holidayTemplates.find(
          (row: any) =>
            active(row) && row.isDefault && Number(row.effectiveYear) === year,
        );
  return {
    leaveTemplate,
    workPattern,
    holidayDates: new Set<string>(
      json(holidayTemplate?.holidays).map((item: any) => item.date),
    ),
  };
}
function datesBetween(start: string, end: string) {
  const dates: string[] = [];
  for (
    let cursor = new Date(`${start}T00:00:00Z`),
      last = new Date(`${end}T00:00:00Z`);
    cursor <= last;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  )
    dates.push(cursor.toISOString().slice(0, 10));
  return dates;
}
function chargeableDays(
  start: string,
  end: string,
  fromSession: any,
  toSession: any,
  context: any,
) {
  const working = datesBetween(start, end).filter((date) => {
    const value = new Date(`${date}T00:00:00Z`),
      week = Math.min(5, Math.floor((value.getUTCDate() - 1) / 7) + 1),
      offDays = json(context.workPattern?.[`week${week}OffDays`]).map(Number);
    return (
      !offDays.includes(value.getUTCDay()) && !context.holidayDates.has(date)
    );
  });
  if (
    start === end &&
    working.length &&
    String(fromSession) === String(toSession)
  )
    return 0.5;
  return working.length;
}
async function employeeLeaveBalance(
  org: number,
  employee: any,
  year: number,
  month: number,
) {
  const context = await leaveContext(org, employee, year),
    template = context.leaveTemplate;
  if (!template) throw new Error("No active leave template is assigned");
  const requests = (
    await db
      .select()
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.organizationId, org),
          eq(leaveRequestsTable.employeeId, employee.id),
        ),
      )
  ).filter((row: any) => row.status === "Approved");
  const calculate = (type: string) => {
    let used = 0,
      monthlyUsed = 0;
    for (const row of requests.filter((item: any) => item.leaveType === type)) {
      const yearStart = `${year}-01-01`,
        yearEnd = `${year}-12-31`,
        start = row.startDate > yearStart ? row.startDate : yearStart,
        end = row.endDate < yearEnd ? row.endDate : yearEnd;
      if (start <= end)
        used += chargeableDays(
          start,
          end,
          row.fromSession,
          row.toSession,
          context,
        );
      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`,
        monthEnd = new Date(Date.UTC(year, month, 0))
          .toISOString()
          .slice(0, 10),
        ms = row.startDate > monthStart ? row.startDate : monthStart,
        me = row.endDate < monthEnd ? row.endDate : monthEnd;
      if (ms <= me)
        monthlyUsed += chargeableDays(
          ms,
          me,
          row.fromSession,
          row.toSession,
          context,
        );
    }
    const total = Number(
        type === "Sick" ? template.totalSickLeaves : template.totalCasualLeaves,
      ),
      monthlyMax = Number(
        type === "Sick"
          ? template.maxSickLeavesPerMonth
          : template.maxCasualLeavesPerMonth,
      );
    return {
      total,
      used,
      remaining: Math.max(0, total - used),
      monthlyMax,
      monthlyUsed,
      monthlyRemaining: Math.max(0, monthlyMax - monthlyUsed),
    };
  };
  return {
    sick: calculate("Sick"),
    casual: calculate("Casual"),
    templateName: template.templateName,
    carryForwardEnabled: Boolean(template.carryForwardEnabled),
  };
}
router.get(
  "/leaves",
  async (req: any, res: any): Promise<any> =>
    list(req, res, leaveRequestsTable, "leave"),
);
router.get(
  "/employees/:id/leave-balance",
  async (req: any, res: any): Promise<any> => {
    if (!need(req, res, "crew.leave.view")) return;
    const employee = await scopedEmployee(
      req,
      res,
      Number(req.params.id),
      "leave",
    );
    if (!employee) return;
    const year = Number(req.query.year || today().slice(0, 4)),
      month = Number(req.query.month || today().slice(5, 7));
    try {
      return res.json(
        await employeeLeaveBalance(req.crew.org, employee, year, month),
      );
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  },
);
router.get(
  "/employees/:id/working-days",
  async (req: any, res: any): Promise<any> => {
    if (!need(req, res, "crew.leave.view")) return;
    const employee = await scopedEmployee(
      req,
      res,
      Number(req.params.id),
      "leave",
    );
    if (!employee) return;
    const {
      startDate,
      endDate,
      fromSession = "1",
      toSession = "2",
    } = req.query;
    if (!iso(startDate) || !iso(endDate) || String(startDate) > String(endDate))
      return res
        .status(400)
        .json({ error: "Valid leave date range is required" });
    const context = await leaveContext(
      req.crew.org,
      employee,
      Number(String(startDate).slice(0, 4)),
    );
    return res.json({
      workingDays: chargeableDays(
        String(startDate),
        String(endDate),
        fromSession,
        toSession,
        context,
      ),
    });
  },
);
router.post("/leaves", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.leave.create")) return;
  const employee = await scopedEmployee(
    req,
    res,
    Number(req.body.employeeId),
    "leave",
  );
  if (!employee) return;
  const b = req.body;
  if (!iso(b.startDate) || !iso(b.endDate) || b.startDate > b.endDate)
    return res
      .status(400)
      .json({ error: "Valid leave date range is required" });
  if (!["Sick", "Casual", "Other"].includes(b.leaveType))
    return res
      .status(400)
      .json({ error: "Leave type must be Sick, Casual or Other" });
  if (
    !["1", "2"].includes(String(b.fromSession)) ||
    !["1", "2"].includes(String(b.toSession))
  )
    return res.status(400).json({ error: "Valid leave sessions are required" });
  const rows = await db
    .select()
    .from(leaveRequestsTable)
    .where(
      and(
        eq(leaveRequestsTable.organizationId, req.crew.org),
        eq(leaveRequestsTable.employeeId, employee.id),
      ),
    );
  if (
    rows.some(
      (row: any) =>
        ["Pending", "Approved"].includes(row.status) &&
        row.startDate <= b.endDate &&
        row.endDate >= b.startDate,
    )
  )
    return res
      .status(409)
      .json({ error: "A leave request already exists for overlapping dates" });
  const year = Number(b.startDate.slice(0, 4)),
    context = await leaveContext(req.crew.org, employee, year),
    requestedDays = chargeableDays(
      b.startDate,
      b.endDate,
      b.fromSession,
      b.toSession,
      context,
    );
  if (b.leaveType !== "Other" && requestedDays <= 0)
    return res.status(400).json({
      error:
        "Selected dates fall on week-offs/holidays only. Choose working days.",
    });
  if (b.leaveType !== "Other") {
    if (!context.leaveTemplate)
      return res
        .status(400)
        .json({ error: "No active leave template is assigned" });
    const allocation = Number(
        b.leaveType === "Sick"
          ? context.leaveTemplate.totalSickLeaves
          : context.leaveTemplate.totalCasualLeaves,
      ),
      monthlyMax = Number(
        b.leaveType === "Sick"
          ? context.leaveTemplate.maxSickLeavesPerMonth
          : context.leaveTemplate.maxCasualLeavesPerMonth,
      );
    const reserved = rows.filter(
      (row: any) =>
        ["Pending", "Approved"].includes(row.status) &&
        row.leaveType === b.leaveType,
    );
    let yearlyReserved = 0;
    for (const row of reserved) {
      const ys =
          row.startDate > `${year}-01-01` ? row.startDate : `${year}-01-01`,
        ye = row.endDate < `${year}-12-31` ? row.endDate : `${year}-12-31`;
      if (ys <= ye)
        yearlyReserved += chargeableDays(
          ys,
          ye,
          row.fromSession,
          row.toSession,
          context,
        );
    }
    if (yearlyReserved + requestedDays > allocation)
      return res
        .status(400)
        .json({ error: `${b.leaveType} yearly leave balance exceeded` });
    const monthKeys = [
      ...new Set(
        datesBetween(b.startDate, b.endDate).map((date) => date.slice(0, 7)),
      ),
    ];
    for (const key of monthKeys) {
      const [segmentYear, segmentMonth] = key.split("-").map(Number),
        segmentContext = await leaveContext(
          req.crew.org,
          employee,
          segmentYear,
        ),
        monthStart = `${key}-01`,
        monthEnd = new Date(Date.UTC(segmentYear, segmentMonth, 0))
          .toISOString()
          .slice(0, 10),
        requestStart = b.startDate > monthStart ? b.startDate : monthStart,
        requestEnd = b.endDate < monthEnd ? b.endDate : monthEnd,
        segmentDays = chargeableDays(
          requestStart,
          requestEnd,
          b.fromSession,
          b.toSession,
          segmentContext,
        );
      let used = 0;
      for (const row of reserved) {
        const start = row.startDate > monthStart ? row.startDate : monthStart,
          end = row.endDate < monthEnd ? row.endDate : monthEnd;
        if (start <= end)
          used += chargeableDays(
            start,
            end,
            row.fromSession,
            row.toSession,
            segmentContext,
          );
      }
      if (used + segmentDays > monthlyMax)
        return res
          .status(400)
          .json({ error: `${b.leaveType} monthly limit exceeded for ${key}` });
    }
  }
  try {
    const [row] = await db
      .insert(leaveRequestsTable)
      .values({
        organizationId: req.crew.org,
        employeeId: employee.id,
        employeeName: employee.name,
        startDate: b.startDate,
        endDate: b.endDate,
        leaveType: b.leaveType,
        fromSession: Number(b.fromSession),
        toSession: Number(b.toSession),
        reason: String(b.reason || "").trim() || null,
        requestedDays: String(requestedDays),
        requestedBy: req.crew.user.id,
        status: "Pending",
        updatedAt: new Date(),
      })
      .returning();
    void audit(req, "leave", row.id, employee.name, "create", null, row);
    const [reportingManager] = employee.reportingManager
      ? await db
          .select()
          .from(employeesTable)
          .where(
            and(
              eq(employeesTable.id, Number(employee.reportingManager)),
              eq(employeesTable.organizationId, req.crew.org),
            ),
          )
          .limit(1)
      : [null];
    const organizationUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.organizationId, req.crew.org));
    const adminUserIds = organizationUsers
      .filter((user: any) => {
        const role = String(user.role || "").trim().toLowerCase();
        return (
          !user.isDeleted &&
          user.isActive !== false &&
          (role === "admin" ||
            role === "super_admin" ||
            user.systemKey === "ADMIN" ||
            user.systemKey === "SUPER_ADMIN")
        );
      })
      .map((user: any) => Number(user.id));
    const recipientUserIds = [
      ...new Set([
        ...adminUserIds,
        ...(reportingManager?.userId
          ? [Number(reportingManager.userId)]
          : []),
      ]),
    ].filter((id) => Number.isInteger(id) && id > 0);
    if (recipientUserIds.length) {
      await publishNotification({
        organizationId: req.crew.org,
        actorId: Number(req.crew.user.id),
        permissionKey: "crew.leave.notification",
        recipientUserIds: [],
        directRecipientUserIds: recipientUserIds,
        eventType: "CREW_LEAVES_REQUESTED",
        eventKey: `crew-leave:${row.id}:requested`,
        sourceModule: "crew",
        targetModule: "crew",
        submodule: "leave",
        title: "Leave requested",
        message: `${employee.name} requested ${row.leaveType} leave from ${row.startDate} to ${row.endDate}.`,
        sourceEntityType: "leave_request",
        sourceEntityId: row.id,
        sourceReference: employee.employeeCode,
        navigationUrl: "/crew",
        metadata: {
          employeeId: employee.id,
          reportingManagerId: employee.reportingManager,
          status: row.status,
        },
      });
    }
    res.locals.notificationHandled = true;
    return res.status(201).json(row);
  } catch (error: any) {
    return res
      .status(400)
      .json({ error: error?.message || "Unable to save leave request" });
  }
});
router.patch("/leaves/:id/status", async (req: any, res: any): Promise<any> => {
  const status = String(req.body.status || "");
  if (!["Approved", "Rejected"].includes(status))
    return res
      .status(400)
      .json({ error: "Status must be Approved or Rejected" });
  if (
    !need(
      req,
      res,
      `crew.leave.${status === "Approved" ? "approve" : "reject"}`,
    )
  )
    return;
  const [old] = await db
    .select()
    .from(leaveRequestsTable)
    .where(
      and(
        eq(leaveRequestsTable.id, Number(req.params.id)),
        eq(leaveRequestsTable.organizationId, req.crew.org),
      ),
    );
  if (!old) return res.status(404).json({ error: "Leave request not found" });
  if (old.status !== "Pending")
    return res
      .status(409)
      .json({ error: "Only pending leave requests can be decided" });
  if (
    status === "Rejected" &&
    String(req.body.rejectionRemarks || "").trim().length < 10
  )
    return res
      .status(400)
      .json({ error: "Rejection remarks must contain at least 10 characters" });
  const now = new Date(),
    [row] = await db
      .update(leaveRequestsTable)
      .set({
        status,
        rejectionRemarks:
          status === "Rejected"
            ? String(req.body.rejectionRemarks).trim()
            : null,
        decidedBy: req.crew.user.id,
        approvedBy: status === "Approved" ? req.crew.user.id : null,
        approvedAt: status === "Approved" ? now : null,
        rejectedBy: status === "Rejected" ? req.crew.user.id : null,
        rejectedAt: status === "Rejected" ? now : null,
        updatedAt: now,
      })
      .where(eq(leaveRequestsTable.id, old.id))
      .returning();
  void audit(
    req,
    "leave",
    row.id,
    row.employeeName,
    status.toLowerCase(),
    old,
    row,
  );
  return res.json(row);
});
async function overtimeCalculation(org: number, employee: any, date: string) {
  if (!iso(date)) throw new Error("A valid attendance date is required");
  const logs = await db
    .select()
    .from(attendanceLogsTable)
    .where(
      and(
        eq(attendanceLogsTable.organizationId, org),
        eq(attendanceLogsTable.employeeId, employee.id),
        eq(attendanceLogsTable.attendanceDate, date),
      ),
    );
  const attendance = logs[0];
  if (!attendance)
    throw new Error("No attendance found for the selected date.");
  if (!attendance.checkInTime || !attendance.checkOutTime)
    throw new Error(
      "Complete punch-in and punch-out times are required to calculate overtime.",
    );
  const templates = await db
    .select()
    .from(attendanceTemplatesTable)
    .where(eq(attendanceTemplatesTable.organizationId, org));
  const active = (row: any) => row && row.isActive !== false;
  const template =
    templates.find(
      (row: any) =>
        Number(row.id) === Number(employee.attendanceRulesTemplate) &&
        active(row),
    ) || templates.find((row: any) => row.isDefault && active(row));
  const workStartTime = String(template?.workStartTime || "09:00"),
    workEndTime = String(template?.workEndTime || "17:00"),
    checkInTime = String(attendance.checkInTime),
    checkOutTime = String(attendance.checkOutTime);
  const shiftStart = minutes(workStartTime),
    shiftEnd =
      minutes(workEndTime) + (minutes(workEndTime) <= shiftStart ? 1440 : 0),
    punchIn = minutes(checkInTime),
    punchOut =
      minutes(checkOutTime) + (minutes(checkOutTime) < punchIn ? 1440 : 0);
  const earlyOvertimeMinutes = Math.max(0, shiftStart - punchIn),
    lateOvertimeMinutes = Math.max(0, punchOut - shiftEnd),
    totalOvertimeMinutes = earlyOvertimeMinutes + lateOvertimeMinutes,
    overtimeHours = Math.round((totalOvertimeMinutes / 60) * 100) / 100;
  if (totalOvertimeMinutes <= 0)
    throw new Error("No overtime detected for the selected date.");
  const monthStart = `${date.slice(0, 7)}-01`,
    monthEnd = new Date(
      Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0),
    )
      .toISOString()
      .slice(0, 10),
    employmentStart =
      employee.joinDate && employee.joinDate > monthStart
        ? employee.joinDate
        : monthStart,
    employmentEnd =
      employee.exitDate && employee.exitDate < monthEnd
        ? employee.exitDate
        : monthEnd,
    payableDays = Math.max(
      1,
      datesBetween(employmentStart, employmentEnd).length,
    ),
    workingHoursPerDay = Math.max(1, (shiftEnd - shiftStart) / 60),
    monthlySalary = Math.max(
      0,
      Number(
        employee.baseSalary ||
          employee.monthlySalary ||
          employee.salary ||
          employee.grossSalary ||
          0,
      ),
    ),
    hourlySalary =
      Math.round((monthlySalary / (payableDays * workingHoursPerDay)) * 100) /
      100,
    amount = Math.round(hourlySalary * overtimeHours * 100) / 100;
  if (amount <= 0)
    throw new Error(
      "A positive base salary is required to calculate overtime.",
    );
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    attendanceId: attendance.id,
    attendanceDate: date,
    workStartTime,
    workEndTime,
    checkInTime,
    checkOutTime,
    earlyOvertimeMinutes,
    lateOvertimeMinutes,
    totalOvertimeMinutes,
    overtimeHours,
    hourlySalary,
    amount,
    payableDays,
    workingHoursPerDay,
  };
}
router.get(
  "/overtime/calculation",
  async (req: any, res: any): Promise<any> => {
    if (!can(req, "crew.overtime.view") && !can(req, "crew.overtime.create"))
      return res
        .status(403)
        .json({ error: "Missing overtime view/create permission" });
    const employee = await scopedEmployee(
      req,
      res,
      Number(req.query.employeeId),
      "overtime",
    );
    if (!employee) return;
    try {
      return res.json(
        await overtimeCalculation(
          req.crew.org,
          employee,
          String(req.query.date || ""),
        ),
      );
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  },
);
router.get("/overtime", async (req: any, res: any): Promise<any> => {
  let rows = (
    await db
      .select()
      .from(crewClaimsTable)
      .where(eq(crewClaimsTable.organizationId, req.crew.org))
      .orderBy(desc(crewClaimsTable.createdAt))
  ).filter((row: any) => row.claimType === "overtime");
  rows = await scopedRows(req, rows, "overtime");
  return res.json(
    rows.map((row: any) => ({ ...row, attachments: json(row.attachments) })),
  );
});
router.post("/overtime", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.overtime.create")) return;
  const employee = await scopedEmployee(
    req,
    res,
    Number(req.body.employeeId),
    "overtime",
  );
  if (!employee) return;
  if (!String(req.body.title || "").trim())
    return res.status(400).json({ error: "OT title is required" });
  try {
    const calculation = await overtimeCalculation(
        req.crew.org,
        employee,
        String(req.body.attendanceDate || ""),
      ),
      existing = (
        await db
          .select()
          .from(crewClaimsTable)
          .where(
            and(
              eq(crewClaimsTable.organizationId, req.crew.org),
              eq(crewClaimsTable.employeeId, employee.id),
              eq(crewClaimsTable.attendanceDate, calculation.attendanceDate),
            ),
          )
      ).find((row: any) => row.claimType === "overtime");
    if (existing && ["Pending", "Approved"].includes(existing.status))
      return res
        .status(409)
        .json({ error: "Overtime already submitted for this date." });
    const values = {
      employeeId: employee.id,
      employeeName: employee.name,
      claimType: "overtime",
      amount: String(calculation.amount),
      title: String(req.body.title).trim(),
      notes: String(req.body.notes || "").trim() || null,
      attendanceDate: calculation.attendanceDate,
      requestedHours: String(calculation.overtimeHours),
      status: "Pending",
      submittedBy: req.crew.user.id,
      submittedAt: new Date(),
      rejectionRemarks: null,
      rejectedBy: null,
      rejectedAt: null,
      updatedAt: new Date(),
    };
    let row: any;
    if (existing) {
      [row] = await db
        .update(crewClaimsTable)
        .set(values)
        .where(eq(crewClaimsTable.id, existing.id))
        .returning();
    } else {
      [row] = await db
        .insert(crewClaimsTable)
        .values({ ...values, organizationId: req.crew.org, attachments: "[]" })
        .returning();
    }
    void audit(
      req,
      "overtime",
      row.id,
      employee.name,
      existing ? "resubmit" : "create",
      existing || null,
      row,
    );
    return res.status(existing ? 200 : 201).json(row);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});
router.patch("/overtime/:id", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.overtime.update")) return;
  const [old] = await db
    .select()
    .from(crewClaimsTable)
    .where(
      and(
        eq(crewClaimsTable.id, Number(req.params.id)),
        eq(crewClaimsTable.organizationId, req.crew.org),
      ),
    );
  if (!old || old.claimType !== "overtime")
    return res.status(404).json({ error: "Overtime request not found" });
  if (!(await scopedEmployee(req, res, old.employeeId, "overtime"))) return;
  if (old.status !== "Pending")
    return res
      .status(409)
      .json({ error: "Only pending overtime can be adjusted" });
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount < 0)
    return res.status(400).json({ error: "Amount must be zero or greater" });
  const [row] = await db
    .update(crewClaimsTable)
    .set({
      amount: String(amount),
      title: String(req.body.title || old.title).trim(),
      notes:
        req.body.notes === undefined
          ? old.notes
          : String(req.body.notes).trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(crewClaimsTable.id, old.id))
    .returning();
  void audit(req, "overtime", row.id, row.employeeName, "adjust", old, row);
  return res.json(row);
});
router.patch("/overtime/:id/status", (req: any, res: any) =>
  decision(req, res, crewClaimsTable, "overtime", "overtime"),
);
router.get("/bonus", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.bonus.view")) return;
  let rows = (
    await db
      .select()
      .from(crewClaimsTable)
      .where(eq(crewClaimsTable.organizationId, req.crew.org))
      .orderBy(desc(crewClaimsTable.createdAt))
  ).filter((row: any) => row.claimType === "bonus");
  rows = await scopedRows(req, rows, "bonus");
  return res.json(
    rows.map((row: any) => ({ ...row, attachments: json(row.attachments) })),
  );
});
router.get(
  "/bonus/salary-summary",
  async (req: any, res: any): Promise<any> => {
    if (!need(req, res, "crew.bonus.view")) return;
    const payrollMonth = String(req.query.payrollMonth || "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payrollMonth))
      return res
        .status(400)
        .json({ error: "A valid payroll month is required" });
    let employees = (
        await db
          .select()
          .from(employeesTable)
          .where(eq(employeesTable.organizationId, req.crew.org))
      ).filter((employee: any) => !employee.isDeleted),
      claims = (
        await db
          .select()
          .from(crewClaimsTable)
          .where(eq(crewClaimsTable.organizationId, req.crew.org))
      ).filter(
        (row: any) =>
          row.status === "Approved" &&
          String(
            row.payrollMonth ||
              row.attendanceDate ||
              row.approvedAt ||
              row.createdAt,
          ).slice(0, 7) === payrollMonth,
      );
    employees = await scopedRows(req, employees, "bonus");
    const summaries = employees.map((employee: any) => {
      const entries = claims.filter(
          (row: any) => Number(row.employeeId) === Number(employee.id),
        ),
        sum = (types: string[]) =>
          entries
            .filter((row: any) => types.includes(row.claimType))
            .reduce(
              (total: number, row: any) => total + Number(row.amount || 0),
              0,
            ),
        baseSalary = Number(employee.baseSalary || 0),
        bonusAmount = sum(["bonus"]),
        overtimeAmount = sum(["overtime"]),
        claimsAmount = sum(["reimbursement", "allowance"]);
      return {
        employeeId: employee.id,
        employeeName: employee.name,
        department: employee.department,
        baseSalary,
        bonusAmount,
        overtimeAmount,
        claimsAmount,
        grossSalary: baseSalary + bonusAmount + overtimeAmount + claimsAmount,
      };
    });
    return res.json({
      payrollMonth,
      summaries,
      totals: {
        bonusAmount: summaries.reduce(
          (total: number, row: any) => total + row.bonusAmount,
          0,
        ),
        grossSalary: summaries.reduce(
          (total: number, row: any) => total + row.grossSalary,
          0,
        ),
      },
    });
  },
);
router.patch("/bonus/:id/status", (_req: any, res: any) =>
  res.status(400).json({
    error:
      "Bonus entries are added directly to salary and do not support approve/reject actions.",
  }),
);
router.post("/bonus", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.bonus.create")) return;
  const employee = await scopedEmployee(
    req,
    res,
    Number(req.body.employeeId),
    "bonus",
  );
  if (!employee) return;
  const amount = Number(req.body.amount),
    payrollMonth = String(req.body.payrollMonth || "");
  if (!Number.isFinite(amount) || amount <= 0)
    return res
      .status(400)
      .json({ error: "Bonus amount must be greater than zero" });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payrollMonth))
    return res.status(400).json({ error: "A valid payroll month is required" });
  const now = new Date();
  try {
    const [row] = await db
      .insert(crewClaimsTable)
      .values({
        organizationId: req.crew.org,
        employeeId: employee.id,
        employeeName: employee.name,
        claimType: "bonus",
        amount: String(amount),
        title: "Bonus",
        notes: String(req.body.notes || "").trim() || null,
        attendanceDate: `${payrollMonth}-01`,
        payrollMonth,
        requestedHours: null,
        attachments: "[]",
        status: "Approved",
        submittedBy: req.crew.user.id,
        submittedAt: now,
        approvedBy: req.crew.user.id,
        approvedAt: now,
        decidedBy: req.crew.user.id,
        updatedAt: now,
      })
      .returning();
    void audit(
      req,
      "bonus",
      row.id,
      employee.name,
      "created_and_approved",
      null,
      row,
    );
    if (employee.userId) {
      await publishNotification({
        organizationId: req.crew.org,
        actorId: Number(req.crew.user.id),
        permissionKey: "crew.bonus.notification",
        recipientUserIds: [],
        directRecipientUserIds: [Number(employee.userId)],
        eventType: "CREW_BONUS_ADDED",
        eventKey: `crew-bonus:${row.id}:added`,
        sourceModule: "crew",
        targetModule: "crew",
        submodule: "bonus",
        title: "Bonus added",
        message: `A bonus of ₹${amount.toLocaleString("en-IN")} was added to your salary for ${payrollMonth}.`,
        sourceEntityType: "crew_bonus",
        sourceEntityId: row.id,
        sourceReference: employee.employeeCode,
        navigationUrl: "/crew",
        metadata: {
          employeeId: employee.id,
          payrollMonth,
          amount,
        },
      });
    }
    res.locals.notificationHandled = true;
    return res.status(201).json(row);
  } catch (error: any) {
    return res
      .status(400)
      .json({ error: error?.message || "Unable to add bonus" });
  }
});
for (const type of ["claims"]) {
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
    if (type === "claims") {
      if (!["reimbursement", "allowance"].includes(String(b.claimType)))
        return res
          .status(400)
          .json({ error: "Claim type must be reimbursement or allowance" });
      if (!String(b.title || "").trim())
        return res.status(400).json({ error: "Claim title is required" });
      if (b.attendanceDate && !iso(b.attendanceDate))
        return res
          .status(400)
          .json({ error: "Claim date must use YYYY-MM-DD format" });
      if (
        b.requestedHours != null &&
        b.requestedHours !== "" &&
        (!Number.isFinite(Number(b.requestedHours)) ||
          Number(b.requestedHours) < 0)
      )
        return res
          .status(400)
          .json({ error: "Hours must be a non-negative number" });
      const allowed = new Set([
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/webp",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ]),
        files = Array.isArray(b.attachments) ? b.attachments : [];
      if (files.length > 10)
        return res
          .status(400)
          .json({ error: "A maximum of 10 attachments is allowed" });
      for (const file of files) {
        if (!allowed.has(String(file.type)))
          return res.status(400).json({
            error: `Unsupported attachment type: ${file.name || "file"}`,
          });
        if (Number(file.size) > 25 * 1024 * 1024)
          return res
            .status(400)
            .json({ error: `${file.name || "Attachment"} exceeds 25 MB` });
        if (!String(file.dataUrl || "").startsWith("data:"))
          return res
            .status(400)
            .json({ error: `Invalid attachment: ${file.name || "file"}` });
      }
    }
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
        submittedBy: req.crew.user.id,
        submittedAt: new Date(),
        status: "Pending",
        updatedAt: new Date(),
      })
      .returning();
    void audit(req, type.slice(0, -1), row.id, e.name, "create", null, row);
    {
      await publishNotification({
        organizationId: req.crew.org,
        actorId: Number(req.crew.user.id),
        permissionKey: "crew.claims.notification",
        eventType: "CREW_CLAIMS_REQUESTED",
        eventKey: `crew-claim:${row.id}:requested`,
        sourceModule: "crew",
        targetModule: "crew",
        submodule: "claims",
        title: "Claim submitted",
        message: `${e.name} submitted ${String(row.claimType).replace(/_/g, " ")} claim ${row.title} for ₹${Number(row.amount).toLocaleString("en-IN")}.`,
        sourceEntityType: "crew_claim",
        sourceEntityId: row.id,
        sourceReference: row.title,
        navigationUrl: "/crew",
        metadata: {
          employeeId: e.id,
          reportingManagerId: e.reportingManager,
          status: row.status,
        },
      });
    }
    res.locals.notificationHandled = true;
    return res.status(201).json(row);
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

async function syncAttendanceDeductions(
  org: number,
  month: number,
  year: number,
) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`,
    logs = (
      await db
        .select()
        .from(attendanceLogsTable)
        .where(eq(attendanceLogsTable.organizationId, org))
    ).filter((row: any) => String(row.attendanceDate).startsWith(prefix)),
    employees = (
      await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, org))
    ).filter((row: any) => !row.isDeleted),
    templates = await db
      .select()
      .from(attendanceTemplatesTable)
      .where(eq(attendanceTemplatesTable.organizationId, org)),
    oldRows = (
      await db
        .select()
        .from(crewDeductionsTable)
        .where(eq(crewDeductionsTable.organizationId, org))
    ).filter(
      (row: any) =>
        row.month === month &&
        row.year === year &&
        String(row.source).toLowerCase() !== "manual",
    );
  for (const log of logs) {
    const employee = employees.find(
      (row: any) => Number(row.id) === Number(log.employeeId),
    );
    if (!employee) continue;
    const template =
        templates.find(
          (row: any) =>
            Number(row.id) === Number(employee.attendanceRulesTemplate) &&
            row.isActive !== false,
        ) ||
        templates.find((row: any) => row.isDefault && row.isActive !== false),
      salary = Number(employee.baseSalary || 0),
      days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
      daily = salary / days;
    let amount = 0,
      late = 0,
      early = 0,
      total = 0,
      reason = "",
      source = "attendance_auto_deduction",
      notes = "";
    if (log.status === "Absent") {
      amount = daily;
      reason = "Absent and LOP";
      source = "Auto";
      notes = `Absent and LOP â€” ${salary.toFixed(2)} Ã· ${days} days`;
    } else if (log.status === "Half Day") {
      amount = daily / 2;
      reason = "Half day absent and LOP";
      source = "Auto";
      notes = "Half-day absence and LOP";
    } else if (log.checkInTime && log.checkOutTime) {
      const punchIn = minutes(log.checkInTime),
        punchOut =
          minutes(log.checkOutTime) +
          (minutes(log.checkOutTime) < punchIn ? 1440 : 0),
        shiftStart = minutes(template?.workStartTime || "09:00"),
        shiftEnd =
          minutes(template?.workEndTime || "17:00") +
          (minutes(template?.workEndTime || "17:00") <= shiftStart ? 1440 : 0),
        required = shiftEnd - shiftStart;
      if (template?.flexibleHours) {
        total = Math.max(0, required - (punchOut - punchIn));
        reason = total > required / 2 ? "half_day" : "flexible_hours_shortage";
      } else {
        late = Math.max(
          0,
          punchIn - shiftStart - Number(template?.lateThresholdMinutes || 0),
        );
        early = Math.max(0, shiftEnd - punchOut);
        total = late + early;
        reason =
          late && early ? "both" : late ? "late_punch_in" : "early_punch_out";
      }
      if (total) {
        const hours = total / 60,
          rate = salary / (days * Math.max(1, required / 60)),
          fine = Number(template?.finePerHour || 0);
        amount =
          template?.fineType === "percent_hourly_basis"
            ? ((rate * fine) / 100) * hours
            : template?.fineType === "based_on_salary"
              ? rate * hours
              : fine * hours;
        notes = `${reason.replaceAll("_", " ")} â€” ${total} minutes`;
      }
    }
    amount = Math.round(amount * 100) / 100;
    const old = oldRows.find(
      (row: any) => Number(row.attendanceId) === Number(log.id),
    );
    if (amount <= 0) {
      if (old)
        await db
          .delete(crewDeductionsTable)
          .where(eq(crewDeductionsTable.id, old.id));
      continue;
    }
    const values = {
      employeeId: employee.id,
      employeeName: employee.name,
      amount: String(amount),
      calculatedAmount: String(amount),
      notes,
      date: log.attendanceDate,
      month,
      year,
      status: "Approved",
      source,
      autoReason: reason,
      attendanceId: log.id,
      lateMinutes: late,
      earlyExitMinutes: early,
      totalDeductionMinutes: total,
      autoApproved: true,
      approvedAt: new Date(),
      updatedAt: new Date(),
    };
    if (old)
      await db
        .update(crewDeductionsTable)
        .set(values)
        .where(eq(crewDeductionsTable.id, old.id));
    else
      await db
        .insert(crewDeductionsTable)
        .values({ ...values, organizationId: org });
  }
}
router.get("/deductions", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crew.deductions.view")) return;
  const month = Number(req.query.month ?? new Date().getMonth()),
    year = Number(req.query.year ?? new Date().getFullYear());
  if (
    !Number.isInteger(month) ||
    month < 0 ||
    month > 11 ||
    !Number.isInteger(year)
  )
    return res.status(400).json({ error: "Valid month and year are required" });
  try {
    await syncAttendanceDeductions(req.crew.org, month, year);
    let rows = (
      await db
        .select()
        .from(crewDeductionsTable)
        .where(eq(crewDeductionsTable.organizationId, req.crew.org))
    ).filter((row: any) => row.month === month && row.year === year);
    rows = await scopedRows(req, rows, "deductions");
    return res.json(
      rows.sort(
        (a: any, b: any) =>
          String(b.date).localeCompare(String(a.date)) ||
          Number(b.id) - Number(a.id),
      ),
    );
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});
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
      source: "Manual",
      autoApproved: true,
      approvedBy: req.crew.user.id,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  void audit(req, "deduction", row.id, e.name, "create", null, row);
  if (e.userId) {
    await publishNotification({
      organizationId: req.crew.org,
      actorId: Number(req.crew.user.id),
      permissionKey: "crew.deductions.notification",
      recipientUserIds: [],
      directRecipientUserIds: [Number(e.userId)],
      eventType: "CREW_DEDUCTION_ADDED",
      eventKey: `crew-deduction:${row.id}:added`,
      sourceModule: "crew",
      targetModule: "crew",
      submodule: "deductions",
      title: "Deduction added",
      message: `A deduction of ₹${Number(row.amount).toLocaleString("en-IN")} was added to your salary for ${row.date}.`,
      sourceEntityType: "crew_deduction",
      sourceEntityId: row.id,
      sourceReference: e.employeeCode,
      navigationUrl: "/crew",
      metadata: {
        employeeId: e.id,
        date: row.date,
        amount: Number(row.amount),
        source: row.source,
      },
    });
  }
  res.locals.notificationHandled = true;
  return res.status(201).json(row);
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
  if (
    status === "Rejected" &&
    String(req.body.rejectionRemarks || "").trim().length < 10
  )
    return res
      .status(400)
      .json({ error: "Rejection remarks must contain at least 10 characters" });
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
      rejectedBy: status === "Rejected" ? req.crew.user.id : null,
      rejectedAt: status === "Rejected" ? new Date() : null,
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
