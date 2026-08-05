import { mongoTable, serial, integer, numeric, text, date, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { batchesTable } from "./batches";
import { materialsTable } from "./materials";
import { usersTable } from "./users";

// Coimbatore batch material usage
export const coimbatoreBatchMaterialsTable = mongoTable("coimbatore_batch_materials", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => batchesTable.id, { onDelete: "cascade" }),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  weightKg: numeric("weight_kg", { precision: 10, scale: 4 }),
  notes: text("notes"),
});

// Coimbatore turning config
export const coimbatoreConfigTable = mongoTable("coimbatore_config", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => batchesTable.id, { onDelete: "cascade" }).unique(),
  totalTurns: integer("total_turns").notNull().default(4),
  turnScheduleJson: text("turn_schedule_json"),
});

// Coimbatore turn records
export const coimbatoreTurnsTable = mongoTable("coimbatore_turns", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => batchesTable.id, { onDelete: "cascade" }),
  turnNumber: integer("turn_number").notNull(),
  plannedDate: date("planned_date", { mode: "string" }),
  actualDate: date("actual_date", { mode: "string" }),
  durationDays: integer("duration_days"),
  notes: text("notes"),
  verificationImages: text("verification_images"), // JSON array of base64 strings
  recordedByUserId: integer("recorded_by_user_id").references(() => usersTable.id),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow(),
});

// QC decisions (shared across modules)
export const qcDecisionsTable = mongoTable("qc_decisions", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => batchesTable.id, { onDelete: "cascade" }),
  moduleType: text("module_type").notNull(),
  decision: text("decision").notNull(),
  notes: text("notes"),
  decidedByUserId: integer("decided_by_user_id").references(() => usersTable.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});

// Casing soil buy/sell transactions (mirrors spawn pattern)
export const casingSoilTransactionsTable = mongoTable("casing_soil_transactions", {
  id: serial("id").primaryKey(),
  transactionType: text("transaction_type").notNull(), // 'buy' | 'sell' | 'produce'
  quantityKg: numeric("quantity_kg", { precision: 10, scale: 4 }).notNull(),
  counterparty: text("counterparty"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }),
  transactionDate: date("transaction_date", { mode: "string" }).notNull(),
  coimbatoreBatchId: integer("coimbatore_batch_id").references(() => batchesTable.id),
  notes: text("notes"),
  recordedByUserId: integer("recorded_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCoimbatoreBatchMaterialSchema = createInsertSchema(coimbatoreBatchMaterialsTable).omit({ id: true });
export type InsertCoimbatoreBatchMaterial = z.infer<typeof insertCoimbatoreBatchMaterialSchema>;
export type CoimbatoreBatchMaterial = typeof coimbatoreBatchMaterialsTable.$inferSelect;

export const insertCoimbatoreConfigSchema = createInsertSchema(coimbatoreConfigTable).omit({ id: true });
export type InsertCoimbatoreConfig = z.infer<typeof insertCoimbatoreConfigSchema>;
export type CoimbatoreConfig = typeof coimbatoreConfigTable.$inferSelect;

export const insertCoimbatoreTurnSchema = createInsertSchema(coimbatoreTurnsTable).omit({ id: true, recordedAt: true });
export type InsertCoimbatoreTurn = z.infer<typeof insertCoimbatoreTurnSchema>;
export type CoimbatoreTurn = typeof coimbatoreTurnsTable.$inferSelect;

export const insertQcDecisionSchema = createInsertSchema(qcDecisionsTable).omit({ id: true, decidedAt: true });
export type InsertQcDecision = z.infer<typeof insertQcDecisionSchema>;
export type QcDecision = typeof qcDecisionsTable.$inferSelect;

export const insertCasingSoilTransactionSchema = createInsertSchema(casingSoilTransactionsTable).omit({ id: true, createdAt: true });
export type InsertCasingSoilTransaction = z.infer<typeof insertCasingSoilTransactionSchema>;
export type CasingSoilTransaction = typeof casingSoilTransactionsTable.$inferSelect;
