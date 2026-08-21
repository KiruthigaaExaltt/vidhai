import {
  mongoTable,
  serial,
  integer,
  numeric,
  text,
  timestamp,
  createInsertSchema,
} from "./dsl";
import { z } from "zod/v4";
import { materialsTable } from "./materials";
import { locationsTable } from "./locations";
import { inventoryLocationsTable } from "./inventoryLocations";
import { usersTable } from "./users";
import { batchesTable } from "./batches";

export const inventoryTable = mongoTable("inventory", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id),
  // Product stock belongs to a warehouse/store from the Inventory module,
  // not to an operational growing/location record.
  locationId: integer("location_id").references(
    () => inventoryLocationsTable.id,
  ),
  quantityOnHand: numeric("quantity_on_hand", { precision: 12, scale: 4 })
    .notNull()
    .default("0"),
  costBasis: numeric("cost_basis", { precision: 12, scale: 4 }),
  lastUpdated: timestamp("last_updated", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const inventoryAdjustmentsTable = mongoTable("inventory_adjustments", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id),
  locationId: integer("location_id").references(() => locationsTable.id),
  quantityDelta: numeric("quantity_delta", {
    precision: 12,
    scale: 4,
  }).notNull(),
  reason: text("reason").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  adjustedByUserId: integer("adjusted_by_user_id").references(
    () => usersTable.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const inventoryMovementsTable = mongoTable("inventory_movements", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id")
    .notNull()
    .references(() => materialsTable.id),
  fromLocationId: integer("from_location_id").references(
    () => inventoryLocationsTable.id,
  ),
  toLocationId: integer("to_location_id").references(
    () => inventoryLocationsTable.id,
  ),
  quantityKg: numeric("quantity_kg", { precision: 12, scale: 4 }).notNull(),
  reason: text("reason"),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id").references(
    () => usersTable.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Authoritative batch/lot balances for produced and purchased casing soil.
export const casingSoilInventorySourcesTable = mongoTable(
  "casing_soil_inventory_sources",
  {
    id: serial("id").primaryKey(),
    sourceKey: text("source_key").notNull().unique(),
    sourceType: text("source_type").notNull(),
    origin: text("origin").notNull().default("internal"),
    productionBatchId: integer("production_batch_id").references(
      () => batchesTable.id,
    ),
    reference: text("reference").notNull(),
    materialId: integer("material_id")
      .notNull()
      .references(() => materialsTable.id),
    warehouseId: integer("warehouse_id").references(
      () => inventoryLocationsTable.id,
    ),
    inventoryId: integer("inventory_id").references(() => inventoryTable.id),
    inventoryAdjustmentId: integer("inventory_adjustment_id").references(
      () => inventoryAdjustmentsTable.id,
    ),
    originalQuantityKg: numeric("original_quantity_kg", {
      precision: 12,
      scale: 4,
    }).notNull(),
    consumedQuantityKg: numeric("consumed_quantity_kg", {
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default("0"),
    availableQuantityKg: numeric("available_quantity_kg", {
      precision: 12,
      scale: 4,
    }).notNull(),
    reservedQuantityKg: numeric("reserved_quantity_kg", {
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default("0"),
    salesDispatchedQuantityKg: numeric("sales_dispatched_quantity_kg", {
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default("0"),
    stockDate: text("stock_date").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("available"),
    createdByUserId: integer("created_by_user_id").references(
      () => usersTable.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
export const vaultSalesReservationsTable = mongoTable(
  "vault_sales_reservations",
  {
    id: serial("id").primaryKey(),
    reservationKey: text("reservation_key").notNull().unique(),
    workOrderId: integer("work_order_id").notNull(),
    sourceDocumentType: text("source_document_type").notNull(),
    sourceDocumentId: integer("source_document_id").notNull(),
    sourceLineId: integer("source_line_id").notNull(),
    materialId: integer("material_id").notNull(),
    vaultType: text("vault_type").notNull(),
    vaultSourceType: text("vault_source_type").notNull(),
    vaultStockId: integer("vault_stock_id").notNull(),
    vaultReference: text("vault_reference").notNull(),
    orderedQuantity: numeric("ordered_quantity", {
      precision: 12,
      scale: 4,
    }).notNull(),
    dispatchedQuantity: numeric("dispatched_quantity", {
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default("0"),
    unit: text("unit").notNull(),
    status: text("status").notNull().default("active"),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
export const insertInventoryAdjustmentSchema = createInsertSchema(
  inventoryAdjustmentsTable,
).omit({ id: true, createdAt: true });
export type InsertInventoryAdjustment = z.infer<
  typeof insertInventoryAdjustmentSchema
>;
export type InventoryAdjustment = typeof inventoryAdjustmentsTable.$inferSelect;

export const insertInventoryMovementSchema = createInsertSchema(
  inventoryMovementsTable,
).omit({ id: true, createdAt: true });
export type InsertInventoryMovement = z.infer<
  typeof insertInventoryMovementSchema
>;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;

export const servicesTable = mongoTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  hsnSac: text("hsn_sac"),
  unit: text("unit").notNull().default("Nos"),
  sellingPrice: numeric("selling_price", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  gstPercent: numeric("gst_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertServiceSchema = createInsertSchema(servicesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof servicesTable.$inferSelect;
