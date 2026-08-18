import {
  and,
  db,
  eq,
  inventoryAdjustmentsTable,
  inventoryLocationsTable,
  itemNamesTable,
  inventoryTable,
  materialsTable,
  ootyCookoutInventoryPostingsTable,
} from "@workspace/db";

export const PROTECTED_VAULT_ITEM_NAMES = new Set([
  "mushroom",
  "manure",
  "grow bag",
]);

const DEFAULT_WAREHOUSES = {
  ANNUR: {
    warehouseCode: "WH-ANNUR",
    locationName: "Annur Warehouse",
    capacityUnit: "kg",
  },
  COIMBATORE: {
    warehouseCode: "WH-COIMBATORE",
    locationName: "Coimbatore Warehouse",
    capacityUnit: "kg",
  },
  OOTY: {
    warehouseCode: "WH-OOTY",
    locationName: "Ooty Warehouse",
    capacityUnit: "Nos",
  },
} as const;

const DEFAULT_VAULT_ITEMS = [
  {
    name: "Mushroom",
    sku: "VLT-FP-MUSHROOM",
    unit: "Nos",
    itemType: "Finished Product",
    warehouse: "OOTY",
  },
  {
    name: "Manure",
    sku: "VLT-RM-MANURE",
    unit: "kg",
    itemType: "Raw Material",
    warehouse: "OOTY",
  },
  {
    name: "Grow Bag",
    sku: "VLT-RM-GROW-BAG",
    unit: "Nos",
    itemType: "Raw Material",
    warehouse: "ANNUR",
  },
] as const;

type WarehouseCode = keyof typeof DEFAULT_WAREHOUSES;

async function ensureDefaultWarehouses() {
  const existing = await db.select().from(inventoryLocationsTable);
  const warehouses = {} as Record<WarehouseCode, (typeof existing)[number]>;

  for (const [systemCode, definition] of Object.entries(DEFAULT_WAREHOUSES) as [
    WarehouseCode,
    (typeof DEFAULT_WAREHOUSES)[WarehouseCode],
  ][]) {
    let warehouse = existing.find(
      (row) =>
        String(row.systemCode ?? "").toUpperCase() === systemCode ||
        row.warehouseCode === definition.warehouseCode,
    );
    if (!warehouse && systemCode === "OOTY") {
      warehouse = existing.find((row) =>
        /ooty/i.test(String(row.locationName ?? "")),
      );
    }
    if (warehouse) {
      [warehouse] = await db
        .update(inventoryLocationsTable)
        .set({
          ...definition,
          locationType: "Warehouse",
          systemCode,
          isSystem: true,
          isProtected: true,
          isActive: true,
          manager: "System",
        })
        .where(eq(inventoryLocationsTable.id, warehouse.id))
        .returning();
    } else {
      [warehouse] = await db
        .insert(inventoryLocationsTable)
        .values({
          ...definition,
          locationType: "Warehouse",
          systemCode,
          isSystem: true,
          isProtected: true,
          isActive: true,
          capacity: 999999,
          manager: "System",
        })
        .returning();
    }
    warehouses[systemCode] = warehouse;
  }
  return warehouses;
}

export async function ensureOotyVaultLocation() {
  return (await ensureDefaultWarehouses()).OOTY;
}

