import {
  mongoTable,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  date,
  createInsertSchema,
} from "./dsl";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const spawnEntriesTable = mongoTable("spawn_entries", {
  id: serial("id").primaryKey(),
  strainName: text("strain_name").notNull(),
  quantityKg: numeric("quantity_kg", { precision: 10, scale: 4 }).notNull(),
  source: text("source").notNull(),
  sourceType: text("source_type").notNull().default("LEGACY"),
  sourceReferenceType: text("source_reference_type"),
  sourceReferenceId: integer("source_reference_id"),
  sourceReference: text("source_reference"),
  supplierName: text("supplier_name"),
  supplierLot: text("supplier_lot"),
  purchaseReference: text("purchase_reference"),
  producedQuantityKg: numeric("produced_quantity_kg", {
    precision: 10,
    scale: 4,
  }),
  receivedAt: date("received_at", { mode: "string" }).notNull(),
  expiresAt: date("expires_at", { mode: "string" }),
  status: text("status").notNull().default("available"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const spawnVaultTransactionsTable = mongoTable(
  "spawn_vault_transactions",
  {
    id: serial("id").primaryKey(),
    transactionKey: text("transaction_key").notNull().unique(),
    spawnEntryId: integer("spawn_entry_id")
      .notNull()
      .references(() => spawnEntriesTable.id),
    transactionType: text("transaction_type").notNull(),
    quantityInKg: numeric("quantity_in_kg", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    quantityOutKg: numeric("quantity_out_kg", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),
    balanceAfterKg: numeric("balance_after_kg", {
      precision: 10,
      scale: 4,
    }).notNull(),
    referenceType: text("reference_type").notNull(),
    referenceId: integer("reference_id").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    recordedByUserId: integer("recorded_by_user_id").references(
      () => usersTable.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const annurSpawnUsagesTable = mongoTable("annur_spawn_usages", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().unique(),
  spawnEntryId: integer("spawn_entry_id")
    .notNull()
    .references(() => spawnEntriesTable.id),
  quantityUsedKg: numeric("quantity_used_kg", {
    precision: 10,
    scale: 4,
  }).notNull(),
  sourceTypeSnapshot: text("source_type_snapshot").notNull(),
  sourceReferenceSnapshot: text("source_reference_snapshot"),
  strainNameSnapshot: text("strain_name_snapshot").notNull(),
  supplierNameSnapshot: text("supplier_name_snapshot"),
  supplierLotSnapshot: text("supplier_lot_snapshot"),
  purchaseReferenceSnapshot: text("purchase_reference_snapshot"),
  recordedByUserId: integer("recorded_by_user_id").references(
    () => usersTable.id,
  ),
  updatedByUserId: integer("updated_by_user_id").references(
    () => usersTable.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSpawnEntrySchema = createInsertSchema(
  spawnEntriesTable,
).omit({ id: true, createdAt: true });
export type InsertSpawnEntry = z.infer<typeof insertSpawnEntrySchema>;
export type SpawnEntry = typeof spawnEntriesTable.$inferSelect;
