import { Router } from "express";
import { db } from "@workspace/db";
import {
  ootyRoomsTable,
  ootyGrowingBatchesTable,
  ootyObservationsTable,
  ootyHarvestsTable,
  ootyStageLogsTable,
  ootyBatchSourcesTable,
  phaseApprovalsTable,
  batchLinksTable,
  batchesTable,
  locationsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, inArray, isNull, and } from "@workspace/db";

const router = Router();

const OOTY_STAGE_SEQ = ["SPAWN_RUN", "CASING_RUN", "PINNING_FLUSH1", "FLUSH2", "COOKOUT", "COMPLETED"] as const;

// Map fine-grained stage → coarse phase (for alert system and legacy compat)
function normalizeStage(stage: string): string {
  return stage === "PRONING" ? "PINNING_FLUSH1" : stage;
}

function stageToPhase(stage: string): string {
  stage = normalizeStage(stage);
  if (stage === "SPAWN_RUN") return "SPAWN_RUN";
  if (stage === "CASING_RUN") return "CASING_RUN";
  if (stage === "PINNING_FLUSH1" || stage === "FLUSH2") return "DF";
  if (stage === "COOKOUT") return "COOKOUT";
  if (stage === "COMPLETED") return "COMPLETED";
  return stage;
}

// Map legacy phase → default stage (for backward compat with batches created before this schema)
function phaseToStage(phase: string): string {
  if (phase === "SPAWN_RUN") return "SPAWN_RUN";
  if (phase === "CASING_RUN") return "CASING_RUN";
  if (phase === "DF") return "PINNING_FLUSH1";
  if (phase === "COOKOUT") return "COOKOUT";
  if (phase === "COMPLETED") return "COMPLETED";
  return phase;
}

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

function daysSince(date: Date | string | null) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function alertLevelForRoom(room: any, batch: any) {
  if (!batch) return "gray";
  if (batch.currentPhase === "COMPLETED") return "gray";
  const days = daysSince(batch.phaseEnteredAt);
  if (batch.currentPhase === "SPAWN_RUN" && days !== null && days > 22) return "red";
  if (batch.currentPhase === "SPAWN_RUN" && days !== null && days > 18) return "amber";
  if (batch.currentPhase === "CASING_RUN" && days !== null && days > 10) return "red";
  if (batch.currentPhase === "DF" && days !== null && days > 24) return "red";
  return "teal";
}

function parseStageLog(log: any) {
  return {
    ...log,
    stage: normalizeStage(log.stage),
    verificationImages: log.verificationImages
      ? (() => { try { return JSON.parse(log.verificationImages); } catch { return []; } })()
      : [],
  };
}

// List rooms with current batch state (heatmap data)
router.get("/rooms", requireAuth, async (req, res) => {
  const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.code, "B")).limit(1);
  if (!loc) return res.json([]);

  const rooms = await db.select().from(ootyRoomsTable).where(eq(ootyRoomsTable.locationId, loc.id));

  const result = await Promise.all(rooms.map(async (room) => {
    let currentBatch = null;
    if (room.currentGrowingBatchId) {
      const [b] = await db.select().from(ootyGrowingBatchesTable)
        .where(eq(ootyGrowingBatchesTable.id, room.currentGrowingBatchId)).limit(1);
      if (b) {
        const lastObs = await db.select().from(ootyObservationsTable)
          .where(eq(ootyObservationsTable.growingBatchId, b.id))
          .orderBy(desc(ootyObservationsTable.observationDate)).limit(1);
        // Fetch batch sources with Annur batch codes
        const sources = await db
          .select({
            id: ootyBatchSourcesTable.id,
            annurBatchId: ootyBatchSourcesTable.annurBatchId,
            bagCount: ootyBatchSourcesTable.bagCount,
            batchCode: batchesTable.batchCode,
          })
          .from(ootyBatchSourcesTable)
          .leftJoin(batchesTable, eq(ootyBatchSourcesTable.annurBatchId, batchesTable.id))
          .where(eq(ootyBatchSourcesTable.growingBatchId, b.id));
        currentBatch = {
          ...b,
          dayInPhase: daysSince(b.phaseEnteredAt),
          lastTemperature: lastObs[0]?.temperatureCelsius ?? null,
          batchSources: sources,
        };
      }
    }
    return {
      ...room,
      currentBatch,
      alertLevel: alertLevelForRoom(room, currentBatch),
    };
  }));

  return res.json(result);
});

