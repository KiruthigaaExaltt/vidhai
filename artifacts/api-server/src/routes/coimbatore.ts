import { Router } from "express";
import { db } from "@workspace/db";
import {
  batchesTable,
  coimbatoreBatchMaterialsTable,
  coimbatoreConfigTable,
  coimbatoreTurnsTable,
  coimbatoreTurnAssignmentsTable,
  coimbatorePreparationStagesTable,
  chambersTable,
  chamberReadingsTable,
  qcDecisionsTable,
  casingSoilTransactionsTable,
  casingSoilInventoryPostingsTable,
  materialsTable,
  locationsTable,
  usersTable,
  inventoryTable,
  inventoryAdjustmentsTable,
} from "@workspace/db";
import { and, eq, desc, gte, ilike, isNull } from "@workspace/db";
import { paginateQuery, paginatedResponse } from "../lib/pagination";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId)
    return res.status(401).json({ error: "Not authenticated" });
  next();
}

function batchCode(locationCode: string, seq: number) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${locationCode}-${yy}${mm}${dd}-${String(seq).padStart(3, "0")}`;
}

function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── Default turn schedule ─────────────────────────────────────────────────────
function defaultTurnSchedule(
  totalTurns: number,
): { turnNumber: number; intervalDays: number }[] {
  return Array.from({ length: totalTurns }, (_, i) => ({
    turnNumber: i + 1,
    intervalDays: i < 4 ? 10 : 6,
  }));
}

// ── List Coimbatore batches ────────────────────────────────────────────────────
router.get("/batches", requireAuth, async (req, res) => {
  const batchRows = await db
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
    .where(eq(locationsTable.code, "C"))
    .orderBy(desc(batchesTable.createdAt));
  const turns = await db
    .select({
      batchId: coimbatoreTurnsTable.batchId,
      turnNumber: coimbatoreTurnsTable.turnNumber,
    })
    .from(coimbatoreTurnsTable);
  const latestTurnByBatch = new Map<number, number>();
  for (const turn of turns) {
    latestTurnByBatch.set(
      turn.batchId,
      Math.max(latestTurnByBatch.get(turn.batchId) ?? 0, turn.turnNumber),
    );
  }
  const batches = batchRows.map((batch: any) => ({
    ...batch,
    currentTurnNumber:
      batch.currentStage === "TURNING"
        ? (latestTurnByBatch.get(batch.id) ?? 0) + 1
        : null,
  }));
  if (req.query.skip === undefined && req.query.limit === undefined)
    return res.json(batches);
  let filtered = batches;
  const { search, stage, status, from, to } = req.query as Record<
    string,
    string | undefined
  >;
  if (search)
    filtered = filtered.filter((row) =>
      row.batchCode.toLowerCase().includes(search.toLowerCase()),
    );
  if (stage) filtered = filtered.filter((row) => row.currentStage === stage);
  if (status) filtered = filtered.filter((row) => row.status === status);
  if (from)
    filtered = filtered.filter(
      (row) => new Date(row.createdAt) >= new Date(from),
    );
  if (to)
    filtered = filtered.filter(
      (row) => new Date(row.createdAt) <= new Date(`${to}T23:59:59.999`),
    );
  const pagination = paginateQuery(req.query);
  return res.json(
    paginatedResponse(
      filtered.slice(pagination.skip, pagination.skip + pagination.limit),
      filtered.length,
      pagination,
    ),
  );
});

// ── Create Coimbatore batch (starts in FORMULATION) ───────────────────────────
router.post("/batches", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const { notes } = req.body as { notes?: string };
  const [loc] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.code, "C"))
    .limit(1);
  if (!loc) return res.status(400).json({ error: "Location C not found" });
  const existing = await db
    .select()
    .from(batchesTable)
    .innerJoin(locationsTable, eq(batchesTable.locationId, locationsTable.id))
    .where(eq(locationsTable.code, "C"));
  const seq = existing.length + 1;
  const code = batchCode("C", seq);
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

// ── Get batch detail ──────────────────────────────────────────────────────────
router.get("/batches/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [batch] = await db
    .select({
      id: batchesTable.id,
      batchCode: batchesTable.batchCode,
      locationId: batchesTable.locationId,
      currentStage: batchesTable.currentStage,
      currentChamberId: batchesTable.currentChamberId,
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
    .select({
      id: coimbatoreBatchMaterialsTable.id,
      batchId: coimbatoreBatchMaterialsTable.batchId,
      materialId: coimbatoreBatchMaterialsTable.materialId,
      weightKg: coimbatoreBatchMaterialsTable.weightKg,
      notes: coimbatoreBatchMaterialsTable.notes,
      materialName: materialsTable.name,
      unit: materialsTable.unit,
    })
    .from(coimbatoreBatchMaterialsTable)
    .leftJoin(
      materialsTable,
      eq(coimbatoreBatchMaterialsTable.materialId, materialsTable.id),
    )
    .where(eq(coimbatoreBatchMaterialsTable.batchId, id));

  const [config] = await db
    .select()
    .from(coimbatoreConfigTable)
    .where(eq(coimbatoreConfigTable.batchId, id))
    .limit(1);

  const rawTurns = await db
    .select()
    .from(coimbatoreTurnsTable)
    .where(eq(coimbatoreTurnsTable.batchId, id))
    .orderBy(coimbatoreTurnsTable.turnNumber);
  const turns = rawTurns.map((t) => ({
    ...t,
    verificationImages: parseImages(t.verificationImages),
  }));

  const [activeChamber] = batch.currentChamberId
    ? await db
        .select()
        .from(chambersTable)
        .where(eq(chambersTable.id, batch.currentChamberId))
        .limit(1)
    : [];
  const [activeAssignment] = await db
    .select()
    .from(coimbatoreTurnAssignmentsTable)
    .where(
      and(
        eq(coimbatoreTurnAssignmentsTable.batchId, id),
        isNull(coimbatoreTurnAssignmentsTable.releasedAt),
      ),
    )
    .limit(1);
  const rawPreparationStages = await db
    .select()
    .from(coimbatorePreparationStagesTable)
    .where(eq(coimbatorePreparationStagesTable.batchId, id))
    .orderBy(coimbatorePreparationStagesTable.completedAt);
  const preparationStages = rawPreparationStages.map((record) => ({
    ...record,
    verificationImages: parseImages(record.verificationImages),
  }));
  // All QC decisions in chronological order (latest first)
  const qcDecisions = await db
    .select()
    .from(qcDecisionsTable)
    .where(eq(qcDecisionsTable.batchId, id))
    .orderBy(desc(qcDecisionsTable.decidedAt));

  return res.json({
    ...batch,
    materials,
    config: config ?? null,
    activeAssignment: activeAssignment ?? null,
    activePreparationAssignment:
      ["PRE_WETTING", "MIXING"].includes(String(batch.currentStage)) &&
      activeChamber
        ? {
            stage: batch.currentStage,
            chamberId: activeChamber.id,
            chamberNameSnapshot: activeChamber.name,
            enteredAt: batch.stageEnteredAt,
          }
        : null,
    preparationStages,
    turns,
    qcDecision: qcDecisions[0] ?? null, // latest — kept for backward compat
    qcDecisions, // full history
  });
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
  // Cascade-deletes handle related rows via FK onDelete: cascade
  await db.delete(batchesTable).where(eq(batchesTable.id, id));
  return res.status(204).send();
});

// ── Update batch ──────────────────────────────────────────────────────────────
router.patch("/batches/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { status, notes, currentStage, alertLevel } = req.body as any;
  const updates: any = {};
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (currentStage !== undefined) {
    updates.currentStage = currentStage;
    updates.stageEnteredAt = new Date();
  }
  if (alertLevel !== undefined) updates.alertLevel = alertLevel;
  const [batch] = await db
    .update(batchesTable)
    .set(updates)
    .where(eq(batchesTable.id, id))
    .returning();
  if (!batch) return res.status(404).json({ error: "Not found" });
  return res.json(batch);
});

// ── Initiate batch: save formulation + move FORMULATION → TURNING ─────────────
router.post("/batches/:id/initiate", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const {
    materials,
    totalTurns: reqTotalTurns,
    turnSchedule: reqSchedule,
    initialTemperatureCelsius,
    initialMoisturePercent,
  } = req.body as {
    materials?: { name: string; weightKg: number }[];
    totalTurns?: number;
    turnSchedule?: { turnNumber: number; intervalDays: number }[];
    initialTemperatureCelsius?: number;
    initialMoisturePercent?: number;
  };

  const initialTemp = Number(initialTemperatureCelsius);
  const initialMoisture = Number(initialMoisturePercent);
  if (!Number.isFinite(initialTemp))
    return res.status(400).json({
      error: "Initial Temperature is required and must be a valid number",
    });
  if (!Number.isFinite(initialMoisture))
    return res.status(400).json({
      error: "Initial Moisture is required and must be a valid number",
    });

  const totalTurns = reqTotalTurns && reqTotalTurns > 0 ? reqTotalTurns : 12;
  const turnSchedule = reqSchedule?.length
    ? reqSchedule
    : defaultTurnSchedule(totalTurns);

  await db.transaction(async (tx) => {
    // Replace existing materials
    await tx
      .delete(coimbatoreBatchMaterialsTable)
      .where(eq(coimbatoreBatchMaterialsTable.batchId, batchId));

    for (const mat of materials ?? []) {
      if (!mat.name || !(mat.weightKg > 0)) continue;
      let [found] = await tx
        .select()
        .from(materialsTable)
        .where(ilike(materialsTable.name, mat.name.trim()))
        .limit(1);
      if (!found) {
        [found] = await tx
          .insert(materialsTable)
          .values({
            name: mat.name.trim(),
            unit: "kg",
            category: "raw_material",
            itemType: "Raw Material",
            itemIdentifier: `VLT-RM-COIM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          })
          .returning();
      }
      await tx.insert(coimbatoreBatchMaterialsTable).values({
        batchId,
        materialId: found.id,
        weightKg: String(mat.weightKg),
        notes: `Formulation material: ${mat.name.trim()}`,
      });
    }

    // Upsert turn config
    const [existing] = await tx
      .select()
      .from(coimbatoreConfigTable)
      .where(eq(coimbatoreConfigTable.batchId, batchId))
      .limit(1);
    if (existing) {
      await tx
        .update(coimbatoreConfigTable)
        .set({
          totalTurns,
          turnScheduleJson: JSON.stringify(turnSchedule),
          initialTemperatureCelsius: String(initialTemp),
          initialMoisturePercent: String(initialMoisture),
        })
        .where(eq(coimbatoreConfigTable.batchId, batchId));
    } else {
      await tx.insert(coimbatoreConfigTable).values({
        batchId,
        totalTurns,
        turnScheduleJson: JSON.stringify(turnSchedule),
        initialTemperatureCelsius: String(initialTemp),
        initialMoisturePercent: String(initialMoisture),
      });
    }

    // Lock formulation and begin Pre-wetting
    await tx
      .update(batchesTable)
      .set({
        currentStage: "PRE_WETTING",
        stageEnteredAt: new Date(),
      })
      .where(eq(batchesTable.id, batchId));
  });

  const [updated] = await db
    .select()
    .from(batchesTable)
    .where(eq(batchesTable.id, batchId))
    .limit(1);
  return res.json(updated);
});

