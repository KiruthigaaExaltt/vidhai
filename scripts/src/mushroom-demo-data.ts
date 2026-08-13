import {
  batchesTable,
  chamberReadingsTable,
  chambersTable,
  contactsTable,
  db,
  eq,
  inventoryCategoriesTable,
  inventoryLocationsTable,
  inventoryMovementsTable,
  inventoryTable,
  locationsTable,
  materialsTable,
  spawnEntriesTable,
  tasksTable,
  employeesTable,
  attendanceLogsTable,
  salarySlipsTable,
  leaveRequestsTable,
  crewClaimsTable,
  crewDeductionsTable,
  purchaseRequestsTable,
  purchaseOrdersTable,
  purchaseInvoicesTable,
  purchaseReturnsTable,
  goodsReceiptsTable,
  vendorPaymentsTable,
  salesOrdersTable,
  quotationsTable,
  proformaInvoicesTable,
  deliveryChallansTable,
  salesInvoicesTable,
  salesReturnsTable,
  accountsPayableTable,
  accountsReceivableTable,
  transactionsTable,
  vehiclesTable,
  fuelLogsTable,
  maintenanceLogsTable,
  vehicleUsageLogsTable,
  ootyRoomsTable,
  ootyGrowingBatchesTable,
  ootyObservationsTable,
  ootyHarvestsTable,
  labSpawnOutputTable,
  spawnTransactionsTable,
  casingSoilTransactionsTable,
  scheduleEventsTable,
  assetsTable,
  assetAllocationsTable,
  batchLinksTable,
  departmentsTable,
} from "@workspace/db";

const MARKER = "VIDHAI_MUSHROOM_DEMO_V1";
const LOCATION_CODES = [
  "DEMO-ANNUR",
  "DEMO-OOTY",
  "DEMO-COIMBATORE",
  "DEMO-LAB",
];
const WAREHOUSE_CODES = ["DEMO-WH-RAW", "DEMO-WH-FINISHED"];
const CATEGORY_CODES = ["DEMO-RAW", "DEMO-PACK"];
const MATERIAL_KEYS = [
  "DEMO-WHEAT-STRAW",
  "DEMO-CHICKEN-MANURE",
  "DEMO-GYPSUM",
  "DEMO-CASING-SOIL",
  "DEMO-BUTTON-MUSHROOM",
  "DEMO-PUNNET-200G",
];
const BATCH_CODES = ["DEMO-COMP-001", "DEMO-COMP-002"];
const VOLUME = 150;
const sequence = (prefix: string, count = VOLUME) =>
  Array.from({ length: count }, (_, index) =>
    `${prefix}${String(index + 1).padStart(4, "0")}`,
  );

const GENERATED = {
  batches: sequence("DEMO-BATCH-"),
  materials: sequence("DEMO-MAT-"),
  employees: sequence("DEMO-EMP-"),
  purchaseRequests: sequence("DEMO-PR-"),
  purchaseOrders: sequence("DEMO-PO-"),
  purchaseInvoices: sequence("DEMO-PINV-"),
  purchaseReturns: sequence("DEMO-PRET-"),
  salesOrders: sequence("DEMO-SO-"),
  receivables: sequence("DEMO-AR-"),
  payables: sequence("DEMO-AP-"),
  vehicles: sequence("DEMO-TN-66-"),
  growingBatches: sequence("DEMO-OOTY-"),
  assets: sequence("DEMO-ASSET-"),
  warehouses: sequence("DEMO-WH-"),
  categories: sequence("DEMO-CAT-"),
  goodsReceipts: sequence("DEMO-GRN-"),
  vendorPayments: sequence("DEMO-VPAY-"),
  quotations: sequence("DEMO-QT-"),
  proformas: sequence("DEMO-PI-"),
  challans: sequence("DEMO-DC-"),
  salesInvoices: sequence("DEMO-SINV-"),
  salesReturns: sequence("DEMO-SRET-"),
};

