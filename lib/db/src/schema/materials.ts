import { mongoTable, serial, text, numeric, boolean, timestamp, integer, json, createInsertSchema } from "./dsl";
import { z } from "zod/v4";

import { inventoryCategoriesTable } from "./inventoryCategories";

export const materialsTable = mongoTable("materials", {
  id: serial("id").primaryKey(),
  // An Item Name is reusable: different inventory variants can share the
  // same master name while being distinguished by their generated SKU.
  name: text("name").notNull(),
  sku: text("sku"),
  category: text("category").notNull().default("raw_material"),
  categoryId: integer("category_id").references(() => inventoryCategoriesTable.id),
  attributeValues: json("attribute_values").notNull().default({}),
  unit: text("unit").notNull().default("kg"),
  defaultMoisturePercent: numeric("default_moisture_percent", { precision: 8, scale: 4 }),
  defaultNitrogenPercent: numeric("default_nitrogen_percent", { precision: 8, scale: 4 }),
  buyPricePerUnit: numeric("buy_price_per_unit", { precision: 12, scale: 4 }),
  sellPricePerUnit: numeric("sell_price_per_unit", { precision: 12, scale: 4 }),
  imageUrl: text("image_url"),
  qrCode: text("qr_code"),
  itemType: text("item_type").notNull().default("Raw Material"),
  hsnSac: text("hsn_sac"),
  gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  criticalLevel: numeric("critical_level", { precision: 12, scale: 4 }).notNull().default("10"),
  itemIdentifier: text("item_identifier").unique(),
  qrPayload: text("qr_payload"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMaterialSchema = createInsertSchema(materialsTable).omit({ id: true, createdAt: true });
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materialsTable.$inferSelect;
