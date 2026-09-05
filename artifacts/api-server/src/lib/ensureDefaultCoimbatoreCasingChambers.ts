import { chambersTable, db, eq, locationsTable } from "@workspace/db";

export const DEFAULT_COIMBATORE_CASING_CHAMBERS = [
  "A1",
  "A2",
  "A3",
  "A4",
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
  "B6",
  "C1",
  "C2",
  "C3",
  "D1",
  "D2",
  "D3",
  "E1",
  "E2",
  "E3",
  "E4",
  "E5",
  "E6",
  "E7",
] as const;

export async function ensureDefaultCoimbatoreCasingChambers() {
  let [location] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.code, "C"))
    .limit(1);
  if (!location) {
    try {
      [location] = await db
        .insert(locationsTable)
        .values({
          code: "C",
          name: "Coimbatore",
          description: "Casing soil production",
        })
        .returning();
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      [location] = await db
        .select()
        .from(locationsTable)
        .where(eq(locationsTable.code, "C"))
        .limit(1);
    }
  }
  if (!location)
    throw new Error("Unable to create or find Location C / Coimbatore");

  const existing = await db
    .select()
    .from(chambersTable)
    .where(eq(chambersTable.locationId, location.id));
  const byName = new Map(
    existing.map((chamber) => [chamber.name.trim().toUpperCase(), chamber]),
  );
  let created = 0;
  let normalized = 0;

  for (const name of DEFAULT_COIMBATORE_CASING_CHAMBERS) {
    const chamber = byName.get(name);
    if (!chamber) {
      await db.insert(chambersTable).values({
        organizationId: 1,
        name,
        locationId: location.id,
        chamberType: "casing_soil",
        status: "idle",
        notes: "Initial physical chamber from the Coimbatore chamber register",
      });
      created += 1;
      continue;
    }
    // Normalize only safe, unoccupied legacy records. Never reset operational state.
    if (
      chamber.chamberType !== "casing_soil" &&
      chamber.status === "idle" &&
      !chamber.currentBatchId
    ) {
      await db
        .update(chambersTable)
        .set({ chamberType: "casing_soil" })
        .where(eq(chambersTable.id, chamber.id));
      normalized += 1;
    }
  }

  return {
    created,
    normalized,
    totalDefaults: DEFAULT_COIMBATORE_CASING_CHAMBERS.length,
  };
}
