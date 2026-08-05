import { mongoTable, serial, text, numeric, boolean, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";

export const materialsTable = mongoTable("materials", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sku: text("sku"),
  category: text("category").notNull().default("raw_material"),
  unit: text("unit").notNull().default("kg"),
  defaultMoisturePercent: numeric("default_moisture_percent", { precision: 8, scale: 4 }),
  defaultNitrogenPercent: numeric("default_nitrogen_percent", { precision: 8, scale: 4 }),
  buyPricePerUnit: numeric("buy_price_per_unit", { precision: 12, scale: 4 }),
  sellPricePerUnit: numeric("sell_price_per_unit", { precision: 12, scale: 4 }),
  imageUrl: text("image_url"),
  qrCode: text("qr_code"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMaterialSchema = createInsertSchema(materialsTable).omit({ id: true, createdAt: true });
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materialsTable.$inferSelect;