// Create room
router.post("/rooms", requireAuth, async (req, res) => {
  const { name, capacity, notes } = req.body as any;
  const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.code, "B")).limit(1);
  if (!loc) return res.status(400).json({ error: "Location B not found" });
  const [room] = await db.insert(ootyRoomsTable).values({
    name, locationId: loc.id, capacity: capacity ?? null, notes: notes ?? null,
  }).returning();
  return res.status(201).json(room);
});

// Get room detail
router.get("/rooms/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [room] = await db.select().from(ootyRoomsTable).where(eq(ootyRoomsTable.id, id)).limit(1);
  if (!room) return res.status(404).json({ error: "Not found" });

  const batches = await db.select().from(ootyGrowingBatchesTable)
    .where(eq(ootyGrowingBatchesTable.roomId, id))
    .orderBy(desc(ootyGrowingBatchesTable.createdAt));

  // Enrich active batch with sources
  const enrichedBatches = await Promise.all(batches.map(async (b) => {
    const sources = await db
      .select({
        id: ootyBatchSourcesTable.id,
        annurBatchId: ootyBatchSourcesTable.annurBatchId,
        bagCount: ootyBatchSourcesTable.bagCount,
        batchCode: batchesTable.batchCode,
      })
      .from(ootyBatchSourcesTable)
      .leftJoin(batchesTable, eq(ootyBatchSourcesTable.annurBatchId, batchesTable.id))
      .where(eq(ootyBatchSourcesTable.growingBatchId, b.id));
    return { ...b, batchSources: sources };
  }));

  return res.json({ ...room, batches: enrichedBatches });
});

// Update room
router.patch("/rooms/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, status, capacity, notes, currentGrowingBatchId } = req.body as any;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (status !== undefined) updates.status = status;
  if (capacity !== undefined) updates.capacity = capacity;
  if (notes !== undefined) updates.notes = notes;
  if (currentGrowingBatchId !== undefined) updates.currentGrowingBatchId = currentGrowingBatchId;
  const [room] = await db.update(ootyRoomsTable).set(updates).where(eq(ootyRoomsTable.id, id)).returning();
  return res.json(room);
});

// Delete room
router.delete("/rooms/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [room] = await db.select().from(ootyRoomsTable).where(eq(ootyRoomsTable.id, id)).limit(1);
  if (!room) return res.status(404).json({ error: "Not found" });
  if (room.currentGrowingBatchId) {
    return res.status(409).json({ error: "Cannot delete a room with an active growing batch. Complete or archive the batch first." });
  }

  const batches = await db.select({ id: ootyGrowingBatchesTable.id })
    .from(ootyGrowingBatchesTable)
    .where(eq(ootyGrowingBatchesTable.roomId, id));

  await db.transaction(async (tx) => {
    if (batches.length > 0) {
      const batchIds = batches.map((b) => b.id);
      await tx.update(batchLinksTable)
        .set({ ootyGrowingBatchId: null } as any)
        .where(inArray(batchLinksTable.ootyGrowingBatchId as any, batchIds));
      await tx.delete(ootyGrowingBatchesTable)
        .where(inArray(ootyGrowingBatchesTable.id, batchIds));
    }
    await tx.delete(ootyRoomsTable).where(eq(ootyRoomsTable.id, id));
  });

  return res.status(204).send();
});

// List all growing batches
router.get("/growing-batches", requireAuth, async (req, res) => {
  const rows = await db.select().from(ootyGrowingBatchesTable)
    .orderBy(desc(ootyGrowingBatchesTable.createdAt));
  return res.json(rows);
});

