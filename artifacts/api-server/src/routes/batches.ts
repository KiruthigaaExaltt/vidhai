import { Router } from "express";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  db,
  batchesTable,
  locationsTable,
  usersTable,
  batchMaterialsTable,
  stageLogsTable,
  materialsTable,
  chambersTable,
  inventoryTable,
  inventoryLocationsTable,
  inventoryAdjustmentsTable,
  labSpawnOutputTable,
  annurDispatchInventoryPostingsTable,
  spawnEntriesTable,
  spawnVaultTransactionsTable,
  annurSpawnUsagesTable,
  chamberReadingsTable,
} from "@workspace/db";
import { eq, and, desc, ilike, gte } from "@workspace/db";
import { paginateQuery, paginatedResponse } from "../lib/pagination";
import {
  annurDispatchPostingKey,
  isAvailableChamber,
  validateProducedBags,
} from "../lib/annurProduction";
import { resolveUploadPath } from "../lib/uploadStorage";
import { chronologyError, resolveProductionDateTime } from "../lib/productionDateTime";
import { consumeAnnurBatchMaterials, consumeAnnurMaterialIncreases } from "../lib/annurInventoryConsumption";

const router = Router();
const ANNUR_STAGES = [
  "PRE_WETTING",
  "T1",
  "T2",
  "T3",
  "T4",
  "BULK_CHAMBER",
  "QUALITY_CHECK",
  "SPAWN_MIXING",
  "DISPATCH",
  "COMPLETED",
];
const REQUIRED_CHAMBER_TYPE: Record<string, string> = {
  T1: "bunker_1",
  T2: "bunker_2",
  T3: "bunker_3",
  T4: "bunker_4",
  BULK_CHAMBER: "bulk",
};

const ANNUR_VERIFICATION_FOLDER = [
  "production",
  "annur",
  "stage-verification",
] as const;

async function saveAnnurVerificationImage(value: unknown): Promise<string> {
  if (typeof value !== "string")
    throw new Error("Verification photo is invalid");
  if (value.startsWith("/api/batches/files/verification/")) return value;
  const match = value.match(
    /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\r\n]+)$/s,
  );
  if (!match) throw new Error("Verification photo must be JPG, PNG or WEBP");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length) throw new Error("Verification photo data is malformed");
  if (buffer.length > 5 * 1024 * 1024)
    throw new Error("Each verification photo must not exceed 5 MB");
  const extension =
    match[1] === "png" ? "png" : match[1] === "webp" ? "webp" : "jpg";
  const directory = resolveUploadPath(...ANNUR_VERIFICATION_FOLDER);
  await mkdir(directory, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
  await writeFile(path.join(directory, fileName), buffer);
  return `/api/batches/files/verification/${fileName}`;
}

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId)
    return res.status(401).json({ error: "Not authenticated" });
  next();
}

function formatBatch(b: any, locationCode: string, createdByName: string) {
  const codeDate = String(b.batchCode).match(/^[^-]+-(\d{2})(\d{2})(\d{2})-/);
  const fallbackStartedAt = codeDate
    ? `20${codeDate[1]}-${codeDate[2]}-${codeDate[3]}`
    : b.createdAt;
  return {
    id: b.id,
    batchCode: b.batchCode,
    locationId: b.locationId,
    locationCode,
    currentStage: b.currentStage,
    status: b.status,
    nitrogenContent:
      b.nitrogenContent != null ? Number(b.nitrogenContent) : null,
    targetBags: b.targetBags,
    actualBags: b.actualBags,
    preWettingChamberId: b.preWettingChamberId,
    turnChamberId: b.turnChamberId,
    currentChamberId: b.currentChamberId,
    bulkChamberId: b.bulkChamberId,
    spawnEntryId: b.spawnEntryId,
    spawnBatchRef: b.spawnBatchRef,
    spawnBatchType: b.spawnBatchType,
    dispatchLocationId: b.dispatchLocationId,
    notes: b.notes,
    createdAt: b.createdAt,
    createdByName,
    stageEnteredAt: b.stageEnteredAt,
    startedAt: b.initializedAt ?? fallbackStartedAt,
    completedAt: b.status === "dispatched" ? b.stageEnteredAt : null,
    alertLevel: b.alertLevel,
  };
}

// ── Batch list ────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { locationId, stage, status, search, from, to } = req.query as Record<
    string,
    string | undefined
  >;

  const rows = await db
    .select({
      batch: batchesTable,
      locationCode: locationsTable.code,
      createdByName: usersTable.displayName,
    })
    .from(batchesTable)
    .innerJoin(locationsTable, eq(batchesTable.locationId, locationsTable.id))
    .leftJoin(usersTable, eq(batchesTable.createdByUserId, usersTable.id))
    .orderBy(desc(batchesTable.createdAt));

  let filtered = rows;
  if (locationId)
    filtered = filtered.filter(
      (r) => String(r.batch.locationId) === locationId,
    );
  if (stage) filtered = filtered.filter((r) => r.batch.currentStage === stage);
  if (status) filtered = filtered.filter((r) => r.batch.status === status);
  if (search)
    filtered = filtered.filter((r) =>
      String(r.batch.batchCode).toLowerCase().includes(search.toLowerCase()),
    );
  if (from)
    filtered = filtered.filter(
      (r) => new Date(r.batch.createdAt) >= new Date(from),
    );
  if (to)
    filtered = filtered.filter(
      (r) => new Date(r.batch.createdAt) <= new Date(`${to}T23:59:59.999`),
    );
  const formatted = filtered.map((r) =>
    formatBatch(r.batch, r.locationCode, r.createdByName ?? "System"),
  );
  // Keep the unpaginated contract for small lookup consumers that do not request paging.
  if (req.query.skip === undefined && req.query.limit === undefined)
    return res.json(formatted);
  const pagination = paginateQuery(req.query);
  return res.json(
    paginatedResponse(
      formatted.slice(pagination.skip, pagination.skip + pagination.limit),
      formatted.length,
      pagination,
    ),
  );
});

