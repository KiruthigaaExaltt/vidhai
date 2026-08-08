import { Router } from "express";
import {
  and,
  db,
  departmentsTable,
  eq,
  purchaseRequestsTable,
} from "@workspace/db";

const router = Router();
const VALID_STATUSES = new Set(["Active", "Inactive"]);

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

function organizationId(req: any) {
  return Number((req.session as any)?.organizationId ?? 1);
}

function normalized(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

async function findDuplicate(org: number, name: string, excludeId?: number) {
  const departments = await db
    .select()
    .from(departmentsTable)
    .where(eq(departmentsTable.organizationId, org));
  return departments.find(
    (department: any) =>
      department.id !== excludeId &&
      normalized(department.name) === normalized(name),
  );
}

router.get("/", requireAuth, async (req, res) => {
  const org = organizationId(req);
  const departments = await db
    .select()
    .from(departmentsTable)
    .where(eq(departmentsTable.organizationId, org))
    .orderBy(departmentsTable.name);
  return res.json(departments);
});

router.post("/", requireAuth, async (req, res) => {
  const org = organizationId(req);
  const name = String(req.body.name ?? "").trim();
  const status = String(req.body.status ?? "Active").trim();
  if (!name)
    return res.status(400).json({ error: "Department name is required" });
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: "Invalid department status" });
  }
  if (await findDuplicate(org, name)) {
    return res.status(409).json({ error: "Department already exists." });
  }

  const [department] = await db
    .insert(departmentsTable)
    .values({
      organizationId: org,
      name,
      description: String(req.body.description ?? "").trim(),
      status,
      updatedAt: new Date(),
    })
    .returning();
  return res.status(201).json(department);
});

router.patch("/:id", requireAuth, async (req, res) => {
  const org = organizationId(req);
  const id = Number(req.params.id);
  const [existing] = await db
    .select()
    .from(departmentsTable)
    .where(
      and(
        eq(departmentsTable.id, id),
        eq(departmentsTable.organizationId, org),
      ),
    )
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Department not found" });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name)
      return res.status(400).json({ error: "Department name is required" });
    if (await findDuplicate(org, name, id)) {
      return res.status(409).json({ error: "Department already exists." });
    }
    updates.name = name;
  }
  if (req.body.description !== undefined) {
    updates.description = String(req.body.description).trim();
  }
  if (req.body.status !== undefined) {
    const status = String(req.body.status).trim();
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: "Invalid department status" });
    }
    updates.status = status;
  }

  const [department] = await db
    .update(departmentsTable)
    .set(updates)
    .where(eq(departmentsTable.id, id))
    .returning();
  return res.json(department);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const org = organizationId(req);
  const id = Number(req.params.id);
  const [department] = await db
    .select()
    .from(departmentsTable)
    .where(
      and(
        eq(departmentsTable.id, id),
        eq(departmentsTable.organizationId, org),
      ),
    )
    .limit(1);
  if (!department)
    return res.status(404).json({ error: "Department not found" });

  const requests = await db
    .select()
    .from(purchaseRequestsTable)
    .where(eq(purchaseRequestsTable.organizationId, org));
  const isReferenced = requests.some(
    (request: any) =>
      Number(request.departmentId) === id ||
      (!request.departmentId &&
        normalized(request.department) === normalized(department.name)),
  );

  if (isReferenced) {
    const [inactive] = await db
      .update(departmentsTable)
      .set({ status: "Inactive", updatedAt: new Date() })
      .where(eq(departmentsTable.id, id))
      .returning();
    return res.json({ department: inactive, deactivated: true });
  }

  await db.delete(departmentsTable).where(eq(departmentsTable.id, id));
  return res.json({ department, deactivated: false });
});

export default router;
