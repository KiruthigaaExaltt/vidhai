import { Router } from "express";
import { db } from "@workspace/db";
import {
  inventoryTable,
  inventoryAdjustmentsTable,
  inventoryMovementsTable,
  materialsTable,
  inventoryLocationsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc } from "@workspace/db";
import { paginateQuery, paginatedResponse } from "../lib/pagination";
import { PROTECTED_VAULT_ITEM_NAMES } from "../lib/ensureDefaultVaultItems";
import { isCoreProductMasterItem } from "../lib/coreProductMaster";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId)
    return res.status(401).json({ error: "Not authenticated" });
  next();
}

// List inventory (unified product catalog with stock levels)
router.get("/", requireAuth, async (req, res) => {
  const rows = await db
    .select({
      inv: inventoryTable,
      material: materialsTable,
      locationName: inventoryLocationsTable.locationName,
    })
    .from(inventoryTable)
    .innerJoin(materialsTable, eq(inventoryTable.materialId, materialsTable.id))
    .leftJoin(
      inventoryLocationsTable,
      eq(inventoryTable.locationId, inventoryLocationsTable.id),
    )
    .orderBy(materialsTable.name);

  let data = rows.map((r) => ({
    id: r.inv.id,
    materialId: r.material.id,
    materialName: r.material.name,
    isProtected: PROTECTED_VAULT_ITEM_NAMES.has(
      r.material.name.trim().toLowerCase(),
    ),
    sku: r.material.sku,
    category: r.material.category,
    categoryId: r.material.categoryId,
    attributeValues: r.material.attributeValues,
    unit: r.material.unit,
    quantityOnHand: Number(r.inv.quantityOnHand),
    locationId: r.inv.locationId,
    locationName: r.locationName ?? null,
    costBasis: r.inv.costBasis !== null ? Number(r.inv.costBasis) : null,
    buyPricePerUnit:
      r.material.buyPricePerUnit !== null
        ? Number(r.material.buyPricePerUnit)
        : null,
    sellPricePerUnit:
      r.material.sellPricePerUnit !== null
        ? Number(r.material.sellPricePerUnit)
        : null,
    hsnSac: r.material.hsnSac,
    gstPercent:
      r.material.gstPercent !== null ? Number(r.material.gstPercent) : 0,
    itemType: r.material.itemType,
    criticalLevel:
      r.material.criticalLevel !== null
        ? Number(r.material.criticalLevel)
        : null,
    imageUrl: r.material.imageUrl,
    qrCode: r.material.qrCode,
    lastUpdated: r.inv.lastUpdated,
  }));
  if (String(req.query.coreOnly || "").toLowerCase() === "true")
    data = data.filter((row) => isCoreProductMasterItem(row.materialName));
  const search = String(req.query.search || "")
    .trim()
    .toLowerCase();
  if (search)
    data = data.filter((row) =>
      [row.materialName, row.sku, row.category, row.locationName].some(
        (value) =>
          String(value || "")
            .toLowerCase()
            .includes(search),
      ),
    );
  if (req.query.skip === undefined && req.query.limit === undefined)
    return res.json(data);
  const pagination = paginateQuery(req.query);
  return res.json(
    paginatedResponse(
      data.slice(pagination.skip, pagination.skip + pagination.limit),
      data.length,
      pagination,
    ),
  );
});

// Adjust inventory stock
router.post("/", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const { materialId, locationId, quantityDelta, reason, reference, notes } =
    req.body;

  // Validate material exists
  const [material] = await db
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.id, materialId))
    .limit(1);
  if (!material) return res.status(400).json({ error: "Material not found" });

  // Upsert inventory record
  const existing = await db
    .select()
    .from(inventoryTable)
    .where(eq(inventoryTable.materialId, materialId))
    .limit(1);

  let inv;
  if (existing.length > 0) {
    const newQty = Number(existing[0].quantityOnHand) + Number(quantityDelta);
    [inv] = await db
      .update(inventoryTable)
      .set({ quantityOnHand: String(newQty), lastUpdated: new Date() })
      .where(eq(inventoryTable.id, existing[0].id))
      .returning();
  } else {
    [inv] = await db
      .insert(inventoryTable)
      .values({
        materialId,
        locationId: locationId ?? null,
        quantityOnHand: String(quantityDelta),
      })
      .returning();
  }

  // Log adjustment
  await db.insert(inventoryAdjustmentsTable).values({
    materialId,
    locationId: locationId ?? null,
    quantityDelta: String(quantityDelta),
    reason,
    reference: reference ?? null,
    notes: notes ?? null,
    adjustedByUserId: userId,
  });

  return res.status(201).json({
    id: inv.id,
    materialId: material.id,
    materialName: material.name,
    sku: material.sku,
    category: material.category,
    unit: material.unit,
    quantityOnHand: Number(inv.quantityOnHand),
    locationId: inv.locationId,
    lastUpdated: inv.lastUpdated,
  });
});

