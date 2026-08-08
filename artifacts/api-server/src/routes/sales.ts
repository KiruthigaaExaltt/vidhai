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
  contactsTable,
  materialsTable,
  servicesTable,
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

    // Auto-create Draft Proforma Invoice if Approved
    let autoCreatedProforma = null;
    if (action === "confirm") {
      const existingPiCount = (await db.select().from(proformaInvoicesTable)).length;
      const piNumber = piCode(existingPiCount + 1);

      const [proforma] = await db.insert(proformaInvoicesTable).values({
        piNumber,
        quoteId: id,
        clientId: existing.clientId,
        clientName: existing.clientName,
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
        notes: existing.notes,
        status: "Draft",
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