// Assign an idle casing-soil chamber to Pre-wetting or Mixing.
router.post(
  "/batches/:id/preparation/:stage/assign",
  requireAuth,
  async (req, res) => {
    const batchId = Number(req.params.id);
    const stage = String(req.params.stage);
    const chamberId = Number(req.body.chamberId);
    const [batch] = await db
      .select()
      .from(batchesTable)
      .where(eq(batchesTable.id, batchId))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "Not found" });
    if (
      !["PRE_WETTING", "MIXING"].includes(stage) ||
      batch.currentStage !== stage
    )
      return res
        .status(409)
        .json({ error: "Preparation stages must be assigned in order" });
    if (batch.currentChamberId)
      return res.status(409).json({
        error: "This preparation stage already has an assigned chamber",
      });
    const [chamber] = await db
      .select()
      .from(chambersTable)
      .where(eq(chambersTable.id, chamberId))
      .limit(1);
    if (
      !chamber ||
      chamber.locationId !== batch.locationId ||
      chamber.chamberType !== "casing_soil"
    )
      return res
        .status(400)
        .json({ error: "Select a valid Coimbatore casing-soil chamber" });
    const result = await db.transaction(async (tx) => {
      const [occupied] = await tx
        .update(chambersTable)
        .set({
          status: "active",
          currentBatchId: batchId,
          currentTurnNumber: null,
        })
        .where(
          and(
            eq(chambersTable.id, chamberId),
            eq(chambersTable.status, "idle"),
            isNull(chambersTable.currentBatchId),
          ),
        )
        .returning();
      if (!occupied) return null;
      const [updatedBatch] = await tx
        .update(batchesTable)
        .set({ currentChamberId: chamberId })
        .where(
          and(
            eq(batchesTable.id, batchId),
            isNull(batchesTable.currentChamberId),
          ),
        )
        .returning();
      if (!updatedBatch) return null;
      return {
        stage,
        chamberId,
        chamberNameSnapshot: occupied.name,
        enteredAt: batch.stageEnteredAt,
      };
    });
    if (!result)
      return res.status(409).json({
        error: "That casing-soil chamber is already occupied or unavailable",
      });
    return res.status(201).json(result);
  },
);

