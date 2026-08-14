import { mkdir } from "node:fs/promises";
import app from "./app";
import { logger } from "./lib/logger";
import {
  ootyHarvestInventoryPostingsTable,
  ootyCookoutInventoryPostingsTable,
  ootyGrowBagInventoryPostingsTable,
  annurDispatchInventoryPostingsTable,
  proformaInvoicesTable,
  moduleEncryptionSettingsTable,
  productModuleAccessTable,
  moduleUnlockGrantsTable,
  moduleEncryptionAttemptsTable,
  moduleEncryptionAuditTable,
  syncTableIndexes,
  syncTableCustomIndexes,
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

const defaultVaultItems = await ensureDefaultVaultItems();
logger.info(defaultVaultItems, "Default Vault items ready");

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
