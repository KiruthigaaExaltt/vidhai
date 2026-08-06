import { Router } from "express";
import { db } from "@workspace/db";
import { rolesTable } from "@workspace/db";
import { eq } from "@workspace/db";
import { requireAuth, requireAdmin } from "./auth";
import { organizationId, requirePermission } from "../lib/access";

const router = Router();

const ALL_LOCATIONS = ["annur", "ooty", "coimbatore", "lab", "cross_site"];

function parsePerms(raw: string): Record<string, string[]> {
  try { return JSON.parse(raw ?? "{}"); } catch { return {}; }
}

/** Idempotently seed the four canonical system roles on first run. */
export async function seedSystemRoles() {
  const existing = await db.select({ id: rolesTable.id }).from(rolesTable).limit(1);
  if (existing.length > 0) return;

  await db.insert(rolesTable).values([
    {
      name: "admin",
      slug: "admin",
      description: "Full access to all locations and actions",
      permissions: JSON.stringify({ view: ALL_LOCATIONS, create: ALL_LOCATIONS, approve: ALL_LOCATIONS, delete: ALL_LOCATIONS }),
      isSystem: true,
    },
    {
      name: "location_manager",
      slug: "location_manager",
      description: "Can view, create, and approve for assigned locations",
      permissions: JSON.stringify({ view: ALL_LOCATIONS, create: ALL_LOCATIONS, approve: ALL_LOCATIONS, delete: [] }),
      isSystem: true,
    },
    {
      name: "operator",
      slug: "operator",
      description: "Can view and create for assigned locations",
      permissions: JSON.stringify({ view: ALL_LOCATIONS, create: ALL_LOCATIONS, approve: [], delete: [] }),
      isSystem: true,
    },
    {
      name: "viewer",
      slug: "viewer",
      description: "Read-only access to assigned locations",
      permissions: JSON.stringify({ view: ALL_LOCATIONS, create: [], approve: [], delete: [] }),
      isSystem: true,
    },
  ]);
}

// Seed on module load (idempotent — safe to call every startup)
seedSystemRoles().catch(() => {});

// GET /api/roles
router.get("/", requirePermission("settings.user_management.view"), async (req, res) => {
  const rows = await db.select().from(rolesTable).where(eq(rolesTable.organizationId, organizationId(req))).orderBy(rolesTable.id);
  return res.json(rows.map((r) => ({ ...r, permissions: parsePerms(r.permissions) })));
});

// POST /api/roles
router.post("/", requirePermission("settings.user_management.manage_settings"), async (req, res) => {
  const { name, description, permissions } = req.body as any;
  if (!name?.trim()) return res.status(400).json({ error: "name is required" });
  if (name.trim().toLowerCase() === "admin") return res.status(403).json({ error: "Super Admin role cannot be created" });
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const [row] = await db
    .insert(rolesTable)
    .values({ name: name.trim(), slug, organizationId: organizationId(req), description: description ?? null, permissions: JSON.stringify(permissions ?? []), isSystem: false, isSuperAdmin: false, isActive: true, updatedAt: new Date() })
    .returning();
  return res.status(201).json({ ...row, permissions: parsePerms(row.permissions) });
});

// PATCH /api/roles/:id
router.patch("/:id", requirePermission("settings.user_management.manage_settings"), async (req, res) => {
  const id = Number(req.params.id);
  const { description, permissions } = req.body as any;
  const updates: Record<string, unknown> = {};
  const [existing] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
  if (!existing || existing.organizationId !== organizationId(req)) return res.status(404).json({ error: "Role not found" });
  if (existing.isSystem || existing.isSuperAdmin || existing.systemKey) return res.status(403).json({ error: "Protected roles cannot be edited" });
  if (description !== undefined) updates.description = description;
  if (permissions !== undefined) updates.permissions = JSON.stringify(permissions);
  updates.updatedAt = new Date();
  if (!Object.keys(updates).length) return res.status(400).json({ error: "Nothing to update" });
  const [row] = await db.update(rolesTable).set(updates).where(eq(rolesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Role not found" });
  return res.json({ ...row, permissions: parsePerms(row.permissions) });
});

// DELETE /api/roles/:id — system roles are protected
router.delete("/:id", requirePermission("settings.user_management.manage_settings"), async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
  if (!existing || existing.organizationId !== organizationId(req)) return res.status(404).json({ error: "Role not found" });
  if (existing.isSystem) return res.status(403).json({ error: "Cannot delete a system role" });
  await db.delete(rolesTable).where(eq(rolesTable.id, id));
  return res.status(204).send();
});

export default router;
