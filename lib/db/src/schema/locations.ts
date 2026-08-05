import { mongoTable, serial, text, createInsertSchema } from "./dsl";
import { z } from "zod/v4";

export const locationsTable = mongoTable("locations", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
});

export const insertLocationSchema = createInsertSchema(locationsTable).omit({ id: true });
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locationsTable.$inferSelect;
