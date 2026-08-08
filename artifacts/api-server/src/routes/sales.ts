import { Router } from "express";
import { db } from "@workspace/db";
import {
  salesOrdersTable,
  locationsTable,
  usersTable,
  quotationsTable,
  quotationItemsTable,
  quotationCommunicationsTable,
  proformaInvoicesTable,
  proformaInvoiceItemsTable,
  deliveryChallansTable,
  deliveryChallanItemsTable,
  salesInvoicesTable,
  salesInvoiceItemsTable,
  salesReturnsTable,
  salesReturnItemsTable,
  contactsTable,
  materialsTable,
  servicesTable,
  inventoryTable,
  inventoryMovementsTable,
  organizationDetailsTable
} from "@workspace/db";
import { eq, desc, and } from "@workspace/db";

const router = Router();

const quotationNumericFields = ["subtotal", "taxableAmount", "cgstTotal", "sgstTotal", "igstTotal", "grandTotal", "discountAmount", "roundOff"] as const;
function serializeQuotation<T extends Record<string, any>>(row: T) {
  const result: Record<string, any> = { ...row };
  for (const field of quotationNumericFields) {
    const value = row[field];
    const parsed = Number(value?.$numberDecimal ?? value?.toString?.() ?? value ?? 0);
    result[field] = Number.isFinite(parsed) ? parsed : 0;
  }
  return result as T;
}
const quotationItemNumericFields = ["quantity", "rate", "discountPercent", "cgstPercent", "sgstPercent", "igstPercent"] as const;
function serializeQuotationItem<T extends Record<string, any>>(row: T) {
  const result: Record<string, any> = { ...row };
  for (const field of quotationItemNumericFields) {
    const value = row[field];
    const parsed = Number(value?.$numberDecimal ?? value?.toString?.() ?? value ?? 0);
    result[field] = Number.isFinite(parsed) ? parsed : 0;
  }
  return result as T;
}

const proformaNumericFields = quotationNumericFields;
function serializeProforma<T extends Record<string, any>>(row: T) {
  const result: Record<string, any> = { ...row };
  for (const field of proformaNumericFields) result[field] = Number(row[field]?.$numberDecimal ?? row[field]?.toString?.() ?? row[field] ?? 0) || 0;
  return result as T;
}
const serializeProformaItem = serializeQuotationItem;

async function saveProformaItems(piId: number, items: any[]) {
  await db.delete(proformaInvoiceItemsTable).where(eq(proformaInvoiceItemsTable.piId, piId));
  for (const item of items || []) {
    await db.insert(proformaInvoiceItemsTable).values({
      piId,
      itemId: item.itemId ?? null, productId: item.productId ?? item.itemId ?? null,
      variantId: item.variantId ?? null, serviceId: item.serviceId ?? null,
      productName: item.productName || item.description || "", variantName: item.variantName || "",
      description: item.description || item.productName || "", hsnSac: item.hsnSac || "",
      quantity: String(item.quantity ?? 0), uom: item.uom || "Nos", rate: String(item.rate ?? 0),
      discountPercent: String(item.discountPercent ?? 0), cgstPercent: String(item.cgstPercent ?? 0),
      sgstPercent: String(item.sgstPercent ?? 0), igstPercent: String(item.igstPercent ?? 0),
      itemType: item.itemType || (item.serviceId ? "Service" : "Product"),
      lineSource: item.lineSource || (item.serviceId ? "Service" : "Inventory"),
      warehouseId: item.serviceId ? null : item.warehouseId ?? null,
      warehouseName: item.serviceId ? "" : item.warehouseName || "",
      attributeValues: item.attributeValues || {},
    });
  }
}

function proformaData(payload: any) {
  return {
    quoteId: payload.quoteId ? Number(payload.quoteId) : null,
    quoteIds: Array.isArray(payload.quoteIds) ? [...new Set(payload.quoteIds.map(Number).filter((id: number) => id > 0))] : (payload.quoteId ? [Number(payload.quoteId)] : []),
    clientId: Number(payload.clientId), clientName: payload.clientName || "",
    customerMobile: payload.customerMobile || "", customerWhatsappNumber: payload.customerWhatsappNumber || payload.customerMobile || "",
    customerCompany: payload.customerCompany || "", customerAddress: payload.customerAddress || "",
    customerGstin: payload.customerGstin || "", customerCountryCode: payload.customerCountryCode || "91",
    placeOfSupply: payload.placeOfSupply || "", piDate: payload.proformaDate || payload.piDate || new Date().toISOString(),
    validUntil: payload.validUntil || null, subtotal: String(payload.subtotal ?? 0), taxableAmount: String(payload.taxableAmount ?? payload.subtotal ?? 0),
    cgstTotal: String(payload.cgstTotal ?? 0), sgstTotal: String(payload.sgstTotal ?? 0), igstTotal: String(payload.igstTotal ?? 0),
    grandTotal: String(payload.grandTotal ?? 0), discountAmount: String(payload.discountAmount ?? 0), roundOff: String(payload.roundOff ?? 0),
    terms: payload.termsAndConditions ?? payload.terms ?? "", bankName: payload.bankName || "", accountNumber: payload.accountNumber || "",
    ifscCode: payload.ifscCode || "", branch: payload.branch || "", billedByCompanyName: payload.billedByCompanyName || "",
    billedByAddress: payload.billedByAddress || "", billedByGstin: payload.billedByGstin || "",
    billedByContactNumber: payload.billedByContactNumber || "", notes: payload.notes || "",
  };
}

function challanData(payload: any) {
  return {
    quotationIds: Array.isArray(payload.quotationIds) ? payload.quotationIds.map(Number).filter(Boolean) : (payload.quoteId ? [Number(payload.quoteId)] : []),
    piIds: Array.isArray(payload.piIds) ? payload.piIds.map(Number).filter(Boolean) : (payload.piId ? [Number(payload.piId)] : []),
    clientId: Number(payload.clientId), clientName: payload.clientName || "", customerMobile: payload.customerMobile || "",
    customerWhatsappNumber: payload.customerWhatsappNumber || payload.customerMobile || "", customerCompany: payload.customerCompany || "",
    customerAddress: payload.customerAddress || "", customerGstin: payload.customerGstin || "", placeOfSupply: payload.placeOfSupply || "",
    dcDate: payload.challanDate || payload.dcDate || new Date().toISOString(), deliveryDate: payload.deliveryDate || payload.validUntil || null,
    subtotal: String(payload.subtotal ?? 0), cgstTotal: String(payload.cgstTotal ?? 0), sgstTotal: String(payload.sgstTotal ?? 0),
    igstTotal: String(payload.igstTotal ?? 0), grandTotal: String(payload.grandTotal ?? 0), discountAmount: String(payload.discountAmount ?? 0),
    bankName: payload.bankName || "", accountNumber: payload.accountNumber || "", ifscCode: payload.ifscCode || "", branch: payload.branch || "",
    billedByCompanyName: payload.billedByCompanyName || "", billedByAddress: payload.billedByAddress || "", billedByGstin: payload.billedByGstin || "",
    billedByContactNumber: payload.billedByContactNumber || "", notes: payload.notes || "",
  };
}

async function saveChallanItems(dcId: number, items: any[]) {
  await db.delete(deliveryChallanItemsTable).where(eq(deliveryChallanItemsTable.dcId, dcId));
  for (const item of items || []) await db.insert(deliveryChallanItemsTable).values({
    dcId, quotationId: item.quotationId ?? null, piId: item.piId ?? null,
    itemId: item.itemId ?? null, productId: item.productId ?? item.itemId ?? null, serviceId: item.serviceId ?? null,
    productName: item.productName || item.description || "", description: item.description || item.productName || "", hsnSac: item.hsnSac || "",
    quantity: String(item.quantity ?? 0), dispatchedQty: "0", uom: item.uom || "Nos", rate: String(item.rate ?? 0),
    cgstPercent: String(item.cgstPercent ?? 0), sgstPercent: String(item.sgstPercent ?? 0), igstPercent: String(item.igstPercent ?? 0),
    itemType: item.itemType || (item.serviceId ? "Service" : "Product"), lineSource: item.lineSource || (item.serviceId ? "Service" : "Inventory"),
    warehouseId: item.serviceId ? null : item.warehouseId ?? null, warehouseName: item.serviceId ? "" : item.warehouseName || "",
  });
}

function invoiceData(payload: any) {
  const ids = (value: any, fallback?: any) => Array.isArray(value) ? [...new Set(value.map(Number).filter((id: number) => id > 0))] : (fallback ? [Number(fallback)] : []);
  return {
    quotationIds: ids(payload.quotationIds ?? payload.quoteIds, payload.quoteId), piIds: ids(payload.piIds, payload.piId), dcIds: ids(payload.dcIds, payload.dcId),
    clientId: Number(payload.clientId), clientName: payload.clientName || "", customerMobile: payload.customerMobile || "",
    customerWhatsappNumber: payload.customerWhatsappNumber || payload.customerMobile || "", customerCompany: payload.customerCompany || "",
    customerAddress: payload.customerAddress || "", customerGstin: payload.customerGstin || "", customerCountryCode: payload.customerCountryCode || "91",
    placeOfSupply: payload.placeOfSupply || "", invoiceDate: payload.invoiceDate || new Date().toISOString(), dueDate: payload.dueDate || payload.validUntil || null,
    subtotal: String(payload.subtotal ?? 0), taxableAmount: String(payload.taxableAmount ?? payload.subtotal ?? 0), cgstTotal: String(payload.cgstTotal ?? 0),
    sgstTotal: String(payload.sgstTotal ?? 0), igstTotal: String(payload.igstTotal ?? 0), grandTotal: String(payload.grandTotal ?? 0),
    discountAmount: String(payload.discountAmount ?? 0), transportCharges: String(payload.transportCharges ?? 0), amountPaid: String(payload.amountPaid ?? 0),
    balanceDue: String(payload.balanceDue ?? payload.grandTotal ?? 0), paymentStatus: payload.paymentStatus || "Unpaid",
    bankName: payload.bankName || "", accountNumber: payload.accountNumber || "", ifscCode: payload.ifscCode || "", branch: payload.branch || "",
    billedByCompanyName: payload.billedByCompanyName || "", billedByAddress: payload.billedByAddress || "", billedByGstin: payload.billedByGstin || "",
    billedByContactNumber: payload.billedByContactNumber || "", terms: payload.termsAndConditions ?? payload.terms ?? "", notes: payload.notes || "",
  };
}

