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
  inventoryAdjustmentsTable,
  inventoryLocationsTable,
  inventoryTable,
  materialsTable,
  ootyHarvestInventoryPostingsTable,
  ootyCookoutInventoryPostingsTable,
  ootyGrowBagInventoryPostingsTable,
  casingSoilInventorySourcesTable,
  ootyCasingRunConsumptionsTable,
} from "@workspace/db";
import { eq, desc, inArray, isNull, and, gte } from "@workspace/db";
import {
  flushNumberForStage,
  harvestInventoryPostingKey,
  validateHarvestProduction,
} from "../lib/ootyHarvestInventory";
import {
  cookoutManurePostingKey,
  validateCookoutManure,
} from "../lib/ootyCookoutInventory";
import { requirePermission } from "../lib/access";
import {
  MAX_GROWING_ROOM_IMPORT_ROWS,
  normalizeGrowingRoomName,
  prepareGrowingRoomImport,
  validateGrowingRoomInput,
  type ValidGrowingRoomInput,
} from "../lib/ootyRoomImport";
import {
  growingRoomNumber,
  OOTY_HARDCODED_ROOMS,
} from "../lib/ootyHardcodedRooms";

const router = Router();

const OOTY_STAGE_SEQ = [
  "SPAWN_RUN",
  "CASING_RUN",
  "PINNING_FLUSH1",
  "FLUSH2",
  "COOKOUT",
  "COMPLETED",
] as const;

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
  if (!(req.session as any)?.userId)
    return res.status(401).json({ error: "Not authenticated" });
  next();
}

async function markFullyAllocatedAnnurBatchesFinished(
  tx: any,
  annurBatchIds: number[],
) {
  for (const annurBatchId of new Set(annurBatchIds.map(Number))) {
    const [annurBatch] = await tx
      .select({ actualBags: batchesTable.actualBags })
      .from(batchesTable)
      .where(eq(batchesTable.id, annurBatchId))
      .limit(1);
    const producedBags = Number(annurBatch?.actualBags || 0);
    if (producedBags <= 0) continue;
    const allocations = await tx
      .select({ bagCount: ootyBatchSourcesTable.bagCount })
      .from(ootyBatchSourcesTable)
      .where(eq(ootyBatchSourcesTable.annurBatchId, annurBatchId));
    const allocatedBags = allocations.reduce(
      (sum: number, allocation: any) => sum + Number(allocation.bagCount || 0),
      0,
    );
    if (allocatedBags < producedBags) continue;
    await tx
      .update(batchesTable)
      .set({ status: "finished" })
      .where(
        and(
          eq(batchesTable.id, annurBatchId),
          eq(batchesTable.currentStage, "COMPLETED"),
          eq(batchesTable.status, "dispatched"),
        ),
      );
  }
}

function daysSince(date: Date | string | null) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function alertLevelForRoom(room: any, batch: any) {
  if (!batch) return "gray";
  if (batch.currentPhase === "COMPLETED") return "gray";
  const days = daysSince(batch.phaseEnteredAt);
  if (batch.currentPhase === "SPAWN_RUN" && days !== null && days > 22)
    return "red";
  if (batch.currentPhase === "SPAWN_RUN" && days !== null && days > 18)
    return "amber";
  if (batch.currentPhase === "CASING_RUN" && days !== null && days > 10)
    return "red";
  if (batch.currentPhase === "DF" && days !== null && days > 24) return "red";
  return "teal";
}

function parseStageLog(log: any) {
  return {
    ...log,
    stage: normalizeStage(log.stage),
    verificationImages: log.verificationImages
      ? (() => {
          try {
            return JSON.parse(log.verificationImages);
          } catch {
            return [];
          }
        })()
      : [],
  };
}

async function ensureHardcodedGrowingRooms(locationId: number) {
  const existing = await db
    .select()
    .from(ootyRoomsTable)
    .where(eq(ootyRoomsTable.locationId, locationId));
  const byNumber = new Map(
    existing
      .map((room) => [growingRoomNumber(room.name), room] as const)
      .filter(([number]) => number !== null),
  );

  for (const definition of OOTY_HARDCODED_ROOMS) {
    const room = byNumber.get(definition.number);
    const name = "Room " + definition.number;
    if (room) {
      if (room.name !== name || room.capacity !== definition.capacity) {
        await db
          .update(ootyRoomsTable)
          .set({ name, capacity: definition.capacity })
          .where(eq(ootyRoomsTable.id, room.id));
      }
      continue;
    }
    await db.insert(ootyRoomsTable).values({
      name,
      locationId,
      capacity: definition.capacity,
      status: "idle",
      notes: "Hardcoded Ooty growing room",
    });
  }
}
// List rooms with current batch state (heatmap data)
router.get("/rooms", requireAuth, async (req, res) => {
  const [loc] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.code, "B"))
    .limit(1);
  if (!loc) return res.json([]);

  await ensureHardcodedGrowingRooms(loc.id);

  const rooms = await db
    .select()
    .from(ootyRoomsTable)
    .where(eq(ootyRoomsTable.locationId, loc.id));

  const result = await Promise.all(
    rooms.map(async (room) => {
      let currentBatch = null;
      if (room.currentGrowingBatchId) {
        const [b] = await db
          .select()
          .from(ootyGrowingBatchesTable)
          .where(eq(ootyGrowingBatchesTable.id, room.currentGrowingBatchId))
          .limit(1);
        if (b) {
          const lastObs = await db
            .select()
            .from(ootyObservationsTable)
            .where(eq(ootyObservationsTable.growingBatchId, b.id))
            .orderBy(desc(ootyObservationsTable.observationDate))
            .limit(1);
          // Fetch batch sources with Annur batch codes
          const sources = await db
            .select({
              id: ootyBatchSourcesTable.id,
              annurBatchId: ootyBatchSourcesTable.annurBatchId,
              bagCount: ootyBatchSourcesTable.bagCount,
              batchCode: batchesTable.batchCode,
            })
            .from(ootyBatchSourcesTable)
            .leftJoin(
              batchesTable,
              eq(ootyBatchSourcesTable.annurBatchId, batchesTable.id),
            )
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
    }),
  );

  return res.json(result);
});

async function insertGrowingRoom(
  tx: any,
  locationId: number,
  input: ValidGrowingRoomInput,
) {
  const [room] = await tx
    .insert(ootyRoomsTable)
    .values({
      name: input.name,
      locationId,
      capacity: input.capacity,
      notes: input.notes,
    })
    .returning();
  return room;
}

