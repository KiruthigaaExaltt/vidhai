import { mongoTable, serial, text, integer, createInsertSchema } from "./dsl";
import { z } from "zod/v4";

export const alertColorsTable = mongoTable("alert_colors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  hexColor: text("hex_color").notNull(),
  condition: text("condition").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertAlertColorSchema = createInsertSchema(alertColorsTable).omit({ id: true });
export type InsertAlertColor = z.infer<typeof insertAlertColorSchema>;
export type AlertColor = typeof alertColorsTable.$inferSelect;
