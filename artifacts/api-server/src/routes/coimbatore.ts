import { Router } from "express";
import { db } from "@workspace/db";
import {
  batchesTable,
  coimbatoreBatchMaterialsTable,
  coimbatoreConfigTable,
  coimbatoreTurnsTable,
  qcDecisionsTable,
  casingSoilTransactionsTable,
  materialsTable,
  locationsTable,
  usersTable,
  inventoryTable,
  inventoryAdjustmentsTable,
} from "@workspace/db";
import { eq, desc, ilike } from "@workspace/db";
import { paginateQuery, paginatedResponse } from "../lib/pagination";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
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
  try { return JSON.parse(raw); } catch { return []; }
}

// ── Default turn schedule ─────────────────────────────────────────────────────
function defaultTurnSchedule(totalTurns: number): { turnNumber: number; intervalDays: number }[] {
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
  if (req.query.skip === undefined && req.query.limit === undefined) return res.json(batches);
  let filtered = batches;
  const { search, stage, status, from, to } = req.query as Record<string, string | undefined>;
  if (search) filtered = filtered.filter((row) => row.batchCode.toLowerCase().includes(search.toLowerCase()));
  if (stage) filtered = filtered.filter((row) => row.currentStage === stage);
  if (status) filtered = filtered.filter((row) => row.status === status);
  if (from) filtered = filtered.filter((row) => new Date(row.createdAt) >= new Date(from));
  if (to) filtered = filtered.filter((row) => new Date(row.createdAt) <= new Date(`${to}T23:59:59.999`));
  const pagination = paginateQuery(req.query);
  return res.json(paginatedResponse(filtered.slice(pagination.skip, pagination.skip + pagination.limit), filtered.length, pagination));
});

// ── Create Coimbatore batch (starts in FORMULATION) ───────────────────────────
router.post("/batches", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const { notes } = req.body as { notes?: string };
  const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.code, "C")).limit(1);
  if (!loc) return res.status(400).json({ error: "Location C not found" });
  const existing = await db.select().from(batchesTable)
    .innerJoin(locationsTable, eq(batchesTable.locationId, locationsTable.id))
    .where(eq(locationsTable.code, "C"));
  const seq = existing.length + 1;
  const code = batchCode("C", seq);
  const [batch] = await db.insert(batchesTable).values({
    batchCode: code,
    locationId: loc.id,
    currentStage: "FORMULATION",
    status: "active",
    notes: notes ?? null,
    createdByUserId: userId,
  }).returning();
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
    .innerJoin(materialsTable, eq(coimbatoreBatchMaterialsTable.materialId, materialsTable.id))
    .where(eq(coimbatoreBatchMaterialsTable.batchId, id));

  const [config] = await db.select().from(coimbatoreConfigTable)
    .where(eq(coimbatoreConfigTable.batchId, id)).limit(1);

  const rawTurns = await db.select().from(coimbatoreTurnsTable)
    .where(eq(coimbatoreTurnsTable.batchId, id))
    .orderBy(coimbatoreTurnsTable.turnNumber);
  const turns = rawTurns.map(t => ({
    ...t,
    verificationImages: parseImages(t.verificationImages),
  }));

  // All QC decisions in chronological order (latest first)
  const qcDecisions = await db.select().from(qcDecisionsTable)
    .where(eq(qcDecisionsTable.batchId, id))
    .orderBy(desc(qcDecisionsTable.decidedAt));

  return res.json({
    ...batch,
    materials,
    config: config ?? null,
    turns,
    qcDecision: qcDecisions[0] ?? null,   // latest — kept for backward compat
    qcDecisions,                           // full history
  });
});

