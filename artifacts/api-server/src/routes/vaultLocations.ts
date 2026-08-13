import { Router } from "express";
import { db, inventoryLocationsTable } from "@workspace/db";
import { eq, desc } from "@workspace/db";

const router = Router();

function formatWarehouseCode(id: number) {
  return `WH-${String(id).padStart(5, "0")}`;
}

router.get("/", async (req, res) => {
  let query = db
    .select()
    .from(inventoryLocationsTable)
    .where(eq(inventoryLocationsTable.isActive, true));

  if (req.query.locationType) {
    query = query.where(
      eq(
        inventoryLocationsTable.locationType,
        req.query.locationType as string,
      ),
    );
  }

  const locations = await query.orderBy(desc(inventoryLocationsTable.id));

  // Backfill warehouse codes if missing
  for (const loc of locations) {
    if (!loc.warehouseCode) {
      const code = formatWarehouseCode(loc.id);
      await db
        .update(inventoryLocationsTable)
        .set({ warehouseCode: code })
        .where(eq(inventoryLocationsTable.id, loc.id));
      loc.warehouseCode = code;
    }
  }

  res.json(locations);
});

router.post("/", async (req, res) => {
  const {
    locationName,
    locationType,
    capacity,
    capacityUnit,
    manager,
    contactNumber,
    address,
    imageUrl,
    isDefault,
  } = req.body;

  // Create reserved warehouse if doesn't exist
  let reserved = await db
    .select()
    .from(inventoryLocationsTable)
    .where(eq(inventoryLocationsTable.isReservedWarehouse, true))
    .limit(1)
    .then((r) => r[0]);
  if (!reserved) {
    [reserved] = await db
      .insert(inventoryLocationsTable)
      .values({
        warehouseCode: "WH-RSVD",
        locationName: "Reserved Warehouse",
        locationType: "Warehouse",
        systemCode: "RSVD",
        isSystem: true,
        isReservedWarehouse: true,
        isProtected: true,
        isActive: true,
        capacity: 999999,
        capacityUnit: "units",
        manager: "System",
      })
      .returning();
  }

  // Handle default logic
  if (isDefault && locationType === "Warehouse") {
    await db
      .update(inventoryLocationsTable)
      .set({ isDefault: false })
      .where(eq(inventoryLocationsTable.locationType, "Warehouse"));
  }

  const [location] = await db
    .insert(inventoryLocationsTable)
    .values({
      warehouseCode: "TEMP-" + Date.now(), // Will be updated immediately
      locationName,
      locationType: locationType || "Warehouse",
      capacity: Number(capacity),
      capacityUnit: capacityUnit || "square feet",
      manager,
      contactNumber: contactNumber || null,
      address: address || null,
      imageUrl: imageUrl || null,
      isDefault: Boolean(isDefault) && locationType === "Warehouse",
    })
    .returning();

  const code = formatWarehouseCode(location.id);
  const [updated] = await db
    .update(inventoryLocationsTable)
    .set({ warehouseCode: code })
    .where(eq(inventoryLocationsTable.id, location.id))
    .returning();

  res.status(201).json(updated);
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const location = await db
    .select()
    .from(inventoryLocationsTable)
    .where(eq(inventoryLocationsTable.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!location) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (location.isProtected) {
    res.status(403).json({ error: "Cannot edit protected system warehouse" });
    return;
  }

  const {
    locationName,
    locationType,
    capacity,
    capacityUnit,
    manager,
    contactNumber,
    address,
    imageUrl,
    isDefault,
  } = req.body;

  if (isDefault && locationType === "Warehouse") {
    await db
      .update(inventoryLocationsTable)
      .set({ isDefault: false })
      .where(eq(inventoryLocationsTable.locationType, "Warehouse"));
  }

  const [updated] = await db
    .update(inventoryLocationsTable)
    .set({
      locationName,
      locationType,
      capacity: Number(capacity),
      capacityUnit,
      manager,
      contactNumber: contactNumber || null,
      address: address || null,
      imageUrl: imageUrl || null,
      isDefault: Boolean(isDefault) && locationType === "Warehouse",
    })
    .where(eq(inventoryLocationsTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const location = await db
    .select()
    .from(inventoryLocationsTable)
    .where(eq(inventoryLocationsTable.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!location) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (location.isProtected || location.isReservedWarehouse) {
    res
      .status(403)
      .json({
        error: "This system warehouse is protected and cannot be deleted",
      });
    return;
  }

  await db
    .update(inventoryLocationsTable)
    .set({ isActive: false })
    .where(eq(inventoryLocationsTable.id, id));

  res.json({ success: true });
});

export default router;
