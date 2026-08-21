import {
  and,
  casingSoilInventorySourcesTable,
  db,
  eq,
  inventoryMovementsTable,
  materialsTable,
  spawnEntriesTable,
  spawnVaultTransactionsTable,
  vaultSalesReservationsTable,
} from "@workspace/db";

export const SPAWN_SKU = "VLT-FP-SPAWN";
export const CASING_SOIL_SKU = "VLT-FP-CASING-SOIL";

const numberValue = (value: unknown) => Number(value ?? 0) || 0;
const terminalStatuses = new Set(["Completed", "Cancelled", "Rejected"]);

export function isVaultSku(sku: unknown) {
  return sku === SPAWN_SKU || sku === CASING_SOIL_SKU;
}

export async function listVaultSalesStock() {
  const materials = await db.select().from(materialsTable);
  const spawnMaterial = materials.find((row) => row.sku === SPAWN_SKU);
  const casingMaterial = materials.find((row) => row.sku === CASING_SOIL_SKU);
  const [spawnRows, casingRows] = await Promise.all([
    db.select().from(spawnEntriesTable),
    db.select().from(casingSoilInventorySourcesTable),
  ]);
  return [
    ...spawnRows.map((row) => {
      const physical = numberValue(row.quantityKg);
      const reserved = numberValue(row.reservedQuantityKg);
      return {
        id: row.id,
        materialId: spawnMaterial?.id ?? null,
        vaultType: "spawn",
        sourceType: row.sourceType === "INTERNAL" ? "produced" : "purchased",
        reference: row.sourceReference || row.supplierLot || `Spawn #${row.id}`,
        detail: row.strainName,
        physicalQuantity: physical,
        reservedQuantity: reserved,
        freeAvailableQuantity: Math.max(0, physical - reserved),
        unit: "kg",
        status: row.status,
      };
    }),
    ...casingRows.map((row) => {
      const physical = numberValue(row.availableQuantityKg);
      const reserved = numberValue(row.reservedQuantityKg);
      return {
        id: row.id,
        materialId: casingMaterial?.id ?? row.materialId,
        vaultType: "casing_soil",
        sourceType: String(row.sourceType).toLowerCase(),
        reference: row.reference,
        detail: null,
        physicalQuantity: physical,
        reservedQuantity: reserved,
        freeAvailableQuantity: Math.max(0, physical - reserved),
        unit: "kg",
        status: row.status,
      };
    }),
  ];
}

export async function reserveVaultLines(
  tx: any,
  workOrder: any,
  items: any[],
  userId: number,
) {
  const materials = await tx.select().from(materialsTable);
  for (const line of items) {
    const material = materials.find((row: any) => Number(row.id) === Number(line.itemId));
    if (!material || !isVaultSku(material.sku)) continue;
    const vaultType = material.sku === SPAWN_SKU ? "spawn" : "casing_soil";
    const sourceLineId = Number(line.id);
    const stockId = Number(line.vaultStockId);
    const quantity = numberValue(line.quantity);
    const sourceType = String(line.vaultSourceType || "").toLowerCase();
    if (!sourceLineId || !stockId || quantity <= 0 || !["produced", "purchased"].includes(sourceType))
      throw new Error(`${material.name}: select Produced/Purchased and one valid batch/lot`);
    if (String(line.uom || "").toLowerCase() !== "kg")
      throw new Error(`${material.name}: Sales and Vault units must both be kg`);

    let reference = "";
    if (vaultType === "spawn") {
      const [stock] = await tx.select().from(spawnEntriesTable).where(eq(spawnEntriesTable.id, stockId)).limit(1);
      if (!stock) throw new Error("Selected Spawn batch/lot was not found");
      const actualSource = stock.sourceType === "INTERNAL" ? "produced" : "purchased";
      const free = numberValue(stock.quantityKg) - numberValue(stock.reservedQuantityKg);
      if (actualSource !== sourceType || free < quantity)
        throw new Error(`Insufficient Spawn stock. Batch: ${stock.sourceReference || stock.supplierLot || stock.id}. Free Available: ${Math.max(0, free)} kg. Requested: ${quantity} kg.`);
      reference = stock.sourceReference || stock.supplierLot || `Spawn #${stock.id}`;
      await tx.update(spawnEntriesTable).set({ reservedQuantityKg: String(numberValue(stock.reservedQuantityKg) + quantity) }).where(eq(spawnEntriesTable.id, stock.id));
    } else {
      const [stock] = await tx.select().from(casingSoilInventorySourcesTable).where(eq(casingSoilInventorySourcesTable.id, stockId)).limit(1);
      if (!stock) throw new Error("Selected Casing Soil batch/lot was not found");
      const free = numberValue(stock.availableQuantityKg) - numberValue(stock.reservedQuantityKg);
      if (String(stock.sourceType).toLowerCase() !== sourceType || free < quantity)
        throw new Error(`Insufficient Casing Soil stock. Batch: ${stock.reference}. Free Available: ${Math.max(0, free)} kg. Requested: ${quantity} kg.`);
      reference = stock.reference;
      await tx.update(casingSoilInventorySourcesTable).set({ reservedQuantityKg: String(numberValue(stock.reservedQuantityKg) + quantity) }).where(eq(casingSoilInventorySourcesTable.id, stock.id));
    }
    await tx.insert(vaultSalesReservationsTable).values({
      reservationKey: `work-order:${workOrder.id}:line:${sourceLineId}`,
      workOrderId: workOrder.id,
      sourceDocumentType: workOrder.sourceDocumentType,
      sourceDocumentId: workOrder.sourceDocumentId,
      sourceLineId,
      materialId: material.id,
      vaultType,
      vaultSourceType: sourceType,
      vaultStockId: stockId,
      vaultReference: reference,
      orderedQuantity: String(quantity),
      dispatchedQuantity: "0",
      unit: "kg",
      status: "active",
      createdByUserId: userId,
    });
  }
}

