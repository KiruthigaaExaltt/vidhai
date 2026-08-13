import { Router } from "express";
import { db, servicesTable } from "@workspace/db";
import { eq } from "@workspace/db";
import { paginateQuery, paginatedResponse } from "../lib/pagination";

const router = Router();

router.get("/", async (req, res) => {
  const services = await db.select().from(servicesTable).orderBy(servicesTable.name);
  let data: any[] = services.map((s) => ({
      ...s,
      sellingPrice: s.sellingPrice != null ? Number(s.sellingPrice) : null,
      gstPercent: s.gstPercent != null ? Number(s.gstPercent) : null,
    }));
  const search = String(req.query.search || "").trim().toLowerCase();
  if (search) data = data.filter((row: any) => [row.name, row.hsnSac, row.unit].some((value) => String(value || "").toLowerCase().includes(search)));
  if (req.query.skip === undefined && req.query.limit === undefined) return res.json(data);
  const pagination = paginateQuery(req.query);
  return res.json(paginatedResponse(data.slice(pagination.skip, pagination.skip + pagination.limit), data.length, pagination));
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
