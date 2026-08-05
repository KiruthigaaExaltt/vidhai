import { mongoTable, serial, integer, numeric, text, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { materialsTable } from "./materials";
import { locationsTable } from "./locations";
import { usersTable } from "./users";

export const inventoryTable = mongoTable("inventory", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  locationId: integer("location_id").references(() => locationsTable.id),
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
  notes: text("notes"),
  adjustedByUserId: integer("adjusted_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryMovementsTable = mongoTable("inventory_movements", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  fromLocationId: integer("from_location_id").references(() => locationsTable.id),
  toLocationId: integer("to_location_id").references(() => locationsTable.id),
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