export async function cancelWorkOrderVaultReservations(tx: any, workOrderId: number) {
  const reservations = await tx.select().from(vaultSalesReservationsTable).where(eq(vaultSalesReservationsTable.workOrderId, workOrderId));
  for (const reservation of reservations.filter((row: any) => row.status === "active")) {
    const remaining = Math.max(0, numberValue(reservation.orderedQuantity) - numberValue(reservation.dispatchedQuantity));
    if (reservation.vaultType === "spawn") {
      const [stock] = await tx.select().from(spawnEntriesTable).where(eq(spawnEntriesTable.id, reservation.vaultStockId)).limit(1);
      if (stock) await tx.update(spawnEntriesTable).set({ reservedQuantityKg: String(Math.max(0, numberValue(stock.reservedQuantityKg) - remaining)) }).where(eq(spawnEntriesTable.id, stock.id));
    } else {
      const [stock] = await tx.select().from(casingSoilInventorySourcesTable).where(eq(casingSoilInventorySourcesTable.id, reservation.vaultStockId)).limit(1);
      if (stock) await tx.update(casingSoilInventorySourcesTable).set({ reservedQuantityKg: String(Math.max(0, numberValue(stock.reservedQuantityKg) - remaining)) }).where(eq(casingSoilInventorySourcesTable.id, stock.id));
    }
    await tx.update(vaultSalesReservationsTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(vaultSalesReservationsTable.id, reservation.id));
  }
}

export async function activeReservationForSourceLine(sourceDocumentType: string, sourceDocumentId: number, sourceLineId: number) {
  const rows = await db.select().from(vaultSalesReservationsTable).where(and(eq(vaultSalesReservationsTable.sourceDocumentType, sourceDocumentType), eq(vaultSalesReservationsTable.sourceDocumentId, sourceDocumentId), eq(vaultSalesReservationsTable.sourceLineId, sourceLineId)));
  return rows.find((row) => row.status === "active") ?? null;
}

export async function dispatchVaultReservation(tx: any, reservationId: number, quantity: number, dc: any, userId: number) {
  const [reservation] = await tx.select().from(vaultSalesReservationsTable).where(eq(vaultSalesReservationsTable.id, reservationId)).limit(1);
  if (!reservation || reservation.status !== "active") throw new Error("The Vault reservation is missing or no longer active");
  const remaining = numberValue(reservation.orderedQuantity) - numberValue(reservation.dispatchedQuantity);
  if (!(quantity > 0) || quantity > remaining) throw new Error(`Dispatch quantity exceeds the reserved remaining quantity of ${remaining} ${reservation.unit}`);
  if (reservation.vaultType === "spawn") {
    const [stock] = await tx.select().from(spawnEntriesTable).where(eq(spawnEntriesTable.id, reservation.vaultStockId)).limit(1);
    if (!stock || numberValue(stock.quantityKg) < quantity || numberValue(stock.reservedQuantityKg) < quantity) throw new Error(`Insufficient reserved Spawn stock in ${reservation.vaultReference}`);
    const balance = numberValue(stock.quantityKg) - quantity;
    await tx.update(spawnEntriesTable).set({ quantityKg: String(balance), reservedQuantityKg: String(numberValue(stock.reservedQuantityKg) - quantity), status: balance === 0 ? "depleted" : "available" }).where(eq(spawnEntriesTable.id, stock.id));
    await tx.insert(spawnVaultTransactionsTable).values({ transactionKey: `sales-dc:${dc.id}:reservation:${reservation.id}`, spawnEntryId: stock.id, transactionType: "SALES_DISPATCH", quantityInKg: "0", quantityOutKg: String(quantity), balanceAfterKg: String(balance), referenceType: "DELIVERY_CHALLAN", referenceId: dc.id, reference: dc.dcNumber, notes: `Work Order #${reservation.workOrderId}`, recordedByUserId: userId });
  } else {
    const [stock] = await tx.select().from(casingSoilInventorySourcesTable).where(eq(casingSoilInventorySourcesTable.id, reservation.vaultStockId)).limit(1);
    if (!stock || numberValue(stock.availableQuantityKg) < quantity || numberValue(stock.reservedQuantityKg) < quantity) throw new Error(`Insufficient reserved Casing Soil stock in ${reservation.vaultReference}`);
    await tx.update(casingSoilInventorySourcesTable).set({ availableQuantityKg: String(numberValue(stock.availableQuantityKg) - quantity), reservedQuantityKg: String(numberValue(stock.reservedQuantityKg) - quantity), salesDispatchedQuantityKg: String(numberValue(stock.salesDispatchedQuantityKg) + quantity), status: numberValue(stock.availableQuantityKg) - quantity === 0 ? "depleted" : "available" }).where(eq(casingSoilInventorySourcesTable.id, stock.id));
  }
  const dispatched = numberValue(reservation.dispatchedQuantity) + quantity;
  await tx.update(vaultSalesReservationsTable).set({ dispatchedQuantity: String(dispatched), status: dispatched >= numberValue(reservation.orderedQuantity) ? "fulfilled" : "active", updatedAt: new Date() }).where(eq(vaultSalesReservationsTable.id, reservation.id));
  return reservation;
}