// Complete the required preparation gates in sequence.
router.post(
  "/batches/:id/complete-preparation",
  requireAuth,
  async (req, res) => {
    const id = Number(req.params.id);
    const userId = (req.session as any).userId;
    const { stage, notes, verificationImages } = req.body as any;
    const images: string[] = Array.isArray(verificationImages)
      ? verificationImages.filter(Boolean).slice(0, 2)
      : [];
    const [batch] = await db
      .select()
      .from(batchesTable)
      .where(eq(batchesTable.id, id))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "Not found" });
    if (
      stage !== batch.currentStage ||
      !["PRE_WETTING", "MIXING"].includes(String(stage))
    )
      return res
        .status(409)
        .json({ error: "Preparation stages must be completed in order" });
    if (!batch.currentChamberId)
      return res.status(409).json({
        error: `Select an available casing-soil chamber before completing ${stage === "PRE_WETTING" ? "Pre-wetting" : "Mixing"}`,
      });
    const [chamber] = await db
      .select()
      .from(chambersTable)
      .where(eq(chambersTable.id, batch.currentChamberId))
      .limit(1);
    if (!chamber || chamber.currentBatchId !== id)
      return res.status(409).json({
        error: "The assigned preparation chamber is no longer active",
      });
    const [reading] = await db
      .select()
      .from(chamberReadingsTable)
      .where(
        and(
          eq(chamberReadingsTable.chamberId, chamber.id),
          eq(chamberReadingsTable.batchId, id),
          isNull(chamberReadingsTable.turnNumber),
          gte(chamberReadingsTable.recordedAt, batch.stageEnteredAt),
        ),
      )
      .orderBy(desc(chamberReadingsTable.recordedAt))
      .limit(1);
    if (!reading)
      return res.status(400).json({
        error:
          "Log a chamber reading in the assigned chamber before completing this stage",
      });
    const nextStage = stage === "PRE_WETTING" ? "MIXING" : "TURNING";
    const completedAt = new Date();
    const result = await db.transaction(async (tx) => {
      const [history] = await tx
        .insert(coimbatorePreparationStagesTable)
        .values({
          batchId: id,
          stage,
          chamberId: chamber.id,
          chamberNameSnapshot: chamber.name,
          enteredAt: batch.stageEnteredAt,
          readingId: reading.id,
          notes: notes ?? reading.notes ?? null,
          verificationImages: JSON.stringify(images),
          recordedByUserId: userId,
          completedAt,
        })
        .returning();
      await tx
        .update(chambersTable)
        .set({ status: "idle", currentBatchId: null, currentTurnNumber: null })
        .where(
          and(
            eq(chambersTable.id, chamber.id),
            eq(chambersTable.currentBatchId, id),
          ),
        );
      const [updated] = await tx
        .update(batchesTable)
        .set({
          currentStage: nextStage,
          stageEnteredAt: completedAt,
          currentChamberId: null,
        })
        .where(eq(batchesTable.id, id))
        .returning();
      return { updated, history: { ...history, verificationImages: images } };
    });
    return res.json(result);
  },
);