// Create growing batch — accepts batchSources: [{annurBatchId, bagCount}]
router.post("/growing-batches", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const { roomId, annurBatchId, coimBatchId, spawnRunStartDate, notes, batchSources, bagCount } = req.body as any;
  const [room] = await db.select().from(ootyRoomsTable).where(eq(ootyRoomsTable.id, roomId)).limit(1);
  if (!room) return res.status(400).json({ error: "Room not found" });
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const existing = await db.select().from(ootyGrowingBatchesTable);
  const code = `B-${yy}${mm}${dd}-${String(existing.length + 1).padStart(3, "0")}`;

  const result = await db.transaction(async (tx) => {
    const [batch] = await tx.insert(ootyGrowingBatchesTable).values({
      batchCode: code, roomId,
      annurBatchId: annurBatchId ?? null,
      coimBatchId: coimBatchId ?? null,
      currentPhase: "SPAWN_RUN",
      currentStage: "SPAWN_RUN",
      phaseEnteredAt: now,
      status: "active",
      spawnRunStartDate: spawnRunStartDate ?? null,
      notes: notes ?? null,
      createdByUserId: userId,
    }).returning();

    // Create stage log for the initial stage
    await tx.insert(ootyStageLogsTable).values({
      growingBatchId: batch.id,
      stage: "SPAWN_RUN",
      enteredAt: now,
      recordedByUserId: userId,
    });

    // Handle batch sources (many-to-many Annur batch linkage)
    const sources: Array<{ annurBatchId: number; bagCount?: number }> = [];
    if (Array.isArray(batchSources) && batchSources.length > 0) {
      sources.push(...batchSources);
    } else if (annurBatchId) {
      // Backward compat: single annurBatchId field
      sources.push({ annurBatchId: Number(annurBatchId), bagCount: bagCount ?? null });
    }
    for (const src of sources) {
      if (src.annurBatchId) {
        await tx.insert(ootyBatchSourcesTable).values({
          growingBatchId: batch.id,
          annurBatchId: src.annurBatchId,
          bagCount: src.bagCount ?? null,
        });
      }
    }

    // Set room to active
    await tx.update(ootyRoomsTable)
      .set({ status: "active", currentGrowingBatchId: batch.id })
      .where(eq(ootyRoomsTable.id, roomId));

    return batch;
  });

  return res.status(201).json(result);
});

// Get growing batch detail — includes stage logs and batch sources
router.get("/growing-batches/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [batch] = await db.select().from(ootyGrowingBatchesTable).where(eq(ootyGrowingBatchesTable.id, id)).limit(1);
  if (!batch) return res.status(404).json({ error: "Not found" });

  const [observations, harvests, approvals, rawStageLogs, batchSources] = await Promise.all([
    db.select().from(ootyObservationsTable)
      .where(eq(ootyObservationsTable.growingBatchId, id))
      .orderBy(ootyObservationsTable.observationDate),
    db.select().from(ootyHarvestsTable)
      .where(eq(ootyHarvestsTable.growingBatchId, id))
      .orderBy(ootyHarvestsTable.harvestDate),
    db.select().from(phaseApprovalsTable)
      .where(eq(phaseApprovalsTable.entityId, id))
      .orderBy(phaseApprovalsTable.createdAt),
    db.select().from(ootyStageLogsTable)
      .where(eq(ootyStageLogsTable.growingBatchId, id))
      .orderBy(ootyStageLogsTable.enteredAt),
    db.select({
      id: ootyBatchSourcesTable.id,
      annurBatchId: ootyBatchSourcesTable.annurBatchId,
      bagCount: ootyBatchSourcesTable.bagCount,
      batchCode: batchesTable.batchCode,
    })
      .from(ootyBatchSourcesTable)
      .leftJoin(batchesTable, eq(ootyBatchSourcesTable.annurBatchId, batchesTable.id))
      .where(eq(ootyBatchSourcesTable.growingBatchId, id)),
  ]);

  const stageLogs = rawStageLogs.map(parseStageLog);

  // Derive currentStage for legacy batches that have currentStage defaulting to empty
  const effectiveCurrentStage = batch.currentStage && batch.currentStage !== ""
    ? normalizeStage(batch.currentStage)
    : phaseToStage(batch.currentPhase);

  return res.json({
    ...batch,
    currentStage: effectiveCurrentStage,
    dayInPhase: daysSince(batch.phaseEnteredAt),
    observations,
    harvests,
    approvals,
    stageLogs,
    batchSources,
  });
});

// Update growing batch
router.patch("/growing-batches/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { status, notes, casingAppliedDate, cookoutDate, substrateWeightKg } = req.body as any;
  const updates: any = {};
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (casingAppliedDate !== undefined) updates.casingAppliedDate = casingAppliedDate;
  if (cookoutDate !== undefined) updates.cookoutDate = cookoutDate;
  if (substrateWeightKg !== undefined) updates.substrateWeightKg = String(substrateWeightKg);
  const [batch] = await db.update(ootyGrowingBatchesTable).set(updates).where(eq(ootyGrowingBatchesTable.id, id)).returning();
  return res.json(batch);
});

