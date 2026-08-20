import { Router } from "express";
import { db } from "@workspace/db";
import {
  batchesTable,
  labSpawnOutputTable,
  labBatchMaterialsTable,
  spawnTransactionsTable,
  locationsTable,
  usersTable,
  stageLogsTable,
  inventoryTable,
  inventoryAdjustmentsTable,
  materialsTable,
  spawnEntriesTable,
  spawnVaultTransactionsTable,
} from "@workspace/db";
import { eq, desc, ilike } from "@workspace/db";
import { paginateQuery, paginatedResponse } from "../lib/pagination";

const router = Router();

// Ordered stage sequence (FORMULATION is the pre-initiation holding stage)
const LAB_STAGES = [
  "MEDIA_PREP",
  "MOTHER_CULTURE",
  "MILLET_1",
  "MILLET_2",
  "MOISTURE",
  "AUTOCLAVE",
  "INOCULATION",
  "SHAKING_1",
  "SHAKING_2",
  "QC",
  "COMPLETED",
] as const;

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId)
    return res.status(401).json({ error: "Not authenticated" });
  next();
}

function batchCode(seq: number) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `D-${yy}${mm}${dd}-${String(seq).padStart(3, "0")}`;
}

function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── List Lab batches ──────────────────────────────────────────────────────────
router.get("/batches", requireAuth, async (req, res) => {
  const rows = await db
    .select({
      id: batchesTable.id,
      batchCode: batchesTable.batchCode,
      locationId: batchesTable.locationId,
      currentStage: batchesTable.currentStage,
      status: batchesTable.status,
      notes: batchesTable.notes,
      alertLevel: batchesTable.alertLevel,
      createdAt: batchesTable.createdAt,
      stageEnteredAt: batchesTable.stageEnteredAt,
      locationCode: locationsTable.code,
      createdByName: usersTable.displayName,
    })
    .from(batchesTable)
    .innerJoin(locationsTable, eq(batchesTable.locationId, locationsTable.id))
    .leftJoin(usersTable, eq(batchesTable.createdByUserId, usersTable.id))
    .where(eq(locationsTable.code, "D"))
    .orderBy(desc(batchesTable.createdAt));
  const usedSpawnReferences = new Set(
    (await db.select().from(batchesTable))
      .filter(
        (batch: any) =>
          batch.spawnBatchRef &&
          String(batch.spawnBatchType || "internal") === "internal",
      )
      .map((batch: any) => String(batch.spawnBatchRef)),
  );
  const displayRows = rows.map((row: any) => ({
    ...row,
    status: usedSpawnReferences.has(String(row.batchCode))
      ? "used"
      : row.status,
  }));
  if (req.query.skip === undefined && req.query.limit === undefined)
    return res.json(displayRows);
  const pagination = paginateQuery(req.query);
  return res.json(
    paginatedResponse(
      displayRows.slice(pagination.skip, pagination.skip + pagination.limit),
      displayRows.length,
      pagination,
    ),
  );
});

// ── Create Lab batch (starts in FORMULATION — no stage log yet) ───────────────
router.post("/batches", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const { notes } = req.body as any;
  const [loc] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.code, "D"))
    .limit(1);
  if (!loc) return res.status(400).json({ error: "Location D not found" });
  const existing = await db
    .select()
    .from(batchesTable)
    .innerJoin(locationsTable, eq(batchesTable.locationId, locationsTable.id))
    .where(eq(locationsTable.code, "D"));
  const code = batchCode(existing.length + 1);
  const [batch] = await db
    .insert(batchesTable)
    .values({
      batchCode: code,
      locationId: loc.id,
      currentStage: "FORMULATION",
      status: "active",
      notes: notes ?? null,
      createdByUserId: userId,
    })
    .returning();
  return res.status(201).json(batch);
});

