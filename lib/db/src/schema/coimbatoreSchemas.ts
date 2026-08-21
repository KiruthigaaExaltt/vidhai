import {
  mongoTable,
  serial,
  integer,
  numeric,
  text,
  date,
  timestamp,
  createInsertSchema,
} from "./dsl";
import { z } from "zod/v4";
import { batchesTable } from "./batches";
import { materialsTable } from "./materials";
import { usersTable } from "./users";

// Coimbatore batch material usage
export const coimbatoreBatchMaterialsTable = mongoTable(
  "coimbatore_batch_materials",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batchesTable.id, { onDelete: "cascade" }),
    materialId: integer("material_id")
      .notNull()
      .references(() => materialsTable.id),
    weightKg: numeric("weight_kg", { precision: 10, scale: 4 }),
    notes: text("notes"),
  },
);

// Coimbatore turning config
export const coimbatoreConfigTable = mongoTable("coimbatore_config", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => batchesTable.id, { onDelete: "cascade" })
    .unique(),
  totalTurns: integer("total_turns").notNull().default(4),
  turnScheduleJson: text("turn_schedule_json"),
  initialTemperatureCelsius: numeric("initial_temperature_celsius", {
    precision: 6,
    scale: 2,
  }),
  initialMoisturePercent: numeric("initial_moisture_percent", {
    precision: 6,
    scale: 2,
  }),
});

export const coimbatorePreparationStagesTable = mongoTable(
  "coimbatore_preparation_stages",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batchesTable.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    notes: text("notes"),
    chamberId: integer("chamber_id"),
    chamberNameSnapshot: text("chamber_name_snapshot"),
    enteredAt: timestamp("entered_at", { withTimezone: true }),
    readingId: integer("reading_id"),
    verificationImages: text("verification_images"),
    recordedByUserId: integer("recorded_by_user_id").references(
      () => usersTable.id,
    ),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
// Coimbatore turn records
export const coimbatoreTurnsTable = mongoTable("coimbatore_turns", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => batchesTable.id, { onDelete: "cascade" }),
  turnNumber: integer("turn_number").notNull(),
  plannedDate: date("planned_date", { mode: "string" }),
  actualDate: date("actual_date", { mode: "string" }),
  durationDays: integer("duration_days"),
  chamberId: integer("chamber_id"),
  chamberNameSnapshot: text("chamber_name_snapshot"),
  enteredAt: timestamp("entered_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  readingId: integer("reading_id"),
  temperatureCelsius: numeric("temperature_celsius", {
    precision: 6,
    scale: 2,
  }),
  nh3Ppm: numeric("nh3_ppm", { precision: 8, scale: 4 }),
  co2Percent: numeric("co2_percent", { precision: 6, scale: 3 }),
  moisturePercent: numeric("moisture_percent", { precision: 6, scale: 2 }),
  notes: text("notes"),
  verificationImages: text("verification_images"), // JSON array of base64 strings
  recordedByUserId: integer("recorded_by_user_id").references(
    () => usersTable.id,
  ),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow(),
});

export const coimbatoreTurnAssignmentsTable = mongoTable(
  "coimbatore_turn_assignments",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batchesTable.id, { onDelete: "cascade" }),
    turnNumber: integer("turn_number").notNull(),
    chamberId: integer("chamber_id").notNull(),
    chamberNameSnapshot: text("chamber_name_snapshot").notNull(),
    enteredAt: timestamp("entered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
);

export const casingSoilInventoryPostingsTable = mongoTable(
  "casing_soil_inventory_postings",
  {
    id: serial("id").primaryKey(),
    postingKey: text("posting_key").notNull().unique(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batchesTable.id, { onDelete: "cascade" }),
    inventoryId: integer("inventory_id"),
    inventoryAdjustmentId: integer("inventory_adjustment_id"),
    quantityKg: numeric("quantity_kg", { precision: 12, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
// QC decisions (shared across modules)
export const qcDecisionsTable = mongoTable("qc_decisions", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => batchesTable.id, { onDelete: "cascade" }),
  moduleType: text("module_type").notNull(),
  decision: text("decision").notNull(),
  notes: text("notes"),
  decidedByUserId: integer("decided_by_user_id").references(
    () => usersTable.id,
  ),
  decidedAt: timestamp("decided_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Casing soil buy/sell transactions (mirrors spawn pattern)
export const casingSoilTransactionsTable = mongoTable(
  "casing_soil_transactions",
  {
    id: serial("id").primaryKey(),
    transactionType: text("transaction_type").notNull(), // 'buy' | 'sell' | 'produce'
    quantityKg: numeric("quantity_kg", { precision: 10, scale: 4 }).notNull(),
    counterparty: text("counterparty"),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }),
    totalCost: numeric("total_cost", { precision: 12, scale: 2 }),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    coimbatoreBatchId: integer("coimbatore_batch_id").references(
      () => batchesTable.id,
    ),
    notes: text("notes"),
    recordedByUserId: integer("recorded_by_user_id").references(
      () => usersTable.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const insertCoimbatoreBatchMaterialSchema = createInsertSchema(
  coimbatoreBatchMaterialsTable,
).omit({ id: true });
export type InsertCoimbatoreBatchMaterial = z.infer<
  typeof insertCoimbatoreBatchMaterialSchema
>;
export type CoimbatoreBatchMaterial =
  typeof coimbatoreBatchMaterialsTable.$inferSelect;

export const insertCoimbatoreConfigSchema = createInsertSchema(
  coimbatoreConfigTable,
).omit({ id: true });
export type InsertCoimbatoreConfig = z.infer<
  typeof insertCoimbatoreConfigSchema
>;
export type CoimbatoreConfig = typeof coimbatoreConfigTable.$inferSelect;

export const insertCoimbatoreTurnSchema = createInsertSchema(
  coimbatoreTurnsTable,
).omit({ id: true, recordedAt: true });
export type InsertCoimbatoreTurn = z.infer<typeof insertCoimbatoreTurnSchema>;
export type CoimbatoreTurn = typeof coimbatoreTurnsTable.$inferSelect;

export const insertQcDecisionSchema = createInsertSchema(qcDecisionsTable).omit(
  { id: true, decidedAt: true },
);
export type InsertQcDecision = z.infer<typeof insertQcDecisionSchema>;
export type QcDecision = typeof qcDecisionsTable.$inferSelect;

export const insertCasingSoilTransactionSchema = createInsertSchema(
  casingSoilTransactionsTable,
).omit({ id: true, createdAt: true });
export type InsertCasingSoilTransaction = z.infer<
  typeof insertCasingSoilTransactionSchema
>;
export type CasingSoilTransaction =
  typeof casingSoilTransactionsTable.$inferSelect;
