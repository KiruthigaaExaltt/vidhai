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
  materialsTable,
  inventoryTable,
  inventoryAdjustmentsTable,
  inventoryLocationsTable,
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
const DIESEL_IDENTIFIER = "VLT-RM-DIESEL";
const validFuelQuantity = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && Math.round(number * 10_000) === number * 10_000
    ? number
    : null;
};

async function dieselInventory(executor: any = db) {
  const [material] = await executor
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.itemIdentifier, DIESEL_IDENTIFIER))
    .limit(1);
  if (!material) return null;
  const [annur] = await executor
    .select()
    .from(inventoryLocationsTable)
    .where(eq(inventoryLocationsTable.systemCode, "ANNUR"))
    .limit(1);
  if (!annur) return null;
  const [stock] = await executor
    .select()
    .from(inventoryTable)
    .where(and(eq(inventoryTable.materialId, material.id), eq(inventoryTable.locationId, annur.id)))
    .limit(1);
  return { material, location: annur, stock, availableLitres: Number(stock?.quantityOnHand ?? 0) };
}

async function issueDiesel(tx: any, vehicle: any, session: any, quantity: number, userId: number, requestId?: string) {
  if (quantity === 0) return null;
  if (requestId) {
    const duplicate = (await tx.select().from(fuelLogsTable)).find((row: any) => row.requestId === requestId);
    if (duplicate) return duplicate;
  }
  const diesel = await dieselInventory(tx);
  if (!diesel?.stock) throw Object.assign(new Error("Annur Diesel inventory is not initialized"), { status: 409 });
  if (diesel.availableLitres < quantity)
    throw Object.assign(new Error(`Only ${diesel.availableLitres} Litres of Diesel is available at Annur`), { status: 409 });
  const remaining = Math.round((diesel.availableLitres - quantity) * 10_000) / 10_000;
  await tx.update(inventoryTable).set({ quantityOnHand: String(remaining), lastUpdated: new Date() }).where(eq(inventoryTable.id, diesel.stock.id));
  const [adjustment] = await tx.insert(inventoryAdjustmentsTable).values({
    materialId: diesel.material.id,
    locationId: diesel.location.id,
    quantityDelta: String(-quantity),
    reason: "Vehicle fuel issue",
    reference: `FLEET-IN-USE-${session.id}`,
    notes: `Diesel issued to ${vehicle.name} (${vehicle.regNo})`,
    adjustedBy: userId,
  }).returning();
  const [fuel] = await tx.insert(fuelLogsTable).values({
    vehicleId: vehicle.id,
    statusHistoryId: session.id,
    inventoryAdjustmentId: adjustment.id,
    requestId: requestId || null,
    fuelDate: isoToday(),
    litres: String(quantity),
    notes: "Issued from Annur Diesel inventory",
    recordedByUserId: userId,
  }).returning();
  await tx.update(vehicleStatusHistoryTable).set({
    dieselIssuedLitres: String(Number(session.dieselIssuedLitres ?? 0) + quantity),
  }).where(eq(vehicleStatusHistoryTable.id, session.id));
  return fuel;
}
function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

router.get("/settings", requireAuth, async (_req, res) => {
  return res.json(await fleetSettings());
});

router.get("/diesel-inventory", requireAuth, async (_req, res) => {
  const diesel = await dieselInventory();
  if (!diesel) return res.status(404).json({ error: "Annur Diesel inventory is not initialized" });
  return res.json({
    materialId: diesel.material.id,
    name: diesel.material.name,
    sku: diesel.material.sku,
    unit: diesel.material.unit,
    locationId: diesel.location.id,
    locationName: diesel.location.locationName,
    availableLitres: diesel.availableLitres,
  });
});

router.patch("/settings", requireAuth, async (req, res) => {
  const serviceReminderDays = Number((req.body as any)?.serviceReminderDays);
  if (
    !Number.isInteger(serviceReminderDays) ||
    serviceReminderDays < 0 ||
    serviceReminderDays > 365
  ) {
    return res
      .status(400)
      .json({ error: "Reminder days must be a whole number from 0 to 365" });
  }
  const settings = await fleetSettings();
  const [updated] = await db.update(fleetSettingsTable).set({ serviceReminderDays, updatedAt: new Date() }).where(eq(fleetSettingsTable.id, settings.id)).returning();
  return res.json(updated || settings);
});
// ── Vehicles ──────────────────────────────────────────────────────────────────

