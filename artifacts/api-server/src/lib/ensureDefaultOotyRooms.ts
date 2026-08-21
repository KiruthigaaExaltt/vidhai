import { db, eq, locationsTable, ootyRoomsTable } from "@workspace/db";
import { growingRoomNumber, OOTY_HARDCODED_ROOMS } from "./ootyHardcodedRooms";

export async function ensureDefaultOotyRooms() {
  const [location] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.code, "B"))
    .limit(1);
  if (!location)
    return { created: 0, updated: 0, total: 0, locationMissing: true };

  const existing = await db
    .select()
    .from(ootyRoomsTable)
    .where(eq(ootyRoomsTable.locationId, location.id));
  const byNumber = new Map(
    existing
      .map((room) => [growingRoomNumber(room.name), room] as const)
      .filter(([number]) => number !== null),
  );
  let created = 0;
  let updated = 0;

  for (const definition of OOTY_HARDCODED_ROOMS) {
    const room = byNumber.get(definition.number);
    const name = `Room ${definition.number}`;
    if (room) {
      if (room.name !== name || room.capacity !== definition.capacity) {
        await db
          .update(ootyRoomsTable)
          .set({ name, capacity: definition.capacity })
          .where(eq(ootyRoomsTable.id, room.id));
        updated++;
      }
      continue;
    }
    await db.insert(ootyRoomsTable).values({
      name,
      locationId: location.id,
      capacity: definition.capacity,
      status: "idle",
      notes: "Default Ooty growing room",
    });
    created++;
  }

  return {
    created,
    updated,
    total: OOTY_HARDCODED_ROOMS.length,
    locationMissing: false,
  };
}
