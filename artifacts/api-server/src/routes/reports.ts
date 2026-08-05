import { Router } from "express";
import { db } from "@workspace/db";
import {
  batchesTable,
  locationsTable,
  stageLogsTable,
  ootyHarvestsTable,
  ootyGrowingBatchesTable,
  ootyBatchSourcesTable,
  fuelLogsTable,
  vehicleUsageLogsTable,
  vehiclesTable,
  maintenanceLogsTable,
  coimbatoreBatchMaterialsTable,
  salesOrdersTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, inArray } from "@workspace/db";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

// ── Batch Summary ─────────────────────────────────────────────────────────────
router.get("/batch-summary", requireAuth, async (req, res) => {
  const { locationCode, from, to } = req.query as Record<string, string>;

  let query = db
    .select({
      id: batchesTable.id,
      batchCode: batchesTable.batchCode,
      locationCode: locationsTable.code,
      locationName: locationsTable.name,
      currentStage: batchesTable.currentStage,
      status: batchesTable.status,
      createdAt: batchesTable.createdAt,
      targetBags: batchesTable.targetBags,
      actualBags: batchesTable.actualBags,
      nitrogenContent: batchesTable.nitrogenContent,
    })
    .from(batchesTable)
    .innerJoin(locationsTable, eq(batchesTable.locationId, locationsTable.id))
    .$dynamic();

  if (locationCode) query = query.where(eq(locationsTable.code, locationCode));

  const batches = await query.orderBy(desc(batchesTable.createdAt));

  const total = batches.length;
  const active = batches.filter((b) => b.status === "active").length;
  const completed = batches.filter((b) => b.status === "completed").length;
  const failed = batches.filter((b) => b.status === "failed").length;
  const onHold = batches.filter((b) => b.status === "on_hold").length;
  const totalBags = batches.reduce((s, b) => s + (Number(b.actualBags) || 0), 0);

  return res.json({ total, active, completed, failed, onHold, totalBags, batches });
});

// ── Monthly Production ────────────────────────────────────────────────────────
router.get("/monthly-production", requireAuth, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();

  const harvests = await db
    .select({
      harvestDate: ootyHarvestsTable.harvestDate,
      weightKg: ootyHarvestsTable.weightKg,
      flushNumber: ootyHarvestsTable.flushNumber,
    })
    .from(ootyHarvestsTable)
    .where(
      and(
        gte(ootyHarvestsTable.harvestDate, `${year}-01-01`),
        lte(ootyHarvestsTable.harvestDate, `${year}-12-31`)
      )
    );

  const completedBatches = await db
    .select({
      actualBags: batchesTable.actualBags,
      createdAt: batchesTable.createdAt,
      locationCode: locationsTable.code,
    })
    .from(batchesTable)
    .innerJoin(locationsTable, eq(batchesTable.locationId, locationsTable.id))
    .where(eq(batchesTable.status, "completed"));

  // Group harvests by month
  const monthlyHarvest: Record<number, number> = {};
  const monthlyBags: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) {
    monthlyHarvest[m] = 0;
    monthlyBags[m] = 0;
  }

  for (const h of harvests) {
    const m = new Date(h.harvestDate).getMonth() + 1;
    monthlyHarvest[m] += Number(h.weightKg) || 0;
  }

  for (const b of completedBatches) {
    if (!b.createdAt) continue;
    const m = new Date(b.createdAt).getMonth() + 1;
    const bYear = new Date(b.createdAt).getFullYear();
    if (bYear === year) monthlyBags[m] += Number(b.actualBags) || 0;
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    mushroomKg: Math.round(monthlyHarvest[i + 1] * 100) / 100,
    growBagsProduced: monthlyBags[i + 1],
  }));

  return res.json({ year, months });
});

// ── Quality Trend ─────────────────────────────────────────────────────────────
router.get("/quality-trend", requireAuth, async (req, res) => {
  const { from, to } = req.query as Record<string, string>;

  let query = db
    .select({
      harvestDate: ootyHarvestsTable.harvestDate,
      weightKg: ootyHarvestsTable.weightKg,
      mushroomCount: ootyHarvestsTable.mushroomCount,
      avgWeightG: ootyHarvestsTable.avgWeightG,
      qualityNote: ootyHarvestsTable.qualityNote,
      flushNumber: ootyHarvestsTable.flushNumber,
      batchCode: ootyGrowingBatchesTable.batchCode,
    })
    .from(ootyHarvestsTable)
    .innerJoin(ootyGrowingBatchesTable, eq(ootyHarvestsTable.growingBatchId, ootyGrowingBatchesTable.id))
    .$dynamic();

  if (from) query = query.where(gte(ootyHarvestsTable.harvestDate, from));
  if (to) query = query.where(lte(ootyHarvestsTable.harvestDate, to));

  const rows = await query.orderBy(ootyHarvestsTable.harvestDate);

  const totalHarvests = rows.length;
  const avgWeight = rows.reduce((s, r) => s + (Number(r.avgWeightG) || 0), 0) / (totalHarvests || 1);
  const totalKg = rows.reduce((s, r) => s + (Number(r.weightKg) || 0), 0);
  const meetsStandard = rows.filter((r) => Number(r.avgWeightG) >= 20).length;

  return res.json({
    totalHarvests,
    avgMushroomWeightG: Math.round(avgWeight * 100) / 100,
    totalKg: Math.round(totalKg * 100) / 100,
    meetsQualityStandard: meetsStandard,
    qualityPercent: totalHarvests ? Math.round((meetsStandard / totalHarvests) * 100) : 0,
    harvests: rows,
  });
});

