import { Router } from "express";
import { and, db, employeesTable, eq, usersTable } from "@workspace/db";
import {
  effectivePermissions,
  getAuthUser,
  organizationId,
  requirePermission,
} from "../lib/access";
import {
  hashPassword,
  temporaryPassword,
  verifyPassword,
} from "../lib/password";

const router = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-z0-9_]+$/;
const parse = <T>(value: unknown, fallback: T): T => {
  try {
    return typeof value === "string" ? JSON.parse(value) : (value as T);
  } catch {
    return fallback;
  }
};
const safe = (u: any) => {
  const { passwordHash, ...rest } = u;
  return {
    ...rest,
    locationScope: parse(rest.locationScope, []),
    permissionOverrides: parse(rest.permissionOverrides, []),
  };
};
const protectedUser = (u: any) =>
  u.role === "admin" &&
  (u.isSystemGenerated ||
    u.systemKey ||
    u.username === process.env.BOOTSTRAP_ADMIN_USERNAME);

async function syncEmployeeLink(
  org: number,
  userId: number,
  employeeId: number | null,
) {
  const employees = (
    await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, org))
  ).filter((employee: any) => !employee.isDeleted);
  for (const employee of employees.filter(
    (item: any) =>
      Number(item.userId) === userId && Number(item.id) !== Number(employeeId),
  ))
    await db
      .update(employeesTable)
      .set({ userId: null, updatedAt: new Date() })
      .where(eq(employeesTable.id, employee.id));
  if (!employeeId) return null;
  const employee = employees.find(
    (item: any) => Number(item.id) === employeeId,
  );
  if (!employee) throw new Error("Selected employee is unavailable");
  if (employee.userId && Number(employee.userId) !== userId)
    throw new Error("Selected employee is already linked to another user");
  await db
    .update(employeesTable)
    .set({ userId, updatedAt: new Date() })
    .where(eq(employeesTable.id, employee.id));
  return employee;
}

async function activeUsers(org: number) {
  return (
    await db.select().from(usersTable).where(eq(usersTable.organizationId, org))
  ).filter((u: any) => u.isDeleted !== true);
}
function identity(body: any) {
  const username = String(body.username ?? "")
      .trim()
      .toLowerCase(),
    email = String(body.email ?? "")
      .trim()
      .toLowerCase();
  if (!username && !email)
    throw new Error("At least email or username is required");
  if (username && !usernamePattern.test(username))
    throw new Error(
      "Username may contain only lowercase letters, numbers, and underscore",
    );
  if (email && !emailPattern.test(email))
    throw new Error("A valid email is required");
  return { username, email };
}