const isoDate = (offset: number) => {
  const date = new Date(Date.UTC(2026, 7, 1));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

async function rowsBy<T>(
  table: any,
  field: any,
  values: unknown[],
): Promise<T[]> {
  const rows: T[] = [];
  for (const value of values)
    rows.push(
      ...((await db.select().from(table).where(eq(field, value))) as T[]),
    );
  return rows;
}

async function insertOne(table: any, values: Record<string, unknown>) {
  const [row] = await db.insert(table).values(values).returning();
  return row as any;
}

async function removeDemoData() {
  const generatedVehicles = await rowsBy<any>(vehiclesTable, vehiclesTable.regNo, GENERATED.vehicles);
  for (const vehicle of generatedVehicles) {
    await db.delete(fuelLogsTable).where(eq(fuelLogsTable.vehicleId, vehicle.id));
    await db.delete(maintenanceLogsTable).where(eq(maintenanceLogsTable.vehicleId, vehicle.id));
    await db.delete(vehicleUsageLogsTable).where(eq(vehicleUsageLogsTable.vehicleId, vehicle.id));
  }
  const growingBatches = await rowsBy<any>(ootyGrowingBatchesTable, ootyGrowingBatchesTable.batchCode, GENERATED.growingBatches);
  for (const batch of growingBatches) {
    await db.delete(batchLinksTable).where(eq(batchLinksTable.ootyGrowingBatchId, batch.id));
    await db.delete(ootyObservationsTable).where(eq(ootyObservationsTable.growingBatchId, batch.id));
    await db.delete(ootyHarvestsTable).where(eq(ootyHarvestsTable.growingBatchId, batch.id));
  }
  const generatedEmployees = await rowsBy<any>(employeesTable, employeesTable.employeeCode, GENERATED.employees);
  for (const employee of generatedEmployees) {
    await db.delete(attendanceLogsTable).where(eq(attendanceLogsTable.employeeId, employee.id));
    await db.delete(salarySlipsTable).where(eq(salarySlipsTable.employeeId, employee.id));
    await db.delete(leaveRequestsTable).where(eq(leaveRequestsTable.employeeId, employee.id));
    await db.delete(crewClaimsTable).where(eq(crewClaimsTable.employeeId, employee.id));
    await db.delete(crewDeductionsTable).where(eq(crewDeductionsTable.employeeId, employee.id));
  }
  for (const value of GENERATED.purchaseReturns) await db.delete(purchaseReturnsTable).where(eq(purchaseReturnsTable.returnNumber, value));
  for (const value of GENERATED.purchaseInvoices) await db.delete(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.invoiceNumber, value));
  for (const value of GENERATED.goodsReceipts) await db.delete(goodsReceiptsTable).where(eq(goodsReceiptsTable.grnNumber, value));
  for (const value of GENERATED.vendorPayments) await db.delete(vendorPaymentsTable).where(eq(vendorPaymentsTable.paymentNumber, value));
  for (const value of GENERATED.purchaseOrders) await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.poNumber, value));
  for (const value of GENERATED.purchaseRequests) await db.delete(purchaseRequestsTable).where(eq(purchaseRequestsTable.prNumber, value));
  for (const value of GENERATED.salesOrders) await db.delete(salesOrdersTable).where(eq(salesOrdersTable.orderCode, value));
  for (const value of GENERATED.quotations) await db.delete(quotationsTable).where(eq(quotationsTable.quoteNumber, value));
  for (const value of GENERATED.proformas) await db.delete(proformaInvoicesTable).where(eq(proformaInvoicesTable.piNumber, value));
  for (const value of GENERATED.challans) await db.delete(deliveryChallansTable).where(eq(deliveryChallansTable.dcNumber, value));
  for (const value of GENERATED.salesInvoices) await db.delete(salesInvoicesTable).where(eq(salesInvoicesTable.invoiceNumber, value));
  for (const value of GENERATED.salesReturns) await db.delete(salesReturnsTable).where(eq(salesReturnsTable.returnNumber, value));
  for (const value of GENERATED.receivables) await db.delete(accountsReceivableTable).where(eq(accountsReceivableTable.invoiceNumber, value));
  for (const value of GENERATED.payables) await db.delete(accountsPayableTable).where(eq(accountsPayableTable.billNumber, value));
  for (const value of GENERATED.growingBatches) await db.delete(ootyGrowingBatchesTable).where(eq(ootyGrowingBatchesTable.batchCode, value));
  for (const value of GENERATED.vehicles) await db.delete(vehiclesTable).where(eq(vehiclesTable.regNo, value));
  const generatedAssets = await rowsBy<any>(assetsTable, assetsTable.sku, GENERATED.assets);
  for (const asset of generatedAssets)
    await db.delete(assetAllocationsTable).where(eq(assetAllocationsTable.assetId, asset.id));
  for (const value of GENERATED.assets) await db.delete(assetsTable).where(eq(assetsTable.sku, value));
  for (const value of GENERATED.employees) await db.delete(employeesTable).where(eq(employeesTable.employeeCode, value));
  await db.delete(spawnTransactionsTable).where(eq(spawnTransactionsTable.notes, MARKER));
  await db.delete(casingSoilTransactionsTable).where(eq(casingSoilTransactionsTable.notes, MARKER));
  await db.delete(scheduleEventsTable).where(eq(scheduleEventsTable.notes, MARKER));
  await db.delete(transactionsTable).where(eq(transactionsTable.description, MARKER));
  await db.delete(labSpawnOutputTable).where(eq(labSpawnOutputTable.notes, MARKER));
  await db.delete(ootyRoomsTable).where(eq(ootyRoomsTable.notes, MARKER));
  for (const value of GENERATED.categories) await db.delete(inventoryCategoriesTable).where(eq(inventoryCategoriesTable.categoryCode, value));
  for (const value of GENERATED.warehouses) await db.delete(inventoryLocationsTable).where(eq(inventoryLocationsTable.warehouseCode, value));
  for (let index = 0; index < 6; index++)
    await db.delete(departmentsTable).where(eq(departmentsTable.description, `${MARKER}: mushroom farm master department ${index + 1}`));
  const materials = await rowsBy<any>(
    materialsTable,
    materialsTable.itemIdentifier,
    [...MATERIAL_KEYS, ...GENERATED.materials],
  );
  const materialIds = materials.map((row) => row.id);
  const batches = await rowsBy<any>(
    batchesTable,
    batchesTable.batchCode,
    [...BATCH_CODES, ...GENERATED.batches],
  );
  const batchIds = batches.map((row) => row.id);
  const warehouses = await rowsBy<any>(
    inventoryLocationsTable,
    inventoryLocationsTable.warehouseCode,
    WAREHOUSE_CODES,
  );

  for (const materialId of materialIds) {
    await db
      .delete(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.materialId, materialId));
    await db
      .delete(inventoryTable)
      .where(eq(inventoryTable.materialId, materialId));
  }
  for (const batchId of batchIds) {
    await db.delete(batchLinksTable).where(eq(batchLinksTable.annurBatchId, batchId));
    const chambers = await db
      .select()
      .from(chambersTable)
      .where(eq(chambersTable.currentBatchId, batchId));
    for (const chamber of chambers)
      await db
        .delete(chamberReadingsTable)
        .where(eq(chamberReadingsTable.chamberId, chamber.id));
    await db
      .delete(chambersTable)
      .where(eq(chambersTable.currentBatchId, batchId));
  }
  await db.delete(chambersTable).where(eq(chambersTable.notes, MARKER));
  for (const code of [...BATCH_CODES, ...GENERATED.batches])
    await db.delete(batchesTable).where(eq(batchesTable.batchCode, code));
  for (const key of [...MATERIAL_KEYS, ...GENERATED.materials])
    await db
      .delete(materialsTable)
      .where(eq(materialsTable.itemIdentifier, key));
  for (const code of CATEGORY_CODES)
    await db
      .delete(inventoryCategoriesTable)
      .where(eq(inventoryCategoriesTable.categoryCode, code));
  for (const code of WAREHOUSE_CODES)
    await db
      .delete(inventoryLocationsTable)
      .where(eq(inventoryLocationsTable.warehouseCode, code));
  for (const code of LOCATION_CODES)
    await db.delete(locationsTable).where(eq(locationsTable.code, code));
  await db.delete(spawnEntriesTable).where(eq(spawnEntriesTable.notes, MARKER));
  await db.delete(contactsTable).where(eq(contactsTable.notes, MARKER));
  await db.delete(tasksTable).where(eq(tasksTable.notes, MARKER));

  return {
    materials: materialIds.length,
    batches: batchIds.length,
    warehouses: warehouses.length,
  };
}

