import { mongoTable, serial, integer, text, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { batchesTable } from "./batches";
import { ootyGrowingBatchesTable } from "./ootySchemas";
import { labSpawnOutputTable } from "./labSchemas";

export const batchLinksTable = mongoTable("batch_links", {
  id: serial("id").primaryKey(),
  ootyGrowingBatchId: integer("ooty_growing_batch_id").references(() => ootyGrowingBatchesTable.id),
  annurBatchId: integer("annur_batch_id").references(() => batchesTable.id),
  coimBatchId: integer("coim_batch_id").references(() => batchesTable.id),
  labSpawnOutputId: integer("lab_spawn_output_id").references(() => labSpawnOutputTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBatchLinkSchema = createInsertSchema(batchLinksTable).omit({ id: true, createdAt: true });
export type InsertBatchLink = z.infer<typeof insertBatchLinkSchema>;
export type BatchLink = typeof batchLinksTable.$inferSelect;