// List the complete stock ledger: manual adjustments and inter-location transfers.
router.get("/movements", requireAuth, async (req, res) => {
  const [transferRows, adjustmentRows, locations] = await Promise.all([
    db
      .select({
        mov: inventoryMovementsTable,
        materialName: materialsTable.name,
        unit: materialsTable.unit,
        createdByName: usersTable.displayName,
      })
      .from(inventoryMovementsTable)
      .innerJoin(
        materialsTable,
        eq(inventoryMovementsTable.materialId, materialsTable.id),
      )
      .leftJoin(
        usersTable,
        eq(inventoryMovementsTable.createdByUserId, usersTable.id),
      ),
    db
      .select({
        adjustment: inventoryAdjustmentsTable,
        materialName: materialsTable.name,
        unit: materialsTable.unit,
        createdByName: usersTable.displayName,
      })
      .from(inventoryAdjustmentsTable)
      .innerJoin(
        materialsTable,
        eq(inventoryAdjustmentsTable.materialId, materialsTable.id),
      )
      .leftJoin(
        usersTable,
        eq(inventoryAdjustmentsTable.adjustedByUserId, usersTable.id),
      ),
    db.select().from(inventoryLocationsTable),
  ]);
  const locationNames = new Map(
    locations.map((location: any) => [location.id, location.locationName]),
  );
  let data = [
    ...transferRows.map((row: any) => ({
      id: `transfer-${row.mov.id}`,
      materialId: row.mov.materialId,
      materialName: row.materialName,
      unit: row.unit,
      type: "transfer",
      fromLocationId: row.mov.fromLocationId,
      fromLocationName:
        locationNames.get(row.mov.fromLocationId) ?? null,
      toLocationId: row.mov.toLocationId,
      toLocationName: locationNames.get(row.mov.toLocationId) ?? null,
      quantityKg: Math.abs(Number(row.mov.quantityKg)),
      reason: row.mov.reason,
      reference: row.mov.reason,
      notes: row.mov.notes,
      createdByName: row.createdByName ?? null,
      createdAt: row.mov.createdAt,
    })),
    ...adjustmentRows.map((row: any) => {
      const quantity = Number(row.adjustment.quantityDelta);
      const locationName =
        locationNames.get(row.adjustment.locationId) ?? null;
      return {
        id: `adjustment-${row.adjustment.id}`,
        materialId: row.adjustment.materialId,
        materialName: row.materialName,
        unit: row.unit,
        type: quantity < 0 ? "outward" : "inward",
        fromLocationId: quantity < 0 ? row.adjustment.locationId : null,
        fromLocationName: quantity < 0 ? locationName : null,
        toLocationId: quantity < 0 ? null : row.adjustment.locationId,
        toLocationName: quantity < 0 ? null : locationName,
        quantityKg: Math.abs(quantity),
        reason: row.adjustment.reason,
        reference: row.adjustment.reference ?? null,
        notes: row.adjustment.notes,
        createdByName: row.createdByName ?? null,
        createdAt: row.adjustment.createdAt,
      };
    }),
  ].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const search = String(req.query.search || "")
    .trim()
    .toLowerCase();
  if (search)
    data = data.filter((row) =>
      [
        row.materialName,
        row.reason,
        row.reference,
        row.notes,
        row.createdByName,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(search),
      ),
    );
  if (req.query.skip === undefined && req.query.limit === undefined)
    return res.json(data);
  const pagination = paginateQuery(req.query);
  return res.json(
    paginatedResponse(
      data.slice(pagination.skip, pagination.skip + pagination.limit),
      data.length,
      pagination,
    ),
  );
});

// Create inventory movement (transfer between locations)
router.post("/movements", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const {
    materialId,
    fromLocationId,
    toLocationId,
    quantityKg,
    reason,
    notes,
  } = req.body;

  const [material] = await db
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.id, materialId))
    .limit(1);
  if (!material) return res.status(400).json({ error: "Material not found" });

  const [mov] = await db
    .insert(inventoryMovementsTable)
    .values({
      materialId,
      fromLocationId: fromLocationId ?? null,
      toLocationId: toLocationId ?? null,
      quantityKg: String(quantityKg),
      reason: reason ?? null,
      notes: notes ?? null,
      createdByUserId: userId,
    })
    .returning();

  return res.status(201).json({
    id: mov.id,
    materialId: mov.materialId,
    materialName: material.name,
    fromLocationId: mov.fromLocationId,
    toLocationId: mov.toLocationId,
    quantityKg: Number(mov.quantityKg),
    reason: mov.reason,
    notes: mov.notes,
    createdAt: mov.createdAt,
  });
});

export default router;