// Advance stage — stage-based, requires 2 verification images
// Accepts: nextStage, verificationImages[], notes, casingBatchRef, harvestData, cookoutDate, substrateWeightKg
router.post("/growing-batches/:id/advance", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = (req.session as any).userId;
  const {
    nextStage, verificationImages, notes,
    casingBatchRef, harvestData,
    cookoutDate, substrateWeightKg,
    // Legacy fields
    nextPhase,
  } = req.body as any;

  const [batch] = await db.select().from(ootyGrowingBatchesTable).where(eq(ootyGrowingBatchesTable.id, id)).limit(1);
  if (!batch) return res.status(404).json({ error: "Not found" });

  // Support legacy nextPhase field (from old approve-phase flow)
  const targetStage = nextStage ?? (nextPhase ? phaseToStage(nextPhase) : null);
  if (!targetStage) return res.status(400).json({ error: "nextStage is required" });

  // Require 2 verification images for all non-COMPLETED transitions
  const imgs: string[] = Array.isArray(verificationImages) ? verificationImages.filter(Boolean) : [];
  if (targetStage !== "COMPLETED" && imgs.length < 2) {
    return res.status(400).json({ error: "Two verification photos are required to complete a stage" });
  }

  const effectiveCurrentStage = batch.currentStage && batch.currentStage !== ""
    ? normalizeStage(batch.currentStage)
    : phaseToStage(batch.currentPhase);

  const now = new Date();
  const nextPhaseValue = stageToPhase(targetStage);
  const phaseChanged = nextPhaseValue !== stageToPhase(effectiveCurrentStage);

  const updated = await db.transaction(async (tx) => {
    // Close the current stage log
    await tx.update(ootyStageLogsTable)
      .set({
        exitedAt: now,
        verificationImages: imgs.length > 0 ? JSON.stringify(imgs) : null,
        notes: notes ?? null,
        casingBatchRef: casingBatchRef ?? null,
        recordedByUserId: userId,
      })
      .where(
        and(
          eq(ootyStageLogsTable.growingBatchId, id),
          isNull(ootyStageLogsTable.exitedAt)
        )
      );

    // Build batch updates
    const batchUpdates: any = {
      currentStage: targetStage,
      currentPhase: nextPhaseValue,
    };
    if (phaseChanged) batchUpdates.phaseEnteredAt = now;
    if (targetStage === "CASING_RUN") batchUpdates.casingAppliedDate = now.toISOString().split("T")[0];
    if (cookoutDate !== undefined && cookoutDate !== null) batchUpdates.cookoutDate = cookoutDate;
    if (substrateWeightKg !== undefined && substrateWeightKg !== null) batchUpdates.substrateWeightKg = String(substrateWeightKg);
    if (targetStage === "COMPLETED") batchUpdates.status = "completed";

    // If completing (COOKOUT→COMPLETED), reset room
    if (targetStage === "COMPLETED") {
      await tx.update(ootyRoomsTable)
        .set({ status: "idle", currentGrowingBatchId: null })
        .where(eq(ootyRoomsTable.id, batch.roomId));
    }

    // Create harvest record for flush completion stages
    if (targetStage === "PINNING_FLUSH1" || targetStage === "FLUSH2") {
      // Harvest data from the stage being EXITED (user logged it on completion of the previous stage)
      // No — harvestData belongs to the stage being completed. The user hits "Complete SPAWN_RUN" and
      // harvest is logged for PINNING_FLUSH1/FLUSH2. Actually let me reconsider:
      // The user hits "Complete PINNING_FLUSH1" → enters harvest data for Flush 1 → we save harvest
      // "Complete FLUSH2" → enters harvest data for Flush 2 → we save harvest
      // So harvest is saved when completing/entering the flush stage? No:
      // PINNING_FLUSH1 is the stage. When they hit Complete on PINNING_FLUSH1, they log harvest for Flush 1.
      // nextStage = FLUSH2 when completing PINNING_FLUSH1.
      // So the harvest data is attached to completing the current stage (effectiveCurrentStage).
    }

    // Save harvest if completing a harvest-requiring stage (PINNING_FLUSH1 or FLUSH2 being exited)
    if (
      (effectiveCurrentStage === "PINNING_FLUSH1" || effectiveCurrentStage === "FLUSH2") &&
      harvestData && harvestData.weightKg
    ) {
      const flushNum = effectiveCurrentStage === "PINNING_FLUSH1" ? 1 : 2;
      const weight = Number(harvestData.weightKg);
      const count = harvestData.mushroomCount ? Number(harvestData.mushroomCount) : null;
      await tx.insert(ootyHarvestsTable).values({
        growingBatchId: id,
        harvestDate: harvestData.harvestDate ?? now.toISOString().split("T")[0],
        weightKg: String(weight),
        mushroomCount: count,
        avgWeightG: count && count > 0 ? String(Math.round((weight * 1000) / count * 10) / 10) : null,
        qualityNote: harvestData.qualityNote ?? null,
        flushNumber: flushNum,
        recordedByUserId: userId,
      });
    }

    const [row] = await tx.update(ootyGrowingBatchesTable)
      .set(batchUpdates)
      .where(eq(ootyGrowingBatchesTable.id, id))
      .returning();

    // Open a new stage log for the next stage (unless completed)
    if (targetStage !== "COMPLETED") {
      await tx.insert(ootyStageLogsTable).values({
        growingBatchId: id,
        stage: targetStage,
        enteredAt: now,
        recordedByUserId: userId,
      });
    }

    return row;
  });

  return res.json(updated);
});

