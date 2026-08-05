import { Router } from "express";
import { db, locationsTable } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  const locations = await db.select().from(locationsTable);
  res.json(locations);
});

export default router;
