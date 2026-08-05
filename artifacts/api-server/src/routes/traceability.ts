import { Router } from "express";
import { db } from "@workspace/db";
import {
  batchLinksTable,
  batchesTable,
  ootyGrowingBatchesTable,
  ootyRoomsTable,
  labSpawnOutputTable,
  locationsTable,
} from "@workspace/db";
import { eq, inArray } from "@workspace/db";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

router.get("/links", requireAuth, async (req, res) => {
  const rows = await db.select().from(batchLinksTable);
  return res.json(rows);
});

router.post("/links", requireAuth, async (req, res) => {
  const { ootyGrowingBatchId, annurBatchId, coimBatchId, labSpawnOutputId, notes } = req.body as any;
  const [link] = await db.insert(batchLinksTable).values({
    ootyGrowingBatchId: ootyGrowingBatchId ?? null,
    annurBatchId: annurBatchId ?? null,
    coimBatchId: coimBatchId ?? null,
    labSpawnOutputId: labSpawnOutputId ?? null,
    notes: notes ?? null,
  }).returning();
  return res.status(201).json(link);
});

router.get("/trace/:ootyGrowingBatchId", requireAuth, async (req, res) => {
  const ootyId = Number(req.params.ootyGrowingBatchId);

  const [batch] = await db.select().from(ootyGrowingBatchesTable)
    .where(eq(ootyGrowingBatchesTable.id, ootyId)).limit(1);
  if (!batch) return res.status(404).json({ error: "Not found" });

  const [room] = await db.select().from(ootyRoomsTable)
    .where(eq(ootyRoomsTable.id, batch.roomId)).limit(1);

  const links = await db.select().from(batchLinksTable)
    .where(eq(batchLinksTable.ootyGrowingBatchId, ootyId));

  let annurBatch = null;
  if (batch.annurBatchId) {
    const rows = await db.select({
      id: batchesTable.id, batchCode: batchesTable.batchCode,
      currentStage: batchesTable.currentStage, status: batchesTable.status,
      locationCode: locationsTable.code,
    }).from(batchesTable)
      .innerJoin(locationsTable, eq(batchesTable.locationId, locationsTable.id))
      .where(eq(batchesTable.id, batch.annurBatchId)).limit(1);
    annurBatch = rows[0] ?? null;
  }

  let coimBatch = null;
  if (batch.coimBatchId) {
    const rows = await db.select({
      id: batchesTable.id, batchCode: batchesTable.batchCode,
      currentStage: batchesTable.currentStage, status: batchesTable.status,
      locationCode: locationsTable.code,
    }).from(batchesTable)
      .innerJoin(locationsTable, eq(batchesTable.locationId, locationsTable.id))
      .where(eq(batchesTable.id, batch.coimBatchId)).limit(1);
    coimBatch = rows[0] ?? null;
  }

  const labOutputIds = links.map(l => l.labSpawnOutputId).filter((v): v is number => v != null);
  const labSpawnOutputs = labOutputIds.length > 0
    ? await db.select().from(labSpawnOutputTable)
        .where(inArray(labSpawnOutputTable.id, labOutputIds))
    : [];

  return res.json({
    ootyGrowingBatch: { ...batch, room: room ?? null },
    annurBatch,
    coimBatch,
    labSpawnOutputs,
    links,
  });
});

export default router;