async function seedDemoData() {
  await removeDemoData();

  const locationDefinitions = [
    [
      "DEMO-ANNUR",
      "Annur Compost Yard",
      "Demo compost preparation and pasteurization facility",
    ],
    [
      "DEMO-OOTY",
      "Ooty Growing Farm",
      "Demo climate-controlled button mushroom growing facility",
    ],
    [
      "DEMO-COIMBATORE",
      "Coimbatore Casing Unit",
      "Demo casing soil preparation facility",
    ],
    [
      "DEMO-LAB",
      "Spawn Laboratory",
      "Demo mushroom culture and spawn production laboratory",
    ],
  ];
  const locations: Record<string, any> = {};
  const configuredLocations = await db.select().from(locationsTable);
  const operationalCodes = ["A", "B", "C", "D"];
  for (const [index, [code, name, description]] of locationDefinitions.entries()) {
    const keyword = ["annur", "ooty", "coimbatore", "lab"][index];
    const existing = configuredLocations.find((row) =>
      row.code === operationalCodes[index] || row.name.toLowerCase().includes(keyword),
    );
    if (existing) locations[code] = existing;
    else {
      const [row] = await db.insert(locationsTable).values({ code, name, description }).returning();
      locations[code] = row;
    }
  }

  const [rawCategory] = await db
    .insert(inventoryCategoriesTable)
    .values({
      name: "Mushroom Raw Materials",
      categoryCode: "DEMO-RAW",
      sortOrder: 10,
      divisions: [],
      isActive: true,
    })
    .returning();
  const [packCategory] = await db
    .insert(inventoryCategoriesTable)
    .values({
      name: "Mushroom Products & Packaging",
      categoryCode: "DEMO-PACK",
      sortOrder: 20,
      divisions: [],
      isActive: true,
    })
    .returning();
  const [rawWarehouse] = await db
    .insert(inventoryLocationsTable)
    .values({
      warehouseCode: "DEMO-WH-RAW",
      locationName: "Raw Material Store",
      locationType: "Store",
      isSystem: false,
      isReservedWarehouse: false,
      isProtected: false,
      isActive: true,
      isDefault: false,
      capacity: "5000",
      capacityUnit: "kg",
      manager: "Demo Store Manager",
      contactNumber: "9000000001",
      address: "Annur Compost Yard",
    })
    .returning();
  const [finishedWarehouse] = await db
    .insert(inventoryLocationsTable)
    .values({
      warehouseCode: "DEMO-WH-FINISHED",
      locationName: "Cold Room & Dispatch Store",
      locationType: "Warehouse",
      isSystem: false,
      isReservedWarehouse: false,
      isProtected: false,
      isActive: true,
      isDefault: false,
      capacity: "1200",
      capacityUnit: "kg",
      manager: "Demo Dispatch Manager",
      contactNumber: "9000000002",
      address: "Ooty Growing Farm",
    })
    .returning();

  const warehouseManagers = ["Arun Kumar", "Karthik Raj", "Meena Selvi", "Priya Nair", "Suresh Babu", "Vignesh Kumar"];
  const generatedWarehouses: any[] = [];
  const generatedCategories: any[] = [];
  for (let index = 0; index < VOLUME; index++) {
    generatedCategories.push(await insertOne(inventoryCategoriesTable, {
      name: `${["Compost Inputs", "Growing Supplies", "Lab Consumables", "Harvest Packaging", "Farm Equipment"][index % 5]} ${index + 1}`,
      categoryCode: GENERATED.categories[index], sortOrder: 100 + index,
      divisions: [["Annur"], ["Ooty"], ["Coimbatore"], ["Lab"]][index % 4], isActive: index % 17 !== 0,
    }));
    generatedWarehouses.push(await insertOne(inventoryLocationsTable, {
      warehouseCode: GENERATED.warehouses[index],
      locationName: `${["Raw Material Godown", "Cold Storage", "Packing Store", "Spawn Store", "Casing Soil Yard"][index % 5]} ${String(index + 1).padStart(3, "0")}`,
      locationType: index % 4 === 0 ? "Store" : "Warehouse", isSystem: false,
      isReservedWarehouse: index % 15 === 0, isProtected: false, isActive: index % 19 !== 0, isDefault: false,
      capacity: String(500 + index * 25), capacityUnit: index % 3 === 0 ? "kg" : "square feet",
      manager: warehouseManagers[index % warehouseManagers.length], contactNumber: `91${String(8200000000 + index)}`,
      address: `${["Annur", "Ooty", "Coimbatore", "Mettupalayam"][index % 4]}, Tamil Nadu`,
    }));
  }

  for (const [index, name] of ["Compost Operations", "Growing Operations", "Harvest and Packing", "Spawn Laboratory", "Quality Control", "Farm Maintenance"].entries())
    await insertOne(departmentsTable, { organizationId: 1, name, description: `${MARKER}: mushroom farm master department ${index + 1}`, status: "Active" });

  const definitions = [
    [
      "Wheat Straw",
      "DEMO-WHEAT-STRAW",
      rawCategory.id,
      "kg",
      "6.50",
      "0",
      "500",
      "Raw Material",
    ],
    [
      "Chicken Manure",
      "DEMO-CHICKEN-MANURE",
      rawCategory.id,
      "kg",
      "4.25",
      "0",
      "300",
      "Raw Material",
    ],
    [
      "Gypsum",
      "DEMO-GYPSUM",
      rawCategory.id,
      "kg",
      "8.00",
      "0",
      "100",
      "Raw Material",
    ],
    [
      "Casing Soil",
      "DEMO-CASING-SOIL",
      rawCategory.id,
      "kg",
      "5.50",
      "0",
      "200",
      "Raw Material",
    ],
    [
      "Fresh Button Mushroom",
      "DEMO-BUTTON-MUSHROOM",
      packCategory.id,
      "kg",
      "0",
      "180",
      "25",
      "Finished Good",
    ],
    [
      "200 g Food-grade Punnet",
      "DEMO-PUNNET-200G",
      packCategory.id,
      "Nos",
      "3.20",
      "0",
      "250",
      "Packaging Material",
    ],
  ];
  const materials: Record<string, any> = {};
  for (const [
    name,
    key,
    categoryId,
    unit,
    buy,
    sell,
    critical,
    itemType,
  ] of definitions) {
    const [row] = await db
      .insert(materialsTable)
      .values({
        name,
        sku: key,
        category:
          categoryId === rawCategory.id ? "raw_material" : "finished_goods",
        categoryId,
        unit,
        buyPricePerUnit: buy,
        sellPricePerUnit: sell,
        gstPercent: "0",
        criticalLevel: critical,
        itemIdentifier: key,
        itemType,
        notes: MARKER,
        active: true,
        attributeValues: {},
      })
      .returning();
    materials[key] = row;
  }
  const stock = [
    ["DEMO-WHEAT-STRAW", rawWarehouse.id, "2400", "6.50"],
    ["DEMO-CHICKEN-MANURE", rawWarehouse.id, "950", "4.25"],
    ["DEMO-GYPSUM", rawWarehouse.id, "320", "8.00"],
    ["DEMO-CASING-SOIL", rawWarehouse.id, "780", "5.50"],
    ["DEMO-BUTTON-MUSHROOM", finishedWarehouse.id, "86", "125"],
    ["DEMO-PUNNET-200G", finishedWarehouse.id, "1600", "3.20"],
  ];
  for (const [key, locationId, quantityOnHand, costBasis] of stock)
    await db
      .insert(inventoryTable)
      .values({
        materialId: materials[key].id,
        locationId,
        quantityOnHand,
        costBasis,
      });
  await db
    .insert(inventoryMovementsTable)
    .values({
      materialId: materials["DEMO-WHEAT-STRAW"].id,
      toLocationId: rawWarehouse.id,
      quantityKg: "2400",
      reason: "Purchase receipt",
      notes: MARKER,
    });
  await db
    .insert(inventoryMovementsTable)
    .values({
      materialId: materials["DEMO-BUTTON-MUSHROOM"].id,
      toLocationId: finishedWarehouse.id,
      quantityKg: "86",
      reason: "Harvest receipt",
      notes: MARKER,
    });

  await db
    .insert(spawnEntriesTable)
    .values({
      strainName: "Agaricus bisporus A15",
      quantityKg: "42",
      source: "Certified commercial spawn",
      receivedAt: "2026-08-05",
      expiresAt: "2026-10-05",
      status: "available",
      notes: MARKER,
    });
  await db
    .insert(spawnEntriesTable)
    .values({
      strainName: "Agaricus bisporus U3",
      quantityKg: "18",
      source: "Spawn Laboratory",
      receivedAt: "2026-08-08",
      expiresAt: "2026-10-08",
      status: "available",
      notes: MARKER,
    });

  const [batch1] = await db
    .insert(batchesTable)
    .values({
      batchCode: "DEMO-COMP-001",
      locationId: locations["DEMO-ANNUR"].id,
      currentStage: "PHASE_II",
      status: "active",
      nitrogenContent: "2.15",
      targetBags: 1200,
      actualBags: 1184,
      notes: `${MARKER}: wheat-straw button mushroom compost`,
      alertLevel: "normal",
    })
    .returning();
  await db
    .insert(batchesTable)
    .values({
      batchCode: "DEMO-COMP-002",
      locationId: locations["DEMO-ANNUR"].id,
      currentStage: "PRE_WETTING",
      status: "active",
      nitrogenContent: "1.92",
      targetBags: 1000,
      notes: `${MARKER}: compost preparation`,
      alertLevel: "warning",
    });
  const [chamber] = await db
    .insert(chambersTable)
    .values({
      name: "Demo Pasteurization Tunnel 1",
      locationId: locations["DEMO-ANNUR"].id,
      chamberType: "bulk",
      status: "occupied",
      capacity: 1250,
      currentBatchId: batch1.id,
      lastTemperature: "58.4",
      lastNh3: "8.2",
      lengthM: "18",
      widthM: "4.5",
      heightM: "4",
      notes: MARKER,
    })
    .returning();
  await db
    .insert(chamberReadingsTable)
    .values({
      chamberId: chamber.id,
      temperatureCelsius: "58.4",
      nh3Ppm: "8.2",
      co2Percent: "1.8",
      humidity: "92",
      notes: MARKER,
    });

  await db
    .insert(contactsTable)
    .values({
      type: "vendor",
      name: "Demo Agro Straw Supplier",
      company: "Demo Agro Inputs",
      phone: "9000000010",
      whatsappNumber: "9000000010",
      email: "supplier.demo@example.com",
      address: "Coimbatore, Tamil Nadu",
      notes: MARKER,
    });
  await db
    .insert(contactsTable)
    .values({
      type: "client",
      name: "Demo Fresh Produce Buyer",
      company: "Demo Fresh Market",
      phone: "9000000011",
      whatsappNumber: "9000000011",
      email: "buyer.demo@example.com",
      address: "Ooty, Tamil Nadu",
      notes: MARKER,
    });

  await db
    .insert(tasksTable)
    .values({
      title: "Check compost core temperature",
      description:
        "Record tunnel temperature and ammonia before the next aeration cycle.",
      locationId: locations["DEMO-ANNUR"].id,
      status: "todo",
      priority: "high",
      estimatedMinutes: 30,
      batchRef: "DEMO-COMP-001",
      checklist: ["Calibrate probe", "Measure three points", "Record NH3"],
      notes: MARKER,
    });

  const farmingMaterials: any[] = [];
  const generatedBatches: any[] = [];
  const employees: any[] = [];
  const rooms: any[] = [];
  const vehicles: any[] = [];
  const materialNames = ["Wheat Straw", "Poultry Manure", "Gypsum", "Casing Peat", "Spawn Grain", "Packing Punnet"];
  const departments = ["Compost", "Growing", "Harvest", "Lab", "Packing", "Maintenance"];
  const strains = ["Agaricus bisporus A15", "Agaricus bisporus U3", "Agaricus bisporus S11"];
  const firstNames = ["Arun", "Karthik", "Meena", "Priya", "Suresh", "Vignesh", "Lakshmi", "Naveen", "Deepa", "Saravanan", "Anitha", "Ramesh", "Divya", "Prakash", "Kavitha"];
  const lastNames = ["Kumar", "Rajan", "Selvi", "Nair", "Babu", "Murugan", "Devi", "Krishnan", "Mani", "Ravi"];

  // High-volume, deterministic records exercise pagination in every operational area.
  for (let index = 0; index < VOLUME; index++) {
    const n = index + 1;
    const material = await insertOne(materialsTable, {
      name: `${materialNames[index % materialNames.length]} Lot ${String(n).padStart(3, "0")}`,
      sku: GENERATED.materials[index], itemIdentifier: GENERATED.materials[index],
      category: index % 5 === 4 ? "finished_goods" : "raw_material", categoryId: index % 5 === 4 ? packCategory.id : rawCategory.id,
      unit: index % 5 === 4 ? "kg" : "Nos", buyPricePerUnit: String(4 + (index % 20)), sellPricePerUnit: String(120 + (index % 35)),
      gstPercent: index % 3 === 0 ? "5" : "0", criticalLevel: String(25 + (index % 50)), itemType: index % 5 === 4 ? "Finished Good" : "Raw Material",
      notes: MARKER, active: true, attributeValues: { grade: ["A", "B", "Standard"][index % 3] },
    });
    farmingMaterials.push(material);
    await insertOne(inventoryTable, { materialId: material.id, locationId: index % 2 ? rawWarehouse.id : finishedWarehouse.id, quantityOnHand: String(80 + index * 3), costBasis: String(5 + (index % 18)) });
    await insertOne(inventoryMovementsTable, { materialId: material.id, toLocationId: index % 2 ? rawWarehouse.id : finishedWarehouse.id, quantityKg: String(80 + index * 3), reason: "Demo opening stock", notes: MARKER });

    const batch = await insertOne(batchesTable, {
      batchCode: GENERATED.batches[index], locationId: locations[["DEMO-ANNUR", "DEMO-COIMBATORE", "DEMO-LAB"][index % 3]].id,
      currentStage: ["PRE_WETTING", "PHASE_I", "PHASE_II", "READY_FOR_DISPATCH"][index % 4], status: index % 9 === 0 ? "completed" : "active",
      nitrogenContent: String(1.8 + (index % 7) / 10), targetBags: 800 + index * 4, actualBags: 760 + index * 4,
      notes: MARKER, alertLevel: index % 11 === 0 ? "warning" : "normal",
    });
    generatedBatches.push(batch);
    const chamber = await insertOne(chambersTable, { name: `${index % 2 ? "Growing Chamber" : "Pasteurization Tunnel"} ${String(n).padStart(3, "0")}`, locationId: locations[index % 2 ? "DEMO-OOTY" : "DEMO-ANNUR"].id, chamberType: index % 2 ? "growing" : "bulk", status: index % 7 === 0 ? "idle" : "occupied", capacity: 850 + index * 4, currentBatchId: index % 7 === 0 ? undefined : batch.id, lastTemperature: String(index % 2 ? 17 + index % 3 : 56 + index % 5), lastNh3: String(index % 2 ? 1 + index % 2 : 7 + index % 6), lengthM: "18", widthM: "4.5", heightM: "4", notes: MARKER });
    await insertOne(chamberReadingsTable, { chamberId: chamber.id, temperatureCelsius: String(index % 2 ? 17 + index % 3 : 56 + index % 5), nh3Ppm: String(index % 2 ? 1 + index % 2 : 7 + index % 6), co2Percent: String(1.2 + index % 4 / 10), humidity: String(85 + index % 10), notes: MARKER });
    await insertOne(spawnEntriesTable, { strainName: strains[index % strains.length], quantityKg: String(10 + index % 40), source: "Demo Spawn Laboratory", receivedAt: isoDate(index % 30), expiresAt: isoDate(60 + index % 30), status: index % 12 === 0 ? "reserved" : "available", notes: MARKER });
    await insertOne(tasksTable, { title: `${["Check compost temperature", "Inspect casing moisture", "Record room humidity", "Grade harvested mushrooms"][index % 4]} ${n}`, description: "Mushroom farm demo task generated for pagination testing.", locationId: locations[LOCATION_CODES[index % LOCATION_CODES.length]].id, status: ["todo", "in_progress", "completed"][index % 3], priority: ["low", "medium", "high"][index % 3], estimatedMinutes: 20 + index % 70, batchRef: GENERATED.batches[index], checklist: ["Inspect", "Record", "Confirm"], notes: MARKER });
    await insertOne(contactsTable, { type: index % 2 ? "client" : "vendor", name: `${index % 2 ? "Fresh Produce Buyer" : "Farm Input Supplier"} ${n}`, company: `Demo Mushroom Partner ${n}`, phone: `91${String(8000000000 + n)}`, whatsappNumber: `91${String(8000000000 + n)}`, email: `mushroom.partner.${n}@example.com`, address: ["Coimbatore", "Ooty", "Annur"][index % 3] + ", Tamil Nadu", notes: MARKER });

    const employeeName = `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}`;
    const employee = await insertOne(employeesTable, { employeeCode: GENERATED.employees[index], name: employeeName, designation: ["Compost Operator", "Grow Room Technician", "Harvester", "Lab Assistant"][index % 4], department: departments[index % departments.length], employmentType: index % 5 === 0 ? "Contract" : "Permanent", annualCtc: String(240000 + index * 1200), baseSalary: String(18000 + index * 75), status: index % 18 === 0 ? "On Leave" : "Active", workMode: "On-site", email: `${firstNames[index % firstNames.length].toLowerCase()}.${n}@vidhai-farm.example`, phone: `9000${String(100000 + n)}`, location: ["Annur", "Ooty", "Coimbatore", "Lab"][index % 4], joinDate: isoDate(-300 - index), systemKey: `${MARKER}-${n}`, isSystemGenerated: true });
    employees.push(employee);
    await insertOne(attendanceLogsTable, { employeeId: employee.id, employeeName: employee.name, employeeCode: employee.employeeCode, department: employee.department, designation: employee.designation, attendanceDate: isoDate(-(index % 30)), status: index % 10 === 0 ? "Absent" : "Present", checkInTime: "08:55", checkOutTime: "17:35", timezone: "Asia/Kolkata", notes: MARKER });
    await insertOne(salarySlipsTable, { payrollMonth: "2026-08", employeeId: employee.id, employeeName: employee.name, employeeCode: employee.employeeCode, department: employee.department, designation: employee.designation, workLocation: employee.location, location: employee.location, calendarMonthDays: 31, monthDays: 31, presentDays: String(24 + index % 4), absentDays: String(index % 3), payableDays: String(27 + index % 4), baseSalary: employee.baseSalary, earnedBaseSalary: employee.baseSalary, grossPay: String(19000 + index * 75), totalDeductions: String(500 + index % 300), netPay: String(18500 + index * 70), status: index % 4 === 0 ? "Paid" : "Generated" });
    await insertOne(leaveRequestsTable, { employeeId: employee.id, employeeName: employee.name, startDate: isoDate(index % 25), endDate: isoDate(index % 25 + index % 3), leaveType: ["Sick", "Casual", "Earned"][index % 3], reason: ["Medical appointment", "Family commitment", "Personal work"][index % 3], status: ["Pending", "Approved", "Rejected"][index % 3], requestedDays: String(index % 3 + 1) });
    await insertOne(crewClaimsTable, { employeeId: employee.id, employeeName: employee.name, claimType: "overtime", amount: String(350 + index % 8 * 75), title: `Overtime - ${isoDate(-(index % 30))}`, notes: MARKER, attendanceDate: isoDate(-(index % 30)), requestedHours: String(1 + index % 4), payrollMonth: "2026-08", status: ["Pending", "Approved", "Rejected"][index % 3] });
    await insertOne(crewClaimsTable, { employeeId: employee.id, employeeName: employee.name, claimType: "bonus", amount: String(500 + index % 10 * 100), title: ["Harvest target bonus", "Quality achievement bonus", "Attendance bonus"][index % 3], notes: MARKER, payrollMonth: "2026-08", status: ["Pending", "Approved", "Rejected"][index % 3] });
    await insertOne(crewDeductionsTable, { employeeId: employee.id, employeeName: employee.name, amount: String(100 + index % 6 * 50), notes: MARKER, date: isoDate(-(index % 30)), month: 8, year: 2026, status: ["Pending", "Approved", "Rejected"][index % 3], source: index % 2 ? "manual" : "attendance", autoReason: index % 2 ? undefined : "Late arrival", lateMinutes: index % 2 ? 0 : 15 + index % 30, calculatedAmount: String(100 + index % 6 * 50), autoApproved: index % 3 === 1 });

    const quantity = 100 + (index % 20) * 10;
    const amount = quantity * (8 + index % 12);
    await insertOne(purchaseRequestsTable, { prNumber: GENERATED.purchaseRequests[index], vendorName: `Demo Agro Vendor ${index % 12 + 1}`, itemName: materialNames[index % materialNames.length], lineItems: [{ itemName: materialNames[index % materialNames.length], quantity, unit: "kg" }], quantity: String(quantity), unit: "kg", priority: ["Normal", "High", "Urgent"][index % 3], department: "Production", status: ["Draft", "Submitted", "Approved", "PO Created"][index % 4], requestedByName: "Demo Farm Manager", requiredDate: isoDate(index % 40), project: "Mushroom Production", notes: MARKER });
    await insertOne(purchaseOrdersTable, { vendorName: `Demo Agro Vendor ${index % 12 + 1}`, poNumber: GENERATED.purchaseOrders[index], prReference: GENERATED.purchaseRequests[index], items: materialNames[index % materialNames.length], lineItems: [{ itemName: materialNames[index % materialNames.length], quantity, unit: "kg", rate: amount / quantity }], orderedQuantity: String(quantity), receivedQuantity: String(index % 3 ? quantity : 0), remainingQuantity: String(index % 3 ? 0 : quantity), subtotal: String(amount), taxAmount: String(amount * .05), totalAmount: String(amount * 1.05), poDate: isoDate(-(index % 45)), deliveryDate: isoDate(index % 20), warehouse: "Raw Material Store", department: "Production", notes: MARKER, status: ["Draft", "Issued", "Completed"][index % 3] });
    await insertOne(purchaseInvoicesTable, { invoiceNumber: GENERATED.purchaseInvoices[index], vendorId: `DEMO-VENDOR-${String(index % 12 + 1).padStart(3, "0")}`, vendorName: `Demo Agro Vendor ${index % 12 + 1}`, vendorAddress: `${["Annur", "Coimbatore", "Mettupalayam"][index % 3]}, Tamil Nadu`, vendorPhone: `91${String(8100000000 + index % 12 + 1)}`, poReference: GENERATED.purchaseOrders[index], amount: String(amount * 1.05), taxableAmount: String(amount), cgstPercent: "2.5", sgstPercent: "2.5", cgstAmount: String(amount * .025), sgstAmount: String(amount * .025), lineItems: [{ itemName: materialNames[index % materialNames.length], quantity, unit: "kg" }], invoiceDate: isoDate(-(index % 45)), dueDate: isoDate(30 - index % 20), status: ["Unpaid", "Partially Paid", "Paid"][index % 3], notes: MARKER });
    await insertOne(goodsReceiptsTable, { grnNumber: GENERATED.goodsReceipts[index], poReference: GENERATED.purchaseOrders[index], vendorId: `DEMO-VENDOR-${String(index % 12 + 1).padStart(3, "0")}`, vendorName: `Demo Agro Vendor ${index % 12 + 1}`, itemsReceived: materialNames[index % materialNames.length], lineItems: [{ itemName: materialNames[index % materialNames.length], orderedQty: quantity, receivedQty: quantity, warehouse: generatedWarehouses[index].locationName }], orderedQuantity: String(quantity), receivedQuantity: String(quantity), remainingQuantity: "0", receivedDate: isoDate(-(index % 30)), notes: MARKER, inspectedByName: "Quality Control Team", status: index % 12 === 0 ? "Pending" : "Complete" });
    await insertOne(vendorPaymentsTable, { paymentNumber: GENERATED.vendorPayments[index], vendorName: `Demo Agro Vendor ${index % 12 + 1}`, invoiceReference: GENERATED.purchaseInvoices[index], amount: String(amount * 1.05), paymentMode: ["UPI / NetBanking", "Bank Transfer", "Cheque"][index % 3], bankAccount: "Farm Operations Account", transactionReference: `DEMO-TXN-${String(n).padStart(5, "0")}`, notes: MARKER, paymentDate: isoDate(-(index % 30)), status: ["Pending Approval", "Approved", "Paid"][index % 3], requiredApprovals: 1, approvalLevel: index % 3 === 0 ? 0 : 1, approvedByUserIds: [] });
    await insertOne(purchaseReturnsTable, { returnNumber: GENERATED.purchaseReturns[index], vendorName: `Demo Agro Vendor ${index % 12 + 1}`, invoiceReference: GENERATED.purchaseInvoices[index], reason: ["Moisture above specification", "Damaged packaging", "Quality variance"][index % 3], returnDate: isoDate(-(index % 20)), lineItems: [{ itemName: materialNames[index % materialNames.length], quantity: 2 + index % 8, unit: "kg" }], notes: MARKER, refundAmount: String(100 + index * 5), status: ["Requested", "Approved", "Completed"][index % 3] });

    await insertOne(salesOrdersTable, { orderCode: GENERATED.salesOrders[index], productType: "Fresh Button Mushroom", saleType: "external", transactionDate: isoDate(-(index % 40)), qtyKg: String(20 + index % 80), unit: "kg", buyerName: `Demo Fresh Market ${index % 15 + 1}`, fromBatchId: batch.id, fromBatchCode: batch.batchCode, qualityNote: ["Premium grade", "Standard grade", "Processing grade"][index % 3], unitPrice: String(130 + index % 30), totalValue: String((20 + index % 80) * (130 + index % 30)), notes: MARKER });
    const clientId = 10000 + index;
    const clientName = `${["Nilgiri Fresh Foods", "Kovai Organic Market", "Green Basket Retail", "Hillview Hotels", "Tamil Nadu Caterers"][index % 5]} ${index % 30 + 1}`;
    const salesTotal = (20 + index % 80) * (130 + index % 30);
    await insertOne(quotationsTable, { quoteNumber: GENERATED.quotations[index], quotationNumber: GENERATED.quotations[index], rootQuoteNumber: GENERATED.quotations[index], clientId, clientName, customerMobile: `91${String(8300000000 + index)}`, customerWhatsappNumber: `91${String(8300000000 + index)}`, customerCompany: clientName, customerAddress: `${["Ooty", "Coimbatore", "Erode", "Tiruppur"][index % 4]}, Tamil Nadu`, placeOfSupply: "Tamil Nadu", validityDays: 30, quotationDate: isoDate(-(index % 40)), validUntil: isoDate(30 - index % 20), subtotal: String(salesTotal), taxableAmount: String(salesTotal), cgstTotal: String(salesTotal * .025), sgstTotal: String(salesTotal * .025), grandTotal: String(salesTotal * 1.05), notes: MARKER, status: ["Draft", "Sent", "Approved"][index % 3], versionSeries: index % 3 === 0 ? "Draft" : "Sent", versionNumber: 1, versionLabel: index % 3 === 0 ? "Draft V1" : "Sent V1", isLatestVersion: true, isLocked: index % 3 === 2 });
    await insertOne(proformaInvoicesTable, { piNumber: GENERATED.proformas[index], rootPiNumber: GENERATED.proformas[index], quoteIds: [], clientId, clientName, customerMobile: `91${String(8300000000 + index)}`, customerCompany: clientName, customerAddress: `${["Ooty", "Coimbatore", "Erode", "Tiruppur"][index % 4]}, Tamil Nadu`, placeOfSupply: "Tamil Nadu", piDate: isoDate(-(index % 35)), validUntil: isoDate(25 - index % 15), subtotal: String(salesTotal), taxableAmount: String(salesTotal), cgstTotal: String(salesTotal * .025), sgstTotal: String(salesTotal * .025), grandTotal: String(salesTotal * 1.05), notes: MARKER, status: ["Draft", "Sent", "Approved"][index % 3], versionSeries: "Sent", versionNumber: 1, versionLabel: "Sent V1", isLatestVersion: true, isLocked: index % 3 === 2 });
    await insertOne(deliveryChallansTable, { dcNumber: GENERATED.challans[index], quotationIds: [], piIds: [], clientId, clientName, customerMobile: `91${String(8300000000 + index)}`, customerCompany: clientName, customerAddress: `${["Ooty", "Coimbatore", "Erode", "Tiruppur"][index % 4]}, Tamil Nadu`, placeOfSupply: "Tamil Nadu", dcDate: isoDate(-(index % 30)), deliveryDate: isoDate(-(index % 25)), subtotal: String(salesTotal), cgstTotal: String(salesTotal * .025), sgstTotal: String(salesTotal * .025), grandTotal: String(salesTotal * 1.05), notes: MARKER, status: index % 3 === 0 ? "Draft" : "Dispatched", stockDeducted: index % 3 !== 0 });
    await insertOne(salesInvoicesTable, { invoiceNumber: GENERATED.salesInvoices[index], rootInvoiceNumber: GENERATED.salesInvoices[index], quotationIds: [], piIds: [], dcIds: [], clientId, clientName, customerMobile: `91${String(8300000000 + index)}`, customerCompany: clientName, customerAddress: `${["Ooty", "Coimbatore", "Erode", "Tiruppur"][index % 4]}, Tamil Nadu`, placeOfSupply: "Tamil Nadu", invoiceDate: isoDate(-(index % 30)), dueDate: isoDate(20 - index % 10), subtotal: String(salesTotal), taxableAmount: String(salesTotal), cgstTotal: String(salesTotal * .025), sgstTotal: String(salesTotal * .025), grandTotal: String(salesTotal * 1.05), amountPaid: index % 3 === 0 ? String(salesTotal * 1.05) : "0", balanceDue: index % 3 === 0 ? "0" : String(salesTotal * 1.05), paymentStatus: index % 3 === 0 ? "Paid" : "Unpaid", notes: MARKER, status: index % 3 === 0 ? "Paid" : "Approved", versionSeries: "Sent", versionNumber: 1, versionLabel: "Sent V1", isLatestVersion: true, isLocked: true });
    await insertOne(salesReturnsTable, { returnNumber: GENERATED.salesReturns[index], clientId, clientName, customerMobile: `91${String(8300000000 + index)}`, customerCompany: clientName, customerAddress: `${["Ooty", "Coimbatore", "Erode", "Tiruppur"][index % 4]}, Tamil Nadu`, placeOfSupply: "Tamil Nadu", returnDate: isoDate(-(index % 20)), restock: true, restocked: index % 3 === 2, subtotal: String(salesTotal * .1), cgstTotal: String(salesTotal * .0025), sgstTotal: String(salesTotal * .0025), grandTotal: String(salesTotal * .105), notes: MARKER, status: ["Draft", "Sent", "Received"][index % 3] });
    await insertOne(accountsReceivableTable, { clientName: `Demo Fresh Market ${index % 15 + 1}`, invoiceNumber: GENERATED.receivables[index], invoiceDate: isoDate(-(index % 40)), dueDate: isoDate(15 - index % 10), amount: String(amount), receivedAmount: String(index % 3 === 0 ? amount : 0), adjustedAmount: "0", status: index % 3 === 0 ? "Settled" : "Pending", approvalStatus: "Approved", notes: MARKER, sourceType: "Demo Sales" });
    await insertOne(accountsPayableTable, { vendorName: `Demo Agro Vendor ${index % 12 + 1}`, billNumber: GENERATED.payables[index], billDate: isoDate(-(index % 45)), dueDate: isoDate(20 - index % 12), amount: String(amount), paidAmount: String(index % 4 === 0 ? amount : 0), adjustedAmount: "0", status: index % 4 === 0 ? "Paid" : "Pending", approvalStatus: "Approved", notes: MARKER, sourceType: "Demo Procurement" });
    await insertOne(transactionsTable, { date: isoDate(-(index % 60)), description: MARKER, category: ["Mushroom Sales", "Raw Materials", "Farm Utilities"][index % 3], type: index % 3 === 0 ? "Income" : "Expense", amount: String(amount) });

    const vehicle = await insertOne(vehiclesTable, { name: `Farm Logistics Vehicle ${n}`, regNo: GENERATED.vehicles[index], homeLocationId: locations[LOCATION_CODES[index % LOCATION_CODES.length]].id, vehicleType: ["truck", "pickup", "refrigerated_van"][index % 3], status: index % 8 === 0 ? "maintenance" : "available", notes: MARKER });
    vehicles.push(vehicle);
    await insertOne(fuelLogsTable, { vehicleId: vehicle.id, fuelDate: isoDate(-(index % 30)), litres: String(20 + index % 35), costPerLitre: "94.50", totalCost: String((20 + index % 35) * 94.5), odometer: String(12000 + index * 113), notes: MARKER });
    await insertOne(maintenanceLogsTable, { vehicleId: vehicle.id, serviceDate: isoDate(-(index % 90)), description: ["Oil and filter service", "Cold-unit inspection", "Tyre inspection"][index % 3], cost: String(1200 + index * 20), nextServiceDue: isoDate(60 + index % 30), notes: MARKER });
    await insertOne(vehicleUsageLogsTable, { vehicleId: vehicle.id, usageDate: isoDate(-(index % 30)), hoursWorked: String(3 + index % 7), workType: ["Raw material collection", "Fresh mushroom delivery", "Inter-farm transfer"][index % 3], fromLocationId: locations[LOCATION_CODES[index % LOCATION_CODES.length]].id, toLocationId: locations[LOCATION_CODES[(index + 1) % LOCATION_CODES.length]].id, notes: MARKER });

    await insertOne(casingSoilTransactionsTable, { transactionType: ["buy", "produce", "sell"][index % 3], quantityKg: String(100 + index * 2), counterparty: `Demo Casing Partner ${index % 8 + 1}`, unitPrice: String(5 + index % 4), totalCost: String((100 + index * 2) * (5 + index % 4)), transactionDate: isoDate(-(index % 50)), coimbatoreBatchId: batch.id, notes: MARKER });
    const output = await insertOne(labSpawnOutputTable, { batchId: batch.id, strainName: strains[index % strains.length], quantityKg: String(15 + index % 30), producedAt: isoDate(-(index % 40)), status: index % 8 === 0 ? "reserved" : "available", notes: MARKER });
    await insertOne(spawnTransactionsTable, { transactionType: ["produce", "sell", "transfer"][index % 3], strainName: strains[index % strains.length], quantityKg: String(5 + index % 20), counterparty: `Demo Grower ${index % 10 + 1}`, unitPrice: "180", transactionDate: isoDate(-(index % 40)), notes: MARKER, labSpawnOutputId: output.id });
    await insertOne(scheduleEventsTable, { locationCode: LOCATION_CODES[index % LOCATION_CODES.length], entityType: "batch", entityId: batch.id, eventType: ["Turning", "Casing", "Harvest", "Dispatch"][index % 4], startDate: isoDate(index % 20), plannedDate: isoDate(index % 30), actualDate: index % 3 === 0 ? isoDate(index % 30) : undefined, isSuggestion: index % 5 === 0, planCode: `DEMO-PLAN-${String(n).padStart(4, "0")}`, notes: MARKER });
    const allocatedQuantity = index % 5;
    const asset = await insertOne(assetsTable, { sku: GENERATED.assets[index], name: `${["Humidity Meter", "Harvest Crate", "Temperature Probe", "Protective Kit"][index % 4]} ${n}`, category: ["Instrument", "Harvest", "Monitoring", "Safety"][index % 4], status: ["Active", "Active", "Under Maintenance", "Inactive"][index % 4], totalQuantity: String(5 + index % 20), allocatedQuantity: String(allocatedQuantity), availableQuantity: String(5 + index % 20 - allocatedQuantity), purchaseValue: String(2500 + index * 25), unitPrice: String(500 + index * 5), purchaseDate: isoDate(-100 - index), qrPayload: `VIDHAI:${GENERATED.assets[index]}`, isDeleted: false });
    if (allocatedQuantity > 0)
      await insertOne(assetAllocationsTable, { assetId: asset.id, employeeId: employee.id, quantity: String(allocatedQuantity), status: "Allocated", allocatedDate: isoDate(-(index % 60)) });
  }

  for (let index = 0; index < 12; index++) rooms.push(await insertOne(ootyRoomsTable, { name: `Demo Growing Room ${index + 1}`, locationId: locations["DEMO-OOTY"].id, status: "occupied", capacity: 1200, notes: MARKER }));
  for (let index = 0; index < VOLUME; index++) {
    const growing = await insertOne(ootyGrowingBatchesTable, { batchCode: GENERATED.growingBatches[index], roomId: rooms[index % rooms.length].id, annurBatchId: generatedBatches[index].id, currentPhase: ["SPAWN_RUN", "CASING_RUN", "FRUITING", "HARVEST"][index % 4], currentStage: ["SPAWN_RUN", "CASING_RUN", "FRUITING", "HARVEST"][index % 4], status: index % 10 === 0 ? "completed" : "active", spawnRunStartDate: isoDate(-30 + index % 20), casingAppliedDate: isoDate(-15 + index % 10), substrateWeightKg: String(800 + index * 2), notes: MARKER });
    await insertOne(ootyObservationsTable, { growingBatchId: growing.id, observationDate: isoDate(-(index % 30)), temperatureCelsius: String(16 + index % 4), observationNote: MARKER, observationType: "daily" });
    await insertOne(ootyHarvestsTable, { growingBatchId: growing.id, harvestDate: isoDate(-(index % 20)), weightKg: String(25 + index % 50), mushroomCount: 500 + index * 3, avgWeightG: String(18 + index % 8), qualityNote: `${MARKER}: ${index % 3 === 0 ? "Premium" : "Standard"}`, flushNumber: index % 3 + 1 });
    await insertOne(batchLinksTable, { ootyGrowingBatchId: growing.id, annurBatchId: generatedBatches[index].id, coimBatchId: generatedBatches[(index + 1) % generatedBatches.length].id, notes: MARKER });
  }
  await db
    .insert(tasksTable)
    .values({
      title: "Inspect casing moisture",
      description: "Check moisture uniformity before applying casing soil.",
      locationId: locations["DEMO-COIMBATORE"].id,
      status: "todo",
      priority: "medium",
      estimatedMinutes: 45,
      batchRef: "DEMO-COMP-001",
      checklist: ["Collect samples", "Check moisture", "Update batch notes"],
      notes: MARKER,
    });

  return {
    locations: 4,
    warehouses: generatedWarehouses.length + 2,
    categories: generatedCategories.length + 2,
    materials: definitions.length + farmingMaterials.length,
    inventoryRows: stock.length + farmingMaterials.length,
    spawnEntries: VOLUME + 2,
    batches: VOLUME + 2,
    contacts: VOLUME + 2,
    tasks: VOLUME + 2,
    recordsPerMajorModule: VOLUME,
    employees: employees.length,
    procurementRecords: VOLUME * 4,
    goodsReceipts: VOLUME,
    vendorPayments: VOLUME,
    salesRecords: VOLUME,
    accountingRecords: VOLUME * 3,
    fleetRecords: VOLUME * 4,
    chambers: VOLUME + 1,
    crewLeaves: VOLUME,
    crewOvertime: VOLUME,
    crewBonuses: VOLUME,
    crewDeductions: VOLUME,
    ootyGrowingRecords: VOLUME * 3,
    labRecords: VOLUME * 2,
    coimbatoreRecords: VOLUME,
    scheduleRecords: VOLUME,
    assets: VOLUME,
    traceabilityLinks: VOLUME,
  };
}

async function main() {
  const command = process.argv[2];
  if (command === "seed")
    console.log("Mushroom demo data seeded:", await seedDemoData());
  else if (command === "clear")
    console.log("Mushroom demo data removed:", await removeDemoData());
  else throw new Error("Use either 'seed' or 'clear'.");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(
      "Demo data command failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  },
);
