import { chambersTable, db, eq } from "@workspace/db";
import { publishNotification } from "./notificationService";
import { logger } from "./logger";

function hourStart(date = new Date()) {
  const value = new Date(date);
  value.setMinutes(0, 0, 0);
  return value;
}
async function run() {
  try {
    const interval = hourStart();
    const chambers = await db
      .select()
      .from(chambersTable)
      .where(eq(chambersTable.status, "active"));
    for (const chamber of chambers as any[]) {
      if (String(chamber.chamberType).toLowerCase() !== "bulk") continue;
      if (chamber.lastReadingAt && new Date(chamber.lastReadingAt) >= interval)
        continue;
      const hour = interval.toISOString();
      await publishNotification({
        organizationId: Number(chamber.organizationId ?? 1),
        permissionKey: "production.chambers.notification",
        eventType: "CHAMBER_HOURLY_READING_DUE",
        eventKey: `chamber:${chamber.id}:reading-due:${hour}`,
        sourceModule: "production",
        targetModule: "production",
        submodule: "chambers",
        title: "Bulk chamber reading due",
        message: `Bulk Chamber ${chamber.name} reading is due for the ${interval.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} interval.`,
        sourceEntityType: "chamber",
        sourceEntityId: chamber.id,
        sourceReference: chamber.name,
        navigationUrl: "/annur/chambers",
        metadata: { expectedLogTime: hour },
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Chamber reminder scan failed");
  }
}
export function startChamberReminderScheduler() {
  void run();
  const timer = setInterval(() => void run(), 60_000);
  timer.unref();
  logger.info("Idempotent chamber reminder scheduler ready");
}
