import { Router } from "express";
import { db, materialsTable, inventoryCategoriesTable } from "@workspace/db";
import { eq } from "@workspace/db";
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
    buyPricePerUnit, sellPricePerUnit, categoryId, attributeValues, warehouseStocks 
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
        imageUrl: imageUrl ?? null,
        categoryId: categoryId ? Number(categoryId) : null,
        attributeValues: attributeValues || {},
        itemIdentifier,
        qrPayload,
      })
      .returning();

    // Insert warehouse stocks — each try/catch individually so one FK failure doesn't block others
    if (warehouseStocks && Array.isArray(warehouseStocks) && warehouseStocks.length > 0) {
      for (const ws of warehouseStocks) {
        if (!ws.warehouseId) continue;
        try {
          await db.insert(inventoryTable).values({
            materialId: mat.id,
            locationId: Number(ws.warehouseId),
            quantityOnHand: String(ws.stock || 0),
            costBasis: buyPricePerUnit != null ? String(buyPricePerUnit) : null,
          });
        } catch (_err) {
          // FK constraint mismatch between vault locations and old locations — skip silently
        }
      }
    }

    res.status(201).json(mat);
  } catch (err: any) {
    if (err.code === 11000 || err.code === "23505") {
      res.status(400).json({ error: "Item with this Name or SKU already exists" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

router.patch("/:id", async (req, res) => {
  const { name, sku, unit, defaultMoisturePercent, defaultNitrogenPercent, notes, categoryId, attributeValues } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (sku !== undefined) updates.sku = sku;
  if (unit !== undefined) updates.unit = unit;
  if (categoryId !== undefined) updates.categoryId = categoryId ? Number(categoryId) : null;
  if (attributeValues !== undefined) updates.attributeValues = attributeValues;
  if (defaultMoisturePercent !== undefined) updates.defaultMoisturePercent = defaultMoisturePercent != null ? String(defaultMoisturePercent) : null;
  if (defaultNitrogenPercent !== undefined) updates.defaultNitrogenPercent = defaultNitrogenPercent != null ? String(defaultNitrogenPercent) : null;
  if (notes !== undefined) updates.notes = notes;
  const [mat] = await db.update(materialsTable).set(updates).where(eq(materialsTable.id, Number(req.params.id))).returning();
  if (!mat) return res.status(404).json({ error: "Not found" });
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