async function saveInvoiceItems(invoiceId: number, items: any[]) {
  await db.delete(salesInvoiceItemsTable).where(eq(salesInvoiceItemsTable.invoiceId, invoiceId));
  for (const item of items || []) await db.insert(salesInvoiceItemsTable).values({
    invoiceId, quotationId: item.quotationId ?? null, piId: item.piId ?? null, dcId: item.dcId ?? null,
    itemId: item.itemId ?? null, productId: item.productId ?? item.itemId ?? null, serviceId: item.serviceId ?? null,
    productName: item.productName || item.description || "", description: item.description || item.productName || "", hsnSac: item.hsnSac || "",
    quantity: String(item.quantity ?? 0), uom: item.uom || "Nos", rate: String(item.rate ?? 0), discountPercent: String(item.discountPercent ?? 0),
    cgstPercent: String(item.cgstPercent ?? 0), sgstPercent: String(item.sgstPercent ?? 0), igstPercent: String(item.igstPercent ?? 0),
    itemType: item.itemType || (item.serviceId ? "Service" : "Product"), lineSource: item.lineSource || (item.serviceId ? "Service" : "Inventory"),
    warehouseId: item.serviceId ? null : item.warehouseId ?? null, warehouseName: item.serviceId ? "" : item.warehouseName || "", attributeValues: item.attributeValues || {},
  });
}

async function invoiceWithItems(doc: any) {
  const items = await db.select().from(salesInvoiceItemsTable).where(eq(salesInvoiceItemsTable.invoiceId, doc.id));
  return { ...serializeProforma(doc), items: items.map(serializeQuotationItem) };
}


function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

function orderCode(seq: number) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `SO-${yy}${mm}-${String(seq).padStart(4, "0")}`;
}

router.get("/", requireAuth, async (req, res) => {
  const rows = await db
    .select({
      id: salesOrdersTable.id,
      orderCode: salesOrdersTable.orderCode,
      productType: salesOrdersTable.productType,
      saleType: salesOrdersTable.saleType,
      transactionDate: salesOrdersTable.transactionDate,
      qtyKg: salesOrdersTable.qtyKg,
      unit: salesOrdersTable.unit,
      buyerName: salesOrdersTable.buyerName,
      destinationLocationId: salesOrdersTable.destinationLocationId,
      fromBatchId: salesOrdersTable.fromBatchId,
      fromBatchCode: salesOrdersTable.fromBatchCode,
      qualityNote: salesOrdersTable.qualityNote,
      unitPrice: salesOrdersTable.unitPrice,
      totalValue: salesOrdersTable.totalValue,
      notes: salesOrdersTable.notes,
      createdAt: salesOrdersTable.createdAt,
      createdByName: usersTable.displayName,
    })
    .from(salesOrdersTable)
    .leftJoin(usersTable, eq(salesOrdersTable.createdByUserId, usersTable.id))
    .orderBy(desc(salesOrdersTable.transactionDate));
  return res.json(rows);
});

router.post("/", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const {
    productType, saleType, transactionDate, qtyKg, unit,
    buyerName, destinationLocationId, fromBatchId, fromBatchCode,
    qualityNote, unitPrice, totalValue, notes,
  } = req.body as any;
  const existing = await db.select().from(salesOrdersTable);
  const code = orderCode(existing.length + 1);
  const [row] = await db.insert(salesOrdersTable).values({
    orderCode: code, productType, saleType: saleType ?? "external",
    transactionDate, qtyKg: String(qtyKg), unit: unit ?? "kg",
    buyerName: buyerName ?? null,
    destinationLocationId: destinationLocationId ?? null,
    fromBatchId: fromBatchId ?? null, fromBatchCode: fromBatchCode ?? null,
    qualityNote: qualityNote ?? null,
    unitPrice: unitPrice ? String(unitPrice) : null,
    totalValue: totalValue ? String(totalValue) : null,
    notes: notes ?? null, createdByUserId: userId,
  }).returning();
  return res.status(201).json(row);
});

// --- Quotations Workflow & Versioning helpers ---

function quotationCode(seq: number) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `QT-${yy}${mm}-${String(seq).padStart(4, "0")}`;
}

function piCode(seq: number) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `PI-${yy}${mm}-${String(seq).padStart(4, "0")}`;
}

function dcCode(seq: number) {
  const now = new Date();
  return `DC-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}-${String(seq).padStart(4, "0")}`;
}

function invoiceCode(seq: number) {
  const now = new Date();
  return `INV-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}-${String(seq).padStart(4, "0")}`;
}

function returnCode(seq: number) {
  const now = new Date();
  return `SR-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}-${String(seq).padStart(4, "0")}`;
}

function resolveVersionSeries(status: string): "Draft" | "Sent" {
  return status === "Draft" ? "Draft" : "Sent";
}

function isQuotationLocked(status: string) {
  return status === "Approved" || status === "Rejected";
}

function throwIfQuotationLocked(status: string) {
  if (isQuotationLocked(status)) {
    const error = new Error("This quotation is approved or rejected and can no longer be edited or re-sent.");
    (error as any).code = "SALES_DOCUMENT_TERMINALLY_LOCKED";
    throw error;
  }
}

async function logCommunication(input: {
  quotationId: number;
  rootQuoteNumber?: string;
  versionNumber?: number;
  communicationType: string;
  message?: string;
  recipientMobile?: string;
  channel?: string;
  actorUserId?: number;
  actorName?: string;
  metadata?: any;
}) {
  await db.insert(quotationCommunicationsTable).values({
    quotationId: input.quotationId,
    rootQuoteNumber: input.rootQuoteNumber || "",
    versionNumber: input.versionNumber || 1,
    channel: input.channel || "WhatsApp",
    communicationType: input.communicationType,
    message: input.message || "",
    recipientMobile: input.recipientMobile || "",
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName || "",
    metadata: input.metadata || {},
  });
}

async function nextSeriesVersionNumber(rootQuoteNumber: string, series: "Draft" | "Sent"): Promise<number> {
  const rows = await db.select()
    .from(quotationsTable)
    .where(eq(quotationsTable.rootQuoteNumber, rootQuoteNumber));
  
  const seriesRows = rows.filter(r => resolveVersionSeries(r.status) === series);
  return seriesRows.reduce((max, r) => Math.max(max, r.versionNumber || 1), 0) + 1;
}

async function copyQuotationItems(sourceQuotationId: number, newQuoteId: number) {
  const items = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quoteId, sourceQuotationId));
  for (const item of items) {
    await db.insert(quotationItemsTable).values({
      quoteId: newQuoteId,
      quotationId: newQuoteId,
      itemId: item.itemId,
      productId: item.productId,
      variantId: item.variantId,
      serviceId: item.serviceId,
      productName: item.productName,
      variantName: item.variantName,
      description: item.description,
      hsnSac: item.hsnSac,
      quantity: item.quantity,
      uom: item.uom,
      rate: item.rate,
      discountPercent: item.discountPercent,
      cgstPercent: item.cgstPercent,
      sgstPercent: item.sgstPercent,
      igstPercent: item.igstPercent,
      itemType: item.itemType,
      lineSource: item.lineSource,
      warehouseId: item.warehouseId,
      warehouseName: item.warehouseName,
      attributeValues: item.attributeValues || {},
    });
  }
}

async function createQuotationVersion(
  sourceQuotationId: number,
  userId: number,
  options?: {
    series?: "Draft" | "Sent";
    status?: string;
    actorName?: string;
    changeRemarks?: string;
    extraFields?: any;
  }
) {
  const [source] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, sourceQuotationId)).limit(1);
  if (!source) throw new Error("Quotation not found");

  const series = options?.series || resolveVersionSeries(source.status);
  const rawStatus = options?.status || source.status;
  const preservedStatus = rawStatus === "Approved" ? (series === "Sent" ? "Sent" : "Draft") : rawStatus;
  const rootQuoteNumber = source.rootQuoteNumber || source.quotationNumber || source.quoteNumber || "";
  const nextVersion = await nextSeriesVersionNumber(rootQuoteNumber, series);
  const versionLabel = `${series} V${nextVersion}`;

  // Mark sibling versions as not latest
  await db.update(quotationsTable)
    .set({ isLatestVersion: false })
    .where(eq(quotationsTable.rootQuoteNumber, rootQuoteNumber));

  const [newQuote] = await db.insert(quotationsTable).values({
    quoteNumber: rootQuoteNumber,
    quotationNumber: rootQuoteNumber,
    rootQuoteNumber,
    clientId: source.clientId,
    clientName: source.clientName,
    customerMobile: source.customerMobile,
    customerWhatsappNumber: source.customerWhatsappNumber,
    customerCompany: source.customerCompany,
    customerAddress: source.customerAddress,
    customerGstin: source.customerGstin,
    customerCountryCode: source.customerCountryCode,
    placeOfSupply: source.placeOfSupply,
    validityDays: source.validityDays,
    quotationDate: source.quotationDate,
    validUntil: source.validUntil,
    subtotal: source.subtotal,
    taxableAmount: source.taxableAmount,
    cgstTotal: source.cgstTotal,
    sgstTotal: source.sgstTotal,
    igstTotal: source.igstTotal,
    grandTotal: source.grandTotal,
    discountAmount: source.discountAmount,
    roundOff: source.roundOff,
    terms: source.terms,
    bankName: source.bankName,
    accountNumber: source.accountNumber,
    ifscCode: source.ifscCode,
    branch: source.branch,
    billedByCompanyName: source.billedByCompanyName,
    billedByAddress: source.billedByAddress,
    billedByGstin: source.billedByGstin,
    billedByContactNumber: source.billedByContactNumber,
    notes: source.notes,
    status: preservedStatus,
    versionSeries: series,
    versionNumber: nextVersion,
    versionLabel,
    parentQuoteId: sourceQuotationId,
    isLatestVersion: true,
    isLocked: false,
    changeRemarks: options?.changeRemarks || "",
    ...(options?.extraFields || {}),
  }).returning();

  await copyQuotationItems(sourceQuotationId, newQuote.id);

  await logCommunication({
    quotationId: newQuote.id,
    rootQuoteNumber,
    versionNumber: nextVersion,
    communicationType: "Version Created",
    message: options?.changeRemarks || `Created ${versionLabel}`,
    actorUserId: userId,
    actorName: options?.actorName,
    metadata: { versionSeries: series, versionLabel },
  });

  return newQuote;
}