// ── Get Lab batch detail ──────────────────────────────────────────────────────
router.get("/batches/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [batch] = await db
    .select({
      id: batchesTable.id,
      batchCode: batchesTable.batchCode,
      locationId: batchesTable.locationId,
      currentStage: batchesTable.currentStage,
      status: batchesTable.status,
      notes: batchesTable.notes,
      alertLevel: batchesTable.alertLevel,
      createdAt: batchesTable.createdAt,
      stageEnteredAt: batchesTable.stageEnteredAt,
      locationCode: locationsTable.code,
      createdByName: usersTable.displayName,
    })
    .from(batchesTable)
    .innerJoin(locationsTable, eq(batchesTable.locationId, locationsTable.id))
    .leftJoin(usersTable, eq(batchesTable.createdByUserId, usersTable.id))
    .where(eq(batchesTable.id, id))
    .limit(1);
  if (!batch) return res.status(404).json({ error: "Not found" });

  const materials = await db
    .select()
    .from(labBatchMaterialsTable)
    .where(eq(labBatchMaterialsTable.batchId, id))
    .orderBy(labBatchMaterialsTable.id);

  const rawStageLogs = await db
    .select()
    .from(stageLogsTable)
    .where(eq(stageLogsTable.batchId, id))
    .orderBy(stageLogsTable.enteredAt);
  const stageLogs = rawStageLogs.map((l) => ({
    ...l,
    verificationImages: parseImages(l.verificationImages),
  }));

  const spawnOutputs = await db
    .select()
    .from(labSpawnOutputTable)
    .where(eq(labSpawnOutputTable.batchId, id));

  const isUsed = (await db.select().from(batchesTable)).some(
    (candidate: any) =>
      String(candidate.spawnBatchRef || "") === String(batch.batchCode) &&
      String(candidate.spawnBatchType || "internal") === "internal",
  );

  return res.json({
    ...batch,
    status: isUsed ? "used" : batch.status,
    materials,
    stageLogs,
    spawnOutputs,
  });
});

