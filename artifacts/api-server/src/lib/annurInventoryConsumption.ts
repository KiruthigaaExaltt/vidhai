import {
  batchInventoryConsumptionsTable,
  db,
  eq,
  inventoryAdjustmentsTable,
  inventoryLocationsTable,
  inventoryTable,
  locationsTable,
  materialsTable,
} from "@workspace/db";

type Consumption = { name: string; quantity: number; materialId?: number | null };

const normalized = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export async function consumeAnnurBatchMaterials(
  tx: typeof db,
  input: { batchType: "ANNUR" | "LAB" | "COIMBATORE"; batchId: number; batchReference: string; materials: Consumption[]; userId?: number | null; operationKey?: string },
) {
  const combined = new Map<string, Consumption>();
  for (const row of input.materials) {
    const quantity = Number(row.quantity);
    if (!row.name?.trim() || !Number.isFinite(quantity) || quantity <= 0)
      throw new Error(`Invalid material quantity for ${row.name || "unnamed material"}`);
    const key = normalized(row.name);
    const current = combined.get(key);
    combined.set(key, { name: row.name.trim(), materialId: row.materialId ?? current?.materialId, quantity: (current?.quantity || 0) + quantity });
  }
  if (!combined.size) throw new Error("At least one formulation material is required");
  const [warehouse] = await tx.select().from(inventoryLocationsTable).where(eq(inventoryLocationsTable.systemCode, "ANNUR")).limit(1);
  const [annurLocation] = await tx.select().from(locationsTable).where(eq(locationsTable.code, "A")).limit(1);
  if (!warehouse || !annurLocation) throw new Error("Annur inventory configuration is missing");
  const [allMaterials, allStock, existingConsumptions] = await Promise.all([
    tx.select().from(materialsTable),
    tx.select().from(inventoryTable).where(eq(inventoryTable.locationId, warehouse.id)),
    tx.select().from(batchInventoryConsumptionsTable),
  ]);
  const prepared = [...combined.values()].map((requested) => {
    const material = requested.materialId
      ? allMaterials.find((row) => Number(row.id) === Number(requested.materialId))
      : allMaterials.find((row) => normalized(row.name) === normalized(requested.name));
    if (!material) throw new Error(`${requested.name} is not available in Item & Product Master`);
    const stock = allStock.find((row) => Number(row.materialId) === Number(material.id));
    const available = Number(stock?.quantityOnHand || 0);
    if (!stock || available < requested.quantity)
      throw new Error(`${material.name}: required ${requested.quantity} ${material.unit}, available ${available} ${material.unit} in Annur`);
    const key = `${input.batchType}:${input.batchId}:${material.id}:${input.operationKey || "INITIAL"}`;
    if (existingConsumptions.some((row) => row.consumptionKey === key))
      throw new Error(`${input.batchReference} has already consumed ${material.name}`);
    return { requested, material, stock, available, key };
  });
  for (const row of prepared) {
    const remaining = Math.round((row.available - row.requested.quantity) * 10_000) / 10_000;
    await tx.update(inventoryTable).set({ quantityOnHand: String(remaining), lastUpdated: new Date() }).where(eq(inventoryTable.id, row.stock.id));
    const [adjustment] = await tx.insert(inventoryAdjustmentsTable).values({
      materialId: row.material.id,
      locationId: annurLocation.id,
      quantityDelta: String(-row.requested.quantity),
      reason: "batch consumption",
      reference: input.batchReference,
      notes: `${input.batchType} batch initialization | ${input.batchReference} | ${row.material.name}`,
      adjustedByUserId: input.userId ?? null,
    }).returning();
    await tx.insert(batchInventoryConsumptionsTable).values({
      consumptionKey: row.key,
      batchType: input.batchType,
      batchId: input.batchId,
      materialId: row.material.id,
      warehouseId: warehouse.id,
      inventoryAdjustmentId: adjustment.id,
      quantityConsumed: String(row.requested.quantity),
      unit: row.material.unit,
      consumedByUserId: input.userId ?? null,
    });
  }
  return prepared.map((row) => ({ materialId: row.material.id, name: row.material.name, quantity: row.requested.quantity, remaining: row.available - row.requested.quantity }));
}

export async function consumeAnnurMaterialIncreases(
  tx: typeof db,
  input: { batchType: "ANNUR" | "LAB" | "COIMBATORE"; batchId: number; batchReference: string; materials: Consumption[]; userId?: number | null; operationKey: string },
) {
  const [masters, history] = await Promise.all([
    tx.select().from(materialsTable),
    tx.select().from(batchInventoryConsumptionsTable),
  ]);
  const requestedByMaterial = new Map<number, { name: string; materialId: number; quantity: number }>();
  for (const row of input.materials) {
    const material = row.materialId ? masters.find((item) => Number(item.id) === Number(row.materialId)) : masters.find((item) => normalized(item.name) === normalized(row.name));
    if (!material) throw new Error(`${row.name} is not available in Item & Product Master`);
    const current = requestedByMaterial.get(material.id);
    requestedByMaterial.set(material.id, { name: material.name, materialId: material.id, quantity: (current?.quantity || 0) + Number(row.quantity) });
  }
  const increases = [...requestedByMaterial.values()].map((row) => {
    const consumed = history.filter((item) => item.batchType === input.batchType && Number(item.batchId) === input.batchId && Number(item.materialId) === row.materialId).reduce((sum, item) => sum + Number(item.quantityConsumed || 0), 0);
    return { ...row, quantity: Math.max(0, row.quantity - consumed) };
  }).filter((row) => row.quantity > 0);
  if (!increases.length) return [];
  return consumeAnnurBatchMaterials(tx, { ...input, materials: increases });
}
