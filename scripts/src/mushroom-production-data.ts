import {
  batchesTable,
  chamberReadingsTable,
  chambersTable,
  contactsTable,
  db,
  eq,
  ilike,
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
  stageLogsTable,
  coimbatoreBatchMaterialsTable,
  coimbatoreConfigTable,
  coimbatoreTurnsTable,
  qcDecisionsTable,
  ootyStageLogsTable,
  inventoryAdjustmentsTable,
  itemNamesTable,
  servicesTable,
  taskAssignmentsTable,
  taskTimeLogsTable,
  payrollTable,
  vendorAvailabilityTable,
  salesPaymentsTable,
  salesInvoiceItemsTable,
  quotationItemsTable,
  proformaInvoiceItemsTable,
  deliveryChallanItemsTable,
  salesReturnItemsTable,
  chartOfAccountsTable,
  journalEntriesTable,
  journalLinesTable,
  partyLedgerEntriesTable,
  attendanceTemplatesTable,
  workPatternTemplatesTable,
  salaryTemplatesTable,
  holidayTemplatesTable,
  leaveTemplatesTable,
  organizationDetailsTable,
  alertColorsTable,
  workOrderTemplatesTable,
  salesWorkOrdersTable,
  batchMaterialsTable,
  labBatchMaterialsTable,
  usersTable,
  rolesTable,
} from "@workspace/db";

/**
 * Marker stored only in internal note/system fields. Cleanup relies on this
 * marker and the MF-* identifiers, so normal production records are untouched.
 */
const MARKER = "Routine mushroom farm operational record";
const LEGACY_MARKER = "VIDHAI_MUSHROOM_DEMO_V1";
const LOCATION_CODES = ["MF-ANNUR", "MF-OOTY", "MF-COIMBATORE", "MF-LAB"];
const WAREHOUSE_CODES = ["MF-WH-RAW", "MF-WH-FINISHED"];
const CATEGORY_CODES = ["MF-RAW", "MF-PACK"];
const MATERIAL_KEYS = [
  "MF-WHEAT-STRAW",
  "MF-CHICKEN-MANURE",
  "MF-GYPSUM",
  "MF-CASING-SOIL",
  "MF-BUTTON-MUSHROOM",
  "MF-PUNNET-200G",
];
const BATCH_CODES = ["MF-COMP-001", "MF-COMP-002"];
const legacyCodes = (values: string[]) =>
  values.map((value) => value.replace(/^MF-/, "DEMO-"));
const VOLUME = 150;
const MASTER_VOLUME = 12;
const FLEET_VOLUME = 10;
const SEEDED_USER_COUNT = 12;
const currentDate = new Date();
const CURRENT_YEAR = currentDate.getUTCFullYear();
const CURRENT_MONTH = currentDate.getUTCMonth() + 1;
const PAYROLL_MONTH = `${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, "0")}`;
const sequence = (prefix: string, count = VOLUME) => [
  ...Array.from(
    { length: count },
    (_, index) => `${prefix}${String(index + 1).padStart(4, "0")}`,
  ),
  ...Array.from(
    { length: count },
    (_, index) =>
      `${prefix.replace(/^MF-/, "DEMO-")}${String(index + 1).padStart(4, "0")}`,
  ),
];

const GENERATED = {
  batches: sequence("MF-BATCH-"),
  materials: sequence("MF-MAT-"),
  employees: sequence("MF-EMP-"),
  purchaseRequests: sequence("MF-PR-"),
  purchaseOrders: sequence("MF-PO-"),
  purchaseInvoices: sequence("MF-PINV-"),
  purchaseReturns: sequence("MF-PRET-"),
  salesOrders: sequence("MF-SO-"),
  receivables: sequence("MF-AR-"),
  payables: sequence("MF-AP-"),
  vehicles: sequence("MF-TN-66-"),
  growingBatches: sequence("MF-OOTY-"),
  assets: sequence("MF-ASSET-"),
  warehouses: sequence("MF-WH-"),
  categories: sequence("MF-CAT-"),
  goodsReceipts: sequence("MF-GRN-"),
  vendorPayments: sequence("MF-VPAY-"),
  quotations: sequence("MF-QT-"),
  proformas: sequence("MF-PI-"),
  challans: sequence("MF-DC-"),
  salesInvoices: sequence("MF-SINV-"),
  salesReturns: sequence("MF-SRET-"),
  salesPayments: sequence("MF-RCPT-"),
  workOrders: sequence("MF-WO-"),
};

const SERVICE_NAMES = [
  "Cold-chain delivery",
  "Mushroom quality grading",
  "Grow-room sanitation",
];
const TEMPLATE_NAMES = {
  attendance: "Farm Operations Shift",
  workPattern: "Six Day Farm Week",
  salary: "Mushroom Farm Staff Salary",
  holiday: "Tamil Nadu Farm Holidays",
  leave: "Farm Employee Leave Policy",
  workOrder: "Fresh Mushroom Packing and Dispatch",
};

