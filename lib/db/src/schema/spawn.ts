import { mongoTable, serial, text, numeric, timestamp, date, createInsertSchema } from "./dsl";
import { z } from "zod/v4";

export const spawnEntriesTable = mongoTable("spawn_entries", {
  id: serial("id").primaryKey(),
  strainName: text("strain_name").notNull(),
  quantityKg: numeric("quantity_kg", { precision: 10, scale: 4 }).notNull(),
  source: text("source").notNull(),
  receivedAt: date("received_at", { mode: "string" }).notNull(),
  expiresAt: date("expires_at", { mode: "string" }),
  status: text("status").notNull().default("available"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSpawnEntrySchema = createInsertSchema(spawnEntriesTable).omit({ id: true, createdAt: true });
export type InsertSpawnEntry = z.infer<typeof insertSpawnEntrySchema>;
export type SpawnEntry = typeof spawnEntriesTable.$inferSelect;
