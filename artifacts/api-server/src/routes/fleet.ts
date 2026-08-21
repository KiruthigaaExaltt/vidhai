import { Router } from "express";
import { db } from "@workspace/db";
import {
  vehiclesTable,
  fuelLogsTable,
  maintenanceLogsTable,
  vehicleUsageLogsTable,
  locationsTable,
  usersTable,
  fleetSettingsTable,
} from "@workspace/db";
import { and, eq, desc } from "@workspace/db";
import { paginateQuery, paginatedResponse } from "../lib/pagination";
import { vehicleStatusHistoryTable } from "@workspace/db/schema";

const router = Router();
const isoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
function maintenanceAlertStatus(nextMaintenanceDate: any, reminderDays: number) {
  if (!nextMaintenanceDate) return "ok";
  const today = new Date(`${isoToday()}T00:00:00.000Z`).getTime();
  const due = new Date(`${String(nextMaintenanceDate).slice(0, 10)}T00:00:00.000Z`).getTime();
  const days = Math.ceil((due - today) / 86_400_000);
  if (days < 0) return "overdue";
  if (days <= reminderDays) return "due_soon";
  return "ok";
}
async function fleetSettings() {
  const org = 1;
  const [existing] = await db.select().from(fleetSettingsTable).where(eq(fleetSettingsTable.organizationId, org)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(fleetSettingsTable).values({ organizationId: org, serviceReminderDays: 7 }).returning();
  return created;
}
async function vehicleMaintenanceSummary(reminderDays: number) {
  const logs = await db.select().from(maintenanceLogsTable).orderBy(desc(maintenanceLogsTable.serviceDate));
  const byVehicle = new Map<number, any>();
  for (const log of logs as any[]) {
    const id = Number(log.vehicleId);
    const current = byVehicle.get(id);
    const started = log.maintenanceStartedDate || log.serviceDate;
    if (!current || String(started) > String(current.lastMaintenanceDate || ""))
      byVehicle.set(id, { lastMaintenanceDate: started, nextMaintenanceDate: log.nextServiceDue || current?.nextMaintenanceDate || null });
    if (log.nextServiceDue && (!byVehicle.get(id)?.nextMaintenanceDate || String(log.nextServiceDue) > String(byVehicle.get(id)?.nextMaintenanceDate)))
      byVehicle.set(id, { ...(byVehicle.get(id) || {}), lastMaintenanceDate: byVehicle.get(id)?.lastMaintenanceDate || started, nextMaintenanceDate: log.nextServiceDue });
  }
  for (const [, value] of byVehicle) value.maintenanceAlertStatus = maintenanceAlertStatus(value.nextMaintenanceDate, reminderDays);
  return byVehicle;
}
async function changeVehicleStatus(vehicle: any, nextStatus: string, userId?: number, notes?: string) {
  const now = new Date();
  const currentStatus = String(vehicle.status || "available");
  if (currentStatus === nextStatus) return vehicle;
  const openLogs = await db.select().from(vehicleStatusHistoryTable).where(eq(vehicleStatusHistoryTable.vehicleId, Number(vehicle.id)));
  const currentOpen = (openLogs as any[])
    .filter((log) => !log.endedAt)
    .sort((a, b) => new Date(String(b.startedAt)).getTime() - new Date(String(a.startedAt)).getTime())[0];
  if (currentOpen) {
    const started = new Date(String(currentOpen.startedAt));
    const durationHours = Math.max(0, Math.round(((now.getTime() - started.getTime()) / 3_600_000) * 100) / 100);
    await db.update(vehicleStatusHistoryTable).set({ endedAt: now, durationHours: String(durationHours) }).where(eq(vehicleStatusHistoryTable.id, currentOpen.id));
  } else {
    await db.insert(vehicleStatusHistoryTable).values({
      vehicleId: Number(vehicle.id),
      status: currentStatus,
      startedAt: vehicle.createdAt ? new Date(String(vehicle.createdAt)) : now,
      endedAt: now,
      durationHours: "0",
      notes: "Backfilled during status change",
      changedByUserId: userId ?? null,
    });
  }
  await db.insert(vehicleStatusHistoryTable).values({
    vehicleId: Number(vehicle.id),
    status: nextStatus,
    startedAt: now,
    notes: notes || null,
    changedByUserId: userId ?? null,
  });
  const [updated] = await db.update(vehiclesTable).set({ status: nextStatus }).where(eq(vehiclesTable.id, Number(vehicle.id))).returning();
  return updated;
}
function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

router.get("/settings", requireAuth, async (_req, res) => {
  return res.json(await fleetSettings());
});

router.patch("/settings", requireAuth, async (req, res) => {
  const serviceReminderDays = Math.max(0, Math.min(365, Number((req.body as any)?.serviceReminderDays ?? 7)));
  const settings = await fleetSettings();
  const [updated] = await db.update(fleetSettingsTable).set({ serviceReminderDays, updatedAt: new Date() }).where(eq(fleetSettingsTable.id, settings.id)).returning();
  return res.json(updated || settings);
});
// ── Vehicles ──────────────────────────────────────────────────────────────────

router.get("/vehicles", requireAuth, async (req, res) => {
  const settings = await fleetSettings();
  const reminderDays = Number(settings.serviceReminderDays || 7);
  const summaries = await vehicleMaintenanceSummary(reminderDays);
  const pagination = paginateQuery(req.query);
  const status = String(req.query.status || "ALL");
  const filter = and(status === "ALL" ? undefined : eq(vehiclesTable.status, status));
  const [rows, totalCount] = await Promise.all([db
    .select({
      id: vehiclesTable.id,
      name: vehiclesTable.name,
      regNo: vehiclesTable.regNo,
      homeLocationId: vehiclesTable.homeLocationId,
      vehicleType: vehiclesTable.vehicleType,
      status: vehiclesTable.status,
      notes: vehiclesTable.notes,
      lastMaintenanceDate: vehiclesTable.lastMaintenanceDate,
      nextMaintenanceDate: vehiclesTable.nextMaintenanceDate,
      createdAt: vehiclesTable.createdAt,
      homeLocationCode: locationsTable.code,
      homeLocationName: locationsTable.name,
    })
    .from(vehiclesTable).where(filter)
    .leftJoin(locationsTable, eq(vehiclesTable.homeLocationId, locationsTable.id))
    .orderBy(vehiclesTable.name).offset(pagination.skip).limit(pagination.limit), db.count(vehiclesTable, filter)]);
  const data = rows.map((row: any) => {
    const computed = summaries.get(Number(row.id)) || {};
    const nextMaintenanceDate = row.nextMaintenanceDate || computed.nextMaintenanceDate || null;
    const lastMaintenanceDate = row.lastMaintenanceDate || computed.lastMaintenanceDate || null;
    return { ...row, lastMaintenanceDate, nextMaintenanceDate, maintenanceAlertStatus: maintenanceAlertStatus(nextMaintenanceDate, reminderDays) };
  });
  return res.json(paginatedResponse(data, totalCount, pagination));
});

router.post("/vehicles", requireAuth, async (req, res) => {
  const { name, regNo, homeLocationId, vehicleType, notes, lastMaintenanceDate, nextMaintenanceDate } = req.body as any;
  const [row] = await db.insert(vehiclesTable).values({
    name,
    regNo,
    homeLocationId: homeLocationId ?? null,
    vehicleType: vehicleType ?? "truck",
    notes: notes ?? null,
    lastMaintenanceDate: lastMaintenanceDate || null,
    nextMaintenanceDate: nextMaintenanceDate || null,
  }).returning();
  await db.insert(vehicleStatusHistoryTable).values({ vehicleId: row.id, status: row.status || "available", startedAt: new Date(), changedByUserId: (req.session as any).userId ?? null });
  return res.status(201).json(row);
});

router.patch("/vehicles/:id/status", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const nextStatus = String((req.body as any)?.status || "");
  if (!["available", "in_use", "maintenance", "retired"].includes(nextStatus)) return res.status(400).json({ error: "Invalid vehicle status" });
  const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id)).limit(1);
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
  const updated = await changeVehicleStatus(vehicle, nextStatus, (req.session as any).userId, String((req.body as any)?.notes || ""));
  return res.json(updated);
});
router.patch("/vehicles/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, regNo, vehicleType, homeLocationId, notes, lastMaintenanceDate, nextMaintenanceDate } = req.body as any;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (regNo !== undefined) updates.regNo = regNo;
  if (vehicleType !== undefined) updates.vehicleType = vehicleType;
  if (homeLocationId !== undefined) updates.homeLocationId = homeLocationId;
  if (notes !== undefined) updates.notes = notes;
  if (lastMaintenanceDate !== undefined) updates.lastMaintenanceDate = lastMaintenanceDate || null;
  if (nextMaintenanceDate !== undefined) updates.nextMaintenanceDate = nextMaintenanceDate || null;
  const [row] = await db.update(vehiclesTable).set(updates).where(eq(vehiclesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.get("/status-history", requireAuth, async (req, res) => {
  const status = String(req.query.status || "ALL");
  const dateFrom = String(req.query.dateFrom || "").slice(0, 10);
  const dateTo = String(req.query.dateTo || "").slice(0, 10);
  const search = String(req.query.search || "").trim().toLowerCase();
  const rows = await db
    .select({
      id: vehicleStatusHistoryTable.id,
      vehicleId: vehicleStatusHistoryTable.vehicleId,
      status: vehicleStatusHistoryTable.status,
      startedAt: vehicleStatusHistoryTable.startedAt,
      endedAt: vehicleStatusHistoryTable.endedAt,
      durationHours: vehicleStatusHistoryTable.durationHours,
      notes: vehicleStatusHistoryTable.notes,
      createdAt: vehicleStatusHistoryTable.createdAt,
      vehicleName: vehiclesTable.name,
      vehicleRegNo: vehiclesTable.regNo,
      vehicleType: vehiclesTable.vehicleType,
      currentVehicleStatus: vehiclesTable.status,
      changedByName: usersTable.displayName,
    })
    .from(vehicleStatusHistoryTable)
    .innerJoin(vehiclesTable, eq(vehicleStatusHistoryTable.vehicleId, vehiclesTable.id))
    .leftJoin(usersTable, eq(vehicleStatusHistoryTable.changedByUserId, usersTable.id))
    .orderBy(desc(vehicleStatusHistoryTable.startedAt));
  const filtered = (rows as any[]).filter((row) => {
    if (status !== "ALL" && row.status !== status) return false;
    const started = String(row.startedAt || "").slice(0, 10);
    const ended = row.endedAt ? String(row.endedAt).slice(0, 10) : "";
    if (dateFrom && (ended || started) < dateFrom) return false;
    if (dateTo && started > dateTo) return false;
    if (!search) return true;
    return `${row.vehicleName || ""} ${row.vehicleRegNo || ""} ${row.vehicleType || ""}`.toLowerCase().includes(search);
  });
  return res.json({ current: filtered.filter((row) => !row.endedAt), completed: filtered.filter((row) => row.endedAt) });
});
// ── Fuel Logs ─────────────────────────────────────────────────────────────────

router.delete("/vehicles/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "Invalid vehicle id" });
  const [row] = await db
    .delete(vehiclesTable)
    .where(eq(vehiclesTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Vehicle not found" });
  return res.status(204).send();
});

router.get("/fuel-logs", requireAuth, async (req, res) => {
  const rows = await db
    .select({
      id: fuelLogsTable.id,
      vehicleId: fuelLogsTable.vehicleId,
      fuelDate: fuelLogsTable.fuelDate,
      litres: fuelLogsTable.litres,
      costPerLitre: fuelLogsTable.costPerLitre,
      totalCost: fuelLogsTable.totalCost,
      odometer: fuelLogsTable.odometer,
      notes: fuelLogsTable.notes,
      startKm: fuelLogsTable.startKm,
      endKm: fuelLogsTable.endKm,
      distanceKm: fuelLogsTable.distanceKm,
      createdAt: fuelLogsTable.createdAt,
      vehicleName: vehiclesTable.name,
      vehicleRegNo: vehiclesTable.regNo,
      recordedByName: usersTable.displayName,
    })
    .from(fuelLogsTable)
    .innerJoin(vehiclesTable, eq(fuelLogsTable.vehicleId, vehiclesTable.id))
    .leftJoin(usersTable, eq(fuelLogsTable.recordedByUserId, usersTable.id))
    .orderBy(desc(fuelLogsTable.fuelDate));
  return res.json(rows);
});

router.post("/fuel-logs", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const { vehicleId, fuelDate, litres, costPerLitre, odometer, startKm, endKm, notes } = req.body as any;
  const totalCost = litres && costPerLitre ? (Number(litres) * Number(costPerLitre)).toFixed(2) : null;
  const distanceKm = startKm != null && endKm != null ? String(Number(endKm) - Number(startKm)) : null;
  const [row] = await db.insert(fuelLogsTable).values({
    vehicleId,
    fuelDate,
    litres: String(litres),
    costPerLitre: costPerLitre ? String(costPerLitre) : null,
    totalCost,
    odometer: odometer ? String(odometer) : null,
    startKm: startKm != null ? String(startKm) : null,
    endKm: endKm != null ? String(endKm) : null,
    distanceKm,
    notes: notes ?? null,
    recordedByUserId: userId,
  }).returning();
  return res.status(201).json(row);
});

// ── Maintenance Logs ──────────────────────────────────────────────────────────

router.get("/maintenance-logs", requireAuth, async (req, res) => {
  const dateFrom = String(req.query.dateFrom || "").slice(0, 10);
  const dateTo = String(req.query.dateTo || "").slice(0, 10);
  const vehicleSearch = String(req.query.vehicleSearch || req.query.search || "").trim().toLowerCase();
  const rows = await db
    .select({
      id: maintenanceLogsTable.id,
      vehicleId: maintenanceLogsTable.vehicleId,
      serviceDate: maintenanceLogsTable.serviceDate,
      maintenanceStartedDate: maintenanceLogsTable.maintenanceStartedDate,
      maintenanceFinishedDate: maintenanceLogsTable.maintenanceFinishedDate,
      status: maintenanceLogsTable.status,
      description: maintenanceLogsTable.description,
      cost: maintenanceLogsTable.cost,
      nextMaintenanceDate: maintenanceLogsTable.nextServiceDue,
      notes: maintenanceLogsTable.notes,
      createdAt: maintenanceLogsTable.createdAt,
      vehicleName: vehiclesTable.name,
      vehicleRegNo: vehiclesTable.regNo,
      vehicleType: vehiclesTable.vehicleType,
      recordedByName: usersTable.displayName,
    })
    .from(maintenanceLogsTable)
    .innerJoin(vehiclesTable, eq(maintenanceLogsTable.vehicleId, vehiclesTable.id))
    .leftJoin(usersTable, eq(maintenanceLogsTable.recordedByUserId, usersTable.id))
    .orderBy(desc(maintenanceLogsTable.serviceDate));
  const filtered = (rows as any[]).filter((row) => {
    const started = String(row.maintenanceStartedDate || row.serviceDate || "").slice(0, 10);
    if (dateFrom && started < dateFrom) return false;
    if (dateTo && started > dateTo) return false;
    if (!vehicleSearch) return true;
    const haystack = `${row.vehicleRegNo || ""} ${row.vehicleName || ""} ${row.vehicleType || ""}`.toLowerCase();
    return haystack.includes(vehicleSearch);
  });
  return res.json(filtered);
});

router.post("/maintenance-logs", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const { vehicleId, serviceDate, maintenanceStartedDate, maintenanceFinishedDate, description, cost, nextMaintenanceDate, nextServiceDue, status, notes } = req.body as any;
  const started = maintenanceStartedDate || serviceDate;
  const finished = maintenanceFinishedDate || null;
  const maintenanceStatus = status || (finished ? "Maintenance completed" : "In maintenance");
  const [row] = await db.insert(maintenanceLogsTable).values({
    vehicleId,
    serviceDate: started,
    maintenanceStartedDate: started,
    maintenanceFinishedDate: finished,
    status: maintenanceStatus,
    description,
    cost: cost ? String(cost) : null,
    nextServiceDue: nextMaintenanceDate || nextServiceDue || null,
    notes: notes ?? null,
    recordedByUserId: userId,
  }).returning();
  const vehicleUpdates: any = {
    lastMaintenanceDate: finished || started,
    nextMaintenanceDate: nextMaintenanceDate || nextServiceDue || null,
  };
  if (maintenanceStatus === "In maintenance") vehicleUpdates.status = "maintenance";
  const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, Number(vehicleId))).limit(1);
  if (maintenanceStatus === "Maintenance completed" && vehicle?.status === "maintenance") vehicleUpdates.status = "available";
  await db.update(vehiclesTable).set(vehicleUpdates).where(eq(vehiclesTable.id, Number(vehicleId)));
  return res.status(201).json(row);
});
// ── Usage Logs ────────────────────────────────────────────────────────────────