// ── Create batch ──────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { locationId, preWettingChamberId, targetBags, notes, formulation } =
    req.body as {
      locationId: number;
      preWettingChamberId: number;
      targetBags?: number | null;
      notes?: string | null;
      batchDate?: string;
      formulation?: Array<{
        materialId?: number;
        name: string;
        wetWeightKg: number;
        moisturePercent: number;
        nitrogenPercent: number;
      }>;
    };
  const userId = (req.session as any)?.userId ?? null;

  if (!Array.isArray(formulation) || formulation.length === 0) {
    return res.status(400).json({ error: "Initial formulation is required" });
  }
  const [loc] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, locationId))
    .limit(1);
  if (!loc) return res.status(400).json({ error: "Location not found" });
  const [preWettingChamber] = await db
    .select()
    .from(chambersTable)
    .where(eq(chambersTable.id, Number(preWettingChamberId)))
    .limit(1);
  if (
    !preWettingChamber ||
    preWettingChamber.chamberType !== "pre_wetting" ||
    preWettingChamber.locationId !== locationId
  )
    return res.status(400).json({
      error: "Select a valid Pre-Wetting chamber for the Annur location",
    });
  if (
    preWettingChamber.status !== "idle" ||
    preWettingChamber.currentBatchId != null
  )
    return res.status(409).json({
      error: "The selected Pre-Wetting chamber is no longer available",
    });

  const selectedDate = String((req.body as any).batchDate || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate))
    return res.status(400).json({ error: "Batch date is required" });
  const stageStartedAt = resolveProductionDateTime((req.body as any).batchStartedAt);
  if (!stageStartedAt)
    return res.status(400).json({ error: "Batch initialization date and time is invalid" });
  if (Number.isNaN(stageStartedAt.getTime()))
    return res.status(400).json({ error: "Invalid batch date" });
  const [year, month, day] = selectedDate.split("-");
  const yy = year.slice(-2);
  const mm = month;
  const dd = day;
  const codePrefix = `${loc.code}-${yy}${mm}${dd}-`;
  const existingBatches = await db.select().from(batchesTable);
  const highestSequence = existingBatches.reduce((highest, existingBatch) => {
    const existingCode = String(existingBatch.batchCode ?? "");
    if (!existingCode.startsWith(codePrefix)) return highest;
    const sequence = Number(existingCode.slice(codePrefix.length));
    return Number.isInteger(sequence) && sequence > highest
      ? sequence
      : highest;
  }, 0);
  const seq = String(highestSequence + 1).padStart(3, "0");
  const batchCode = `${codePrefix}${seq}`;

  try {
    const batch = await db.transaction(async (tx) => {
      const [createdBatch] = await tx
        .insert(batchesTable)
        .values({
          batchCode,
          locationId,
          currentStage: "PRE_WETTING",
          status: "active",
          targetBags: targetBags ?? null,
          preWettingChamberId: preWettingChamber.id,
          currentChamberId: preWettingChamber.id,
          notes: notes ?? null,
          createdByUserId: userId,
          stageEnteredAt: stageStartedAt,
          initializedAt: stageStartedAt,
          createdAt: stageStartedAt,
        })
        .returning();

      const [reservedChamber] = await tx
        .update(chambersTable)
        .set({ currentBatchId: createdBatch.id, status: "active" })
        .where(
          and(
            eq(chambersTable.id, preWettingChamber.id),
            eq(chambersTable.status, "idle"),
          ),
        )
        .returning();
      if (
        !reservedChamber ||
        reservedChamber.currentBatchId !== createdBatch.id
      )
        throw new Error(
          "The selected Pre-Wetting chamber is no longer available",
        );

      for (const row of formulation) {
        if (
          !row.name?.trim() ||
          !Number.isFinite(Number(row.wetWeightKg)) ||
          Number(row.wetWeightKg) <= 0
        ) {
          throw new Error(
            `Invalid formulation row: ${row.name || "Unnamed material"}`,
          );
        }
        let [material] = await tx
          .select()
          .from(materialsTable)
          .where(ilike(materialsTable.name, row.name.trim()))
          .limit(1);
        if (!material) {
          [material] = await tx
            .insert(materialsTable)
            .values({
              name: row.name.trim(),
              unit: "kg",
              category: "raw_material",
              itemType: "Raw Material",
              itemIdentifier: `VLT-RM-ANNUR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
              defaultMoisturePercent: String(row.moisturePercent ?? 0),
              defaultNitrogenPercent: String(row.nitrogenPercent ?? 0),
            })
            .returning();
        }
        await tx.insert(batchMaterialsTable).values({
          batchId: createdBatch.id,
          materialId: material.id,
          wetWeightKg: String(row.wetWeightKg),
          moisturePercent: String(row.moisturePercent ?? 0),
          nitrogenPercent: String(row.nitrogenPercent ?? 0),
        });
      }

      await consumeAnnurBatchMaterials(tx, {
        batchType: "ANNUR",
        batchId: createdBatch.id,
        batchReference: createdBatch.batchCode,
        materials: formulation.map((row) => ({ name: row.name, materialId: row.materialId, quantity: Number(row.wetWeightKg) })),
        userId,
      });

      await tx.insert(stageLogsTable).values({
        batchId: createdBatch.id,
        stage: "PRE_WETTING",
        enteredAt: stageStartedAt,
        enteredByUserId: userId,
        notes: "Batch created",
        chamberId: preWettingChamber.id,
        chamberNameSnapshot: preWettingChamber.name,
        chamberTypeSnapshot: preWettingChamber.chamberType,
      });
      return createdBatch;
    });

    await recalcBatchNitrogen(batch.id);
    const [user] = userId
      ? await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1)
      : [null];
    return res
      .status(201)
      .json(formatBatch(batch, loc.code, user?.displayName ?? "System"));
  } catch (error: any) {
    return res.status(400).json({
      error: error?.message || "Failed to create batch and formulation",
    });
  }
});
router.get("/files/verification/:file", requireAuth, (req, res) => {
  const fileName = path.basename(req.params.file);
  const target = resolveUploadPath(...ANNUR_VERIFICATION_FOLDER, fileName);
  return res.sendFile(target, { dotfiles: "deny" });
});
// ── Get batch detail ──────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const batchId = Number(req.params.id);

  const [row] = await db
    .select({
      batch: batchesTable,
      locationCode: locationsTable.code,
      createdByName: usersTable.displayName,
    })
    .from(batchesTable)
    .innerJoin(locationsTable, eq(batchesTable.locationId, locationsTable.id))
    .leftJoin(usersTable, eq(batchesTable.createdByUserId, usersTable.id))
    .where(eq(batchesTable.id, batchId))
    .limit(1);

  if (!row) return res.status(404).json({ error: "Batch not found" });

  const materials = await db
    .select({
      bm: batchMaterialsTable,
      materialName: materialsTable.name,
      unit: materialsTable.unit,
    })
    .from(batchMaterialsTable)
    .innerJoin(
      materialsTable,
      eq(batchMaterialsTable.materialId, materialsTable.id),
    )
    .where(eq(batchMaterialsTable.batchId, batchId));

  const stageLogs = await db
    .select({ sl: stageLogsTable, enteredByName: usersTable.displayName })
    .from(stageLogsTable)
    .leftJoin(usersTable, eq(stageLogsTable.enteredByUserId, usersTable.id))
    .where(eq(stageLogsTable.batchId, batchId))
    .orderBy(stageLogsTable.enteredAt);
  const [spawnUsage] = await db
    .select()
    .from(annurSpawnUsagesTable)
    .where(eq(annurSpawnUsagesTable.batchId, batchId))
    .limit(1);

  const environmentalReadings = await db
    .select({
      reading: chamberReadingsTable,
      chamberName: chambersTable.name,
      recordedByName: usersTable.displayName,
    })
    .from(chamberReadingsTable)
    .leftJoin(chambersTable, eq(chamberReadingsTable.chamberId, chambersTable.id))
    .leftJoin(usersTable, eq(chamberReadingsTable.recordedByUserId, usersTable.id))
    .where(eq(chamberReadingsTable.batchId, batchId))
    .orderBy(chamberReadingsTable.recordedAt);

  const formattedMaterials = materials.map(({ bm, materialName, unit }) => {
    const wet = Number(bm.wetWeightKg);
    const moisture = Number(bm.moisturePercent);
    const nitrogen = Number(bm.nitrogenPercent);
    const dry = wet * (1 - moisture / 100);
    return {
      id: bm.id,
      batchId: bm.batchId,
      materialId: bm.materialId,
      materialName,
      unit,
      wetWeightKg: wet,
      moisturePercent: moisture,
      nitrogenPercent: nitrogen,
      dryWeightKg: dry,
      n2Kg: dry * (nitrogen / 100),
    };
  });

  const formattedLogs = stageLogs.map(({ sl, enteredByName }) => ({
    id: sl.id,
    batchId: sl.batchId,
    stage: sl.stage,
    enteredAt: sl.enteredAt,
    exitedAt: sl.exitedAt,
    enteredByName: enteredByName ?? "System",
    notes: sl.notes,
    chamberId: sl.chamberId,
    chamberName: sl.chamberNameSnapshot,
    chamberType: sl.chamberTypeSnapshot,
    nh3Ppm: sl.nh3Ppm != null ? Number(sl.nh3Ppm) : null,
    temperatureCelsius:
      sl.temperatureCelsius != null ? Number(sl.temperatureCelsius) : null,
    verificationImages: sl.verificationImages
      ? JSON.parse(sl.verificationImages)
      : [],
  }));

  return res.json({
    ...formatBatch(row.batch, row.locationCode, row.createdByName ?? "System"),
    materials: formattedMaterials,
    stageLogs: formattedLogs,
    environmentReadings: environmentalReadings.map(({ reading, chamberName, recordedByName }) => {
      const recordedAt = new Date(reading.recordedAt);
      const stage = [...formattedLogs]
        .reverse()
        .find((log) =>
          recordedAt >= new Date(log.enteredAt) &&
          (!log.exitedAt || recordedAt <= new Date(log.exitedAt)),
        )?.stage ?? null;
      return {
        id: reading.id,
        chamberId: reading.chamberId,
        chamberName: chamberName ?? "Unknown chamber",
        stage,
        temperatureCelsius: reading.temperatureCelsius != null ? Number(reading.temperatureCelsius) : null,
        nh3Ppm: reading.nh3Ppm != null ? Number(reading.nh3Ppm) : null,
        co2Percent: reading.co2Percent != null ? Number(reading.co2Percent) : null,
        moisturePercent: reading.humidity != null ? Number(reading.humidity) : null,
        notes: reading.notes,
        recordedAt: reading.recordedAt,
        recordedByName: recordedByName ?? "System",
      };
    }),
    spawnUsage: spawnUsage
      ? {
          ...spawnUsage,
          quantityUsedKg: Number(spawnUsage.quantityUsedKg),
          sources: [
            {
              spawnEntryId: spawnUsage.spawnEntryId,
              quantityUsedKg: Number(spawnUsage.quantityUsedKg),
              sourceTypeSnapshot: spawnUsage.sourceTypeSnapshot,
              sourceReferenceSnapshot: spawnUsage.sourceReferenceSnapshot,
              strainNameSnapshot: spawnUsage.strainNameSnapshot,
              supplierNameSnapshot: spawnUsage.supplierNameSnapshot,
              supplierLotSnapshot: spawnUsage.supplierLotSnapshot,
            },
            ...(spawnUsage.additionalSourcesJson
              ? JSON.parse(spawnUsage.additionalSourcesJson)
              : []),
          ],
        }
      : null,
  });
});

// ── Update batch metadata ─────────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  const {
    status,
    targetBags,
    actualBags,
    dispatchLocationId,
    spawnEntryId,
    notes,
    spawnBatchRef,
    spawnBatchType,
  } = req.body;
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (targetBags !== undefined) updates.targetBags = targetBags;
  if (actualBags !== undefined) updates.actualBags = actualBags;
  if (dispatchLocationId !== undefined)
    updates.dispatchLocationId = dispatchLocationId;
  if (spawnEntryId !== undefined) updates.spawnEntryId = spawnEntryId;
  if (notes !== undefined) updates.notes = notes;
  if (spawnBatchRef !== undefined) updates.spawnBatchRef = spawnBatchRef;
  if (spawnBatchType !== undefined) updates.spawnBatchType = spawnBatchType;

  const [batch] = await db
    .update(batchesTable)
    .set(updates)
    .where(eq(batchesTable.id, Number(req.params.id)))
    .returning();
  if (!batch) return res.status(404).json({ error: "Not found" });

  const [loc] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, batch.locationId))
    .limit(1);
  const [user] = batch.createdByUserId
    ? await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, batch.createdByUserId))
        .limit(1)
    : [null];

  return res.json(
    formatBatch(batch, loc?.code ?? "", user?.displayName ?? "System"),
  );
});

// ── Delete batch ──────────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const [batch] = await db
    .select()
    .from(batchesTable)
    .where(eq(batchesTable.id, batchId))
    .limit(1);
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  await db
    .update(chambersTable)
    .set({ currentBatchId: null, status: "idle" })
    .where(eq(chambersTable.currentBatchId, batchId));
  // Stage logs cascade on delete (FK onDelete: cascade)
  await db
    .delete(batchMaterialsTable)
    .where(eq(batchMaterialsTable.batchId, batchId));
  await db.delete(stageLogsTable).where(eq(stageLogsTable.batchId, batchId));
  await db.delete(batchesTable).where(eq(batchesTable.id, batchId));
  return res.status(204).send();
});

// ── Assign an available Bulk chamber to a batch already in that stage ─────────
router.post("/:id/assign-chamber", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const chamberId = Number(req.body.chamberId);
  const [batch] = await db
    .select()
    .from(batchesTable)
    .where(eq(batchesTable.id, batchId))
    .limit(1);
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  if (batch.currentStage !== "BULK_CHAMBER")
    return res
      .status(400)
      .json({ error: "Batch is not in the Bulk Chamber stage" });
  const [chamber] = await db
    .select()
    .from(chambersTable)
    .where(eq(chambersTable.id, chamberId))
    .limit(1);
  if (
    !chamber ||
    chamber.chamberType !== "bulk" ||
    chamber.locationId !== batch.locationId
  )
    return res
      .status(400)
      .json({ error: "Select a valid Bulk chamber for this location" });
  if (chamber.status !== "idle" || chamber.currentBatchId !== null)
    return res
      .status(409)
      .json({ error: "The selected Bulk chamber is no longer available" });
  const existing = await db
    .select()
    .from(chambersTable)
    .where(eq(chambersTable.currentBatchId, batchId))
    .limit(1);
  if (existing.length)
    return res
      .status(409)
      .json({ error: "This batch already has a chamber assigned" });
  const [updated] = await db
    .update(chambersTable)
    .set({ currentBatchId: batchId, status: "active" })
    .where(
      and(eq(chambersTable.id, chamberId), eq(chambersTable.status, "idle")),
    )
    .returning();
  if (!updated)
    return res
      .status(409)
      .json({ error: "The selected Bulk chamber is no longer available" });
  await db
    .update(batchesTable)
    .set({ bulkChamberId: updated.id })
    .where(eq(batchesTable.id, batchId));
  return res.json(updated);
});
// ── Advance stage ─────────────────────────────────────────────────────────────
router.post("/:id/advance", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const {
    nextStage,
    notes,
    spawnBatchRef,
    spawnBatchType,
    verificationImages,
    chamberId,
    turnChamberId,
    producedBags,
    spawnEntryId,
    spawnQuantityUsed,
    spawnUsages,
    completedAt,
    nextEnteredAt: requestedNextEnteredAt,
  } = req.body;
  const userId = (req.session as any).userId;

  const [batch] = await db
    .select()
    .from(batchesTable)
    .where(eq(batchesTable.id, batchId))
    .limit(1);
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  const exitedAt = resolveProductionDateTime(completedAt);
  if (!exitedAt)
    return res.status(400).json({ error: "Stage completion date and time is invalid" });
  const dateError = chronologyError(
    exitedAt,
    batch.stageEnteredAt ?? batch.initializedAt,
    "Stage completion date and time",
  );
  if (dateError) return res.status(400).json({ error: dateError });
  const [latestStageReading] = await db
    .select()
    .from(chamberReadingsTable)
    .where(
      and(
        eq(chamberReadingsTable.batchId, batchId),
        gte(chamberReadingsTable.recordedAt, batch.stageEnteredAt ?? batch.initializedAt),
      ),
    )
    .orderBy(desc(chamberReadingsTable.recordedAt))
    .limit(1);
  const readingDateError = chronologyError(
    exitedAt,
    latestStageReading?.recordedAt,
    "Stage completion date and time",
  );
  if (readingDateError) return res.status(400).json({ error: readingDateError });
  const currentIndex = ANNUR_STAGES.indexOf(batch.currentStage);
  if (currentIndex < 0 || ANNUR_STAGES[currentIndex + 1] !== nextStage)
    return res.status(409).json({
      error: `Expected next stage ${ANNUR_STAGES[currentIndex + 1] ?? "none"}`,
    });

  const nextStageEnteredAt =
    nextStage === "COMPLETED"
      ? exitedAt
      : resolveProductionDateTime(requestedNextEnteredAt);
  if (!nextStageEnteredAt)
    return res.status(400).json({ error: "Next stage entry date and time is invalid" });
  const nextEntryDateError = chronologyError(
    nextStageEnteredAt,
    exitedAt,
    "Next stage entry date and time",
  );
  if (nextEntryDateError) return res.status(400).json({ error: nextEntryDateError });

  const requestedSpawnUsages = Array.isArray(spawnUsages)
    ? spawnUsages.map((usage: any) => ({
        spawnEntryId: Number(usage.spawnEntryId),
        quantityUsedKg: Number(usage.quantityUsedKg),
      }))
    : [{ spawnEntryId: Number(spawnEntryId), quantityUsedKg: Number(spawnQuantityUsed) }];
  if (nextStage === "SPAWN_MIXING" &&
      (requestedSpawnUsages.length < 1 || requestedSpawnUsages.length > 2 ||
       requestedSpawnUsages.some((usage) => !usage.spawnEntryId || !(usage.quantityUsedKg > 0)) ||
       new Set(requestedSpawnUsages.map((usage) => usage.spawnEntryId)).size !== requestedSpawnUsages.length)) {
    return res.status(400).json({
      error: "Select valid, distinct Spawn Vault entries and enter a quantity for each",
    });
  }

  let selectedChamber: typeof chambersTable.$inferSelect | undefined;
  const requiredChamberType = REQUIRED_CHAMBER_TYPE[nextStage];
  if (requiredChamberType) {
    const requestedChamberId = Number(chamberId || turnChamberId);
    if (!requestedChamberId)
      return res.status(400).json({
        error: `A ${requiredChamberType.replace("_", " ")} chamber is required`,
      });
    [selectedChamber] = await db
      .select()
      .from(chambersTable)
      .where(eq(chambersTable.id, requestedChamberId))
      .limit(1);
    if (
      !selectedChamber ||
      selectedChamber.chamberType !== requiredChamberType ||
      selectedChamber.locationId !== batch.locationId
    )
      return res.status(400).json({
        error: `Select a valid ${requiredChamberType.replace("_", " ")} chamber for Annur`,
      });
    // Mongo records created before currentBatchId was populated may omit the field; null and undefined both mean unassigned.
    if (
      selectedChamber.status !== "idle" ||
      selectedChamber.currentBatchId != null
    )
      return res
        .status(409)
        .json({ error: "The selected chamber is no longer available" });
  }
  // Verification photos are optional. Preserve any supplied photos in history.
  const submittedVerificationImages = Array.isArray(verificationImages)
    ? verificationImages.filter(Boolean).slice(0, 2)
    : [];
  let storedVerificationImages: string[] = [];
  if (submittedVerificationImages.length > 0) {
    try {
      storedVerificationImages = await Promise.all(
        submittedVerificationImages.map(saveAnnurVerificationImage),
      );
    } catch (error: any) {
      return res.status(400).json({
        error: error?.message || "Failed to store verification photos",
      });
    }
  }

  const isDispatchCompletion =
    batch.currentStage === "DISPATCH" && nextStage === "COMPLETED";
  const produced = isDispatchCompletion
    ? validateProducedBags(producedBags)
    : null;
  if (produced && !produced.ok)
    return res.status(400).json({ error: produced.error });

  const updated = await db.transaction(async (tx) => {
    if (nextStage === "SPAWN_MIXING") {
      const [existingUsage] = await tx
        .select()
        .from(annurSpawnUsagesTable)
        .where(eq(annurSpawnUsagesTable.batchId, batchId))
        .limit(1);
      if (existingUsage)
        throw new Error("This batch has already recorded spawn usage");
      const consumedSources: any[] = [];
      for (const requestedUsage of requestedSpawnUsages) {
        const qty = requestedUsage.quantityUsedKg;
        const [entry] = await tx.update(spawnEntriesTable).set({ status: "reserved" })
          .where(and(eq(spawnEntriesTable.id, requestedUsage.spawnEntryId), eq(spawnEntriesTable.status, "available"), gte(spawnEntriesTable.quantityKg, String(qty))))
          .returning();
        if (!entry) throw new Error("Selected spawn stock is unavailable or has insufficient quantity");
        const available = Number(entry.quantityKg);
        const reserved = Number(entry.reservedQuantityKg || 0);
        if (available - reserved < qty)
          throw new Error(`Selected spawn stock has only ${Math.max(0, available - reserved)} kg free after Sales reservations`);
        const balance = available - qty;
        await tx.update(spawnEntriesTable).set({ quantityKg: String(balance), status: balance === 0 ? "depleted" : "available" }).where(eq(spawnEntriesTable.id, entry.id));
        const snapshot = {
          spawnEntryId: entry.id, quantityUsedKg: qty,
          sourceTypeSnapshot: entry.sourceType, sourceReferenceSnapshot: entry.sourceReference,
          strainNameSnapshot: entry.strainName, supplierNameSnapshot: entry.supplierName,
          supplierLotSnapshot: entry.supplierLot,
        };
        consumedSources.push(snapshot);
        await tx.insert(spawnVaultTransactionsTable).values({
          transactionKey: `annur-consumption:${batchId}:initial:${entry.id}`,
          spawnEntryId: entry.id, transactionType: "ANNUR_CONSUMPTION",
          quantityInKg: "0", quantityOutKg: String(qty), balanceAfterKg: String(balance),
          referenceType: "ANNUR_BATCH", referenceId: batchId, reference: batch.batchCode,
          recordedByUserId: userId,
        });
      }
      if (consumedSources.length === 2) {
        const externalCount = consumedSources.filter(
          (source) => String(source.sourceTypeSnapshot).toUpperCase() === "EXTERNAL",
        ).length;
        if (externalCount !== 1)
          throw new Error("Both requires one Internal Lab source and one External Vendor source");
      }
      const primary = consumedSources[0];
      await tx.insert(annurSpawnUsagesTable).values({
        batchId,
        spawnEntryId: primary.spawnEntryId,
        quantityUsedKg: String(primary.quantityUsedKg),
        sourceTypeSnapshot: primary.sourceTypeSnapshot,
        sourceReferenceSnapshot: primary.sourceReferenceSnapshot,
        strainNameSnapshot: primary.strainNameSnapshot,
        supplierNameSnapshot: primary.supplierNameSnapshot,
        supplierLotSnapshot: primary.supplierLotSnapshot,
        additionalSourcesJson: JSON.stringify(consumedSources.slice(1)),
        recordedByUserId: userId,
        updatedByUserId: userId,
      });
    }
    if (
      batch.currentChamberId ||
      batch.preWettingChamberId ||
      batch.turnChamberId ||
      batch.bulkChamberId
    )
      await tx
        .update(chambersTable)
        .set({ currentBatchId: null, status: "idle" })
        .where(eq(chambersTable.currentBatchId, batchId));
    if (selectedChamber) {
      const [locked] = await tx
        .update(chambersTable)
        .set({ currentBatchId: batchId, status: "active" })
        .where(
          and(
            eq(chambersTable.id, selectedChamber.id),
            eq(chambersTable.status, "idle"),
          ),
        )
        .returning();
      if (!locked || locked.currentBatchId !== batchId)
        throw new Error("The selected chamber is no longer available");
    }
    await tx
      .update(stageLogsTable)
      .set({
        exitedAt,
        completedByUserId: userId,
        notes: notes ?? null,
        verificationImages: JSON.stringify(storedVerificationImages),
      })
      .where(
        and(
          eq(stageLogsTable.batchId, batchId),
          eq(stageLogsTable.stage, batch.currentStage),
        ),
      );
    await tx.insert(stageLogsTable).values({
      batchId,
      stage: nextStage,
      enteredAt: nextStageEnteredAt,
      enteredByUserId: userId,
      chamberId: selectedChamber?.id ?? null,
      chamberNameSnapshot: selectedChamber?.name ?? null,
      chamberTypeSnapshot: selectedChamber?.chamberType ?? null,
    });
    const batchUpdates: Record<string, unknown> = {
      currentStage: nextStage,
      stageEnteredAt: nextStageEnteredAt,
    };
    batchUpdates.currentChamberId = selectedChamber?.id ?? null;
    if (selectedChamber?.chamberType === "bulk")
      batchUpdates.bulkChamberId = selectedChamber.id;
    if (isDispatchCompletion && produced?.ok) {
      batchUpdates.status = "dispatched";
      batchUpdates.actualBags = produced.producedBags;
    }
    if (nextStage === "SPAWN_MIXING" && requestedSpawnUsages[0]?.spawnEntryId) {
      batchUpdates.spawnEntryId = requestedSpawnUsages[0].spawnEntryId;
    }
    if (isDispatchCompletion && produced?.ok) {
      const postingKey = annurDispatchPostingKey(batchId);
      const [existingPosting] = await tx
        .select()
        .from(annurDispatchInventoryPostingsTable)
        .where(eq(annurDispatchInventoryPostingsTable.postingKey, postingKey))
        .limit(1);
      if (existingPosting)
        throw new Error("Dispatch inventory was already posted");
      const [material] = await tx
        .select()
        .from(materialsTable)
        .where(eq(materialsTable.sku, "VLT-RM-GROW-BAG"))
        .limit(1);
      const [warehouse] = await tx
        .select()
        .from(inventoryLocationsTable)
        .where(eq(inventoryLocationsTable.systemCode, "ANNUR"))
        .limit(1);
      const [annurLocation] = await tx
        .select()
        .from(locationsTable)
        .where(eq(locationsTable.code, "A"))
        .limit(1);
      if (!material || !warehouse || !annurLocation)
        throw new Error("Annur Grow Bag inventory configuration is missing");
      let [stock] = await tx
        .select()
        .from(inventoryTable)
        .where(
          and(
            eq(inventoryTable.materialId, material.id),
            eq(inventoryTable.locationId, warehouse.id),
          ),
        )
        .limit(1);
      if (stock)
        [stock] = await tx
          .update(inventoryTable)
          .set({
            quantityOnHand: String(
              Number(stock.quantityOnHand) + produced.producedBags,
            ),
            lastUpdated: exitedAt,
          })
          .where(eq(inventoryTable.id, stock.id))
          .returning();
      else
        [stock] = await tx
          .insert(inventoryTable)
          .values({
            materialId: material.id,
            locationId: warehouse.id,
            quantityOnHand: String(produced.producedBags),
          })
          .returning();
      const [adjustment] = await tx
        .insert(inventoryAdjustmentsTable)
        .values({
          materialId: material.id,
          locationId: annurLocation.id,
          quantityDelta: String(produced.producedBags),
          reason: "production",
          notes: `Annur Dispatch | Batch: ${batch.batchCode} (#${batchId}) | Produced Bags: ${produced.producedBags}`,
          adjustedByUserId: userId,
        })
        .returning();
      await tx.insert(annurDispatchInventoryPostingsTable).values({
        postingKey,
        batchId,
        inventoryId: stock.id,
        inventoryAdjustmentId: adjustment.id,
        warehouseId: warehouse.id,
        producedBags: produced.producedBags,
      });
    }
    const [row] = await tx
      .update(batchesTable)
      .set(batchUpdates)
      .where(eq(batchesTable.id, batchId))
      .returning();
    return row;
  });
  const [loc] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, updated.locationId))
    .limit(1);
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return res.json({
    ...formatBatch(updated, loc?.code ?? "", user?.displayName ?? "System"),
    completedStage: batch.currentStage,
  });
});

