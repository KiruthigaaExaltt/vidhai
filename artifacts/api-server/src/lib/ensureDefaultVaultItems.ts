import {
  and,
  batchMaterialsTable,
  coimbatoreBatchMaterialsTable,
  casingSoilInventoryPostingsTable,
  casingSoilInventorySourcesTable,
  db,
  eq,
  inArray,
  inventoryAdjustmentsTable,
  inventoryCategoriesTable,
  inventoryLocationsTable,
  inventoryMovementsTable,
  itemNamesTable,
  inventoryTable,
  materialsTable,
  ootyCookoutInventoryPostingsTable,
} from "@workspace/db";

export const PROTECTED_VAULT_ITEM_NAMES = new Set([
  "mushroom",
  "manure",
  "grow bag",
  "casing soil",
  "spawn",
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
  LAB: {
    warehouseCode: "WH-LAB",
    locationName: "Lab Warehouse",
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
    name: "Spawn",
    sku: "VLT-FP-SPAWN",
    unit: "kg",
    itemType: "Finished Product",
    warehouse: "LAB",
  },
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
  {
    name: "Casing Soil",
    sku: "VLT-FP-CASING-SOIL",
    unit: "kg",
    itemType: "Finished Product",
    warehouse: "COIMBATORE",
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
  const casingSources = await db.select().from(casingSoilInventorySourcesTable);
  for (const source of casingSources) {
    if ((source as any).origin) continue;
    await db
      .update(casingSoilInventorySourcesTable)
      .set({
        origin: source.sourceType === "produced" ? "internal" : "external",
      })
      .where(eq(casingSoilInventorySourcesTable.id, source.id));
  }
  const redundantItemNames = new Set([
    "manure",
    "grow bag",
    "mushroom from ooty",
    "mushroom",
    "casing soil",
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
  const existingCategories = await db.select().from(inventoryCategoriesTable);
  const categoryByItemType = new Map<
    string,
    (typeof existingCategories)[number]
  >();
  for (const itemType of ["Raw Material", "Finished Product"] as const) {
    const normalizedType = itemType.toLowerCase().replace(/[^a-z]/g, "");
    let category = existingCategories.find((candidate) => {
      const normalizedName = candidate.name
        .toLowerCase()
        .replace(/[^a-z]/g, "");
      const normalizedCode = String(candidate.categoryCode ?? "")
        .toLowerCase()
        .replace(/[^a-z]/g, "");
      return (
        normalizedName === normalizedType ||
        normalizedCode === normalizedType ||
        normalizedCode === `cat${normalizedType}`
      );
    });
    if (!category) {
      [category] = await db
        .insert(inventoryCategoriesTable)
        .values({
          name: itemType,
          categoryCode:
            itemType === "Finished Product"
              ? "CAT-FINISHED-PRODUCT"
              : "CAT-RAW-MATERIAL",
          divisions: ["Production"],
          isActive: true,
        })
        .returning();
      existingCategories.push(category);
    } else if (!category.isActive) {
      [category] = await db
        .update(inventoryCategoriesTable)
        .set({ isActive: true })
        .where(eq(inventoryCategoriesTable.id, category.id))
        .returning();
    }
    categoryByItemType.set(itemType, category);
  }
  const allMaterials = await db.select().from(materialsTable);
  // Never remove non-vault materials here. They are production master data and
  // may be referenced by locked Annur/Coimbatore formulation history.
  // This bootstrap only ensures the protected vault products exist.
  const existingMaterials = allMaterials;
  const byName = new Map(
    existingMaterials.map((material) => [
      material.name.trim().toLowerCase(),
      material,
    ]),
  );
  let createdItems = 0;
  let createdStockRows = 0;

  for (const item of DEFAULT_VAULT_ITEMS) {
    let material =
      byName.get(item.name.toLowerCase()) ??
      existingMaterials.find(
        (candidate) =>
          String(candidate.sku ?? "")
            .trim()
            .toLowerCase() === item.sku.toLowerCase(),
      );
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
          categoryId: categoryByItemType.get(item.itemType)!.id,
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
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        itemType: item.itemType,
        category:
          item.itemType === "Finished Product"
            ? "finished_product"
            : "raw_material",
        categoryId: categoryByItemType.get(item.itemType)!.id,
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

    if (item.name === "Casing Soil" && canonicalStock) {
      await db
        .update(casingSoilInventorySourcesTable)
        .set({
          inventoryId: canonicalStock.id,
          warehouseId: targetLocation.id,
        })
        .where(eq(casingSoilInventorySourcesTable.materialId, material.id));
      const casingPostings = await db
        .select()
        .from(casingSoilInventoryPostingsTable);
      for (const posting of casingPostings) {
        await db
          .update(casingSoilInventoryPostingsTable)
          .set({
            inventoryId: canonicalStock.id,
            warehouseId: targetLocation.id,
          })
          .where(eq(casingSoilInventoryPostingsTable.id, posting.id));
      }
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
    deletedItems: 0,
    totalDefaults: DEFAULT_VAULT_ITEMS.length,
  };
}
