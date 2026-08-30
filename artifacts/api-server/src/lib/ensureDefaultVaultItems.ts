import {
  and,
  batchMaterialsTable,
  batchInventoryConsumptionsTable,
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
  vaultSalesReservationsTable,
} from "@workspace/db";

export const PROTECTED_VAULT_ITEM_NAMES = new Set([
  "mushroom",
  "manure",
  "grow bag",
  "casing soil",
  "spawn",
  "diesel",
  "coir pith",
  "press mud",
  "limestone",
  "millets",
  "gypsum",
  "calcium",
  "can",
  "castor doc",
  "chicken manure",
  "hm bags",
  "pp bags",
  "paddy straw",
  "sugar cane",
  "urea",
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
    name: "Diesel",
    sku: "VLT-RM-DIESEL",
    unit: "Litre",
    itemType: "Raw Material",
    categoryName: "Fuel",
    warehouse: "ANNUR",
    preserveOtherWarehouses: true,
  },
  ...[
    ["Coir Pith", "VLT-RM-COIR-PITH"], ["Press Mud", "VLT-RM-PRESS-MUD"],
    ["Limestone", "VLT-RM-LIMESTONE"], ["Millets", "VLT-RM-MILLETS"],
    ["Gypsum", "VLT-RM-GYPSUM"], ["Calcium", "VLT-RM-CALCIUM"],
    ["CAN", "VLT-RM-CAN"], ["Castor DOC", "VLT-RM-CASTOR-DOC"],
    ["Chicken Manure", "VLT-RM-CHICKEN-MANURE"], ["HM Bags", "VLT-RM-HM-BAGS"],
    ["PP Bags", "VLT-RM-PP-BAGS"], ["Paddy Straw", "VLT-RM-PADDY-STRAW"],
    ["Sugar Cane", "VLT-RM-SUGAR-CANE"], ["Urea", "VLT-RM-UREA"],
  ].map(([name, sku]) => ({ name, sku, unit: "kg", itemType: "Raw Material", categoryName: "Raw Material", warehouse: "ANNUR", preserveOtherWarehouses: true })),
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

const DEFAULT_ITEM_ALIASES: Record<string, string[]> = {
  "HM Bags": ["H M Bags"],
  "PP Bags": ["P P Bags"],
  Urea: ["U"],
  "Castor DOC": ["Castro DOC"],
  "Chicken Manure": ["Chickemn Manure"],
  "Sugar Cane": ["Sugarcane"],
};

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
  for (const itemType of ["Raw Material", "Finished Product", "Fuel"] as const) {
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
          categoryCode: `CAT-${itemType.toUpperCase().replaceAll(" ", "-")}`,
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
  const seededItemNames = await db.select().from(itemNamesTable);
  for (const item of (DEFAULT_VAULT_ITEMS as readonly any[]).filter((candidate) => candidate.preserveOtherWarehouses)) {
    const category = categoryByItemType.get(item.categoryName || item.itemType)!;
    const acceptedNames = [item.name, ...(DEFAULT_ITEM_ALIASES[item.name] || [])].map((name) => name.toLowerCase());
    const matches = seededItemNames.filter((row) => acceptedNames.includes(row.name.trim().toLowerCase()));
    const existing = matches.find((row) => row.name.trim().toLowerCase() === item.name.toLowerCase()) ?? matches[0];
    if (existing) {
      await db.update(itemNamesTable).set({ name: item.name, categoryId: category.id, isActive: true }).where(eq(itemNamesTable.id, existing.id));
      for (const duplicate of matches.filter((row) => row.id !== existing.id))
        await db.update(itemNamesTable).set({ isActive: false }).where(eq(itemNamesTable.id, duplicate.id));
    } else {
      const [created] = await db.insert(itemNamesTable).values({ name: item.name, categoryId: category.id, isActive: true }).returning();
      seededItemNames.push(created);
    }
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

  for (const item of DEFAULT_VAULT_ITEMS as readonly any[]) {
    const acceptedNames = [item.name, ...(DEFAULT_ITEM_ALIASES[item.name] || [])].map((name) => name.toLowerCase());
    let material =
      acceptedNames.map((name) => byName.get(name)).find(Boolean) ??
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
          category: item.categoryName === "Fuel" ? "fuel" : item.itemType === "Finished Product" ? "finished_product" : "raw_material",
          categoryId: categoryByItemType.get(item.categoryName || item.itemType)!.id,
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
        category: item.categoryName === "Fuel" ? "fuel" : item.itemType === "Finished Product" ? "finished_product" : "raw_material",
        categoryId: categoryByItemType.get(item.categoryName || item.itemType)!.id,
        itemIdentifier: item.sku,
        qrPayload: `/product/${encodeURIComponent(item.sku)}`,
        buyPricePerUnit: material.buyPricePerUnit ?? "0",
        sellPricePerUnit: material.sellPricePerUnit ?? "0",
      })
      .where(eq(materialsTable.id, material.id))
      .returning();

    // Older defaults occasionally created spelling variants as separate
    // materials (for example, Sugarcane). Merge those generated aliases into
    // the protected canonical item without losing stock or history.
    const duplicateMaterials = existingMaterials.filter(
      (candidate) =>
        candidate.id !== material.id &&
        acceptedNames.includes(candidate.name.trim().toLowerCase()),
    );
    for (const duplicate of duplicateMaterials) {
      const canonicalStocks = await db
        .select()
        .from(inventoryTable)
        .where(eq(inventoryTable.materialId, material.id));
      const duplicateStocks = await db
        .select()
        .from(inventoryTable)
        .where(eq(inventoryTable.materialId, duplicate.id));
      for (const duplicateStock of duplicateStocks) {
        const canonicalStock = canonicalStocks.find(
          (row) => row.locationId === duplicateStock.locationId,
        );
        if (canonicalStock) {
          await db
            .update(inventoryTable)
            .set({
              quantityOnHand: String(
                Number(canonicalStock.quantityOnHand || 0) +
                  Number(duplicateStock.quantityOnHand || 0),
              ),
              lastUpdated: new Date(),
            })
            .where(eq(inventoryTable.id, canonicalStock.id));
          await db.update(casingSoilInventorySourcesTable).set({ inventoryId: canonicalStock.id }).where(eq(casingSoilInventorySourcesTable.inventoryId, duplicateStock.id));
          await db.update(casingSoilInventoryPostingsTable).set({ inventoryId: canonicalStock.id }).where(eq(casingSoilInventoryPostingsTable.inventoryId, duplicateStock.id));
          await db.update(ootyCookoutInventoryPostingsTable).set({ inventoryId: canonicalStock.id }).where(eq(ootyCookoutInventoryPostingsTable.inventoryId, duplicateStock.id));
          await db.delete(inventoryTable).where(eq(inventoryTable.id, duplicateStock.id));
        } else {
          await db.update(inventoryTable).set({ materialId: material.id }).where(eq(inventoryTable.id, duplicateStock.id));
          canonicalStocks.push({ ...duplicateStock, materialId: material.id });
        }
      }
      for (const table of [
        batchMaterialsTable,
        coimbatoreBatchMaterialsTable,
        inventoryAdjustmentsTable,
        inventoryMovementsTable,
        batchInventoryConsumptionsTable,
        casingSoilInventorySourcesTable,
        vaultSalesReservationsTable,
      ] as const)
        await db.update(table).set({ materialId: material.id }).where(eq(table.materialId, duplicate.id));
      await db.delete(materialsTable).where(eq(materialsTable.id, duplicate.id));
      byName.delete(duplicate.name.trim().toLowerCase());
    }

    const targetLocation = warehouses[item.warehouse as WarehouseCode];
    const stockRows = await db
      .select()
      .from(inventoryTable)
      .where(eq(inventoryTable.materialId, material.id));
    const misplacedCookoutRows: typeof stockRows = [];
    const consolidationRows = item.preserveOtherWarehouses
      ? stockRows.filter((row) => row.locationId === targetLocation.id)
      : stockRows;
    const targetStock = consolidationRows.find(
      (row) => row.locationId === targetLocation.id,
    );
    const totalQuantity = [
      ...consolidationRows,
      ...misplacedCookoutRows,
    ].reduce((sum, row) => sum + Number(row.quantityOnHand || 0), 0);
    let canonicalStock = targetStock ?? consolidationRows[0];
    if (canonicalStock) {
      if (!item.preserveOtherWarehouses) {
        [canonicalStock] = await db
          .update(inventoryTable)
          .set({ locationId: targetLocation.id, quantityOnHand: String(totalQuantity) })
          .where(eq(inventoryTable.id, canonicalStock.id))
          .returning();
        for (const extraStock of consolidationRows) {
          if (extraStock.id !== canonicalStock.id) {
            await db.delete(inventoryTable).where(eq(inventoryTable.id, extraStock.id));
          }
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