async function resolveQuotationPatchTarget(
  existing: any,
  userId: number,
  options?: { actorName?: string; changeRemarks?: string; skipVersionFork?: boolean }
) {
  throwIfQuotationLocked(existing.status);

  if (options?.skipVersionFork) {
    return { targetId: Number(existing.id), forked: false, quotation: existing };
  }

  const newQuote = await createQuotationVersion(Number(existing.id), userId, {
    series: "Draft",
    status: "Draft",
    actorName: options?.actorName,
    changeRemarks: options?.changeRemarks || "Saved Draft version",
  });
  return { targetId: Number(newQuote.id), forked: true, quotation: newQuote };
}

// --- Endpoints for Quotations ---

router.get("/quotations", requireAuth, async (req, res) => {
  const forMapping = req.query.forMapping === "1";
  let query = db.select().from(quotationsTable);
  
  if (!forMapping) {
    // Only return the latest version of each quotation
    const rows = await db.select().from(quotationsTable).where(eq(quotationsTable.isLatestVersion, true)).orderBy(desc(quotationsTable.createdAt));
    return res.json(rows.map(serializeQuotation));
  } else {
    const rows = await db.select().from(quotationsTable).orderBy(desc(quotationsTable.createdAt));
    return res.json(rows.map(serializeQuotation));
  }
});

router.post("/quotations", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const payload = req.body || {};
  const { items = [], ...docData } = payload;

  const existingCount = (await db.select().from(quotationsTable)).length;
  const qNumber = quotationCode(existingCount + 1);

  const [doc] = await db.insert(quotationsTable).values({
    quoteNumber: qNumber,
    quotationNumber: qNumber,
    rootQuoteNumber: qNumber,
    clientId: payload.clientId,
    clientName: payload.clientName || "",
    customerMobile: payload.customerMobile || "",
    customerWhatsappNumber: payload.customerWhatsappNumber || "",
    customerCompany: payload.customerCompany || "",
    customerAddress: payload.customerAddress || "",
    customerGstin: payload.customerGstin || "",
    customerCountryCode: payload.customerCountryCode || "91",
    placeOfSupply: payload.placeOfSupply || "",
    validityDays: payload.validityDays || 30,
    quotationDate: payload.quotationDate || new Date().toISOString(),
    validUntil: payload.validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    subtotal: String(payload.subtotal || 0),
    taxableAmount: String(payload.taxableAmount || 0),
    cgstTotal: String(payload.cgstTotal || 0),
    sgstTotal: String(payload.sgstTotal || 0),
    igstTotal: String(payload.igstTotal || 0),
    grandTotal: String(payload.grandTotal || 0),
    discountAmount: String(payload.discountAmount || 0),
    roundOff: String(payload.roundOff || 0),
    terms: payload.terms || "",
    bankName: payload.bankName || "",
    accountNumber: payload.accountNumber || "",
    ifscCode: payload.ifscCode || "",
    branch: payload.branch || "",
    billedByCompanyName: payload.billedByCompanyName || "",
    billedByAddress: payload.billedByAddress || "",
    billedByGstin: payload.billedByGstin || "",
    billedByContactNumber: payload.billedByContactNumber || "",
    notes: payload.notes || "",
    status: "Draft",
    versionSeries: "Draft",
    versionNumber: 1,
    versionLabel: "Draft V1",
    isLatestVersion: true,
    isLocked: false,
    changeRemarks: "Initial draft",
  }).returning();

  if (Array.isArray(items) && items.length > 0) {
    for (const item of items) {
      await db.insert(quotationItemsTable).values({
        quoteId: doc.id,
        quotationId: doc.id,
        itemId: item.itemId ?? null,
        productId: item.productId ?? null,
        variantId: item.variantId ?? null,
        serviceId: item.serviceId ?? null,
        productName: item.productName ?? null,
        variantName: item.variantName ?? null,
        description: item.description || "",
        hsnSac: item.hsnSac || "",
        quantity: String(item.quantity || item.qty || 0),
        uom: item.uom || "Nos",
        rate: String(item.rate || 0),
        discountPercent: String(item.discountPercent || 0),
        cgstPercent: String(item.cgstPercent || item.cgst || 0),
        sgstPercent: String(item.sgstPercent || item.sgst || 0),
        igstPercent: String(item.igstPercent || item.igst || 0),
        itemType: item.itemType || "Product",
        lineSource: item.lineSource || "Catalog",
        warehouseId: item.warehouseId ?? null,
        warehouseName: item.warehouseName || "",
        attributeValues: item.attributeValues || {},
      });
    }
  }

  const savedItems = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quoteId, doc.id));
  return res.status(201).json({ ...serializeQuotation(doc), items: savedItems.map(serializeQuotationItem) });
});

router.get("/quotations/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [doc] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id)).limit(1);
  if (!doc) return res.status(404).json({ error: "Quotation not found" });

  const items = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quoteId, id));
  return res.json({ ...serializeQuotation(doc), items: items.map(serializeQuotationItem) });
});

router.patch("/quotations/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = (req.session as any).userId;
  
  const [existing] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Quotation not found" });

  try {
    const { targetId, forked, quotation } = await resolveQuotationPatchTarget(existing, userId, {
      changeRemarks: req.body.changeRemarks,
      skipVersionFork: req.body.skipVersionFork,
    });

    const updates: any = {};
    const fields = [
      "clientId", "clientName", "customerMobile", "customerWhatsappNumber", "customerCompany",
      "customerAddress", "customerGstin", "customerCountryCode", "placeOfSupply",
      "validityDays", "quotationDate", "validUntil", "subtotal", "taxableAmount",
      "cgstTotal", "sgstTotal", "igstTotal", "grandTotal", "discountAmount", "roundOff",
      "terms", "bankName", "accountNumber", "ifscCode", "branch", "billedByCompanyName",
      "billedByAddress", "billedByGstin", "billedByContactNumber", "notes", "status"
    ];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates[f] = typeof req.body[f] === "number" || typeof req.body[f] === "boolean" ? req.body[f] : String(req.body[f]);
      }
    }

    updates.updatedAt = new Date();

    const [updated] = await db.update(quotationsTable)
      .set(updates)
      .where(eq(quotationsTable.id, targetId))
      .returning();

    const items = req.body.items;
    if (Array.isArray(items) && items.length > 0) {
      await db.delete(quotationItemsTable).where(eq(quotationItemsTable.quoteId, targetId));
      for (const item of items) {
        await db.insert(quotationItemsTable).values({
          quoteId: targetId,
          quotationId: targetId,
          itemId: item.itemId ?? null,
          productId: item.productId ?? null,
          variantId: item.variantId ?? null,
          serviceId: item.serviceId ?? null,
          productName: item.productName ?? null,
          variantName: item.variantName ?? null,
          description: item.description || "",
          hsnSac: item.hsnSac || "",
          quantity: String(item.quantity || item.qty || 0),
          uom: item.uom || "Nos",
          rate: String(item.rate || 0),
          discountPercent: String(item.discountPercent || 0),
          cgstPercent: String(item.cgstPercent || item.cgst || 0),
          sgstPercent: String(item.sgstPercent || item.sgst || 0),
          igstPercent: String(item.igstPercent || item.igst || 0),
          itemType: item.itemType || "Product",
          lineSource: item.lineSource || "Catalog",
          warehouseId: item.warehouseId ?? null,
          warehouseName: item.warehouseName || "",
          attributeValues: item.attributeValues || {},
        });
      }
    }

    const savedItems = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quoteId, targetId));
    return res.json({ ...serializeQuotation(updated), items: savedItems.map(serializeQuotationItem) });
  } catch (err: any) {
    if (err.code === "SALES_DOCUMENT_TERMINALLY_LOCKED") {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/quotations/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [document] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id)).limit(1);
  if (!document) return res.status(404).json({ error: "Quotation not found" });
  const siblings = await db.select().from(quotationsTable).where(eq(quotationsTable.rootQuoteNumber, document.rootQuoteNumber));
  for (const sibling of siblings) {
    await db.delete(quotationItemsTable).where(eq(quotationItemsTable.quoteId, sibling.id));
    await db.delete(quotationCommunicationsTable).where(eq(quotationCommunicationsTable.quotationId, sibling.id));
    await db.delete(quotationsTable).where(eq(quotationsTable.id, sibling.id));
  }
  return res.status(204).send();
});

router.get("/quotations/:id/versions", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [doc] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id)).limit(1);
  if (!doc) return res.status(404).json({ error: "Quotation not found" });

  const rows = await db.select().from(quotationsTable)
    .where(eq(quotationsTable.rootQuoteNumber, doc.rootQuoteNumber))
    .orderBy(desc(quotationsTable.createdAt));
  
  return res.json({ data: rows.map(serializeQuotation) });
});

router.get("/quotations/:id/communications", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [doc] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id)).limit(1);
  if (!doc) return res.status(404).json({ error: "Quotation not found" });

  const rows = await db.select().from(quotationCommunicationsTable)
    .where(eq(quotationCommunicationsTable.rootQuoteNumber, doc.rootQuoteNumber))
    .orderBy(desc(quotationCommunicationsTable.createdAt));
  
  return res.json({ data: rows });
});