// List materials for a batch
router.get("/batches/:id/materials", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select({
      id: coimbatoreBatchMaterialsTable.id,
      batchId: coimbatoreBatchMaterialsTable.batchId,
      materialId: coimbatoreBatchMaterialsTable.materialId,
      weightKg: coimbatoreBatchMaterialsTable.weightKg,
      notes: coimbatoreBatchMaterialsTable.notes,
      materialName: materialsTable.name,
      unit: materialsTable.unit,
    })
    .from(coimbatoreBatchMaterialsTable)
    .leftJoin(
      materialsTable,
      eq(coimbatoreBatchMaterialsTable.materialId, materialsTable.id),
    )
    .where(eq(coimbatoreBatchMaterialsTable.batchId, id));
  return res.json(rows);
});

// ── Add material ──────────────────────────────────────────────────────────────
router.post("/batches/:id/materials", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const { materialId, weightKg, notes } = req.body as any;
  const [row] = await db
    .insert(coimbatoreBatchMaterialsTable)
    .values({
      batchId,
      materialId,
      weightKg: String(weightKg),
      notes: notes ?? null,
    })
    .returning();
  return res.status(201).json(row);
});

// ── Delete material ───────────────────────────────────────────────────────────
router.delete(
  "/batches/:id/materials/:materialId",
  requireAuth,
  async (req, res) => {
    const id = Number(req.params.materialId);
    await db
      .delete(coimbatoreBatchMaterialsTable)
      .where(eq(coimbatoreBatchMaterialsTable.id, id));
    return res.status(204).send();
  },
);