export async function dispatchVaultStockDirect(
  tx: any,
  line: any,
  quantity: number,
  dc: any,
  userId: number,
) {
  const vaultType = String(line.vaultType || "");
  const stockId = Number(line.vaultStockId);
  const sourceType = String(line.vaultSourceType || "").toLowerCase();
  if (!stockId || !["spawn", "casing_soil"].includes(vaultType))
    throw new Error("Select a valid Vault batch/lot for direct dispatch");
  if (!(quantity > 0))
    throw new Error("Direct Vault dispatch quantity must be greater than zero");

  if (vaultType === "spawn") {
    const [stock] = await tx
      .select()
      .from(spawnEntriesTable)
      .where(eq(spawnEntriesTable.id, stockId))
      .limit(1);
    if (!stock) throw new Error("Selected Spawn batch/lot was not found");
    const actualSource =
      stock.sourceType === "INTERNAL" ? "produced" : "purchased";
    const free =
      numberValue(stock.quantityKg) - numberValue(stock.reservedQuantityKg);
    if (actualSource !== sourceType || free < quantity)
      throw new Error(
        `Insufficient free Spawn stock. Available: ${Math.max(0, free)} kg. Requested: ${quantity} kg.`,
      );
    const balance = numberValue(stock.quantityKg) - quantity;
    await tx
      .update(spawnEntriesTable)
      .set({
        quantityKg: String(balance),
        status: balance === 0 ? "depleted" : "available",
      })
      .where(eq(spawnEntriesTable.id, stock.id));
    await tx.insert(spawnVaultTransactionsTable).values({
      transactionKey: `sales-dc:${dc.id}:line:${line.id}:direct`,
      spawnEntryId: stock.id,
      transactionType: "SALES_DISPATCH",
      quantityInKg: "0",
      quantityOutKg: String(quantity),
      balanceAfterKg: String(balance),
      referenceType: "DELIVERY_CHALLAN",
      referenceId: dc.id,
      reference: dc.dcNumber,
      notes: "Direct Delivery Challan dispatch (no Work Order reservation)",
      recordedByUserId: userId,
    });
    return;
  }

  const [stock] = await tx
    .select()
    .from(casingSoilInventorySourcesTable)
    .where(eq(casingSoilInventorySourcesTable.id, stockId))
    .limit(1);
  if (!stock) throw new Error("Selected Casing Soil batch/lot was not found");
  const free =
    numberValue(stock.availableQuantityKg) -
    numberValue(stock.reservedQuantityKg);
  if (String(stock.sourceType).toLowerCase() !== sourceType || free < quantity)
    throw new Error(
      `Insufficient free Casing Soil stock. Available: ${Math.max(0, free)} kg. Requested: ${quantity} kg.`,
    );
  const balance = numberValue(stock.availableQuantityKg) - quantity;
  await tx
    .update(casingSoilInventorySourcesTable)
    .set({
      availableQuantityKg: String(balance),
      salesDispatchedQuantityKg: String(
        numberValue(stock.salesDispatchedQuantityKg) + quantity,
      ),
      status: balance === 0 ? "depleted" : "available",
    })
    .where(eq(casingSoilInventorySourcesTable.id, stock.id));
}