router.patch("/:id/spawn-usage", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const userId = (req.session as any).userId;
  const newQuantity = Number(req.body.quantityUsedKg);
  if (!(newQuantity > 0))
    return res
      .status(400)
      .json({ error: "Quantity used must be greater than zero" });
  try {
    const result = await db.transaction(async (tx) => {
      const [usage] = await tx
        .select()
        .from(annurSpawnUsagesTable)
        .where(eq(annurSpawnUsagesTable.batchId, batchId))
        .limit(1);
      if (!usage) throw new Error("This batch has no recorded spawn usage");
      const oldQuantity = Number(usage.quantityUsedKg);
      const difference = newQuantity - oldQuantity;
      const [currentEntry] = await tx
        .select()
        .from(spawnEntriesTable)
        .where(eq(spawnEntriesTable.id, usage.spawnEntryId))
        .limit(1);
      if (!currentEntry)
        throw new Error("The locked Spawn Vault source no longer exists");
      const [entry] = await tx
        .update(spawnEntriesTable)
        .set({ status: "reserved" })
        .where(
          and(
            eq(spawnEntriesTable.id, usage.spawnEntryId),
            eq(spawnEntriesTable.status, currentEntry.status),
            gte(spawnEntriesTable.quantityKg, String(Math.max(0, difference))),
          ),
        )
        .returning();
      if (!entry)
        throw new Error(
          `Available spawn quantity is only ${Number(currentEntry.quantityKg)} kg`,
        );
      const available = Number(entry.quantityKg);
      const reserved = Number(entry.reservedQuantityKg || 0);
      if (available - reserved < difference)
        throw new Error(
          `Available unreserved spawn quantity is only ${Math.max(0, available - reserved)} kg`,
        );
      const balance = available - difference;
      await tx
        .update(spawnEntriesTable)
        .set({
          quantityKg: String(balance),
          status: balance === 0 ? "depleted" : "available",
        })
        .where(eq(spawnEntriesTable.id, entry.id));
      await tx
        .update(annurSpawnUsagesTable)
        .set({
          quantityUsedKg: String(newQuantity),
          updatedByUserId: userId,
          updatedAt: new Date(),
        })
        .where(eq(annurSpawnUsagesTable.id, usage.id));
      await tx.insert(spawnVaultTransactionsTable).values({
        transactionKey: `annur-consumption:${batchId}:adjust:${Date.now()}`,
        spawnEntryId: entry.id,
        transactionType: "ANNUR_CONSUMPTION_ADJUSTMENT",
        quantityInKg: String(difference < 0 ? -difference : 0),
        quantityOutKg: String(difference > 0 ? difference : 0),
        balanceAfterKg: String(balance),
        referenceType: "ANNUR_BATCH",
        referenceId: batchId,
        reference: String(batchId),
        recordedByUserId: userId,
        notes: `Spawn usage adjusted from ${oldQuantity} kg to ${newQuantity} kg`,
      });
      return {
        ...usage,
        quantityUsedKg: newQuantity,
        availableQuantityKg: balance,
      };
    });
    return res.json(result);
  } catch (error: any) {
    return res
      .status(409)
      .json({ error: error?.message || "Unable to adjust spawn usage" });
  }
});

