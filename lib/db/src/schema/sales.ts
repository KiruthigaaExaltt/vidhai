import { mongoTable, serial, integer, numeric, text, date, timestamp, boolean, json, createInsertSchema } from "./dsl";
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

export const quotationsTable = mongoTable("quotations", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull(),
  quotationNumber: text("quotation_number").notNull(),
  rootQuoteNumber: text("root_quote_number").notNull().default(""),
  clientId: integer("client_id").notNull(),
  clientName: text("client_name").notNull().default(""),
  customerMobile: text("customer_mobile").notNull().default(""),
  customerWhatsappNumber: text("customer_whatsapp_number").default(""),
  customerCompany: text("customer_company").default(""),
  customerAddress: text("customer_address").default(""),
  customerGstin: text("customer_gstin").default(""),
  customerCountryCode: text("customer_country_code").notNull().default("91"),
  placeOfSupply: text("place_of_supply").notNull().default(""),
  validityDays: integer("validity_days").notNull().default(30),
  quotationDate: date("quotation_date").notNull(),
  validUntil: date("valid_until").notNull(),
  sentAt: timestamp("sent_at"),
  customerResponseAt: timestamp("customer_response_at"),
  subtotal: numeric("subtotal").notNull().default("0"),
  taxableAmount: numeric("taxable_amount").notNull().default("0"),
  cgstTotal: numeric("cgst_total").notNull().default("0"),
  sgstTotal: numeric("sgst_total").notNull().default("0"),
  igstTotal: numeric("igst_total").notNull().default("0"),
  grandTotal: numeric("grand_total").notNull().default("0"),
  discountAmount: numeric("discount_amount").notNull().default("0"),
  roundOff: numeric("round_off").notNull().default("0"),
  terms: text("terms").default(""),
  bankName: text("bank_name").default(""),
  accountNumber: text("account_number").default(""),
  ifscCode: text("ifsc_code").default(""),
  branch: text("branch").default(""),
  billedByCompanyName: text("billed_by_company_name").default(""),
  billedByAddress: text("billed_by_address").default(""),
  billedByGstin: text("billed_by_gstin").default(""),
  billedByContactNumber: text("billed_by_contact_number").default(""),
  notes: text("notes").default(""),
  status: text("status").notNull().default("Draft"),
  rejectionReason: text("rejection_reason"),
  confirmedByUserId: integer("confirmed_by_user_id"),
  versionSeries: text("version_series").notNull().default("Draft"),
  versionNumber: integer("version_number").notNull().default(1),
  versionLabel: text("version_label").notNull().default("Draft V1"),
  parentQuoteId: integer("parent_quote_id"),
  isLatestVersion: boolean("is_latest_version").notNull().default(true),
  isLocked: boolean("is_locked").notNull().default(false),
  changeRemarks: text("change_remarks"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const quotationItemsTable = mongoTable("quotation_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull(),
  quotationId: integer("quotation_id").notNull(),
  itemId: integer("item_id"),
  productId: integer("product_id"),
  variantId: integer("variant_id"),
  serviceId: integer("service_id"),
  productName: text("product_name"),
  variantName: text("variant_name"),
  description: text("description"),
  hsnSac: text("hsn_sac"),
  quantity: numeric("quantity").notNull().default("0"),
  uom: text("uom").notNull().default("Nos"),
  rate: numeric("rate").notNull().default("0"),
  discountPercent: numeric("discount_percent").notNull().default("0"),
  cgstPercent: numeric("cgst_percent").notNull().default("0"),
  sgstPercent: numeric("sgst_percent").notNull().default("0"),
  igstPercent: numeric("igst_percent").notNull().default("0"),
  itemType: text("item_type"),
  lineSource: text("line_source"),
  warehouseId: integer("warehouse_id"),
  warehouseName: text("warehouse_name"),
  attributeValues: json("attribute_values").notNull().default({}),
  customSpecification: text("custom_specification"),
});

export const insertQuotationSchema = createInsertSchema(quotationsTable).omit({ id: true, createdAt: true });
export type InsertQuotation = z.infer<typeof insertQuotationSchema>;
export type Quotation = typeof quotationsTable.$inferSelect;

export const insertQuotationItemSchema = createInsertSchema(quotationItemsTable).omit({ id: true });
export type InsertQuotationItem = z.infer<typeof insertQuotationItemSchema>;
export type QuotationItem = typeof quotationItemsTable.$inferSelect;

export const quotationCommunicationsTable = mongoTable("quotation_communications", {
  id: serial("id").primaryKey(),
  quotationId: integer("quotation_id").notNull(),
  rootQuoteNumber: text("root_quote_number").notNull().default(""),
  versionNumber: integer("version_number").notNull().default(1),
  channel: text("channel").notNull().default("WhatsApp"),
  communicationType: text("communication_type").notNull(),
  message: text("message").default(""),
  recipientMobile: text("recipient_mobile").default(""),
  actorUserId: integer("actor_user_id"),
  actorName: text("actor_name").default(""),
  metadata: json("metadata").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertQuotationCommunicationSchema = createInsertSchema(quotationCommunicationsTable).omit({ id: true, createdAt: true });
export type InsertQuotationCommunication = z.infer<typeof insertQuotationCommunicationSchema>;
export type QuotationCommunication = typeof quotationCommunicationsTable.$inferSelect;

export const proformaInvoicesTable = mongoTable("proforma_invoices", {
  id: serial("id").primaryKey(),
  piNumber: text("pi_number").notNull().unique(),
  quoteId: integer("quote_id"),
  clientId: integer("client_id").notNull(),
  clientName: text("client_name").notNull().default(""),
  placeOfSupply: text("place_of_supply").notNull().default(""),
  piDate: date("pi_date").notNull(),
  validUntil: date("valid_until"),
  subtotal: numeric("subtotal").notNull().default("0"),
  taxableAmount: numeric("taxable_amount").notNull().default("0"),
  cgstTotal: numeric("cgst_total").notNull().default("0"),
  sgstTotal: numeric("sgst_total").notNull().default("0"),
  igstTotal: numeric("igst_total").notNull().default("0"),
  grandTotal: numeric("grand_total").notNull().default("0"),
  discountAmount: numeric("discount_amount").notNull().default("0"),
  roundOff: numeric("round_off").notNull().default("0"),
  terms: text("terms").default(""),
  bankName: text("bank_name").default(""),
  accountNumber: text("account_number").default(""),
  ifscCode: text("ifsc_code").default(""),
  branch: text("branch").default(""),
  notes: text("notes").default(""),
  status: text("status").notNull().default("Draft"),
  autoCreatedFromQuotationId: integer("auto_created_from_quotation_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const proformaInvoiceItemsTable = mongoTable("proforma_invoice_items", {
  id: serial("id").primaryKey(),
  piId: integer("pi_id").notNull(),
  itemId: integer("item_id"),
  productId: integer("product_id"),
  variantId: integer("variant_id"),
  serviceId: integer("service_id"),
  productName: text("product_name"),
  variantName: text("variant_name"),
  description: text("description"),
  hsnSac: text("hsn_sac"),
  quantity: numeric("quantity").notNull().default("0"),
  uom: text("uom").notNull().default("Nos"),
  rate: numeric("rate").notNull().default("0"),
  discountPercent: numeric("discount_percent").notNull().default("0"),
  cgstPercent: numeric("cgst_percent").notNull().default("0"),
  sgstPercent: numeric("sgst_percent").notNull().default("0"),
  igstPercent: numeric("igst_percent").notNull().default("0"),
  itemType: text("item_type"),
  lineSource: text("line_source"),
  warehouseId: integer("warehouse_id"),
  warehouseName: text("warehouse_name"),
  attributeValues: json("attribute_values").notNull().default({}),
  customSpecification: text("custom_specification"),
});

export const insertProformaInvoiceSchema = createInsertSchema(proformaInvoicesTable).omit({ id: true, createdAt: true });
export type InsertProformaInvoice = z.infer<typeof insertProformaInvoiceSchema>;
export type ProformaInvoice = typeof proformaInvoicesTable.$inferSelect;

export const insertProformaInvoiceItemSchema = createInsertSchema(proformaInvoiceItemsTable).omit({ id: true });
export type InsertProformaInvoiceItem = z.infer<typeof insertProformaInvoiceItemSchema>;
export type ProformaInvoiceItem = typeof proformaInvoiceItemsTable.$inferSelect;

export const organizationDetailsTable = mongoTable("organization_details", {
  id: serial("id").primaryKey(),
  logoUrl: text("logo_url"),
  watermarkUrl: text("watermark_url"),
  companyName: text("company_name").default(""),
  orgEmail: text("org_email").default(""),
  orgDomain: text("org_domain").default(""),
  gstin: text("gstin").default(""),
  companyStateCode: text("company_state_code").default(""),
  salesExecutive: text("sales_executive").default(""),
  salesContactNo: text("sales_contact_no").default(""),
  companyAddress: text("company_address").default(""),
  bankName: text("bank_name").default(""),
  accountNumber: text("account_number").default(""),
  ifscCode: text("ifsc_code").default(""),
  branch: text("branch").default(""),
  qrCodeUrl: text("qr_code_url"),
  termsAndConditions: json("terms_and_conditions").default([]),
  salesDocBody: text("sales_doc_body").default(""),
  flexDocBody: text("flex_doc_body").default(""),
  defaultCurrency: text("default_currency").default("INR"),
  timezone: text("timezone").default("Asia/Kolkata"),
});

export const insertOrganizationDetailsSchema = createInsertSchema(organizationDetailsTable).omit({ id: true });
export type InsertOrganizationDetails = z.infer<typeof insertOrganizationDetailsSchema>;
export type OrganizationDetails = typeof organizationDetailsTable.$inferSelect;