// ── Update Lab batch ──────────────────────────────────────────────────────────
router.patch("/batches/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { status, notes } = req.body as any;
  const updates: Record<string, any> = {};
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  const [updated] = await db
    .update(batchesTable)
    .set(updates)
    .where(eq(batchesTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// ── Delete batch ──────────────────────────────────────────────────────────────
router.delete("/batches/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [batch] = await db
    .select()
    .from(batchesTable)
    .where(eq(batchesTable.id, id))
    .limit(1);
  if (!batch) return res.status(404).json({ error: "Not found" });
  await db.delete(batchesTable).where(eq(batchesTable.id, id));
  return res.status(204).send();
});

// ── Initiate batch: save formulation + move FORMULATION → MEDIA_PREP ─────────
router.post("/batches/:id/initiate", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const userId = (req.session as any).userId;
  const { materials } = req.body as {
    materials?: { name: string; quantityKg: number }[];
  };

  const [batch] = await db
    .select()
    .from(batchesTable)
    .where(eq(batchesTable.id, batchId))
    .limit(1);
  if (!batch) return res.status(404).json({ error: "Not found" });
  if (batch.currentStage !== "FORMULATION") {
    return res.status(400).json({ error: "Batch already initiated" });
  }

  await db.transaction(async (tx) => {
    // Replace any draft materials
    await tx
      .delete(labBatchMaterialsTable)
      .where(eq(labBatchMaterialsTable.batchId, batchId));

    for (const mat of materials ?? []) {
      if (!mat.name || !(mat.quantityKg > 0)) continue;
      await tx.insert(labBatchMaterialsTable).values({
        batchId,
        name: mat.name,
        quantityKg: String(mat.quantityKg),
      });
    }

    // Advance to MEDIA_PREP
    await tx
      .update(batchesTable)
      .set({
        currentStage: "MEDIA_PREP",
        stageEnteredAt: new Date(),
      })
      .where(eq(batchesTable.id, batchId));

    // Open first stage log
    await tx.insert(stageLogsTable).values({
      batchId,
      stage: "MEDIA_PREP",
      enteredByUserId: userId,
    });
  });

  const [updated] = await db
    .select()
    .from(batchesTable)
    .where(eq(batchesTable.id, batchId))
    .limit(1);
  return res.json(updated);
});

// ── Advance Lab batch stage (requires 2 verification photos) ─────────────────
router.post("/batches/:id/advance", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = (req.session as any).userId;
  const {
    nextStage,
    notes,
    verificationImages,
    // QC → COMPLETED extras:
    destination,
    strainName,
    spawnQty,
  } = req.body as any;

  // Require 2 photos for every stage completion
  const imgs: string[] = Array.isArray(verificationImages)
    ? verificationImages.filter(Boolean)
    : [];
  if (imgs.length < 2) {
    return res.status(400).json({
      error: "Two verification photos are required to complete a stage",
    });
  }

  const [batch] = await db
    .select()
    .from(batchesTable)
    .where(eq(batchesTable.id, id))
    .limit(1);
  if (!batch) return res.status(404).json({ error: "Not found" });

  if (batch.currentStage === "FORMULATION") {
    return res
      .status(400)
      .json({ error: "Use /initiate to start this batch first" });
  }

  const currentIdx = LAB_STAGES.indexOf(batch.currentStage as any);
  const nextIdx = LAB_STAGES.indexOf(nextStage);
  if (nextIdx <= currentIdx) {
    return res.status(400).json({ error: "Invalid stage progression" });
  }

  // QC completion requires spawn output details
  if (nextStage === "COMPLETED") {
    if (!spawnQty || Number(spawnQty) <= 0) {
      return res
        .status(400)
        .json({ error: "Spawn quantity is required to complete the batch" });
    }
  }

  await db.transaction(async (tx) => {
    // Close current stage log with photos
    const [currentLog] = await tx
      .select()
      .from(stageLogsTable)
      .where(eq(stageLogsTable.batchId, id))
      .orderBy(desc(stageLogsTable.enteredAt))
      .limit(1);
    if (currentLog) {
      await tx
        .update(stageLogsTable)
        .set({
          exitedAt: new Date(),
          notes: notes ?? null,
          verificationImages: JSON.stringify(imgs),
        })
        .where(eq(stageLogsTable.id, currentLog.id));
    }

    const newStatus = nextStage === "COMPLETED" ? "completed" : "active";
    await tx
      .update(batchesTable)
      .set({
        currentStage: nextStage,
        status: newStatus,
        stageEnteredAt: new Date(),
      })
      .where(eq(batchesTable.id, id));

    // Open next stage log (not needed for COMPLETED)
    if (nextStage !== "COMPLETED") {
      await tx.insert(stageLogsTable).values({
        batchId: id,
        stage: nextStage,
        enteredByUserId: userId,
      });
    }

    // QC → COMPLETED: record spawn output + optionally stock inventory
    if (nextStage === "COMPLETED" && spawnQty) {
      const qtyKg = Number(spawnQty);
      const postingKey = `lab-production:${id}`;
      const [existingPosting] = await tx
        .select()
        .from(spawnVaultTransactionsTable)
        .where(eq(spawnVaultTransactionsTable.transactionKey, postingKey))
        .limit(1);
      if (existingPosting)
        throw new Error(
          "This Lab output was already credited to the Spawn Vault",
        );

      const [output] = await tx
        .insert(labSpawnOutputTable)
        .values({
          batchId: id,
          strainName: strainName ?? "Mixed Spawn",
          quantityKg: String(qtyKg),
          producedAt: new Date().toISOString().split("T")[0],
          status: "stocked",
          notes: notes ?? null,
        })
        .returning();

      const [vaultEntry] = await tx
        .insert(spawnEntriesTable)
        .values({
          strainName: strainName ?? "Mixed Spawn",
          quantityKg: String(qtyKg),
          producedQuantityKg: String(qtyKg),
          source: "Location D Production",
          sourceType: "INTERNAL",
          sourceReferenceType: "LAB_BATCH",
          sourceReferenceId: id,
          sourceReference: batch.batchCode,
          receivedAt: new Date().toISOString().split("T")[0],
          status: "available",
          notes: notes ?? null,
        })
        .returning();
      await tx.insert(spawnVaultTransactionsTable).values({
        transactionKey: postingKey,
        spawnEntryId: vaultEntry.id,
        transactionType: "PRODUCTION_IN",
        quantityInKg: String(qtyKg),
        quantityOutKg: "0",
        balanceAfterKg: String(qtyKg),
        referenceType: "LAB_BATCH",
        referenceId: id,
        reference: batch.batchCode,
        recordedByUserId: userId,
      });

      if (false) {
        // Find or create spawn material in inventory
        const [spawnMat] = await tx
          .select()
          .from(materialsTable)
          .where(ilike(materialsTable.name, "%spawn%"))
          .limit(1);
        const [loc] = await tx
          .select()
          .from(locationsTable)
          .where(eq(locationsTable.code, "D"))
          .limit(1);

        if (spawnMat) {
          const [existing] = await tx
            .select()
            .from(inventoryTable)
            .where(eq(inventoryTable.materialId, spawnMat.id))
            .limit(1);
          if (existing) {
            await tx
              .update(inventoryTable)
              .set({
                quantityOnHand: String(Number(existing.quantityOnHand) + qtyKg),
                lastUpdated: new Date(),
              })
              .where(eq(inventoryTable.id, existing.id));
          } else {
            await tx.insert(inventoryTable).values({
              materialId: spawnMat.id,
              locationId: loc?.id ?? null,
              quantityOnHand: String(qtyKg),
            });
          }
          await tx.insert(inventoryAdjustmentsTable).values({
            materialId: spawnMat.id,
            locationId: loc?.id ?? null,
            quantityDelta: String(qtyKg),
            reason: "production",
            notes: `Lab spawn batch #${id} completed — ${strainName ?? "spawn"} (${qtyKg} kg)`,
            adjustedByUserId: userId,
          });
        }
      }
    }
  });

  const [updated] = await db
    .select()
    .from(batchesTable)
    .where(eq(batchesTable.id, id))
    .limit(1);
  return res.json({ ...updated, completedStage: batch.currentStage });
});

