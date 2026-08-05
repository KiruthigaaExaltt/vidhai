import { Router } from "express";
import {
  db,
  batchesTable,
  chambersTable,
  spawnEntriesTable,
  stageLogsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, gte } from "@workspace/db";

const router = Router();

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
