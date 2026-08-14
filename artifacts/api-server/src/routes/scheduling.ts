import { Router } from "express";
import { db } from "@workspace/db";
import { scheduleEventsTable } from "@workspace/db";
import { eq } from "@workspace/db";
import { listLiveProductionEvents } from "../lib/liveProductionCalendar";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

// ── Lab stage durations (must match the Lab batch stage tracker) ──────────────
const LAB_STAGES_DAYS = {
  MEDIA_PREP:     17,
  MOTHER_CULTURE: 17,
  MILLET_1:        3,
  MILLET_2:        2,
  MOISTURE:        2,
  AUTOCLAVE:       2,
  INOCULATION:     5,
  SHAKING_1:       6,
  SHAKING_2:      11,
};
const LAB_TOTAL_DAYS = Object.values(LAB_STAGES_DAYS).reduce((a, b) => a + b, 0); // 65

// ── Process durations ─────────────────────────────────────────────────────────
const DURATIONS = {
  PACKING_DAYS:             4,   // Fixed packing buffer before sell/ready date
  DF_FIRST_HARVEST_DAY:     9,   // DF Day 9 = start of first harvest window (Day 9–11)
  DF_SECOND_HARVEST_DAY:   15,   // DF Day 15 = start of second harvest window (Day 15–17)
  DF_TOTAL_DAYS:           20,   // Total DF (Development/Fruiting) phase before Cookout
  OOTY_CASING_RUN_DAYS:     9,   // Ooty Casing Run phase duration
  OOTY_SPAWN_RUN_DAYS:     18,   // Ooty Spawn Run phase duration
  ANNUR_TOTAL_DAYS:        25,   // Annur bag-filling + spawn mixing through dispatch
  LAB_TOTAL_DAYS,               // 65 — sum of all 9 Lab stages
  COIM_TOTAL_DAYS:        120,   // Coimbatore casing soil: T1 → QC-approved
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function addDays(d: Date | string, n: number): string {
  const r = new Date(typeof d === "string" ? d : d);
  r.setUTCDate(r.getUTCDate() + n);
  return r.toISOString().split("T")[0];
}
function subDays(d: Date | string, n: number): string {
  return addDays(d, -n);
}
function toDate(d: string): Date {
  return new Date(d + "T00:00:00Z");
}

// ── CRUD routes ───────────────────────────────────────────────────────────────
router.get("/events", requireAuth, async (req, res) => {
  const { locationCode, from, to } = req.query as Record<string, string>;
  let query = db.select().from(scheduleEventsTable).$dynamic();
  if (locationCode) query = query.where(eq(scheduleEventsTable.locationCode, locationCode));
  const storedRows = await query.orderBy(scheduleEventsTable.plannedDate);
  const liveRows = await listLiveProductionEvents();
  return res.json(
    [...storedRows, ...liveRows]
      .filter((event: any) => !locationCode || event.locationCode === locationCode)
      .filter((event: any) => !from || event.plannedDate >= from)
      .filter((event: any) => !to || event.plannedDate <= to)
      .sort((a: any, b: any) => a.plannedDate.localeCompare(b.plannedDate)),
  );
});

router.post("/events", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const { locationCode, entityType, entityId, eventType, plannedDate, startDate, planCode, notes, isManualOverride } = req.body as any;
  const [row] = await db.insert(scheduleEventsTable).values({
    locationCode, entityType, entityId: entityId ?? null, eventType,
    plannedDate, startDate: startDate ?? null,
    planCode: planCode ?? null, notes: notes ?? null,
    isManualOverride: isManualOverride ?? false, isSuggestion: false,
    createdByUserId: userId,
  }).returning();
  return res.status(201).json(row);
});

router.patch("/events/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { plannedDate, startDate, actualDate, notes, isManualOverride } = req.body as any;
  const updates: any = {};
  if (plannedDate !== undefined) updates.plannedDate = plannedDate;
  if (startDate !== undefined) updates.startDate = startDate;
  if (actualDate !== undefined) updates.actualDate = actualDate;
  if (notes !== undefined) updates.notes = notes;
  if (isManualOverride !== undefined) updates.isManualOverride = isManualOverride;
  const [row] = await db.update(scheduleEventsTable).set(updates).where(eq(scheduleEventsTable.id, id)).returning();
  return res.json(row);
});

router.delete("/events/:id", requireAuth, async (req, res) => {
  await db.delete(scheduleEventsTable).where(eq(scheduleEventsTable.id, Number(req.params.id)));
  return res.status(204).send();
});

