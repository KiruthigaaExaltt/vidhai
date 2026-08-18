import { mongoTable, serial, integer, numeric, text, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { materialsTable } from "./materials";
import { locationsTable } from "./locations";
import { inventoryLocationsTable } from "./inventoryLocations";
import { usersTable } from "./users";

export const inventoryTable = mongoTable("inventory", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  // Product stock belongs to a warehouse/store from the Inventory module,
  // not to an operational growing/location record.
  locationId: integer("location_id").references(() => inventoryLocationsTable.id),
  quantityOnHand: numeric("quantity_on_hand", { precision: 12, scale: 4 }).notNull().default("0"),
  costBasis: numeric("cost_basis", { precision: 12, scale: 4 }),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryAdjustmentsTable = mongoTable("inventory_adjustments", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  locationId: integer("location_id").references(() => locationsTable.id),
  quantityDelta: numeric("quantity_delta", { precision: 12, scale: 4 }).notNull(),
  reason: text("reason").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  adjustedByUserId: integer("adjusted_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryMovementsTable = mongoTable("inventory_movements", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  fromLocationId: integer("from_location_id").references(() => inventoryLocationsTable.id),
  toLocationId: integer("to_location_id").references(() => inventoryLocationsTable.id),
  quantityKg: numeric("quantity_kg", { precision: 12, scale: 4 }).notNull(),
  reason: text("reason"),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInventoryAdjustmentSchema = createInsertSchema(inventoryAdjustmentsTable).omit({ id: true, createdAt: true });
export type InsertInventoryAdjustment = z.infer<typeof insertInventoryAdjustmentSchema>;
export type InventoryAdjustment = typeof inventoryAdjustmentsTable.$inferSelect;

export const insertInventoryMovementSchema = createInsertSchema(inventoryMovementsTable).omit({ id: true, createdAt: true });
export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;

export const servicesTable = mongoTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  hsnSac: text("hsn_sac"),
  unit: text("unit").notNull().default("Nos"),
  sellingPrice: numeric("selling_price", { precision: 12, scale: 2 }).notNull().default("0"),
  gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertServiceSchema = createInsertSchema(servicesTable).omit({ id: true, createdAt: true });
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof servicesTable.$inferSelect;