// ── Replace all materials (formulation save) ──────────────────────────────────
router.put("/:id/materials", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const { rows } = req.body as {
    rows: Array<{
      materialId: number;
      wetWeightKg: number;
      moisturePercent: number;
      nitrogenPercent: number;
    }>;
  };

  if (!Array.isArray(rows))
    return res.status(400).json({ error: "rows array required" });

  await db.transaction(async (tx) => {
    const [batch] = await tx.select().from(batchesTable).where(eq(batchesTable.id, batchId)).limit(1);
    if (!batch) throw new Error("Batch not found");
    const masterRows = await tx.select().from(materialsTable);
    await consumeAnnurMaterialIncreases(tx, {
      batchType: "ANNUR",
      batchId,
      batchReference: batch.batchCode,
      materials: rows.map((row) => ({ name: masterRows.find((material) => Number(material.id) === Number(row.materialId))?.name || String(row.materialId), materialId: row.materialId, quantity: Number(row.wetWeightKg) })),
      userId: (req.session as any)?.userId ?? null,
      operationKey: `FORMULATION-UPDATE-${Date.now()}`,
    });
    await tx
      .delete(batchMaterialsTable)
      .where(eq(batchMaterialsTable.batchId, batchId));
    if (rows.length > 0) {
      await tx.insert(batchMaterialsTable).values(
        rows.map((r) => ({
          batchId,
          materialId: r.materialId,
          wetWeightKg: String(r.wetWeightKg),
          moisturePercent: String(r.moisturePercent),
          nitrogenPercent: String(r.nitrogenPercent),
        })),
      );
    }
  });

  await recalcBatchNitrogen(batchId);

  const saved = await db
    .select({
      bm: batchMaterialsTable,
      materialName: materialsTable.name,
      unit: materialsTable.unit,
    })
    .from(batchMaterialsTable)
    .innerJoin(
      materialsTable,
      eq(batchMaterialsTable.materialId, materialsTable.id),
    )
    .where(eq(batchMaterialsTable.batchId, batchId));

  return res.json(
    saved.map(({ bm, materialName, unit }) => {
      const wet = Number(bm.wetWeightKg);
      const moisture = Number(bm.moisturePercent);
      const nitrogen = Number(bm.nitrogenPercent);
      const dry = wet * (1 - moisture / 100);
      return {
        id: bm.id,
        batchId: bm.batchId,
        materialId: bm.materialId,
        materialName,
        unit,
        wetWeightKg: wet,
        moisturePercent: moisture,
        nitrogenPercent: nitrogen,
        dryWeightKg: dry,
        n2Kg: dry * (nitrogen / 100),
      };
    }),
  );
});
// ── Individual material routes ────────────────────────────────────────────────
router.get("/:id/materials", async (req, res) => {
  const batchId = Number(req.params.id);
  const materials = await db
    .select({
      bm: batchMaterialsTable,
      materialName: materialsTable.name,
      unit: materialsTable.unit,
    })
    .from(batchMaterialsTable)
    .innerJoin(
      materialsTable,
      eq(batchMaterialsTable.materialId, materialsTable.id),
    )
    .where(eq(batchMaterialsTable.batchId, batchId));

  res.json(
    materials.map(({ bm, materialName, unit }) => {
      const wet = Number(bm.wetWeightKg);
      const moisture = Number(bm.moisturePercent);
      const nitrogen = Number(bm.nitrogenPercent);
      const dry = wet * (1 - moisture / 100);
      return {
        id: bm.id,
        batchId: bm.batchId,
        materialId: bm.materialId,
        materialName,
        unit,
        wetWeightKg: wet,
        moisturePercent: moisture,
        nitrogenPercent: nitrogen,
        dryWeightKg: dry,
        n2Kg: dry * (nitrogen / 100),
      };
    }),
  );
});