// Create room
router.post("/rooms", requireAuth, async (req, res) => {
  const parsed = validateGrowingRoomInput(req.body as any);
  if (!parsed.ok)
    return res
      .status(400)
      .json({ error: parsed.errors.join(". "), errors: parsed.errors });
  const [loc] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.code, "B"))
    .limit(1);
  if (!loc) return res.status(400).json({ error: "Location B not found" });
  const existing = await db
    .select()
    .from(ootyRoomsTable)
    .where(eq(ootyRoomsTable.locationId, loc.id));
  if (
    existing.some(
      (room) =>
        normalizeGrowingRoomName(room.name) ===
        normalizeGrowingRoomName(parsed.value.name),
    )
  )
    return res.status(409).json({
      error: `A Growing Room named "${parsed.value.name}" already exists in Ooty Location B`,
    });
  const room = await insertGrowingRoom(db, loc.id, parsed.value);
  return res.status(201).json(room);
});

router.post(
  "/rooms/import",
  requireAuth,
  requirePermission("production.growing_rooms.create"),
  async (req, res) => {
    const userId = (req.session as any).userId;
    const { fileName, rows } = req.body as {
      fileName?: unknown;
      rows?: unknown;
    };
    if (!Array.isArray(rows) || rows.length === 0)
      return res
        .status(400)
        .json({ error: "The import contains no room rows" });
    if (rows.length > MAX_GROWING_ROOM_IMPORT_ROWS)
      return res.status(400).json({
        error: `A maximum of ${MAX_GROWING_ROOM_IMPORT_ROWS} rooms can be imported at once`,
      });
    const [loc] = await db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.code, "B"))
      .limit(1);
    if (!loc)
      return res.status(409).json({ error: "Ooty Location B was not found" });
    const existingRooms = await db
      .select()
      .from(ootyRoomsTable)
      .where(eq(ootyRoomsTable.locationId, loc.id));
    const { results, pending } = prepareGrowingRoomImport(
      rows,
      existingRooms.map((room) => room.name),
    );
    const roomOnly = pending.filter(
      (item) => item.value.annurBatchCode === null,
    );
    const assignmentPending = pending.filter(
      (
        item,
      ): item is typeof item & {
        value: typeof item.value & {
          annurBatchCode: string;
          bagsAllocated: number;
          spawnRunStartDate: string;
        };
      } =>
        item.value.annurBatchCode !== null &&
        item.value.bagsAllocated !== null &&
        item.value.spawnRunStartDate !== null,
    );
    const annurBatches = await db.select().from(batchesTable);
    const annurByCode = new Map(
      annurBatches.map((batch) => [
        String(batch.batchCode).trim().toLocaleLowerCase(),
        batch,
      ]),
    );
    const existingSources = await db.select().from(ootyBatchSourcesTable);
    const allocatedByBatch = new Map<number, number>();
    for (const source of existingSources)
      allocatedByBatch.set(
        source.annurBatchId,
        (allocatedByBatch.get(source.annurBatchId) ?? 0) +
          Number(source.bagCount || 0),
      );

    const sourceValidated: Array<{
      rowNumber: number;
      value: (typeof assignmentPending)[number]["value"];
      annurBatch: any;
    }> = [];
    for (const item of assignmentPending) {
      const annurBatch = annurByCode.get(
        item.value.annurBatchCode.toLocaleLowerCase(),
      );
      if (
        !annurBatch ||
        annurBatch.currentStage !== "COMPLETED" ||
        annurBatch.status !== "dispatched" ||
        !annurBatch.actualBags
      ) {
        results.push({
          rowNumber: item.rowNumber,
          name: item.value.name,
          status: "failed",
          reason: `Annur Batch "${item.value.annurBatchCode}" is not a completed batch with produced bags`,
        });
        continue;
      }
      const alreadyAllocated = allocatedByBatch.get(annurBatch.id) ?? 0;
      const remaining = Number(annurBatch.actualBags) - alreadyAllocated;
      if (item.value.bagsAllocated > remaining) {
        results.push({
          rowNumber: item.rowNumber,
          name: item.value.name,
          status: "failed",
          reason: `Only ${remaining} produced bags remain available from ${annurBatch.batchCode}`,
        });
        continue;
      }
      allocatedByBatch.set(
        annurBatch.id,
        alreadyAllocated + item.value.bagsAllocated,
      );
      sourceValidated.push({ ...item, annurBatch });
    }

    if (sourceValidated.length) {
      const [growBagMaterial] = await db
        .select()
        .from(materialsTable)
        .where(eq(materialsTable.sku, "VLT-RM-GROW-BAG"))
        .limit(1);
      const [annurWarehouse] = await db
        .select()
        .from(inventoryLocationsTable)
        .where(eq(inventoryLocationsTable.systemCode, "ANNUR"))
        .limit(1);
      const [annurLocation] = await db
        .select()
        .from(locationsTable)
        .where(eq(locationsTable.code, "A"))
        .limit(1);
      if (!growBagMaterial || !annurWarehouse || !annurLocation)
        return res
          .status(409)
          .json({ error: "Annur Grow Bag inventory configuration is missing" });
      const [availableStock] = await db
        .select()
        .from(inventoryTable)
        .where(
          and(
            eq(inventoryTable.materialId, growBagMaterial.id),
            eq(inventoryTable.locationId, annurWarehouse.id),
          ),
        )
        .limit(1);
      let vaultRemaining = Number(availableStock?.quantityOnHand || 0);
      const ready: typeof sourceValidated = [];
      for (const item of sourceValidated) {
        if (item.value.bagsAllocated > vaultRemaining) {
          results.push({
            rowNumber: item.rowNumber,
            name: item.value.name,
            status: "failed",
            reason: `Only ${vaultRemaining} grow bags are available in the Annur Vault`,
          });
          continue;
        }
        vaultRemaining -= item.value.bagsAllocated;
        ready.push(item);
      }

      if (ready.length)
        await db.transaction(async (tx) => {
          const currentRooms = await tx
            .select()
            .from(ootyRoomsTable)
            .where(eq(ootyRoomsTable.locationId, loc.id));
          const currentNames = new Set(
            currentRooms.map((room) => normalizeGrowingRoomName(room.name)),
          );
          const importReady = ready.filter((item) => {
            if (!currentNames.has(normalizeGrowingRoomName(item.value.name)))
              return true;
            results.push({
              rowNumber: item.rowNumber,
              name: item.value.name,
              status: "skipped",
              reason: "Room already exists in Ooty Location B",
            });
            return false;
          });
          if (!importReady.length) return;
          const [stock] = await tx
            .select()
            .from(inventoryTable)
            .where(
              and(
                eq(inventoryTable.materialId, growBagMaterial.id),
                eq(inventoryTable.locationId, annurWarehouse.id),
              ),
            )
            .limit(1);
          const totalBags = importReady.reduce(
            (sum, item) => sum + item.value.bagsAllocated,
            0,
          );
          if (!stock || Number(stock.quantityOnHand) < totalBags)
            throw new Error("Insufficient Annur Grow Bag stock");
          const now = new Date();
          const [updatedStock] = await tx
            .update(inventoryTable)
            .set({
              quantityOnHand: String(Number(stock.quantityOnHand) - totalBags),
              lastUpdated: now,
            })
            .where(eq(inventoryTable.id, stock.id))
            .returning();
          const existingGrowingBatches = await tx
            .select()
            .from(ootyGrowingBatchesTable);
          const yy = String(now.getFullYear()).slice(2),
            mm = String(now.getMonth() + 1).padStart(2, "0"),
            dd = String(now.getDate()).padStart(2, "0");
          let createdSequence = 0;
          for (const item of importReady) {
            const key = normalizeGrowingRoomName(item.value.name);

            const room = await insertGrowingRoom(tx, loc.id, item.value);
            createdSequence += 1;
            const batchCode = `B-${yy}${mm}${dd}-${String(existingGrowingBatches.length + createdSequence).padStart(3, "0")}`;
            const [batch] = await tx
              .insert(ootyGrowingBatchesTable)
              .values({
                batchCode,
                roomId: room.id,
                annurBatchId: item.annurBatch.id,
                currentPhase: "SPAWN_RUN",
                currentStage: "SPAWN_RUN",
                phaseEnteredAt: now,
                status: "active",
                spawnRunStartDate: item.value.spawnRunStartDate,
                notes: null,
                createdByUserId: userId,
              })
              .returning();
            await tx.insert(ootyStageLogsTable).values({
              growingBatchId: batch.id,
              stage: "SPAWN_RUN",
              enteredAt: now,
              recordedByUserId: userId,
            });
            await tx.insert(ootyBatchSourcesTable).values({
              growingBatchId: batch.id,
              annurBatchId: item.annurBatch.id,
              bagCount: item.value.bagsAllocated,
            });
            await markFullyAllocatedAnnurBatchesFinished(tx, [
              item.annurBatch.id,
            ]);
            const traceNotes = `Ooty Growing Room Excel import | Growing Batch: ${batch.batchCode} (#${batch.id}) | Room: ${room.name} (#${room.id}) | Annur Batch: ${item.annurBatch.batchCode} (#${item.annurBatch.id}) | Total Bags: ${item.value.bagsAllocated}`;
            const [adjustment] = await tx
              .insert(inventoryAdjustmentsTable)
              .values({
                materialId: growBagMaterial.id,
                locationId: annurLocation.id,
                quantityDelta: String(-item.value.bagsAllocated),
                reason: "production_consumption",
                notes: traceNotes,
                adjustedByUserId: userId,
              })
              .returning();
            await tx.insert(ootyGrowBagInventoryPostingsTable).values({
              postingKey: `ooty-grow-bag-assignment:${batch.id}`,
              growingBatchId: batch.id,
              inventoryId: updatedStock.id,
              inventoryAdjustmentId: adjustment.id,
              warehouseId: annurWarehouse.id,
              allocatedBags: item.value.bagsAllocated,
            });
            await tx
              .update(ootyRoomsTable)
              .set({ status: "active", currentGrowingBatchId: batch.id })
              .where(eq(ootyRoomsTable.id, room.id));
            currentNames.add(key);
            results.push({
              rowNumber: item.rowNumber,
              name: item.value.name,
              status: "created",
            });
          }
        });
    }
    if (roomOnly.length)
      await db.transaction(async (tx) => {
        const currentRooms = await tx
          .select()
          .from(ootyRoomsTable)
          .where(eq(ootyRoomsTable.locationId, loc.id));
        const currentNames = new Set(
          currentRooms.map((room) => normalizeGrowingRoomName(room.name)),
        );
        for (const item of roomOnly) {
          const key = normalizeGrowingRoomName(item.value.name);
          if (currentNames.has(key)) {
            results.push({
              rowNumber: item.rowNumber,
              name: item.value.name,
              status: "skipped",
              reason: "Room already exists in Ooty Location B",
            });
            continue;
          }
          await insertGrowingRoom(tx, loc.id, item.value);
          currentNames.add(key);
          results.push({
            rowNumber: item.rowNumber,
            name: item.value.name,
            status: "created",
          });
        }
      });

    results.sort((a, b) => a.rowNumber - b.rowNumber);
    return res.status(201).json({
      fileName: typeof fileName === "string" ? fileName.slice(0, 255) : null,
      total: rows.length,
      created: results.filter((row) => row.status === "created").length,
      skipped: results.filter((row) => row.status === "skipped").length,
      failed: results.filter((row) => row.status === "failed").length,
      results,
    });
  },
);

