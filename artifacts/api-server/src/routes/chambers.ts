import { Router } from "express";
import { db } from "@workspace/db";
import {
  chambersTable,
  chamberReadingsTable,
  locationsTable,
  batchesTable,
  usersTable,
} from "@workspace/db";
import { and, eq, desc } from "@workspace/db";
import { organizationId } from "../lib/access";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId)
    return res.status(401).json({ error: "Not authenticated" });
  next();
}

// List chambers
router.get("/", requireAuth, async (req, res) => {
  const { locationId } = req.query as Record<string, string | undefined>;

  const rows = await db
    .select({
      chamber: chambersTable,
      locationCode: locationsTable.code,
      currentBatchCode: batchesTable.batchCode,
    })
    .from(chambersTable)
    .innerJoin(locationsTable, eq(chambersTable.locationId, locationsTable.id))
    .leftJoin(batchesTable, eq(chambersTable.currentBatchId, batchesTable.id))
    .where(eq(chambersTable.organizationId, organizationId(req)));

  let filtered = rows;
  if (locationId)
    filtered = filtered.filter(
      (r) => String(r.chamber.locationId) === locationId,
    );

  return res.json(
    filtered.map((r) => ({
      id: r.chamber.id,
      name: r.chamber.name,
      locationId: r.chamber.locationId,
      locationCode: r.locationCode,
      chamberType: r.chamber.chamberType,
      status: r.chamber.status,
      capacity: r.chamber.capacity,
      currentBatchId: r.chamber.currentBatchId,
      currentBatchCode: r.currentBatchCode ?? null,
      lastTemperature:
        r.chamber.lastTemperature !== null
          ? Number(r.chamber.lastTemperature)
          : null,
      lastNh3: r.chamber.lastNh3 !== null ? Number(r.chamber.lastNh3) : null,
      lastReadingAt: r.chamber.lastReadingAt,
      lengthM: r.chamber.lengthM !== null ? Number(r.chamber.lengthM) : null,
      widthM: r.chamber.widthM !== null ? Number(r.chamber.widthM) : null,
      heightM: r.chamber.heightM !== null ? Number(r.chamber.heightM) : null,
      notes: r.chamber.notes,
    })),
  );
});

// Create chamber
router.post("/", requireAuth, async (req, res) => {
  const {
    name,
    locationId,
    chamberType,
    capacity,
    lengthM,
    widthM,
    heightM,
    notes,
  } = req.body;

  const [chamber] = await db
    .insert(chambersTable)
    .values({
      organizationId: organizationId(req),
      name,
      locationId,
      chamberType: chamberType ?? "bulk",
      status: "idle",
      capacity: capacity ?? null,
      lengthM: lengthM ?? null,
      widthM: widthM ?? null,
      heightM: heightM ?? null,
      notes: notes ?? null,
    })
    .returning();

  const [loc] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, locationId))
    .limit(1);
  return res.status(201).json({ ...chamber, locationCode: loc?.code ?? "" });
});

// Get chamber detail
router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .select({
      chamber: chambersTable,
      locationCode: locationsTable.code,
      currentBatchCode: batchesTable.batchCode,
    })
    .from(chambersTable)
    .innerJoin(locationsTable, eq(chambersTable.locationId, locationsTable.id))
    .leftJoin(batchesTable, eq(chambersTable.currentBatchId, batchesTable.id))
    .where(
      and(
        eq(chambersTable.id, id),
        eq(chambersTable.organizationId, organizationId(req)),
      ),
    )
    .limit(1);

  if (!row) return res.status(404).json({ error: "Chamber not found" });

  const readings = await db
    .select()
    .from(chamberReadingsTable)
    .where(
      and(
        eq(chamberReadingsTable.chamberId, id),
        eq(chamberReadingsTable.organizationId, organizationId(req)),
      ),
    )
    .orderBy(desc(chamberReadingsTable.recordedAt))
    .limit(20);

  return res.json({
    id: row.chamber.id,
    name: row.chamber.name,
    locationId: row.chamber.locationId,
    locationCode: row.locationCode,
    chamberType: row.chamber.chamberType,
    status: row.chamber.status,
    capacity: row.chamber.capacity,
    currentBatchId: row.chamber.currentBatchId,
    currentBatchCode: row.currentBatchCode ?? null,
    lastTemperature:
      row.chamber.lastTemperature !== null
        ? Number(row.chamber.lastTemperature)
        : null,
    lastNh3: row.chamber.lastNh3 !== null ? Number(row.chamber.lastNh3) : null,
    lastReadingAt: row.chamber.lastReadingAt,
    lengthM: row.chamber.lengthM !== null ? Number(row.chamber.lengthM) : null,
    widthM: row.chamber.widthM !== null ? Number(row.chamber.widthM) : null,
    heightM: row.chamber.heightM !== null ? Number(row.chamber.heightM) : null,
    notes: row.chamber.notes,
    recentReadings: readings,
  });
});