// Add observation
router.post("/growing-batches/:id/observations", requireAuth, async (req, res) => {
  const growingBatchId = Number(req.params.id);
  const userId = (req.session as any).userId;
  const { observationDate, temperatureCelsius, observationNote, observationType } = req.body as any;
  const [obs] = await db.insert(ootyObservationsTable).values({
    growingBatchId, observationDate, temperatureCelsius: temperatureCelsius ? String(temperatureCelsius) : null,
    observationNote: observationNote ?? null, observationType: observationType ?? "daily",
    recordedByUserId: userId,
  }).returning();
  return res.status(201).json(obs);
});

// List observations
router.get("/growing-batches/:id/observations", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select().from(ootyObservationsTable)
    .where(eq(ootyObservationsTable.growingBatchId, id))
    .orderBy(ootyObservationsTable.observationDate);
  return res.json(rows);
});

// Add harvest (manual, standalone — not via stage completion)
router.post("/growing-batches/:id/harvests", requireAuth, async (req, res) => {
  const growingBatchId = Number(req.params.id);
  const userId = (req.session as any).userId;
  const { harvestDate, weightKg, mushroomCount, avgWeightG, qualityNote, flushNumber } = req.body as any;
  const [harvest] = await db.insert(ootyHarvestsTable).values({
    growingBatchId, harvestDate, weightKg: String(weightKg),
    mushroomCount: mushroomCount ?? null, avgWeightG: avgWeightG ? String(avgWeightG) : null,
    qualityNote: qualityNote ?? null, flushNumber: flushNumber ?? 1,
    recordedByUserId: userId,
  }).returning();
  return res.status(201).json(harvest);
});

// List harvests
router.get("/growing-batches/:id/harvests", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select().from(ootyHarvestsTable)
    .where(eq(ootyHarvestsTable.growingBatchId, id))
    .orderBy(ootyHarvestsTable.harvestDate);
  return res.json(rows);
});

// Phase approval (kept for backward compat; new flow uses /advance directly)
router.post("/growing-batches/:id/approve-phase", requireAuth, async (req, res) => {
  const entityId = Number(req.params.id);
  const userId = (req.session as any).userId;
  const { fromPhase, toPhase, decision, rejectionReason } = req.body as any;
  const [batch] = await db.select().from(ootyGrowingBatchesTable).where(eq(ootyGrowingBatchesTable.id, entityId)).limit(1);
  if (!batch) return res.status(404).json({ error: "Not found" });

  const approval = await db.transaction(async (tx) => {
    const [appr] = await tx.insert(phaseApprovalsTable).values({
      entityType: "ooty_growing_batch", entityId, fromPhase, toPhase, decision,
      approvedByUserId: userId, decidedAt: new Date(),
      rejectionReason: rejectionReason ?? null,
    }).returning();
    return appr;
  });
  return res.json(approval);
});

export default router;