// Get room detail
router.get("/rooms/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [room] = await db
    .select()
    .from(ootyRoomsTable)
    .where(eq(ootyRoomsTable.id, id))
    .limit(1);
  if (!room) return res.status(404).json({ error: "Not found" });

  const batches = await db
    .select()
    .from(ootyGrowingBatchesTable)
    .where(eq(ootyGrowingBatchesTable.roomId, id))
    .orderBy(desc(ootyGrowingBatchesTable.createdAt));

  // Enrich active batch with sources
  const enrichedBatches = await Promise.all(
    batches.map(async (b) => {
      const sources = await db
        .select({
          id: ootyBatchSourcesTable.id,
          annurBatchId: ootyBatchSourcesTable.annurBatchId,
          bagCount: ootyBatchSourcesTable.bagCount,
          batchCode: batchesTable.batchCode,
        })
        .from(ootyBatchSourcesTable)
        .leftJoin(
          batchesTable,
          eq(ootyBatchSourcesTable.annurBatchId, batchesTable.id),
        )
        .where(eq(ootyBatchSourcesTable.growingBatchId, b.id));
      return { ...b, batchSources: sources };
    }),
  );

  return res.json({ ...room, batches: enrichedBatches });
});

// Update room
router.patch("/rooms/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, status, capacity, notes, currentGrowingBatchId } =
    req.body as any;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (status !== undefined) updates.status = status;
  if (capacity !== undefined) updates.capacity = capacity;
  if (notes !== undefined) updates.notes = notes;
  if (currentGrowingBatchId !== undefined)
    updates.currentGrowingBatchId = currentGrowingBatchId;
  const [room] = await db
    .update(ootyRoomsTable)
    .set(updates)
    .where(eq(ootyRoomsTable.id, id))
    .returning();
  return res.json(room);
});

