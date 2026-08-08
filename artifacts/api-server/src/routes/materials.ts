import { Router } from "express";
import { db, materialsTable, inventoryCategoriesTable, inventoryLocationsTable } from "@workspace/db";
import { eq, and } from "@workspace/db";
import crypto from "crypto";
import { inventoryTable } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  const mats = await db.select().from(materialsTable).orderBy(materialsTable.name);
  res.json(
    mats.map((m) => ({
      ...m,
      defaultMoisturePercent: m.defaultMoisturePercent != null ? Number(m.defaultMoisturePercent) : null,
      defaultNitrogenPercent: m.defaultNitrogenPercent != null ? Number(m.defaultNitrogenPercent) : null,
      gstPercent: m.gstPercent != null ? Number(m.gstPercent) : 0,
    }))
  );
});

router.post("/generate-sku", async (req, res) => {
  const { categoryId, attributeValues } = req.body;
  if (!categoryId) { res.status(400).json({ error: "categoryId is required" }); return; }

  const [category] = await db.select().from(inventoryCategoriesTable).where(eq(inventoryCategoriesTable.id, Number(categoryId)));
  if (!category) { res.status(404).json({ error: "Category not found" }); return; }

  const parts: string[] = [];
  
  if (category.name) {
    const catStr = String(category.name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if (catStr) parts.push(catStr);
  } else {
    parts.push("CAT");
  }
  
  if (category.divisions && Array.isArray(category.divisions)) {
    for (const division of category.divisions as any[]) {
      const val = attributeValues?.[division.id];
      if (val) {
        const clean = String(val).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
        parts.push(clean || "NA");
      }
    }
  }

  const prefix = parts.join("-");
  
  const existing = await db.select({ sku: materialsTable.sku })
    .from(materialsTable)
    .where(eq(materialsTable.categoryId, Number(categoryId)));
    
  let maxSeq = 0;
  for (const m of existing) {
    if (m.sku && m.sku.startsWith(prefix)) {
      const seqStr = m.sku.split("-").pop();
      const seq = parseInt(seqStr || "0", 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  
  const sku = `${prefix}-${String(maxSeq + 1).padStart(4, "0")}`;
  res.json({ sku });
});

router.post("/", async (req, res) => {
  const { 
    name, sku, unit, itemType, hsnSac, criticalLevel, imageUrl,
    buyPricePerUnit, sellPricePerUnit, gstPercent, categoryId, attributeValues, warehouseStocks 
  } = req.body;

  // Generate internal identifier
  const idPrefix = itemType === "Finished Product" ? "VLT-FP" : "VLT-RM";
  const itemIdentifier = [
    idPrefix,
    Date.now().toString(36).toUpperCase(),
    crypto.randomBytes(3).toString("hex").toUpperCase()
  ].join("-");
  
  const qrPayload = `/product/${encodeURIComponent(sku || itemIdentifier)}`;

  try {
    const normalizedStocks = Array.isArray(warehouseStocks) ? warehouseStocks.filter((ws: any) => ws.warehouseId).map((ws: any) => ({ warehouseId: Number(ws.warehouseId), stock: Number(ws.stock || 0) })) : [];
    if (new Set(normalizedStocks.map((ws: any) => ws.warehouseId)).size !== normalizedStocks.length) return res.status(400).json({ error: "Each warehouse can be selected only once" });
    for (const ws of normalizedStocks) {
      if (!Number.isFinite(ws.stock) || ws.stock < 0) return res.status(400).json({ error: "Warehouse quantity must be zero or greater" });
      const [warehouse] = await db.select().from(inventoryLocationsTable).where(eq(inventoryLocationsTable.id, ws.warehouseId)).limit(1);
      if (!warehouse) return res.status(400).json({ error: `Warehouse #${ws.warehouseId} was not found` });
    }
    const [mat] = await db
      .insert(materialsTable)
      .values({
        name: name?.trim(),
        sku: sku ?? null,
        unit: unit ?? "kg",
        itemType: itemType || "Raw Material",
        hsnSac: hsnSac?.trim() || null,
        criticalLevel: criticalLevel != null ? String(criticalLevel) : "10",
        buyPricePerUnit: buyPricePerUnit != null ? String(buyPricePerUnit) : null,
        sellPricePerUnit: sellPricePerUnit != null ? String(sellPricePerUnit) : null,
        gstPercent: gstPercent != null ? String(gstPercent) : "0",
        imageUrl: imageUrl ?? null,
        categoryId: categoryId ? Number(categoryId) : null,
        attributeValues: attributeValues || {},
        itemIdentifier,
        qrPayload,
      })
      .returning();

    try {
      for (const ws of normalizedStocks) await db.insert(inventoryTable).values({ materialId: mat.id, locationId: ws.warehouseId, quantityOnHand: String(ws.stock), costBasis: buyPricePerUnit != null ? String(buyPricePerUnit) : null });
    } catch (stockError) {
      await db.delete(inventoryTable).where(eq(inventoryTable.materialId, mat.id));
      await db.delete(materialsTable).where(eq(materialsTable.id, mat.id));
      throw stockError;
    }

    const savedStocks = await db.select().from(inventoryTable).where(eq(inventoryTable.materialId, mat.id));
    res.status(201).json({ ...mat, warehouseStocks: savedStocks.map(row => ({ warehouseId: row.locationId, stock: Number(row.quantityOnHand) })) });
  } catch (err: any) {
    if (err.code === 11000 || err.code === "23505") {
      res.status(400).json({ error: "Item with this Name or SKU already exists" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

router.patch("/:id", async (req, res) => {
  const { name, sku, unit, itemType, hsnSac, buyPricePerUnit, sellPricePerUnit, gstPercent, criticalLevel, imageUrl, defaultMoisturePercent, defaultNitrogenPercent, notes, categoryId, attributeValues, warehouseStocks } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (sku !== undefined) updates.sku = sku;
  if (unit !== undefined) updates.unit = unit;
  if (itemType !== undefined) updates.itemType = itemType;
  if (hsnSac !== undefined) updates.hsnSac = hsnSac?.trim() || null;
  if (buyPricePerUnit !== undefined) updates.buyPricePerUnit = buyPricePerUnit != null ? String(buyPricePerUnit) : null;
  if (sellPricePerUnit !== undefined) updates.sellPricePerUnit = sellPricePerUnit != null ? String(sellPricePerUnit) : null;
  if (gstPercent !== undefined) updates.gstPercent = gstPercent != null ? String(gstPercent) : "0";
  if (criticalLevel !== undefined) updates.criticalLevel = String(criticalLevel);
  if (imageUrl !== undefined) updates.imageUrl = imageUrl || null;
  if (categoryId !== undefined) updates.categoryId = categoryId ? Number(categoryId) : null;
  if (attributeValues !== undefined) updates.attributeValues = attributeValues;
  if (defaultMoisturePercent !== undefined) updates.defaultMoisturePercent = defaultMoisturePercent != null ? String(defaultMoisturePercent) : null;
  if (defaultNitrogenPercent !== undefined) updates.defaultNitrogenPercent = defaultNitrogenPercent != null ? String(defaultNitrogenPercent) : null;
  if (notes !== undefined) updates.notes = notes;
  const [mat] = await db.update(materialsTable).set(updates).where(eq(materialsTable.id, Number(req.params.id))).returning();
  if (!mat) return res.status(404).json({ error: "Not found" });
  if (Array.isArray(warehouseStocks)) {
    const normalized = warehouseStocks.filter((ws: any) => ws.warehouseId).map((ws: any) => ({ warehouseId: Number(ws.warehouseId), stock: Number(ws.stock || 0) }));
    if (new Set(normalized.map((ws: any) => ws.warehouseId)).size !== normalized.length) return res.status(400).json({ error: "Each warehouse can be selected only once" });
    for (const ws of normalized) {
      const [warehouse] = await db.select().from(inventoryLocationsTable).where(eq(inventoryLocationsTable.id, ws.warehouseId)).limit(1);
      if (!warehouse || !Number.isFinite(ws.stock) || ws.stock < 0) return res.status(400).json({ error: "Invalid warehouse or quantity" });
      const [existing] = await db.select().from(inventoryTable).where(and(eq(inventoryTable.materialId, mat.id), eq(inventoryTable.locationId, ws.warehouseId))).limit(1);
      if (existing) await db.update(inventoryTable).set({ quantityOnHand: String(ws.stock), costBasis: buyPricePerUnit != null ? String(buyPricePerUnit) : existing.costBasis, lastUpdated: new Date() }).where(eq(inventoryTable.id, existing.id));
      else await db.insert(inventoryTable).values({ materialId: mat.id, locationId: ws.warehouseId, quantityOnHand: String(ws.stock), costBasis: buyPricePerUnit != null ? String(buyPricePerUnit) : null });
    }
  }
  return res.json({
    ...mat,
    defaultMoisturePercent: mat.defaultMoisturePercent != null ? Number(mat.defaultMoisturePercent) : null,
    defaultNitrogenPercent: mat.defaultNitrogenPercent != null ? Number(mat.defaultNitrogenPercent) : null,
  });
});

router.delete("/:id", async (req, res) => {
  await db.delete(materialsTable).where(eq(materialsTable.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;
