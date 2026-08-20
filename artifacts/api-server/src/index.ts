import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import app, { sessionMiddleware } from "./app";
import { initializeNotificationGateway } from "./lib/notificationGateway";
import { startChamberReminderScheduler } from "./lib/chamberReminderScheduler";
import {
  startNotificationWorker,
  stopNotificationWorker,
} from "./lib/notificationWorker";
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
  moduleEncryptionSettingsTable,
  productModuleAccessTable,
  moduleUnlockGrantsTable,
  moduleEncryptionAttemptsTable,
  moduleEncryptionAuditTable,
  syncTableIndexes,
  syncTableCustomIndexes,
  notificationOutboxTable,
  refreshSessionsTable,
  inventoryCategoriesTable,
  spawnEntriesTable,
  spawnVaultTransactionsTable,
  annurSpawnUsagesTable,
  coimbatoreTurnAssignmentsTable,
  casingSoilInventoryPostingsTable,
  materialsTable,
} from "@workspace/db";
import { migratePermissionData } from "./lib/migratePermissions";
import { getUploadRoot } from "./lib/uploadStorage";
import { ensureDefaultVaultItems } from "./lib/ensureDefaultVaultItems";
import { ensureDefaultCoimbatoreCasingChambers } from "./lib/ensureDefaultCoimbatoreCasingChambers";

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
await syncTableIndexes(spawnEntriesTable);
await syncTableIndexes(spawnVaultTransactionsTable);
await syncTableIndexes(annurSpawnUsagesTable);
await syncTableIndexes(casingSoilInventoryPostingsTable);
await syncTableCustomIndexes(coimbatoreTurnAssignmentsTable, [
  { key: { batchId: 1, turnNumber: 1 }, name: "coimbatore_batch_turn_assignment", unique: true },
  { key: { chamberId: 1, releasedAt: 1 }, name: "coimbatore_active_chamber_assignment" },
]);
await syncTableCustomIndexes(chambersTable, [
  {
    key: {
      organizationId: 1,
      locationId: 1,
      chamberType: 1,
      status: 1,
      currentBatchId: 1,
    },
    name: "chamber_availability",
  },
]);
await syncTableCustomIndexes(spawnEntriesTable, [
  {
    key: { status: 1, sourceType: 1, quantityKg: 1 },
    name: "spawn_vault_available",
  },
  {
    key: { sourceReferenceType: 1, sourceReferenceId: 1 },
    name: "spawn_vault_source",
  },
]);
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
await syncTableIndexes(notificationOutboxTable);
await syncTableCustomIndexes(refreshSessionsTable, [
  { key: { tokenHash: 1 }, name: "refresh_token_hash_unique", unique: true },
  { key: { userId: 1, revokedAt: 1 }, name: "refresh_user_revocation" },
  { key: { expiresAt: 1 }, name: "refresh_expiry_ttl", expireAfterSeconds: 0 },
]);
await syncTableCustomIndexes(notificationsTable, [
  {
    key: { organizationId: 1, recipientUserId: 1, isRead: 1, createdAt: -1 },
    name: "notification_inbox",
  },
]);
await syncTableCustomIndexes(notificationOutboxTable, [
  {
    key: { status: 1, nextAttemptAt: 1, priorityRank: 1, createdAt: 1 },
    name: "notification_queue_claim",
  },
]);
await syncTableCustomIndexes(productModuleAccessTable, [
  {
    key: { organizationId: 1, moduleKey: 1 },
    name: "product_module_access_org_module_unique",
    unique: true,
  },
]);
await syncTableCustomIndexes(moduleEncryptionSettingsTable, [
  {
    key: { organizationId: 1, moduleKey: 1 },
    name: "module_encryption_org_module_unique",
    unique: true,
  },
]);
await syncTableCustomIndexes(moduleUnlockGrantsTable, [
  {
    key: {
      organizationId: 1,
      userId: 1,
      authenticationSessionId: 1,
      moduleKey: 1,
    },
    name: "module_unlock_identity_unique",
    unique: true,
  },
  {
    key: { absoluteExpiresAt: 1 },
    name: "module_unlock_absolute_ttl",
    expireAfterSeconds: 0,
  },
  {
    key: { organizationId: 1, moduleKey: 1, revokedAt: 1 },
    name: "module_unlock_revocation_lookup",
  },
]);
await syncTableCustomIndexes(moduleEncryptionAttemptsTable, [
  {
    key: {
      organizationId: 1,
      userId: 1,
      authenticationSessionId: 1,
      moduleKey: 1,
      ipHash: 1,
    },
    name: "module_encryption_attempt_identity_unique",
    unique: true,
  },
]);
await syncTableCustomIndexes(moduleEncryptionAuditTable, [
  {
    key: { organizationId: 1, moduleKey: 1, createdAt: -1 },
    name: "module_encryption_audit_lookup",
  },
]);
const uploadRoot = getUploadRoot();
await mkdir(uploadRoot, { recursive: true });
logger.info({ uploadRoot }, "Upload storage ready");

const permissionMigration = await migratePermissionData();
logger.info(permissionMigration, "RBAC permission migration complete");

const defaultCoimbatoreChambers = await ensureDefaultCoimbatoreCasingChambers();
logger.info(defaultCoimbatoreChambers, "Default Coimbatore casing-soil chambers ready");

const defaultVaultItems = await ensureDefaultVaultItems();
let [spawnCategory] = await db
  .select()
  .from(inventoryCategoriesTable)
  .where(eq(inventoryCategoriesTable.categoryCode, "SPAWN"))
  .limit(1);
if (!spawnCategory) {
  [spawnCategory] = await db
    .insert(inventoryCategoriesTable)
    .values({
      name: "Spawn",
      categoryCode: "SPAWN",
      sortOrder: 30,
      divisions: ["Production"],
      isActive: true,
    })
    .returning();
}
for (const material of await db.select().from(materialsTable)) {
  const alreadyStructured =
    String(material.category || "")
      .trim()
      .toUpperCase() === "SPAWN" ||
    String(material.itemType || "")
      .trim()
      .toUpperCase() === "SPAWN";
  if (alreadyStructured && material.categoryId !== spawnCategory.id)
    await db
      .update(materialsTable)
      .set({
        categoryId: spawnCategory.id,
        category: "spawn",
        itemType: "Spawn",
      })
      .where(eq(materialsTable.id, material.id));
}
logger.info(defaultVaultItems, "Default Vault items ready");

const server = createServer(app);
initializeNotificationGateway(server, sessionMiddleware);
startNotificationWorker();
startChamberReminderScheduler();
server.listen(port, () => {
  logger.info({ port }, "Server listening");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    logger.info({ signal }, "Graceful shutdown started");
    await stopNotificationWorker();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
