import { mongoTable, serial, integer, numeric, text, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { usersTable } from "./users";

// ── Purchase Requests ────────────────────────────────────────────────────────
export const purchaseRequestsTable = mongoTable("purchase_requests", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().default(1),
  vendorId: text("vendor_id").notNull().default("CON00005"),
  vendorName: text("vendor_name").notNull().default("Nish"),
  prNumber: text("pr_number").notNull(),
  version: text("version").notNull().default("Version V1 - 10:00:00 am"),
  itemName: text("item_name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("units"),
  priority: text("priority").notNull().default("Normal"), // Normal | Urgent | High
  department: text("department").notNull().default("Admin"), // Admin | Development | Engineering | Production
  status: text("status").notNull().default("Draft"), // Draft | Submitted | Approved | Rejected | Closed | PO Created
  requestedByUserId: integer("requested_by_user_id").references(() => usersTable.id),
  requestedByName: text("requested_by_name").notNull().default("Kavin"),
  requiredDate: text("required_date").notNull().default(""),
  approvalNotes: text("approval_notes").notNull().default(""),
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

// ── Purchase Orders ──────────────────────────────────────────────────────────
export const purchaseOrdersTable = mongoTable("purchase_orders", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().default(1),
  vendorId: text("vendor_id").notNull().default("CON00005"),
  vendorName: text("vendor_name").notNull(),
  poNumber: text("po_number").notNull(),
  prReference: text("pr_reference").notNull().default(""),
  items: text("items").notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  deliveryDate: text("delivery_date").notNull().default(""),
  paymentTerms: text("payment_terms").notNull().default("Net 30"),
  shippingMethod: text("shipping_method").notNull().default("Road Transport"),
  warehouse: text("warehouse").notNull().default("Bangalore Central Warehouse"),
  project: text("project").notNull().default("Vidhai Factory Phase 1"),
  department: text("department").notNull().default("Admin"),
  notes: text("notes").notNull().default(""),
  attachmentName: text("attachment_name").notNull().default(""),
  status: text("status").notNull().default("Draft"), // Draft | Submitted | Approved | Issued | Product Dispatched | Completed | Rejected | Cancelled
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrdersTable).omit({
  id: true,
  createdAt: true,
  organizationId: true,
  createdByUserId: true,
});
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;

// ── Goods Receipts (GRN) ─────────────────────────────────────────────────────
export const goodsReceiptsTable = mongoTable("goods_receipts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().default(1),
  grnNumber: text("grn_number").notNull(),
  poReference: text("po_reference").notNull().default(""),
  vendorName: text("vendor_name").notNull(),
  itemsReceived: text("items_received").notNull(),
  inspectedByUserId: integer("inspected_by_user_id").references(() => usersTable.id),
  inspectedByName: text("inspected_by_name").notNull().default(""),
  status: text("status").notNull().default("Complete"), // Pending | Complete | Rejected
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGoodsReceiptSchema = createInsertSchema(goodsReceiptsTable).omit({
  id: true,
  createdAt: true,
  organizationId: true,
  inspectedByUserId: true,
});
export type InsertGoodsReceipt = z.infer<typeof insertGoodsReceiptSchema>;
export type GoodsReceipt = typeof goodsReceiptsTable.$inferSelect;

// ── Purchase Invoices / Accounts ─────────────────────────────────────────────
export const purchaseInvoicesTable = mongoTable("purchase_invoices", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().default(1),
  invoiceNumber: text("invoice_number").notNull(),
  vendorName: text("vendor_name").notNull(),
  poReference: text("po_reference").notNull().default(""),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  invoiceDate: text("invoice_date").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("Unpaid"), // Unpaid | Partially Paid | Paid | Overdue
  notes: text("notes").notNull().default(""),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPurchaseInvoiceSchema = createInsertSchema(purchaseInvoicesTable).omit({
  id: true,
  createdAt: true,
  organizationId: true,
  createdByUserId: true,
});
export type InsertPurchaseInvoice = z.infer<typeof insertPurchaseInvoiceSchema>;
export type PurchaseInvoice = typeof purchaseInvoicesTable.$inferSelect;

// ── Vendor Payments ──────────────────────────────────────────────────────────
export const vendorPaymentsTable = mongoTable("vendor_payments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().default(1),
  paymentNumber: text("payment_number").notNull(),
  vendorName: text("vendor_name").notNull(),
  invoiceReference: text("invoice_reference").notNull().default(""),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMode: text("payment_mode").notNull().default("UPI / NetBanking"),
  paymentDate: text("payment_date").notNull(),
  status: text("status").notNull().default("Completed"), // Completed | Pending | Failed
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVendorPaymentSchema = createInsertSchema(vendorPaymentsTable).omit({
  id: true,
  createdAt: true,
  organizationId: true,
  createdByUserId: true,
});
export type InsertVendorPayment = z.infer<typeof insertVendorPaymentSchema>;
export type VendorPayment = typeof vendorPaymentsTable.$inferSelect;

// ── Purchase Returns ─────────────────────────────────────────────────────────
export const purchaseReturnsTable = mongoTable("purchase_returns", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().default(1),
  returnNumber: text("return_number").notNull(),
  vendorName: text("vendor_name").notNull(),
  grnReference: text("grn_reference").notNull().default(""),
  reason: text("reason").notNull(),
  refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("Requested"), // Requested | Approved | Completed | Rejected
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPurchaseReturnSchema = createInsertSchema(purchaseReturnsTable).omit({
  id: true,
  createdAt: true,
  organizationId: true,
  createdByUserId: true,
});
export type InsertPurchaseReturn = z.infer<typeof insertPurchaseReturnSchema>;
export type PurchaseReturn = typeof purchaseReturnsTable.$inferSelect;