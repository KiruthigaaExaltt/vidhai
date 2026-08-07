import { mongoTable, serial, integer, numeric, text, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const purchaseRequestsTable = mongoTable("purchase_requests", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().default(1),
  itemName: text("item_name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("units"),
  status: text("status").notNull().default("Draft"), // Draft | Submitted | Approved | Rejected | Closed
  requestedByUserId: integer("requested_by_user_id").references(() => usersTable.id),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPurchaseRequestSchema = createInsertSchema(purchaseRequestsTable).omit({
  id: true,
  createdAt: true,
  organizationId: true,
  requestedByUserId: true,
});
export type InsertPurchaseRequest = z.infer<typeof insertPurchaseRequestSchema>;
export type PurchaseRequest = typeof purchaseRequestsTable.$inferSelect;