// Delete room
router.delete("/rooms/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [room] = await db
    .select()
    .from(ootyRoomsTable)
    .where(eq(ootyRoomsTable.id, id))
    .limit(1);
  if (!room) return res.status(404).json({ error: "Not found" });
  if (room.currentGrowingBatchId) {
    return res.status(409).json({
      error:
        "Cannot delete a room with an active growing batch. Complete or archive the batch first.",
    });
  }

  const batches = await db
    .select({ id: ootyGrowingBatchesTable.id })
    .from(ootyGrowingBatchesTable)
    .where(eq(ootyGrowingBatchesTable.roomId, id));

  await db.transaction(async (tx) => {
    if (batches.length > 0) {
      const batchIds = batches.map((b) => b.id);
      await tx
        .update(batchLinksTable)
        .set({ ootyGrowingBatchId: null } as any)
        .where(inArray(batchLinksTable.ootyGrowingBatchId as any, batchIds));
      await tx
        .delete(ootyGrowingBatchesTable)
        .where(inArray(ootyGrowingBatchesTable.id, batchIds));
    }
    await tx.delete(ootyRoomsTable).where(eq(ootyRoomsTable.id, id));
  });

  return res.status(204).send();
});

// List all growing batches
router.get("/growing-batches", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(ootyGrowingBatchesTable)
    .orderBy(desc(ootyGrowingBatchesTable.createdAt));
  return res.json(rows);
});

// Create growing batch — accepts batchSources: [{annurBatchId, bagCount}]
router.post("/growing-batches", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const {
    roomId,
    annurBatchId,
    coimBatchId,
    spawnRunStartDate,
    notes,
    batchSources,
    bagCount,
  } = req.body as any;
  const [room] = await db
    .select()
    .from(ootyRoomsTable)
    .where(eq(ootyRoomsTable.id, roomId))
    .limit(1);
  if (!room) return res.status(400).json({ error: "Room not found" });
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const existing = await db.select().from(ootyGrowingBatchesTable);
  const code = `B-${yy}${mm}${dd}-${String(existing.length + 1).padStart(3, "0")}`;

  const requestedSources: Array<{ annurBatchId: number; bagCount?: number }> =
    Array.isArray(batchSources) && batchSources.length > 0
      ? batchSources
      : annurBatchId
        ? [{ annurBatchId: Number(annurBatchId), bagCount: bagCount ?? null }]
        : [];
  for (const source of requestedSources) {
    const [annurBatch] = await db
      .select()
      .from(batchesTable)
      .where(eq(batchesTable.id, Number(source.annurBatchId)))
      .limit(1);
    if (
      !annurBatch ||
      annurBatch.currentStage !== "COMPLETED" ||
      annurBatch.status !== "dispatched" ||
      !annurBatch.actualBags
    )
      return res
        .status(400)
        .json({ error: "Select a completed Annur batch with produced bags" });
    const allocated = (
      await db
        .select()
        .from(ootyBatchSourcesTable)
        .where(eq(ootyBatchSourcesTable.annurBatchId, annurBatch.id))
    ).reduce((sum, row) => sum + Number(row.bagCount || 0), 0);
    const requested = Number(source.bagCount || 0);
    if (
      !Number.isInteger(requested) ||
      requested <= 0 ||
      allocated + requested > annurBatch.actualBags
    )
      return res.status(400).json({
        error: `Only ${annurBatch.actualBags - allocated} produced bags remain available from ${annurBatch.batchCode}`,
      });
  }
  if (requestedSources.length === 0)
    return res.status(400).json({
      error: "Select a completed Annur batch and enter the bags allocated",
    });
  const totalAllocatedBags = requestedSources.reduce(
    (sum, source) => sum + Number(source.bagCount || 0),
    0,
  );
  if (room.capacity && totalAllocatedBags > room.capacity)
    return res.status(400).json({
      error: `${room.name} capacity is ${room.capacity} bags. You cannot allocate ${totalAllocatedBags} bags.`,
    });
  const [growBagMaterial] = await db
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.sku, "VLT-RM-GROW-BAG"))
    .limit(1);
  const [annurWarehouse] = await db
    .select()
    .from(inventoryLocationsTable)
    .where(eq(inventoryLocationsTable.systemCode, "ANNUR"))
    .limit(1);
  const [annurLocation] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.code, "A"))
    .limit(1);
  if (!growBagMaterial || !annurWarehouse || !annurLocation)
    return res
      .status(409)
      .json({ error: "Annur Grow Bag inventory configuration is missing" });
  const [availableStock] = await db
    .select()
    .from(inventoryTable)
    .where(
      and(
        eq(inventoryTable.materialId, growBagMaterial.id),
        eq(inventoryTable.locationId, annurWarehouse.id),
      ),
    )
    .limit(1);
  if (
    !availableStock ||
    Number(availableStock.quantityOnHand) < totalAllocatedBags
  )
    return res.status(409).json({
      error: `Only ${Number(availableStock?.quantityOnHand || 0)} grow bags are available in the Annur Vault`,
    });

  const result = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(ootyGrowingBatchesTable)
      .values({
        batchCode: code,
        roomId,
        annurBatchId: annurBatchId ?? null,
        coimBatchId: coimBatchId ?? null,
        currentPhase: "SPAWN_RUN",
        currentStage: "SPAWN_RUN",
        phaseEnteredAt: now,
        status: "active",
        spawnRunStartDate: spawnRunStartDate ?? null,
        notes: notes ?? null,
        createdByUserId: userId,
      })
      .returning();

    // Create stage log for the initial stage
    await tx.insert(ootyStageLogsTable).values({
      growingBatchId: batch.id,
      stage: "SPAWN_RUN",
      enteredAt: now,
      recordedByUserId: userId,
    });

    // Handle batch sources (many-to-many Annur batch linkage)
    const sources = requestedSources;
    for (const src of sources) {
      if (src.annurBatchId) {
        await tx.insert(ootyBatchSourcesTable).values({
          growingBatchId: batch.id,
          annurBatchId: src.annurBatchId,
          bagCount: src.bagCount ?? null,
        });
      }
    }
    await markFullyAllocatedAnnurBatchesFinished(
      tx,
      sources.map((source) => Number(source.annurBatchId)),
    );

    // Consume assigned grow bags from Annur Vault in the same transaction.
    const [stock] = await tx
      .select()
      .from(inventoryTable)
      .where(
        and(
          eq(inventoryTable.materialId, growBagMaterial.id),
          eq(inventoryTable.locationId, annurWarehouse.id),
        ),
      )
      .limit(1);
    if (!stock || Number(stock.quantityOnHand) < totalAllocatedBags)
      throw new Error("Insufficient Annur Grow Bag stock");
    const [updatedStock] = await tx
      .update(inventoryTable)
      .set({
        quantityOnHand: String(
          Number(stock.quantityOnHand) - totalAllocatedBags,
        ),
        lastUpdated: now,
      })
      .where(eq(inventoryTable.id, stock.id))
      .returning();
    const traceNotes = `Ooty Growing Room assignment | Growing Batch: ${batch.batchCode} (#${batch.id}) | Room: ${room.name} (#${room.id}) | Annur Sources: ${requestedSources.map((source) => `#${source.annurBatchId}: ${source.bagCount} bags`).join(", ")} | Total Bags: ${totalAllocatedBags}`;
    const [adjustment] = await tx
      .insert(inventoryAdjustmentsTable)
      .values({
        materialId: growBagMaterial.id,
        locationId: annurLocation.id,
        quantityDelta: String(-totalAllocatedBags),
        reason: "production_consumption",
        notes: traceNotes,
        adjustedByUserId: userId,
      })
      .returning();
    await tx.insert(ootyGrowBagInventoryPostingsTable).values({
      postingKey: `ooty-grow-bag-assignment:${batch.id}`,
      growingBatchId: batch.id,
      inventoryId: updatedStock.id,
      inventoryAdjustmentId: adjustment.id,
      warehouseId: annurWarehouse.id,
      allocatedBags: totalAllocatedBags,
    });

    // Set room to active
    await tx
      .update(ootyRoomsTable)
      .set({ status: "active", currentGrowingBatchId: batch.id })
      .where(eq(ootyRoomsTable.id, roomId));

    return batch;
  });

  return res.status(201).json(result);
});