// ── Set turn config ───────────────────────────────────────────────────────────
router.put("/batches/:id/config", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const { totalTurns, turnScheduleJson } = req.body as any;
  const existing = await db
    .select()
    .from(coimbatoreConfigTable)
    .where(eq(coimbatoreConfigTable.batchId, batchId))
    .limit(1);
  let row;
  if (existing.length > 0) {
    [row] = await db
      .update(coimbatoreConfigTable)
      .set({
        totalTurns,
        turnScheduleJson: JSON.stringify(turnScheduleJson ?? []),
      })
      .where(eq(coimbatoreConfigTable.batchId, batchId))
      .returning();
  } else {
    [row] = await db
      .insert(coimbatoreConfigTable)
      .values({
        batchId,
        totalTurns,
        turnScheduleJson: JSON.stringify(turnScheduleJson ?? []),
      })
      .returning();
  }
  return res.json(row);
});

// ── List turns ────────────────────────────────────────────────────────────────
router.get("/batches/:id/turns", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const turns = await db
    .select()
    .from(coimbatoreTurnsTable)
    .where(eq(coimbatoreTurnsTable.batchId, id))
    .orderBy(coimbatoreTurnsTable.turnNumber);
  return res.json(
    turns.map((t) => ({
      ...t,
      verificationImages: parseImages(t.verificationImages),
    })),
  );
});

