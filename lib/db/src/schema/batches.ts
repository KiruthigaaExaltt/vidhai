import {
  mongoTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
  createInsertSchema,
} from "./dsl";
import { z } from "zod/v4";
import { locationsTable } from "./locations";
import { usersTable } from "./users";
import { chambersTable } from "./chambers";

export const batchesTable = mongoTable("batches", {
  id: serial("id").primaryKey(),
  batchCode: text("batch_code").notNull().unique(),
  locationId: integer("location_id")
    .notNull()
    .references(() => locationsTable.id),
  currentStage: text("current_stage").notNull().default("PRE_WETTING"),
  status: text("status").notNull().default("active"),
  nitrogenContent: numeric("nitrogen_content", { precision: 8, scale: 4 }),
  targetBags: integer("target_bags"),
  actualBags: integer("actual_bags"),
  turnChamberId: integer("turn_chamber_id"),
  spawnEntryId: integer("spawn_entry_id"),
  // For spawn mixing stage traceability
  spawnBatchRef: text("spawn_batch_ref"),
  spawnBatchType: text("spawn_batch_type"), // 'internal' | 'external'
  dispatchLocationId: integer("dispatch_location_id").references(
    () => locationsTable.id,
  ),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id").references(
    () => usersTable.id,
  ),
  stageEnteredAt: timestamp("stage_entered_at", {
    withTimezone: true,
  }).defaultNow(),
  alertLevel: text("alert_level"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertBatchSchema = createInsertSchema(batchesTable).omit({
  id: true,
  batchCode: true,
  createdAt: true,
});
export type InsertBatch = z.infer<typeof insertBatchSchema>;
export type Batch = typeof batchesTable.$inferSelect;

export const annurDispatchInventoryPostingsTable = mongoTable(
  "annur_dispatch_inventory_postings",
  {
    id: serial("id").primaryKey(),
    postingKey: text("posting_key").notNull().unique(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batchesTable.id, { onDelete: "cascade" }),
    inventoryId: integer("inventory_id").notNull(),
    inventoryAdjustmentId: integer("inventory_adjustment_id").notNull(),
    warehouseId: integer("warehouse_id").notNull(),
    producedBags: integer("produced_bags").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
export const insertAnnurDispatchInventoryPostingSchema = createInsertSchema(
  annurDispatchInventoryPostingsTable,
).omit({ id: true, createdAt: true });
export type AnnurDispatchInventoryPosting =
  typeof annurDispatchInventoryPostingsTable.$inferSelect;
