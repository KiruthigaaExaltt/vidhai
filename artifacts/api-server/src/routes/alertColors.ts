import { Router } from "express";
import { db, alertColorsTable } from "@workspace/db";
import { eq } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  const colors = await db.select().from(alertColorsTable).orderBy(alertColorsTable.sortOrder);
  res.json(colors);
});

router.post("/", async (req, res) => {
  const { name, hexColor, condition, description, sortOrder } = req.body;
  const [color] = await db
    .insert(alertColorsTable)
    .values({ name, hexColor, condition, description: description ?? "", sortOrder: sortOrder ?? 0 })
    .returning();
  res.status(201).json(color);
});

router.patch("/:id", async (req, res) => {
  const { name, hexColor, condition, description, sortOrder } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (hexColor !== undefined) updates.hexColor = hexColor;
  if (condition !== undefined) updates.condition = condition;
  if (description !== undefined) updates.description = description;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  const [color] = await db.update(alertColorsTable).set(updates).where(eq(alertColorsTable.id, Number(req.params.id))).returning();
  if (!color) return res.status(404).json({ error: "Not found" });
  return res.json(color);
});

router.delete("/:id", async (req, res) => {
  await db.delete(alertColorsTable).where(eq(alertColorsTable.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;