// Assign an available Location C casing-soil chamber to the next turn.
router.post(
  "/batches/:id/turns/:turnNumber/assign",
  requireAuth,
  async (req, res) => {
    const batchId = Number(req.params.id);
    const turnNumber = Number(req.params.turnNumber);
    const chamberId = Number(req.body.chamberId);
    const [batch] = await db
      .select()
      .from(batchesTable)
      .where(eq(batchesTable.id, batchId))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.currentStage !== "TURNING")
      return res.status(409).json({ error: "Batch is not ready for turning" });
    if (batch.currentChamberId)
      return res
        .status(409)
        .json({ error: "The current turn already has an assigned chamber" });
    const completedTurns = await db
      .select()
      .from(coimbatoreTurnsTable)
      .where(eq(coimbatoreTurnsTable.batchId, batchId));
    const expectedTurn = completedTurns.length + 1;
    if (turnNumber !== expectedTurn)
      return res
        .status(409)
        .json({ error: `T${turnNumber} cannot start before T${expectedTurn}` });
    const [location] = await db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.code, "C"))
      .limit(1);
    if (!location)
      return res
        .status(409)
        .json({ error: "Coimbatore location was not found" });
    const result = await db.transaction(async (tx) => {
      const [occupied] = await tx
        .update(chambersTable)
        .set({
          status: "active",
          currentBatchId: batchId,
          currentTurnNumber: turnNumber,
        })
        .where(
          and(
            eq(chambersTable.id, chamberId),
            eq(chambersTable.locationId, location.id),
            eq(chambersTable.chamberType, "casing_soil"),
            eq(chambersTable.status, "idle"),
            isNull(chambersTable.currentBatchId),
          ),
        )
        .returning();
      if (!occupied) return null;
      const [assignment] = await tx
        .insert(coimbatoreTurnAssignmentsTable)
        .values({
          batchId,
          turnNumber,
          chamberId,
          chamberNameSnapshot: occupied.name,
        })
        .returning();
      const [updatedBatch] = await tx
        .update(batchesTable)
        .set({ currentChamberId: chamberId })
        .where(
          and(
            eq(batchesTable.id, batchId),
            isNull(batchesTable.currentChamberId),
          ),
        )
        .returning();
      if (!updatedBatch) return null;
      return { assignment, chamber: occupied };
    });
    if (!result)
      return res.status(409).json({
        error: "That casing-soil chamber is already occupied or unavailable",
      });
    return res.status(201).json(result);
  },
);
// ── Record a turn (sequential, requires 2 images) ─────────────────────────────
router.post("/batches/:id/turns", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const [activeBatch] = await db
    .select()
    .from(batchesTable)
    .where(eq(batchesTable.id, batchId))
    .limit(1);
  if (!activeBatch) return res.status(404).json({ error: "Not found" });
  if (activeBatch.currentStage !== "TURNING")
    return res.status(409).json({
      error: "Pre-wetting and Mixing must be completed before Turning",
    });
  const userId = (req.session as any).userId;
  const { turnNumber, actualDate, notes, verificationImages } = req.body as any;
  // Verification photos are optional and retained when supplied.
  const imgs: string[] = Array.isArray(verificationImages)
    ? verificationImages.filter(Boolean).slice(0, 2)
    : [];

  // Enforce sequential completion
  const existingTurns = await db
    .select()
    .from(coimbatoreTurnsTable)
    .where(eq(coimbatoreTurnsTable.batchId, batchId));
  const expectedNext = existingTurns.length + 1;
  if (Number(turnNumber) !== expectedNext) {
    return res.status(400).json({
      error: `Turns must be completed in order — next expected: T${expectedNext}`,
    });
  }

  const [assignment] = await db
    .select()
    .from(coimbatoreTurnAssignmentsTable)
    .where(
      and(
        eq(coimbatoreTurnAssignmentsTable.batchId, batchId),
        eq(coimbatoreTurnAssignmentsTable.turnNumber, Number(turnNumber)),
        isNull(coimbatoreTurnAssignmentsTable.releasedAt),
      ),
    )
    .limit(1);
  if (!assignment || activeBatch.currentChamberId !== assignment.chamberId)
    return res.status(409).json({
      error: `Select an available casing-soil chamber before completing T${turnNumber}`,
    });
  const [reading] = await db
    .select()
    .from(chamberReadingsTable)
    .where(
      and(
        eq(chamberReadingsTable.chamberId, assignment.chamberId),
        eq(chamberReadingsTable.batchId, batchId),
        eq(chamberReadingsTable.turnNumber, Number(turnNumber)),
      ),
    )
    .orderBy(desc(chamberReadingsTable.recordedAt))
    .limit(1);
  if (!reading)
    return res.status(400).json({
      error:
        "Log a chamber reading in the assigned chamber before completing this turn",
    });
  const [config] = await db
    .select()
    .from(coimbatoreConfigTable)
    .where(eq(coimbatoreConfigTable.batchId, batchId))
    .limit(1);
  const totalTurns = config?.totalTurns ?? 12;

  const result = await db.transaction(async (tx) => {
    const completedAt = new Date();
    const [turn] = await tx
      .insert(coimbatoreTurnsTable)
      .values({
        batchId,
        turnNumber: Number(turnNumber),
        actualDate: actualDate ?? completedAt.toISOString().split("T")[0],
        chamberId: assignment.chamberId,
        chamberNameSnapshot: assignment.chamberNameSnapshot,
        enteredAt: assignment.enteredAt,
        completedAt,
        readingId: reading.id,
        temperatureCelsius: reading.temperatureCelsius,
        nh3Ppm: reading.nh3Ppm,
        co2Percent: reading.co2Percent,
        moisturePercent: reading.humidity,
        notes: notes ?? reading.notes ?? null,
        verificationImages: JSON.stringify(imgs),
        recordedByUserId: userId,
      })
      .returning();
    await tx
      .update(chambersTable)
      .set({ status: "idle", currentBatchId: null, currentTurnNumber: null })
      .where(
        and(
          eq(chambersTable.id, assignment.chamberId),
          eq(chambersTable.currentBatchId, batchId),
        ),
      );
    await tx
      .update(coimbatoreTurnAssignmentsTable)
      .set({ releasedAt: completedAt })
      .where(eq(coimbatoreTurnAssignmentsTable.id, assignment.id));
    await tx
      .update(batchesTable)
      .set({ currentChamberId: null })
      .where(eq(batchesTable.id, batchId));

    // Auto-advance to QC_PENDING when all planned turns are done
    if (Number(turnNumber) >= totalTurns) {
      await tx
        .update(batchesTable)
        .set({
          currentStage: "QC_PENDING",
          stageEnteredAt: new Date(),
        })
        .where(eq(batchesTable.id, batchId));
    }

    return { ...turn, verificationImages: imgs };
  });

  return res.status(201).json(result);
});