router.get("/quotations/:id/contact-details", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [doc] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id)).limit(1);
  if (!doc) return res.status(404).json({ error: "Quotation not found" });

  const contacts = await db.select().from(contactsTable).where(eq(contactsTable.id, doc.clientId)).limit(1);
  const contact = contacts[0];
  if (!contact) {
    return res.json({
      customerName: doc.clientName,
      mobile: doc.customerMobile || "",
      countryCode: doc.customerCountryCode || "91",
      alternateMobile: "",
    });
  }
  return res.json({
    customerName: contact.name,
    mobile: contact.phone || "",
    countryCode: "91",
    alternateMobile: contact.whatsappNumber || "",
    whatsappNumber: contact.whatsappNumber || "",
    gstin: contact.gstin || "",
    company: contact.company || "",
    address: contact.address || "",
  });
});

router.post("/quotations/:id/send", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = (req.session as any).userId;
  
  const [existing] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Quotation not found" });

  try {
    throwIfQuotationLocked(existing.status);

    const mobile = String(req.body.mobile || "").replace(/\D/g, "").slice(-10);
    if (mobile.length !== 10) return res.status(400).json({ error: "Valid 10-digit mobile number is required" });

    const currentSeries = resolveVersionSeries(existing.status);
    const rootQuoteNumber = existing.rootQuoteNumber || existing.quotationNumber || existing.quoteNumber;

    const extraFields = {
      status: "Sent",
      isLocked: false,
      sentAt: new Date(),
      customerMobile: mobile,
      customerCountryCode: String(req.body.countryCode || "91").replace(/\D/g, ""),
      customerResponseAt: null,
      confirmedByUserId: null,
      clientId: req.body.clientId ?? existing.clientId,
      clientName: req.body.clientName ?? existing.clientName,
      customerWhatsappNumber: req.body.customerWhatsappNumber ?? existing.customerWhatsappNumber,
      customerCompany: req.body.customerCompany ?? existing.customerCompany,
      customerAddress: req.body.customerAddress ?? existing.customerAddress,
      customerGstin: req.body.customerGstin ?? existing.customerGstin,
      placeOfSupply: req.body.placeOfSupply ?? existing.placeOfSupply,
      quotationDate: req.body.quotationDate ?? existing.quotationDate,
      validUntil: req.body.validUntil ?? existing.validUntil,
      subtotal: String(req.body.subtotal ?? existing.subtotal),
      taxableAmount: String(req.body.taxableAmount ?? existing.taxableAmount),
      cgstTotal: String(req.body.cgstTotal ?? existing.cgstTotal),
      sgstTotal: String(req.body.sgstTotal ?? existing.sgstTotal),
      igstTotal: String(req.body.igstTotal ?? existing.igstTotal),
      grandTotal: String(req.body.grandTotal ?? existing.grandTotal),
      discountAmount: String(req.body.discountAmount ?? existing.discountAmount),
      terms: req.body.terms ?? existing.terms,
      bankName: req.body.bankName ?? existing.bankName,
      accountNumber: req.body.accountNumber ?? existing.accountNumber,
      ifscCode: req.body.ifscCode ?? existing.ifscCode,
      branch: req.body.branch ?? existing.branch,
      billedByCompanyName: req.body.billedByCompanyName ?? existing.billedByCompanyName,
      billedByAddress: req.body.billedByAddress ?? existing.billedByAddress,
      billedByGstin: req.body.billedByGstin ?? existing.billedByGstin,
      billedByContactNumber: req.body.billedByContactNumber ?? existing.billedByContactNumber,
    };

    const newQuote = await createQuotationVersion(id, userId, {
      series: "Sent",
      status: "Sent",
      changeRemarks: currentSeries === "Draft" ? "First send to client — Sent V1" : "Re-sent to client",
      extraFields,
    });

    // Replace items if provided
    const items = req.body.items;
    if (Array.isArray(items) && items.length > 0) {
      await db.delete(quotationItemsTable).where(eq(quotationItemsTable.quoteId, newQuote.id));
      for (const item of items) {
        await db.insert(quotationItemsTable).values({
          quoteId: newQuote.id,
          quotationId: newQuote.id,
          itemId: item.itemId ?? null,
          productId: item.productId ?? null,
          variantId: item.variantId ?? null,
          serviceId: item.serviceId ?? null,
          productName: item.productName ?? null,
          variantName: item.variantName ?? null,
          description: item.description || "",
          hsnSac: item.hsnSac || "",
          quantity: String(item.quantity || item.qty || 0),
          uom: item.uom || "Nos",
          rate: String(item.rate || 0),
          discountPercent: String(item.discountPercent || 0),
          cgstPercent: String(item.cgstPercent || item.cgst || 0),
          sgstPercent: String(item.sgstPercent || item.sgst || 0),
          igstPercent: String(item.igstPercent || item.igst || 0),
          itemType: item.itemType || "Product",
          lineSource: item.lineSource || "Catalog",
          warehouseId: item.warehouseId ?? null,
          warehouseName: item.warehouseName || "",
          attributeValues: item.attributeValues || {},
        });
      }
    }

    await logCommunication({
      quotationId: newQuote.id,
      rootQuoteNumber,
      versionNumber: newQuote.versionNumber,
      communicationType: "Quotation Sent",
      message: req.body.customMessage || "",
      recipientMobile: mobile,
      channel: "WhatsApp",
      actorUserId: userId,
      actorName: "",
      metadata: {
        messageTemplate: req.body.messageTemplate || "normal",
        versionLabel: newQuote.versionLabel,
        versionSeries: "Sent",
      },
    });

    const savedItems = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quoteId, newQuote.id));
    return res.json({ ...serializeQuotation(newQuote), items: savedItems.map(serializeQuotationItem) });
  } catch (err: any) {
    if (err.code === "SALES_DOCUMENT_TERMINALLY_LOCKED") {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: err.message });
  }
});

router.post("/quotations/:id/customer-response", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = (req.session as any).userId;
  const { action, reason, notes } = req.body || {};

  if (!["confirm", "reject", "call", "message", "negotiation"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  const [existing] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Quotation not found" });

  try {
    let nextStatus = existing.status;
    let rejectionReason = existing.rejectionReason;

    if (action === "confirm") {
      if (existing.status !== "Sent") {
        return res.status(400).json({ error: "Customer confirmation is only allowed for sent quotations" });
      }
      nextStatus = "Approved";
    } else if (action === "reject") {
      if (existing.status !== "Sent") {
        return res.status(400).json({ error: "Customer rejection is only allowed for sent quotations" });
      }
      nextStatus = "Rejected";
      rejectionReason = String(reason || notes || "").trim();
      if (!rejectionReason) return res.status(400).json({ error: "Rejection reason is required" });
    }

    const updates: any = {
      status: nextStatus,
      updatedAt: new Date(),
    };

    if (action === "confirm" || action === "reject") {
      updates.customerResponseAt = new Date();
      updates.confirmedByUserId = userId;
    }
    if (action === "reject") {
      updates.rejectionReason = rejectionReason;
    }

    const [updated] = await db.update(quotationsTable)
      .set(updates)
      .where(eq(quotationsTable.id, id))
      .returning();

    const communicationTypeMap: Record<string, string> = {
      confirm: "Customer Confirmed",
      reject: "Customer Rejected",
      call: "Call Initiated",
      message: "Manual Message",
      negotiation: "Negotiation Started",
    };

    await logCommunication({
      quotationId: id,
      rootQuoteNumber: existing.rootQuoteNumber,
      versionNumber: existing.versionNumber,
      communicationType: communicationTypeMap[action] || "Customer Response",
      message: notes || reason || "",
      channel: action === "call" ? "Phone" : action === "message" ? "Manual" : "Internal",
      actorUserId: userId,
    });

    // A confirmed quotation must not appear as a Proforma until the user
    // explicitly creates/maps one from the Proforma Invoice screen.
    let autoCreatedProforma = null;
    if (action === "confirm" && req.body?.createProforma === true) {
      const [alreadyCreated] = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.autoCreatedFromQuotationId, id)).limit(1);
      if (alreadyCreated) {
        const piItems = await db.select().from(proformaInvoiceItemsTable).where(eq(proformaInvoiceItemsTable.piId, alreadyCreated.id));
        autoCreatedProforma = { ...serializeProforma(alreadyCreated), items: piItems.map(serializeProformaItem) };
      } else {
      const existingPiCount = (await db.select().from(proformaInvoicesTable)).length;
      const piNumber = piCode(existingPiCount + 1);

      const [proforma] = await db.insert(proformaInvoicesTable).values({
        piNumber,
        rootPiNumber: piNumber,
        quoteId: id,
        quoteIds: [id],
        clientId: existing.clientId,
        clientName: existing.clientName,
        customerMobile: existing.customerMobile,
        customerWhatsappNumber: existing.customerWhatsappNumber,
        customerCompany: existing.customerCompany,
        customerAddress: existing.customerAddress,
        customerGstin: existing.customerGstin,
        customerCountryCode: existing.customerCountryCode,
        placeOfSupply: existing.placeOfSupply,
        piDate: new Date().toISOString(),
        subtotal: existing.subtotal,
        taxableAmount: existing.taxableAmount,
        cgstTotal: existing.cgstTotal,
        sgstTotal: existing.sgstTotal,
        igstTotal: existing.igstTotal,
        grandTotal: existing.grandTotal,
        discountAmount: existing.discountAmount,
        roundOff: existing.roundOff,
        terms: existing.terms,
        bankName: existing.bankName,
        accountNumber: existing.accountNumber,
        ifscCode: existing.ifscCode,
        branch: existing.branch,
        billedByCompanyName: existing.billedByCompanyName,
        billedByAddress: existing.billedByAddress,
        billedByGstin: existing.billedByGstin,
        billedByContactNumber: existing.billedByContactNumber,
        notes: existing.notes,
        status: "Draft",
        versionSeries: "Draft",
        versionNumber: 1,
        versionLabel: "Draft V1",
        isLatestVersion: true,
        isLocked: false,
        autoCreatedFromQuotationId: id,
      }).returning();

      const items = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quoteId, id));
      for (const item of items) {
        await db.insert(proformaInvoiceItemsTable).values({
          piId: proforma.id,
          itemId: item.itemId,
          productId: item.productId,
          variantId: item.variantId,
          serviceId: item.serviceId,
          productName: item.productName,
          variantName: item.variantName,
          description: item.description,
          hsnSac: item.hsnSac,
          quantity: item.quantity,
          uom: item.uom,
          rate: item.rate,
          discountPercent: item.discountPercent,
          cgstPercent: item.cgstPercent,
          sgstPercent: item.sgstPercent,
          igstPercent: item.igstPercent,
          itemType: item.itemType,
          lineSource: item.lineSource,
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          attributeValues: item.attributeValues || {},
        });
      }

      const piItems = await db.select().from(proformaInvoiceItemsTable).where(eq(proformaInvoiceItemsTable.piId, proforma.id));
      autoCreatedProforma = { ...proforma, items: piItems };
      }
    }

    const savedItems = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quoteId, id));
    return res.json({
      ...updated,
      items: savedItems.map(serializeQuotationItem),
      autoCreatedProforma,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/quotations/:id/restore", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const userId = (req.session as any).userId;

  const [source] = await db.select().from(quotationsTable).where(eq(quotationsTable.id, id)).limit(1);
  if (!source) return res.status(404).json({ error: "Quotation not found" });

  try {
    throwIfQuotationLocked(source.status);

    const newQuote = await createQuotationVersion(id, userId, {
      series: "Draft",
      status: "Draft",
      changeRemarks: `Restored from ${source.versionLabel}`,
    });

    const savedItems = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quoteId, newQuote.id));
    return res.status(201).json({ ...serializeQuotation(newQuote), items: savedItems.map(serializeQuotationItem) });
  } catch (err: any) {
    if (err.code === "SALES_DOCUMENT_TERMINALLY_LOCKED") {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: err.message });
  }
});