// ── Vehicle Utilization ───────────────────────────────────────────────────────
router.get("/vehicle-utilization", requireAuth, async (req, res) => {
  const { from, to } = req.query as Record<string, string>;

  let query = db
    .select({
      vehicleId: vehicleUsageLogsTable.vehicleId,
      vehicleName: vehiclesTable.name,
      vehicleRegNo: vehiclesTable.regNo,
      hoursWorked: vehicleUsageLogsTable.hoursWorked,
      workType: vehicleUsageLogsTable.workType,
      usageDate: vehicleUsageLogsTable.usageDate,
    })
    .from(vehicleUsageLogsTable)
    .innerJoin(vehiclesTable, eq(vehicleUsageLogsTable.vehicleId, vehiclesTable.id))
    .$dynamic();

  if (from) query = query.where(gte(vehicleUsageLogsTable.usageDate, from));
  if (to) query = query.where(lte(vehicleUsageLogsTable.usageDate, to));

  const usageLogs = await query.orderBy(desc(vehicleUsageLogsTable.usageDate));

  // Aggregate by vehicle
  const byVehicle: Record<number, { vehicleId: number; vehicleName: string; vehicleRegNo: string; totalHours: number; logCount: number; workTypes: Record<string, number> }> = {};
  for (const log of usageLogs) {
    if (!byVehicle[log.vehicleId]) {
      byVehicle[log.vehicleId] = {
        vehicleId: log.vehicleId,
        vehicleName: log.vehicleName,
        vehicleRegNo: log.vehicleRegNo,
        totalHours: 0,
        logCount: 0,
        workTypes: {},
      };
    }
    byVehicle[log.vehicleId].totalHours += Number(log.hoursWorked) || 0;
    byVehicle[log.vehicleId].logCount += 1;
    byVehicle[log.vehicleId].workTypes[log.workType] = (byVehicle[log.vehicleId].workTypes[log.workType] || 0) + 1;
  }

  return res.json({ vehicles: Object.values(byVehicle), usageLogs });
});

// ── Fuel Consumption ──────────────────────────────────────────────────────────
router.get("/fuel-consumption", requireAuth, async (req, res) => {
  const { from, to } = req.query as Record<string, string>;

  let query = db
    .select({
      vehicleId: fuelLogsTable.vehicleId,
      vehicleName: vehiclesTable.name,
      vehicleRegNo: vehiclesTable.regNo,
      fuelDate: fuelLogsTable.fuelDate,
      litres: fuelLogsTable.litres,
      totalCost: fuelLogsTable.totalCost,
      odometer: fuelLogsTable.odometer,
    })
    .from(fuelLogsTable)
    .innerJoin(vehiclesTable, eq(fuelLogsTable.vehicleId, vehiclesTable.id))
    .$dynamic();

  if (from) query = query.where(gte(fuelLogsTable.fuelDate, from));
  if (to) query = query.where(lte(fuelLogsTable.fuelDate, to));

  const logs = await query.orderBy(desc(fuelLogsTable.fuelDate));

  const totalLitres = logs.reduce((s, l) => s + (Number(l.litres) || 0), 0);
  const totalCost = logs.reduce((s, l) => s + (Number(l.totalCost) || 0), 0);

  const byVehicle: Record<number, { vehicleId: number; vehicleName: string; vehicleRegNo: string; totalLitres: number; totalCost: number; fillCount: number }> = {};
  for (const log of logs) {
    if (!byVehicle[log.vehicleId]) {
      byVehicle[log.vehicleId] = { vehicleId: log.vehicleId, vehicleName: log.vehicleName, vehicleRegNo: log.vehicleRegNo, totalLitres: 0, totalCost: 0, fillCount: 0 };
    }
    byVehicle[log.vehicleId].totalLitres += Number(log.litres) || 0;
    byVehicle[log.vehicleId].totalCost += Number(log.totalCost) || 0;
    byVehicle[log.vehicleId].fillCount += 1;
  }

  return res.json({
    totalLitres: Math.round(totalLitres * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    vehicles: Object.values(byVehicle),
    logs,
  });
});

// ── Batch Costing ─────────────────────────────────────────────────────────────
router.get("/batch-costing", requireAuth, async (req, res) => {
  const { batchId, locationCode } = req.query as Record<string, string>;

  // Material costs from sales orders linked to batch
  const salesRows = batchId
    ? await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.fromBatchId, Number(batchId)))
    : [];

  // Coimbatore material weights for a batch
  const coimMaterials = batchId
    ? await db.select({
        weightKg: coimbatoreBatchMaterialsTable.weightKg,
        notes: coimbatoreBatchMaterialsTable.notes,
      })
        .from(coimbatoreBatchMaterialsTable)
        .where(eq(coimbatoreBatchMaterialsTable.batchId, Number(batchId)))
    : [];

  const totalMaterialKg = coimMaterials.reduce((s, m) => s + (Number(m.weightKg) || 0), 0);
  const totalRevenue = salesRows.reduce((s, r) => s + (Number(r.totalValue) || 0), 0);

  return res.json({
    batchId: batchId ? Number(batchId) : null,
    totalMaterialKg: Math.round(totalMaterialKg * 100) / 100,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    salesOrders: salesRows,
    coimMaterials,
  });
});