// ── Backward-scheduling engine ─────────────────────────────────────────────────
//
// Anchor: Target Sell / Ready Date (user input).
//
// Semantics for each event:
//   startDate   = when the team must BEGIN that process
//   plannedDate = when that process is expected to COMPLETE (= startDate + duration)
//
// Full backward chain:
//   targetSellDate
//     → firstHarvestDate       (= targetSell − PACKING_DAYS)
//     → dfDay0                 (= firstHarvest − DF_FIRST_HARVEST_DAY)  [DF Day 0 = Casing Run end]
//     → secondHarvestFrom/To   (= dfDay0 + 15 / dfDay0 + 17)
//     → cookoutDate            (= dfDay0 + DF_TOTAL_DAYS)               [downstream, shown for next-cycle planning]
//     → casingRunStart         (= dfDay0 − OOTY_CASING_RUN_DAYS)
//     → spawnRunStart          (= casingRunStart − OOTY_SPAWN_RUN_DAYS) = Annur dispatch date
//     → annurBatchStart        (= spawnRunStart − ANNUR_TOTAL_DAYS)
//     → labBatchStart          (= spawnRunStart − LAB_TOTAL_DAYS)       [lab ready = annur dispatch]
//     → coimBatchStart         (= casingRunStart − COIM_TOTAL_DAYS)     [coim QC = Ooty Casing Run start]
//
router.post("/suggest", requireAuth, async (req, res) => {
  const { targetSellDate, ootyRoomId } = req.body as any;
  if (!targetSellDate) return res.status(400).json({ error: "targetSellDate is required" });

  // ── Step 1: Harvest dates ─────────────────────────────────────────────────
  const firstHarvestDate     = subDays(targetSellDate, DURATIONS.PACKING_DAYS);        // e.g. Nov 9
  const dfDay0               = subDays(firstHarvestDate, DURATIONS.DF_FIRST_HARVEST_DAY); // e.g. Oct 31
  const firstHarvestDateTo   = addDays(dfDay0, DURATIONS.DF_FIRST_HARVEST_DAY + 2);   // DF Day 11
  const secondHarvestDateFrom = addDays(dfDay0, DURATIONS.DF_SECOND_HARVEST_DAY);     // DF Day 15
  const secondHarvestDateTo  = addDays(dfDay0, DURATIONS.DF_SECOND_HARVEST_DAY + 2);  // DF Day 17
  const cookoutDate          = addDays(dfDay0, DURATIONS.DF_TOTAL_DAYS);              // DF Day 20

  // ── Step 2: Ooty Casing Run ───────────────────────────────────────────────
  // Casing Run ends = DF Day 0; Casing Run starts = that minus duration
  const casingRunEnd   = dfDay0;
  const casingRunStart = subDays(dfDay0, DURATIONS.OOTY_CASING_RUN_DAYS);

  // ── Step 3: Ooty Spawn Run ────────────────────────────────────────────────
  // Spawn Run ends when Casing Run starts; bags dispatched from Annur = Spawn Run Day 0
  const spawnRunEnd   = casingRunStart;
  const spawnRunStart = subDays(casingRunStart, DURATIONS.OOTY_SPAWN_RUN_DAYS);
  const annurDispatchDate = spawnRunStart; // bags arrive at Ooty = same day dispatch

  // ── Step 4: Annur ─────────────────────────────────────────────────────────
  const annurBatchStart = subDays(annurDispatchDate, DURATIONS.ANNUR_TOTAL_DAYS);

  // ── Step 5: Lab (ready by Annur dispatch) ────────────────────────────────
  const labSpawnReadyDate = annurDispatchDate;
  const labBatchStart     = subDays(labSpawnReadyDate, DURATIONS.LAB_TOTAL_DAYS);

  // ── Step 6: Coimbatore (QC-approved by Ooty Casing Run start) ────────────
  const coimQCApproveDate = casingRunStart;
  const coimBatchStart    = subDays(coimQCApproveDate, DURATIONS.COIM_TOTAL_DAYS);

  // ── Plan code ─────────────────────────────────────────────────────────────
  const existing = await db.select({ planCode: scheduleEventsTable.planCode }).from(scheduleEventsTable);
  let maxNum = 0;
  for (const r of existing) {
    const m = r.planCode?.match(/^PLAN-(\d+)$/);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  }
  const planCode = `PLAN-${String(maxNum + 1).padStart(3, "0")}`;

  // ── Summary (display-only, not saved) ────────────────────────────────────
  const summary = {
    targetSellDate,
    packingDays: DURATIONS.PACKING_DAYS,
    firstHarvestDate,
    firstHarvestDateTo,
    secondHarvestDateFrom,
    secondHarvestDateTo,
    dfDay0,
    cookoutDate,
    casingRunStart,
    casingRunEnd,
    spawnRunStart,
    spawnRunEnd,
    annurDispatchDate,
    annurBatchStart,
    labBatchStart,
    labSpawnReadyDate,
    coimBatchStart,
    coimQCApproveDate,
  };

  // ── Saveable schedule events ──────────────────────────────────────────────
  const events = [
    // ── Coimbatore ──────────────────────────────────────────────────────────
    {
      locationCode: "COIMBATORE",
      entityType: "coim_batch", entityId: null,
      eventType: "qc_approve_target",
      startDate:   coimBatchStart,   // BEGIN casing soil preparation
      plannedDate: coimQCApproveDate, // COMPLETE — QC-approved, soil ready for Ooty
      isSuggestion: true, planCode,
      notes: `Start casing batch ${coimBatchStart} → QC-approved by ${coimQCApproveDate} (${DURATIONS.COIM_TOTAL_DAYS}d process). Soil must arrive at Ooty before Casing Run on ${casingRunStart}.`,
    },
    // ── Lab ─────────────────────────────────────────────────────────────────
    {
      locationCode: "LAB",
      entityType: "lab_batch", entityId: null,
      eventType: "spawn_ready_target",
      startDate:   labBatchStart,       // BEGIN lab — media prep (Stage 1)
      plannedDate: labSpawnReadyDate,   // COMPLETE — spawn ready for Annur dispatch
      isSuggestion: true, planCode,
      notes: `Begin lab spawn prep ${labBatchStart} → spawn ready by ${labSpawnReadyDate} (${DURATIONS.LAB_TOTAL_DAYS}d across all 9 stages). Must coincide with Annur dispatch on ${annurDispatchDate}.`,
    },
    // ── Annur ───────────────────────────────────────────────────────────────
    {
      locationCode: "ANNUR",
      entityType: "annur_batch", entityId: null,
      eventType: "dispatch_target",
      startDate:   annurBatchStart,    // BEGIN bag filling + spawn mixing
      plannedDate: annurDispatchDate,  // COMPLETE — bags dispatched to Ooty
      isSuggestion: true, planCode,
      notes: `Start grow-bag batch ${annurBatchStart} → dispatch to Ooty by ${annurDispatchDate} (${DURATIONS.ANNUR_TOTAL_DAYS}d). Bags arrive at Ooty = Spawn Run Day 0.`,
    },
    // ── Ooty: Spawn Run ─────────────────────────────────────────────────────
    {
      locationCode: "OOTY",
      entityType: "ooty_room", entityId: ootyRoomId ?? null,
      eventType: "spawn_run_start",
      startDate:   spawnRunStart,  // = Annur dispatch / bags arrive at room
      plannedDate: spawnRunEnd,    // Spawn Run completes → Casing Run begins
      isSuggestion: true, planCode,
      notes: `Spawn Run ${spawnRunStart} → ${spawnRunEnd} (~${DURATIONS.OOTY_SPAWN_RUN_DAYS}d). Bags placed in room on Day 0; mycelium colonises substrate.`,
    },
    // ── Ooty: Casing Run ────────────────────────────────────────────────────
    {
      locationCode: "OOTY",
      entityType: "ooty_room", entityId: ootyRoomId ?? null,
      eventType: "casing_run_start",
      startDate:   casingRunStart,  // Casing soil applied
      plannedDate: casingRunEnd,    // = dfDay0 — Casing Run completes, DF phase starts
      isSuggestion: true, planCode,
      notes: `Casing Run ${casingRunStart} → ${casingRunEnd} (~${DURATIONS.OOTY_CASING_RUN_DAYS}d). Casing Run end = DF Day 0 (${dfDay0}). Casing soil from Coimbatore applied.`,
    },
    // ── Ooty: First Harvest ─────────────────────────────────────────────────
    {
      locationCode: "OOTY",
      entityType: "ooty_room", entityId: ootyRoomId ?? null,
      eventType: "first_harvest",
      startDate:   firstHarvestDate,  // DF Day 9 — harvest window opens
      plannedDate: firstHarvestDateTo, // DF Day 11 — harvest window closes
      isSuggestion: true, planCode,
      notes: `First Harvest window DF Day 9–11: ${firstHarvestDate} to ${firstHarvestDateTo}. Must harvest by ${firstHarvestDate} to allow ${DURATIONS.PACKING_DAYS} packing days before target sell date ${targetSellDate}.`,
    },
    // ── Ooty: Second Harvest ────────────────────────────────────────────────
    {
      locationCode: "OOTY",
      entityType: "ooty_room", entityId: ootyRoomId ?? null,
      eventType: "second_harvest",
      startDate:   secondHarvestDateFrom, // DF Day 15
      plannedDate: secondHarvestDateTo,   // DF Day 17
      isSuggestion: true, planCode,
      notes: `Second Harvest (assumed) — DF Day 15–17: ${secondHarvestDateFrom} to ${secondHarvestDateTo}. Secondary flush after first harvest; exact timing may vary ±1–2 days.`,
    },
    // ── Ooty: Cookout ────────────────────────────────────────────────────────
    {
      locationCode: "OOTY",
      entityType: "ooty_room", entityId: ootyRoomId ?? null,
      eventType: "cookout_target",
      startDate:   cookoutDate,  // DF Day 20 — cookout begins
      plannedDate: addDays(cookoutDate, 2), // cookout takes ~2–3 days
      isSuggestion: true, planCode,
      notes: `Cookout from ${cookoutDate} — heat-treat substrate to terminate batch. Room will be free for next cycle after ~${addDays(cookoutDate, 2)}.`,
    },
  ];

  return res.json({ summary, planCode, events });
});

export default router;
