import { mongoTable, serial, text, integer, numeric, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { locationsTable } from "./locations";
import { usersTable } from "./users";

export const batchesTable = mongoTable("batches", {
  id: serial("id").primaryKey(),
  batchCode: text("batch_code").notNull().unique(),
  locationId: integer("location_id").notNull().references(() => locationsTable.id),
  currentStage: text("current_stage").notNull().default("PRE_WETTING"),
  status: text("status").notNull().default("active"),
  nitrogenContent: numeric("nitrogen_content", { precision: 8, scale: 4 }),
  targetBags: integer("target_bags"),
  actualBags: integer("actual_bags"),
  spawnEntryId: integer("spawn_entry_id"),
  // For spawn mixing stage traceability
  spawnBatchRef: text("spawn_batch_ref"),
  spawnBatchType: text("spawn_batch_type"), // 'internal' | 'external'
  dispatchLocationId: integer("dispatch_location_id").references(() => locationsTable.id),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }).defaultNow(),
  alertLevel: text("alert_level"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBatchSchema = createInsertSchema(batchesTable).omit({ id: true, batchCode: true, createdAt: true });
export type InsertBatch = z.infer<typeof insertBatchSchema>;
export type Batch = typeof batchesTable.$inferSelect;
