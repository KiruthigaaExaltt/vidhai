import { mongoTable, serial, text, boolean, integer, timestamp, json, createInsertSchema } from "./dsl";
import { z } from "zod/v4";

export const inventoryCategoriesTable = mongoTable("inventory_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  categoryCode: text("category_code").unique(),
  parentId: integer("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  divisions: json("divisions").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCategorySchema = createInsertSchema(inventoryCategoriesTable).omit({ id: true, createdAt: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof inventoryCategoriesTable.$inferSelect;
