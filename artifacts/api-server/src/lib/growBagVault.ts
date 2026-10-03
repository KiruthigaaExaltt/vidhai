import {
  db,
  batchesTable,
  growBagInventorySourcesTable,
  inventoryLocationsTable,
  inventoryTable,
  materialsTable,
  ootyBatchSourcesTable,
  eq,
  and,
} from "@workspace/db";

export const GROW_BAG_SKU = "VLT-RM-GROW-BAG";
export const GROW_BAG_EXT_SKU = "VLT-EXT-GROW-BAG";

export function growBagProducedSourceKey(annurBatchId: number) {
  return `produced:${annurBatchId}`;
}

export function growBagExternalSourceKey(reference: string) {
  return `external-grn:${String(reference || "").trim().toLowerCase()}`;
}

export function freeAvailableGrowBags(source: {
  availableBags?: unknown;
  reservedBags?: unknown;
}) {
  return Math.max(
    0,
    Number(source.availableBags || 0) - Number(source.reservedBags || 0),
  );
}

export async function ensureGrowBagVaultBackfill() {
  const [material] = await db
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.sku, GROW_BAG_SKU))
    .limit(1);
  const [warehouse] = await db
    .select()
    .from(inventoryLocationsTable)
    .where(eq(inventoryLocationsTable.systemCode, "ANNUR"))
    .limit(1);
  if (!material || !warehouse) return;

  const dispatched = (
    await db.select().from(batchesTable)
  ).filter(
    (batch) =>
      batch.currentStage === "COMPLETED" &&
      batch.status === "dispatched" &&
      Number(batch.actualBags || 0) > 0,
  );
  if (!dispatched.length) return;

  const existingSources = await db.select().from(growBagInventorySourcesTable);
  const byKey = new Map(existingSources.map((row) => [row.sourceKey, row]));
  const allocations = await db.select().from(ootyBatchSourcesTable);
  const allocatedByBatch = new Map<number, number>();
  for (const row of allocations) {
    if (!row.annurBatchId) continue;
    allocatedByBatch.set(
      row.annurBatchId,
      (allocatedByBatch.get(row.annurBatchId) ?? 0) + Number(row.bagCount || 0),
    );
  }

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

  for (const batch of dispatched) {
    const sourceKey = growBagProducedSourceKey(batch.id);
    if (byKey.has(sourceKey)) continue;
    const originalBags = Number(batch.actualBags || 0);
    const allocatedBags = Math.min(
      originalBags,
      allocatedByBatch.get(batch.id) ?? 0,
    );
    const availableBags = Math.max(0, originalBags - allocatedBags);
    const stockDate = new Date().toISOString().slice(0, 10);
    const [created] = await db
      .insert(growBagInventorySourcesTable)
      .values({
        sourceKey,
        sourceType: "produced",
        origin: "internal",
        annurBatchId: batch.id,
        reference: batch.batchCode,
        materialId: material.id,
        warehouseId: warehouse.id,
        inventoryId: stock?.id ?? null,
        inventoryAdjustmentId: null,
        originalBags,
        allocatedBags,
        availableBags,
        reservedBags: 0,
        stockDate,
        notes: `Backfilled from Annur batch ${batch.batchCode}`,
        status: availableBags > 0 ? "available" : "depleted",
      })
      .returning();
    byKey.set(sourceKey, created);
  }
}