// ── Submit QC decision ────────────────────────────────────────────────────────
// APPROVE: adds produced qty to inventory, marks batch COMPLETED
// REJECT:  adds 3 more turns, returns batch to TURNING
router.post("/batches/:id/qc", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const userId = (req.session as any).userId;
  const { decision, notes, producedQuantityKg } = req.body as any;
  const [decisionBatch] = await db
    .select()
    .from(batchesTable)
    .where(eq(batchesTable.id, batchId))
    .limit(1);
  if (!decisionBatch) return res.status(404).json({ error: "Batch not found" });
  if (
    decisionBatch.currentStage !== "QC_PENDING" ||
    decisionBatch.status !== "active"
  )
    return res
      .status(409)
      .json({ error: "This casing-soil batch is not awaiting QC" });

  if (decision === "approve") {
    const [qcBatch] = await db
      .select()
      .from(batchesTable)
      .where(eq(batchesTable.id, batchId))
      .limit(1);
    if (!qcBatch) return res.status(404).json({ error: "Batch not found" });
    if (qcBatch.currentStage !== "QC_PENDING" || qcBatch.status !== "active")
      return res
        .status(409)
        .json({ error: "This casing-soil batch is not awaiting QC" });
    const postingKey = `coimbatore-output:${batchId}`;
    const [existingOutput] = await db
      .select()
      .from(casingSoilInventoryPostingsTable)
      .where(eq(casingSoilInventoryPostingsTable.postingKey, postingKey))
      .limit(1);
    if (existingOutput)
      return res
        .status(409)
        .json({ error: "Casing-soil inventory output was already posted" });
    // Determine produced quantity (user-entered or fallback to formulation total)
    const mats = await db
      .select()
      .from(coimbatoreBatchMaterialsTable)
      .where(eq(coimbatoreBatchMaterialsTable.batchId, batchId));
    const formulationKg = mats.reduce((s, m) => s + Number(m.weightKg), 0);
    const qtyKg = producedQuantityKg
      ? Number(producedQuantityKg)
      : formulationKg;

    // Find casing soil finished-product material (by name pattern)
    const [casingMaterial] = await db
      .select()
      .from(materialsTable)
      .where(ilike(materialsTable.name, "%casing soil%"))
      .limit(1);

    const [loc] = await db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.code, "C"))
      .limit(1);

    await db.transaction(async (tx) => {
      await tx.insert(casingSoilInventoryPostingsTable).values({
        postingKey,
        batchId,
        inventoryId: null,
        inventoryAdjustmentId: null,
        quantityKg: String(qtyKg),
      });
      // Record QC decision
      await tx.insert(qcDecisionsTable).values({
        batchId,
        moduleType: "coimbatore",
        decision,
        notes: notes ?? null,
        decidedByUserId: userId,
      });

      // Add to inventory if the finished-product material exists.
      if (casingMaterial && qtyKg > 0) {
        let [stock] = await tx
          .select()
          .from(inventoryTable)
          .where(eq(inventoryTable.materialId, casingMaterial.id))
          .limit(1);
        if (stock) {
          [stock] = await tx
            .update(inventoryTable)
            .set({
              quantityOnHand: String(Number(stock.quantityOnHand) + qtyKg),
              lastUpdated: new Date(),
            })
            .where(eq(inventoryTable.id, stock.id))
            .returning();
        } else {
          [stock] = await tx
            .insert(inventoryTable)
            .values({
              materialId: casingMaterial.id,
              locationId: loc?.id ?? null,
              quantityOnHand: String(qtyKg),
            })
            .returning();
        }
        const [adjustment] = await tx
          .insert(inventoryAdjustmentsTable)
          .values({
            materialId: casingMaterial.id,
            locationId: loc?.id ?? null,
            quantityDelta: String(qtyKg),
            reason: "production",
            notes: `QC-approved production from casing soil batch #${batchId}`,
            adjustedByUserId: userId,
          })
          .returning();
        await tx
          .update(casingSoilInventoryPostingsTable)
          .set({
            inventoryId: stock.id,
            inventoryAdjustmentId: adjustment.id,
          })
          .where(eq(casingSoilInventoryPostingsTable.postingKey, postingKey));
      }

      // Record produce transaction (always, for financial log)
      await tx.insert(casingSoilTransactionsTable).values({
        transactionType: "produce",
        quantityKg: String(qtyKg),
        transactionDate: new Date().toISOString().split("T")[0],
        coimbatoreBatchId: batchId,
        notes: notes ?? null,
        recordedByUserId: userId,
      });

      // Mark batch COMPLETED
      await tx
        .update(batchesTable)
        .set({
          currentStage: "COMPLETED",
          status: "completed",
          stageEnteredAt: new Date(),
        })
        .where(eq(batchesTable.id, batchId));
    });

    return res.json({ decision, qtyKg, stockedToInventory: !!casingMaterial });
  } else {
    // REJECT: extend turn schedule by 3 turns, return to TURNING
    const [config] = await db
      .select()
      .from(coimbatoreConfigTable)
      .where(eq(coimbatoreConfigTable.batchId, batchId))
      .limit(1);
    const existingTurns = await db
      .select()
      .from(coimbatoreTurnsTable)
      .where(eq(coimbatoreTurnsTable.batchId, batchId));
    const currentTotal = config?.totalTurns ?? 12;
    const newTotal = existingTurns.length + 3; // 3 additional turns required

    await db.transaction(async (tx) => {
      await tx.insert(qcDecisionsTable).values({
        batchId,
        moduleType: "coimbatore",
        decision,
        notes: notes ?? null,
        decidedByUserId: userId,
      });

      // Extend the turn schedule config
      if (config) {
        const schedule: { turnNumber: number; intervalDays: number }[] =
          (() => {
            try {
              return JSON.parse(config.turnScheduleJson ?? "[]");
            } catch {
              return [];
            }
          })();
        for (let t = currentTotal + 1; t <= newTotal; t++) {
          if (!schedule.find((s) => s.turnNumber === t)) {
            schedule.push({ turnNumber: t, intervalDays: 6 });
          }
        }
        await tx
          .update(coimbatoreConfigTable)
          .set({
            totalTurns: newTotal,
            turnScheduleJson: JSON.stringify(schedule),
          })
          .where(eq(coimbatoreConfigTable.batchId, batchId));
      }

      // Return to TURNING
      await tx
        .update(batchesTable)
        .set({
          currentStage: "TURNING",
          stageEnteredAt: new Date(),
        })
        .where(eq(batchesTable.id, batchId));
    });

    return res.json({ decision, newTotal });
  }
});