router.get("/approved-quotations", requireAuth, async (_req, res) => {
  const [quotes, proformas, inventory] = await Promise.all([
    db.select().from(quotationsTable), db.select().from(proformaInvoicesTable), db.select().from(inventoryTable),
  ]);
  const stock = new Map<number, number>();
  for (const row of inventory) {
    const quantity = Number((row.quantityOnHand as any)?.$numberDecimal ?? (row.quantityOnHand as any)?.toString?.() ?? row.quantityOnHand ?? 0) || 0;
    stock.set(Number(row.materialId), (stock.get(Number(row.materialId)) || 0) + quantity);
  }
  const result: any[] = [];
  const append = async (doc: any, source: "Quotation" | "Proforma Invoice") => {
    const items = source === "Quotation"
      ? await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quoteId, doc.id))
      : await db.select().from(proformaInvoiceItemsTable).where(eq(proformaInvoiceItemsTable.piId, doc.id));
    const serializedItems = items.map(serializeQuotationItem);
    const insufficientItems = serializedItems.filter((item: any) => !item.serviceId && item.itemId && (stock.get(Number(item.itemId)) || 0) < Number(item.quantity || 0)).map((item: any) => ({ itemId: item.itemId, description: item.description || item.productName, required: Number(item.quantity || 0), available: stock.get(Number(item.itemId)) || 0 }));
    result.push({
      ...serializeProforma(doc), source,
      documentNumber: source === "Quotation" ? doc.rootQuoteNumber || doc.quotationNumber || doc.quoteNumber : doc.rootPiNumber || doc.piNumber,
      customerApprovedAt: doc.customerResponseAt,
      versionNumber: Number(doc.versionNumber || 1),
      versionLabel: doc.versionLabel || `${doc.versionSeries || "Sent"} V${Number(doc.versionNumber || 1)}`,
      items: serializedItems,
      insufficientItems: insufficientItems.length ? insufficientItems : undefined,
    });
  };
  for (const doc of quotes.filter(row => row.isLatestVersion !== false && row.status === "Approved" && row.customerResponseAt)) await append(doc, "Quotation");
  for (const doc of proformas.filter(row => row.isLatestVersion !== false && row.status === "Approved" && row.customerResponseAt && !row.autoCreatedFromQuotationId)) await append(doc, "Proforma Invoice");
  result.sort((left, right) => new Date(right.customerApprovedAt || 0).getTime() - new Date(left.customerApprovedAt || 0).getTime());
  return res.json({ data: result });
});

// --- Proforma Invoice mapping, revisions and customer workflow ---
router.get("/proforma-invoices", requireAuth, async (req, res) => {
  const rows = await db.select().from(proformaInvoicesTable).orderBy(desc(proformaInvoicesTable.createdAt));
  return res.json(rows
    .filter(row => row.isLatestVersion !== false && !row.autoCreatedFromQuotationId)
    .map(serializeProforma));
});

router.post("/proforma-invoices", requireAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.clientId) return res.status(400).json({ error: "Client is required" });
    const count = (await db.select().from(proformaInvoicesTable)).length;
    const piNumber = piCode(count + 1);
    const [doc] = await db.insert(proformaInvoicesTable).values({
      piNumber, rootPiNumber: piNumber, ...proformaData(payload), status: "Draft",
      versionSeries: "Draft", versionNumber: 1, versionLabel: "Draft V1", isLatestVersion: true, isLocked: false,
    }).returning();
    await saveProformaItems(Number(doc.id), payload.items || []);
    const items = await db.select().from(proformaInvoiceItemsTable).where(eq(proformaInvoiceItemsTable.piId, doc.id));
    return res.status(201).json({ ...serializeProforma(doc), items: items.map(serializeProformaItem) });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.get("/proforma-invoices/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [doc] = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.id, id)).limit(1);
  if (!doc) return res.status(404).json({ error: "Proforma invoice not found" });
  const items = await db.select().from(proformaInvoiceItemsTable).where(eq(proformaInvoiceItemsTable.piId, id));
  return res.json({ ...serializeProforma(doc), items: items.map(serializeProformaItem) });
});

router.get("/proforma-invoices/:id/versions", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [doc] = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.id, id)).limit(1);
  if (!doc) return res.status(404).json({ error: "Proforma invoice not found" });
  let rows = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.rootPiNumber, doc.rootPiNumber || doc.piNumber)).orderBy(desc(proformaInvoicesTable.createdAt));
  if (!rows.length) rows = [doc];
  return res.json({ data: rows.map(serializeProforma) });
});

router.patch("/proforma-invoices/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id); const payload = req.body || {};
    const [source] = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.id, id)).limit(1);
    if (!source) return res.status(404).json({ error: "Proforma invoice not found" });
    if (["Approved", "Rejected"].includes(source.status)) return res.status(409).json({ error: "Approved or rejected Proforma invoices are locked" });
    const root = source.rootPiNumber || source.piNumber;
    let siblings = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.rootPiNumber, root));
    if (!siblings.length) siblings = [source];
    const next = Math.max(0, ...siblings.filter(row => row.versionSeries === "Draft").map(row => Number(row.versionNumber || 0))) + 1;
    await db.update(proformaInvoicesTable).set({ isLatestVersion: false }).where(eq(proformaInvoicesTable.rootPiNumber, root));
    await db.update(proformaInvoicesTable).set({ isLatestVersion: false }).where(eq(proformaInvoicesTable.id, source.id));
    const [doc] = await db.insert(proformaInvoicesTable).values({
      piNumber: root, rootPiNumber: root, ...proformaData({ ...source, ...payload }), status: "Draft",
      versionSeries: "Draft", versionNumber: next, versionLabel: `Draft V${next}`,
      parentPiId: source.id, isLatestVersion: true, isLocked: false,
      autoCreatedFromQuotationId: source.autoCreatedFromQuotationId,
    }).returning();
    await saveProformaItems(Number(doc.id), payload.items || await db.select().from(proformaInvoiceItemsTable).where(eq(proformaInvoiceItemsTable.piId, id)));
    const items = await db.select().from(proformaInvoiceItemsTable).where(eq(proformaInvoiceItemsTable.piId, doc.id));
    return res.json({ ...serializeProforma(doc), items: items.map(serializeProformaItem) });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.post("/proforma-invoices/:id/send", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id); const payload = req.body || {};
    const [source] = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.id, id)).limit(1);
    if (!source) return res.status(404).json({ error: "Proforma invoice not found" });
    if (["Approved", "Rejected"].includes(source.status)) return res.status(409).json({ error: "Approved or rejected Proforma invoices are locked" });
    const root = source.rootPiNumber || source.piNumber;
    let siblings = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.rootPiNumber, root));
    if (!siblings.length) siblings = [source];
    const next = Math.max(0, ...siblings.filter(row => row.versionSeries === "Sent").map(row => Number(row.versionNumber || 0))) + 1;
    await db.update(proformaInvoicesTable).set({ isLatestVersion: false }).where(eq(proformaInvoicesTable.rootPiNumber, root));
    await db.update(proformaInvoicesTable).set({ isLatestVersion: false }).where(eq(proformaInvoicesTable.id, source.id));
    const [doc] = await db.insert(proformaInvoicesTable).values({
      piNumber: root, rootPiNumber: root, ...proformaData({ ...source, ...payload }), status: "Sent", sentAt: new Date(),
      versionSeries: "Sent", versionNumber: next, versionLabel: `Sent V${next}`,
      parentPiId: source.id, isLatestVersion: true, isLocked: false,
      autoCreatedFromQuotationId: source.autoCreatedFromQuotationId,
    }).returning();
    await saveProformaItems(Number(doc.id), payload.items || await db.select().from(proformaInvoiceItemsTable).where(eq(proformaInvoiceItemsTable.piId, id)));
    const items = await db.select().from(proformaInvoiceItemsTable).where(eq(proformaInvoiceItemsTable.piId, doc.id));
    return res.json({ ...serializeProforma(doc), items: items.map(serializeProformaItem) });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.post("/proforma-invoices/:id/customer-response", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const action = String(req.body?.action || "");
  const [doc] = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.id, id)).limit(1);
  if (!doc) return res.status(404).json({ error: "Proforma invoice not found" });
  if (doc.autoCreatedFromQuotationId) return res.status(409).json({ error: "Customer approval was already recorded on the source quotation" });
  if (doc.status !== "Sent") return res.status(400).json({ error: "Customer response is only available after sending" });
  if (!["confirm", "reject"].includes(action)) return res.status(400).json({ error: "Invalid customer response" });
  const status = action === "confirm" ? "Approved" : "Rejected";
  const [updated] = await db.update(proformaInvoicesTable).set({ status, isLocked: true, customerResponseAt: new Date(), confirmedByUserId: (req.session as any).userId, rejectionReason: req.body?.reason || "" }).where(eq(proformaInvoicesTable.id, id)).returning();
  return res.json(serializeProforma(updated));
});

