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
  inventoryLocationsTable,
  casingSoilInventorySourcesTable,
} from "@workspace/db";
import { and, eq, desc, gte, ilike, isNull } from "@workspace/db";
import { paginateQuery, paginatedResponse } from "../lib/pagination";
import { ensureDefaultVaultItems } from "../lib/ensureDefaultVaultItems";

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
function numericValue(value: unknown): number | null {
  const raw =
    value && typeof value === "object" && "$numberDecimal" in value
      ? (value as { $numberDecimal: unknown }).$numberDecimal
      : value;
  if (raw === null || raw === undefined || raw === "") return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}
function parseTurnScheduleValue(
  value: unknown,
): { turnNumber: number; intervalDays: number }[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (entry) =>
              Number.isInteger(Number(entry?.turnNumber)) &&
              Number.isFinite(Number(entry?.intervalDays)),
          )
          .map((entry) => ({
            turnNumber: Number(entry.turnNumber),
            intervalDays: Number(entry.intervalDays),
          }))
      : [];
  } catch {
    return [];
  }
}
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
  const { notes, chamberId: rawChamberId } = req.body as {
    notes?: string;
    chamberId?: number;
  };
  const chamberId = Number(rawChamberId);
  if (!Number.isInteger(chamberId) || chamberId <= 0)
    return res.status(400).json({ error: "Casing Soil Chamber is required" });
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
  const code = batchCode("C", existing.length + 1);
  const result = await db
    .transaction(async (tx) => {
      const [chamber] = await tx
        .select()
        .from(chambersTable)
        .where(
          and(
            eq(chambersTable.id, chamberId),
            eq(chambersTable.locationId, loc.id),
            eq(chambersTable.chamberType, "casing_soil"),
          ),
        )
        .limit(1);
      if (!chamber)
        return {
          error: "Select a valid Coimbatore casing-soil chamber",
        } as const;
      const [batch] = await tx
        .insert(batchesTable)
        .values({
          batchCode: code,
          locationId: loc.id,
          currentStage: "FORMULATION",
          status: "active",
          notes: notes ?? null,
          createdByUserId: userId,
          currentChamberId: chamberId,
          casingSoilChamberId: chamberId,
          casingSoilChamberNameSnapshot: chamber.name,
        })
        .returning();
      const [reserved] = await tx
        .update(chambersTable)
        .set({
          status: "active",
          currentBatchId: batch.id,
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
      if (!reserved)
        throw new Error(
          `${chamber.name} is currently assigned to another active batch. Please select another available chamber.`,
        );
      return { batch } as const;
    })
    .catch(
      (error: any) =>
        ({ error: error?.message || "Unable to reserve chamber" }) as const,
    );
  if ("error" in result) return res.status(409).json({ error: result.error });
  return res.status(201).json(result.batch);
});

