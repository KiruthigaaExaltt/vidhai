import { Router } from "express";
import {
  db,
  batchesTable,
  locationsTable,
  usersTable,
  batchMaterialsTable,
  stageLogsTable,
  materialsTable,
  chambersTable,
} from "@workspace/db";
import { eq, and, desc, ilike } from "@workspace/db";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

function formatBatch(b: any, locationCode: string, createdByName: string) {
  return {
    id: b.id,
    batchCode: b.batchCode,
    locationId: b.locationId,
    locationCode,
    currentStage: b.currentStage,
    status: b.status,
    nitrogenContent: b.nitrogenContent != null ? Number(b.nitrogenContent) : null,
    targetBags: b.targetBags,
    actualBags: b.actualBags,
    spawnEntryId: b.spawnEntryId,
    spawnBatchRef: b.spawnBatchRef,
    spawnBatchType: b.spawnBatchType,
    dispatchLocationId: b.dispatchLocationId,
    notes: b.notes,
    createdAt: b.createdAt,
    createdByName,
    stageEnteredAt: b.stageEnteredAt,
    alertLevel: b.alertLevel,
  };
}

// ── Batch list ────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { locationId, stage, status } = req.query as Record<string, string | undefined>;

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
  if (locationId) filtered = filtered.filter((r) => String(r.batch.locationId) === locationId);
  if (stage) filtered = filtered.filter((r) => r.batch.currentStage === stage);
  if (status) filtered = filtered.filter((r) => r.batch.status === status);

  return res.json(filtered.map((r) => formatBatch(r.batch, r.locationCode, r.createdByName ?? "System")));
});