router.delete("/proforma-invoices/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [doc] = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.id, id)).limit(1);
  if (!doc) return res.status(404).json({ error: "Proforma invoice not found" });
  let siblings = await db.select().from(proformaInvoicesTable).where(eq(proformaInvoicesTable.rootPiNumber, doc.rootPiNumber || doc.piNumber));
  if (!siblings.length) siblings = [doc];
  for (const sibling of siblings) { await db.delete(proformaInvoiceItemsTable).where(eq(proformaInvoiceItemsTable.piId, sibling.id)); await db.delete(proformaInvoicesTable).where(eq(proformaInvoicesTable.id, sibling.id)); }
  return res.status(204).send();
});

// --- Delivery Challans and warehouse dispatch automation ---
router.get("/challans", requireAuth, async (_req, res) => {
  const rows = await db.select().from(deliveryChallansTable).orderBy(desc(deliveryChallansTable.createdAt));
  return res.json(rows.map(serializeProforma));
});

router.post("/challans", requireAuth, async (req, res) => {
  try {
    if (!req.body?.clientId) return res.status(400).json({ error: "Client is required" });
    const dcNumber = dcCode((await db.select().from(deliveryChallansTable)).length + 1);
    const [doc] = await db.insert(deliveryChallansTable).values({ dcNumber, ...challanData(req.body), status: "Draft", stockDeducted: false }).returning();
    await saveChallanItems(Number(doc.id), req.body.items || []);
    const items = await db.select().from(deliveryChallanItemsTable).where(eq(deliveryChallanItemsTable.dcId, doc.id));
    return res.status(201).json({ ...serializeProforma(doc), items: items.map(serializeQuotationItem) });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.get("/challans/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [doc] = await db.select().from(deliveryChallansTable).where(eq(deliveryChallansTable.id, id)).limit(1);
  if (!doc) return res.status(404).json({ error: "Delivery challan not found" });
  const items = await db.select().from(deliveryChallanItemsTable).where(eq(deliveryChallanItemsTable.dcId, id));
  return res.json({ ...serializeProforma(doc), items: items.map(serializeQuotationItem) });
});

router.patch("/challans/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(deliveryChallansTable).where(eq(deliveryChallansTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Delivery challan not found" });
    if (existing.status === "Dispatched") return res.status(409).json({ error: "Dispatched delivery challans are locked. Create a Sales Return to reverse stock." });
    const [doc] = await db.update(deliveryChallansTable).set({ ...challanData({ ...existing, ...req.body }), status: "Draft" }).where(eq(deliveryChallansTable.id, id)).returning();
    if (Array.isArray(req.body.items)) await saveChallanItems(id, req.body.items);
    const items = await db.select().from(deliveryChallanItemsTable).where(eq(deliveryChallanItemsTable.dcId, id));
    return res.json({ ...serializeProforma(doc), items: items.map(serializeQuotationItem) });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.post("/challans/:id/send", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const userId = (req.session as any).userId;
  try {
    let [doc] = await db.select().from(deliveryChallansTable).where(eq(deliveryChallansTable.id, id)).limit(1);
    if (!doc) return res.status(404).json({ error: "Delivery challan not found" });
    if (doc.stockDeducted || doc.status === "Dispatched") {
      const existingItems = await db.select().from(deliveryChallanItemsTable).where(eq(deliveryChallanItemsTable.dcId, id));
      return res.json({ ...serializeProforma(doc), items: existingItems.map(serializeQuotationItem) });
    }
    if (Array.isArray(req.body.items)) {
      [doc] = await db.update(deliveryChallansTable).set(challanData({ ...doc, ...req.body })).where(eq(deliveryChallansTable.id, id)).returning();
      await saveChallanItems(id, req.body.items);
    }
    const items = await db.select().from(deliveryChallanItemsTable).where(eq(deliveryChallanItemsTable.dcId, id));
    const deductions: Array<{ item: any; inventory: any; quantity: number }> = [];
    for (const item of items) {
      if (item.serviceId || String(item.itemType).toLowerCase() === "service") continue;
      const materialId = Number(item.itemId || item.productId); const warehouseId = Number(item.warehouseId); const quantity = Number(item.quantity || 0);
      if (!materialId || !warehouseId) throw new Error(`Warehouse is required for ${item.description || item.productName}`);
      if (!(quantity > 0)) throw new Error(`Dispatch quantity must be greater than zero for ${item.description || item.productName}`);
      const [inventory] = await db.select().from(inventoryTable).where(and(eq(inventoryTable.materialId, materialId), eq(inventoryTable.locationId, warehouseId))).limit(1);
      const available = Number(inventory?.quantityOnHand || 0);
      if (!inventory || available < quantity) throw new Error(`Insufficient stock for ${item.description || item.productName} in ${item.warehouseName || `warehouse #${warehouseId}`}. Available ${available}, requested ${quantity}.`);
      deductions.push({ item, inventory, quantity });
    }
    const completed: Array<{ entry: typeof deductions[number]; movementId: number }> = [];
    try {
      for (const entry of deductions) {
        await db.update(inventoryTable).set({ quantityOnHand: String(Number(entry.inventory.quantityOnHand) - entry.quantity), lastUpdated: new Date() }).where(eq(inventoryTable.id, entry.inventory.id));
        try {
          const [movement] = await db.insert(inventoryMovementsTable).values({ materialId: Number(entry.item.itemId || entry.item.productId), fromLocationId: Number(entry.item.warehouseId), toLocationId: null, quantityKg: String(entry.quantity), reason: "Outward", notes: `Delivery Challan ${doc.dcNumber}`, createdByUserId: userId }).returning();
          await db.update(deliveryChallanItemsTable).set({ dispatchedQty: String(entry.quantity) }).where(eq(deliveryChallanItemsTable.id, entry.item.id));
          completed.push({ entry, movementId: Number(movement.id) });
        } catch (lineError) {
          await db.update(inventoryTable).set({ quantityOnHand: String(entry.inventory.quantityOnHand), lastUpdated: new Date() }).where(eq(inventoryTable.id, entry.inventory.id));
          throw lineError;
        }
      }
      await db.update(deliveryChallansTable).set({ status: "Dispatched", stockDeducted: true, dispatchedAt: new Date() }).where(eq(deliveryChallansTable.id, id));
    } catch (dispatchError) {
      for (const done of completed.reverse()) {
        await db.update(inventoryTable).set({ quantityOnHand: String(done.entry.inventory.quantityOnHand), lastUpdated: new Date() }).where(eq(inventoryTable.id, done.entry.inventory.id));
        await db.delete(inventoryMovementsTable).where(eq(inventoryMovementsTable.id, done.movementId));
        await db.update(deliveryChallanItemsTable).set({ dispatchedQty: "0" }).where(eq(deliveryChallanItemsTable.id, done.entry.item.id));
      }
      throw dispatchError;
    }
    const [updated] = await db.select().from(deliveryChallansTable).where(eq(deliveryChallansTable.id, id)).limit(1);
    const savedItems = await db.select().from(deliveryChallanItemsTable).where(eq(deliveryChallanItemsTable.dcId, id));
    return res.json({ ...serializeProforma(updated), items: savedItems.map(serializeQuotationItem) });
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
});

router.delete("/challans/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const [doc] = await db.select().from(deliveryChallansTable).where(eq(deliveryChallansTable.id, id)).limit(1);
  if (!doc) return res.status(404).json({ error: "Delivery challan not found" });
  if (doc.status === "Dispatched") return res.status(409).json({ error: "Dispatched delivery challans cannot be deleted. Create a Sales Return instead." });
  await db.delete(deliveryChallanItemsTable).where(eq(deliveryChallanItemsTable.dcId, id)); await db.delete(deliveryChallansTable).where(eq(deliveryChallansTable.id, id));
  return res.status(204).send();
});

// --- Sales Invoices: document workflow only (ledger automation intentionally excluded) ---
router.get("/invoices", requireAuth, async (_req, res) => {
  const rows = await db.select().from(salesInvoicesTable).orderBy(desc(salesInvoicesTable.createdAt));
  const latest = rows.filter(row => row.isLatestVersion || !row.rootInvoiceNumber);
  return res.json(latest.map(serializeProforma));
});

router.post("/invoices", requireAuth, async (req, res) => {
  try {
    if (!req.body?.clientId) return res.status(400).json({ error: "Client is required" });
    if (!Array.isArray(req.body?.items) || !req.body.items.length) return res.status(400).json({ error: "At least one line item is required" });
    const families = [req.body.quotationIds || req.body.quoteIds, req.body.piIds, req.body.dcIds].filter(value => Array.isArray(value) && value.length);
    if (families.length > 1) return res.status(400).json({ error: "Select only one mapping type: Quotations, Proforma Invoices, or Delivery Challans" });
    const invoiceNumber = invoiceCode((await db.select().from(salesInvoicesTable)).length + 1);
    const [doc] = await db.insert(salesInvoicesTable).values({ invoiceNumber, rootInvoiceNumber: invoiceNumber, ...invoiceData(req.body), status: "Draft", versionSeries: "Draft", versionNumber: 1, versionLabel: "Draft V1", isLatestVersion: true, isLocked: false }).returning();
    await saveInvoiceItems(Number(doc.id), req.body.items);
    return res.status(201).json(await invoiceWithItems(doc));
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.get("/invoices/:id", requireAuth, async (req, res) => {
  const [doc] = await db.select().from(salesInvoicesTable).where(eq(salesInvoicesTable.id, Number(req.params.id))).limit(1);
  if (!doc) return res.status(404).json({ error: "Invoice not found" });
  return res.json(await invoiceWithItems(doc));
});

router.get("/invoices/:id/versions", requireAuth, async (req, res) => {
  const [doc] = await db.select().from(salesInvoicesTable).where(eq(salesInvoicesTable.id, Number(req.params.id))).limit(1);
  if (!doc) return res.status(404).json({ error: "Invoice not found" });
  let rows = await db.select().from(salesInvoicesTable).where(eq(salesInvoicesTable.rootInvoiceNumber, doc.rootInvoiceNumber || doc.invoiceNumber));
  if (!rows.length) rows = [doc];
  return res.json({ data: rows.sort((a, b) => Number(b.id) - Number(a.id)).map(serializeProforma) });
});

async function createInvoiceRevision(source: any, payload: any, series: "Draft" | "Sent") {
  const root = source.rootInvoiceNumber || source.invoiceNumber;
  let siblings = await db.select().from(salesInvoicesTable).where(eq(salesInvoicesTable.rootInvoiceNumber, root));
  if (!siblings.length) siblings = [source];
  const versionNumber = Math.max(0, ...siblings.filter(row => row.versionSeries === series).map(row => Number(row.versionNumber || 0))) + 1;
  await db.update(salesInvoicesTable).set({ isLatestVersion: false }).where(eq(salesInvoicesTable.rootInvoiceNumber, root));
  await db.update(salesInvoicesTable).set({ isLatestVersion: false }).where(eq(salesInvoicesTable.id, source.id));
  const [doc] = await db.insert(salesInvoicesTable).values({
    invoiceNumber: root, rootInvoiceNumber: root, ...invoiceData({ ...source, ...payload }), status: series,
    sentAt: series === "Sent" ? new Date() : null, versionSeries: series, versionNumber, versionLabel: `${series} V${versionNumber}`,
    parentInvoiceId: source.id, isLatestVersion: true, isLocked: false, changeRemarks: payload.changeRemarks || "",
  }).returning();
  const sourceItems = await db.select().from(salesInvoiceItemsTable).where(eq(salesInvoiceItemsTable.invoiceId, source.id));
  await saveInvoiceItems(Number(doc.id), Array.isArray(payload.items) ? payload.items : sourceItems);
  return invoiceWithItems(doc);
}

router.patch("/invoices/:id", requireAuth, async (req, res) => {
  try {
    const [source] = await db.select().from(salesInvoicesTable).where(eq(salesInvoicesTable.id, Number(req.params.id))).limit(1);
    if (!source) return res.status(404).json({ error: "Invoice not found" });
    if (source.isLocked || ["Approved", "Rejected", "Paid", "Cancelled"].includes(source.status)) return res.status(409).json({ error: "Confirmed or closed invoices cannot be edited" });
    return res.json(await createInvoiceRevision(source, req.body || {}, "Draft"));
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.post("/invoices/:id/send", requireAuth, async (req, res) => {
  try {
    const [source] = await db.select().from(salesInvoicesTable).where(eq(salesInvoicesTable.id, Number(req.params.id))).limit(1);
    if (!source) return res.status(404).json({ error: "Invoice not found" });
    if (source.isLocked || ["Approved", "Rejected", "Paid", "Cancelled"].includes(source.status)) return res.status(409).json({ error: "Confirmed or closed invoices cannot be re-sent" });
    return res.json(await createInvoiceRevision(source, req.body || {}, "Sent"));
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.post("/invoices/:id/customer-response", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const action = String(req.body?.action || "");
  const [doc] = await db.select().from(salesInvoicesTable).where(eq(salesInvoicesTable.id, id)).limit(1);
  if (!doc) return res.status(404).json({ error: "Invoice not found" });
  if (doc.status !== "Sent") return res.status(400).json({ error: "Customer response is only allowed for sent invoices" });
  if (!["confirm", "reject"].includes(action)) return res.status(400).json({ error: "Invalid customer response" });
  const status = action === "confirm" ? "Approved" : "Rejected";
  const [updated] = await db.update(salesInvoicesTable).set({ status, isLocked: true, customerResponseAt: new Date(), confirmedByUserId: (req.session as any).userId, rejectionReason: req.body?.reason || "" }).where(eq(salesInvoicesTable.id, id)).returning();
  return res.json(serializeProforma(updated));
});

router.delete("/invoices/:id", requireAuth, async (req, res) => {
  const [doc] = await db.select().from(salesInvoicesTable).where(eq(salesInvoicesTable.id, Number(req.params.id))).limit(1);
  if (!doc) return res.status(404).json({ error: "Invoice not found" });
  if (doc.isLocked || ["Approved", "Rejected", "Paid", "Cancelled"].includes(doc.status)) return res.status(409).json({ error: "Confirmed or closed invoices cannot be deleted" });
  let siblings = await db.select().from(salesInvoicesTable).where(eq(salesInvoicesTable.rootInvoiceNumber, doc.rootInvoiceNumber || doc.invoiceNumber));
  if (!siblings.length) siblings = [doc];
  for (const sibling of siblings) { await db.delete(salesInvoiceItemsTable).where(eq(salesInvoiceItemsTable.invoiceId, sibling.id)); await db.delete(salesInvoicesTable).where(eq(salesInvoicesTable.id, sibling.id)); }
  return res.status(204).send();
});

function salesReturnData(payload: any) {
  return {
    invoiceId: payload.invoiceId ? Number(payload.invoiceId) : null, dcId: payload.dcId ? Number(payload.dcId) : null,
    clientId: Number(payload.clientId), clientName: payload.clientName || "", customerMobile: payload.customerMobile || "",
    customerWhatsappNumber: payload.customerWhatsappNumber || payload.customerMobile || "", customerCompany: payload.customerCompany || "",
    customerAddress: payload.customerAddress || "", customerGstin: payload.customerGstin || "", placeOfSupply: payload.placeOfSupply || "",
    returnDate: payload.returnDate || new Date().toISOString(), validUntil: payload.validUntil || null, restock: payload.restock !== false,
    subtotal: String(payload.subtotal ?? 0), cgstTotal: String(payload.cgstTotal ?? 0), sgstTotal: String(payload.sgstTotal ?? 0),
    igstTotal: String(payload.igstTotal ?? 0), grandTotal: String(payload.grandTotal ?? 0), bankName: payload.bankName || "",
    accountNumber: payload.accountNumber || "", ifscCode: payload.ifscCode || "", branch: payload.branch || "",
    billedByCompanyName: payload.billedByCompanyName || "", billedByAddress: payload.billedByAddress || "", billedByGstin: payload.billedByGstin || "",
    billedByContactNumber: payload.billedByContactNumber || "", terms: payload.termsAndConditions ?? payload.terms ?? "", notes: payload.notes || "",
  };
}

async function saveSalesReturnItems(returnId: number, items: any[]) {
  await db.delete(salesReturnItemsTable).where(eq(salesReturnItemsTable.returnId, returnId));
  for (const item of items || []) {
    const service = Boolean(item.serviceId) || String(item.itemType || "").toLowerCase() === "service";
    await db.insert(salesReturnItemsTable).values({
      returnId, invoiceItemId: item.invoiceItemId ?? null, itemId: item.itemId ?? null, productId: item.productId ?? item.itemId ?? null, serviceId: item.serviceId ?? null,
      description: item.description || item.productName || "", hsnSac: item.hsnSac || "", invoicedQty: String(item.invoicedQty ?? item.quantity ?? 0),
      returnedQty: String(item.returnedQty ?? item.quantity ?? 0), uom: item.uom || "Nos", rate: String(item.rate ?? 0), discountPercent: String(item.discountPercent ?? 0),
      cgstPercent: String(item.cgstPercent ?? 0), sgstPercent: String(item.sgstPercent ?? 0), igstPercent: String(item.igstPercent ?? 0),
      itemType: item.itemType || (service ? "Service" : "Product"), lineSource: item.lineSource || (service ? "Service" : "Inventory"),
      warehouseId: service ? null : item.warehouseId ?? null, warehouseName: service ? "" : item.warehouseName || "", reason: item.reason || "", condition: item.condition || "Good", attributeValues: item.attributeValues || {},
    });
  }
}

async function salesReturnWithItems(doc: any) {
  const items = await db.select().from(salesReturnItemsTable).where(eq(salesReturnItemsTable.returnId, doc.id));
  return { ...serializeProforma(doc), items: items.map(item => ({ ...serializeQuotationItem(item), invoicedQty: Number(item.invoicedQty || 0), returnedQty: Number(item.returnedQty || 0) })) };
}

async function restockSalesReturn(returnId: number, userId: number) {
  const [doc] = await db.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, returnId)).limit(1);
  if (!doc || doc.restocked || !["Received", "Goods Received"].includes(doc.status) || doc.restock === false) return;
  const items = await db.select().from(salesReturnItemsTable).where(eq(salesReturnItemsTable.returnId, returnId));
  const physical = items.filter(item => !item.serviceId && String(item.itemType || "").toLowerCase() !== "service" && Number(item.returnedQty || 0) > 0);
  for (const item of physical) {
    if (!Number(item.itemId || item.productId)) throw new Error(`Inventory item is missing for ${item.description}`);
    if (!Number(item.warehouseId)) throw new Error(`Receiving warehouse is required for ${item.description}`);
  }
  const [claimed] = await db.update(salesReturnsTable).set({ restocked: true }).where(and(eq(salesReturnsTable.id, returnId), eq(salesReturnsTable.restocked, false))).returning();
  if (!claimed) return;
  const completed: Array<{ inventoryId: number; oldQuantity: number; created: boolean; movementId: number }> = [];
  try {
    for (const item of physical) {
      const materialId = Number(item.itemId || item.productId); const warehouseId = Number(item.warehouseId); const quantity = Number(item.returnedQty);
      let [inventory] = await db.select().from(inventoryTable).where(and(eq(inventoryTable.materialId, materialId), eq(inventoryTable.locationId, warehouseId))).limit(1);
      const created = !inventory; const oldQuantity = Number(inventory?.quantityOnHand || 0);
      if (!inventory) [inventory] = await db.insert(inventoryTable).values({ materialId, locationId: warehouseId, quantityOnHand: "0" }).returning();
      await db.update(inventoryTable).set({ quantityOnHand: String(oldQuantity + quantity), lastUpdated: new Date() }).where(eq(inventoryTable.id, inventory.id));
      const [movement] = await db.insert(inventoryMovementsTable).values({ materialId, fromLocationId: null, toLocationId: warehouseId, quantityKg: String(quantity), reason: "Inward", notes: `Sales Return ${doc.returnNumber} (RETURN-${returnId})`, createdByUserId: userId }).returning();
      completed.push({ inventoryId: Number(inventory.id), oldQuantity, created, movementId: Number(movement.id) });
    }
    await db.update(salesReturnsTable).set({ restockedAt: new Date() }).where(eq(salesReturnsTable.id, returnId));
  } catch (error) {
    for (const entry of completed.reverse()) {
      await db.delete(inventoryMovementsTable).where(eq(inventoryMovementsTable.id, entry.movementId));
      if (entry.created) await db.delete(inventoryTable).where(eq(inventoryTable.id, entry.inventoryId));
      else await db.update(inventoryTable).set({ quantityOnHand: String(entry.oldQuantity), lastUpdated: new Date() }).where(eq(inventoryTable.id, entry.inventoryId));
    }
    await db.update(salesReturnsTable).set({ restocked: false, restockedAt: null }).where(eq(salesReturnsTable.id, returnId));
    throw error;
  }
}

// --- Sales Returns and receiving inventory automation ---
router.get("/returns", requireAuth, async (_req, res) => res.json((await db.select().from(salesReturnsTable).orderBy(desc(salesReturnsTable.createdAt))).map(serializeProforma)));

router.post("/returns", requireAuth, async (req, res) => {
  try {
    if (!req.body?.clientId) return res.status(400).json({ error: "Client is required" });
    if (req.body.invoiceId && req.body.dcId) return res.status(400).json({ error: "Select either an Invoice or a Delivery Challan, not both" });
    const items = req.body.items || [];
    if (!items.length) return res.status(400).json({ error: "At least one return item is required" });
    for (let index = 0; index < items.length; index++) { const item = items[index]; const service = item.serviceId || String(item.itemType || "").toLowerCase() === "service"; if (Number(item.returnedQty ?? item.quantity) <= 0) return res.status(400).json({ error: `Returned quantity must be greater than zero for line ${index + 1}` }); if (Number(item.returnedQty ?? item.quantity) > Number(item.invoicedQty ?? item.quantity)) return res.status(400).json({ error: `Returned quantity cannot exceed source quantity for line ${index + 1}` }); if (!service && !item.warehouseId) return res.status(400).json({ error: `Select the receiving warehouse for line item ${index + 1}` }); }
    const returnNumber = returnCode((await db.select().from(salesReturnsTable)).length + 1);
    const [doc] = await db.insert(salesReturnsTable).values({ returnNumber, ...salesReturnData(req.body), status: "Draft", restocked: false }).returning();
    await saveSalesReturnItems(Number(doc.id), items); return res.status(201).json(await salesReturnWithItems(doc));
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.get("/returns/:id", requireAuth, async (req, res) => { const [doc] = await db.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, Number(req.params.id))).limit(1); if (!doc) return res.status(404).json({ error: "Sales return not found" }); return res.json(await salesReturnWithItems(doc)); });

router.patch("/returns/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const [existing] = await db.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Sales return not found" });
  if (["Received", "Credit Issued", "Cancelled", "Rejected"].includes(existing.status)) return res.status(409).json({ error: "Received or closed Sales Returns cannot be edited" });
  const [doc] = await db.update(salesReturnsTable).set({ ...salesReturnData({ ...existing, ...req.body }), status: "Draft" }).where(eq(salesReturnsTable.id, id)).returning();
  if (Array.isArray(req.body.items)) await saveSalesReturnItems(id, req.body.items); return res.json(await salesReturnWithItems(doc));
});

router.post("/returns/:id/send", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const [existing] = await db.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Sales return not found" });
  if (["Received", "Credit Issued", "Cancelled", "Rejected"].includes(existing.status)) return res.status(409).json({ error: "Received or closed Sales Returns cannot be sent" });
  if (Array.isArray(req.body.items)) for (let index = 0; index < req.body.items.length; index++) { const item = req.body.items[index]; const returned = Number(item.returnedQty ?? item.quantity); const source = Number(item.invoicedQty ?? item.quantity); const service = item.serviceId || String(item.itemType || "").toLowerCase() === "service"; if (!(returned > 0) || returned > source) return res.status(400).json({ error: `Invalid returned quantity for line ${index + 1}` }); if (!service && !item.warehouseId) return res.status(400).json({ error: `Select the receiving warehouse for line item ${index + 1}` }); }
  const [doc] = await db.update(salesReturnsTable).set({ ...salesReturnData({ ...existing, ...req.body }), status: "Confirmed" }).where(eq(salesReturnsTable.id, id)).returning();
  if (Array.isArray(req.body.items)) await saveSalesReturnItems(id, req.body.items); return res.json(await salesReturnWithItems(doc));
});

router.post("/returns/:id/customer-response", requireAuth, async (req, res) => {
  const id = Number(req.params.id); const action = String(req.body?.action || ""); const [existing] = await db.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Sales return not found" });
  if (existing.status !== "Confirmed") return res.status(400).json({ error: "Customer response is only allowed for confirmed Sales Returns" });
  if (!["confirm", "reject"].includes(action)) return res.status(400).json({ error: "Invalid customer response" });
  const status = action === "confirm" ? "Received" : "Rejected";
  await db.update(salesReturnsTable).set({ status, customerResponseAt: new Date(), rejectionReason: req.body?.reason || "" }).where(eq(salesReturnsTable.id, id));
  if (status === "Received") await restockSalesReturn(id, (req.session as any).userId);
  const [updated] = await db.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id)).limit(1); return res.json(await salesReturnWithItems(updated));
});

router.delete("/returns/:id", requireAuth, async (req, res) => { const id = Number(req.params.id); const [doc] = await db.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id)).limit(1); if (!doc) return res.status(404).json({ error: "Sales return not found" }); if (doc.restocked || ["Received", "Credit Issued"].includes(doc.status)) return res.status(409).json({ error: "Received Sales Returns cannot be deleted" }); await db.delete(salesReturnItemsTable).where(eq(salesReturnItemsTable.returnId, id)); await db.delete(salesReturnsTable).where(eq(salesReturnsTable.id, id)); return res.status(204).send(); });

