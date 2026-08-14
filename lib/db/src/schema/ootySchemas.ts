import { mongoTable, serial, integer, numeric, text, timestamp, date, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { locationsTable } from "./locations";
import { batchesTable } from "./batches";
import { usersTable } from "./users";

export const ootyRoomsTable = mongoTable("ooty_rooms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  locationId: integer("location_id").notNull().references(() => locationsTable.id),
  status: text("status").notNull().default("idle"),
  capacity: integer("capacity"),
  currentGrowingBatchId: integer("current_growing_batch_id"),
  notes: text("notes"),
});

export const insertOotyRoomSchema = createInsertSchema(ootyRoomsTable).omit({ id: true });
export type InsertOotyRoom = z.infer<typeof insertOotyRoomSchema>;
export type OotyRoom = typeof ootyRoomsTable.$inferSelect;

export const ootyGrowingBatchesTable = mongoTable("ooty_growing_batches", {
  id: serial("id").primaryKey(),
  batchCode: text("batch_code").notNull().unique(),
  roomId: integer("room_id").notNull().references(() => ootyRoomsTable.id),
  annurBatchId: integer("annur_batch_id").references(() => batchesTable.id),
  coimBatchId: integer("coim_batch_id").references(() => batchesTable.id),
  currentPhase: text("current_phase").notNull().default("SPAWN_RUN"),
  currentStage: text("current_stage").notNull().default("SPAWN_RUN"),
  phaseEnteredAt: timestamp("phase_entered_at", { withTimezone: true }).defaultNow(),
  status: text("status").notNull().default("active"),
  spawnRunStartDate: date("spawn_run_start_date", { mode: "string" }),
  casingAppliedDate: date("casing_applied_date", { mode: "string" }),
  cookoutDate: date("cookout_date", { mode: "string" }),
  substrateWeightKg: numeric("substrate_weight_kg", { precision: 10, scale: 4 }),
  manureProducedKg: numeric("manure_produced_kg", { precision: 10, scale: 4 }),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOotyGrowingBatchSchema = createInsertSchema(ootyGrowingBatchesTable).omit({ id: true, createdAt: true });
export type InsertOotyGrowingBatch = z.infer<typeof insertOotyGrowingBatchSchema>;
export type OotyGrowingBatch = typeof ootyGrowingBatchesTable.$inferSelect;

// Stage logs — one row per stage entry, closed when stage exits (verification images stored as JSON)
export const ootyStageLogsTable = mongoTable("ooty_stage_logs", {
  id: serial("id").primaryKey(),
  growingBatchId: integer("growing_batch_id").notNull().references(() => ootyGrowingBatchesTable.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  exitedAt: timestamp("exited_at", { withTimezone: true }),
  verificationImages: text("verification_images"), // JSON array of base64 strings
  notes: text("notes"),
  casingBatchRef: text("casing_batch_ref"), // for CASING_RUN stage — casing soil batch ID/code
  recordedByUserId: integer("recorded_by_user_id").references(() => usersTable.id),
});

export const insertOotyStageLogSchema = createInsertSchema(ootyStageLogsTable).omit({ id: true });
export type InsertOotyStageLog = z.infer<typeof insertOotyStageLogSchema>;
export type OotyStageLog = typeof ootyStageLogsTable.$inferSelect;

// Batch sources — many-to-many: one Annur batch can supply multiple Ooty rooms
export const ootyBatchSourcesTable = mongoTable("ooty_batch_sources", {
  id: serial("id").primaryKey(),
  growingBatchId: integer("growing_batch_id").notNull().references(() => ootyGrowingBatchesTable.id, { onDelete: "cascade" }),
  annurBatchId: integer("annur_batch_id").notNull().references(() => batchesTable.id),
  bagCount: integer("bag_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOotyBatchSourceSchema = createInsertSchema(ootyBatchSourcesTable).omit({ id: true, createdAt: true });
export type InsertOotyBatchSource = z.infer<typeof insertOotyBatchSourceSchema>;
export type OotyBatchSource = typeof ootyBatchSourcesTable.$inferSelect;

// One row per Growing Room assignment. The unique key prevents a retry from
// consuming the same Annur grow bags from Vault inventory twice.
export const ootyGrowBagInventoryPostingsTable = mongoTable("ooty_grow_bag_inventory_postings", {
  id: serial("id").primaryKey(),
  postingKey: text("posting_key").notNull().unique(),
  growingBatchId: integer("growing_batch_id").notNull().references(() => ootyGrowingBatchesTable.id, { onDelete: "cascade" }),
  inventoryId: integer("inventory_id").notNull(),
  inventoryAdjustmentId: integer("inventory_adjustment_id").notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  allocatedBags: integer("allocated_bags").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOotyGrowBagInventoryPostingSchema = createInsertSchema(ootyGrowBagInventoryPostingsTable).omit({ id: true, createdAt: true });
export type OotyGrowBagInventoryPosting = typeof ootyGrowBagInventoryPostingsTable.$inferSelect;

export const ootyObservationsTable = mongoTable("ooty_observations", {
  id: serial("id").primaryKey(),
  growingBatchId: integer("growing_batch_id").notNull().references(() => ootyGrowingBatchesTable.id, { onDelete: "cascade" }),
  observationDate: date("observation_date", { mode: "string" }).notNull(),
  temperatureCelsius: numeric("temperature_celsius", { precision: 6, scale: 2 }),
  observationNote: text("observation_note"),
  observationType: text("observation_type").notNull().default("daily"),
  recordedByUserId: integer("recorded_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOotyObservationSchema = createInsertSchema(ootyObservationsTable).omit({ id: true, createdAt: true });
export type InsertOotyObservation = z.infer<typeof insertOotyObservationSchema>;
export type OotyObservation = typeof ootyObservationsTable.$inferSelect;

export const ootyHarvestsTable = mongoTable("ooty_harvests", {
  id: serial("id").primaryKey(),
  growingBatchId: integer("growing_batch_id").notNull().references(() => ootyGrowingBatchesTable.id, { onDelete: "cascade" }),
  harvestDate: date("harvest_date", { mode: "string" }).notNull(),
  weightKg: numeric("weight_kg", { precision: 10, scale: 4 }).notNull(),
  mushroomCount: integer("mushroom_count"),
  avgWeightG: numeric("avg_weight_g", { precision: 8, scale: 2 }),
  qualityNote: text("quality_note"),
  flushNumber: integer("flush_number").notNull().default(1),
  recordedByUserId: integer("recorded_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOotyHarvestSchema = createInsertSchema(ootyHarvestsTable).omit({ id: true, createdAt: true });
export type InsertOotyHarvest = z.infer<typeof insertOotyHarvestSchema>;
export type OotyHarvest = typeof ootyHarvestsTable.$inferSelect;
// One row per stock-posted flush. The unique key prevents retries from increasing Mushroom twice.
export const ootyHarvestInventoryPostingsTable = mongoTable("ooty_harvest_inventory_postings", {
  id: serial("id").primaryKey(),
  postingKey: text("posting_key").notNull().unique(),
  growingBatchId: integer("growing_batch_id").notNull().references(() => ootyGrowingBatchesTable.id, { onDelete: "cascade" }),
  harvestId: integer("harvest_id").notNull().references(() => ootyHarvestsTable.id, { onDelete: "cascade" }),
  flushNumber: integer("flush_number").notNull(),
  inventoryId: integer("inventory_id").notNull(),
  inventoryAdjustmentId: integer("inventory_adjustment_id").notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  mushroomCount: integer("mushroom_count").notNull(),
  harvestWeightKg: numeric("harvest_weight_kg", { precision: 10, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOotyHarvestInventoryPostingSchema = createInsertSchema(ootyHarvestInventoryPostingsTable).omit({ id: true, createdAt: true });
export type OotyHarvestInventoryPosting = typeof ootyHarvestInventoryPostingsTable.$inferSelect;

// One row per Cookout Manure stock posting. The unique key prevents retry/double-click duplication.
export const ootyCookoutInventoryPostingsTable = mongoTable("ooty_cookout_inventory_postings", {
  id: serial("id").primaryKey(),
  postingKey: text("posting_key").notNull().unique(),
  growingBatchId: integer("growing_batch_id").notNull().references(() => ootyGrowingBatchesTable.id, { onDelete: "cascade" }),
  inventoryId: integer("inventory_id").notNull(),
  inventoryAdjustmentId: integer("inventory_adjustment_id").notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  manureKg: numeric("manure_kg", { precision: 10, scale: 4 }).notNull(),
  cookoutDate: date("cookout_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOotyCookoutInventoryPostingSchema = createInsertSchema(ootyCookoutInventoryPostingsTable).omit({ id: true, createdAt: true });
export type OotyCookoutInventoryPosting = typeof ootyCookoutInventoryPostingsTable.$inferSelect;

export const phaseApprovalsTable = mongoTable("phase_approvals", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  fromPhase: text("from_phase").notNull(),
  toPhase: text("to_phase").notNull(),
  decision: text("decision"),
  approvedByUserId: integer("approved_by_user_id").references(() => usersTable.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPhaseApprovalSchema = createInsertSchema(phaseApprovalsTable).omit({ id: true, createdAt: true });
export type InsertPhaseApproval = z.infer<typeof insertPhaseApprovalSchema>;
export type PhaseApproval = typeof phaseApprovalsTable.$inferSelect;
