import { Router } from "express";
import { db, materialsTable } from "@workspace/db";
import { eq } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  const mats = await db.select().from(materialsTable).orderBy(materialsTable.name);
  res.json(
    mats.map((m) => ({
      ...m,
      defaultMoisturePercent: m.defaultMoisturePercent != null ? Number(m.defaultMoisturePercent) : null,
      defaultNitrogenPercent: m.defaultNitrogenPercent != null ? Number(m.defaultNitrogenPercent) : null,
    }))
  );
});

router.post("/", async (req, res) => {
  const { name, unit, defaultMoisturePercent, defaultNitrogenPercent, notes } = req.body;
  const [mat] = await db
    .insert(materialsTable)
    .values({
      name,
      unit: unit ?? "kg",
      defaultMoisturePercent: defaultMoisturePercent != null ? String(defaultMoisturePercent) : null,
      defaultNitrogenPercent: defaultNitrogenPercent != null ? String(defaultNitrogenPercent) : null,
      notes: notes ?? null,
    })
    .returning();
  res.status(201).json({
    ...mat,
    defaultMoisturePercent: mat.defaultMoisturePercent != null ? Number(mat.defaultMoisturePercent) : null,
    defaultNitrogenPercent: mat.defaultNitrogenPercent != null ? Number(mat.defaultNitrogenPercent) : null,
  });
});

router.patch("/:id", async (req, res) => {
  const { name, unit, defaultMoisturePercent, defaultNitrogenPercent, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (unit !== undefined) updates.unit = unit;
  if (defaultMoisturePercent !== undefined) updates.defaultMoisturePercent = defaultMoisturePercent != null ? String(defaultMoisturePercent) : null;
  if (defaultNitrogenPercent !== undefined) updates.defaultNitrogenPercent = defaultNitrogenPercent != null ? String(defaultNitrogenPercent) : null;
  if (notes !== undefined) updates.notes = notes;
  const [mat] = await db.update(materialsTable).set(updates).where(eq(materialsTable.id, Number(req.params.id))).returning();
  if (!mat) return res.status(404).json({ error: "Not found" });
  return res.json({
    ...mat,
    defaultMoisturePercent: mat.defaultMoisturePercent != null ? Number(mat.defaultMoisturePercent) : null,
    defaultNitrogenPercent: mat.defaultNitrogenPercent != null ? Number(mat.defaultNitrogenPercent) : null,
  });
});

router.delete("/:id", async (req, res) => {
  await db.delete(materialsTable).where(eq(materialsTable.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;