router.get("/usage-logs", requireAuth, async (req, res) => {
  const rows = await db
    .select({
      id: vehicleUsageLogsTable.id,
      vehicleId: vehicleUsageLogsTable.vehicleId,
      usageDate: vehicleUsageLogsTable.usageDate,
      driverId: vehicleUsageLogsTable.driverId,
      hoursWorked: vehicleUsageLogsTable.hoursWorked,
      workType: vehicleUsageLogsTable.workType,
      fromLocationId: vehicleUsageLogsTable.fromLocationId,
      toLocationId: vehicleUsageLogsTable.toLocationId,
      notes: vehicleUsageLogsTable.notes,
      createdAt: vehicleUsageLogsTable.createdAt,
      vehicleName: vehiclesTable.name,
      vehicleRegNo: vehiclesTable.regNo,
      driverName: usersTable.displayName,
    })
    .from(vehicleUsageLogsTable)
    .innerJoin(vehiclesTable, eq(vehicleUsageLogsTable.vehicleId, vehiclesTable.id))
    .leftJoin(usersTable, eq(vehicleUsageLogsTable.driverId, usersTable.id))
    .orderBy(desc(vehicleUsageLogsTable.usageDate));
  return res.json(rows);
});

router.post("/usage-logs", requireAuth, async (req, res) => {
  const { vehicleId, usageDate, driverId, hoursWorked, workType, fromLocationId, toLocationId, notes } = req.body as any;
  const [row] = await db.insert(vehicleUsageLogsTable).values({
    vehicleId,
    usageDate,
    driverId: driverId ?? null,
    hoursWorked: hoursWorked ? String(hoursWorked) : null,
    workType,
    fromLocationId: fromLocationId ?? null,
    toLocationId: toLocationId ?? null,
    notes: notes ?? null,
  }).returning();
  return res.status(201).json(row);
});

export default router;