router.get("/organization", requireAuth, async (req, res) => {
  const [org] = await db.select().from(organizationDetailsTable).limit(1);
  if (!org) {
    return res.json({
      logoUrl: "",
      watermarkUrl: "",
      companyName: "",
      orgEmail: "",
      orgDomain: "",
      gstin: "",
      companyStateCode: "",
      salesExecutive: "",
      salesContactNo: "",
      companyAddress: "",
      bankName: "",
      accountNumber: "",
      ifscCode: "",
      branch: "",
      qrCodeUrl: "",
      termsAndConditions: [],
      salesDocBody: "",
      flexDocBody: "",
      defaultCurrency: "INR",
      timezone: "Asia/Kolkata",
    });
  }
  return res.json(org);
});

router.put("/organization", requireAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    const [existing] = await db.select().from(organizationDetailsTable).limit(1);

    const data = {
      logoUrl: payload.logoUrl ?? "",
      watermarkUrl: payload.watermarkUrl ?? "",
      companyName: payload.companyName ?? "",
      orgEmail: payload.orgEmail ?? "",
      orgDomain: payload.orgDomain ?? "",
      gstin: payload.gstin ?? "",
      companyStateCode: payload.companyStateCode ?? "",
      salesExecutive: payload.salesExecutive ?? "",
      salesContactNo: payload.salesContactNo ?? "",
      companyAddress: payload.companyAddress ?? "",
      bankName: payload.bankName ?? "",
      accountNumber: payload.accountNumber ?? "",
      ifscCode: payload.ifscCode ?? "",
      branch: payload.branch ?? "",
      qrCodeUrl: payload.qrCodeUrl ?? "",
      termsAndConditions: Array.isArray(payload.termsAndConditions) ? payload.termsAndConditions : [],
      salesDocBody: payload.salesDocBody ?? "",
      flexDocBody: payload.flexDocBody ?? "",
      defaultCurrency: payload.defaultCurrency ?? "INR",
      timezone: payload.timezone ?? "Asia/Kolkata",
    };

    let saved;
    if (existing) {
      [saved] = await db.update(organizationDetailsTable)
        .set(data)
        .where(eq(organizationDetailsTable.id, existing.id))
        .returning();
    } else {
      [saved] = await db.insert(organizationDetailsTable)
        .values(data)
        .returning();
    }

    return res.json(saved);
  } catch (err: any) {
    console.error("Error in PUT /organization:", err);
    return res.status(500).json({ error: err.message || "Failed to save organization details" });
  }
});

// Keep generic sales-order ID routes last so named resources such as
// /organization and /quotations cannot be mistaken for an order ID.
router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid sales order ID" });
  const [row] = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.id, id)).limit(1);
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.patch("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid sales order ID" });
  const { qtyKg, unitPrice, totalValue, buyerName, qualityNote, notes, saleType } = req.body as any;
  const updates: any = {};
  if (qtyKg !== undefined) updates.qtyKg = String(qtyKg);
  if (unitPrice !== undefined) updates.unitPrice = String(unitPrice);
  if (totalValue !== undefined) updates.totalValue = String(totalValue);
  if (buyerName !== undefined) updates.buyerName = buyerName;
  if (qualityNote !== undefined) updates.qualityNote = qualityNote;
  if (notes !== undefined) updates.notes = notes;
  if (saleType !== undefined) updates.saleType = saleType;
  const [row] = await db.update(salesOrdersTable).set(updates).where(eq(salesOrdersTable.id, id)).returning();
  return res.json(row);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid sales order ID" });
  await db.delete(salesOrdersTable).where(eq(salesOrdersTable.id, id));
  return res.status(204).send();
});

export default router;

