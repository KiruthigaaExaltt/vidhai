import { mongoTable, serial, integer, numeric, text, timestamp, date, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { batchesTable } from "./batches";
import { usersTable } from "./users";

// Saved formulation materials for a Lab spawn batch (locked at initiation)
export const labBatchMaterialsTable = mongoTable("lab_batch_materials", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => batchesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantityKg: numeric("quantity_kg", { precision: 10, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLabBatchMaterialSchema = createInsertSchema(labBatchMaterialsTable).omit({ id: true, createdAt: true });
export type InsertLabBatchMaterial = z.infer<typeof insertLabBatchMaterialSchema>;
export type LabBatchMaterial = typeof labBatchMaterialsTable.$inferSelect;

export const labSpawnOutputTable = mongoTable("lab_spawn_output", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => batchesTable.id, { onDelete: "cascade" }),
  strainName: text("strain_name").notNull(),
  quantityKg: numeric("quantity_kg", { precision: 10, scale: 4 }).notNull(),
  producedAt: date("produced_at", { mode: "string" }),
  status: text("status").notNull().default("available"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLabSpawnOutputSchema = createInsertSchema(labSpawnOutputTable).omit({ id: true, createdAt: true });
export type InsertLabSpawnOutput = z.infer<typeof insertLabSpawnOutputSchema>;
export type LabSpawnOutput = typeof labSpawnOutputTable.$inferSelect;

export const spawnTransactionsTable = mongoTable("spawn_transactions", {
  id: serial("id").primaryKey(),
  transactionType: text("transaction_type").notNull(),
  strainName: text("strain_name").notNull(),
  quantityKg: numeric("quantity_kg", { precision: 10, scale: 4 }).notNull(),
  counterparty: text("counterparty"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }),
  transactionDate: date("transaction_date", { mode: "string" }).notNull(),
  notes: text("notes"),
  labSpawnOutputId: integer("lab_spawn_output_id").references(() => labSpawnOutputTable.id),
  recordedByUserId: integer("recorded_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSpawnTransactionSchema = createInsertSchema(spawnTransactionsTable).omit({ id: true, createdAt: true });
export type InsertSpawnTransaction = z.infer<typeof insertSpawnTransactionSchema>;
export type SpawnTransaction = typeof spawnTransactionsTable.$inferSelect;