const isoDate = (offset: number) => {
  const now = new Date();
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
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

async function removeProductionDataset() {
  for (let index = 0; index < SEEDED_USER_COUNT; index++)
    await db
      .delete(usersTable)
      .where(eq(usersTable.systemKey, `MUSHROOM_SEED_USER_${index + 1}`));
  for (const [table, field] of [
    [spawnTransactionsTable, spawnTransactionsTable.notes],
    [casingSoilTransactionsTable, casingSoilTransactionsTable.notes],
    [scheduleEventsTable, scheduleEventsTable.notes],
    [transactionsTable, transactionsTable.description],
    [labSpawnOutputTable, labSpawnOutputTable.notes],
    [ootyRoomsTable, ootyRoomsTable.notes],
    [spawnEntriesTable, spawnEntriesTable.notes],
    [contactsTable, contactsTable.notes],
    [tasksTable, tasksTable.notes],
  ] as const)
    await db.delete(table).where(eq(field, LEGACY_MARKER));
  for (const workOrderNumber of GENERATED.workOrders)
    await db
      .delete(salesWorkOrdersTable)
      .where(eq(salesWorkOrdersTable.workOrderNumber, workOrderNumber));
  await db
    .delete(workOrderTemplatesTable)
    .where(eq(workOrderTemplatesTable.name, TEMPLATE_NAMES.workOrder));
  const generatedTasks = (await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.notes, MARKER))) as any[];
  for (const task of generatedTasks) {
    await db
      .delete(taskAssignmentsTable)
      .where(eq(taskAssignmentsTable.taskId, task.id));
    await db
      .delete(taskTimeLogsTable)
      .where(eq(taskTimeLogsTable.taskId, task.id));
  }
  const generatedInvoices = await rowsBy<any>(
    salesInvoicesTable,
    salesInvoicesTable.invoiceNumber,
    GENERATED.salesInvoices,
  );
  for (const invoice of generatedInvoices) {
    await db
      .delete(salesInvoiceItemsTable)
      .where(eq(salesInvoiceItemsTable.invoiceId, invoice.id));
    await db
      .delete(salesPaymentsTable)
      .where(eq(salesPaymentsTable.invoiceId, invoice.id));
  }
  const generatedQuotes = await rowsBy<any>(
    quotationsTable,
    quotationsTable.quoteNumber,
    GENERATED.quotations,
  );
  for (const quote of generatedQuotes)
    await db
      .delete(quotationItemsTable)
      .where(eq(quotationItemsTable.quotationId, quote.id));
  const generatedProformas = await rowsBy<any>(
    proformaInvoicesTable,
    proformaInvoicesTable.piNumber,
    GENERATED.proformas,
  );
  for (const proforma of generatedProformas)
    await db
      .delete(proformaInvoiceItemsTable)
      .where(eq(proformaInvoiceItemsTable.piId, proforma.id));
  const generatedChallans = await rowsBy<any>(
    deliveryChallansTable,
    deliveryChallansTable.dcNumber,
    GENERATED.challans,
  );
  for (const challan of generatedChallans)
    await db
      .delete(deliveryChallanItemsTable)
      .where(eq(deliveryChallanItemsTable.dcId, challan.id));
  const generatedReturns = await rowsBy<any>(
    salesReturnsTable,
    salesReturnsTable.returnNumber,
    GENERATED.salesReturns,
  );
  for (const salesReturn of generatedReturns)
    await db
      .delete(salesReturnItemsTable)
      .where(eq(salesReturnItemsTable.returnId, salesReturn.id));
  const generatedVehicles = await rowsBy<any>(
    vehiclesTable,
    vehiclesTable.regNo,
    GENERATED.vehicles,
  );
  for (const vehicle of generatedVehicles) {
    await db
      .delete(fuelLogsTable)
      .where(eq(fuelLogsTable.vehicleId, vehicle.id));
    await db
      .delete(maintenanceLogsTable)
      .where(eq(maintenanceLogsTable.vehicleId, vehicle.id));
    await db
      .delete(vehicleUsageLogsTable)
      .where(eq(vehicleUsageLogsTable.vehicleId, vehicle.id));
  }
  const growingBatches = await rowsBy<any>(
    ootyGrowingBatchesTable,
    ootyGrowingBatchesTable.batchCode,
    GENERATED.growingBatches,
  );
  for (const batch of growingBatches) {
    await db
      .delete(batchLinksTable)
      .where(eq(batchLinksTable.ootyGrowingBatchId, batch.id));
    await db
      .delete(ootyStageLogsTable)
      .where(eq(ootyStageLogsTable.growingBatchId, batch.id));
    await db
      .delete(ootyObservationsTable)
      .where(eq(ootyObservationsTable.growingBatchId, batch.id));
    await db
      .delete(ootyHarvestsTable)
      .where(eq(ootyHarvestsTable.growingBatchId, batch.id));
  }
  const generatedEmployees = await rowsBy<any>(
    employeesTable,
    employeesTable.employeeCode,
    GENERATED.employees,
  );
  for (const employee of generatedEmployees) {
    await db
      .delete(attendanceLogsTable)
      .where(eq(attendanceLogsTable.employeeId, employee.id));
    await db
      .delete(salarySlipsTable)
      .where(eq(salarySlipsTable.employeeId, employee.id));
    await db
      .delete(leaveRequestsTable)
      .where(eq(leaveRequestsTable.employeeId, employee.id));
    await db
      .delete(crewClaimsTable)
      .where(eq(crewClaimsTable.employeeId, employee.id));
    await db
      .delete(crewDeductionsTable)
      .where(eq(crewDeductionsTable.employeeId, employee.id));
    await db
      .delete(payrollTable)
      .where(eq(payrollTable.employeeId, employee.id));
  }
  for (const value of GENERATED.purchaseReturns)
    await db
      .delete(purchaseReturnsTable)
      .where(eq(purchaseReturnsTable.returnNumber, value));
  for (const value of GENERATED.purchaseInvoices)
    await db
      .delete(purchaseInvoicesTable)
      .where(eq(purchaseInvoicesTable.invoiceNumber, value));
  for (const value of GENERATED.goodsReceipts)
    await db
      .delete(goodsReceiptsTable)
      .where(eq(goodsReceiptsTable.grnNumber, value));
  for (const value of GENERATED.vendorPayments)
    await db
      .delete(vendorPaymentsTable)
      .where(eq(vendorPaymentsTable.paymentNumber, value));
  const generatedPurchaseRequests = await rowsBy<any>(
    purchaseRequestsTable,
    purchaseRequestsTable.prNumber,
    GENERATED.purchaseRequests,
  );
  for (const request of generatedPurchaseRequests)
    await db
      .delete(vendorAvailabilityTable)
      .where(eq(vendorAvailabilityTable.purchaseRequestId, request.id));
  for (const value of GENERATED.purchaseOrders)
    await db
      .delete(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.poNumber, value));
  for (const value of GENERATED.purchaseRequests)
    await db
      .delete(purchaseRequestsTable)
      .where(eq(purchaseRequestsTable.prNumber, value));
  for (const value of GENERATED.salesPayments)
    await db
      .delete(salesPaymentsTable)
      .where(eq(salesPaymentsTable.paymentNumber, value));
  for (const value of GENERATED.salesOrders)
    await db
      .delete(salesOrdersTable)
      .where(eq(salesOrdersTable.orderCode, value));
  for (const value of GENERATED.quotations)
    await db
      .delete(quotationsTable)
      .where(eq(quotationsTable.quoteNumber, value));
  for (const value of GENERATED.proformas)
    await db
      .delete(proformaInvoicesTable)
      .where(eq(proformaInvoicesTable.piNumber, value));
  for (const value of GENERATED.challans)
    await db
      .delete(deliveryChallansTable)
      .where(eq(deliveryChallansTable.dcNumber, value));
  for (const value of GENERATED.salesInvoices)
    await db
      .delete(salesInvoicesTable)
      .where(eq(salesInvoicesTable.invoiceNumber, value));
  for (const value of GENERATED.salesReturns)
    await db
      .delete(salesReturnsTable)
      .where(eq(salesReturnsTable.returnNumber, value));
  for (const value of GENERATED.receivables)
    await db
      .delete(accountsReceivableTable)
      .where(eq(accountsReceivableTable.invoiceNumber, value));
  for (const value of GENERATED.payables)
    await db
      .delete(accountsPayableTable)
      .where(eq(accountsPayableTable.billNumber, value));
  for (const value of GENERATED.growingBatches)
    await db
      .delete(ootyGrowingBatchesTable)
      .where(eq(ootyGrowingBatchesTable.batchCode, value));
  for (const value of GENERATED.vehicles)
    await db.delete(vehiclesTable).where(eq(vehiclesTable.regNo, value));
  const generatedAssets = await rowsBy<any>(
    assetsTable,
    assetsTable.sku,
    GENERATED.assets,
  );
  for (const asset of generatedAssets)
    await db
      .delete(assetAllocationsTable)
      .where(eq(assetAllocationsTable.assetId, asset.id));
  for (const value of GENERATED.assets)
    await db.delete(assetsTable).where(eq(assetsTable.sku, value));
  for (const value of GENERATED.employees)
    await db
      .delete(employeesTable)
      .where(eq(employeesTable.employeeCode, value));
  await db
    .delete(spawnTransactionsTable)
    .where(eq(spawnTransactionsTable.notes, MARKER));
  await db
    .delete(casingSoilTransactionsTable)
    .where(eq(casingSoilTransactionsTable.notes, MARKER));
  await db
    .delete(scheduleEventsTable)
    .where(eq(scheduleEventsTable.notes, MARKER));
  await db
    .delete(transactionsTable)
    .where(eq(transactionsTable.description, MARKER));
  await db
    .delete(partyLedgerEntriesTable)
    .where(eq(partyLedgerEntriesTable.notes, MARKER));
  const generatedJournals = (await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.description, MARKER))) as any[];
  for (const journal of generatedJournals) {
    await db
      .delete(journalLinesTable)
      .where(eq(journalLinesTable.journalEntryId, journal.id));
    await db
      .delete(journalEntriesTable)
      .where(eq(journalEntriesTable.id, journal.id));
  }
  await db
    .delete(chartOfAccountsTable)
    .where(eq(chartOfAccountsTable.description, MARKER));
  await db
    .delete(labSpawnOutputTable)
    .where(eq(labSpawnOutputTable.notes, MARKER));
  await db.delete(ootyRoomsTable).where(eq(ootyRoomsTable.notes, MARKER));
  await db
    .delete(alertColorsTable)
    .where(ilike(alertColorsTable.description, `${MARKER}%`));
  const seededCategories = await rowsBy<any>(
    inventoryCategoriesTable,
    inventoryCategoriesTable.categoryCode,
    [
      ...CATEGORY_CODES,
      ...legacyCodes(CATEGORY_CODES),
      ...GENERATED.categories,
    ],
  );
  for (const category of seededCategories)
    await db
      .delete(itemNamesTable)
      .where(eq(itemNamesTable.categoryId, category.id));
  for (const value of GENERATED.categories)
    await db
      .delete(inventoryCategoriesTable)
      .where(eq(inventoryCategoriesTable.categoryCode, value));
  for (const value of GENERATED.warehouses)
    await db
      .delete(inventoryLocationsTable)
      .where(eq(inventoryLocationsTable.warehouseCode, value));
  for (let index = 0; index < 6; index++)
    await db
      .delete(departmentsTable)
      .where(
        eq(
          departmentsTable.description,
          `${MARKER}: mushroom farm master department ${index + 1}`,
        ),
      );
  for (let index = 0; index < 6; index++)
    await db
      .delete(departmentsTable)
      .where(
        eq(
          departmentsTable.description,
          `${LEGACY_MARKER}: mushroom farm master department ${index + 1}`,
        ),
      );
  const materials = await rowsBy<any>(
    materialsTable,
    materialsTable.itemIdentifier,
    [...MATERIAL_KEYS, ...legacyCodes(MATERIAL_KEYS), ...GENERATED.materials],
  );
  const materialIds = materials.map((row) => row.id);
  for (const materialId of materialIds)
    await db
      .delete(inventoryAdjustmentsTable)
      .where(eq(inventoryAdjustmentsTable.materialId, materialId));
  const batches = await rowsBy<any>(batchesTable, batchesTable.batchCode, [
    ...BATCH_CODES,
    ...legacyCodes(BATCH_CODES),
    ...GENERATED.batches,
  ]);
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
    await db
      .delete(batchMaterialsTable)
      .where(eq(batchMaterialsTable.batchId, batchId));
    await db
      .delete(labBatchMaterialsTable)
      .where(eq(labBatchMaterialsTable.batchId, batchId));
    await db.delete(stageLogsTable).where(eq(stageLogsTable.batchId, batchId));
    await db
      .delete(coimbatoreBatchMaterialsTable)
      .where(eq(coimbatoreBatchMaterialsTable.batchId, batchId));
    await db
      .delete(coimbatoreConfigTable)
      .where(eq(coimbatoreConfigTable.batchId, batchId));
    await db
      .delete(coimbatoreTurnsTable)
      .where(eq(coimbatoreTurnsTable.batchId, batchId));
    await db
      .delete(qcDecisionsTable)
      .where(eq(qcDecisionsTable.batchId, batchId));
    await db
      .delete(batchLinksTable)
      .where(eq(batchLinksTable.annurBatchId, batchId));
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
  await db.delete(chambersTable).where(eq(chambersTable.notes, LEGACY_MARKER));
  for (const code of [
    ...BATCH_CODES,
    ...legacyCodes(BATCH_CODES),
    ...GENERATED.batches,
  ])
    await db.delete(batchesTable).where(eq(batchesTable.batchCode, code));
  for (const key of [
    ...MATERIAL_KEYS,
    ...legacyCodes(MATERIAL_KEYS),
    ...GENERATED.materials,
  ])
    await db
      .delete(materialsTable)
      .where(eq(materialsTable.itemIdentifier, key));
  for (const code of [...CATEGORY_CODES, ...legacyCodes(CATEGORY_CODES)])
    await db
      .delete(inventoryCategoriesTable)
      .where(eq(inventoryCategoriesTable.categoryCode, code));
  for (const code of [...WAREHOUSE_CODES, ...legacyCodes(WAREHOUSE_CODES)])
    await db
      .delete(inventoryLocationsTable)
      .where(eq(inventoryLocationsTable.warehouseCode, code));
  for (const code of [...LOCATION_CODES, ...legacyCodes(LOCATION_CODES)])
    await db.delete(locationsTable).where(eq(locationsTable.code, code));
  await db.delete(spawnEntriesTable).where(eq(spawnEntriesTable.notes, MARKER));
  await db.delete(contactsTable).where(eq(contactsTable.notes, MARKER));
  await db.delete(tasksTable).where(eq(tasksTable.notes, MARKER));
  for (const name of SERVICE_NAMES)
    await db.delete(servicesTable).where(eq(servicesTable.name, name));
  await db
    .delete(attendanceTemplatesTable)
    .where(
      eq(attendanceTemplatesTable.templateName, TEMPLATE_NAMES.attendance),
    );
  await db
    .delete(workPatternTemplatesTable)
    .where(
      eq(workPatternTemplatesTable.templateName, TEMPLATE_NAMES.workPattern),
    );
  await db
    .delete(salaryTemplatesTable)
    .where(eq(salaryTemplatesTable.templateName, TEMPLATE_NAMES.salary));
  await db
    .delete(holidayTemplatesTable)
    .where(eq(holidayTemplatesTable.templateName, TEMPLATE_NAMES.holiday));
  await db
    .delete(leaveTemplatesTable)
    .where(eq(leaveTemplatesTable.templateName, TEMPLATE_NAMES.leave));

  return {
    materials: materialIds.length,
    batches: batchIds.length,
    warehouses: warehouses.length,
  };
}