// ── Create batch ──────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { locationId, targetBags, notes, formulation } = req.body as {
    locationId: number;
    targetBags?: number | null;
    notes?: string | null;
    formulation?: Array<{ materialId?: number; name: string; wetWeightKg: number; moisturePercent: number; nitrogenPercent: number }>;
  };
  const userId = (req.session as any)?.userId ?? null;

  if (!Array.isArray(formulation) || formulation.length === 0) {
    return res.status(400).json({ error: "Initial formulation is required" });
  }
  const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.id, locationId)).limit(1);
  if (!loc) return res.status(400).json({ error: "Location not found" });

  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const existingToday = await db.select().from(batchesTable);
  const seq = String(existingToday.length + 1).padStart(3, "0");
  const batchCode = `${loc.code}-${yy}${mm}${dd}-${seq}`;

  try {
    const batch = await db.transaction(async tx => {
      const [createdBatch] = await tx.insert(batchesTable).values({
        batchCode, locationId, currentStage: "PRE_WETTING", status: "active",
        targetBags: targetBags ?? null, notes: notes ?? null,
        createdByUserId: userId, stageEnteredAt: new Date(),
      }).returning();

      for (const row of formulation) {
        if (!row.name?.trim() || !Number.isFinite(Number(row.wetWeightKg)) || Number(row.wetWeightKg) <= 0) {
          throw new Error(`Invalid formulation row: ${row.name || "Unnamed material"}`);
        }
        let [material] = await tx.select().from(materialsTable).where(ilike(materialsTable.name, row.name.trim())).limit(1);
        if (!material) {
          [material] = await tx.insert(materialsTable).values({
            name: row.name.trim(), unit: "kg", category: "raw_material", itemType: "Raw Material",
            itemIdentifier: `VLT-RM-ANNUR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
            defaultMoisturePercent: String(row.moisturePercent ?? 0),
            defaultNitrogenPercent: String(row.nitrogenPercent ?? 0),
          }).returning();
        }
        await tx.insert(batchMaterialsTable).values({
          batchId: createdBatch.id, materialId: material.id,
          wetWeightKg: String(row.wetWeightKg),
          moisturePercent: String(row.moisturePercent ?? 0),
          nitrogenPercent: String(row.nitrogenPercent ?? 0),
        });
      }

      await tx.insert(stageLogsTable).values({
        batchId: createdBatch.id, stage: "PRE_WETTING", enteredAt: new Date(),
        enteredByUserId: userId, notes: "Batch created",
      });
      return createdBatch;
    });

    await recalcBatchNitrogen(batch.id);
    const [user] = userId ? await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1) : [null];
    return res.status(201).json(formatBatch(batch, loc.code, user?.displayName ?? "System"));
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to create batch and formulation" });
  }
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
    .select({ bm: batchMaterialsTable, materialName: materialsTable.name, unit: materialsTable.unit })
    .from(batchMaterialsTable)
    .innerJoin(materialsTable, eq(batchMaterialsTable.materialId, materialsTable.id))
    .where(eq(batchMaterialsTable.batchId, batchId));

  const stageLogs = await db
    .select({ sl: stageLogsTable, enteredByName: usersTable.displayName })
    .from(stageLogsTable)
    .leftJoin(usersTable, eq(stageLogsTable.enteredByUserId, usersTable.id))
    .where(eq(stageLogsTable.batchId, batchId))
    .orderBy(stageLogsTable.enteredAt);

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
    nh3Ppm: sl.nh3Ppm != null ? Number(sl.nh3Ppm) : null,
    temperatureCelsius: sl.temperatureCelsius != null ? Number(sl.temperatureCelsius) : null,
    verificationImages: sl.verificationImages ? JSON.parse(sl.verificationImages) : [],
  }));

  return res.json({ ...formatBatch(row.batch, row.locationCode, row.createdByName ?? "System"), materials: formattedMaterials, stageLogs: formattedLogs });
});

// ── Update batch metadata ─────────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  const { status, targetBags, actualBags, dispatchLocationId, spawnEntryId, notes, spawnBatchRef, spawnBatchType } = req.body;
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (targetBags !== undefined) updates.targetBags = targetBags;
  if (actualBags !== undefined) updates.actualBags = actualBags;
  if (dispatchLocationId !== undefined) updates.dispatchLocationId = dispatchLocationId;
  if (spawnEntryId !== undefined) updates.spawnEntryId = spawnEntryId;
  if (notes !== undefined) updates.notes = notes;
  if (spawnBatchRef !== undefined) updates.spawnBatchRef = spawnBatchRef;
  if (spawnBatchType !== undefined) updates.spawnBatchType = spawnBatchType;

  const [batch] = await db.update(batchesTable).set(updates).where(eq(batchesTable.id, Number(req.params.id))).returning();
  if (!batch) return res.status(404).json({ error: "Not found" });

  const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.id, batch.locationId)).limit(1);
  const [user] = batch.createdByUserId
    ? await db.select().from(usersTable).where(eq(usersTable.id, batch.createdByUserId)).limit(1)
    : [null];

  return res.json(formatBatch(batch, loc?.code ?? "", user?.displayName ?? "System"));
});

// ── Delete batch ──────────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const [batch] = await db.select().from(batchesTable).where(eq(batchesTable.id, batchId)).limit(1);
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  // Stage logs cascade on delete (FK onDelete: cascade)
  await db.delete(batchMaterialsTable).where(eq(batchMaterialsTable.batchId, batchId));
  await db.delete(stageLogsTable).where(eq(stageLogsTable.batchId, batchId));
  await db.delete(batchesTable).where(eq(batchesTable.id, batchId));
  return res.status(204).send();
});

// ── Assign an available Bulk chamber to a batch already in that stage ─────────
router.post("/:id/assign-chamber", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const chamberId = Number(req.body.chamberId);
  const [batch] = await db.select().from(batchesTable).where(eq(batchesTable.id, batchId)).limit(1);
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  if (batch.currentStage !== "BULK_CHAMBER") return res.status(400).json({ error: "Batch is not in the Bulk Chamber stage" });
  const [chamber] = await db.select().from(chambersTable).where(eq(chambersTable.id, chamberId)).limit(1);
  if (!chamber || chamber.chamberType !== "bulk" || chamber.locationId !== batch.locationId) return res.status(400).json({ error: "Select a valid Bulk chamber for this location" });
  if (chamber.status !== "idle" || chamber.currentBatchId !== null) return res.status(409).json({ error: "The selected Bulk chamber is no longer available" });
  const existing = await db.select().from(chambersTable).where(eq(chambersTable.currentBatchId, batchId)).limit(1);
  if (existing.length) return res.status(409).json({ error: "This batch already has a chamber assigned" });
  const [updated] = await db.update(chambersTable).set({ currentBatchId: batchId, status: "active" }).where(and(eq(chambersTable.id, chamberId), eq(chambersTable.status, "idle"))).returning();
  if (!updated) return res.status(409).json({ error: "The selected Bulk chamber is no longer available" });
  return res.json(updated);
});
// ── Advance stage ─────────────────────────────────────────────────────────────
router.post("/:id/advance", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const { nextStage, notes, spawnBatchRef, spawnBatchType, verificationImages, chamberId } = req.body;
  const userId = (req.session as any).userId;

  const [batch] = await db.select().from(batchesTable).where(eq(batchesTable.id, batchId)).limit(1);
  if (!batch) return res.status(404).json({ error: "Batch not found" });

  if (nextStage === "SPAWN_MIXING" && !spawnBatchRef) {
    return res.status(400).json({ error: "spawnBatchRef is required when advancing to SPAWN_MIXING" });
  }

  let selectedChamber: typeof chambersTable.$inferSelect | undefined;
  if (nextStage === "BULK_CHAMBER") {
    if (!chamberId) return res.status(400).json({ error: "A Bulk chamber is required when advancing from T4" });
    [selectedChamber] = await db.select().from(chambersTable).where(eq(chambersTable.id, Number(chamberId))).limit(1);
    if (!selectedChamber || selectedChamber.chamberType !== "bulk" || selectedChamber.locationId !== batch.locationId) return res.status(400).json({ error: "Select a valid Bulk chamber for this location" });
    if (selectedChamber.status !== "idle" || selectedChamber.currentBatchId !== null) return res.status(409).json({ error: "The selected Bulk chamber is no longer available" });
  }
  // Validate verification images
  if (!verificationImages || !Array.isArray(verificationImages) || verificationImages.length < 2) {
    return res.status(400).json({ error: "Two verification images are required to complete a stage" });
  }

  const exitedAt = new Date();
  await db
    .update(stageLogsTable)
    .set({ exitedAt })
    .where(and(eq(stageLogsTable.batchId, batchId), eq(stageLogsTable.stage, batch.currentStage)));


  await db.insert(stageLogsTable).values({
    batchId,
    stage: nextStage,
    enteredAt: new Date(),
    enteredByUserId: userId,
    notes: notes ?? null,
    verificationImages: JSON.stringify(verificationImages.slice(0, 2)),
  });

  const batchUpdates: Record<string, unknown> = { currentStage: nextStage, stageEnteredAt: new Date() };
  if (nextStage === "DISPATCH") batchUpdates.status = "dispatched";
  if (nextStage === "SPAWN_MIXING" && spawnBatchRef) {
    batchUpdates.spawnBatchRef = spawnBatchRef;
    batchUpdates.spawnBatchType = spawnBatchType ?? "external";
  }

  const [updated] = await db.update(batchesTable).set(batchUpdates).where(eq(batchesTable.id, batchId)).returning();
  if (selectedChamber) {
    await db.update(chambersTable).set({ currentBatchId: batchId, status: "active" }).where(and(eq(chambersTable.id, selectedChamber.id), eq(chambersTable.status, "idle")));
  }
  if (batch.currentStage === "BULK_CHAMBER" && nextStage !== "BULK_CHAMBER") {
    await db.update(chambersTable).set({ currentBatchId: null, status: "idle" }).where(eq(chambersTable.currentBatchId, batchId));
  }
  const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.id, updated.locationId)).limit(1);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  return res.json(formatBatch(updated, loc?.code ?? "", user?.displayName ?? "System"));
});

// ── Replace all materials (formulation save) ──────────────────────────────────
router.put("/:id/materials", requireAuth, async (req, res) => {
  const batchId = Number(req.params.id);
  const { rows } = req.body as {
    rows: Array<{ materialId: number; wetWeightKg: number; moisturePercent: number; nitrogenPercent: number }>;
  };

  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows array required" });

  await db.transaction(async tx => {
    await tx.delete(batchMaterialsTable).where(eq(batchMaterialsTable.batchId, batchId));
    if (rows.length > 0) {
      await tx.insert(batchMaterialsTable).values(
        rows.map(r => ({
          batchId,
          materialId: r.materialId,
          wetWeightKg: String(r.wetWeightKg),
          moisturePercent: String(r.moisturePercent),
          nitrogenPercent: String(r.nitrogenPercent),
        }))
      );
    }
  });

  await recalcBatchNitrogen(batchId);

  const saved = await db
    .select({ bm: batchMaterialsTable, materialName: materialsTable.name, unit: materialsTable.unit })
    .from(batchMaterialsTable)
    .innerJoin(materialsTable, eq(batchMaterialsTable.materialId, materialsTable.id))
    .where(eq(batchMaterialsTable.batchId, batchId));

  return res.json(
    saved.map(({ bm, materialName, unit }) => {
      const wet = Number(bm.wetWeightKg);
      const moisture = Number(bm.moisturePercent);
      const nitrogen = Number(bm.nitrogenPercent);
      const dry = wet * (1 - moisture / 100);
      return {
        id: bm.id, batchId: bm.batchId, materialId: bm.materialId, materialName, unit,
        wetWeightKg: wet, moisturePercent: moisture, nitrogenPercent: nitrogen,
        dryWeightKg: dry, n2Kg: dry * (nitrogen / 100),
      };
    })
  );
});
// ── Individual material routes ────────────────────────────────────────────────
router.get("/:id/materials", async (req, res) => {
  const batchId = Number(req.params.id);
  const materials = await db
    .select({ bm: batchMaterialsTable, materialName: materialsTable.name, unit: materialsTable.unit })
    .from(batchMaterialsTable)
    .innerJoin(materialsTable, eq(batchMaterialsTable.materialId, materialsTable.id))
    .where(eq(batchMaterialsTable.batchId, batchId));

  res.json(
    materials.map(({ bm, materialName, unit }) => {
      const wet = Number(bm.wetWeightKg);
      const moisture = Number(bm.moisturePercent);
      const nitrogen = Number(bm.nitrogenPercent);
      const dry = wet * (1 - moisture / 100);
      return {
        id: bm.id, batchId: bm.batchId, materialId: bm.materialId,
        materialName, unit, wetWeightKg: wet, moisturePercent: moisture,
        nitrogenPercent: nitrogen, dryWeightKg: dry, n2Kg: dry * (nitrogen / 100),
      };
    })
  );
});

router.post("/:id/materials", async (req, res) => {
  const batchId = Number(req.params.id);
  const { materialId, wetWeightKg, moisturePercent, nitrogenPercent } = req.body;

  const [bm] = await db.insert(batchMaterialsTable).values({
    batchId, materialId,
    wetWeightKg: String(wetWeightKg),
    moisturePercent: String(moisturePercent),
    nitrogenPercent: String(nitrogenPercent),
  }).returning();

  const [mat] = await db.select().from(materialsTable).where(eq(materialsTable.id, materialId)).limit(1);
  await recalcBatchNitrogen(batchId);

  const wet = Number(bm.wetWeightKg);
  const moisture = Number(bm.moisturePercent);
  const nitrogen = Number(bm.nitrogenPercent);
  const dry = wet * (1 - moisture / 100);
  res.status(201).json({
    id: bm.id, batchId: bm.batchId, materialId: bm.materialId,
    materialName: mat?.name ?? "", unit: mat?.unit ?? "kg",
    wetWeightKg: wet, moisturePercent: moisture, nitrogenPercent: nitrogen,
    dryWeightKg: dry, n2Kg: dry * (nitrogen / 100),
  });
});

router.patch("/:id/materials/:materialRowId", async (req, res) => {
  const batchId = Number(req.params.id);
  const materialRowId = Number(req.params.materialRowId);
  const { wetWeightKg, moisturePercent, nitrogenPercent } = req.body;

  const updates: Record<string, unknown> = {};
  if (wetWeightKg !== undefined) updates.wetWeightKg = String(wetWeightKg);
  if (moisturePercent !== undefined) updates.moisturePercent = String(moisturePercent);
  if (nitrogenPercent !== undefined) updates.nitrogenPercent = String(nitrogenPercent);

  const [bm] = await db.update(batchMaterialsTable).set(updates).where(eq(batchMaterialsTable.id, materialRowId)).returning();
  if (!bm) return res.status(404).json({ error: "Not found" });

  const [mat] = await db.select().from(materialsTable).where(eq(materialsTable.id, bm.materialId)).limit(1);
  await recalcBatchNitrogen(batchId);

  const wet = Number(bm.wetWeightKg);
  const moisture = Number(bm.moisturePercent);
  const nitrogen = Number(bm.nitrogenPercent);
  const dry = wet * (1 - moisture / 100);
  return res.json({
    id: bm.id, batchId: bm.batchId, materialId: bm.materialId,
    materialName: mat?.name ?? "", unit: mat?.unit ?? "kg",
    wetWeightKg: wet, moisturePercent: moisture, nitrogenPercent: nitrogen,
    dryWeightKg: dry, n2Kg: dry * (nitrogen / 100),
  });
});

router.delete("/:id/materials/:materialRowId", async (req, res) => {
  const batchId = Number(req.params.id);
  await db.delete(batchMaterialsTable).where(eq(batchMaterialsTable.id, Number(req.params.materialRowId)));
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

  res.json(logs.map(({ sl, enteredByName }) => ({
    id: sl.id, batchId: sl.batchId, stage: sl.stage,
    enteredAt: sl.enteredAt, exitedAt: sl.exitedAt,
    enteredByName: enteredByName ?? "System",
    notes: sl.notes,
    nh3Ppm: sl.nh3Ppm != null ? Number(sl.nh3Ppm) : null,
    temperatureCelsius: sl.temperatureCelsius != null ? Number(sl.temperatureCelsius) : null,
    verificationImages: sl.verificationImages ? JSON.parse(sl.verificationImages) : [],
  })));
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function recalcBatchNitrogen(batchId: number) {
  const mats = await db.select().from(batchMaterialsTable).where(eq(batchMaterialsTable.batchId, batchId));
  if (mats.length === 0) {
    await db.update(batchesTable).set({ nitrogenContent: null }).where(eq(batchesTable.id, batchId));
    return;
  }
  let totalDry = 0, totalN2 = 0;
  for (const m of mats) {
    const wet = Number(m.wetWeightKg);
    const moisture = Number(m.moisturePercent);
    const nitrogen = Number(m.nitrogenPercent);
    const dry = wet * (1 - moisture / 100);
    totalDry += dry;
    totalN2 += dry * (nitrogen / 100);
  }
  const nitrogenContent = totalDry > 0 ? (totalN2 / totalDry) * 100 : 0;
  await db.update(batchesTable).set({ nitrogenContent: String(nitrogenContent) }).where(eq(batchesTable.id, batchId));
}

export default router;
