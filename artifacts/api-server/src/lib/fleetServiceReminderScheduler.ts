import { db, desc, eq, fleetSettingsTable, maintenanceLogsTable, vehiclesTable } from "@workspace/db";
import { publishNotification } from "./notificationService";
import { logger } from "./logger";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const dayMs = 86_400_000;
function daysUntil(date: string) {
  const start = new Date(`${today()}T00:00:00.000Z`).getTime();
  const due = new Date(`${String(date).slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.ceil((due - start) / dayMs);
}
async function reminderDays() {
  const [settings] = await db.select().from(fleetSettingsTable).where(eq(fleetSettingsTable.organizationId, 1)).limit(1);
  if (settings) return Number(settings.serviceReminderDays || 7);
  const [created] = await db.insert(fleetSettingsTable).values({ organizationId: 1, serviceReminderDays: 7 }).returning();
  return Number(created.serviceReminderDays || 7);
}
async function latestMaintenanceByVehicle() {
  const logs = await db.select().from(maintenanceLogsTable).orderBy(desc(maintenanceLogsTable.serviceDate));
  const map = new Map<number, any>();
  for (const log of logs as any[]) {
    const id = Number(log.vehicleId);
    const current = map.get(id);
    if (!current) map.set(id, log);
    else if (log.nextServiceDue && (!current.nextServiceDue || String(log.nextServiceDue) > String(current.nextServiceDue)))
      map.set(id, { ...current, nextServiceDue: log.nextServiceDue });
  }
  return map;
}async function run() {
  try {
    const days = await reminderDays();
    const vehicles = await db.select().from(vehiclesTable);
    const maintenance = await latestMaintenanceByVehicle();
    const todayKey = today();
    for (const vehicle of vehicles as any[]) {
      if (["retired"].includes(String(vehicle.status || "").toLowerCase())) continue;
      const latest = maintenance.get(Number(vehicle.id));
      const nextMaintenanceDate = vehicle.nextMaintenanceDate || latest?.nextServiceDue;
      if (!nextMaintenanceDate) continue;
      const remaining = daysUntil(nextMaintenanceDate);
      if (remaining > days) continue;
      const overdue = remaining < 0;
      await publishNotification({
        organizationId: Number(vehicle.organizationId ?? 1),
        permissionKey: "fleet.vehicles.notification",
        eventType: overdue ? "FLEET_MAINTENANCE_OVERDUE" : "FLEET_MAINTENANCE_DUE_SOON",
        eventKey: `fleet-maintenance:${vehicle.id}:${nextMaintenanceDate}:${todayKey}`,
        sourceModule: "fleet",
        targetModule: "fleet",
        submodule: "vehicles",
        title: overdue ? "Vehicle maintenance overdue" : "Vehicle maintenance due soon",
        message: overdue
          ? `${vehicle.name} (${vehicle.regNo}) maintenance was due on ${nextMaintenanceDate}.`
          : `${vehicle.name} (${vehicle.regNo}) maintenance is due on ${nextMaintenanceDate}.`,
        sourceEntityType: "vehicle",
        sourceEntityId: vehicle.id,
        sourceReference: vehicle.regNo,
        navigationUrl: "/fleet",
        metadata: { nextMaintenanceDate, remainingDays: remaining },
        priority: overdue ? "HIGH" : "NORMAL",
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Fleet maintenance reminder scan failed");
  }
}
export function startFleetServiceReminderScheduler() {
  void run();
  const timer = setInterval(() => void run(), 60 * 60 * 1000);
  timer.unref();
  logger.info("Fleet maintenance reminder scheduler ready");
}
