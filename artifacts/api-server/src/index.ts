import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import app, { sessionMiddleware } from "./app";
import { initializeNotificationGateway } from "./lib/notificationGateway";
import { startChamberReminderScheduler } from "./lib/chamberReminderScheduler";
import { logger } from "./lib/logger";
import {
  ootyHarvestInventoryPostingsTable,
  ootyCookoutInventoryPostingsTable,
  ootyGrowBagInventoryPostingsTable,
  annurDispatchInventoryPostingsTable,
  proformaInvoicesTable,
  notificationsTable,
  chambersTable,
  chamberReadingsTable,
  pushSubscriptionsTable,
  db,
  eq,
  syncTableIndexes,
} from "@workspace/db";
import { migratePermissionData } from "./lib/migratePermissions";
import { getUploadRoot } from "./lib/uploadStorage";
import { ensureDefaultVaultItems } from "./lib/ensureDefaultVaultItems";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Proforma revisions share their root PI number. Synchronize this collection
// so deployments created with the former unique piNumber index can save V2+.
await syncTableIndexes(proformaInvoicesTable);
await syncTableIndexes(ootyHarvestInventoryPostingsTable);
await syncTableIndexes(ootyCookoutInventoryPostingsTable);
await syncTableIndexes(ootyGrowBagInventoryPostingsTable);
await syncTableIndexes(annurDispatchInventoryPostingsTable);
const legacyChambers = (await db.select().from(chambersTable)) as any[];
for (const chamber of legacyChambers) {
  if (chamber.organizationId != null) continue;
  await db
    .update(chambersTable)
    .set({ organizationId: 1 })
    .where(eq(chambersTable.id, chamber.id));
}
const chamberOrganizations = new Map(
  legacyChambers.map((chamber) => [
    Number(chamber.id),
    Number(chamber.organizationId ?? 1),
  ]),
);
for (const reading of (await db.select().from(chamberReadingsTable)) as any[]) {
  if (reading.organizationId != null) continue;
  await db
    .update(chamberReadingsTable)
    .set({
      organizationId: chamberOrganizations.get(Number(reading.chamberId)) ?? 1,
    })
    .where(eq(chamberReadingsTable.id, reading.id));
}
const legacyNotifications = await db.select().from(notificationsTable);
for (const legacy of legacyNotifications as any[]) {
  if (legacy.recipientUserId != null && legacy.eventRecipientKey) continue;
  await db
    .update(notificationsTable)
    .set({
      recipientUserId: 0,
      permissionKey: legacy.permissionKey || "legacy.notification",
      eventRecipientKey: legacy.eventRecipientKey || `legacy:${legacy.id}`,
    })
    .where(eq(notificationsTable.id, legacy.id));
}
await syncTableIndexes(notificationsTable);
await syncTableIndexes(pushSubscriptionsTable);
const uploadRoot = getUploadRoot();
await mkdir(uploadRoot, { recursive: true });
logger.info({ uploadRoot }, "Upload storage ready");

const permissionMigration = await migratePermissionData();
logger.info(permissionMigration, "RBAC permission migration complete");

const defaultVaultItems = await ensureDefaultVaultItems();
logger.info(defaultVaultItems, "Default Vault items ready");

const server = createServer(app);
initializeNotificationGateway(server, sessionMiddleware);
startChamberReminderScheduler();
server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
