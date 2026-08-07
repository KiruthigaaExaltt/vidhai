import { Router } from "express";
import { db, servicesTable } from "@workspace/db";
import { eq } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  const services = await db.select().from(servicesTable).orderBy(servicesTable.name);
  res.json(
    services.map((s) => ({
      ...s,
      sellingPrice: s.sellingPrice != null ? Number(s.sellingPrice) : null,
      gstPercent: s.gstPercent != null ? Number(s.gstPercent) : null,
    }))
  );
});

router.post("/", async (req, res) => {
  const { name, hsnSac, unit, sellingPrice, gstPercent } = req.body;
  const [service] = await db
    .insert(servicesTable)
    .values({
      name,
      hsnSac: hsnSac ?? null,
      unit: unit ?? "Nos",
      sellingPrice: sellingPrice != null ? String(sellingPrice) : "0",
      gstPercent: gstPercent != null ? String(gstPercent) : "0",
    })
    .returning();

  res.status(201).json({
    ...service,
    sellingPrice: service.sellingPrice != null ? Number(service.sellingPrice) : null,
    gstPercent: service.gstPercent != null ? Number(service.gstPercent) : null,
  });
});

router.patch("/:id", async (req, res) => {
  const { name, hsnSac, unit, sellingPrice, gstPercent } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (hsnSac !== undefined) updates.hsnSac = hsnSac ?? null;
  if (unit !== undefined) updates.unit = unit;
  if (sellingPrice !== undefined) updates.sellingPrice = sellingPrice != null ? String(sellingPrice) : "0";
  if (gstPercent !== undefined) updates.gstPercent = gstPercent != null ? String(gstPercent) : "0";

  const [service] = await db.update(servicesTable)
    .set(updates)
    .where(eq(servicesTable.id, Number(req.params.id)))
    .returning();

  if (!service) return res.status(404).json({ error: "Not found" });
  return res.json({
    ...service,
    sellingPrice: service.sellingPrice != null ? Number(service.sellingPrice) : null,
    gstPercent: service.gstPercent != null ? Number(service.gstPercent) : null,
  });
});

router.delete("/:id", async (req, res) => {
  await db.delete(servicesTable).where(eq(servicesTable.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;
