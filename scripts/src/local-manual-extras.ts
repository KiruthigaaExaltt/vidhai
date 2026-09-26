import * as s from "@workspace/db";

/** Additional user-visible lists absent from the older farm seed. */
export async function seedLocalExtras() {
  const { db, eq } = s;
  const rows = (table: any) => db.select().from(table);
  const ensure = async (table: any, key: string, value: any, data: any) =>
    (await rows(table)).find((r) => r[key] === value) ||
    (
      await db
        .insert(table)
        .values({ ...data, [key]: value })
        .returning()
    )[0];
  const staff = (await rows(s.employeesTable)).filter((e) =>
    String(e.employeeCode).startsWith("MF-"),
  );
  const admin = (await rows(s.usersTable)).find(
    (u) => u.systemKey === "SUPER_ADMIN",
  )!;
  const vehicles = (await rows(s.vehiclesTable)).filter((v) =>
    String(v.notes).includes("Routine mushroom"),
  );
  const quotes = (await rows(s.quotationsTable)).filter((q) =>
    String(q.notes).includes("Routine mushroom"),
  );
  const material = (await rows(s.materialsTable)).find(
    (m) => m.sku === "MF-CASING-SOIL",
  )!;
  const spawns = (await rows(s.spawnEntriesTable)).filter((r) =>
    String(r.notes).includes("Routine mushroom"),
  );
  const chambers = await rows(s.chambersTable);
  const turns = await rows(s.coimbatoreTurnsTable);
  const links = (await rows(s.batchLinksTable)).filter((r) =>
    String(r.notes).includes("Routine mushroom"),
  );
  const bank = await ensure(
    s.chartOfAccountsTable,
    "accountCode",
    "LOCAL-QA-BANK",
    {
      accountName: "Local QA Bank",
      accountType: "Asset",
      isBankCash: true,
      bankName: "Test bank",
      description: "Local QA",
    },
  );
  const counter = await ensure(
    s.chartOfAccountsTable,
    "accountCode",
    "LOCAL-QA-CAPITAL",
    {
      accountName: "Local QA Capital",
      accountType: "Equity",
      description: "Local QA",
    },
  );
  for (let i = 0; i < 10; i++) {
    const key = `LOCAL-QA-${i + 1}`;
    await ensure(s.crewCodePrefixesTable, "value", `QA${i + 1}`, {
      organizationId: 1,
      isActive: true,
    });
    await ensure(s.crewCodeSuffixesTable, "value", `T${i + 1}`, {
      organizationId: 1,
      isActive: true,
    });
    await ensure(s.accountGroupsTable, "name", `${key} Expense group`, {
      accountType: "Expense",
      isActive: true,
    });
    await ensure(s.accountCostCentersTable, "code", key, {
      name: `${key} Cost centre`,
      description: "Local manual QA",
      isActive: true,
    });
    const transactionType = await ensure(
      s.accountTransactionTypesTable,
      "code",
      key,
      {
        name: `${key} Receipt`,
        direction: "Credit",
        defaultDebitAccountId: bank.id,
        defaultCreditAccountId: counter.id,
        tallyVoucherType: "Receipt",
      },
    );
    await ensure(s.bankCashTransactionsTable, "reference", key, {
      transactionDate: new Date().toISOString().slice(0, 10),
      transactionTypeId: transactionType.id,
      transactionTypeName: transactionType.name,
      mode: "Credit",
      bankCashAccountId: bank.id,
      counterAccountId: counter.id,
      amount: String(1000 + i * 100),
      remarks: "Local QA pending receipt; not posted to ledger",
      status: "Pending Approval",
      approvalStatus: "Pending Approval",
      createdByUserId: admin.id,
    });
    const e = staff[i];
    await ensure(
      s.crewAuditLogsTable,
      "recordName",
      `${key} imported employee`,
      {
        module: "crew",
        entityType: "employee",
        entityId: e.id,
        action: "create",
        actorUserId: admin.id,
        actorName: "Local QA seed",
        afterValues: JSON.stringify({ employeeCode: e.employeeCode }),
      },
    );
    await ensure(
      s.notificationsTable,
      "eventRecipientKey",
      `${key}:local-seed`,
      {
        organizationId: 1,
        recipientUserId: admin.id,
        permissionKey: "crew.employees.view",
        sourceModule: "crew",
        targetModule: "crew",
        eventType: "local_qa_seed",
        title: `${key} manual test fixture ready`,
        message: `${e.name} is available for local testing. This is a seeded in-app notification.`,
        sourceEntityType: "employee",
        sourceEntityId: String(e.id),
        navigationUrl: "/crew",
        isRead: i % 2 === 0,
        readAt: i % 2 === 0 ? new Date() : null,
      },
    );
    const v = vehicles[i];
    if (v)
      await ensure(
        s.vehicleStatusHistoryTable,
        "notes",
        `${key}:vehicle-opening-state`,
        {
          vehicleId: v.id,
          status: v.status,
          startedAt: new Date(Date.now() - 86400000),
          changedByUserId: admin.id,
        },
      );
    const q = quotes[i];
    if (q)
      await ensure(
        s.quotationCommunicationsTable,
        "message",
        `${key}: local review note; no message sent`,
        {
          quotationId: q.id,
          rootQuoteNumber: q.quoteNumber,
          channel: "Internal",
          communicationType: "Note",
          actorUserId: admin.id,
          actorName: "Local QA seed",
        },
      );
    const spawn = spawns[i];
    if (spawn)
      await ensure(
        s.spawnVaultTransactionsTable,
        "transactionKey",
        `${key}:opening-spawn`,
        {
          spawnEntryId: spawn.id,
          transactionType: "IN",
          quantityInKg: spawn.quantityKg,
          quantityOutKg: "0",
          balanceAfterKg: spawn.quantityKg,
          referenceType: "LOCAL_QA_OPENING",
          referenceId: spawn.id,
          reference: key,
          notes: "Opening balance of the local seed",
          recordedByUserId: admin.id,
        },
      );
    const turn = turns[i],
      chamber = chambers[i];
    if (turn && chamber)
      await ensure(s.coimbatoreTurnAssignmentsTable, "batchId", turn.batchId, {
        turnNumber: turn.turnNumber,
        chamberId: chamber.id,
        chamberNameSnapshot: chamber.name,
        enteredAt: new Date(Date.now() - 172800000),
        releasedAt: new Date(Date.now() - 86400000),
      });
    if (turn)
      await ensure(
        s.coimbatorePreparationStagesTable,
        "notes",
        `${key}:preparation`,
        {
          batchId: turn.batchId,
          stage: "wetting",
          recordedByUserId: admin.id,
          completedAt: new Date(Date.now() - 259200000),
        },
      );
    const link = links[i];
    if (link)
      await ensure(
        s.ootyBatchSourcesTable,
        "growingBatchId",
        link.ootyGrowingBatchId,
        { annurBatchId: link.annurBatchId, bagCount: 100 },
      );
    if (material) {
      const warehouse = await ensure(
        s.inventoryLocationsTable,
        "warehouseCode",
        key,
        {
          locationName: `${key} Casing store`,
          capacity: "1000",
          capacityUnit: "kg",
          manager: "Local QA",
          locationType: "Store",
          isActive: true,
        },
      );
      const stock =
        (await rows(s.inventoryTable)).find(
          (r) => r.materialId === material.id && r.locationId === warehouse.id,
        ) ||
        (
          await db
            .insert(s.inventoryTable)
            .values({
              materialId: material.id,
              locationId: warehouse.id,
              quantityOnHand: "100",
              costBasis: "500",
            })
            .returning()
        )[0];
      const adjustment = await ensure(
        s.inventoryAdjustmentsTable,
        "reference",
        `${key}:casing-opening`,
        {
          materialId: material.id,
          quantityDelta: "100",
          reason: "Local QA opening stock",
          notes: key,
          adjustedByUserId: admin.id,
        },
      );
      await ensure(
        s.casingSoilInventorySourcesTable,
        "sourceKey",
        `${key}:casing-source`,
        {
          sourceType: "purchased",
          origin: "external",
          reference: key,
          materialId: material.id,
          warehouseId: warehouse.id,
          inventoryId: stock.id,
          inventoryAdjustmentId: adjustment.id,
          originalQuantityKg: "100",
          consumedQuantityKg: "0",
          availableQuantityKg: "100",
          stockDate: new Date().toISOString().slice(0, 10),
          notes: "Local manual-QA purchased casing lot",
          status: "available",
          createdByUserId: admin.id,
        },
      );
    }
  }
}
