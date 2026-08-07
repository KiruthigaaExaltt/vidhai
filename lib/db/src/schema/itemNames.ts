import { mongoTable, serial, text, boolean, integer, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { inventoryCategoriesTable } from "./inventoryCategories";

export const itemNamesTable = mongoTable("itemNames", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  categoryId: integer("categoryId").notNull().references(() => inventoryCategoriesTable.id),
  isActive: boolean("isActive").default(true),
});

export const insertItemNameSchema = createInsertSchema(itemNamesTable);

export type InsertItemName = z.infer<typeof insertItemNameSchema>;
export type ItemName = typeof itemNamesTable.$inferSelect;
