import { Router } from "express";
import { db, eq, locationsTable } from "@workspace/db";

const router = Router();

const canonicalLocations = [
  {
    code: "A",
    name: "Annur",
    description: "Compost preparation and bag production",
  },
  {
    code: "B",
    name: "Ooty",
    description: "Growing rooms and mushroom harvesting",
  },
  { code: "C", name: "Coimbatore", description: "Casing soil production" },
  { code: "D", name: "Lab", description: "Spawn production laboratory" },
];

async function ensureCanonicalLocations() {
  const existing = await db.select().from(locationsTable);
  for (const location of canonicalLocations) {
    if (
      existing.some(
        (row: any) => row.code.trim().toUpperCase() === location.code,
      )
    )
      continue;
    try {
      await db.insert(locationsTable).values(location);
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  }
}

router.get("/", async (_req, res): Promise<any> => {
  await ensureCanonicalLocations();
  const locations = await db.select().from(locationsTable);
  return res.json(locations);
});

router.patch("/:id", async (req, res): Promise<any> => {
  const id = Number(req.params.id);
  const updates: Record<string, string> = {};
  for (const key of ["code", "name", "description"]) {
    if (req.body[key] !== undefined)
      updates[key] = String(req.body[key]).trim();
  }
  const [location] = await db
    .update(locationsTable)
    .set(updates)
    .where(eq(locationsTable.id, id))
    .returning();
  if (!location) return res.status(404).json({ error: "Location not found" });
  return res.json(location);
});

export default router;