// Get batch detail ──────────────────────────────────────────────────────────
router.get("/batches/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [batch] = await db
    .select({
      id: batchesTable.id,
      batchCode: batchesTable.batchCode,
      locationId: batchesTable.locationId,
      currentStage: batchesTable.currentStage,
      currentChamberId: batchesTable.currentChamberId,
      casingSoilChamberId: batchesTable.casingSoilChamberId,
      casingSoilChamberNameSnapshot: batchesTable.casingSoilChamberNameSnapshot,
      casingSoilStartedAt: batchesTable.casingSoilStartedAt,
      casingSoilCompletedAt: batchesTable.casingSoilCompletedAt,
      casingSoilProducedQuantityKg: batchesTable.casingSoilProducedQuantityKg,
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

  const rawMaterials = await db
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
  const materials = rawMaterials.map((material) => ({
    ...material,
    weightKg: numericValue(material.weightKg),
  }));

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
    temperatureCelsius: numericValue(t.temperatureCelsius),
    nh3Ppm: numericValue(t.nh3Ppm),
    co2Percent: numericValue(t.co2Percent),
    moisturePercent: numericValue(t.moisturePercent),
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
    config: config
      ? {
          ...config,
          initialTemperatureCelsius: numericValue(
            config.initialTemperatureCelsius,
          ),
          initialMoisturePercent: numericValue(config.initialMoisturePercent),
        }
      : null,
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
  await db.transaction(async (tx) => {
    await tx
      .update(chambersTable)
      .set({
        status: "idle",
        currentBatchId: null,
        currentTurnNumber: null,
      })
      .where(eq(chambersTable.currentBatchId, id));
    // Cascade-deletes handle related rows via FK onDelete: cascade.
    await tx.delete(batchesTable).where(eq(batchesTable.id, id));
  });
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

  const [batch] = await db
    .select()
    .from(batchesTable)
    .where(eq(batchesTable.id, batchId))
    .limit(1);
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  if (
    !batch.casingSoilChamberId ||
    batch.currentChamberId !== batch.casingSoilChamberId
  )
    return res.status(409).json({
      error:
        "The assigned Casing Soil Chamber is no longer reserved for this batch",
    });
  const [assignedChamber] = await db
    .select()
    .from(chambersTable)
    .where(eq(chambersTable.id, batch.casingSoilChamberId))
    .limit(1);
  if (!assignedChamber || assignedChamber.currentBatchId !== batchId)
    return res
      .status(409)
      .json({ error: "The assigned Casing Soil Chamber is unavailable" });

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
        casingSoilStartedAt: batch.casingSoilStartedAt ?? new Date(),
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
        .set({
          currentChamberId: chamberId,
          casingSoilChamberId: chamberId,
          casingSoilChamberNameSnapshot: occupied.name,
          casingSoilStartedAt:
            batch.casingSoilStartedAt ?? batch.stageEnteredAt ?? new Date(),
        })
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
          readingId: reading?.id ?? null,
          notes: notes ?? reading?.notes ?? null,
          verificationImages: JSON.stringify(images),
          recordedByUserId: userId,
          completedAt,
        })
        .returning();
      await tx
        .update(chambersTable)
        .set({ currentTurnNumber: nextStage === "TURNING" ? 1 : null })
        .where(
          and(
            eq(chambersTable.id, chamber.id),
            eq(chambersTable.currentBatchId, id),
          ),
        );
      if (nextStage === "TURNING") {
        await tx.insert(coimbatoreTurnAssignmentsTable).values({
          batchId: id,
          turnNumber: 1,
          chamberId: chamber.id,
          chamberNameSnapshot:
            batch.casingSoilChamberNameSnapshot ?? chamber.name,
          enteredAt: completedAt,
        });
      }
      const [updated] = await tx
        .update(batchesTable)
        .set({
          currentStage: nextStage,
          stageEnteredAt: completedAt,
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
        .set({
          currentChamberId: chamberId,
          casingSoilChamberId: chamberId,
          casingSoilChamberNameSnapshot: occupied.name,
          casingSoilStartedAt:
            batch.casingSoilStartedAt ?? batch.stageEnteredAt ?? new Date(),
        })
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
        readingId: reading?.id ?? null,
        temperatureCelsius: reading?.temperatureCelsius ?? null,
        nh3Ppm: reading?.nh3Ppm ?? null,
        co2Percent: reading?.co2Percent ?? null,
        moisturePercent: reading?.humidity ?? null,
        notes: notes ?? reading?.notes ?? null,
        verificationImages: JSON.stringify(imgs),
        recordedByUserId: userId,
      })
      .returning();
    await tx
      .update(coimbatoreTurnAssignmentsTable)
      .set({ releasedAt: completedAt })
      .where(eq(coimbatoreTurnAssignmentsTable.id, assignment.id));

    // The physical chamber remains occupied by this batch for its full lifecycle.
    if (Number(turnNumber) >= totalTurns) {
      await tx
        .update(chambersTable)
        .set({ currentTurnNumber: null })
        .where(
          and(
            eq(chambersTable.id, assignment.chamberId),
            eq(chambersTable.currentBatchId, batchId),
          ),
        );
      await tx
        .update(batchesTable)
        .set({ currentStage: "QC_PENDING", stageEnteredAt: completedAt })
        .where(eq(batchesTable.id, batchId));
    } else {
      const nextTurn = Number(turnNumber) + 1;
      await tx
        .update(chambersTable)
        .set({ currentTurnNumber: nextTurn })
        .where(
          and(
            eq(chambersTable.id, assignment.chamberId),
            eq(chambersTable.currentBatchId, batchId),
          ),
        );
      await tx.insert(coimbatoreTurnAssignmentsTable).values({
        batchId,
        turnNumber: nextTurn,
        chamberId: assignment.chamberId,
        chamberNameSnapshot:
          activeBatch.casingSoilChamberNameSnapshot ??
          assignment.chamberNameSnapshot,
        enteredAt: completedAt,
      });
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
  if (decision !== "approve" && decision !== "reject")
    return res.status(400).json({ error: "Select Approve or Reject" });

  const postingKey = `coimbatore-output:${batchId}`;
  if (decision === "approve") {
    await ensureDefaultVaultItems();
    const [existingOutput] = await db
      .select()
      .from(casingSoilInventoryPostingsTable)
      .where(eq(casingSoilInventoryPostingsTable.postingKey, postingKey))
      .limit(1);
    if (existingOutput)
      return res.json({
        decision: "approve",
        qtyKg: Number(existingOutput.quantityKg),
        alreadyPosted: true,
      });
  }

  const [batch] = await db
    .select()
    .from(batchesTable)
    .where(eq(batchesTable.id, batchId))
    .limit(1);
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  if (batch.currentStage !== "QC_PENDING" || batch.status !== "active")
    return res
      .status(409)
      .json({ error: "This casing-soil batch is not awaiting QC" });
  if (
    !batch.casingSoilChamberId ||
    batch.currentChamberId !== batch.casingSoilChamberId
  )
    return res.status(409).json({
      error: "The batch-level Casing Soil Chamber assignment is missing",
    });
  const [chamber] = await db
    .select()
    .from(chambersTable)
    .where(eq(chambersTable.id, batch.casingSoilChamberId))
    .limit(1);
  if (!chamber || chamber.currentBatchId !== batchId)
    return res.status(409).json({
      error: "The assigned Casing Soil Chamber is not occupied by this batch",
    });

  if (decision === "approve") {
    const qtyKg = Number(producedQuantityKg);
    if (!Number.isFinite(qtyKg) || qtyKg <= 0)
      return res
        .status(400)
        .json({ error: "Final Produced Quantity must be greater than 0 kg" });
    const [casingMaterial] = await db
      .select()
      .from(materialsTable)
      .where(ilike(materialsTable.name, "%casing soil%"))
      .limit(1);
    if (!casingMaterial)
      return res.status(409).json({
        error: "Casing Soil material is missing from Item & Product Master",
      });
    const warehouses = await db.select().from(inventoryLocationsTable);
    const warehouse =
      warehouses.find(
        (row: any) =>
          String(row.systemCode ?? "").toUpperCase() === "COIMBATORE",
      ) ??
      warehouses.find((row: any) =>
        /coimbatore/i.test(String(row.locationName ?? "")),
      );
    if (!warehouse)
      return res
        .status(409)
        .json({ error: "Coimbatore Warehouse was not found" });
    const [location] = await db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.code, "C"))
      .limit(1);
    const completedAt = new Date();

    await db.transaction(async (tx) => {
      const [posting] = await tx
        .insert(casingSoilInventoryPostingsTable)
        .values({
          postingKey,
          batchId,
          inventoryId: null,
          inventoryAdjustmentId: null,
          quantityKg: String(qtyKg),
        })
        .returning();
      let [stock] = await tx
        .select()
        .from(inventoryTable)
        .where(
          and(
            eq(inventoryTable.materialId, casingMaterial.id),
            eq(inventoryTable.locationId, warehouse.id),
          ),
        )
        .limit(1);
      if (stock) {
        [stock] = await tx
          .update(inventoryTable)
          .set({
            quantityOnHand: String(Number(stock.quantityOnHand) + qtyKg),
            lastUpdated: completedAt,
          })
          .where(eq(inventoryTable.id, stock.id))
          .returning();
      } else {
        [stock] = await tx
          .insert(inventoryTable)
          .values({
            materialId: casingMaterial.id,
            locationId: warehouse.id,
            quantityOnHand: String(qtyKg),
          })
          .returning();
      }
      const [adjustment] = await tx
        .insert(inventoryAdjustmentsTable)
        .values({
          materialId: casingMaterial.id,
          locationId: location?.id ?? null,
          quantityDelta: String(qtyKg),
          reason: "Casing Soil Production Inward",
          reference: batch.batchCode,
          notes: notes ?? `Produced by ${batch.batchCode}`,
          adjustedByUserId: userId,
        })
        .returning();
      await tx
        .update(casingSoilInventoryPostingsTable)
        .set({ inventoryId: stock.id, inventoryAdjustmentId: adjustment.id })
        .where(eq(casingSoilInventoryPostingsTable.id, posting.id));
      await tx.insert(casingSoilInventorySourcesTable).values({
        sourceKey: `produced:${batchId}`,
        sourceType: "produced",
        productionBatchId: batchId,
        reference: batch.batchCode,
        materialId: casingMaterial.id,
        warehouseId: warehouse.id,
        inventoryId: stock.id,
        inventoryAdjustmentId: adjustment.id,
        originalQuantityKg: String(qtyKg),
        consumedQuantityKg: "0",
        availableQuantityKg: String(qtyKg),
        stockDate: completedAt.toISOString().split("T")[0],
        notes: notes ?? null,
        status: "available",
        createdByUserId: userId,
      });
      await tx.insert(qcDecisionsTable).values({
        batchId,
        moduleType: "coimbatore",
        decision,
        notes: notes ?? null,
        decidedByUserId: userId,
      });
      await tx.insert(casingSoilTransactionsTable).values({
        transactionType: "produce",
        quantityKg: String(qtyKg),
        transactionDate: completedAt.toISOString().split("T")[0],
        coimbatoreBatchId: batchId,
        notes: notes ?? null,
        recordedByUserId: userId,
      });
      await tx
        .update(batchesTable)
        .set({
          currentStage: "COMPLETED",
          status: "completed",
          stageEnteredAt: completedAt,
          casingSoilCompletedAt: completedAt,
          casingSoilProducedQuantityKg: String(qtyKg),
          currentChamberId: null,
        })
        .where(eq(batchesTable.id, batchId));
      await tx
        .update(chambersTable)
        .set({ status: "idle", currentBatchId: null, currentTurnNumber: null })
        .where(
          and(
            eq(chambersTable.id, chamber.id),
            eq(chambersTable.currentBatchId, batchId),
          ),
        );
    });
    return res.json({ decision, qtyKg, stockedToInventory: true });
  }

  const [config] = await db
    .select()
    .from(coimbatoreConfigTable)
    .where(eq(coimbatoreConfigTable.batchId, batchId))
    .limit(1);
  const existingTurns = await db
    .select()
    .from(coimbatoreTurnsTable)
    .where(eq(coimbatoreTurnsTable.batchId, batchId));
  const currentTotal = config?.totalTurns ?? existingTurns.length;
  const newTotal = existingTurns.length + 3;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(qcDecisionsTable).values({
      batchId,
      moduleType: "coimbatore",
      decision,
      notes: notes ?? null,
      decidedByUserId: userId,
    });
    if (config) {
      const schedule = parseTurnScheduleValue(config.turnScheduleJson);
      for (let turn = currentTotal + 1; turn <= newTotal; turn++)
        schedule.push({ turnNumber: turn, intervalDays: 6 });
      await tx
        .update(coimbatoreConfigTable)
        .set({
          totalTurns: newTotal,
          turnScheduleJson: JSON.stringify(schedule),
        })
        .where(eq(coimbatoreConfigTable.batchId, batchId));
    }
    await tx
      .update(batchesTable)
      .set({ currentStage: "TURNING", stageEnteredAt: now })
      .where(eq(batchesTable.id, batchId));
    await tx
      .update(chambersTable)
      .set({
        status: "active",
        currentBatchId: batchId,
        currentTurnNumber: existingTurns.length + 1,
      })
      .where(eq(chambersTable.id, chamber.id));
    await tx.insert(coimbatoreTurnAssignmentsTable).values({
      batchId,
      turnNumber: existingTurns.length + 1,
      chamberId: chamber.id,
      chamberNameSnapshot: batch.casingSoilChamberNameSnapshot ?? chamber.name,
      enteredAt: now,
    });
  });
  return res.json({ decision, newTotal });
});