// Get growing batch detail — includes stage logs and batch sources
router.get("/growing-batches/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [batch] = await db
    .select()
    .from(ootyGrowingBatchesTable)
    .where(eq(ootyGrowingBatchesTable.id, id))
    .limit(1);
  if (!batch) return res.status(404).json({ error: "Not found" });

  const [observations, harvests, approvals, rawStageLogs, batchSources] =
    await Promise.all([
      db
        .select()
        .from(ootyObservationsTable)
        .where(eq(ootyObservationsTable.growingBatchId, id))
        .orderBy(ootyObservationsTable.observationDate),
      db
        .select()
        .from(ootyHarvestsTable)
        .where(eq(ootyHarvestsTable.growingBatchId, id))
        .orderBy(ootyHarvestsTable.harvestDate),
      db
        .select()
        .from(phaseApprovalsTable)
        .where(eq(phaseApprovalsTable.entityId, id))
        .orderBy(phaseApprovalsTable.createdAt),
      db
        .select()
        .from(ootyStageLogsTable)
        .where(eq(ootyStageLogsTable.growingBatchId, id))
        .orderBy(ootyStageLogsTable.enteredAt),
      db
        .select({
          id: ootyBatchSourcesTable.id,
          annurBatchId: ootyBatchSourcesTable.annurBatchId,
          bagCount: ootyBatchSourcesTable.bagCount,
          batchCode: batchesTable.batchCode,
        })
        .from(ootyBatchSourcesTable)
        .leftJoin(
          batchesTable,
          eq(ootyBatchSourcesTable.annurBatchId, batchesTable.id),
        )
        .where(eq(ootyBatchSourcesTable.growingBatchId, id)),
    ]);

  const stageLogs = rawStageLogs.map(parseStageLog);

  // Derive currentStage for legacy batches that have currentStage defaulting to empty
  const effectiveCurrentStage =
    batch.currentStage && batch.currentStage !== ""
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
  const { status, notes, casingAppliedDate, cookoutDate, substrateWeightKg } =
    req.body as any;
  const updates: any = {};
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (casingAppliedDate !== undefined)
    updates.casingAppliedDate = casingAppliedDate;
  if (cookoutDate !== undefined) updates.cookoutDate = cookoutDate;
  if (substrateWeightKg !== undefined)
    updates.substrateWeightKg = String(substrateWeightKg);
  const [batch] = await db
    .update(ootyGrowingBatchesTable)
    .set(updates)
    .where(eq(ootyGrowingBatchesTable.id, id))
    .returning();
  return res.json(batch);
});

