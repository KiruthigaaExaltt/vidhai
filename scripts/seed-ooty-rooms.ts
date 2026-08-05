/**
 * Seed 42 Ooty growing rooms with actual capacities.
 * Room 41 is marked as "maintenance".
 * Run: npx tsx scripts/seed-ooty-rooms.ts
 */

import { db, ootyRoomsTable, locationsTable } from "@workspace/db";
import { eq } from "@workspace/db";

const ROOMS: Array<{ num: number; capacity: number }> = [
  { num:  1, capacity: 1300 }, { num:  2, capacity: 1200 }, { num:  3, capacity:  830 },
  { num:  4, capacity: 1200 }, { num:  5, capacity: 1200 }, { num:  6, capacity: 1200 },
  { num:  7, capacity:  990 }, { num:  8, capacity: 1200 }, { num:  9, capacity: 1200 },
  { num: 10, capacity: 2080 }, { num: 12, capacity:  630 }, { num: 13, capacity: 1250 },
  { num: 14, capacity: 1460 }, { num: 15, capacity: 1400 }, { num: 16, capacity: 2790 },
  { num: 18, capacity: 1800 }, { num: 19, capacity:  700 }, { num: 20, capacity:  700 },
  { num: 21, capacity:  700 }, { num: 22, capacity:  700 }, { num: 23, capacity:  700 },
  { num: 24, capacity:  690 }, { num: 25, capacity:  640 }, { num: 26, capacity:  700 },
  { num: 27, capacity:  650 }, { num: 28, capacity:  660 }, { num: 29, capacity:  690 },
  { num: 30, capacity:  691 }, { num: 31, capacity:  690 }, { num: 32, capacity:  690 },
  { num: 33, capacity:  690 }, { num: 34, capacity: 1300 }, { num: 35, capacity: 1300 },
  { num: 36, capacity:  620 }, { num: 37, capacity: 1650 }, { num: 38, capacity: 2016 },
  { num: 39, capacity: 2016 }, { num: 40, capacity: 1650 }, { num: 41, capacity: 1450 },
  { num: 42, capacity: 1200 },
];

async function main() {
  // Get Ooty location (code "B")
  const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.code, "B")).limit(1);
  if (!loc) throw new Error("Location B (Ooty) not found. Ensure locations are seeded.");

  // Fetch existing rooms
  const existing = await db.select({ name: ootyRoomsTable.name }).from(ootyRoomsTable)
    .where(eq(ootyRoomsTable.locationId, loc.id));
  const existingNames = new Set(existing.map((r) => r.name));

  let created = 0;
  for (const room of ROOMS) {
    const name = `Room ${room.num}`;
    if (existingNames.has(name)) {
      console.log(`  skip  ${name} (already exists)`);
      continue;
    }
    const status = room.num === 41 ? "maintenance" : "idle";
    await db.insert(ootyRoomsTable).values({
      name,
      locationId: loc.id,
      capacity: room.capacity,
      status,
      notes: room.num === 41 ? "Under maintenance — not available for batch assignment" : null,
    });
    console.log(`  +${name} (${room.capacity} bags)${room.num === 41 ? " [MAINTENANCE]" : ""}`);
    created++;
  }
  console.log(`\nDone. ${created} rooms created.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