// Batch/lot-level casing-soil inventory used by Ooty Casing Run.
router.get("/casing-inventory", requireAuth, async (req, res) => {
  await ensureDefaultVaultItems();
  const sourceType = String(req.query.sourceType ?? "").toLowerCase();
  let rows = await db
    .select()
    .from(casingSoilInventorySourcesTable)
    .orderBy(desc(casingSoilInventorySourcesTable.createdAt));
  if (sourceType === "produced" || sourceType === "purchased")
    rows = rows.filter((row) => row.sourceType === sourceType);
  return res.json(
    rows.map((row) => ({
      ...row,
      originalQuantityKg: numericValue(row.originalQuantityKg) ?? 0,
      consumedQuantityKg: numericValue(row.consumedQuantityKg) ?? 0,
      availableQuantityKg: numericValue(row.availableQuantityKg) ?? 0,
    })),
  );
});

router.post("/casing-inventory/purchased", requireAuth, async (req, res) => {
  await ensureDefaultVaultItems();
  const userId = (req.session as any).userId;
  const reference = String(req.body.reference ?? "").trim();
  const quantityKg = Number(req.body.quantityKg);
  const stockDate = String(req.body.stockDate ?? "").trim();
  const notes = String(req.body.notes ?? "").trim() || null;
  if (!reference)
    return res
      .status(400)
      .json({ error: "Purchased lot reference is required" });
  if (!Number.isFinite(quantityKg) || quantityKg <= 0)
    return res
      .status(400)
      .json({ error: "Purchased quantity must be greater than 0 kg" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stockDate))
    return res.status(400).json({ error: "Stock date is required" });
  const sourceKey = `purchased:${reference.toLowerCase()}`;
  const [duplicate] = await db
    .select()
    .from(casingSoilInventorySourcesTable)
    .where(eq(casingSoilInventorySourcesTable.sourceKey, sourceKey))
    .limit(1);
  if (duplicate)
    return res
      .status(409)
      .json({ error: `Purchased lot ${reference} already exists` });
  const [material] = await db
    .select()
    .from(materialsTable)
    .where(ilike(materialsTable.name, "%casing soil%"))
    .limit(1);
  if (!material)
    return res.status(409).json({
      error: "Casing Soil material is missing from Item & Product Master",
    });
  const warehouses = await db.select().from(inventoryLocationsTable);
  const warehouse =
    warehouses.find(
      (row: any) => String(row.systemCode ?? "").toUpperCase() === "COIMBATORE",
    ) ??
    warehouses.find((row: any) =>
      /coimbatore/i.test(String(row.locationName ?? "")),
    );
  if (!warehouse)
    return res
      .status(409)
      .json({ error: "Coimbatore Warehouse was not found" });
  const [location] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.code, "C"))
    .limit(1);
  const source = await db.transaction(async (tx) => {
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
          quantityOnHand: String(Number(stock.quantityOnHand) + quantityKg),
          lastUpdated: new Date(),
        })
        .where(eq(inventoryTable.id, stock.id))
        .returning();
    else
      [stock] = await tx
        .insert(inventoryTable)
        .values({
          materialId: material.id,
          locationId: warehouse.id,
          quantityOnHand: String(quantityKg),
        })
        .returning();
    const [adjustment] = await tx
      .insert(inventoryAdjustmentsTable)
      .values({
        materialId: material.id,
        locationId: location?.id ?? null,
        quantityDelta: String(quantityKg),
        reason: "Manual Purchased Casing Soil Inward",
        reference,
        notes,
        adjustedByUserId: userId,
      })
      .returning();
    const [created] = await tx
      .insert(casingSoilInventorySourcesTable)
      .values({
        sourceKey,
        sourceType: "purchased",
        productionBatchId: null,
        reference,
        materialId: material.id,
        warehouseId: warehouse.id,
        inventoryId: stock.id,
        inventoryAdjustmentId: adjustment.id,
        originalQuantityKg: String(quantityKg),
        consumedQuantityKg: "0",
        availableQuantityKg: String(quantityKg),
        stockDate,
        notes,
        status: "available",
        createdByUserId: userId,
      })
      .returning();
    await tx.insert(casingSoilTransactionsTable).values({
      transactionType: "buy",
      quantityKg: String(quantityKg),
      counterparty: reference,
      transactionDate: stockDate,
      notes,
      recordedByUserId: userId,
    });
    return created;
  });
  return res.status(201).json({
    ...source,
    originalQuantityKg: quantityKg,
    consumedQuantityKg: 0,
    availableQuantityKg: quantityKg,
  });
});
// List casing soil transactions ─────────────────────────────────────────────
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
