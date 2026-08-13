import { Router } from "express";
import { db, inventoryCategoriesTable, materialsTable } from "@workspace/db";
import { eq, desc } from "@workspace/db";
import { paginateQuery, paginatedResponse } from "../lib/pagination";

const router = Router();

router.get("/", async (req, res) => {
  const categories = await db
    .select()
    .from(inventoryCategoriesTable)
    .where(eq(inventoryCategoriesTable.isActive, true))
    .orderBy(desc(inventoryCategoriesTable.createdAt));
  let data = categories;
  const search = String(req.query.search || "").trim().toLowerCase();
  if (search) data = data.filter((row) => [row.name, row.categoryCode].some((value) => String(value || "").toLowerCase().includes(search)));
  if (req.query.skip === undefined && req.query.limit === undefined) return res.json(data);
  const pagination = paginateQuery(req.query);
  return res.json(paginatedResponse(data.slice(pagination.skip, pagination.skip + pagination.limit), data.length, pagination));
});

router.post("/", async (req, res) => {
  const { name, categoryCode, divisions } = req.body;
  
  let code = categoryCode;
  if (!code) {
    const existing = await db.select().from(inventoryCategoriesTable).orderBy(desc(inventoryCategoriesTable.id)).limit(1);
    const maxId = existing.length > 0 ? existing[0].id : 0;
    code = `CAT-${String(maxId + 1).padStart(3, "0")}`;
  }

  const [category] = await db
    .insert(inventoryCategoriesTable)
    .values({
      name,
      categoryCode: code,
      divisions: divisions || [],
    })
    .returning();
  res.status(201).json(category);
});

router.patch("/:id", async (req, res) => {
  const { name, categoryCode, divisions } = req.body;
  const [updated] = await db
    .update(inventoryCategoriesTable)
    .set({
      name,
      categoryCode,
      divisions,
    })
    .where(eq(inventoryCategoriesTable.id, Number(req.params.id)))
    .returning();
  res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const categoryId = Number(req.params.id);
  
  // Soft delete category
  await db
    .update(inventoryCategoriesTable)
    .set({ isActive: false })
    .where(eq(inventoryCategoriesTable.id, categoryId));

  // Find or create "General" category
  let general = await db
    .select()
    .from(inventoryCategoriesTable)
    .where(eq(inventoryCategoriesTable.name, "General"))
    .limit(1)
    .then(r => r[0]);

  if (!general) {
    [general] = await db.insert(inventoryCategoriesTable).values({
      name: "General",
      categoryCode: "CAT-GEN",
      divisions: [],
    }).returning();
  }

  // Move existing materials to General and clear their attributes
  await db
    .update(materialsTable)
    .set({
      categoryId: general.id,
      attributeValues: {},
    })
    .where(eq(materialsTable.categoryId, categoryId));

  res.json({ success: true });
});

export default router;