// ── Annur Batch Yield ──────────────────────────────────────────────────────────
// Aggregates total mushroom yield (Flush 1 + Flush 2) per originating Annur grow-bag batch,
// rolling up across all Ooty rooms that received bags from that batch.
router.get("/annur-batch-yield", requireAuth, async (req, res) => {
  // All batch source links with Annur batch metadata
  const sources = await db
    .select({
      annurBatchId: ootyBatchSourcesTable.annurBatchId,
      ootyGrowingBatchId: ootyBatchSourcesTable.ootyGrowingBatchId,
      bagCount: ootyBatchSourcesTable.bagCount,
      annurBatchCode: batchesTable.batchCode,
      annurActualBags: batchesTable.actualBags,
      annurCreatedAt: batchesTable.createdAt,
    })
    .from(ootyBatchSourcesTable)
    .innerJoin(batchesTable, eq(ootyBatchSourcesTable.annurBatchId, batchesTable.id))
    .orderBy(desc(batchesTable.createdAt));

  if (sources.length === 0) return res.json({ rows: [] });

  // Harvest records for all linked Ooty growing batches
  const ootyBatchIds = [...new Set(sources.map(s => s.ootyGrowingBatchId))];
  const harvests = await db
    .select({
      growingBatchId: ootyHarvestsTable.growingBatchId,
      flushNumber: ootyHarvestsTable.flushNumber,
      weightKg: ootyHarvestsTable.weightKg,
      harvestDate: ootyHarvestsTable.harvestDate,
    })
    .from(ootyHarvestsTable)
    .where(inArray(ootyHarvestsTable.growingBatchId, ootyBatchIds));

  // Aggregate per Annur batch
  const map: Record<number, {
    annurBatchId: number;
    annurBatchCode: string;
    annurActualBags: number | null;
    annurCreatedAt: Date | null;
    rooms: Set<number>;
    totalBagsInOoty: number;
    flush1Kg: number;
    flush2Kg: number;
    totalYieldKg: number;
  }> = {};

  for (const src of sources) {
    if (!map[src.annurBatchId]) {
      map[src.annurBatchId] = {
        annurBatchId: src.annurBatchId,
        annurBatchCode: src.annurBatchCode,
        annurActualBags: src.annurActualBags ? Number(src.annurActualBags) : null,
        annurCreatedAt: src.annurCreatedAt,
        rooms: new Set(),
        totalBagsInOoty: 0,
        flush1Kg: 0,
        flush2Kg: 0,
        totalYieldKg: 0,
      };
    }
    map[src.annurBatchId].rooms.add(src.ootyGrowingBatchId);
    map[src.annurBatchId].totalBagsInOoty += Number(src.bagCount) || 0;
  }

  for (const h of harvests) {
    const matchingSources = sources.filter(s => s.ootyGrowingBatchId === h.growingBatchId);
    for (const src of matchingSources) {
      const entry = map[src.annurBatchId];
      if (!entry) continue;
      const kg = Number(h.weightKg) || 0;
      if (h.flushNumber === 1) entry.flush1Kg += kg;
      else if (h.flushNumber === 2) entry.flush2Kg += kg;
      entry.totalYieldKg += kg;
    }
  }

  const rows = Object.values(map).map(r => ({
    annurBatchId: r.annurBatchId,
    annurBatchCode: r.annurBatchCode,
    annurActualBags: r.annurActualBags,
    annurCreatedAt: r.annurCreatedAt,
    roomCount: r.rooms.size,
    totalBagsInOoty: r.totalBagsInOoty,
    flush1Kg: Math.round(r.flush1Kg * 100) / 100,
    flush2Kg: Math.round(r.flush2Kg * 100) / 100,
    totalYieldKg: Math.round(r.totalYieldKg * 100) / 100,
    yieldPerBag: r.totalBagsInOoty > 0
      ? Math.round((r.totalYieldKg / r.totalBagsInOoty) * 1000) / 1000
      : null,
  }));

  return res.json({ rows });
});

export default router;
