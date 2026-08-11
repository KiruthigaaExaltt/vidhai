import { Router } from "express";
import { db } from "@workspace/db";
import { rolesTable, usersTable } from "@workspace/db";
import { and, eq } from "@workspace/db";
import { requireAuth, requireAdmin } from "./auth";
import { organizationId, requirePermission } from "../lib/access";
import { normalizePermissions } from "../lib/permissionCatalog";

const router = Router();

const ALL_LOCATIONS = ["annur", "ooty", "coimbatore", "lab", "cross_site"];

function parsePerms(raw: string): string[] {
  try {
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
const responseRole = (role: any) => {
  const permissionKeys = normalizePermissions(parsePerms(role.permissions));
  const slug = String(role.slug || role.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  return {
    ...role,
    isSuperAdmin:
      Boolean(role.isSuperAdmin) ||
      role.systemKey === "SUPER_ADMIN" ||
      slug === "admin" ||
      slug === "super_admin",
    permissions: permissionKeys,
    permissionKeys,
  };
};

/** Ensure every organization has the canonical roles without deleting custom roles. */
export async function seedSystemRoles(org = 1) {
  const definitions = [
    {
      name: "admin",
      slug: "admin",
      description: "Full access to all locations and actions",
      permissions: {
        view: ALL_LOCATIONS,
        create: ALL_LOCATIONS,
        approve: ALL_LOCATIONS,
        delete: ALL_LOCATIONS,
      },
      isSuperAdmin: true,
    },
    {
      name: "location_manager",
      slug: "location_manager",
      description: "Can view, create, and approve for assigned locations",
      permissions: {
        view: ALL_LOCATIONS,
        create: ALL_LOCATIONS,
        approve: ALL_LOCATIONS,
        delete: [],
      },
      isSuperAdmin: false,
    },
    {
      name: "operator",
      slug: "operator",
      description: "Can view and create for assigned locations",
      permissions: {
        view: ALL_LOCATIONS,
        create: ALL_LOCATIONS,
        approve: [],
        delete: [],
      },
      isSuperAdmin: false,
    },
    {
      name: "viewer",
      slug: "viewer",
      description: "Read-only access to assigned locations",
      permissions: { view: ALL_LOCATIONS, create: [], approve: [], delete: [] },
      isSuperAdmin: false,
    },
  ];
  const existing = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.organizationId, org));
  for (const role of definitions) {
    if (
      existing.some(
        (item: any) =>
          String(item.slug || item.name)
            .trim()
            .toLowerCase() === role.slug,
      )
    )
      continue;
    try {
      await db.insert(rolesTable).values({
        ...role,
        organizationId: org,
        permissions: JSON.stringify(role.permissions),
        isSystem: true,
        isActive: true,
        updatedAt: new Date(),
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  }
}

// Seed the default organization at startup; GET also repairs the active organization.
seedSystemRoles().catch(() => {});

// GET /api/roles
router.get(
  "/",
  requirePermission("settings.user_management.view"),
  async (req, res) => {
    const org = organizationId(req);
    await seedSystemRoles(org);
    const rows = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.organizationId, org))
      .orderBy(rolesTable.id);
    return res.json(rows.map(responseRole));
  },
);
// POST /api/roles
router.post(
  "/",
  requirePermission("settings.user_management.manage_settings"),
  async (req, res) => {
    const { name, description } = req.body as any;
    const permissionKeys = normalizePermissions(
      req.body.permissionKeys ?? req.body.permissions ?? [],
    );
    if (!name?.trim())
      return res.status(400).json({ error: "name is required" });
    const normalizedName = name.trim().toLowerCase();
    const existingRoles = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.organizationId, organizationId(req)));
    const duplicate = existingRoles.find(
      (role: any) =>
        String(role.name).trim().toLowerCase() === normalizedName ||
        String(role.slug).trim().toLowerCase() ===
          normalizedName.replace(/[^a-z0-9]+/g, "_"),
    );
    if (duplicate)
      return res.status(409).json({
        error:
          duplicate.isSystem || duplicate.isSuperAdmin || duplicate.systemKey
            ? `The ${duplicate.name} role already exists and is protected`
            : `A role named ${duplicate.name} already exists`,
      });
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const [row] = await db
      .insert(rolesTable)
      .values({
        name: name.trim(),
        slug,
        organizationId: organizationId(req),
        description: description ?? null,
        permissions: JSON.stringify(permissionKeys),
        isSystem: false,
        isSuperAdmin: false,
        isActive: true,
        updatedAt: new Date(),
      })
      .returning();
    return res.status(201).json(responseRole(row));
  },
);

// PATCH /api/roles/:id
router.patch(
  "/:id",
  requirePermission("settings.user_management.manage_settings"),
  async (req, res) => {
    const id = Number(req.params.id);
    const { description, isActive } = req.body as any;
    const permissionKeys =
      req.body.permissionKeys === undefined &&
      req.body.permissions === undefined
        ? undefined
        : normalizePermissions(req.body.permissionKeys ?? req.body.permissions);
    const updates: Record<string, unknown> = {};
    const [existing] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.id, id));
    if (!existing || existing.organizationId !== organizationId(req))
      return res.status(404).json({ error: "Role not found" });
    if (existing.isSuperAdmin || existing.systemKey === "SUPER_ADMIN")
      return res
        .status(403)
        .json({ error: "Protected roles cannot be edited" });
    if (description !== undefined) updates.description = description;
    if (permissionKeys !== undefined)
      updates.permissions = JSON.stringify(permissionKeys);
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    updates.updatedAt = new Date();
    if (!Object.keys(updates).length)
      return res.status(400).json({ error: "Nothing to update" });
    const [row] = await db
      .update(rolesTable)
      .set(updates)
      .where(eq(rolesTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Role not found" });
    return res.json(responseRole(row));
  },
);

// DELETE /api/roles/:id — system roles are protected
router.delete(
  "/:id",
  requirePermission("settings.user_management.manage_settings"),
  async (req, res) => {
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.id, id));
    if (!existing || existing.organizationId !== organizationId(req))
      return res.status(404).json({ error: "Role not found" });
    if (existing.isSystem)
      return res.status(403).json({ error: "Cannot delete a system role" });
    const assigned = (
      await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.organizationId, organizationId(req)),
            eq(usersTable.role, existing.name),
          ),
        )
    ).length;
    if (assigned)
      return res
        .status(400)
        .json({ error: `Role is assigned to ${assigned} user(s)` });
    await db.delete(rolesTable).where(eq(rolesTable.id, id));
    return res.status(204).send();
  },
);

export default router;
