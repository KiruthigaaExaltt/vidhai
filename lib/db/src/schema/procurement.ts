import {
  mongoTable,
  serial,
  integer,
  numeric,
  text,
  timestamp,
  json,
  boolean,
  createInsertSchema,
} from "./dsl";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { departmentsTable } from "./departments";

// ── Purchase Requests ────────────────────────────────────────────────────────
export const purchaseRequestsTable = mongoTable("purchase_requests", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().default(1),
  vendorId: text("vendor_id").notNull().default("CON00005"),
  vendorName: text("vendor_name").notNull().default("Nish"),
  vendorIds: json("vendor_ids").notNull().default([]),
  prNumber: text("pr_number").notNull(),
  version: text("version").notNull().default("Version V1 - 10:00:00 am"),
  itemName: text("item_name").notNull(),
  lineItems: json("line_items").notNull().default([]),
  orderedQuantity: numeric("ordered_quantity", { precision: 12, scale: 2 }),
  receivedQuantity: numeric("received_quantity", { precision: 12, scale: 2 }),
  remainingQuantity: numeric("remaining_quantity", { precision: 12, scale: 2 }),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("units"),
  priority: text("priority").notNull().default("Normal"), // Normal | Urgent | High
  departmentId: integer("department_id").references(() => departmentsTable.id),
  department: text("department").default(""), // Admin | Development | Engineering | Production
  status: text("status").notNull().default("Draft"), // Draft | Submitted | Approved | Rejected | Closed | PO Created
  requestedByUserId: integer("requested_by_user_id").references(
    () => usersTable.id,
  ),
  requestedByName: text("requested_by_name").notNull().default("Kavin"),
  requiredDate: text("required_date").default(""),
  project: text("project").default(""),
  attachmentName: text("attachment_name").default(""),
  approvalNotes: text("approval_notes").default(""),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPurchaseRequestSchema = createInsertSchema(
  purchaseRequestsTable,
).omit({
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
  contactPerson: text("contact_person").default(""),
  vendorGst: text("vendor_gst").default(""),
  vendorAddress: text("vendor_address").default(""),
  vendorPhone: text("vendor_phone").default(""),
  placeOfSupply: text("place_of_supply").default(""),
  poNumber: text("po_number").notNull(),
  prReference: text("pr_reference").default(""),
  items: text("items").notNull(),
  lineItems: json("line_items").notNull().default([]),
  orderedQuantity: numeric("ordered_quantity", { precision: 12, scale: 2 }),
  receivedQuantity: numeric("received_quantity", { precision: 12, scale: 2 }),
  remainingQuantity: numeric("remaining_quantity", { precision: 12, scale: 2 }),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  poDate: text("po_date").default(""),
  deliveryDate: text("delivery_date").default(""),
  paymentTerms: text("payment_terms").notNull().default("Net 30"),
  shippingMethod: text("shipping_method").notNull().default("Road Transport"),
  warehouse: text("warehouse").notNull().default("Bangalore Central Warehouse"),
  project: text("project").default(""),
  department: text("department").default(""),
  notes: text("notes").default(""),
  attachmentName: text("attachment_name").default(""),
  termsConditions: text("terms_conditions").default(""),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  status: text("status").notNull().default("Draft"), // Draft | Submitted | Approved | Issued | Product Dispatched | Completed | Rejected | Cancelled
  createdByUserId: integer("created_by_user_id").references(
    () => usersTable.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPurchaseOrderSchema = createInsertSchema(
  purchaseOrdersTable,
).omit({
  id: true,
  createdAt: true,
  organizationId: true,
  createdByUserId: true,
});
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
export const vendorAvailabilityTable = mongoTable("vendor_availability", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().default(1),
  purchaseRequestId: integer("purchase_request_id")
    .notNull()
    .references(() => purchaseRequestsTable.id, { onDelete: "cascade" }),
  vendorId: text("vendor_id").notNull(),
  status: text("status").notNull().default("Pending"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  purchaseOrderId: integer("purchase_order_id").references(
    () => purchaseOrdersTable.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Goods Receipts (GRN) ─────────────────────────────────────────────────────
export const goodsReceiptsTable = mongoTable("goods_receipts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().default(1),
  grnNumber: text("grn_number").notNull().unique(),
  purchaseOrderId: integer("purchase_order_id").references(
    () => purchaseOrdersTable.id,
  ),
  purchaseOrderIds: json("purchase_order_ids").notNull().default([]),
  poReferences: json("po_references").notNull().default([]),
  vendorIds: json("vendor_ids").notNull().default([]),
  poReference: text("po_reference").notNull().default(""),
  vendorId: text("vendor_id").notNull().default(""),
  vendorName: text("vendor_name").notNull(),
  itemsReceived: text("items_received").notNull(),
  lineItems: json("line_items").notNull().default([]),
  orderedQuantity: numeric("ordered_quantity", { precision: 12, scale: 2 }),
  receivedQuantity: numeric("received_quantity", { precision: 12, scale: 2 }),
  remainingQuantity: numeric("remaining_quantity", { precision: 12, scale: 2 }),
  receivedDate: text("received_date").notNull().default(""),
  notes: text("notes").default(""),
  attachmentName: text("attachment_name").default(""),
  inspectedByUserId: integer("inspected_by_user_id").references(
    () => usersTable.id,
  ),
  inspectedByName: text("inspected_by_name").notNull().default(""),
  status: text("status").notNull().default("Complete"), // Pending | Complete | Rejected
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertGoodsReceiptSchema = createInsertSchema(
  goodsReceiptsTable,
).omit({
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
  vendorAddress: text("vendor_address").notNull().default(""),
  vendorPhone: text("vendor_phone").notNull().default(""),
  poReference: text("po_reference").default(""),
  // Manual and PO-only invoices legitimately have no GRN mapping.
  grnReference: text("grn_reference").default(""),
  purchaseOrderId: integer("purchase_order_id").references(
    () => purchaseOrdersTable.id,
  ),
  goodsReceiptId: integer("goods_receipt_id").references(
    () => goodsReceiptsTable.id,
  ),
  vendorId: text("vendor_id").notNull().default(""),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  taxableAmount: numeric("taxable_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  cgstPercent: numeric("cgst_percent", { precision: 8, scale: 2 })
    .notNull()
    .default("0"),
  sgstPercent: numeric("sgst_percent", { precision: 8, scale: 2 })
    .notNull()
    .default("0"),
  igstPercent: numeric("igst_percent", { precision: 8, scale: 2 })
    .notNull()
    .default("0"),
  cgstAmount: numeric("cgst_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  sgstAmount: numeric("sgst_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  igstAmount: numeric("igst_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  poAmount: numeric("po_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  grnAmount: numeric("grn_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  matchStatus: text("match_status").notNull().default("Mismatch"),
  lineItems: json("line_items").notNull().default([]),
  invoiceDate: text("invoice_date").notNull(),
  paymentDueDays: integer("payment_due_days").notNull().default(30),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("Unpaid"), // Unpaid | Partially Paid | Paid | Overdue
  isPostedToLedger: boolean("is_posted_to_ledger").notNull().default(false),
  journalEntryId: integer("journal_entry_id"),
  documentPath: text("document_path").default(""),
  documentName: text("document_name").default(""),
  notes: text("notes").default(""),
  attachmentName: text("attachment_name").default(""),
  createdByUserId: integer("created_by_user_id").references(
    () => usersTable.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPurchaseInvoiceSchema = createInsertSchema(
  purchaseInvoicesTable,
).omit({
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
  bankAccount: text("bank_account").default(""),
  transactionReference: text("transaction_reference").default(""),
  notes: text("notes").default(""),
  attachmentName: text("attachment_name").default(""),
  documentPath: text("document_path").default(""),
  paymentDate: text("payment_date").notNull(),
  status: text("status").notNull().default("Pending Approval"),
  requiredApprovals: integer("required_approvals").notNull().default(1),
  approvalLevel: integer("approval_level").notNull().default(0),
  approvalRemarks: text("approval_remarks").default(""),
  approvedByUserId: integer("approved_by_user_id").references(
    () => usersTable.id,
  ),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedByUserId: integer("rejected_by_user_id").references(
    () => usersTable.id,
  ),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  journalEntryId: integer("journal_entry_id"),
  createdByUserId: integer("created_by_user_id").references(
    () => usersTable.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertVendorPaymentSchema = createInsertSchema(
  vendorPaymentsTable,
).omit({
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
  vendorId: text("vendor_id").default(""),
  vendorAddress: text("vendor_address").default(""),
  vendorPhone: text("vendor_phone").default(""),
  invoiceReference: text("invoice_reference").default(""),
  grnReference: text("grn_reference").default(""),
  reason: text("reason").notNull(),
  returnDate: text("return_date").notNull().default(""),
  lineItems: json("line_items").notNull().default([]),
  notes: text("notes").default(""),
  attachmentName: text("attachment_name").default(""),
  refundAmount: numeric("refund_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  status: text("status").notNull().default("Requested"), // Requested | Approved | Completed | Rejected
  createdByUserId: integer("created_by_user_id").references(
    () => usersTable.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPurchaseReturnSchema = createInsertSchema(
  purchaseReturnsTable,
).omit({
  id: true,
  createdAt: true,
  organizationId: true,
  createdByUserId: true,
});
export type InsertPurchaseReturn = z.infer<typeof insertPurchaseReturnSchema>;
export type PurchaseReturn = typeof purchaseReturnsTable.$inferSelect;
