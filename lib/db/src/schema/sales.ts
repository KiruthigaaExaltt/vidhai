import { mongoTable, serial, integer, numeric, text, date, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { locationsTable } from "./locations";
import { usersTable } from "./users";

export const salesOrdersTable = mongoTable("sales_orders", {
  id: serial("id").primaryKey(),
  orderCode: text("order_code").notNull().unique(),
  productType: text("product_type").notNull(),
  saleType: text("sale_type").notNull().default("external"),
  transactionDate: date("transaction_date", { mode: "string" }).notNull(),
  qtyKg: numeric("qty_kg", { precision: 12, scale: 4 }).notNull(),
  unit: text("unit").notNull().default("kg"),
  buyerName: text("buyer_name"),
  destinationLocationId: integer("destination_location_id").references(() => locationsTable.id),
  fromBatchId: integer("from_batch_id"),
  fromBatchCode: text("from_batch_code"),
  qualityNote: text("quality_note"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }),
  totalValue: numeric("total_value", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSalesOrderSchema = createInsertSchema(salesOrdersTable).omit({ id: true, orderCode: true, createdAt: true });
export type InsertSalesOrder = z.infer<typeof insertSalesOrderSchema>;
export type SalesOrder = typeof salesOrdersTable.$inferSelect;
