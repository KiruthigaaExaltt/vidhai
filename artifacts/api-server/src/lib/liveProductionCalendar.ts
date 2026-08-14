import {
  db,
  batchesTable,
  locationsTable,
  ootyGrowingBatchesTable,
  ootyRoomsTable,
  coimbatoreTurnsTable,
} from "@workspace/db";
import { eq } from "@workspace/db";

type LiveStage = { key: string; label: string; days: number };

const STAGES: Record<string, LiveStage[]> = {
  ANNUR: [
    { key: "PRE_WETTING", label: "Pre-Wetting", days: 1 },
    { key: "T1", label: "Turn 1", days: 2 },
    { key: "T2", label: "Turn 2", days: 2 },
    { key: "T3", label: "Turn 3", days: 2 },
    { key: "T4", label: "Turn 4", days: 2 },
    { key: "BULK_CHAMBER", label: "Bulk Chamber", days: 7 },
    { key: "QUALITY_CHECK", label: "Quality Check", days: 1 },
    { key: "SPAWN_MIXING", label: "Spawn Mixing", days: 1 },
    { key: "DISPATCH", label: "Dispatch", days: 0 },
  ],
  LAB: [
    { key: "FORMULATION", label: "Formulation", days: 1 },
    { key: "MEDIA_PREP", label: "Media Prep", days: 17 },
    { key: "MOTHER_CULTURE", label: "Mother Culture", days: 17 },
    { key: "MILLET_1", label: "Millet 1", days: 3 },
    { key: "MILLET_2", label: "Millet 2", days: 2 },
    { key: "MOISTURE", label: "Moisture", days: 2 },
    { key: "AUTOCLAVE", label: "Autoclave", days: 2 },
    { key: "INOCULATION", label: "Inoculation", days: 5 },
    { key: "SHAKING_1", label: "First Shaking", days: 6 },
    { key: "SHAKING_2", label: "Second Shaking", days: 11 },
    { key: "QC", label: "Quality Check", days: 1 },
  ],
  COIMBATORE: [
    { key: "FORMULATION", label: "Formulation", days: 1 },
    { key: "QC", label: "Quality Check", days: 1 },
  ],
};

const LOCATION_NAMES: Record<string, string> = {
  A: "ANNUR",
  C: "COIMBATORE",
  D: "LAB",
};

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}

function isoDate(value: Date | string | null | undefined) {
  return new Date(value ?? Date.now()).toISOString().split("T")[0];
}

function maxDate(left: string, right: string) {
  return left > right ? left : right;
}

function liveId(locationIndex: number, entityId: number, stageIndex: number) {
  return -(locationIndex * 10_000_000 + entityId * 100 + stageIndex + 1);
}

function projectBatch(
  batch: any,
  locationCode: string,
  locationIndex: number,
  today: string,
): any[] {
  const stages = STAGES[locationCode] ?? [];
  const currentIndex = stages.findIndex(
    (stage) => stage.key === batch.currentStage,
  );
  if (currentIndex < 0) return [];
  let cursor = maxDate(isoDate(batch.stageEnteredAt ?? batch.createdAt), today);
  return stages.slice(currentIndex).map((stage, offset) => {
    const startDate = cursor;
    cursor = addDays(cursor, stage.days);
    return {
      id: liveId(locationIndex, batch.id, currentIndex + offset),
      locationCode,
      entityType: "production_batch",
      entityId: batch.id,
      eventType: "production_stage",
      startDate,
      plannedDate: cursor,
      actualDate: null,
      isManualOverride: false,
      isSuggestion: false,
      parentEventId: null,
      planCode: null,
      notes: `${batch.batchCode} · ${stage.label}`,
      createdAt: batch.createdAt,
      displayTitle: `${batch.batchCode} · ${stage.label}`,
      isLiveProduction: true,
      sourcePath:
        locationCode === "ANNUR"
          ? `/annur/batches/${batch.id}`
          : locationCode === "COIMBATORE"
            ? `/coimbatore/batches/${batch.id}`
            : `/lab/batches/${batch.id}`,
    };
  });
}