router.get("/vehicles", requireAuth, async (req, res) => {
  const settings = await fleetSettings();
  const reminderDays = Number(settings.serviceReminderDays ?? 7);
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
      insuranceExpiryDate: vehiclesTable.insuranceExpiryDate,
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
    return {
      ...row,
      lastMaintenanceDate,
      nextMaintenanceDate,
      insuranceAlertStatus: maintenanceAlertStatus(
        row.insuranceExpiryDate,
        reminderDays,
      ),
      maintenanceAlertStatus: maintenanceAlertStatus(
        nextMaintenanceDate,
        reminderDays,
      ),
    };
  });
  return res.json(paginatedResponse(data, totalCount, pagination));
});

router.post("/vehicles", requireAuth, async (req, res) => {
  const { name, regNo, homeLocationId, vehicleType, notes, insuranceExpiryDate, lastMaintenanceDate, nextMaintenanceDate } = req.body as any;
  const [row] = await db.insert(vehiclesTable).values({
    name,
    regNo,
    homeLocationId: homeLocationId ?? null,
    vehicleType: vehicleType ?? "truck",
    notes: notes ?? null,
    insuranceExpiryDate: insuranceExpiryDate || null,
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
  const fuelQuantity = validFuelQuantity((req.body as any)?.fuelLitres);
  if (fuelQuantity === null) return res.status(400).json({ error: "Fuel must be a non-negative number with at most four decimal places" });
  if (nextStatus !== "in_use" && fuelQuantity > 0) return res.status(400).json({ error: "Fuel can only be issued to an In Use vehicle" });
  try {
    const result = await db.transaction(async (tx) => {
      const [currentVehicle] = await tx.select().from(vehiclesTable).where(eq(vehiclesTable.id, id)).limit(1);
      if (!currentVehicle) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
      const updated = await changeVehicleStatusWithExecutor(tx, currentVehicle, nextStatus, (req.session as any).userId, String((req.body as any)?.notes || ""));
      const session = nextStatus === "in_use" ? updated.session : null;
      const fuel = session ? await issueDiesel(tx, currentVehicle, session, fuelQuantity, Number((req.session as any).userId), String((req.body as any)?.requestId || "") || undefined) : null;
      return { vehicle: updated.vehicle, fuel };
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(Number(error?.status) || 400).json({ error: error?.message || "Vehicle status could not be changed" });
  }
});

async function changeVehicleStatusWithExecutor(tx: any, vehicle: any, nextStatus: string, userId?: number, notes?: string) {
  const now = new Date();
  const currentStatus = String(vehicle.status || "available");
  if (currentStatus === nextStatus) {
    const [session] = (await tx.select().from(vehicleStatusHistoryTable).where(eq(vehicleStatusHistoryTable.vehicleId, Number(vehicle.id))))
      .filter((row: any) => row.status === "in_use" && !row.endedAt)
      .sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return { vehicle, session };
  }
  const openLogs = await tx.select().from(vehicleStatusHistoryTable).where(eq(vehicleStatusHistoryTable.vehicleId, Number(vehicle.id)));
  const currentOpen = openLogs.filter((log: any) => !log.endedAt).sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  if (currentOpen) {
    const durationHours = Math.max(0, Math.round(((now.getTime() - new Date(currentOpen.startedAt).getTime()) / 3_600_000) * 100) / 100);
    await tx.update(vehicleStatusHistoryTable).set({ endedAt: now, durationHours: String(durationHours) }).where(eq(vehicleStatusHistoryTable.id, currentOpen.id));
  } else {
    await tx.insert(vehicleStatusHistoryTable).values({ vehicleId: vehicle.id, status: currentStatus, startedAt: vehicle.createdAt ? new Date(vehicle.createdAt) : now, endedAt: now, durationHours: "0", notes: "Backfilled during status change", changedByUserId: userId ?? null });
  }
  const [session] = await tx.insert(vehicleStatusHistoryTable).values({ vehicleId: vehicle.id, status: nextStatus, sourceStatus: currentStatus, startedAt: now, notes: notes || null, changedByUserId: userId ?? null }).returning();
  const [updated] = await tx.update(vehiclesTable).set({ status: nextStatus }).where(eq(vehiclesTable.id, vehicle.id)).returning();
  return { vehicle: updated, session };
}

router.post("/vehicles/:id/fuel", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const quantity = validFuelQuantity((req.body as any)?.fuelLitres);
  if (quantity === null || quantity <= 0) return res.status(400).json({ error: "Fuel must be greater than zero and use at most four decimal places" });
  try {
    const fuel = await db.transaction(async (tx) => {
      const [vehicle] = await tx.select().from(vehiclesTable).where(eq(vehiclesTable.id, id)).limit(1);
      if (!vehicle) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
      if (vehicle.status !== "in_use") throw Object.assign(new Error("Fuel can only be added while the vehicle is In Use"), { status: 409 });
      const sessions = await tx.select().from(vehicleStatusHistoryTable).where(eq(vehicleStatusHistoryTable.vehicleId, id));
      const session = sessions.filter((row: any) => row.status === "in_use" && !row.endedAt).sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
      if (!session) throw Object.assign(new Error("The current In Use session was not found"), { status: 409 });
      return issueDiesel(tx, vehicle, session, quantity, Number((req.session as any).userId), String((req.body as any)?.requestId || "") || undefined);
    });
    return res.status(201).json(fuel);
  } catch (error: any) {
    return res.status(Number(error?.status) || 400).json({ error: error?.message || "Fuel could not be issued" });
  }
});
router.patch("/vehicles/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, regNo, vehicleType, homeLocationId, notes, insuranceExpiryDate, lastMaintenanceDate, nextMaintenanceDate } = req.body as any;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (regNo !== undefined) updates.regNo = regNo;
  if (vehicleType !== undefined) updates.vehicleType = vehicleType;
  if (homeLocationId !== undefined) updates.homeLocationId = homeLocationId;
  if (notes !== undefined) updates.notes = notes;
  if (insuranceExpiryDate !== undefined) updates.insuranceExpiryDate = insuranceExpiryDate || null;
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
      sourceStatus: vehicleStatusHistoryTable.sourceStatus,
      dieselIssuedLitres: vehicleStatusHistoryTable.dieselIssuedLitres,
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
  const quantity = validFuelQuantity(litres);
  if (quantity === null || quantity <= 0) return res.status(400).json({ error: "Fuel must be greater than zero and use at most four decimal places" });
  const totalCost = litres && costPerLitre ? (Number(litres) * Number(costPerLitre)).toFixed(2) : null;
  const distanceKm = startKm != null && endKm != null ? String(Number(endKm) - Number(startKm)) : null;
  try {
    const row = await db.transaction(async (tx) => {
      const [vehicle] = await tx.select().from(vehiclesTable).where(eq(vehiclesTable.id, Number(vehicleId))).limit(1);
      if (!vehicle) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
      if (vehicle.status !== "in_use") throw Object.assign(new Error("Fuel can only be added while the vehicle is In Use"), { status: 409 });
      const sessions = await tx.select().from(vehicleStatusHistoryTable).where(eq(vehicleStatusHistoryTable.vehicleId, vehicle.id));
      const session = sessions.filter((item: any) => item.status === "in_use" && !item.endedAt).sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
      if (!session) throw Object.assign(new Error("The current In Use session was not found"), { status: 409 });
      const issued = await issueDiesel(tx, vehicle, session, quantity, Number(userId), String((req.body as any)?.requestId || "") || undefined);
      const [updated] = await tx.update(fuelLogsTable).set({ fuelDate: fuelDate || isoToday(), costPerLitre: costPerLitre ? String(costPerLitre) : null, totalCost, odometer: odometer ? String(odometer) : null, startKm: startKm != null ? String(startKm) : null, endKm: endKm != null ? String(endKm) : null, distanceKm, notes: notes ?? issued.notes }).where(eq(fuelLogsTable.id, issued.id)).returning();
      return updated;
    });
    return res.status(201).json(row);
  } catch (error: any) {
    return res.status(Number(error?.status) || 400).json({ error: error?.message || "Fuel could not be issued" });
  }
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













