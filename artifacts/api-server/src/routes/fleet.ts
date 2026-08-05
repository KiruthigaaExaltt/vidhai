import { Router } from "express";
import { db } from "@workspace/db";
import {
  vehiclesTable,
  fuelLogsTable,
  maintenanceLogsTable,
  vehicleUsageLogsTable,
  locationsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc } from "@workspace/db";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

// ── Vehicles ──────────────────────────────────────────────────────────────────

router.get("/vehicles", requireAuth, async (req, res) => {
  const rows = await db
    .select({
      id: vehiclesTable.id,
      name: vehiclesTable.name,
      regNo: vehiclesTable.regNo,
      homeLocationId: vehiclesTable.homeLocationId,
      vehicleType: vehiclesTable.vehicleType,
      status: vehiclesTable.status,
      notes: vehiclesTable.notes,
      createdAt: vehiclesTable.createdAt,
      homeLocationCode: locationsTable.code,
      homeLocationName: locationsTable.name,
    })
    .from(vehiclesTable)
    .leftJoin(locationsTable, eq(vehiclesTable.homeLocationId, locationsTable.id))
    .orderBy(vehiclesTable.name);
  return res.json(rows);
});

router.post("/vehicles", requireAuth, async (req, res) => {
  const { name, regNo, homeLocationId, vehicleType, notes } = req.body as any;
  const [row] = await db.insert(vehiclesTable).values({
    name,
    regNo,
    homeLocationId: homeLocationId ?? null,
    vehicleType: vehicleType ?? "truck",
    notes: notes ?? null,
  }).returning();
  return res.status(201).json(row);
});

router.patch("/vehicles/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, regNo, status, vehicleType, homeLocationId, notes } = req.body as any;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (regNo !== undefined) updates.regNo = regNo;
  if (status !== undefined) updates.status = status;
  if (vehicleType !== undefined) updates.vehicleType = vehicleType;
  if (homeLocationId !== undefined) updates.homeLocationId = homeLocationId;
  if (notes !== undefined) updates.notes = notes;
  const [row] = await db.update(vehiclesTable).set(updates).where(eq(vehiclesTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

// ── Fuel Logs ─────────────────────────────────────────────────────────────────

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
  const rows = await db
    .select({
      id: maintenanceLogsTable.id,
      vehicleId: maintenanceLogsTable.vehicleId,
      serviceDate: maintenanceLogsTable.serviceDate,
      description: maintenanceLogsTable.description,
      cost: maintenanceLogsTable.cost,
      nextServiceDue: maintenanceLogsTable.nextServiceDue,
      notes: maintenanceLogsTable.notes,
      createdAt: maintenanceLogsTable.createdAt,
      vehicleName: vehiclesTable.name,
      vehicleRegNo: vehiclesTable.regNo,
      recordedByName: usersTable.displayName,
    })
    .from(maintenanceLogsTable)
    .innerJoin(vehiclesTable, eq(maintenanceLogsTable.vehicleId, vehiclesTable.id))
    .leftJoin(usersTable, eq(maintenanceLogsTable.recordedByUserId, usersTable.id))
    .orderBy(desc(maintenanceLogsTable.serviceDate));
  return res.json(rows);
});

router.post("/maintenance-logs", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const { vehicleId, serviceDate, description, cost, nextServiceDue, notes } = req.body as any;
  const [row] = await db.insert(maintenanceLogsTable).values({
    vehicleId,
    serviceDate,
    description,
    cost: cost ? String(cost) : null,
    nextServiceDue: nextServiceDue ?? null,
    notes: notes ?? null,
    recordedByUserId: userId,
  }).returning();
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