// ── Delete batch ──────────────────────────────────────────────────────────────
router.delete("/batches/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [batch] = await db.select().from(batchesTable).where(eq(batchesTable.id, id)).limit(1);
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
  if (currentStage !== undefined) { updates.currentStage = currentStage; updates.stageEnteredAt = new Date(); }
  if (alertLevel !== undefined) updates.alertLevel = alertLevel;
  const [batch] = await db.update(batchesTable).set(updates).where(eq(batchesTable.id, id)).returning();
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
  } = req.body as {
    materials?: { name: string; weightKg: number }[];
    totalTurns?: number;
    turnSchedule?: { turnNumber: number; intervalDays: number }[];
  };

  const totalTurns = reqTotalTurns && reqTotalTurns > 0 ? reqTotalTurns : 12;
  const turnSchedule = reqSchedule?.length ? reqSchedule : defaultTurnSchedule(totalTurns);

  await db.transaction(async (tx) => {
    // Replace existing materials
    await tx.delete(coimbatoreBatchMaterialsTable)
      .where(eq(coimbatoreBatchMaterialsTable.batchId, batchId));

    for (const mat of (materials ?? [])) {
      if (!mat.name || !(mat.weightKg > 0)) continue;
      let [found] = await tx.select().from(materialsTable)
        .where(ilike(materialsTable.name, mat.name.trim())).limit(1);
      if (!found) {
        [found] = await tx.insert(materialsTable).values({
          name: mat.name.trim(), unit: "kg", category: "raw_material", itemType: "Raw Material",
          itemIdentifier: `VLT-RM-COIM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        }).returning();
      }
      await tx.insert(coimbatoreBatchMaterialsTable).values({
        batchId,
        materialId: found.id,
        weightKg: String(mat.weightKg),
      });
    }

    // Upsert turn config
    const [existing] = await tx.select().from(coimbatoreConfigTable)
      .where(eq(coimbatoreConfigTable.batchId, batchId)).limit(1);
    if (existing) {
      await tx.update(coimbatoreConfigTable).set({
        totalTurns,
        turnScheduleJson: JSON.stringify(turnSchedule),
      }).where(eq(coimbatoreConfigTable.batchId, batchId));
    } else {
      await tx.insert(coimbatoreConfigTable).values({
        batchId,
        totalTurns,
        turnScheduleJson: JSON.stringify(turnSchedule),
      });
    }

    // Advance to TURNING
    await tx.update(batchesTable).set({
      currentStage: "TURNING",
      stageEnteredAt: new Date(),
    }).where(eq(batchesTable.id, batchId));
  });

  const [updated] = await db.select().from(batchesTable).where(eq(batchesTable.id, batchId)).limit(1);
  return res.json(updated);
});

// ── List materials for a batch ────────────────────────────────────────────────
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
    .innerJoin(materialsTable, eq(coimbatoreBatchMaterialsTable.materialId, materialsTable.id))
    .where(eq(coimbatoreBatchMaterialsTable.batchId, id));
  return res.json(rows);
});

// ── Add material ──────────────────────────────────────────────────────────────
router.post("/batches/:id/materials", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const { materialId, weightKg, notes } = req.body as any;
  const [row] = await db.insert(coimbatoreBatchMaterialsTable).values({
    batchId, materialId, weightKg: String(weightKg), notes: notes ?? null,
  }).returning();
  return res.status(201).json(row);
});

// ── Delete material ───────────────────────────────────────────────────────────
router.delete("/batches/:id/materials/:materialId", requireAuth, async (req, res) => {
  const id = Number(req.params.materialId);
  await db.delete(coimbatoreBatchMaterialsTable).where(eq(coimbatoreBatchMaterialsTable.id, id));
  return res.status(204).send();
});

// ── Set turn config ───────────────────────────────────────────────────────────
router.put("/batches/:id/config", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const { totalTurns, turnScheduleJson } = req.body as any;
  const existing = await db.select().from(coimbatoreConfigTable)
    .where(eq(coimbatoreConfigTable.batchId, batchId)).limit(1);
  let row;
  if (existing.length > 0) {
    [row] = await db.update(coimbatoreConfigTable)
      .set({ totalTurns, turnScheduleJson: JSON.stringify(turnScheduleJson ?? []) })
      .where(eq(coimbatoreConfigTable.batchId, batchId)).returning();
  } else {
    [row] = await db.insert(coimbatoreConfigTable)
      .values({ batchId, totalTurns, turnScheduleJson: JSON.stringify(turnScheduleJson ?? []) }).returning();
  }
  return res.json(row);
});

// ── List turns ────────────────────────────────────────────────────────────────
router.get("/batches/:id/turns", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const turns = await db.select().from(coimbatoreTurnsTable)
    .where(eq(coimbatoreTurnsTable.batchId, id)).orderBy(coimbatoreTurnsTable.turnNumber);
  return res.json(turns.map(t => ({ ...t, verificationImages: parseImages(t.verificationImages) })));
});

// ── Record a turn (sequential, requires 2 images) ─────────────────────────────
router.post("/batches/:id/turns", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const userId = (req.session as any).userId;
  const { turnNumber, actualDate, notes, verificationImages } = req.body as any;

  // Require 2 verification images
  const imgs: string[] = Array.isArray(verificationImages)
    ? verificationImages.filter(Boolean) : [];
  if (imgs.length < 2) {
    return res.status(400).json({ error: "Two verification photos are required to complete a turn" });
  }

  // Enforce sequential completion
  const existingTurns = await db.select().from(coimbatoreTurnsTable)
    .where(eq(coimbatoreTurnsTable.batchId, batchId));
  const expectedNext = existingTurns.length + 1;
  if (Number(turnNumber) !== expectedNext) {
    return res.status(400).json({ error: `Turns must be completed in order — next expected: T${expectedNext}` });
  }

  const [config] = await db.select().from(coimbatoreConfigTable)
    .where(eq(coimbatoreConfigTable.batchId, batchId)).limit(1);
  const totalTurns = config?.totalTurns ?? 12;

  const result = await db.transaction(async (tx) => {
    const [turn] = await tx.insert(coimbatoreTurnsTable).values({
      batchId,
      turnNumber: Number(turnNumber),
      actualDate: actualDate ?? new Date().toISOString().split("T")[0],
      notes: notes ?? null,
      verificationImages: JSON.stringify(imgs),
      recordedByUserId: userId,
    }).returning();

    // Auto-advance to QC_PENDING when all planned turns are done
    if (Number(turnNumber) >= totalTurns) {
      await tx.update(batchesTable).set({
        currentStage: "QC_PENDING",
        stageEnteredAt: new Date(),
      }).where(eq(batchesTable.id, batchId));
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

  if (decision === "approve") {
    // Determine produced quantity (user-entered or fallback to formulation total)
    const mats = await db.select().from(coimbatoreBatchMaterialsTable)
      .where(eq(coimbatoreBatchMaterialsTable.batchId, batchId));
    const formulationKg = mats.reduce((s, m) => s + Number(m.weightKg), 0);
    const qtyKg = producedQuantityKg ? Number(producedQuantityKg) : formulationKg;

    // Find casing soil finished-product material (by name pattern)
    const [casingMaterial] = await db.select().from(materialsTable)
      .where(ilike(materialsTable.name, "%casing soil%")).limit(1);

    const [loc] = await db.select().from(locationsTable)
      .where(eq(locationsTable.code, "C")).limit(1);

    await db.transaction(async (tx) => {
      // Record QC decision
      await tx.insert(qcDecisionsTable).values({
        batchId,
        moduleType: "coimbatore",
        decision,
        notes: notes ?? null,
        decidedByUserId: userId,
      });

      // Add to inventory if the finished-product material exists
      if (casingMaterial && qtyKg > 0) {
        const [existingInv] = await tx.select().from(inventoryTable)
          .where(eq(inventoryTable.materialId, casingMaterial.id)).limit(1);

        if (existingInv) {
          await tx.update(inventoryTable).set({
            quantityOnHand: String(Number(existingInv.quantityOnHand) + qtyKg),
            lastUpdated: new Date(),
          }).where(eq(inventoryTable.id, existingInv.id));
        } else {
          await tx.insert(inventoryTable).values({
            materialId: casingMaterial.id,
            locationId: loc?.id ?? null,
            quantityOnHand: String(qtyKg),
          });
        }

        await tx.insert(inventoryAdjustmentsTable).values({
          materialId: casingMaterial.id,
          locationId: loc?.id ?? null,
          quantityDelta: String(qtyKg),
          reason: "production",
          notes: `QC-approved production from casing soil batch #${batchId}`,
          adjustedByUserId: userId,
        });
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
      await tx.update(batchesTable).set({
        currentStage: "COMPLETED",
        status: "completed",
        stageEnteredAt: new Date(),
      }).where(eq(batchesTable.id, batchId));
    });

    return res.json({ decision, qtyKg, stockedToInventory: !!casingMaterial });

  } else {
    // REJECT: extend turn schedule by 3 turns, return to TURNING
    const [config] = await db.select().from(coimbatoreConfigTable)
      .where(eq(coimbatoreConfigTable.batchId, batchId)).limit(1);
    const existingTurns = await db.select().from(coimbatoreTurnsTable)
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
        const schedule: { turnNumber: number; intervalDays: number }[] = (() => {
          try { return JSON.parse(config.turnScheduleJson ?? "[]"); } catch { return []; }
        })();
        for (let t = currentTotal + 1; t <= newTotal; t++) {
          if (!schedule.find(s => s.turnNumber === t)) {
            schedule.push({ turnNumber: t, intervalDays: 6 });
          }
        }
        await tx.update(coimbatoreConfigTable).set({
          totalTurns: newTotal,
          turnScheduleJson: JSON.stringify(schedule),
        }).where(eq(coimbatoreConfigTable.batchId, batchId));
      }

      // Return to TURNING
      await tx.update(batchesTable).set({
        currentStage: "TURNING",
        stageEnteredAt: new Date(),
      }).where(eq(batchesTable.id, batchId));
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
    .leftJoin(usersTable, eq(casingSoilTransactionsTable.recordedByUserId, usersTable.id))
    .orderBy(desc(casingSoilTransactionsTable.createdAt));

  return res.json(
    rows.map((r) => ({
      ...r.tx,
      quantityKg: Number(r.tx.quantityKg),
      unitPrice: r.tx.unitPrice ? Number(r.tx.unitPrice) : null,
      totalCost: r.tx.totalCost ? Number(r.tx.totalCost) : null,
      recordedByName: r.recordedByName ?? null,
    }))
  );
});

// ── Create casing soil transaction ────────────────────────────────────────────
router.post("/soil-transactions", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const {
    transactionType, quantityKg, counterparty, unitPrice,
    totalCost, transactionDate, coimbatoreBatchId, notes,
  } = req.body as any;

  const [tx] = await db.insert(casingSoilTransactionsTable).values({
    transactionType,
    quantityKg: String(quantityKg),
    counterparty: counterparty ?? null,
    unitPrice: unitPrice != null ? String(unitPrice) : null,
    totalCost: totalCost != null
      ? String(totalCost)
      : (unitPrice && quantityKg ? String(Number(unitPrice) * Number(quantityKg)) : null),
    transactionDate,
    coimbatoreBatchId: coimbatoreBatchId ?? null,
    notes: notes ?? null,
    recordedByUserId: userId,
  }).returning();

  return res.status(201).json(tx);
});

export default router;