router.post("/:id/materials", async (req, res) => {
  const batchId = Number(req.params.id);
  const { materialId, wetWeightKg, moisturePercent, nitrogenPercent } =
    req.body;

  let bm: any, mat: any;
  try {
    ({ bm, mat } = await db.transaction(async (tx) => {
      const [batch] = await tx.select().from(batchesTable).where(eq(batchesTable.id, batchId)).limit(1);
      const [material] = await tx.select().from(materialsTable).where(eq(materialsTable.id, materialId)).limit(1);
      if (!batch || !material) throw new Error("Batch or material not found");
      const [created] = await tx.insert(batchMaterialsTable).values({ batchId, materialId, wetWeightKg: String(wetWeightKg), moisturePercent: String(moisturePercent), nitrogenPercent: String(nitrogenPercent) }).returning();
      await consumeAnnurBatchMaterials(tx, { batchType: "ANNUR", batchId, batchReference: batch.batchCode, materials: [{ name: material.name, materialId: material.id, quantity: Number(wetWeightKg) }], userId: (req.session as any)?.userId ?? null, operationKey: `ADDED-${created.id}` });
      return { bm: created, mat: material };
    }));
  } catch (error: any) {
    return res.status(409).json({ error: error?.message || "Unable to add and consume material" });
  }
  await recalcBatchNitrogen(batchId);

  const wet = Number(bm.wetWeightKg);
  const moisture = Number(bm.moisturePercent);
  const nitrogen = Number(bm.nitrogenPercent);
  const dry = wet * (1 - moisture / 100);
  return res.status(201).json({
    id: bm.id,
    batchId: bm.batchId,
    materialId: bm.materialId,
    materialName: mat?.name ?? "",
    unit: mat?.unit ?? "kg",
    wetWeightKg: wet,
    moisturePercent: moisture,
    nitrogenPercent: nitrogen,
    dryWeightKg: dry,
    n2Kg: dry * (nitrogen / 100),
  });
});