// ── List available spawn outputs (for Annur spawn picker) ─────────────────────
router.get("/available-spawn", requireAuth, async (req, res) => {
  const rows = await db
    .select({
      output: labSpawnOutputTable,
      batchCode: batchesTable.batchCode,
    })
    .from(labSpawnOutputTable)
    .innerJoin(batchesTable, eq(labSpawnOutputTable.batchId, batchesTable.id))
    .where(eq(labSpawnOutputTable.status, "available"))
    .orderBy(desc(labSpawnOutputTable.producedAt));
  const usedSpawnReferences = new Set(
    (await db.select().from(batchesTable))
      .filter(
        (batch: any) =>
          batch.spawnBatchRef &&
          String(batch.spawnBatchType || "internal") === "internal",
      )
      .map((batch: any) => String(batch.spawnBatchRef)),
  );
  return res.json(
    rows
      .filter((r) => !usedSpawnReferences.has(String(r.batchCode)))
      .map((r) => ({
        ...r.output,
        quantityKg: Number(r.output.quantityKg),
        batchCode: r.batchCode,
      })),
  );
});

// ── Record spawn output (legacy, kept for compatibility) ─────────────────────
router.post("/batches/:id/spawn-output", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const { strainName, quantityKg, producedAt, notes } = req.body as any;
  const [output] = await db
    .insert(labSpawnOutputTable)
    .values({
      batchId,
      strainName,
      quantityKg: String(quantityKg),
      producedAt: producedAt ?? null,
      notes: notes ?? null,
    })
    .returning();
  return res.status(201).json(output);
});

// ── Spawn transactions ────────────────────────────────────────────────────────
router.get("/spawn-transactions", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(spawnTransactionsTable)
    .orderBy(desc(spawnTransactionsTable.createdAt));
  return res.json(rows);
});

router.post("/spawn-transactions", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const {
    transactionType,
    strainName,
    quantityKg,
    counterparty,
    unitPrice,
    transactionDate,
    labSpawnOutputId,
    notes,
  } = req.body as any;
  const [tx] = await db
    .insert(spawnTransactionsTable)
    .values({
      transactionType,
      strainName,
      quantityKg: String(quantityKg),
      counterparty: counterparty ?? null,
      unitPrice: unitPrice ?? null,
      transactionDate,
      labSpawnOutputId: labSpawnOutputId ?? null,
      recordedByUserId: userId,
      notes: notes ?? null,
    })
    .returning();
  return res.status(201).json(tx);
});

export default router;
