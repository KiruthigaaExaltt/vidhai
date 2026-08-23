import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import {
  assetsTable,
  coimbatorePreparationStagesTable,
  coimbatoreTurnsTable,
  connectMongo,
  db,
  eq,
  materialsTable,
  ootyStageLogsTable,
  stageLogsTable,
  usersTable,
} from "@workspace/db";

const apiDirectory = path.resolve(
  import.meta.dirname,
  "../../artifacts/api-server",
);
const suppliedRoot = String(process.env.UPLOAD_ROOT || "").trim();
if (process.env.NODE_ENV === "production" && !suppliedRoot)
  throw new Error("UPLOAD_ROOT is required when NODE_ENV=production");
const configuredRoot = suppliedRoot || "./uploads";
if (!configuredRoot) throw new Error("UPLOAD_ROOT must not be empty");
const uploadRoot = path.normalize(
  path.isAbsolute(configuredRoot)
    ? configuredRoot
    : path.resolve(apiDirectory, configuredRoot),
);

const folders = {
  avatars: ["users", "avatars"],
  "ooty-verification": ["production", "ooty", "stage-verification"],
  "coimbatore-verification": ["production", "coimbatore", "stage-verification"],
  "legacy-production-verification": [
    "production",
    "legacy",
    "stage-verification",
  ],
  "material-images": ["inventory", "materials"],
  "asset-images": ["inventory", "assets"],
} as const;
type Area = keyof typeof folders;

async function saveImage(value: string, area: Area) {
  const match = value.match(
    /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\r\n]+)$/s,
  );
  if (!match) throw new Error("Unsupported Base64 image");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length) throw new Error("Empty Base64 image");
  const extension =
    match[1] === "png" ? "png" : match[1] === "webp" ? "webp" : "jpg";
  const directory = path.resolve(uploadRoot, ...folders[area]);
  if (!directory.startsWith(`${uploadRoot}${path.sep}`))
    throw new Error("Migration path escapes UPLOAD_ROOT");
  await mkdir(directory, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
  const fullPath = path.join(directory, fileName);
  await writeFile(fullPath, buffer);
  return {
    fullPath,
    url: `/api/stored-files/${area}/${fileName}`,
  };
}

let migrated = 0;
let unchanged = 0;
const failures: string[] = [];

async function migrateSingle(table: any, field: string, area: Area) {
  const rows = await db.select().from(table);
  for (const row of rows) {
    const value = String(row[field] || "");
    if (!value.startsWith("data:image/")) {
      unchanged++;
      continue;
    }
    let stored: Awaited<ReturnType<typeof saveImage>> | null = null;
    try {
      stored = await saveImage(value, area);
      await db
        .update(table)
        .set({ [field]: stored.url })
        .where(eq(table.id, row.id));
      migrated++;
    } catch (error: any) {
      if (stored) await unlink(stored.fullPath).catch(() => {});
      failures.push(`${table.$name || "table"}#${row.id}: ${error.message}`);
    }
  }
}

async function migrateArrays(table: any, area: Area) {
  const rows = await db.select().from(table);
  for (const row of rows) {
    let values: unknown;
    try {
      values =
        typeof row.verificationImages === "string"
          ? JSON.parse(row.verificationImages)
          : row.verificationImages;
    } catch {
      failures.push(
        `${table.$name || "table"}#${row.id}: invalid verification image JSON`,
      );
      continue;
    }
    if (
      !Array.isArray(values) ||
      !values.some((value) => String(value).startsWith("data:image/"))
    ) {
      unchanged++;
      continue;
    }
    const storedFiles: string[] = [];
    try {
      const migratedValues = [];
      for (const value of values) {
        if (typeof value === "string" && value.startsWith("data:image/")) {
          const stored = await saveImage(value, area);
          storedFiles.push(stored.fullPath);
          migratedValues.push(stored.url);
        } else {
          migratedValues.push(value);
        }
      }
      await db
        .update(table)
        .set({ verificationImages: JSON.stringify(migratedValues) })
        .where(eq(table.id, row.id));
      migrated++;
    } catch (error: any) {
      await Promise.all(
        storedFiles.map((file) => unlink(file).catch(() => {})),
      );
      failures.push(`${table.$name || "table"}#${row.id}: ${error.message}`);
    }
  }
}

await connectMongo();
await mkdir(uploadRoot, { recursive: true });
await migrateSingle(usersTable, "avatarUrl", "avatars");
await migrateSingle(materialsTable, "imageUrl", "material-images");
await migrateSingle(assetsTable, "imageUrl", "asset-images");
await migrateArrays(ootyStageLogsTable, "ooty-verification");
await migrateArrays(
  coimbatorePreparationStagesTable,
  "coimbatore-verification",
);
await migrateArrays(coimbatoreTurnsTable, "coimbatore-verification");
await migrateArrays(stageLogsTable, "legacy-production-verification");

console.log(
  JSON.stringify({ uploadRoot, migrated, unchanged, failures }, null, 2),
);
if (failures.length) process.exitCode = 1;