// Update chamber
router.patch("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const {
    name,
    chamberType,
    status,
    capacity,
    currentBatchId,
    lengthM,
    widthM,
    heightM,
    notes,
  } = req.body;

  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (chamberType !== undefined) updates.chamberType = chamberType;
  if (status !== undefined) updates.status = status;
  if (capacity !== undefined) updates.capacity = capacity;
  if (currentBatchId !== undefined) updates.currentBatchId = currentBatchId;
  if (lengthM !== undefined) updates.lengthM = lengthM;
  if (widthM !== undefined) updates.widthM = widthM;
  if (heightM !== undefined) updates.heightM = heightM;
  if (notes !== undefined) updates.notes = notes;

  const [updated] = await db
    .update(chambersTable)
    .set(updates)
    .where(
      and(
        eq(chambersTable.id, id),
        eq(chambersTable.organizationId, organizationId(req)),
      ),
    )
    .returning();
  if (!updated) return res.status(404).json({ error: "Chamber not found" });

  const [loc] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, updated.locationId))
    .limit(1);
  return res.json({ ...updated, locationCode: loc?.code ?? "" });
});

// Delete chamber
router.delete("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  await db
    .delete(chambersTable)
    .where(
      and(
        eq(chambersTable.id, id),
        eq(chambersTable.organizationId, organizationId(req)),
      ),
    );
  return res.status(204).send();
});

// Get chamber readings
router.get("/:id/readings", requireAuth, async (req, res) => {
  const chamberId = Number(req.params.id);
  const rows = await db
    .select({
      reading: chamberReadingsTable,
      chamberName: chambersTable.name,
      recordedByName: usersTable.displayName,
    })
    .from(chamberReadingsTable)
    .innerJoin(
      chambersTable,
      eq(chamberReadingsTable.chamberId, chambersTable.id),
    )
    .leftJoin(
      usersTable,
      eq(chamberReadingsTable.recordedByUserId, usersTable.id),
    )
    .where(
      and(
        eq(chamberReadingsTable.chamberId, chamberId),
        eq(chamberReadingsTable.organizationId, organizationId(req)),
      ),
    )
    .orderBy(desc(chamberReadingsTable.recordedAt));

  return res.json(
    rows.map((r) => ({
      id: r.reading.id,
      chamberId: r.reading.chamberId,
      chamberName: r.chamberName,
      temperatureCelsius:
        r.reading.temperatureCelsius !== null
          ? Number(r.reading.temperatureCelsius)
          : null,
      nh3Ppm: r.reading.nh3Ppm !== null ? Number(r.reading.nh3Ppm) : null,
      co2Percent:
        r.reading.co2Percent !== null ? Number(r.reading.co2Percent) : null,
      humidity: r.reading.humidity !== null ? Number(r.reading.humidity) : null,
      notes: r.reading.notes,
      recordedAt: r.reading.recordedAt,
      recordedByName: r.recordedByName ?? "System",
    })),
  );
});

// Add chamber reading
router.post("/:id/readings", requireAuth, async (req, res) => {
  const chamberId = Number(req.params.id);
  const userId = (req.session as any).userId;
  const { temperatureCelsius, nh3Ppm, co2Percent, humidity, notes } = req.body;

  const [chamber] = await db
    .select()
    .from(chambersTable)
    .where(
      and(
        eq(chambersTable.id, chamberId),
        eq(chambersTable.organizationId, organizationId(req)),
      ),
    )
    .limit(1);
  if (!chamber) return res.status(404).json({ error: "Chamber not found" });

  const [reading] = await db
    .insert(chamberReadingsTable)
    .values({
      organizationId: organizationId(req),
      chamberId,
      temperatureCelsius: temperatureCelsius ?? null,
      nh3Ppm: nh3Ppm ?? null,
      co2Percent: co2Percent ?? null,
      humidity: humidity ?? null,
      notes: notes ?? null,
      recordedByUserId: userId,
    })
    .returning();

  // Update chamber's last reading
  const updates: Record<string, any> = { lastReadingAt: new Date() };
  if (temperatureCelsius !== undefined)
    updates.lastTemperature = temperatureCelsius;
  if (nh3Ppm !== undefined) updates.lastNh3 = nh3Ppm;
  await db
    .update(chambersTable)
    .set(updates)
    .where(
      and(
        eq(chambersTable.id, chamberId),
        eq(chambersTable.organizationId, organizationId(req)),
      ),
    );

  const interval = new Date(reading.recordedAt);
  interval.setMinutes(0, 0, 0);
  return res.status(201).json({
    ...reading,
    chamberName: chamber.name,
    expectedLogTime: interval.toISOString(),
  });
});

export default router;