router.patch("/:id/materials/:materialRowId", async (req, res) => {
  const batchId = Number(req.params.id);
  const materialRowId = Number(req.params.materialRowId);
  const { wetWeightKg, moisturePercent, nitrogenPercent } = req.body;

  const updates: Record<string, unknown> = {};
  if (wetWeightKg !== undefined) updates.wetWeightKg = String(wetWeightKg);
  if (moisturePercent !== undefined)
    updates.moisturePercent = String(moisturePercent);
  if (nitrogenPercent !== undefined)
    updates.nitrogenPercent = String(nitrogenPercent);

  const [bm] = await db
    .update(batchMaterialsTable)
    .set(updates)
    .where(eq(batchMaterialsTable.id, materialRowId))
    .returning();
  if (!bm) return res.status(404).json({ error: "Not found" });

  const [mat] = await db
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.id, bm.materialId))
    .limit(1);
  await recalcBatchNitrogen(batchId);

  const wet = Number(bm.wetWeightKg);
  const moisture = Number(bm.moisturePercent);
  const nitrogen = Number(bm.nitrogenPercent);
  const dry = wet * (1 - moisture / 100);
  return res.json({
    id: bm.id,
    batchId: bm.batchId,
    materialId: bm.materialId,
    materialName: mat?.name ?? "",
    unit: mat?.unit ?? "kg",
    wetWeightKg: wet,
    moisturePercent: moisture,
    nitrogenPercent: nitrogen,
    dryWeightKg: dry,
    n2Kg: dry * (nitrogen / 100),
  });
});

