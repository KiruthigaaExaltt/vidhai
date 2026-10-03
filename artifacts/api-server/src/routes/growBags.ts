import { Router } from "express";
import {
  db,
  growBagInventorySourcesTable,
  inventoryLocationsTable,
  inventoryTable,
  materialsTable,
  eq,
  and,
  desc,
} from "@workspace/db";
import {
  GROW_BAG_EXT_SKU,
  freeAvailableGrowBags,
  growBagExternalSourceKey,
} from "../lib/growBagVault";

const router = Router();

router.get("/", async (req, res) => {
  const availableOnly =
    String(req.query.availableOnly || "").toLowerCase() === "true";
  const rows = await db
    .select()
    .from(growBagInventorySourcesTable)
    .orderBy(desc(growBagInventorySourcesTable.createdAt));
  const mapped = rows.map((row) => {
    const freeAvailableBags = freeAvailableGrowBags(row);
    return {
      ...row,
      freeAvailableBags,
      originLabel:
        row.origin === "external"
          ? "EXTERNAL"
          : row.sourceType === "produced"
            ? "INTERNAL"
            : "PURCHASED",
    };
  });
  return res.json(
    availableOnly
      ? mapped.filter((row) => row.freeAvailableBags > 0)
      : mapped,
  );
});

router.post("/", async (req, res) => {
  const userId = Number((req.session as any)?.userId);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const bags = Number(req.body?.bags);
  const reference = String(req.body?.reference || "").trim();
  const notes = String(req.body?.notes || "").trim() || null;
  if (!Number.isInteger(bags) || bags <= 0)
    return res
      .status(400)
      .json({ error: "Bags must be a whole number greater than zero" });
  if (!reference)
    return res.status(400).json({ error: "Reference / lot is required" });

  const sourceKey = growBagExternalSourceKey(reference);
  const [existing] = await db
    .select()
    .from(growBagInventorySourcesTable)
    .where(eq(growBagInventorySourcesTable.sourceKey, sourceKey))
    .limit(1);
  if (existing)
    return res
      .status(409)
      .json({ error: `Grow bag lot ${reference} already exists` });

  let [material] = await db
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.sku, GROW_BAG_EXT_SKU))
    .limit(1);
  if (!material) {
    [material] = await db
      .insert(materialsTable)
      .values({
        name: "Grow Bag",
        sku: GROW_BAG_EXT_SKU,
        unit: "Nos",
        itemType: "Raw Material",
        category: "raw_material",
        itemIdentifier: GROW_BAG_EXT_SKU,
        qrPayload: "/product/grow_bag",
        criticalLevel: "0",
        buyPricePerUnit: "0",
        sellPricePerUnit: "0",
      })
      .returning();
  }

  const [warehouse] = await db
    .select()
    .from(inventoryLocationsTable)
    .where(eq(inventoryLocationsTable.systemCode, "ANNUR"))
    .limit(1);
  if (!warehouse)
    return res
      .status(409)
      .json({ error: "Annur warehouse configuration is missing" });

  let [stock] = await db
    .select()
    .from(inventoryTable)
    .where(
      and(
        eq(inventoryTable.materialId, material.id),
        eq(inventoryTable.locationId, warehouse.id),
      ),
    )
    .limit(1);
  if (stock) {
    [stock] = await db
      .update(inventoryTable)
      .set({
        quantityOnHand: String(Number(stock.quantityOnHand) + bags),
        lastUpdated: new Date(),
      })
      .where(eq(inventoryTable.id, stock.id))
      .returning();
  } else {
    [stock] = await db
      .insert(inventoryTable)
      .values({
        materialId: material.id,
        locationId: warehouse.id,
        quantityOnHand: String(bags),
      })
      .returning();
  }

  const stockDate = new Date().toISOString().slice(0, 10);
  const [created] = await db
    .insert(growBagInventorySourcesTable)
    .values({
      sourceKey,
      sourceType: "purchased",
      origin: "external",
      annurBatchId: null,
      reference,
      materialId: material.id,
      warehouseId: warehouse.id,
      inventoryId: stock.id,
      inventoryAdjustmentId: null,
      originalBags: bags,
      allocatedBags: 0,
      availableBags: bags,
      reservedBags: 0,
      stockDate,
      notes: notes || "Manual external grow bag receipt",
      status: "available",
      createdByUserId: userId,
    })
    .returning();

  return res.status(201).json({
    ...created,
    freeAvailableBags: freeAvailableGrowBags(created),
    originLabel: "EXTERNAL",
  });
});

export default router;