export async function listLiveProductionEvents(
  today = isoDate(new Date()),
): Promise<any[]> {
  const batchRows = await db
    .select({ batch: batchesTable, locationCode: locationsTable.code })
    .from(batchesTable)
    .innerJoin(locationsTable, eq(batchesTable.locationId, locationsTable.id));
  const activeBatches = batchRows.filter(
    ({ batch, locationCode }) =>
      batch.status === "active" && ["A", "C", "D"].includes(locationCode),
  );
  const events: any[] = activeBatches.flatMap(({ batch, locationCode }) => {
    const calendarLocation = LOCATION_NAMES[locationCode];
    if (calendarLocation === "COIMBATORE" && batch.currentStage === "TURNING")
      return [];
    return projectBatch(
      batch,
      calendarLocation,
      calendarLocation === "ANNUR"
        ? 1
        : calendarLocation === "COIMBATORE"
          ? 3
          : 4,
      today,
    );
  });

  const activeCoimbatore = new Map(
    activeBatches
      .filter(({ locationCode }) => locationCode === "C")
      .map(({ batch }) => [batch.id, batch]),
  );
  if (activeCoimbatore.size) {
    for (const turn of await db.select().from(coimbatoreTurnsTable)) {
      const batch = activeCoimbatore.get(turn.batchId);
      if (!batch || turn.actualDate || !turn.plannedDate) continue;
      events.push({
        id: liveId(3, turn.batchId, turn.turnNumber),
        locationCode: "COIMBATORE",
        entityType: "production_batch",
        entityId: turn.batchId,
        eventType: "production_stage",
        startDate: null,
        plannedDate: maxDate(turn.plannedDate, today),
        actualDate: null,
        isManualOverride: false,
        isSuggestion: false,
        parentEventId: null,
        planCode: null,
        notes: `${batch.batchCode} · Turn ${turn.turnNumber}`,
        createdAt: batch.createdAt,
        displayTitle: `${batch.batchCode} · Turn ${turn.turnNumber}`,
        isLiveProduction: true,
        sourcePath: `/coimbatore/batches/${turn.batchId}`,
      });
    }
  }

  const ootyRows = await db
    .select({ batch: ootyGrowingBatchesTable, roomName: ootyRoomsTable.name })
    .from(ootyGrowingBatchesTable)
    .innerJoin(
      ootyRoomsTable,
      eq(ootyGrowingBatchesTable.roomId, ootyRoomsTable.id),
    );
  const ootyStages: LiveStage[] = [
    { key: "SPAWN_RUN", label: "Spawn Run", days: 18 },
    { key: "CASING_RUN", label: "Casing Run", days: 9 },
    { key: "PINNING_FLUSH1", label: "Flush 1", days: 11 },
    { key: "FLUSH2", label: "Flush 2", days: 6 },
    { key: "COOKOUT", label: "Cookout", days: 2 },
  ];
  for (const { batch, roomName } of ootyRows.filter(
    ({ batch }) => batch.status === "active",
  )) {
    const currentStage =
      batch.currentStage === "PRONING" ? "PINNING_FLUSH1" : batch.currentStage;
    const currentIndex = ootyStages.findIndex(
      (stage) => stage.key === currentStage,
    );
    if (currentIndex < 0) continue;
    let cursor = maxDate(
      isoDate(batch.phaseEnteredAt ?? batch.createdAt),
      today,
    );
    ootyStages.slice(currentIndex).forEach((stage, offset) => {
      const startDate = cursor;
      cursor = addDays(cursor, stage.days);
      events.push({
        id: liveId(2, batch.id, currentIndex + offset),
        locationCode: "OOTY",
        entityType: "ooty_growing_batch",
        entityId: batch.id,
        eventType: "production_stage",
        startDate,
        plannedDate: cursor,
        actualDate: null,
        isManualOverride: false,
        isSuggestion: false,
        parentEventId: null,
        planCode: null,
        notes: `${batch.batchCode} · ${roomName} · ${stage.label}`,
        createdAt: batch.createdAt,
        displayTitle: `${batch.batchCode} · ${roomName} · ${stage.label}`,
        isLiveProduction: true,
        sourcePath: `/ooty/rooms/${batch.roomId}`,
      });
    });
  }
  return events;
}