router.get(
  "/",
  requirePermission("settings.user_management.view"),
  async (req, res) =>
    res.json(
      (await activeUsers(organizationId(req)))
        .filter((u) => !protectedUser(u))
        .map(safe),
    ),
);
router.get(
  "/employee-options",
  requirePermission("settings.user_management.view"),
  async (req, res) => {
    const rows = (
      await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, organizationId(req)))
    ).filter((employee: any) => !employee.isDeleted);
    return res.json(
      rows.map((employee: any) => ({
        id: employee.id,
        userId: employee.userId,
        employeeCode: employee.employeeCode,
        name: employee.name,
        department: employee.department,
        designation: employee.designation,
        email: employee.email,
        photoUrl: employee.photoUrl,
        status: employee.status,
      })),
    );
  },
);
router.post(
  "/",
  requirePermission("settings.user_management.create"),
  async (req, res) => {
    try {
      const org = organizationId(req),
        { username, email } = identity(req.body),
        name = String(req.body.name ?? req.body.displayName ?? "").trim();
      if (!name) return res.status(400).json({ error: "Name is required" });
      if (req.body.role === "admin")
        return res
          .status(403)
          .json({ error: "Super Admin cannot be assigned" });
      const users = await activeUsers(org);
      if (
        users.some(
          (u) => username && String(u.username).toLowerCase() === username,
        )
      )
        return res.status(400).json({ error: "Username already exists" });
      if (
        users.some(
          (u) => email && String(u.email ?? "").toLowerCase() === email,
        )
      )
        return res.status(400).json({ error: "Email already exists" });
      const password = temporaryPassword();
      const [user] = await db
        .insert(usersTable)
        .values({
          username,
          email: email || null,
          passwordHash: hashPassword(password),
          displayName: name,
          name,
          role: req.body.role || "viewer",
          locationScope: JSON.stringify(req.body.locationScope ?? []),
          organizationId: org,
          employeeId: req.body.employeeId ?? null,
          employeeName: req.body.employeeName ?? null,
          department: req.body.department ?? null,
          userType: req.body.userType || "USER",
          permissionOverrides: "[]",
          sessionVersion: 0,
          isDeleted: false,
          isActive: true,
          isSystemGenerated: false,
        })
        .returning();
      const employee = await syncEmployeeLink(
        org,
        Number(user.id),
        req.body.employeeId ? Number(req.body.employeeId) : null,
      );
      if (employee) {
        const [linked] = await db
          .update(usersTable)
          .set({ employeeName: employee.name, department: employee.department })
          .where(eq(usersTable.id, user.id))
          .returning();
        Object.assign(user, linked);
      }
      return res
        .status(201)
        .json({ ...safe(user), temporaryPassword: password });
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  },
);
router.get(
  "/:id",
  requirePermission("settings.user_management.view"),
  async (req, res) => {
    const [u] = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, Number(req.params.id)),
          eq(usersTable.organizationId, organizationId(req)),
        ),
      );
    if (!u || u.isDeleted)
      return res.status(404).json({ error: "User not found" });
    return res.json(safe(u));
  },
);
router.get(
  "/:id/access",
  requirePermission("settings.user_management.view"),
  async (req, res) => {
    const [u] = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, Number(req.params.id)),
          eq(usersTable.organizationId, organizationId(req)),
        ),
      );
    if (!u || u.isDeleted || protectedUser(u))
      return res.status(404).json({ error: "User not found" });
    return res.json({
      ...safe(u),
      effectivePermissions: await effectivePermissions(u),
    });
  },
);
router.put(
  "/:id/access",
  requirePermission("settings.user_management.update"),
  async (req, res) => {
    const org = organizationId(req),
      id = Number(req.params.id),
      [u] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, org)));
    if (!u || u.isDeleted)
      return res.status(404).json({ error: "User not found" });
    if (protectedUser(u))
      return res.status(403).json({ error: "Protected user cannot be edited" });
    if (req.body.role === "admin")
      return res.status(403).json({ error: "Super Admin cannot be assigned" });
    const updates: any = { sessionVersion: Number(u.sessionVersion ?? 0) + 1 };
    for (const key of ["role", "employeeId", "employeeName", "department"])
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    if (req.body.locationScope !== undefined)
      updates.locationScope = JSON.stringify(req.body.locationScope);
    if (req.body.permissionOverrides !== undefined)
      updates.permissionOverrides = JSON.stringify(
        req.body.permissionOverrides,
      );
    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, org)))
      .returning();
    if (req.body.employeeId !== undefined) {
      const employee = await syncEmployeeLink(
        org,
        id,
        req.body.employeeId ? Number(req.body.employeeId) : null,
      );
      if (employee) {
        updated.employeeName = employee.name;
        updated.department = employee.department;
      }
    }
    return res.json(safe(updated));
  },
);
router.patch(
  "/:id",
  requirePermission("settings.user_management.update"),
  async (req, res) => {
    const org = organizationId(req),
      id = Number(req.params.id),
      [u] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, org)));
    if (!u || u.isDeleted)
      return res.status(404).json({ error: "User not found" });
    if (protectedUser(u))
      return res.status(403).json({ error: "Protected user cannot be edited" });
    try {
      const updates: any = {
        sessionVersion: Number(u.sessionVersion ?? 0) + 1,
      };
      if (req.body.email !== undefined || req.body.username !== undefined)
        Object.assign(
          updates,
          identity({
            email: req.body.email ?? u.email,
            username: req.body.username ?? u.username,
          }),
        );
      for (const key of [
        "displayName",
        "role",
        "employeeId",
        "employeeName",
        "department",
      ])
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      if (updates.role === "admin")
        return res
          .status(403)
          .json({ error: "Super Admin cannot be assigned" });
      if (req.body.locationScope !== undefined)
        updates.locationScope = JSON.stringify(req.body.locationScope);
      const all = await activeUsers(org);
      if (
        all.some(
          (x) =>
            x.id !== id &&
            updates.username &&
            String(x.username).toLowerCase() === updates.username,
        )
      )
        return res.status(400).json({ error: "Username already exists" });
      if (
        all.some(
          (x) =>
            x.id !== id &&
            updates.email &&
            String(x.email ?? "").toLowerCase() === updates.email,
        )
      )
        return res.status(400).json({ error: "Email already exists" });
      const [updated] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, id))
        .returning();
      if (req.body.employeeId !== undefined)
        await syncEmployeeLink(
          org,
          id,
          req.body.employeeId ? Number(req.body.employeeId) : null,
        );
      return res.json(safe(updated));
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  },
);
router.patch(
  "/:id/role",
  requirePermission("settings.user_management.update"),
  async (req, res) => {
    req.body = { role: req.body.role };
    return res
      .status(307)
      .set("Location", `${req.baseUrl}/${req.params.id}`)
      .send();
  },
);
router.patch(
  "/:id/email",
  requirePermission("settings.user_management.update"),
  async (req, res) => {
    const org = organizationId(req),
      id = Number(req.params.id),
      [u] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, org)));
    if (!u || u.isDeleted)
      return res.status(404).json({ error: "User not found" });
    try {
      const ids = identity({
        email: req.body.email,
        username: req.body.username ?? u.username,
      });
      const all = await activeUsers(org);
      if (
        all.some(
          (x) =>
            x.id !== id &&
            ids.email &&
            String(x.email ?? "").toLowerCase() === ids.email,
        )
      )
        return res.status(400).json({ error: "Email already exists" });
      const [updated] = await db
        .update(usersTable)
        .set({ ...ids, sessionVersion: Number(u.sessionVersion ?? 0) + 1 })
        .where(eq(usersTable.id, id))
        .returning();
      return res.json(safe(updated));
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  },
);
router.post(
  "/:id/reset-password",
  requirePermission("settings.user_management.update"),
  async (req, res) => {
    const org = organizationId(req),
      id = Number(req.params.id),
      [u] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, org)));
    if (!u || u.isDeleted)
      return res.status(404).json({ error: "User not found" });
    if (protectedUser(u))
      return res
        .status(403)
        .json({ error: "Super Admin password cannot be reset here" });
    const password = String(req.body.newPassword ?? "");
    if (password.length < 8)
      return res
        .status(400)
        .json({ error: "Password must contain at least 8 characters" });
    if (password !== req.body.confirmPassword)
      return res.status(400).json({ error: "Passwords do not match" });
    await db
      .update(usersTable)
      .set({
        passwordHash: hashPassword(password),
        sessionVersion: Number(u.sessionVersion ?? 0) + 1,
      })
      .where(eq(usersTable.id, id));
    return res.json({ success: true });
  },
);
router.post("/me/password", async (req, res) => {
  const u = await getAuthUser(req);
  if (!u) return res.status(401).json({ error: "Not authenticated" });
  const next = String(req.body.newPassword ?? "");
  if (!verifyPassword(String(req.body.oldPassword ?? ""), u.passwordHash))
    return res.status(400).json({ error: "Current password is incorrect" });
  if (next.length < 8)
    return res
      .status(400)
      .json({ error: "Password must contain at least 8 characters" });
  if (next !== req.body.confirmPassword)
    return res.status(400).json({ error: "Passwords do not match" });
  await db
    .update(usersTable)
    .set({
      passwordHash: hashPassword(next),
      sessionVersion: Number(u.sessionVersion ?? 0) + 1,
    })
    .where(eq(usersTable.id, u.id));
  return res.json({ success: true });
});
router.post(
  "/sync-roles",
  requirePermission("settings.user_management.update"),
  async (req, res) => {
    const users = (await activeUsers(organizationId(req))).filter(
      (u) => !protectedUser(u),
    );
    for (const u of users)
      await db
        .update(usersTable)
        .set({ sessionVersion: Number(u.sessionVersion ?? 0) + 1 })
        .where(eq(usersTable.id, u.id));
    return res.json({ success: true, syncedUsers: users.length });
  },
);
router.patch(
  "/:id/deactivate",
  requirePermission("settings.user_management.update"),
  async (req, res) => {
    const actor = await getAuthUser(req),
      id = Number(req.params.id),
      org = organizationId(req);
    if (actor?.id === id)
      return res
        .status(400)
        .json({ error: "You cannot deactivate your own account" });
    const [u] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, org)));
    if (!u || u.isDeleted)
      return res.status(404).json({ error: "User not found" });
    if (protectedUser(u))
      return res
        .status(403)
        .json({ error: "Protected user cannot be deactivated" });
    const now = new Date();
    const [updated] = await db
      .update(usersTable)
      .set({
        isActive: false,
        deactivatedAt: now,
        deactivatedBy: actor?.id ?? null,
        sessionVersion: Number(u.sessionVersion ?? 0) + 1,
      })
      .where(eq(usersTable.id, id))
      .returning();
    if (u.employeeId)
      await db
        .update(employeesTable)
        .set({ status: "inactive", exitDate: now, updatedAt: now })
        .where(
          and(
            eq(employeesTable.id, Number(u.employeeId)),
            eq(employeesTable.organizationId, org),
          ),
        );
    return res.json(safe(updated));
  },
);
router.patch(
  "/:id/activate",
  requirePermission("settings.user_management.update"),
  async (req, res) => {
    const id = Number(req.params.id),
      org = organizationId(req);
    const [u] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.organizationId, org)));
    if (!u || u.isDeleted)
      return res.status(404).json({ error: "User not found" });
    const [updated] = await db
      .update(usersTable)
      .set({
        isActive: true,
        deactivatedAt: null,
        deactivatedBy: null,
        sessionVersion: Number(u.sessionVersion ?? 0) + 1,
      })
      .where(eq(usersTable.id, id))
      .returning();
    if (req.body.restoreEmployee && u.employeeId)
      await db
        .update(employeesTable)
        .set({ status: "active", exitDate: null, updatedAt: new Date() })
        .where(
          and(
            eq(employeesTable.id, Number(u.employeeId)),
            eq(employeesTable.organizationId, org),
          ),
        );
    return res.json(safe(updated));
  },
);
router.delete(
  "/:id",
  requirePermission("settings.user_management.delete"),
  async (req, res) => {
    const actor = await getAuthUser(req),
      id = Number(req.params.id);
    if (actor?.id === id)
      return res
        .status(400)
        .json({ error: "You cannot deactivate your own account" });
    const [u] = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, id),
          eq(usersTable.organizationId, organizationId(req)),
        ),
      );
    if (!u || u.isDeleted)
      return res.status(404).json({ error: "User not found" });
    if (protectedUser(u))
      return res
        .status(403)
        .json({ error: "Protected user cannot be deactivated" });
    const now = new Date();
    await db
      .update(usersTable)
      .set({
        isDeleted: true,
        isActive: false,
        deletedAt: now,
        deletedBy: actor?.id ?? null,
        deactivatedAt: now,
        deactivatedBy: actor?.id ?? null,
        sessionVersion: Number(u.sessionVersion ?? 0) + 1,
      })
      .where(eq(usersTable.id, id));
    if (u.employeeId)
      await db
        .update(employeesTable)
        .set({
          isDeleted: true,
          status: "inactive",
          deletedAt: now,
          deletedBy: actor?.id ?? null,
          exitDate: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(employeesTable.id, Number(u.employeeId)),
            eq(employeesTable.organizationId, organizationId(req)),
          ),
        );
    return res.status(204).send();
  },
);

export default router;
