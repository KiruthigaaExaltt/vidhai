import { Router } from "express";
import {
  and,
  assetAllocationsTable,
  assetsTable,
  db,
  desc,
  employeesTable,
  eq,
  ilike,
  or,
} from "@workspace/db";
import { paginateQuery, paginatedResponse } from "../lib/pagination";

const router = Router();
const statuses = new Set([
  "Active",
  "Inactive",
  "Under Maintenance",
  "Retired",
]);
const date = /^\d{4}-\d{2}-\d{2}$/;
const positive = (value: unknown) =>
  Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const nonNegative = (value: unknown) =>
  Number.isFinite(Number(value ?? 0)) && Number(value ?? 0) >= 0
    ? Number(value ?? 0)
    : null;
const assetJson = (asset: any) => ({
  ...asset,
  totalQuantity: Number(asset.totalQuantity),
  allocatedQuantity: Number(asset.allocatedQuantity),
  availableQuantity: Number(asset.availableQuantity),
  purchaseValue: Number(asset.purchaseValue),
  unitPrice: Number(asset.unitPrice),
});
const auth = (req: any, res: any, next: any) =>
  req.session?.userId
    ? next()
    : res.status(401).json({ error: "Not authenticated" });

router.use(auth);
router.get("/", async (req, res) => {
  const pagination = paginateQuery(req.query);
  const search = String(req.query.search || "").trim();
  const filter = and(
    eq(assetsTable.isDeleted, false),
    search
      ? or(
          ilike(assetsTable.sku, `%${search}%`),
          ilike(assetsTable.name, `%${search}%`),
          ilike(assetsTable.category, `%${search}%`),
        )
      : undefined,
  );
  const [data, totalCount] = await Promise.all([
    db
      .select()
      .from(assetsTable)
      .where(filter)
      .orderBy(desc(assetsTable.createdAt))
      .offset(pagination.skip)
      .limit(pagination.limit),
    db.count(assetsTable, filter),
  ]);
  res.json(paginatedResponse(data.map(assetJson), totalCount, pagination));
});
router.get("/allocations", async (req, res): Promise<any> => {
  const pagination = paginateQuery(req.query);
  const search = String(req.query.search || "").toLowerCase();
  let rows: any[] = await db
    .select({
      allocation: assetAllocationsTable,
      asset: assetsTable,
      employee: employeesTable,
    })
    .from(assetAllocationsTable)
    .innerJoin(assetsTable, eq(assetAllocationsTable.assetId, assetsTable.id))
    .innerJoin(
      employeesTable,
      eq(assetAllocationsTable.employeeId, employeesTable.id),
    )
    .where(eq(assetAllocationsTable.status, "Allocated"))
    .orderBy(desc(assetAllocationsTable.createdAt));
  if (search)
    rows = rows.filter((r) =>
      `${r.asset.sku} ${r.asset.name} ${r.employee.name}`
        .toLowerCase()
        .includes(search),
    );
  const totalCount = rows.length;
  const data = rows
    .slice(pagination.skip, pagination.skip + pagination.limit)
    .map((r) => ({
      ...r.allocation,
      quantity: Number(r.allocation.quantity),
      asset: assetJson(r.asset),
      employee: {
        id: r.employee.id,
        name: r.employee.name,
        employeeCode: r.employee.employeeCode,
      },
    }));
  res.json(paginatedResponse(data, totalCount, pagination));
});
router.post("/", async (req, res): Promise<any> => {
  const b = req.body || {},
    quantity = positive(b.totalQuantity),
    value = nonNegative(b.purchaseValue);
  if (
    !String(b.sku || "").trim() ||
    !String(b.name || "").trim() ||
    !String(b.category || "").trim() ||
    !date.test(b.purchaseDate || "")
  )
    return res
      .status(400)
      .json({
        error: "SKU, asset name, category, and purchase date are required",
      });
  if (quantity == null || value == null || !statuses.has(b.status || "Active"))
    return res
      .status(400)
      .json({ error: "Invalid status, quantity, or purchase value" });
  if (
    (
      await db
        .select()
        .from(assetsTable)
        .where(eq(assetsTable.sku, String(b.sku).trim()))
        .limit(1)
    ).length
  )
    return res.status(409).json({ error: "SKU already exists" });
  const [created] = await db
    .insert(assetsTable)
    .values({
      sku: String(b.sku).trim(),
      name: String(b.name).trim(),
      category: String(b.category).trim(),
      status: b.status || "Active",
      totalQuantity: String(quantity),
      allocatedQuantity: "0",
      availableQuantity: String(quantity),
      purchaseValue: String(value),
      unitPrice: String(value / quantity),
      imageUrl: b.imageUrl || null,
      purchaseDate: b.purchaseDate,
      qrPayload: "pending",
      isDeleted: false,
    })
    .returning();
  const [asset] = await db
    .update(assetsTable)
    .set({
      qrPayload: JSON.stringify({
        assetId: created.id,
        sku: created.sku,
        name: created.name,
      }),
      updatedAt: new Date(),
    })
    .where(eq(assetsTable.id, created.id))
    .returning();
  res.status(201).json(assetJson(asset));
});
router.patch("/:id", async (req, res): Promise<any> => {
  const id = Number(req.params.id),
    [old] = await db
      .select()
      .from(assetsTable)
      .where(and(eq(assetsTable.id, id), eq(assetsTable.isDeleted, false)))
      .limit(1);
  if (!old) return res.status(404).json({ error: "Asset not found" });
  const b = req.body || {},
    total =
      b.totalQuantity === undefined
        ? Number(old.totalQuantity)
        : positive(b.totalQuantity),
    value =
      b.purchaseValue === undefined
        ? Number(old.purchaseValue)
        : nonNegative(b.purchaseValue),
    status = b.status ?? old.status;
  if (
    total == null ||
    value == null ||
    total < Number(old.allocatedQuantity) ||
    !statuses.has(status)
  )
    return res
      .status(400)
      .json({
        error: "Invalid asset update or total below allocated quantity",
      });
  const sku = String(b.sku ?? old.sku).trim(),
    duplicate = await db
      .select()
      .from(assetsTable)
      .where(eq(assetsTable.sku, sku))
      .limit(1);
  if (!sku || duplicate.some((a: any) => a.id !== id))
    return res.status(409).json({ error: "SKU already exists" });
  const name = String(b.name ?? old.name).trim(),
    category = String(b.category ?? old.category).trim();
  if (
    !name ||
    !category ||
    (b.purchaseDate !== undefined && !date.test(b.purchaseDate))
  )
    return res.status(400).json({ error: "Invalid asset details" });
  const [asset] = await db
    .update(assetsTable)
    .set({
      sku,
      name,
      category,
      status,
      totalQuantity: String(total),
      allocatedQuantity: old.allocatedQuantity,
      availableQuantity: String(total - Number(old.allocatedQuantity)),
      purchaseValue: String(value),
      unitPrice: String(value / total),
      imageUrl: b.imageUrl === undefined ? old.imageUrl : b.imageUrl || null,
      purchaseDate: b.purchaseDate ?? old.purchaseDate,
      qrPayload: JSON.stringify({ assetId: id, sku, name }),
      updatedAt: new Date(),
    })
    .where(eq(assetsTable.id, id))
    .returning();
  res.json(assetJson(asset));
});
router.delete("/:id", async (req, res): Promise<any> => {
  const id = Number(req.params.id),
    [asset] = await db
      .select()
      .from(assetsTable)
      .where(and(eq(assetsTable.id, id), eq(assetsTable.isDeleted, false)))
      .limit(1);
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  if (Number(asset.allocatedQuantity) > 0)
    return res
      .status(409)
      .json({ error: "Allocated assets cannot be deleted" });
  await db
    .update(assetsTable)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(assetsTable.id, id));
  res.status(204).send();
});
router.post(
  "/allocations/:allocationId/deallocate",
  async (req, res): Promise<any> => {
    const allocationId = Number(req.params.allocationId);
    if (!Number.isInteger(allocationId))
      return res.status(400).json({ error: "Invalid allocation" });
    try {
      const result = await db.transaction(async (tx: any) => {
        const [allocation] = await tx
          .select()
          .from(assetAllocationsTable)
          .where(eq(assetAllocationsTable.id, allocationId))
          .limit(1);
        if (!allocation) throw new Error("Allocation not found");
        if (allocation.status !== "Allocated")
          throw new Error("Allocation has already been deallocated");
        const [asset] = await tx
          .select()
          .from(assetsTable)
          .where(
            and(
              eq(assetsTable.id, allocation.assetId),
              eq(assetsTable.isDeleted, false),
            ),
          )
          .limit(1);
        if (!asset) throw new Error("Asset not found");
        const quantity = Number(allocation.quantity),
          allocated = Number(asset.allocatedQuantity),
          available = Number(asset.availableQuantity),
          total = Number(asset.totalQuantity);
        if (
          !Number.isFinite(quantity) ||
          quantity <= 0 ||
          allocated < quantity ||
          available + quantity > total
        )
          throw new Error("Asset quantity data is invalid");
        const [updated] = await tx
          .update(assetsTable)
          .set({
            allocatedQuantity: String(allocated - quantity),
            availableQuantity: String(available + quantity),
            updatedAt: new Date(),
          })
          .where(eq(assetsTable.id, asset.id))
          .returning();
        const [deallocated] = await tx
          .update(assetAllocationsTable)
          .set({
            status: "Deallocated",
            returnedDate: new Date().toISOString().slice(0, 10),
            updatedAt: new Date(),
          })
          .where(eq(assetAllocationsTable.id, allocationId))
          .returning();
        return { updated, deallocated };
      });
      res.json({
        asset: assetJson(result.updated),
        allocation: {
          ...result.deallocated,
          quantity: Number(result.deallocated.quantity),
        },
      });
    } catch (e: any) {
      res
        .status(
          e.message?.includes("not found")
            ? 404
            : e.message?.includes("already")
              ? 409
              : 400,
        )
        .json({ error: e.message || "Deallocation failed" });
    }
  },
);
router.post("/:id/allocate", async (req, res): Promise<any> => {
  const id = Number(req.params.id),
    employeeId = Number(req.body?.employeeId),
    quantity = positive(req.body?.quantity),
    allocatedDate = String(req.body?.allocatedDate || "");
  if (
    !Number.isInteger(employeeId) ||
    quantity == null ||
    !date.test(allocatedDate)
  )
    return res
      .status(400)
      .json({ error: "Employee, quantity, and allocation date are required" });
  try {
    const result = await db.transaction(async (tx: any) => {
      const [asset] = await tx
          .select()
          .from(assetsTable)
          .where(and(eq(assetsTable.id, id), eq(assetsTable.isDeleted, false)))
          .limit(1),
        [employee] = await tx
          .select()
          .from(employeesTable)
          .where(
            and(
              eq(employeesTable.id, employeeId),
              eq(employeesTable.isDeleted, false),
            ),
          )
          .limit(1);
      if (!asset || !employee)
        throw new Error(!asset ? "Asset not found" : "Employee not found");
      if (quantity > Number(asset.availableQuantity))
        throw new Error("Allocation quantity exceeds available quantity");
      const [allocation] = await tx
        .insert(assetAllocationsTable)
        .values({
          assetId: id,
          employeeId,
          quantity: String(quantity),
          status: "Allocated",
          allocatedDate,
        })
        .returning();
      const [updated] = await tx
        .update(assetsTable)
        .set({
          allocatedQuantity: String(Number(asset.allocatedQuantity) + quantity),
          availableQuantity: String(Number(asset.availableQuantity) - quantity),
          updatedAt: new Date(),
        })
        .where(eq(assetsTable.id, id))
        .returning();
      return { allocation, updated, employee };
    });
    res
      .status(201)
      .json({
        asset: assetJson(result.updated),
        allocation: {
          ...result.allocation,
          quantity: Number(result.allocation.quantity),
          employee: {
            id: result.employee.id,
            name: result.employee.name,
            employeeCode: result.employee.employeeCode,
          },
        },
      });
  } catch (e: any) {
    res
      .status(e.message?.includes("not found") ? 404 : 400)
      .json({ error: e.message || "Allocation failed" });
  }
});
export default router;