router.delete("/:id/materials/:materialRowId", async (req, res) => {
  const batchId = Number(req.params.id);
  await db
    .delete(batchMaterialsTable)
    .where(eq(batchMaterialsTable.id, Number(req.params.materialRowId)));
  await recalcBatchNitrogen(batchId);
  res.status(204).send();
});

router.get("/:id/stage-logs", async (req, res) => {
  const batchId = Number(req.params.id);
  const logs = await db
    .select({ sl: stageLogsTable, enteredByName: usersTable.displayName })
    .from(stageLogsTable)
    .leftJoin(usersTable, eq(stageLogsTable.enteredByUserId, usersTable.id))
    .where(eq(stageLogsTable.batchId, batchId))
    .orderBy(stageLogsTable.enteredAt);

  res.json(
    logs.map(({ sl, enteredByName }) => ({
      id: sl.id,
      batchId: sl.batchId,
      stage: sl.stage,
      enteredAt: sl.enteredAt,
      exitedAt: sl.exitedAt,
      enteredByName: enteredByName ?? "System",
      notes: sl.notes,
      nh3Ppm: sl.nh3Ppm != null ? Number(sl.nh3Ppm) : null,
      temperatureCelsius:
        sl.temperatureCelsius != null ? Number(sl.temperatureCelsius) : null,
      verificationImages: sl.verificationImages
        ? JSON.parse(sl.verificationImages)
        : [],
    })),
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function recalcBatchNitrogen(batchId: number) {
  const mats = await db
    .select()
    .from(batchMaterialsTable)
    .where(eq(batchMaterialsTable.batchId, batchId));
  if (mats.length === 0) {
    await db
      .update(batchesTable)
      .set({ nitrogenContent: null })
      .where(eq(batchesTable.id, batchId));
    return;
  }
  let totalDry = 0,
    totalN2 = 0;
  for (const m of mats) {
    const wet = Number(m.wetWeightKg);
    const moisture = Number(m.moisturePercent);
    const nitrogen = Number(m.nitrogenPercent);
    const dry = wet * (1 - moisture / 100);
    totalDry += dry;
    totalN2 += dry * (nitrogen / 100);
  }
  const nitrogenContent = totalDry > 0 ? (totalN2 / totalDry) * 100 : 0;
  await db
    .update(batchesTable)
    .set({ nitrogenContent: String(nitrogenContent) })
    .where(eq(batchesTable.id, batchId));
}

export default router;
