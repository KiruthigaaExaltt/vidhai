import { mongoTable, serial, text, integer, numeric, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { locationsTable } from "./locations";
import { batchesTable } from "./batches";

export const chambersTable = mongoTable("chambers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  locationId: integer("location_id").notNull().references(() => locationsTable.id),
  chamberType: text("chamber_type").notNull().default("bulk"),
  status: text("status").notNull().default("idle"),
  capacity: integer("capacity"),
  currentBatchId: integer("current_batch_id").references(() => batchesTable.id),
  lastTemperature: numeric("last_temperature", { precision: 6, scale: 2 }),
  lastNh3: numeric("last_nh3", { precision: 8, scale: 4 }),
  lastReadingAt: timestamp("last_reading_at", { withTimezone: true }),
  // Physical dimensions
  lengthM: numeric("length_m", { precision: 8, scale: 2 }),
  widthM: numeric("width_m", { precision: 8, scale: 2 }),
  heightM: numeric("height_m", { precision: 8, scale: 2 }),
  notes: text("notes"),
});

export const chamberReadingsTable = mongoTable("chamber_readings", {
  id: serial("id").primaryKey(),
  chamberId: integer("chamber_id").notNull().references(() => chambersTable.id, { onDelete: "cascade" }),
  temperatureCelsius: numeric("temperature_celsius", { precision: 6, scale: 2 }),
  nh3Ppm: numeric("nh3_ppm", { precision: 8, scale: 4 }),
  co2Percent: numeric("co2_percent", { precision: 6, scale: 3 }),
  humidity: numeric("humidity", { precision: 6, scale: 2 }),
  notes: text("notes"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  recordedByUserId: integer("recorded_by_user_id"),
});

export const insertChamberSchema = createInsertSchema(chambersTable).omit({ id: true });
export type InsertChamber = z.infer<typeof insertChamberSchema>;
export type Chamber = typeof chambersTable.$inferSelect;

export const insertChamberReadingSchema = createInsertSchema(chamberReadingsTable).omit({ id: true });
export type InsertChamberReading = z.infer<typeof insertChamberReadingSchema>;
export type ChamberReading = typeof chamberReadingsTable.$inferSelect;
