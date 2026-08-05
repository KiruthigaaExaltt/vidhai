import { Router } from "express";
import { db, spawnEntriesTable } from "@workspace/db";
import { eq } from "@workspace/db";
import { desc } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  const entries = await db.select().from(spawnEntriesTable).orderBy(desc(spawnEntriesTable.createdAt));
  res.json(
    entries.map((e) => ({
      ...e,
      quantityKg: Number(e.quantityKg),
    }))
  );
});

router.post("/", async (req, res) => {
  const { strainName, quantityKg, source, receivedAt, expiresAt, notes } = req.body;
  const [entry] = await db
    .insert(spawnEntriesTable)
    .values({
      strainName,
      quantityKg: String(quantityKg),
      source,
      receivedAt,
      expiresAt: expiresAt ?? null,
      notes: notes ?? null,
      status: "available",
    })
    .returning();
  res.status(201).json({ ...entry, quantityKg: Number(entry.quantityKg) });
});

export default router;