// ── List casing soil transactions ─────────────────────────────────────────────
router.get("/soil-transactions", requireAuth, async (req, res) => {
  const rows = await db
    .select({
      tx: casingSoilTransactionsTable,
      recordedByName: usersTable.displayName,
    })
    .from(casingSoilTransactionsTable)
    .leftJoin(
      usersTable,
      eq(casingSoilTransactionsTable.recordedByUserId, usersTable.id),
    )
    .orderBy(desc(casingSoilTransactionsTable.createdAt));

  return res.json(
    rows.map((r) => ({
      ...r.tx,
      quantityKg: Number(r.tx.quantityKg),
      unitPrice: r.tx.unitPrice ? Number(r.tx.unitPrice) : null,
      totalCost: r.tx.totalCost ? Number(r.tx.totalCost) : null,
      recordedByName: r.recordedByName ?? null,
    })),
  );
});

// ── Create casing soil transaction ────────────────────────────────────────────
router.post("/soil-transactions", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const {
    transactionType,
    quantityKg,
    counterparty,
    unitPrice,
    totalCost,
    transactionDate,
    coimbatoreBatchId,
    notes,
  } = req.body as any;

  const [tx] = await db
    .insert(casingSoilTransactionsTable)
    .values({
      transactionType,
      quantityKg: String(quantityKg),
      counterparty: counterparty ?? null,
      unitPrice: unitPrice != null ? String(unitPrice) : null,
      totalCost:
        totalCost != null
          ? String(totalCost)
          : unitPrice && quantityKg
            ? String(Number(unitPrice) * Number(quantityKg))
            : null,
      transactionDate,
      coimbatoreBatchId: coimbatoreBatchId ?? null,
      notes: notes ?? null,
      recordedByUserId: userId,
    })
    .returning();

  return res.status(201).json(tx);
});

export default router;