// Advance stage — stage-based, requires 2 verification images
// Accepts: nextStage, verificationImages[], notes, casingSourceType, casingBatchRef, harvestData, cookoutDate, substrateWeightKg, manureKg
router.post("/growing-batches/:id/advance", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = (req.session as any).userId;
  const {
    nextStage,
    verificationImages,
    notes,
    casingSourceType,
    casingBatchRef,
    casingInventorySourceId,
    casingQuantityKg,
    harvestData,
    cookoutDate,
    substrateWeightKg,
    manureKg,
    // Legacy fields
    nextPhase,
  } = req.body as any;

  const [batch] = await db
    .select()
    .from(ootyGrowingBatchesTable)
    .where(eq(ootyGrowingBatchesTable.id, id))
    .limit(1);
  if (!batch) return res.status(404).json({ error: "Not found" });

  // Support legacy nextPhase field (from old approve-phase flow)
  const targetStage = nextStage ?? (nextPhase ? phaseToStage(nextPhase) : null);
  if (!targetStage)
    return res.status(400).json({ error: "nextStage is required" });

  const effectiveCurrentStage =
    batch.currentStage && batch.currentStage !== ""
      ? normalizeStage(batch.currentStage)
      : phaseToStage(batch.currentPhase);
  const isCookoutCompletion =
    effectiveCurrentStage === "COOKOUT" && targetStage === "COMPLETED";
  const isCasingRunCompletion =
    effectiveCurrentStage === "CASING_RUN" &&
    (targetStage === "PINNING_FLUSH1" || targetStage === "DF");
  let casingInventorySource: any = null;
  let casingUsedKg = 0;
  const casingConsumptionKey = `ooty-casing-run:${id}`;
  if (isCasingRunCompletion) {
    if (casingSourceType !== "produced" && casingSourceType !== "purchased")
      return res
        .status(400)
        .json({ error: "Select Produced or Purchased Casing Soil" });
    const sourceId = Number(casingInventorySourceId);
    casingUsedKg = Number(casingQuantityKg);
    if (!Number.isInteger(sourceId) || sourceId <= 0)
      return res
        .status(400)
        .json({ error: "Select a Casing Soil batch or lot" });
    if (!Number.isFinite(casingUsedKg) || casingUsedKg <= 0)
      return res
        .status(400)
        .json({ error: "Casing Soil Quantity Used must be greater than 0 kg" });
    [casingInventorySource] = await db
      .select()
      .from(casingSoilInventorySourcesTable)
      .where(eq(casingSoilInventorySourcesTable.id, sourceId))
      .limit(1);
    if (
      !casingInventorySource ||
      casingInventorySource.sourceType !== casingSourceType
    )
      return res
        .status(400)
        .json({ error: "The selected Casing Soil source is invalid" });
    const physical = Number(casingInventorySource.availableQuantityKg);
    const reserved = Number(casingInventorySource.reservedQuantityKg || 0);
    const available = Math.max(0, physical - reserved);
    if (available < casingUsedKg)
      return res.status(409).json({
        error: `Insufficient Casing Soil stock. Selected ${casingInventorySource.reference} has ${available} kg available. Requested: ${casingUsedKg} kg.`,
      });
    const [existingConsumption] = await db
      .select()
      .from(ootyCasingRunConsumptionsTable)
      .where(
        eq(ootyCasingRunConsumptionsTable.postingKey, casingConsumptionKey),
      )
      .limit(1);
    if (existingConsumption)
      return res
        .status(409)
        .json({ error: "Casing Run inventory consumption was already posted" });
  }

  // Verification photos are optional. Preserve up to two when supplied.
  const imgs: string[] = Array.isArray(verificationImages)
    ? verificationImages.filter(Boolean).slice(0, 2)
    : [];

  const flushNumber = flushNumberForStage(effectiveCurrentStage);
  const expectedHarvestTarget =
    flushNumber === 1 ? "FLUSH2" : flushNumber === 2 ? "COOKOUT" : null;
  let harvestProduction: ReturnType<typeof validateHarvestProduction> | null =
    null;
  let mushroomMaterial: any = null,
    ootyWarehouse: any = null,
    room: any = null,
    ootyLocation: any = null;
  let postingKey: string | null = null;
  if (flushNumber) {
    if (targetStage !== expectedHarvestTarget)
      return res.status(409).json({
        error:
          "This flush has already been completed or the next stage is invalid",
      });
    harvestProduction = validateHarvestProduction(harvestData);
    if (!harvestProduction.ok)
      return res.status(400).json({ error: harvestProduction.error });
    [mushroomMaterial] = await db
      .select()
      .from(materialsTable)
      .where(eq(materialsTable.sku, "VLT-FP-MUSHROOM"))
      .limit(1);
    if (!mushroomMaterial)
      return res.status(409).json({
        error: "Mushroom is missing from the Vault Item & Product Master",
      });
    [room] = await db
      .select()
      .from(ootyRoomsTable)
      .where(eq(ootyRoomsTable.id, batch.roomId))
      .limit(1);
    [ootyLocation] = room
      ? await db
          .select()
          .from(locationsTable)
          .where(eq(locationsTable.id, room.locationId))
          .limit(1)
      : [];
    if (!room || !ootyLocation || ootyLocation.code !== "B")
      return res.status(409).json({
        error: "Harvest stock can only be posted from Ooty Location B",
      });
    const vaultLocations = await db.select().from(inventoryLocationsTable);
    ootyWarehouse = vaultLocations.find(
      (location: any) =>
        String(location.systemCode ?? "").toUpperCase() === "OOTY" ||
        /ooty/i.test(String(location.locationName ?? "")),
    );
    if (!ootyWarehouse)
      return res.status(409).json({ error: "Ooty Vault store was not found" });
    postingKey = harvestInventoryPostingKey(id, flushNumber);
    const [existingPosting] = await db
      .select()
      .from(ootyHarvestInventoryPostingsTable)
      .where(eq(ootyHarvestInventoryPostingsTable.postingKey, postingKey))
      .limit(1);
    if (existingPosting)
      return res
        .status(409)
        .json({ error: `Flush ${flushNumber} inventory was already posted` });
  }
  let cookoutProduction: ReturnType<typeof validateCookoutManure> | null = null;
  let manureMaterial: any = null;
  let cookoutPostingKey: string | null = null;
  if (isCookoutCompletion) {
    cookoutProduction = validateCookoutManure(manureKg);
    if (!cookoutProduction.ok)
      return res.status(400).json({ error: cookoutProduction.error });
    if (!cookoutDate)
      return res.status(400).json({ error: "Cookout date is required" });
    const spentSubstrate = Number(substrateWeightKg);
    if (!Number.isFinite(spentSubstrate) || spentSubstrate < 0)
      return res
        .status(400)
        .json({ error: "Spent substrate must be a non-negative number" });
    [manureMaterial] = await db
      .select()
      .from(materialsTable)
      .where(eq(materialsTable.sku, "VLT-RM-MANURE"))
      .limit(1);
    if (!manureMaterial)
      return res.status(409).json({
        error: "Manure is missing from the Vault Item & Product Master",
      });
    [room] = await db
      .select()
      .from(ootyRoomsTable)
      .where(eq(ootyRoomsTable.id, batch.roomId))
      .limit(1);
    [ootyLocation] = room
      ? await db
          .select()
          .from(locationsTable)
          .where(eq(locationsTable.id, room.locationId))
          .limit(1)
      : [];
    if (!room || !ootyLocation || ootyLocation.code !== "B")
      return res.status(409).json({
        error: "Cookout output can only be posted from Ooty Location B",
      });
    const vaultLocations = await db.select().from(inventoryLocationsTable);
    ootyWarehouse = vaultLocations.find(
      (location: any) =>
        String(location.systemCode ?? "").toUpperCase() === "OOTY",
    );
    if (!ootyWarehouse)
      return res.status(409).json({ error: "Ooty Warehouse was not found" });
    cookoutPostingKey = cookoutManurePostingKey(id);
    const [existingPosting] = await db
      .select()
      .from(ootyCookoutInventoryPostingsTable)
      .where(
        eq(ootyCookoutInventoryPostingsTable.postingKey, cookoutPostingKey),
      )
      .limit(1);
    if (existingPosting)
      return res
        .status(409)
        .json({ error: "Cookout Manure inventory was already posted" });
  }

  const now = new Date();
  const nextPhaseValue = stageToPhase(targetStage);
  const phaseChanged = nextPhaseValue !== stageToPhase(effectiveCurrentStage);

  const updated = await db.transaction(async (tx) => {
    if (isCasingRunCompletion && casingInventorySource) {
      const availableBefore = Number(casingInventorySource.availableQuantityKg);
      const consumedBefore = Number(casingInventorySource.consumedQuantityKg);
      const [updatedSource] = await tx
        .update(casingSoilInventorySourcesTable)
        .set({
          consumedQuantityKg: String(consumedBefore + casingUsedKg),
          availableQuantityKg: String(availableBefore - casingUsedKg),
          status: availableBefore - casingUsedKg > 0 ? "available" : "depleted",
        })
        .where(
          and(
            eq(casingSoilInventorySourcesTable.id, casingInventorySource.id),
            eq(casingSoilInventorySourcesTable.sourceType, casingSourceType),
            gte(
              casingSoilInventorySourcesTable.availableQuantityKg,
              casingUsedKg,
            ),
          ),
        )
        .returning();
      if (!updatedSource)
        throw new Error(
          "Casing Soil stock changed. Refresh and select an available source again.",
        );
      const [stock] = await tx
        .select()
        .from(inventoryTable)
        .where(eq(inventoryTable.id, casingInventorySource.inventoryId))
        .limit(1);
      if (!stock || Number(stock.quantityOnHand) < casingUsedKg)
        throw new Error("Aggregate Casing Soil inventory is insufficient");
      await tx
        .update(inventoryTable)
        .set({
          quantityOnHand: String(Number(stock.quantityOnHand) - casingUsedKg),
          lastUpdated: now,
        })
        .where(eq(inventoryTable.id, stock.id));
      const [consumptionRoom] = await tx
        .select()
        .from(ootyRoomsTable)
        .where(eq(ootyRoomsTable.id, batch.roomId))
        .limit(1);
      if (!consumptionRoom)
        throw new Error("The growing room for this Casing Run was not found");
      const [adjustment] = await tx
        .insert(inventoryAdjustmentsTable)
        .values({
          materialId: casingInventorySource.materialId,
          locationId: consumptionRoom.locationId,
          quantityDelta: String(-casingUsedKg),
          reason: "Casing Run Consumption",
          reference: casingInventorySource.reference,
          notes: `Growing batch ${batch.batchCode}; room ${batch.roomId}; source ${casingSourceType}`,
          adjustedByUserId: userId,
        })
        .returning();
      const [openLog] = await tx
        .select()
        .from(ootyStageLogsTable)
        .where(
          and(
            eq(ootyStageLogsTable.growingBatchId, id),
            isNull(ootyStageLogsTable.exitedAt),
          ),
        )
        .limit(1);
      await tx.insert(ootyCasingRunConsumptionsTable).values({
        postingKey: casingConsumptionKey,
        growingBatchId: id,
        stageLogId: openLog?.id ?? null,
        roomId: batch.roomId,
        inventorySourceId: casingInventorySource.id,
        sourceType: casingSourceType,
        sourceReference: casingInventorySource.reference,
        quantityKg: String(casingUsedKg),
        inventoryAdjustmentId: adjustment.id,
        consumedByUserId: userId,
      });
    }
    // Close the current stage log
    await tx
      .update(ootyStageLogsTable)
      .set({
        exitedAt: now,
        verificationImages: imgs.length > 0 ? JSON.stringify(imgs) : null,
        notes: notes ?? null,
        casingBatchRef: isCasingRunCompletion
          ? (casingInventorySource?.reference ?? null)
          : null,
        casingSoilSourceType: isCasingRunCompletion ? casingSourceType : null,
        casingSoilInventorySourceId: isCasingRunCompletion
          ? (casingInventorySource?.id ?? null)
          : null,
        casingSoilQuantityKg: isCasingRunCompletion
          ? String(casingUsedKg)
          : null,
        recordedByUserId: userId,
      })
      .where(
        and(
          eq(ootyStageLogsTable.growingBatchId, id),
          isNull(ootyStageLogsTable.exitedAt),
        ),
      );

    // Build batch updates
    const batchUpdates: any = {
      currentStage: targetStage,
      currentPhase: nextPhaseValue,
    };
    if (phaseChanged) batchUpdates.phaseEnteredAt = now;
    if (targetStage === "CASING_RUN")
      batchUpdates.casingAppliedDate = now.toISOString().split("T")[0];
    if (cookoutDate !== undefined && cookoutDate !== null)
      batchUpdates.cookoutDate = cookoutDate;
    if (substrateWeightKg !== undefined && substrateWeightKg !== null)
      batchUpdates.substrateWeightKg = String(substrateWeightKg);
    if (cookoutProduction?.ok)
      batchUpdates.manureProducedKg = String(cookoutProduction.manureKg);
    if (targetStage === "COMPLETED") batchUpdates.status = "completed";

    // If completing (COOKOUT→COMPLETED), reset room
    if (targetStage === "COMPLETED") {
      await tx
        .update(ootyRoomsTable)
        .set({ status: "idle", currentGrowingBatchId: null })
        .where(eq(ootyRoomsTable.id, batch.roomId));
    }

    // Save harvest, increment Ooty Mushroom stock, and write traceability atomically.
    if (flushNumber && harvestProduction?.ok && postingKey) {
      const [harvest] = await tx
        .insert(ootyHarvestsTable)
        .values({
          growingBatchId: id,
          harvestDate:
            harvestData.harvestDate ?? now.toISOString().split("T")[0],
          weightKg: String(harvestProduction.weightKg),
          mushroomCount: harvestProduction.mushroomCount,
          avgWeightG: String(
            Math.round(
              (harvestProduction.weightKg * 1000 * 10) /
                harvestProduction.mushroomCount,
            ) / 10,
          ),
          qualityNote: harvestData.qualityNote ?? null,
          flushNumber,
          recordedByUserId: userId,
        })
        .returning();
      let [stock] = await tx
        .select()
        .from(inventoryTable)
        .where(
          and(
            eq(inventoryTable.materialId, mushroomMaterial.id),
            eq(inventoryTable.locationId, ootyWarehouse.id),
          ),
        )
        .limit(1);
      if (stock)
        [stock] = await tx
          .update(inventoryTable)
          .set({
            quantityOnHand: String(
              Number(stock.quantityOnHand) + harvestProduction.mushroomCount,
            ),
            lastUpdated: now,
          })
          .where(eq(inventoryTable.id, stock.id))
          .returning();
      else
        [stock] = await tx
          .insert(inventoryTable)
          .values({
            materialId: mushroomMaterial.id,
            locationId: ootyWarehouse.id,
            quantityOnHand: String(harvestProduction.mushroomCount),
          })
          .returning();
      const traceNotes = [
        "Ooty Growing Rooms mushroom harvest",
        `Growing Batch: ${batch.batchCode} (#${id})`,
        `Room: ${room.name} (#${room.id})`,
        `Flush: ${flushNumber}`,
        `Harvest: #${harvest.id}`,
        `Harvest Date: ${harvest.harvestDate}`,
        `Harvest Weight: ${harvestProduction.weightKg} kg`,
        `Mushroom Count: ${harvestProduction.mushroomCount}`,
      ].join(" | ");
      const [adjustment] = await tx
        .insert(inventoryAdjustmentsTable)
        .values({
          materialId: mushroomMaterial.id,
          locationId: ootyLocation.id,
          quantityDelta: String(harvestProduction.mushroomCount),
          reason: "production",
          notes: traceNotes,
          adjustedByUserId: userId,
        })
        .returning();
      await tx.insert(ootyHarvestInventoryPostingsTable).values({
        postingKey,
        growingBatchId: id,
        harvestId: harvest.id,
        flushNumber,
        inventoryId: stock.id,
        inventoryAdjustmentId: adjustment.id,
        warehouseId: ootyWarehouse.id,
        mushroomCount: harvestProduction.mushroomCount,
        harvestWeightKg: String(harvestProduction.weightKg),
      });
    }

    // Increment Ooty Manure and create its traceable production ledger entry atomically.
    if (isCookoutCompletion && cookoutProduction?.ok && cookoutPostingKey) {
      let [stock] = await tx
        .select()
        .from(inventoryTable)
        .where(
          and(
            eq(inventoryTable.materialId, manureMaterial.id),
            eq(inventoryTable.locationId, ootyWarehouse.id),
          ),
        )
        .limit(1);
      if (stock)
        [stock] = await tx
          .update(inventoryTable)
          .set({
            quantityOnHand: String(
              Number(stock.quantityOnHand) + cookoutProduction.manureKg,
            ),
            lastUpdated: now,
          })
          .where(eq(inventoryTable.id, stock.id))
          .returning();
      else
        [stock] = await tx
          .insert(inventoryTable)
          .values({
            materialId: manureMaterial.id,
            locationId: ootyWarehouse.id,
            quantityOnHand: String(cookoutProduction.manureKg),
          })
          .returning();
      const traceNotes = [
        "Ooty Growing Rooms Cookout Manure output",
        `Growing Batch: ${batch.batchCode} (#${id})`,
        `Room: ${room.name} (#${room.id})`,
        "Stage: Cookout",
        `Cookout Date: ${cookoutDate}`,
        `Spent Substrate: ${substrateWeightKg} kg`,
        `Manure Produced: ${cookoutProduction.manureKg} kg`,
      ].join(" | ");
      const [adjustment] = await tx
        .insert(inventoryAdjustmentsTable)
        .values({
          materialId: manureMaterial.id,
          locationId: ootyLocation.id,
          quantityDelta: String(cookoutProduction.manureKg),
          reason: "production",
          notes: traceNotes,
          adjustedByUserId: userId,
        })
        .returning();
      await tx.insert(ootyCookoutInventoryPostingsTable).values({
        postingKey: cookoutPostingKey,
        growingBatchId: id,
        inventoryId: stock.id,
        inventoryAdjustmentId: adjustment.id,
        warehouseId: ootyWarehouse.id,
        manureKg: String(cookoutProduction.manureKg),
        cookoutDate,
      });
    }

    const [row] = await tx
      .update(ootyGrowingBatchesTable)
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

  if (!updated)
    return res.status(409).json({
      error: "This casing soil batch has already been used or is not completed",
    });
  return res.json({ ...updated, completedStage: batch.currentStage });
});

// Add observation
router.post(
  "/growing-batches/:id/observations",
  requireAuth,
  async (req, res) => {
    const growingBatchId = Number(req.params.id);
    const userId = (req.session as any).userId;
    const {
      observationDate,
      temperatureCelsius,
      observationNote,
      observationType,
    } = req.body as any;
    const [obs] = await db
      .insert(ootyObservationsTable)
      .values({
        growingBatchId,
        observationDate,
        temperatureCelsius: temperatureCelsius
          ? String(temperatureCelsius)
          : null,
        observationNote: observationNote ?? null,
        observationType: observationType ?? "daily",
        recordedByUserId: userId,
      })
      .returning();
    return res.status(201).json(obs);
  },
);

// List observations
router.get(
  "/growing-batches/:id/observations",
  requireAuth,
  async (req, res) => {
    const id = Number(req.params.id);
    const rows = await db
      .select()
      .from(ootyObservationsTable)
      .where(eq(ootyObservationsTable.growingBatchId, id))
      .orderBy(ootyObservationsTable.observationDate);
    return res.json(rows);
  },
);

// Add harvest (manual, standalone — not via stage completion)
router.post("/growing-batches/:id/harvests", requireAuth, async (req, res) => {
  const growingBatchId = Number(req.params.id);
  const userId = (req.session as any).userId;
  const {
    harvestDate,
    weightKg,
    mushroomCount,
    avgWeightG,
    qualityNote,
    flushNumber,
  } = req.body as any;
  const [harvest] = await db
    .insert(ootyHarvestsTable)
    .values({
      growingBatchId,
      harvestDate,
      weightKg: String(weightKg),
      mushroomCount: mushroomCount ?? null,
      avgWeightG: avgWeightG ? String(avgWeightG) : null,
      qualityNote: qualityNote ?? null,
      flushNumber: flushNumber ?? 1,
      recordedByUserId: userId,
    })
    .returning();
  return res.status(201).json(harvest);
});

// List harvests
router.get("/growing-batches/:id/harvests", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select()
    .from(ootyHarvestsTable)
    .where(eq(ootyHarvestsTable.growingBatchId, id))
    .orderBy(ootyHarvestsTable.harvestDate);
  return res.json(rows);
});

// Phase approval (kept for backward compat; new flow uses /advance directly)
router.post(
  "/growing-batches/:id/approve-phase",
  requireAuth,
  async (req, res) => {
    const entityId = Number(req.params.id);
    const userId = (req.session as any).userId;
    const { fromPhase, toPhase, decision, rejectionReason } = req.body as any;
    const [batch] = await db
      .select()
      .from(ootyGrowingBatchesTable)
      .where(eq(ootyGrowingBatchesTable.id, entityId))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "Not found" });

    const approval = await db.transaction(async (tx) => {
      const [appr] = await tx
        .insert(phaseApprovalsTable)
        .values({
          entityType: "ooty_growing_batch",
          entityId,
          fromPhase,
          toPhase,
          decision,
          approvedByUserId: userId,
          decidedAt: new Date(),
          rejectionReason: rejectionReason ?? null,
        })
        .returning();
      return appr;
    });
    return res.json(approval);
  },
);

export default router;
