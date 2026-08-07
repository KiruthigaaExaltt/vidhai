import { Router } from "express";
import { db } from "@workspace/db";
import { inventoryTable, inventoryAdjustmentsTable, inventoryMovementsTable, materialsTable, inventoryLocationsTable, usersTable } from "@workspace/db";
import { eq, desc } from "@workspace/db";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
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
    .leftJoin(inventoryLocationsTable, eq(inventoryTable.locationId, inventoryLocationsTable.id))
    .orderBy(materialsTable.name);

  return res.json(
    rows.map((r) => ({
      id: r.inv.id,
      materialId: r.material.id,
      materialName: r.material.name,
      sku: r.material.sku,
      category: r.material.category,
      unit: r.material.unit,
      quantityOnHand: Number(r.inv.quantityOnHand),
      locationId: r.inv.locationId,
      locationName: r.locationName ?? null,
      costBasis: r.inv.costBasis !== null ? Number(r.inv.costBasis) : null,
      buyPricePerUnit: r.material.buyPricePerUnit !== null ? Number(r.material.buyPricePerUnit) : null,
      sellPricePerUnit: r.material.sellPricePerUnit !== null ? Number(r.material.sellPricePerUnit) : null,
      imageUrl: r.material.imageUrl,
      qrCode: r.material.qrCode,
      lastUpdated: r.inv.lastUpdated,
    }))
  );
});

// Adjust inventory stock
router.post("/", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const { materialId, locationId, quantityDelta, reason, notes } = req.body;

  // Validate material exists
  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, materialId)).limit(1);
  if (!material) return res.status(400).json({ error: "Material not found" });

  // Upsert inventory record
  const existing = await db.select().from(inventoryTable)
    .where(eq(inventoryTable.materialId, materialId))
    .limit(1);

  let inv;
  if (existing.length > 0) {
    const newQty = Number(existing[0].quantityOnHand) + Number(quantityDelta);
    [inv] = await db.update(inventoryTable)
      .set({ quantityOnHand: String(newQty), lastUpdated: new Date() })
      .where(eq(inventoryTable.id, existing[0].id))
      .returning();
  } else {
    [inv] = await db.insert(inventoryTable)
      .values({ materialId, locationId: locationId ?? null, quantityOnHand: String(quantityDelta) })
      .returning();
  }

  // Log adjustment
  await db.insert(inventoryAdjustmentsTable).values({
    materialId,
    locationId: locationId ?? null,
    quantityDelta: String(quantityDelta),
    reason,
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

// List inventory movements (inter-location transfers)
router.get("/movements", requireAuth, async (req, res) => {
  const rows = await db
    .select({
      mov: inventoryMovementsTable,
      materialName: materialsTable.name,
      createdByName: usersTable.displayName,
    })
    .from(inventoryMovementsTable)
    .innerJoin(materialsTable, eq(inventoryMovementsTable.materialId, materialsTable.id))
    .leftJoin(usersTable, eq(inventoryMovementsTable.createdByUserId, usersTable.id))
    .orderBy(desc(inventoryMovementsTable.createdAt));

  return res.json(
    rows.map((r) => ({
      id: r.mov.id,
      materialId: r.mov.materialId,
      materialName: r.materialName,
      fromLocationId: r.mov.fromLocationId,
      toLocationId: r.mov.toLocationId,
      quantityKg: Number(r.mov.quantityKg),
      reason: r.mov.reason,
      notes: r.mov.notes,
      createdByName: r.createdByName ?? null,
      createdAt: r.mov.createdAt,
    }))
  );
});

// Create inventory movement (transfer between locations)
router.post("/movements", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const { materialId, fromLocationId, toLocationId, quantityKg, reason, notes } = req.body;

  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, materialId)).limit(1);
  if (!material) return res.status(400).json({ error: "Material not found" });

  const [mov] = await db.insert(inventoryMovementsTable).values({
    materialId,
    fromLocationId: fromLocationId ?? null,
    toLocationId: toLocationId ?? null,
    quantityKg: String(quantityKg),
    reason: reason ?? null,
    notes: notes ?? null,
    createdByUserId: userId,
  }).returning();

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
