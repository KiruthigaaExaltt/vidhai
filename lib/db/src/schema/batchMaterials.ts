import { mongoTable, serial, integer, numeric, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { batchesTable } from "./batches";
import { materialsTable } from "./materials";

export const batchMaterialsTable = mongoTable("batch_materials", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => batchesTable.id, { onDelete: "cascade" }),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  wetWeightKg: numeric("wet_weight_kg", { precision: 12, scale: 4 }).notNull(),
  moisturePercent: numeric("moisture_percent", { precision: 8, scale: 4 }).notNull(),
  nitrogenPercent: numeric("nitrogen_percent", { precision: 8, scale: 4 }).notNull(),
});

export const insertBatchMaterialSchema = createInsertSchema(batchMaterialsTable).omit({ id: true });
export type InsertBatchMaterial = z.infer<typeof insertBatchMaterialSchema>;
export type BatchMaterial = typeof batchMaterialsTable.$inferSelect;
