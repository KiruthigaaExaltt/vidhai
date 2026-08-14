import { Router } from "express";
import {
  db,
  batchesTable,
  chambersTable,
  spawnEntriesTable,
  stageLogsTable,
  usersTable,
  employeesTable,
  attendanceLogsTable,
  leaveRequestsTable,
  crewClaimsTable,
  crewDeductionsTable,
  quotationsTable,
  salesOrdersTable,
  salesWorkOrdersTable,
  contactsTable,
  purchaseOrdersTable,
  accountsPayableTable,
} from "@workspace/db";
import { eq, and, desc, gte } from "@workspace/db";

const router = Router();

const organizationId = (req: any) =>
  Number((req.session as any)?.organizationId ?? 1);

router.get("/business-metrics", async (req, res) => {
  const org = organizationId(req);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [
    employees,
    attendance,
    leaves,
    claims,
    deductions,
    quotations,
    salesOrders,
    workOrders,
    vendors,
    purchaseOrders,
    payables,
  ] = await Promise.all([
    db.select().from(employeesTable).where(eq(employeesTable.organizationId, org)),
    db.select().from(attendanceLogsTable).where(eq(attendanceLogsTable.organizationId, org)),
    db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.organizationId, org)),
    db.select().from(crewClaimsTable).where(eq(crewClaimsTable.organizationId, org)),
    db.select().from(crewDeductionsTable).where(eq(crewDeductionsTable.organizationId, org)),
    db.select().from(quotationsTable),
    db.select().from(salesOrdersTable),
    db.select().from(salesWorkOrdersTable),
    db.select().from(contactsTable).where(eq(contactsTable.type, "vendor")),
    db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.organizationId, org)),
    db.select().from(accountsPayableTable).where(eq(accountsPayableTable.organizationId, org)),
  ]);

  const activeEmployeeIds = new Set(
    employees
      .filter((employee: any) => employee.status === "Active" && !employee.isDeleted)
      .map((employee: any) => employee.id),
  );
  const presentEmployeeIds = new Set(
    attendance
      .filter(
        (log: any) =>
          log.attendanceDate === today &&
          activeEmployeeIds.has(log.employeeId) &&
          ["Present", "Late", "Half Day"].includes(log.status),
      )
      .map((log: any) => log.employeeId),
  );
  const lateEmployeeIds = new Set(
    attendance
      .filter(
        (log: any) =>
          log.attendanceDate === today &&
          activeEmployeeIds.has(log.employeeId) &&
          log.status === "Late",
      )
      .map((log: any) => log.employeeId),
  );
  const latestQuotationRoots = new Set(
    quotations
      .filter((quotation: any) => quotation.isLatestVersion !== false)
      .map((quotation: any) => quotation.rootQuoteNumber || quotation.quoteNumber),
  );
  const confirmedPoStatuses = new Set([
    "Confirmed",
    "Approved",
    "Issued",
    "Product Dispatched",
    "Completed",
  ]);
  const outstandingPayables = payables
    .filter((payable: any) => payable.entryType === "Bill")
    .reduce(
      (total: number, payable: any) =>
        total +
        Math.max(
          0,
          Number(payable.amount || 0) -
            Number(payable.paidAmount || 0) -
            Number(payable.adjustedAmount || 0),
        ),
      0,
    );

  res.json({
    crew: {
      activeEmployees: activeEmployeeIds.size,
      presentToday: presentEmployeeIds.size,
      lateToday: lateEmployeeIds.size,
      pendingActions:
        leaves.filter((row: any) => row.status === "Pending").length +
        claims.filter((row: any) => row.status === "Pending").length +
        deductions.filter((row: any) => row.status === "Pending").length,
    },
    sales: {
      quotationsProcessed: latestQuotationRoots.size,
      totalSalesOrders: salesOrders.length,
      workOrdersStarted: workOrders.length,
    },
    procurement: {
      vendors: vendors.length,
      confirmedPurchaseOrders: purchaseOrders.filter((po: any) =>
        confirmedPoStatuses.has(po.status),
      ).length,
      outstandingPayables: Math.round(outstandingPayables * 100) / 100,
    },
    asOf: new Date().toISOString(),
  });
});

router.get("/summary", async (_req, res) => {
  const allBatches = await db.select().from(batchesTable);
  const activeBatches = allBatches.filter((b) => b.status === "active").length;
  const pendingQualityChecks = allBatches.filter((b) => b.currentStage === "QUALITY_CHECK" && b.status === "active").length;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const bagsProducedThisMonth = allBatches
    .filter((b) => {
      if (!b.actualBags) return false;
      const created = new Date(b.createdAt);
      return created >= startOfMonth;
    })
    .reduce((sum, b) => sum + (b.actualBags ?? 0), 0);

  const allChambers = await db.select().from(chambersTable);
  const totalChambers = allChambers.length;
  const occupiedChambers = allChambers.filter((c) => c.status === "active" || c.currentBatchId != null).length;
  const idleChambers = totalChambers - occupiedChambers;

  const stageCounts: Record<string, number> = {};
  for (const b of allBatches.filter((b) => b.status === "active")) {
    stageCounts[b.currentStage] = (stageCounts[b.currentStage] ?? 0) + 1;
  }
  const stageBreakdown = Object.entries(stageCounts).map(([stage, count]) => ({ stage, count }));

  const spawnEntries = await db.select().from(spawnEntriesTable).where(eq(spawnEntriesTable.status, "available"));
  const spawnStockKg = spawnEntries.reduce((sum, e) => sum + Number(e.quantityKg), 0);

  res.json({
    activeBatches,
    bagsProducedThisMonth,
    pendingQualityChecks,
    chamberOccupancy: { total: totalChambers, occupied: occupiedChambers, idle: idleChambers },
    stageBreakdown,
    spawnStockKg,
    rawMaterialAlerts: 0,
  });
});

router.get("/activity", async (_req, res) => {
  const logs = await db
    .select({
      sl: stageLogsTable,
      batchCode: batchesTable.batchCode,
      enteredByName: usersTable.displayName,
    })
    .from(stageLogsTable)
    .innerJoin(batchesTable, eq(stageLogsTable.batchId, batchesTable.id))
    .leftJoin(usersTable, eq(stageLogsTable.enteredByUserId, usersTable.id))
    .orderBy(desc(stageLogsTable.enteredAt))
    .limit(25);

  res.json(
    logs.map(({ sl, batchCode, enteredByName }) => ({
      id: sl.id,
      batchCode,
      action: `Advanced to ${sl.stage}`,
      stage: sl.stage,
      performedByName: enteredByName ?? "System",
      performedAt: sl.enteredAt,
      notes: sl.notes,
    }))
  );
});

export default router;
