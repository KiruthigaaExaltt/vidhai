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
  piNumber: text("pi_number").notNull(),
  rootPiNumber: text("root_pi_number").notNull().default(""),
  quoteId: integer("quote_id"),
  quoteIds: json("quote_ids").notNull().default([]),
  clientId: integer("client_id").notNull(),
  clientName: text("client_name").notNull().default(""),
  customerMobile: text("customer_mobile").default(""),
  customerWhatsappNumber: text("customer_whatsapp_number").default(""),
  customerCompany: text("customer_company").default(""),
  customerAddress: text("customer_address").default(""),
  customerGstin: text("customer_gstin").default(""),
  customerCountryCode: text("customer_country_code").default("91"),
  placeOfSupply: text("place_of_supply").notNull().default(""),
  piDate: date("pi_date").notNull(),
  validUntil: date("valid_until"),
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
  parentPiId: integer("parent_pi_id"),
  isLatestVersion: boolean("is_latest_version").notNull().default(true),
  isLocked: boolean("is_locked").notNull().default(false),
  changeRemarks: text("change_remarks"),
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

export const deliveryChallansTable = mongoTable("delivery_challans", {
  id: serial("id").primaryKey(),
  dcNumber: text("dc_number").notNull().unique(),
  quotationIds: json("quotation_ids").notNull().default([]),
  piIds: json("pi_ids").notNull().default([]),
  clientId: integer("client_id").notNull(), clientName: text("client_name").notNull().default(""),
  customerMobile: text("customer_mobile").default(""), customerWhatsappNumber: text("customer_whatsapp_number").default(""),
  customerCompany: text("customer_company").default(""), customerAddress: text("customer_address").default(""),
  customerGstin: text("customer_gstin").default(""), placeOfSupply: text("place_of_supply").default(""),
  dcDate: date("dc_date").notNull(), deliveryDate: date("delivery_date"),
  subtotal: numeric("subtotal").notNull().default("0"), cgstTotal: numeric("cgst_total").notNull().default("0"),
  sgstTotal: numeric("sgst_total").notNull().default("0"), igstTotal: numeric("igst_total").notNull().default("0"),
  grandTotal: numeric("grand_total").notNull().default("0"), discountAmount: numeric("discount_amount").notNull().default("0"),
  bankName: text("bank_name").default(""), accountNumber: text("account_number").default(""), ifscCode: text("ifsc_code").default(""), branch: text("branch").default(""),
  billedByCompanyName: text("billed_by_company_name").default(""), billedByAddress: text("billed_by_address").default(""), billedByGstin: text("billed_by_gstin").default(""), billedByContactNumber: text("billed_by_contact_number").default(""),
  notes: text("notes").default(""), status: text("status").notNull().default("Draft"),
  stockDeducted: boolean("stock_deducted").notNull().default(false), dispatchedAt: timestamp("dispatched_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const deliveryChallanItemsTable = mongoTable("delivery_challan_items", {
  id: serial("id").primaryKey(), dcId: integer("dc_id").notNull(),
  quotationId: integer("quotation_id"), piId: integer("pi_id"), itemId: integer("item_id"), productId: integer("product_id"), serviceId: integer("service_id"),
  productName: text("product_name"), description: text("description"), hsnSac: text("hsn_sac"),
  quantity: numeric("quantity").notNull().default("0"), dispatchedQty: numeric("dispatched_qty").notNull().default("0"),
  uom: text("uom").notNull().default("Nos"), rate: numeric("rate").notNull().default("0"),
  cgstPercent: numeric("cgst_percent").notNull().default("0"), sgstPercent: numeric("sgst_percent").notNull().default("0"), igstPercent: numeric("igst_percent").notNull().default("0"),
  itemType: text("item_type"), lineSource: text("line_source"), warehouseId: integer("warehouse_id"), warehouseName: text("warehouse_name"),
});

export const insertDeliveryChallanSchema = createInsertSchema(deliveryChallansTable).omit({ id: true, createdAt: true });
export const insertDeliveryChallanItemSchema = createInsertSchema(deliveryChallanItemsTable).omit({ id: true });
export type DeliveryChallan = typeof deliveryChallansTable.$inferSelect;
export type DeliveryChallanItem = typeof deliveryChallanItemsTable.$inferSelect;

export const salesInvoicesTable = mongoTable("sales_invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull(),
  rootInvoiceNumber: text("root_invoice_number").notNull().default(""),
  quotationIds: json("quotation_ids").notNull().default([]),
  piIds: json("pi_ids").notNull().default([]),
  dcIds: json("dc_ids").notNull().default([]),
  clientId: integer("client_id").notNull(), clientName: text("client_name").notNull().default(""),
  customerMobile: text("customer_mobile").default(""), customerWhatsappNumber: text("customer_whatsapp_number").default(""),
  customerCompany: text("customer_company").default(""), customerAddress: text("customer_address").default(""),
  customerGstin: text("customer_gstin").default(""), customerCountryCode: text("customer_country_code").default("91"),
  placeOfSupply: text("place_of_supply").notNull().default(""), invoiceDate: date("invoice_date").notNull(), dueDate: date("due_date"),
  subtotal: numeric("subtotal").notNull().default("0"), taxableAmount: numeric("taxable_amount").notNull().default("0"),
  cgstTotal: numeric("cgst_total").notNull().default("0"), sgstTotal: numeric("sgst_total").notNull().default("0"),
  igstTotal: numeric("igst_total").notNull().default("0"), grandTotal: numeric("grand_total").notNull().default("0"),
  discountAmount: numeric("discount_amount").notNull().default("0"), transportCharges: numeric("transport_charges").notNull().default("0"),
  amountPaid: numeric("amount_paid").notNull().default("0"), balanceDue: numeric("balance_due").notNull().default("0"),
  paymentStatus: text("payment_status").notNull().default("Unpaid"),
  bankName: text("bank_name").default(""), accountNumber: text("account_number").default(""), ifscCode: text("ifsc_code").default(""), branch: text("branch").default(""),
  billedByCompanyName: text("billed_by_company_name").default(""), billedByAddress: text("billed_by_address").default(""), billedByGstin: text("billed_by_gstin").default(""), billedByContactNumber: text("billed_by_contact_number").default(""),
  terms: text("terms").default(""), notes: text("notes").default(""), status: text("status").notNull().default("Draft"),
  sentAt: timestamp("sent_at"), customerResponseAt: timestamp("customer_response_at"), rejectionReason: text("rejection_reason"), confirmedByUserId: integer("confirmed_by_user_id"),
  versionSeries: text("version_series").notNull().default("Draft"), versionNumber: integer("version_number").notNull().default(1), versionLabel: text("version_label").notNull().default("Draft V1"),
  parentInvoiceId: integer("parent_invoice_id"), isLatestVersion: boolean("is_latest_version").notNull().default(true), isLocked: boolean("is_locked").notNull().default(false), changeRemarks: text("change_remarks"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const salesInvoiceItemsTable = mongoTable("sales_invoice_items", {
  id: serial("id").primaryKey(), invoiceId: integer("invoice_id").notNull(),
  quotationId: integer("quotation_id"), piId: integer("pi_id"), dcId: integer("dc_id"),
  itemId: integer("item_id"), productId: integer("product_id"), serviceId: integer("service_id"),
  productName: text("product_name"), description: text("description"), hsnSac: text("hsn_sac"),
  quantity: numeric("quantity").notNull().default("0"), uom: text("uom").notNull().default("Nos"), rate: numeric("rate").notNull().default("0"),
  discountPercent: numeric("discount_percent").notNull().default("0"), cgstPercent: numeric("cgst_percent").notNull().default("0"),
  sgstPercent: numeric("sgst_percent").notNull().default("0"), igstPercent: numeric("igst_percent").notNull().default("0"),
  itemType: text("item_type"), lineSource: text("line_source"), warehouseId: integer("warehouse_id"), warehouseName: text("warehouse_name"),
  attributeValues: json("attribute_values").notNull().default({}),
});

export const insertSalesInvoiceSchema = createInsertSchema(salesInvoicesTable).omit({ id: true, createdAt: true });
export const insertSalesInvoiceItemSchema = createInsertSchema(salesInvoiceItemsTable).omit({ id: true });
export type SalesInvoice = typeof salesInvoicesTable.$inferSelect;
export type SalesInvoiceItem = typeof salesInvoiceItemsTable.$inferSelect;

export const salesReturnsTable = mongoTable("sales_returns", {
  id: serial("id").primaryKey(), returnNumber: text("return_number").notNull().unique(), creditNoteNumber: text("credit_note_number"),
  invoiceId: integer("invoice_id"), dcId: integer("dc_id"), clientId: integer("client_id").notNull(), clientName: text("client_name").notNull().default(""),
  customerMobile: text("customer_mobile").default(""), customerWhatsappNumber: text("customer_whatsapp_number").default(""),
  customerCompany: text("customer_company").default(""), customerAddress: text("customer_address").default(""), customerGstin: text("customer_gstin").default(""),
  placeOfSupply: text("place_of_supply").default(""), returnDate: date("return_date").notNull(), validUntil: date("valid_until"),
  restock: boolean("restock").notNull().default(true), restocked: boolean("restocked").notNull().default(false), restockedAt: timestamp("restocked_at"),
  subtotal: numeric("subtotal").notNull().default("0"), cgstTotal: numeric("cgst_total").notNull().default("0"), sgstTotal: numeric("sgst_total").notNull().default("0"),
  igstTotal: numeric("igst_total").notNull().default("0"), grandTotal: numeric("grand_total").notNull().default("0"),
  bankName: text("bank_name").default(""), accountNumber: text("account_number").default(""), ifscCode: text("ifsc_code").default(""), branch: text("branch").default(""),
  billedByCompanyName: text("billed_by_company_name").default(""), billedByAddress: text("billed_by_address").default(""), billedByGstin: text("billed_by_gstin").default(""), billedByContactNumber: text("billed_by_contact_number").default(""),
  terms: text("terms").default(""), notes: text("notes").default(""), status: text("status").notNull().default("Draft"),
  customerResponseAt: timestamp("customer_response_at"), rejectionReason: text("rejection_reason"), createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const salesReturnItemsTable = mongoTable("sales_return_items", {
  id: serial("id").primaryKey(), returnId: integer("return_id").notNull(), invoiceItemId: integer("invoice_item_id"),
  itemId: integer("item_id"), productId: integer("product_id"), serviceId: integer("service_id"), description: text("description"), hsnSac: text("hsn_sac"),
  invoicedQty: numeric("invoiced_qty").notNull().default("0"), returnedQty: numeric("returned_qty").notNull().default("0"),
  uom: text("uom").notNull().default("Nos"), rate: numeric("rate").notNull().default("0"), discountPercent: numeric("discount_percent").notNull().default("0"),
  cgstPercent: numeric("cgst_percent").notNull().default("0"), sgstPercent: numeric("sgst_percent").notNull().default("0"), igstPercent: numeric("igst_percent").notNull().default("0"),
  itemType: text("item_type"), lineSource: text("line_source"), warehouseId: integer("warehouse_id"), warehouseName: text("warehouse_name"),
  reason: text("reason").default(""), condition: text("condition").default("Good"), attributeValues: json("attribute_values").notNull().default({}),
});

export const insertSalesReturnSchema = createInsertSchema(salesReturnsTable).omit({ id: true, createdAt: true });
export const insertSalesReturnItemSchema = createInsertSchema(salesReturnItemsTable).omit({ id: true });
export type SalesReturn = typeof salesReturnsTable.$inferSelect;
export type SalesReturnItem = typeof salesReturnItemsTable.$inferSelect;

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