async function seedProductionDataset() {
  await removeProductionDataset();

  const organizationDetails = await db.select().from(organizationDetailsTable);
  if (organizationDetails.length === 0)
    await insertOne(organizationDetailsTable, {
      organizationId: 1,
      companyName: "Vidhai Mushroom Farms",
      orgEmail: "operations@vidhaiagro.in",
      orgDomain: "vidhaiagro.in",
      companyStateCode: "33",
      companyAddress: "Coimbatore District, Tamil Nadu",
      salesExecutive: "Sales Operations",
      defaultCurrency: "INR",
      timezone: "Asia/Kolkata",
      termsAndConditions: [
        "Fresh produce must be stored under refrigerated conditions.",
        "Quality concerns must be reported within 24 hours of delivery.",
      ],
    });

  const locationDefinitions = [
    [
      "MF-ANNUR",
      "Annur Compost Yard",
      "compost preparation and pasteurization facility",
    ],
    [
      "MF-OOTY",
      "Ooty Growing Farm",
      "climate-controlled button mushroom growing facility",
    ],
    [
      "MF-COIMBATORE",
      "Coimbatore Casing Unit",
      "casing soil preparation facility",
    ],
    [
      "MF-LAB",
      "Spawn Laboratory",
      "mushroom culture and spawn production laboratory",
    ],
  ];
  const locations: Record<string, any> = {};
  const configuredLocations = await db.select().from(locationsTable);
  const operationalCodes = ["A", "B", "C", "D"];
  for (const [
    index,
    [code, name, description],
  ] of locationDefinitions.entries()) {
    const existing = configuredLocations.find(
      (row) => row.code === operationalCodes[index],
    );
    if (existing) locations[code] = existing;
    else {
      const [row] = await db
        .insert(locationsTable)
        .values({ code: operationalCodes[index], name, description })
        .returning();
      locations[code] = row;
    }
  }

  const [rawCategory] = await db
    .insert(inventoryCategoriesTable)
    .values({
      name: "Mushroom Raw Materials",
      categoryCode: "MF-RAW",
      sortOrder: 10,
      divisions: [],
      isActive: true,
    })
    .returning();
  const [packCategory] = await db
    .insert(inventoryCategoriesTable)
    .values({
      name: "Mushroom Products & Packaging",
      categoryCode: "MF-PACK",
      sortOrder: 20,
      divisions: [],
      isActive: true,
    })
    .returning();
  const [rawWarehouse] = await db
    .insert(inventoryLocationsTable)
    .values({
      warehouseCode: "MF-WH-RAW",
      locationName: "Raw Material Store",
      locationType: "Store",
      isSystem: false,
      isReservedWarehouse: false,
      isProtected: false,
      isActive: true,
      isDefault: false,
      capacity: "5000",
      capacityUnit: "kg",
      manager: "Store Manager",
      contactNumber: "9000000001",
      address: "Annur Compost Yard",
    })
    .returning();
  const [finishedWarehouse] = await db
    .insert(inventoryLocationsTable)
    .values({
      warehouseCode: "MF-WH-FINISHED",
      locationName: "Cold Room & Dispatch Store",
      locationType: "Warehouse",
      isSystem: false,
      isReservedWarehouse: false,
      isProtected: false,
      isActive: true,
      isDefault: false,
      capacity: "1200",
      capacityUnit: "kg",
      manager: "Dispatch Manager",
      contactNumber: "9000000002",
      address: "Ooty Growing Farm",
    })
    .returning();

  const warehouseManagers = [
    "Arun Kumar",
    "Karthik Raj",
    "Meena Selvi",
    "Priya Nair",
    "Suresh Babu",
    "Vignesh Kumar",
  ];
  const categoryNames = [
    "Compost Carbon Sources",
    "Compost Nitrogen Sources",
    "Compost Conditioners",
    "Casing Materials",
    "Spawn and Cultures",
    "Growing Room Consumables",
    "Fresh Mushrooms",
    "Processed Mushrooms",
    "Primary Packaging",
    "Secondary Packaging",
    "Quality Laboratory Supplies",
    "Farm Tools and Safety",
  ];
  const warehouseNames = [
    "Annur Straw Godown",
    "Annur Manure Receiving Bay",
    "Annur Gypsum Store",
    "Coimbatore Casing Yard",
    "Coimbatore Peat Store",
    "Ooty Spawn Cold Store",
    "Ooty Packing Material Store",
    "Ooty Fresh Produce Cold Room",
    "Ooty Dispatch Holding Area",
    "Lab Culture Store",
    "Lab Sterile Consumables Store",
    "Maintenance Spares Store",
  ];
  const generatedWarehouses: any[] = [];
  const generatedCategories: any[] = [];
  for (let index = 0; index < MASTER_VOLUME; index++) {
    generatedCategories.push(
      await insertOne(inventoryCategoriesTable, {
        name: categoryNames[index],
        categoryCode: GENERATED.categories[index],
        sortOrder: 100 + index,
        divisions: [["Annur"], ["Ooty"], ["Coimbatore"], ["Lab"]][index % 4],
        isActive: index % 17 !== 0,
      }),
    );
    generatedWarehouses.push(
      await insertOne(inventoryLocationsTable, {
        warehouseCode: GENERATED.warehouses[index],
        locationName: warehouseNames[index],
        locationType: index % 4 === 0 ? "Store" : "Warehouse",
        isSystem: false,
        isReservedWarehouse: index % 15 === 0,
        isProtected: false,
        isActive: index % 19 !== 0,
        isDefault: false,
        capacity: String(500 + index * 25),
        capacityUnit: index % 3 === 0 ? "kg" : "square feet",
        manager: warehouseManagers[index % warehouseManagers.length],
        contactNumber: `91${String(8200000000 + index)}`,
        address: `${["Annur", "Ooty", "Coimbatore", "Mettupalayam"][index % 4]}, Tamil Nadu`,
      }),
    );
  }

  for (const [index, name] of [
    "Compost Operations",
    "Growing Operations",
    "Harvest and Packing",
    "Spawn Laboratory",
    "Quality Control",
    "Farm Maintenance",
  ].entries())
    await insertOne(departmentsTable, {
      organizationId: 1,
      name,
      description: `${MARKER}: mushroom farm master department ${index + 1}`,
      status: "Active",
    });

  const definitions = [
    [
      "Wheat Straw",
      "MF-WHEAT-STRAW",
      rawCategory.id,
      "kg",
      "6.50",
      "0",
      "500",
      "Raw Material",
    ],
    [
      "Chicken Manure",
      "MF-CHICKEN-MANURE",
      rawCategory.id,
      "kg",
      "4.25",
      "0",
      "300",
      "Raw Material",
    ],
    [
      "Gypsum",
      "MF-GYPSUM",
      rawCategory.id,
      "kg",
      "8.00",
      "0",
      "100",
      "Raw Material",
    ],
    [
      "Casing Soil",
      "MF-CASING-SOIL",
      rawCategory.id,
      "kg",
      "5.50",
      "0",
      "200",
      "Raw Material",
    ],
    [
      "Fresh Button Mushroom",
      "MF-BUTTON-MUSHROOM",
      packCategory.id,
      "kg",
      "0",
      "180",
      "25",
      "Finished Good",
    ],
    [
      "200 g Food-grade Punnet",
      "MF-PUNNET-200G",
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
  for (const name of ["Wheat Straw", "Poultry Manure", "Gypsum", "Casing Soil"])
    await insertOne(itemNamesTable, {
      name,
      categoryId: rawCategory.id,
      isActive: true,
    });
  for (const name of ["Fresh Button Mushroom", "Button Mushroom Punnet 200 g"])
    await insertOne(itemNamesTable, {
      name,
      categoryId: packCategory.id,
      isActive: true,
    });
  await insertOne(servicesTable, {
    name: SERVICE_NAMES[0],
    hsnSac: "996511",
    unit: "Trip",
    sellingPrice: "850",
    gstPercent: "18",
  });
  await insertOne(servicesTable, {
    name: SERVICE_NAMES[1],
    hsnSac: "998346",
    unit: "Batch",
    sellingPrice: "1200",
    gstPercent: "18",
  });
  await insertOne(servicesTable, {
    name: SERVICE_NAMES[2],
    hsnSac: "998533",
    unit: "Room",
    sellingPrice: "2500",
    gstPercent: "18",
  });
  await insertOne(attendanceTemplatesTable, {
    templateName: TEMPLATE_NAMES.attendance,
    isDefault: true,
    flexibleHours: false,
    lateThresholdMinutes: 15,
    workStartTime: "08:30",
    workEndTime: "17:30",
    fineType: "fixed_per_hour",
    finePerHour: "75",
  });
  await insertOne(workPatternTemplatesTable, {
    templateName: TEMPLATE_NAMES.workPattern,
    isDefault: true,
    week1OffDays: "[0]",
    week2OffDays: "[0]",
    week3OffDays: "[0]",
    week4OffDays: "[0]",
    week5OffDays: "[0]",
  });
  await insertOne(salaryTemplatesTable, {
    templateName: TEMPLATE_NAMES.salary,
    isDefault: true,
    description: "Monthly salary structure for farm and packhouse staff",
    components: JSON.stringify([
      { name: "Basic", type: "earning", percentage: 60 },
      { name: "House Rent Allowance", type: "earning", percentage: 20 },
      { name: "Provident Fund", type: "deduction", percentage: 12 },
    ]),
  });
  await insertOne(holidayTemplatesTable, {
    templateName: TEMPLATE_NAMES.holiday,
    isDefault: true,
    effectiveYear: CURRENT_YEAR,
    effectiveFrom: `${CURRENT_YEAR}-01-01`,
    holidays: JSON.stringify([
      { date: `${CURRENT_YEAR}-01-26`, name: "Republic Day" },
      { date: `${CURRENT_YEAR}-08-15`, name: "Independence Day" },
      { date: `${CURRENT_YEAR}-10-02`, name: "Gandhi Jayanti" },
    ]),
  });
  await insertOne(leaveTemplatesTable, {
    templateName: TEMPLATE_NAMES.leave,
    isDefault: true,
    totalSickLeaves: 6,
    totalCasualLeaves: 6,
    earnedLeave: 12,
    maxSickLeavesPerMonth: 2,
    maxCasualLeavesPerMonth: 2,
    maxEarnedLeavesPerMonth: 3,
    carryForwardEnabled: true,
  });
  for (const alert of [
    ["Normal", "#16A34A", "Within target", "Farm conditions within target"],
    ["Attention", "#F59E0B", "Near limit", "Review process reading"],
    ["Critical", "#DC2626", "Outside limit", "Immediate action required"],
  ])
    await insertOne(alertColorsTable, {
      name: alert[0],
      hexColor: alert[1],
      condition: alert[2],
      description: `${MARKER}: ${alert[3]}`,
      sortOrder: alert[0] === "Normal" ? 1 : alert[0] === "Attention" ? 2 : 3,
    });
  const stock = [
    ["MF-WHEAT-STRAW", rawWarehouse.id, "2400", "6.50"],
    ["MF-CHICKEN-MANURE", rawWarehouse.id, "950", "4.25"],
    ["MF-GYPSUM", rawWarehouse.id, "320", "8.00"],
    ["MF-CASING-SOIL", rawWarehouse.id, "780", "5.50"],
    ["MF-BUTTON-MUSHROOM", finishedWarehouse.id, "86", "125"],
    ["MF-PUNNET-200G", finishedWarehouse.id, "1600", "3.20"],
  ];
  for (const [key, locationId, quantityOnHand, costBasis] of stock)
    await db.insert(inventoryTable).values({
      materialId: materials[key].id,
      locationId,
      quantityOnHand,
      costBasis,
    });
  await db.insert(inventoryMovementsTable).values({
    materialId: materials["MF-WHEAT-STRAW"].id,
    toLocationId: rawWarehouse.id,
    quantityKg: "2400",
    reason: "Purchase receipt",
    notes: MARKER,
  });
  await db.insert(inventoryMovementsTable).values({
    materialId: materials["MF-BUTTON-MUSHROOM"].id,
    toLocationId: finishedWarehouse.id,
    quantityKg: "86",
    reason: "Harvest receipt",
    notes: MARKER,
  });

  await db.insert(spawnEntriesTable).values({
    strainName: "Agaricus bisporus A15",
    quantityKg: "42",
    source: "Certified commercial spawn",
    receivedAt: isoDate(-14),
    expiresAt: isoDate(46),
    status: "available",
    notes: MARKER,
  });
  await db.insert(spawnEntriesTable).values({
    strainName: "Agaricus bisporus U3",
    quantityKg: "18",
    source: "Spawn Laboratory",
    receivedAt: isoDate(-10),
    expiresAt: isoDate(50),
    status: "available",
    notes: MARKER,
  });

  const [batch1] = await db
    .insert(batchesTable)
    .values({
      batchCode: "MF-COMP-001",
      locationId: locations["MF-ANNUR"].id,
      currentStage: "PHASE_II",
      status: "active",
      nitrogenContent: "2.15",
      targetBags: 1200,
      actualBags: 1184,
      notes: `${MARKER}: wheat-straw button mushroom compost`,
      alertLevel: "normal",
    })
    .returning();
  await db.insert(batchesTable).values({
    batchCode: "MF-COMP-002",
    locationId: locations["MF-ANNUR"].id,
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
      name: "Pasteurization Tunnel 1",
      locationId: locations["MF-ANNUR"].id,
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
  await db.insert(chamberReadingsTable).values({
    chamberId: chamber.id,
    temperatureCelsius: "58.4",
    nh3Ppm: "8.2",
    co2Percent: "1.8",
    humidity: "92",
    notes: MARKER,
  });

  await db.insert(contactsTable).values({
    type: "vendor",
    name: "Agro Straw Supplier",
    company: "Agro Inputs",
    phone: "9000000010",
    whatsappNumber: "9000000010",
    email: "procurement@vidhaiagro.in",
    address: "Coimbatore, Tamil Nadu",
    notes: MARKER,
  });
  await db.insert(contactsTable).values({
    type: "client",
    name: "Fresh Produce Buyer",
    company: "Fresh Market",
    phone: "9000000011",
    whatsappNumber: "9000000011",
    email: "purchase@nilgirifresh.in",
    address: "Ooty, Tamil Nadu",
    notes: MARKER,
  });

  await db.insert(tasksTable).values({
    title: "Check compost core temperature",
    description:
      "Record tunnel temperature and ammonia before the next aeration cycle.",
    locationId: locations["MF-ANNUR"].id,
    status: "todo",
    priority: "high",
    estimatedMinutes: 30,
    batchRef: "MF-COMP-001",
    checklist: ["Calibrate probe", "Measure three points", "Record NH3"],
    notes: MARKER,
  });

  const farmingMaterials: any[] = [];
  const generatedBatches: any[] = [];
  const annurBatches: any[] = [];
  const coimbatoreBatches: any[] = [];
  const labBatches: any[] = [];
  const labOutputs: any[] = [];
  const employees: any[] = [];
  const rooms: any[] = [];
  const vehicles: any[] = [];
  const materialNames = [
    "Wheat Straw",
    "Poultry Manure",
    "Gypsum",
    "Casing Peat",
    "Spawn Grain",
    "Packing Punnet",
  ];
  const departments = [
    "Compost",
    "Growing",
    "Harvest",
    "Lab",
    "Packing",
    "Maintenance",
  ];
  const strains = [
    "Agaricus bisporus A15",
    "Agaricus bisporus U3",
    "Agaricus bisporus S11",
  ];
  const firstNames = [
    "Arun",
    "Karthik",
    "Meena",
    "Priya",
    "Suresh",
    "Vignesh",
    "Lakshmi",
    "Naveen",
    "Deepa",
    "Saravanan",
    "Anitha",
    "Ramesh",
    "Divya",
    "Prakash",
    "Kavitha",
  ];
  const lastNames = [
    "Kumar",
    "Rajan",
    "Selvi",
    "Nair",
    "Babu",
    "Murugan",
    "Devi",
    "Krishnan",
    "Mani",
    "Ravi",
  ];
  const vendorNames = [
    "Kongu Straw Traders",
    "Bhavani Agro Residues",
    "Nilgiri Peat Supplies",
    "Sakthi Poultry Manure Works",
    "Anamalai Gypsum Agency",
    "Kovai Packaging Solutions",
    "Blue Hills Cold Chain",
    "Mettupalayam Farm Inputs",
    "Southern Growers Equipment",
    "Sri Murugan Transport",
    "Green Field Disinfectants",
    "Ooty Horticulture Supplies",
  ];
  const buyerNames = [
    "Nilgiri Fresh Foods",
    "Kovai Organic Market",
    "Green Basket Retail",
    "Hillview Hotels",
    "Tamil Nadu Caterers",
    "Ooty Farmers Market",
    "Annapoorna Kitchens",
    "Western Ghats Resorts",
    "Fresh Route Distributors",
    "Kongu Supermarket",
    "Blue Mountain Produce",
    "Coimbatore Food Service",
    "Harvest Table Restaurants",
    "Nature Cart Organics",
    "South India Produce Hub",
  ];
  const casingPartners = [
    "Nilgiri Peat Works",
    "Kovai Casing Mix Unit",
    "Blue Hills Soil Products",
    "Western Ghats Minerals",
    "Green Bed Casing Supplies",
    "Anamalai Lime Works",
    "Ooty Growing Media",
    "South Farm Substrates",
  ];
  const growerNames = [
    "Coonoor Mushroom Farm",
    "Kotagiri Fresh Fungi",
    "Mettupalayam Growers",
    "Pollachi Mushroom Unit",
    "Erode Specialty Farms",
    "Tiruppur Indoor Farms",
    "Kundah Valley Growers",
    "Avalanche Agro Farm",
    "Lovedale Mushroom House",
    "Ketti Valley Produce",
  ];
  const allRoleLocations = ["annur", "ooty", "coimbatore", "lab", "cross_site"];
  const roleDefinitions = [
    {
      name: "SuperAdmin",
      slug: "super_admin",
      description: "Full access to all locations and actions",
      permissions: {
        view: allRoleLocations,
        create: allRoleLocations,
        approve: allRoleLocations,
        delete: allRoleLocations,
      },
      isSuperAdmin: true,
      systemKey: "SUPER_ADMIN",
    },
    {
      name: "location_manager",
      slug: "location_manager",
      description: "Manages production and staff for assigned farm locations",
      permissions: {
        view: allRoleLocations,
        create: allRoleLocations,
        approve: allRoleLocations,
        delete: [],
      },
      isSuperAdmin: false,
      systemKey: null,
    },
    {
      name: "operator",
      slug: "operator",
      description: "Records daily mushroom farm operations",
      permissions: {
        view: allRoleLocations,
        create: allRoleLocations,
        approve: [],
        delete: [],
      },
      isSuperAdmin: false,
      systemKey: null,
    },
    {
      name: "viewer",
      slug: "viewer",
      description: "Read-only access to assigned farm locations",
      permissions: {
        view: allRoleLocations,
        create: [],
        approve: [],
        delete: [],
      },
      isSuperAdmin: false,
      systemKey: null,
    },
  ];
  const existingRoles = await db.select().from(rolesTable);
  for (const role of roleDefinitions) {
    const existingRole = existingRoles.find(
      (row: any) =>
        Number(row.organizationId ?? 1) === 1 && row.slug === role.slug,
    );
    const values = {
      ...role,
      organizationId: 1,
      permissions: JSON.stringify(role.permissions),
      isSystem: true,
      isSystemGenerated: true,
      isActive: true,
      roleKey: role.slug.toUpperCase(),
      updatedAt: new Date(),
    };
    if (existingRole)
      await db
        .update(rolesTable)
        .set(values)
        .where(eq(rolesTable.id, existingRole.id));
    else await insertOne(rolesTable, values);
  }
  // Seeded staff accounts are intentionally non-login-capable until an
  // administrator sets an individual password through User Management.
  const seededUserPasswordHash = "ACCOUNT_RESET_REQUIRED";
  const accountDefinitions = [
    ["1100", "Trade Receivables", "Asset"],
    ["1200", "Mushroom Inventory", "Asset"],
    ["2100", "Trade Payables", "Liability"],
    ["4100", "Fresh Mushroom Sales", "Income"],
    ["5100", "Compost Raw Materials", "Expense"],
    ["5200", "Farm Utilities", "Expense"],
  ];
  const accounts: Record<string, any> = {};
  for (const [accountCode, accountName, accountType] of accountDefinitions) {
    const account = await insertOne(chartOfAccountsTable, {
      accountCode,
      accountName,
      accountType,
      currentBalance: "0",
      description: MARKER,
      isActive: true,
    });
    accounts[accountCode] = account;
  }
  const workOrderTemplate = await insertOne(workOrderTemplatesTable, {
    name: TEMPLATE_NAMES.workOrder,
    taskSteps: [
      "Confirm harvest quality grade",
      "Pre-cool mushrooms to dispatch temperature",
      "Pack and label punnets",
      "Load into refrigerated vehicle",
    ],
    materialRequirements: [
      { item: "Fresh Button Mushroom", uom: "kg" },
      { item: "200 g Food-grade Punnet", uom: "Nos" },
    ],
  });

  // High-volume, deterministic records exercise pagination in every operational area.
  for (let index = 0; index < VOLUME; index++) {
    const n = index + 1;
    const materialKey = MATERIAL_KEYS[index % MATERIAL_KEYS.length];
    const material = materials[materialKey];
    await insertOne(inventoryMovementsTable, {
      materialId: material.id,
      toLocationId: index % 2 ? rawWarehouse.id : finishedWarehouse.id,
      quantityKg: String(75 + (index % 40) * 5),
      reason: index % 2 === 0 ? "Purchase receipt" : "Production transfer",
      notes: MARKER,
    });
    await insertOne(inventoryAdjustmentsTable, {
      materialId: material.id,
      locationId: locations[LOCATION_CODES[index % LOCATION_CODES.length]].id,
      quantityDelta: index % 7 === 0 ? "-2" : "5",
      reason: index % 7 === 0 ? "Quality rejection" : "Cycle count correction",
      reference: `MF-STOCK-${String(n).padStart(4, "0")}`,
      notes: MARKER,
    });

    const batchSite = ["MF-ANNUR", "MF-COIMBATORE", "MF-LAB"][index % 3];
    const siteStages: Record<string, string[]> = {
      "MF-ANNUR": ["PRE_WETTING", "PHASE_I", "PHASE_II", "READY_FOR_DISPATCH"],
      "MF-COIMBATORE": ["FORMULATION", "TURNING", "QC", "COMPLETED"],
      "MF-LAB": [
        "FORMULATION",
        "MEDIA_PREP",
        "INOCULATION",
        "INCUBATION",
        "COMPLETED",
      ],
    };
    const batch = await insertOne(batchesTable, {
      batchCode: GENERATED.batches[index],
      locationId: locations[batchSite].id,
      currentStage: siteStages[batchSite][index % siteStages[batchSite].length],
      status: index % 9 === 0 ? "completed" : "active",
      nitrogenContent: String(1.8 + (index % 7) / 10),
      targetBags: 800 + index * 4,
      actualBags: 760 + index * 4,
      notes: MARKER,
      alertLevel: index % 11 === 0 ? "warning" : "normal",
    });
    generatedBatches.push(batch);
    if (batchSite === "MF-ANNUR") annurBatches.push(batch);
    if (batchSite === "MF-COIMBATORE") coimbatoreBatches.push(batch);
    if (batchSite === "MF-LAB") labBatches.push(batch);
    await insertOne(stageLogsTable, {
      batchId: batch.id,
      stage: batch.currentStage,
      notes: MARKER,
      nh3Ppm: String(7 + (index % 6)),
      temperatureCelsius: String(54 + (index % 7)),
    });
    await insertOne(batchMaterialsTable, {
      batchId: batch.id,
      materialId: material.id,
      wetWeightKg: String(180 + (index % 120)),
      moisturePercent: String(68 + (index % 5)),
      nitrogenPercent: String(1.8 + (index % 6) / 10),
    });
    await insertOne(labBatchMaterialsTable, {
      batchId: batch.id,
      name: material.name,
      quantityKg: String(8 + (index % 12)),
    });
    await insertOne(coimbatoreBatchMaterialsTable, {
      batchId: batch.id,
      materialId: material.id,
      weightKg: String(120 + (index % 80)),
      notes: MARKER,
    });
    await insertOne(coimbatoreConfigTable, {
      batchId: batch.id,
      totalTurns: 4,
      turnScheduleJson: JSON.stringify([0, 2, 4, 6]),
    });
    await insertOne(coimbatoreTurnsTable, {
      batchId: batch.id,
      turnNumber: (index % 4) + 1,
      plannedDate: isoDate(-(index % 12)),
      actualDate: index % 5 === 0 ? undefined : isoDate(-(index % 12)),
      durationDays: 2,
      notes: MARKER,
    });
    await insertOne(qcDecisionsTable, {
      batchId: batch.id,
      moduleType: "compost",
      decision: index % 11 === 0 ? "Hold" : "Approved",
      notes: index % 11 === 0 ? `${MARKER}: ammonia requires recheck` : MARKER,
    });
    const chamber = await insertOne(chambersTable, {
      name: `${index % 2 ? "Ooty Growing Chamber" : "Annur Pasteurization Tunnel"} – ${GENERATED.batches[index]}`,
      locationId: locations[index % 2 ? "MF-OOTY" : "MF-ANNUR"].id,
      chamberType: index % 2 ? "growing" : "bulk",
      status: index % 7 === 0 ? "idle" : "occupied",
      capacity: 850 + index * 4,
      currentBatchId: index % 7 === 0 ? undefined : batch.id,
      lastTemperature: String(index % 2 ? 17 + (index % 3) : 56 + (index % 5)),
      lastNh3: String(index % 2 ? 1 + (index % 2) : 7 + (index % 6)),
      lengthM: "18",
      widthM: "4.5",
      heightM: "4",
      notes: MARKER,
    });
    await insertOne(chamberReadingsTable, {
      chamberId: chamber.id,
      temperatureCelsius: String(
        index % 2 ? 17 + (index % 3) : 56 + (index % 5),
      ),
      nh3Ppm: String(index % 2 ? 1 + (index % 2) : 7 + (index % 6)),
      co2Percent: String(1.2 + (index % 4) / 10),
      humidity: String(85 + (index % 10)),
      notes: MARKER,
    });
    await insertOne(spawnEntriesTable, {
      strainName: strains[index % strains.length],
      quantityKg: String(10 + (index % 40)),
      source: "Spawn Laboratory",
      receivedAt: isoDate(index % 30),
      expiresAt: isoDate(60 + (index % 30)),
      status: index % 12 === 0 ? "reserved" : "available",
      notes: MARKER,
    });
    const farmTask = await insertOne(tasksTable, {
      title: `${["Check compost temperature", "Inspect casing moisture", "Record room humidity", "Grade harvested mushrooms"][index % 4]} – ${GENERATED.batches[index]}`,
      description:
        "Mushroom farm daily activity for the current mushroom production cycle.",
      locationId: locations[LOCATION_CODES[index % LOCATION_CODES.length]].id,
      status: ["todo", "in_progress", "completed"][index % 3],
      priority: ["low", "medium", "high"][index % 3],
      estimatedMinutes: 20 + (index % 70),
      batchRef: GENERATED.batches[index],
      checklist: ["Inspect", "Record", "Confirm"],
      notes: MARKER,
    });
    await insertOne(contactsTable, {
      type: index % 2 ? "client" : "vendor",
      name: `${firstNames[index % firstNames.length]} ${lastNames[index % lastNames.length]}`,
      company:
        index % 2
          ? buyerNames[index % buyerNames.length]
          : vendorNames[index % vendorNames.length],
      phone: `91${String(8000000000 + n)}`,
      whatsappNumber: `91${String(8000000000 + n)}`,
      email: `mushroom.partner.${n}@vidhaiagro.in`,
      address: ["Coimbatore", "Ooty", "Annur"][index % 3] + ", Tamil Nadu",
      notes: MARKER,
    });

    const employeeName = `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}`;
    const employee = await insertOne(employeesTable, {
      employeeCode: GENERATED.employees[index],
      name: employeeName,
      designation: [
        "Compost Operator",
        "Grow Room Technician",
        "Harvester",
        "Lab Assistant",
      ][index % 4],
      department: departments[index % departments.length],
      employmentType: index % 5 === 0 ? "Contract" : "Permanent",
      annualCtc: String(240000 + index * 1200),
      baseSalary: String(18000 + index * 75),
      status: index % 18 === 0 ? "On Leave" : "Active",
      workMode: "On-site",
      email: `${firstNames[index % firstNames.length].toLowerCase()}.${n}@vidhaiagro.in`,
      phone: `9000${String(100000 + n)}`,
      location: ["Annur", "Ooty", "Coimbatore", "Lab"][index % 4],
      joinDate: isoDate(-300 - index),
      isSystemGenerated: true,
    });
    employees.push(employee);
    if (index < SEEDED_USER_COUNT) {
      const role = index < 4 ? "location_manager" : "operator";
      const locationScope = ["annur", "ooty", "coimbatore", "lab"][index % 4];
      const username = employeeName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const user = await insertOne(usersTable, {
        username,
        email: employee.email,
        passwordHash: seededUserPasswordHash,
        displayName: employee.name,
        name: employee.name,
        role,
        locationScope: JSON.stringify([locationScope]),
        organizationId: 1,
        employeeId: employee.id,
        employeeName: employee.name,
        department: employee.department,
        systemKey: `MUSHROOM_SEED_USER_${index + 1}`,
        userType: "USER",
        permissionOverrides: "[]",
        isActive: true,
        isSystemGenerated: true,
        isDeleted: false,
        designation: employee.designation,
        phoneNumber: employee.phone,
        workLocation: employee.location,
        employeeCode: employee.employeeCode,
        joiningDate: new Date(`${employee.joinDate}T00:00:00.000Z`),
        employmentType: employee.employmentType,
        status: "Active",
      });
      await db
        .update(employeesTable)
        .set({ userId: user.id })
        .where(eq(employeesTable.id, employee.id));
    }
    await insertOne(attendanceLogsTable, {
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.employeeCode,
      department: employee.department,
      designation: employee.designation,
      attendanceDate: isoDate(-(index % 30)),
      status: index % 10 === 0 ? "Absent" : "Present",
      checkInTime: "08:55",
      checkOutTime: "17:35",
      timezone: "Asia/Kolkata",
      notes: MARKER,
    });
    await insertOne(taskAssignmentsTable, {
      taskId: farmTask.id,
      employeeId: employee.id,
    });
    await insertOne(taskTimeLogsTable, {
      taskId: farmTask.id,
      employeeId: employee.id,
      startTime: new Date(`${isoDate(-(index % 30))}T03:30:00.000Z`),
      endTime: new Date(`${isoDate(-(index % 30))}T04:15:00.000Z`),
      durationMinutes: "45",
      workDate: isoDate(-(index % 30)),
      source: "manual",
      status: "completed",
      notes: MARKER,
    });
    const salarySlip = await insertOne(salarySlipsTable, {
      payrollMonth: PAYROLL_MONTH,
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.employeeCode,
      department: employee.department,
      designation: employee.designation,
      workLocation: employee.location,
      location: employee.location,
      calendarMonthDays: 31,
      monthDays: 31,
      presentDays: String(24 + (index % 4)),
      absentDays: String(index % 3),
      payableDays: String(27 + (index % 4)),
      baseSalary: employee.baseSalary,
      earnedBaseSalary: employee.baseSalary,
      grossPay: String(19000 + index * 75),
      totalDeductions: String(500 + (index % 300)),
      netPay: String(18500 + index * 70),
      status: index % 4 === 0 ? "Paid" : "Generated",
    });
    await insertOne(payrollTable, {
      payPeriod: PAYROLL_MONTH,
      employeeId: employee.id,
      employeeName: employee.name,
      salarySlipId: salarySlip.id,
      grossPay: String(19000 + index * 75),
      deductions: String(500 + (index % 300)),
      netPay: String(18500 + index * 70),
      status: index % 4 === 0 ? "Paid" : "Processing",
    });
    await insertOne(leaveRequestsTable, {
      employeeId: employee.id,
      employeeName: employee.name,
      startDate: isoDate(index % 25),
      endDate: isoDate((index % 25) + (index % 3)),
      leaveType: ["Sick", "Casual", "Earned"][index % 3],
      reason: ["Medical appointment", "Family commitment", "Personal work"][
        index % 3
      ],
      status: ["Pending", "Approved", "Rejected"][index % 3],
      requestedDays: String((index % 3) + 1),
    });
    await insertOne(crewClaimsTable, {
      employeeId: employee.id,
      employeeName: employee.name,
      claimType: "overtime",
      amount: String(350 + (index % 8) * 75),
      title: `Overtime - ${isoDate(-(index % 30))}`,
      notes: MARKER,
      attendanceDate: isoDate(-(index % 30)),
      requestedHours: String(1 + (index % 4)),
      payrollMonth: PAYROLL_MONTH,
      status: ["Pending", "Approved", "Rejected"][index % 3],
    });
    await insertOne(crewClaimsTable, {
      employeeId: employee.id,
      employeeName: employee.name,
      claimType: "bonus",
      amount: String(500 + (index % 10) * 100),
      title: [
        "Harvest target bonus",
        "Quality achievement bonus",
        "Attendance bonus",
      ][index % 3],
      notes: MARKER,
      payrollMonth: PAYROLL_MONTH,
      status: ["Pending", "Approved", "Rejected"][index % 3],
    });
    await insertOne(crewDeductionsTable, {
      employeeId: employee.id,
      employeeName: employee.name,
      amount: String(100 + (index % 6) * 50),
      notes: MARKER,
      date: isoDate(-(index % 30)),
      month: CURRENT_MONTH,
      year: CURRENT_YEAR,
      status: ["Pending", "Approved", "Rejected"][index % 3],
      source: index % 2 ? "manual" : "attendance",
      autoReason: index % 2 ? undefined : "Late arrival",
      lateMinutes: index % 2 ? 0 : 15 + (index % 30),
      calculatedAmount: String(100 + (index % 6) * 50),
      autoApproved: index % 3 === 1,
    });

    const quantity = 100 + (index % 20) * 10;
    const amount = quantity * (8 + (index % 12));
    const purchaseRequest = await insertOne(purchaseRequestsTable, {
      prNumber: GENERATED.purchaseRequests[index],
      vendorName: vendorNames[index % vendorNames.length],
      itemName: materialNames[index % materialNames.length],
      lineItems: [
        {
          itemName: materialNames[index % materialNames.length],
          quantity,
          unit: "kg",
        },
      ],
      quantity: String(quantity),
      unit: "kg",
      priority: ["Normal", "High", "Urgent"][index % 3],
      department: "Production",
      status: ["Draft", "Submitted", "Approved", "PO Created"][index % 4],
      requestedByName: "Farm Manager",
      requiredDate: isoDate(index % 40),
      project: "Mushroom Production",
      notes: MARKER,
    });
    const purchaseOrder = await insertOne(purchaseOrdersTable, {
      vendorName: vendorNames[index % vendorNames.length],
      poNumber: GENERATED.purchaseOrders[index],
      prReference: GENERATED.purchaseRequests[index],
      items: materialNames[index % materialNames.length],
      lineItems: [
        {
          itemName: materialNames[index % materialNames.length],
          quantity,
          unit: "kg",
          rate: amount / quantity,
        },
      ],
      orderedQuantity: String(quantity),
      receivedQuantity: String(index % 3 ? quantity : 0),
      remainingQuantity: String(index % 3 ? 0 : quantity),
      subtotal: String(amount),
      taxAmount: String(amount * 0.05),
      totalAmount: String(amount * 1.05),
      poDate: isoDate(-(index % 45)),
      deliveryDate: isoDate(index % 20),
      warehouse: "Raw Material Store",
      department: "Production",
      notes: MARKER,
      status: ["Draft", "Issued", "Completed"][index % 3],
    });
    await insertOne(vendorAvailabilityTable, {
      purchaseRequestId: purchaseRequest.id,
      vendorId: `MF-VENDOR-${String((index % vendorNames.length) + 1).padStart(3, "0")}`,
      status: index % 5 === 0 ? "Pending" : "Confirmed",
      purchaseOrderId: purchaseOrder.id,
    });
    await insertOne(purchaseInvoicesTable, {
      invoiceNumber: GENERATED.purchaseInvoices[index],
      vendorId: `MF-VENDOR-${String((index % 12) + 1).padStart(3, "0")}`,
      vendorName: vendorNames[index % vendorNames.length],
      vendorAddress: `${["Annur", "Coimbatore", "Mettupalayam"][index % 3]}, Tamil Nadu`,
      vendorPhone: `91${String(8100000000 + (index % 12) + 1)}`,
      poReference: GENERATED.purchaseOrders[index],
      amount: String(amount * 1.05),
      taxableAmount: String(amount),
      cgstPercent: "2.5",
      sgstPercent: "2.5",
      cgstAmount: String(amount * 0.025),
      sgstAmount: String(amount * 0.025),
      lineItems: [
        {
          itemName: materialNames[index % materialNames.length],
          quantity,
          unit: "kg",
        },
      ],
      invoiceDate: isoDate(-(index % 45)),
      dueDate: isoDate(30 - (index % 20)),
      status: ["Unpaid", "Partially Paid", "Paid"][index % 3],
      notes: MARKER,
    });
    await insertOne(goodsReceiptsTable, {
      grnNumber: GENERATED.goodsReceipts[index],
      poReference: GENERATED.purchaseOrders[index],
      vendorId: `MF-VENDOR-${String((index % 12) + 1).padStart(3, "0")}`,
      vendorName: vendorNames[index % vendorNames.length],
      itemsReceived: materialNames[index % materialNames.length],
      lineItems: [
        {
          itemName: materialNames[index % materialNames.length],
          orderedQty: quantity,
          receivedQty: quantity,
          warehouse:
            generatedWarehouses[index % generatedWarehouses.length]
              .locationName,
        },
      ],
      orderedQuantity: String(quantity),
      receivedQuantity: String(quantity),
      remainingQuantity: "0",
      receivedDate: isoDate(-(index % 30)),
      notes: MARKER,
      inspectedByName: "Quality Control Team",
      status: index % 12 === 0 ? "Pending" : "Complete",
    });
    await insertOne(vendorPaymentsTable, {
      organizationId: 1,
      paymentNumber: GENERATED.vendorPayments[index],
      vendorName: vendorNames[index % vendorNames.length],
      invoiceReference: GENERATED.purchaseInvoices[index],
      amount: String(amount * 1.05),
      paymentMode: ["UPI / NetBanking", "Bank Transfer", "Cheque"][index % 3],
      bankAccount: "Farm Operations Account",
      transactionReference: `MF-TXN-${String(n).padStart(5, "0")}`,
      notes: MARKER,
      paymentDate: isoDate(-(index % 30)),
      status: ["Pending Approval", "Approved", "Paid"][index % 3],
      requiredApprovals: 1,
      approvalLevel: index % 3 === 0 ? 0 : 1,
      approvedByUserIds: [],
    });
    await insertOne(purchaseReturnsTable, {
      returnNumber: GENERATED.purchaseReturns[index],
      vendorName: vendorNames[index % vendorNames.length],
      invoiceReference: GENERATED.purchaseInvoices[index],
      reason: [
        "Moisture above specification",
        "Damaged packaging",
        "Quality variance",
      ][index % 3],
      returnDate: isoDate(-(index % 20)),
      lineItems: [
        {
          itemName: materialNames[index % materialNames.length],
          quantity: 2 + (index % 8),
          unit: "kg",
        },
      ],
      notes: MARKER,
      refundAmount: String(100 + index * 5),
      status: ["Requested", "Approved", "Completed"][index % 3],
    });

    await insertOne(salesOrdersTable, {
      orderCode: GENERATED.salesOrders[index],
      productType: "Fresh Button Mushroom",
      saleType: "external",
      transactionDate: isoDate(-(index % 40)),
      qtyKg: String(20 + (index % 80)),
      unit: "kg",
      buyerName: buyerNames[index % buyerNames.length],
      fromBatchId: batch.id,
      fromBatchCode: batch.batchCode,
      qualityNote: ["Premium grade", "Standard grade", "Processing grade"][
        index % 3
      ],
      unitPrice: String(130 + (index % 30)),
      totalValue: String((20 + (index % 80)) * (130 + (index % 30))),
      notes: MARKER,
    });
    const clientId = 10000 + index;
    const clientName = buyerNames[index % buyerNames.length];
    const salesTotal = (20 + (index % 80)) * (130 + (index % 30));
    const quotation = await insertOne(quotationsTable, {
      quoteNumber: GENERATED.quotations[index],
      quotationNumber: GENERATED.quotations[index],
      rootQuoteNumber: GENERATED.quotations[index],
      clientId,
      clientName,
      customerMobile: `91${String(8300000000 + index)}`,
      customerWhatsappNumber: `91${String(8300000000 + index)}`,
      customerCompany: clientName,
      customerAddress: `${["Ooty", "Coimbatore", "Erode", "Tiruppur"][index % 4]}, Tamil Nadu`,
      placeOfSupply: "Tamil Nadu",
      validityDays: 30,
      quotationDate: isoDate(-(index % 40)),
      validUntil: isoDate(30 - (index % 20)),
      subtotal: String(salesTotal),
      taxableAmount: String(salesTotal),
      cgstTotal: String(salesTotal * 0.025),
      sgstTotal: String(salesTotal * 0.025),
      grandTotal: String(salesTotal * 1.05),
      notes: MARKER,
      status: ["Draft", "Sent", "Approved"][index % 3],
      customerResponseAt:
        index % 3 === 2
          ? new Date(`${isoDate(-(index % 30))}T06:30:00.000Z`)
          : undefined,
      versionSeries: index % 3 === 0 ? "Draft" : "Sent",
      versionNumber: 1,
      versionLabel: index % 3 === 0 ? "Draft V1" : "Sent V1",
      isLatestVersion: true,
      isLocked: index % 3 === 2,
    });
    await insertOne(quotationItemsTable, {
      quoteId: quotation.id,
      quotationId: quotation.id,
      itemId: materials["MF-BUTTON-MUSHROOM"].id,
      productName: "Fresh Button Mushroom",
      description: "Chilled, graded button mushrooms",
      hsnSac: "070959",
      quantity: String(20 + (index % 80)),
      uom: "kg",
      rate: String(130 + (index % 30)),
      cgstPercent: "2.5",
      sgstPercent: "2.5",
      itemType: "Product",
      lineSource: "Inventory",
      warehouseId: finishedWarehouse.id,
      warehouseName: finishedWarehouse.locationName,
    });
    const proforma = await insertOne(proformaInvoicesTable, {
      piNumber: GENERATED.proformas[index],
      rootPiNumber: GENERATED.proformas[index],
      quoteIds: [],
      clientId,
      clientName,
      customerMobile: `91${String(8300000000 + index)}`,
      customerCompany: clientName,
      customerAddress: `${["Ooty", "Coimbatore", "Erode", "Tiruppur"][index % 4]}, Tamil Nadu`,
      placeOfSupply: "Tamil Nadu",
      piDate: isoDate(-(index % 35)),
      validUntil: isoDate(25 - (index % 15)),
      subtotal: String(salesTotal),
      taxableAmount: String(salesTotal),
      cgstTotal: String(salesTotal * 0.025),
      sgstTotal: String(salesTotal * 0.025),
      grandTotal: String(salesTotal * 1.05),
      notes: MARKER,
      status: ["Draft", "Sent", "Approved"][index % 3],
      customerResponseAt:
        index % 3 === 2
          ? new Date(`${isoDate(-(index % 28))}T07:00:00.000Z`)
          : undefined,
      versionSeries: "Sent",
      versionNumber: 1,
      versionLabel: "Sent V1",
      isLatestVersion: true,
      isLocked: index % 3 === 2,
    });
    await insertOne(salesWorkOrdersTable, {
      workOrderNumber: GENERATED.workOrders[index],
      clientId,
      clientName,
      productId: materials["MF-BUTTON-MUSHROOM"].id,
      productionQuantity: String(20 + (index % 80)),
      productionUom: "kg",
      sourceDocumentType: "Proforma Invoice",
      sourceDocumentId: proforma.id,
      sourceDocumentNumber: proforma.piNumber,
      workOrderTemplateId: workOrderTemplate.id,
      expectedCompletionDate: isoDate(2 + (index % 7)),
      items: [
        {
          productName: "Fresh Button Mushroom",
          quantity: 20 + (index % 80),
          uom: "kg",
        },
      ],
      materialRequirements: [
        { item: "200 g Food-grade Punnet", quantity: (20 + (index % 80)) * 5 },
      ],
      generatedTaskIds: [],
      status: index % 4 === 0 ? "Completed" : "Active",
      productionStatus: index % 4 === 0 ? "Completed" : "In Progress",
    });
    await insertOne(proformaInvoiceItemsTable, {
      piId: proforma.id,
      itemId: materials["MF-BUTTON-MUSHROOM"].id,
      productName: "Fresh Button Mushroom",
      description: "Chilled, graded button mushrooms",
      hsnSac: "070959",
      quantity: String(20 + (index % 80)),
      uom: "kg",
      rate: String(130 + (index % 30)),
      cgstPercent: "2.5",
      sgstPercent: "2.5",
      itemType: "Product",
      lineSource: "Inventory",
      warehouseId: finishedWarehouse.id,
      warehouseName: finishedWarehouse.locationName,
    });
    const challan = await insertOne(deliveryChallansTable, {
      dcNumber: GENERATED.challans[index],
      quotationIds: [],
      piIds: [],
      clientId,
      clientName,
      customerMobile: `91${String(8300000000 + index)}`,
      customerCompany: clientName,
      customerAddress: `${["Ooty", "Coimbatore", "Erode", "Tiruppur"][index % 4]}, Tamil Nadu`,
      placeOfSupply: "Tamil Nadu",
      dcDate: isoDate(-(index % 30)),
      deliveryDate: isoDate(-(index % 25)),
      subtotal: String(salesTotal),
      cgstTotal: String(salesTotal * 0.025),
      sgstTotal: String(salesTotal * 0.025),
      grandTotal: String(salesTotal * 1.05),
      notes: MARKER,
      status: index % 3 === 0 ? "Draft" : "Dispatched",
      stockDeducted: index % 3 !== 0,
    });
    await insertOne(deliveryChallanItemsTable, {
      dcId: challan.id,
      quotationId: quotation.id,
      piId: proforma.id,
      itemId: materials["MF-BUTTON-MUSHROOM"].id,
      productName: "Fresh Button Mushroom",
      description: "Food-grade punnets in insulated crates",
      hsnSac: "070959",
      quantity: String(20 + (index % 80)),
      dispatchedQty: String(20 + (index % 80)),
      uom: "kg",
      rate: String(130 + (index % 30)),
      cgstPercent: "2.5",
      sgstPercent: "2.5",
      itemType: "Product",
      lineSource: "Inventory",
      warehouseId: finishedWarehouse.id,
      warehouseName: finishedWarehouse.locationName,
    });
    const invoice = await insertOne(salesInvoicesTable, {
      invoiceNumber: GENERATED.salesInvoices[index],
      rootInvoiceNumber: GENERATED.salesInvoices[index],
      quotationIds: [],
      piIds: [],
      dcIds: [],
      clientId,
      clientName,
      customerMobile: `91${String(8300000000 + index)}`,
      customerCompany: clientName,
      customerAddress: `${["Ooty", "Coimbatore", "Erode", "Tiruppur"][index % 4]}, Tamil Nadu`,
      placeOfSupply: "Tamil Nadu",
      invoiceDate: isoDate(-(index % 30)),
      dueDate: isoDate(20 - (index % 10)),
      subtotal: String(salesTotal),
      taxableAmount: String(salesTotal),
      cgstTotal: String(salesTotal * 0.025),
      sgstTotal: String(salesTotal * 0.025),
      grandTotal: String(salesTotal * 1.05),
      amountPaid: index % 3 === 0 ? String(salesTotal * 1.05) : "0",
      balanceDue: index % 3 === 0 ? "0" : String(salesTotal * 1.05),
      paymentStatus: index % 3 === 0 ? "Paid" : "Unpaid",
      notes: MARKER,
      status: index % 3 === 0 ? "Paid" : "Approved",
      versionSeries: "Sent",
      versionNumber: 1,
      versionLabel: "Sent V1",
      isLatestVersion: true,
      isLocked: true,
    });
    const invoiceItem = await insertOne(salesInvoiceItemsTable, {
      invoiceId: invoice.id,
      quotationId: quotation.id,
      piId: proforma.id,
      dcId: challan.id,
      itemId: materials["MF-BUTTON-MUSHROOM"].id,
      productName: "Fresh Button Mushroom",
      description: "Chilled, graded button mushrooms",
      hsnSac: "070959",
      quantity: String(20 + (index % 80)),
      uom: "kg",
      rate: String(130 + (index % 30)),
      cgstPercent: "2.5",
      sgstPercent: "2.5",
      itemType: "Product",
      lineSource: "Inventory",
      warehouseId: finishedWarehouse.id,
      warehouseName: finishedWarehouse.locationName,
    });
    if (index % 3 === 0)
      await insertOne(salesPaymentsTable, {
        invoiceId: invoice.id,
        paymentNumber: GENERATED.salesPayments[index],
        paymentDate: isoDate(-(index % 25)),
        amount: String(salesTotal * 1.05),
        netReceived: String(salesTotal * 1.05),
        paymentMethod: "Bank Transfer",
        reference: `UTR${String(740000000000 + index)}`,
        notes: MARKER,
      });
    const salesReturn = await insertOne(salesReturnsTable, {
      returnNumber: GENERATED.salesReturns[index],
      clientId,
      clientName,
      customerMobile: `91${String(8300000000 + index)}`,
      customerCompany: clientName,
      customerAddress: `${["Ooty", "Coimbatore", "Erode", "Tiruppur"][index % 4]}, Tamil Nadu`,
      placeOfSupply: "Tamil Nadu",
      returnDate: isoDate(-(index % 20)),
      restock: true,
      restocked: index % 3 === 2,
      subtotal: String(salesTotal * 0.1),
      cgstTotal: String(salesTotal * 0.0025),
      sgstTotal: String(salesTotal * 0.0025),
      grandTotal: String(salesTotal * 0.105),
      notes: MARKER,
      status: ["Draft", "Sent", "Received"][index % 3],
    });
    await insertOne(salesReturnItemsTable, {
      returnId: salesReturn.id,
      invoiceItemId: invoiceItem.id,
      itemId: materials["MF-BUTTON-MUSHROOM"].id,
      description: "Fresh Button Mushroom",
      hsnSac: "070959",
      invoicedQty: String(20 + (index % 80)),
      returnedQty: String(1 + (index % 3)),
      uom: "kg",
      rate: String(130 + (index % 30)),
      cgstPercent: "2.5",
      sgstPercent: "2.5",
      itemType: "Product",
      lineSource: "Inventory",
      warehouseId: finishedWarehouse.id,
      warehouseName: finishedWarehouse.locationName,
      reason: ["Transit damage", "Temperature excursion", "Pack seal issue"][
        index % 3
      ],
      condition: index % 2 === 0 ? "Damaged" : "Good",
    });
    await insertOne(accountsReceivableTable, {
      clientName: buyerNames[index % buyerNames.length],
      invoiceNumber: GENERATED.receivables[index],
      invoiceDate: isoDate(-(index % 40)),
      dueDate: isoDate(15 - (index % 10)),
      amount: String(amount),
      receivedAmount: String(index % 3 === 0 ? amount : 0),
      adjustedAmount: "0",
      status: index % 3 === 0 ? "Settled" : "Pending",
      approvalStatus: "Approved",
      notes: MARKER,
      sourceType: "Sales",
    });
    await insertOne(accountsPayableTable, {
      vendorName: vendorNames[index % vendorNames.length],
      billNumber: GENERATED.payables[index],
      billDate: isoDate(-(index % 45)),
      dueDate: isoDate(20 - (index % 12)),
      amount: String(amount),
      paidAmount: String(index % 4 === 0 ? amount : 0),
      adjustedAmount: "0",
      status: index % 4 === 0 ? "Paid" : "Pending",
      approvalStatus: "Approved",
      notes: MARKER,
      sourceType: "Procurement",
    });
    await insertOne(transactionsTable, {
      date: isoDate(-(index % 60)),
      description: MARKER,
      category: ["Mushroom Sales", "Raw Materials", "Farm Utilities"][
        index % 3
      ],
      type: index % 3 === 0 ? "Income" : "Expense",
      amount: String(amount),
    });
    const journal = await insertOne(journalEntriesTable, {
      entryDate: isoDate(-(index % 30)),
      reference: `MF-JV-${String(n).padStart(5, "0")}`,
      description: MARKER,
      totalDebit: String(salesTotal),
      totalCredit: String(salesTotal),
      status: "Posted",
      sourceType: "Mushroom Sales",
    });
    await insertOne(journalLinesTable, {
      journalEntryId: journal.id,
      accountId: accounts["1100"].id,
      accountCode: "1100",
      accountName: "Trade Receivables",
      debit: String(salesTotal),
      credit: "0",
      memo: `Invoice ${GENERATED.salesInvoices[index]}`,
    });
    await insertOne(journalLinesTable, {
      journalEntryId: journal.id,
      accountId: accounts["4100"].id,
      accountCode: "4100",
      accountName: "Fresh Mushroom Sales",
      debit: "0",
      credit: String(salesTotal),
      memo: `Mushroom sale to ${clientName}`,
    });
    await insertOne(partyLedgerEntriesTable, {
      partyType: "Customer",
      clientId,
      clientName,
      entryType: "Invoice",
      amount: String(salesTotal),
      drCr: "Dr",
      entryDate: isoDate(-(index % 30)),
      reference: GENERATED.salesInvoices[index],
      notes: MARKER,
      journalEntryId: journal.id,
    });

    if (index < FLEET_VOLUME) {
      const vehicle = await insertOne(vehiclesTable, {
        name: [
          "Compost Input Truck",
          "Fresh Produce Reefer",
          "Inter-farm Pickup",
        ][index % 3],
        regNo: GENERATED.vehicles[index],
        homeLocationId:
          locations[LOCATION_CODES[index % LOCATION_CODES.length]].id,
        vehicleType: ["truck", "pickup", "refrigerated_van"][index % 3],
        status: index % 8 === 0 ? "maintenance" : "available",
        notes: MARKER,
      });
      vehicles.push(vehicle);
      await insertOne(fuelLogsTable, {
        vehicleId: vehicle.id,
        fuelDate: isoDate(-(index % 30)),
        litres: String(20 + (index % 35)),
        costPerLitre: "94.50",
        totalCost: String((20 + (index % 35)) * 94.5),
        odometer: String(12000 + index * 113),
        notes: MARKER,
      });
      await insertOne(maintenanceLogsTable, {
        vehicleId: vehicle.id,
        serviceDate: isoDate(-(index % 90)),
        description: [
          "Oil and filter service",
          "Cold-unit inspection",
          "Tyre inspection",
        ][index % 3],
        cost: String(1200 + index * 20),
        nextServiceDue: isoDate(60 + (index % 30)),
        notes: MARKER,
      });
      await insertOne(vehicleUsageLogsTable, {
        vehicleId: vehicle.id,
        usageDate: isoDate(-(index % 30)),
        hoursWorked: String(3 + (index % 7)),
        workType: [
          "Raw material collection",
          "Fresh mushroom delivery",
          "Inter-farm transfer",
        ][index % 3],
        fromLocationId:
          locations[LOCATION_CODES[index % LOCATION_CODES.length]].id,
        toLocationId:
          locations[LOCATION_CODES[(index + 1) % LOCATION_CODES.length]].id,
        notes: MARKER,
      });
    }

    await insertOne(casingSoilTransactionsTable, {
      transactionType: ["buy", "produce", "sell"][index % 3],
      quantityKg: String(100 + index * 2),
      counterparty: casingPartners[index % casingPartners.length],
      unitPrice: String(5 + (index % 4)),
      totalCost: String((100 + index * 2) * (5 + (index % 4))),
      transactionDate: isoDate(-(index % 50)),
      coimbatoreBatchId: batch.id,
      notes: MARKER,
    });
    const output = await insertOne(labSpawnOutputTable, {
      batchId: batch.id,
      strainName: strains[index % strains.length],
      quantityKg: String(15 + (index % 30)),
      producedAt: isoDate(-(index % 40)),
      status: index % 8 === 0 ? "reserved" : "available",
      notes: MARKER,
    });
    if (batchSite === "MF-LAB") labOutputs.push(output);
    await insertOne(spawnTransactionsTable, {
      transactionType: ["produce", "sell", "transfer"][index % 3],
      strainName: strains[index % strains.length],
      quantityKg: String(5 + (index % 20)),
      counterparty: growerNames[index % growerNames.length],
      unitPrice: "180",
      transactionDate: isoDate(-(index % 40)),
      notes: MARKER,
      labSpawnOutputId: output.id,
    });
    await insertOne(scheduleEventsTable, {
      locationCode: LOCATION_CODES[index % LOCATION_CODES.length],
      entityType: "batch",
      entityId: batch.id,
      eventType: ["Turning", "Casing", "Harvest", "Dispatch"][index % 4],
      startDate: isoDate(index % 20),
      plannedDate: isoDate(index % 30),
      actualDate: index % 3 === 0 ? isoDate(index % 30) : undefined,
      isSuggestion: index % 5 === 0,
      planCode: `MF-PLAN-${String(n).padStart(4, "0")}`,
      notes: MARKER,
    });
    const allocatedQuantity = index % 5;
    const asset = await insertOne(assetsTable, {
      sku: GENERATED.assets[index],
      name: `${["Humidity Meter", "Harvest Crate", "Temperature Probe", "Protective Kit"][index % 4]} – ${GENERATED.assets[index]}`,
      category: ["Instrument", "Harvest", "Monitoring", "Safety"][index % 4],
      status: ["Active", "Active", "Under Maintenance", "Inactive"][index % 4],
      totalQuantity: String(5 + (index % 20)),
      allocatedQuantity: String(allocatedQuantity),
      availableQuantity: String(5 + (index % 20) - allocatedQuantity),
      purchaseValue: String(2500 + index * 25),
      unitPrice: String(500 + index * 5),
      purchaseDate: isoDate(-100 - index),
      qrPayload: `VIDHAI:${GENERATED.assets[index]}`,
      isDeleted: false,
    });
    if (allocatedQuantity > 0)
      await insertOne(assetAllocationsTable, {
        assetId: asset.id,
        employeeId: employee.id,
        quantity: String(allocatedQuantity),
        status: "Allocated",
        allocatedDate: isoDate(-(index % 60)),
      });
  }

  const growingRoomNames = [
    "Fern Room",
    "Cedar Room",
    "Blue Gum Room",
    "Shola Room",
    "Kurinji Room",
    "Pine Room",
    "Silver Oak Room",
    "Tea Garden Room",
    "Avalanche Room",
    "Ketti Room",
    "Lovedale Room",
    "Doddabetta Room",
  ];
  for (let index = 0; index < growingRoomNames.length; index++)
    rooms.push(
      await insertOne(ootyRoomsTable, {
        name: growingRoomNames[index],
        locationId: locations["MF-OOTY"].id,
        status: "occupied",
        capacity: 1200,
        notes: MARKER,
      }),
    );
  for (let index = 0; index < VOLUME; index++) {
    const annurSource = annurBatches[index % annurBatches.length];
    const coimbatoreSource =
      coimbatoreBatches[index % coimbatoreBatches.length];
    const labSource = labOutputs[index % labOutputs.length];
    const growing = await insertOne(ootyGrowingBatchesTable, {
      batchCode: GENERATED.growingBatches[index],
      roomId: rooms[index % rooms.length].id,
      annurBatchId: annurSource.id,
      coimBatchId: coimbatoreSource.id,
      currentPhase: ["SPAWN_RUN", "CASING_RUN", "FRUITING", "HARVEST"][
        index % 4
      ],
      currentStage: ["SPAWN_RUN", "CASING_RUN", "FRUITING", "HARVEST"][
        index % 4
      ],
      status: index % 10 === 0 ? "completed" : "active",
      spawnRunStartDate: isoDate(-30 + (index % 20)),
      casingAppliedDate: isoDate(-15 + (index % 10)),
      substrateWeightKg: String(800 + index * 2),
      notes: MARKER,
    });
    await db
      .update(ootyRoomsTable)
      .set({ status: "occupied", currentGrowingBatchId: growing.id })
      .where(eq(ootyRoomsTable.id, rooms[index % rooms.length].id));
    await insertOne(ootyStageLogsTable, {
      growingBatchId: growing.id,
      stage: growing.currentStage,
      notes: MARKER,
      casingBatchRef:
        generatedBatches[(index + 1) % generatedBatches.length].batchCode,
    });
    await insertOne(ootyObservationsTable, {
      growingBatchId: growing.id,
      observationDate: isoDate(-(index % 30)),
      temperatureCelsius: String(16 + (index % 4)),
      observationNote: MARKER,
      observationType: "daily",
    });
    await insertOne(ootyHarvestsTable, {
      growingBatchId: growing.id,
      harvestDate: isoDate(-(index % 20)),
      weightKg: String(25 + (index % 50)),
      mushroomCount: 500 + index * 3,
      avgWeightG: String(18 + (index % 8)),
      qualityNote: `${MARKER}: ${index % 3 === 0 ? "Premium" : "Standard"}`,
      flushNumber: (index % 3) + 1,
    });
    await insertOne(batchLinksTable, {
      ootyGrowingBatchId: growing.id,
      annurBatchId: annurSource.id,
      coimBatchId: coimbatoreSource.id,
      labSpawnOutputId: labSource.id,
      notes: MARKER,
    });
  }
  await db.insert(tasksTable).values({
    title: "Inspect casing moisture",
    description: "Check moisture uniformity before applying casing soil.",
    locationId: locations["MF-COIMBATORE"].id,
    status: "todo",
    priority: "medium",
    estimatedMinutes: 45,
    batchRef: "MF-COMP-001",
    checklist: ["Collect samples", "Check moisture", "Update batch notes"],
    notes: MARKER,
  });

  const [
    seededSalesOrders,
    seededQuotes,
    seededRoles,
    seededVendorPayments,
    seededLinks,
    seededRooms,
  ] = await Promise.all([
    db.select().from(salesOrdersTable),
    db.select().from(quotationsTable),
    db.select().from(rolesTable),
    db.select().from(vendorPaymentsTable),
    db.select().from(batchLinksTable),
    db.select().from(ootyRoomsTable),
  ]);
  const missingModules: string[] = [];
  if (!seededSalesOrders.some((row: any) => row.notes === MARKER))
    missingModules.push("Sales Orders");
  if (
    !seededQuotes.some(
      (row: any) =>
        row.notes === MARKER &&
        row.status === "Approved" &&
        Boolean(row.customerResponseAt),
    )
  )
    missingModules.push("Sales Order approval queue");
  if (
    roleDefinitions.some(
      (definition) =>
        !seededRoles.some(
          (row: any) =>
            Number(row.organizationId ?? 1) === 1 &&
            row.slug === definition.slug,
        ),
    )
  )
    missingModules.push("Roles");
  if (
    !seededVendorPayments.some(
      (row: any) =>
        Number(row.organizationId ?? 1) === 1 && row.notes === MARKER,
    )
  )
    missingModules.push("Vendor Payments");
  if (
    !seededLinks.some(
      (row: any) =>
        row.notes === MARKER &&
        row.annurBatchId &&
        row.coimBatchId &&
        row.labSpawnOutputId,
    ) ||
    !seededRooms.some(
      (row: any) => row.notes === MARKER && row.currentGrowingBatchId,
    )
  )
    missingModules.push("Traceability");
  if (missingModules.length)
    throw new Error(
      `Seed verification failed for: ${missingModules.join(", ")}`,
    );

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
    fleetRecords: FLEET_VOLUME * 4,
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
  if (!process.argv.includes("--confirm-production")) {
    throw new Error(
      "Production confirmation missing. Re-run through pnpm production:data:seed or pnpm production:data:clear.",
    );
  }
  if (command === "seed")
    console.log(
      "Mushroom operational data seeded:",
      await seedProductionDataset(),
    );
  else if (command === "clear")
    console.log(
      "Mushroom operational data removed:",
      await removeProductionDataset(),
    );
  else throw new Error("Use either 'seed' or 'clear'.");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(
      "Operational seed data command failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  },
);
