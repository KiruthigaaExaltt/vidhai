import { mkdir } from "node:fs/promises";
import app from "./app";
import { logger } from "./lib/logger";
import { proformaInvoicesTable, syncTableIndexes } from "@workspace/db";
import { migratePermissionData } from "./lib/migratePermissions";
import { getUploadRoot } from "./lib/uploadStorage";

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
const uploadRoot = getUploadRoot();
await mkdir(uploadRoot, { recursive: true });
logger.info({ uploadRoot }, "Upload storage ready");

const permissionMigration = await migratePermissionData();
logger.info(permissionMigration, "RBAC permission migration complete");

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