export async function ensureDefaultVaultItems() {
  const redundantItemNames = new Set([
    "manure",
    "grow bag",
    "mushroom from ooty",
    "mushroom",
  ]);
  const itemNames = await db.select().from(itemNamesTable);
  for (const itemName of itemNames) {
    if (redundantItemNames.has(itemName.name.trim().toLowerCase())) {
      await db
        .update(itemNamesTable)
        .set({ isActive: false })
        .where(eq(itemNamesTable.id, itemName.id));
    }
  }
  const warehouses = await ensureDefaultWarehouses();
  const existingMaterials = await db.select().from(materialsTable);
  const byName = new Map(
    existingMaterials.map((material) => [
      material.name.trim().toLowerCase(),
      material,
    ]),
  );
  let createdItems = 0;
  let createdStockRows = 0;

  for (const item of DEFAULT_VAULT_ITEMS) {
    let material = byName.get(item.name.toLowerCase());
    if (!material) {
      [material] = await db
        .insert(materialsTable)
        .values({
          name: item.name,
          sku: item.sku,
          unit: item.unit,
          itemType: item.itemType,
          category:
            item.itemType === "Finished Product"
              ? "finished_product"
              : "raw_material",
          itemIdentifier: item.sku,
          qrPayload: `/product/${encodeURIComponent(item.sku)}`,
          criticalLevel: "0",
        })
        .returning();
      byName.set(item.name.toLowerCase(), material);
      createdItems += 1;
    }

    [material] = await db
      .update(materialsTable)
      .set({
        sku: item.sku,
        unit: item.unit,
        itemType: item.itemType,
        category:
          item.itemType === "Finished Product"
            ? "finished_product"
            : "raw_material",
        buyPricePerUnit: material.buyPricePerUnit ?? "0",
        sellPricePerUnit: material.sellPricePerUnit ?? "0",
      })
      .where(eq(materialsTable.id, material.id))
      .returning();

    const targetLocation = warehouses[item.warehouse];
    const stockRows = await db
      .select()
      .from(inventoryTable)
      .where(eq(inventoryTable.materialId, material.id));
    // Repair Cookout stock formerly matched to Chicken Manure while keeping Chicken Manure in Annur.
    const chickenMaterial = byName.get("chicken manure");
    const misplacedCookoutRows =
      item.name === "Manure" && chickenMaterial
        ? await db
            .select()
            .from(inventoryTable)
            .where(
              and(
                eq(inventoryTable.materialId, chickenMaterial.id),
                eq(inventoryTable.locationId, warehouses.OOTY.id),
              ),
            )
        : [];
    const consolidationRows = stockRows;
    const targetStock = consolidationRows.find(
      (row) => row.locationId === targetLocation.id,
    );
    const totalQuantity = [
      ...consolidationRows,
      ...misplacedCookoutRows,
    ].reduce((sum, row) => sum + Number(row.quantityOnHand || 0), 0);
    let canonicalStock = targetStock ?? consolidationRows[0];
    if (canonicalStock) {
      [canonicalStock] = await db
        .update(inventoryTable)
        .set({
          locationId: targetLocation.id,
          quantityOnHand: String(totalQuantity),
        })
        .where(eq(inventoryTable.id, canonicalStock.id))
        .returning();
      for (const extraStock of [
        ...consolidationRows,
        ...misplacedCookoutRows,
      ]) {
        if (extraStock.id !== canonicalStock.id) {
          await db
            .delete(inventoryTable)
            .where(eq(inventoryTable.id, extraStock.id));
        }
      }
    } else {
      await db.insert(inventoryTable).values({
        materialId: material.id,
        locationId: targetLocation.id,
        quantityOnHand: "0",
      });
      createdStockRows += 1;
    }

    if (item.name === "Manure" && canonicalStock) {
      const postings = await db
        .select()
        .from(ootyCookoutInventoryPostingsTable);
      for (const posting of postings) {
        await db
          .update(inventoryAdjustmentsTable)
          .set({ materialId: material.id })
          .where(
            eq(inventoryAdjustmentsTable.id, posting.inventoryAdjustmentId),
          );
        await db
          .update(ootyCookoutInventoryPostingsTable)
          .set({
            inventoryId: canonicalStock.id,
            warehouseId: warehouses.OOTY.id,
          })
          .where(eq(ootyCookoutInventoryPostingsTable.id, posting.id));
      }
    }
  }

  return {
    createdItems,
    createdStockRows,
    totalDefaults: DEFAULT_VAULT_ITEMS.length,
  };
}
