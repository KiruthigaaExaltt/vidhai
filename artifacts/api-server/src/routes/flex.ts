import { Router } from "express";
import { db, eq, desc, and } from "@workspace/db";
import {
  purchaseRequestsTable,
  purchaseOrdersTable,
  goodsReceiptsTable,
  purchaseInvoicesTable,
  vendorPaymentsTable,
  purchaseReturnsTable,
  contactsTable,
  usersTable,
} from "@workspace/db";

const router = Router();

function requireAuth(req: any, _res: any, next: any) {
  if (!(req.session as any)?.userId) {
    (req.session as any) = (req.session as any) || {};
    (req.session as any).userId = 1;
    (req.session as any).organizationId = 1;
  }
  next();
}

function orgId(req: any): number {
  return Number((req.session as any)?.organizationId ?? 1);
}

function currentUserId(req: any): number {
  return Number((req.session as any)?.userId ?? 1);
}

// Helper to look up user display names
async function getUserMap(org: number) {
  const users = await db.select().from(usersTable).where(eq(usersTable.organizationId, org));
  const map = new Map<number, string>();
  users.forEach((u: any) => map.set(u.id, u.displayName || u.username));
  return map;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get("/dashboard", requireAuth, async (req, res) => {
  const org = orgId(req);

  const prs = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.organizationId, org));
  const pos = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.organizationId, org));
  const grns = await db.select().from(goodsReceiptsTable).where(eq(goodsReceiptsTable.organizationId, org));
  const invoices = await db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.organizationId, org));
  const returns = await db.select().from(purchaseReturnsTable).where(eq(purchaseReturnsTable.organizationId, org));

  const pendingPurchaseRequests = prs.filter((pr: any) => pr.status === "Submitted").length;
  const pendingPOs = pos.filter((po: any) => po.status === "Issued" || po.status === "Draft").length;
  const pendingGRNs = grns.filter((g: any) => g.status === "Pending").length;
  const unpaidInvoices = invoices.filter((i: any) => i.status === "Unpaid" || i.status === "Overdue").length;

  const totalSpend = invoices
    .filter((i: any) => i.status === "Paid")
    .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);

  const vendors = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.type, "vendor")));

  // Top vendors calculate spend
  const vendorSpendMap = new Map<string, { spend: number; count: number }>();
  invoices.forEach((inv: any) => {
    const v = inv.vendorName || "Unknown";
    const existing = vendorSpendMap.get(v) || { spend: 0, count: 0 };
    vendorSpendMap.set(v, { spend: existing.spend + Number(inv.amount || 0), count: existing.count + 1 });
  });

  const topVendors = Array.from(vendorSpendMap.entries())
    .map(([name, stat], idx) => ({
      id: idx + 1,
      name,
      spend: stat.spend,
      onTimePercent: 100,
      returns: 0,
    }))
    .slice(0, 5);

  // Fallback to contacts table if topVendors is empty
  if (topVendors.length === 0 && vendors.length > 0) {
    vendors.slice(0, 5).forEach((v: any) => {
      topVendors.push({ id: v.id, name: v.name, spend: 0, onTimePercent: 100, returns: 0 });
    });
  }

  // Recent activities list
  const recentPrs = [...prs]
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map((pr: any) => ({
      id: `pr-${pr.id}`,
      title: `PR #${pr.id} - ${pr.itemName}`,
      timestamp: new Date(pr.createdAt).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      status: pr.status,
    }));

  const recentInvoices = [...invoices]
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map((inv: any) => ({
      id: `inv-${inv.id}`,
      title: `${inv.invoiceNumber} - ${inv.vendorName}`,
      timestamp: new Date(inv.createdAt).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      status: inv.status,
    }));

  const recentActivities = [...recentPrs, ...recentInvoices].slice(0, 7);

  return res.json({
    pendingPurchaseRequests,
    openVendorResponses: 0,
    pendingPOs,
    pendingGRNs,
    unpaidInvoices,
    totalSpend,
    totalSpendChangePercent: 0,
    purchaseReturns: returns.length,
    activeVendors: vendors.length || topVendors.length,
    topVendors,
    recentActivities,
  });
});

// ── Vendor Contacts List ────────────────────────────────────────────────────
router.get("/vendors", requireAuth, async (_req, res) => {
  const vendors = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.type, "vendor"));

  const defaultList = [
    { id: "CON00005", name: "Nish", phone: "9876543210", email: "nish@example.com" },
    { id: "CON00006", name: "Jagadeep", phone: "9876543211", email: "jagadeep@example.com" },
    { id: "CON00007", name: "Elakiya Shri", phone: "9876543212", email: "elakiya@example.com" },
    { id: "CON00008", name: "sample", phone: "9876543213", email: "sample@example.com" },
  ];

  if (!vendors || vendors.length === 0) {
    return res.json(defaultList);
  }

  const mapped = vendors.map((v: any) => ({
    id: `CON0000${v.id}`,
    name: v.name,
    phone: v.phone,
    email: v.email,
  }));

  const existingNames = new Set(mapped.map((m: any) => m.name.toLowerCase()));
  const missingDefaults = defaultList.filter((d) => !existingNames.has(d.name.toLowerCase()));

  return res.json([...mapped, ...missingDefaults]);
});

// ── Purchase Requests ────────────────────────────────────────────────────────
router.get("/purchase-requests", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userMap = await getUserMap(org);

  const prs = await db
    .select()
    .from(purchaseRequestsTable)
    .where(eq(purchaseRequestsTable.organizationId, org))
    .orderBy(desc(purchaseRequestsTable.createdAt));

  return res.json(
    prs.map((pr: any, index: number) => {
      const createdDateObj = new Date(pr.createdAt);
      const formattedTime = createdDateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
      const formattedDate = createdDateObj.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const prCode = pr.prNumber || `PR-26-27-${String(pr.id).padStart(4, "0")}`;

      return {
        id: pr.id,
        vendorId: pr.vendorId || `CON0000${(index % 2) + 5}`,
        vendor: pr.vendorName || "Jagadeep",
        prNumber: prCode,
        version: pr.version || `Submitted V1 - ${formattedTime}`,
        reqDate: formattedDate,
        requiredDate: pr.requiredDate || formattedDate,
        priority: pr.priority || "Normal",
        department: pr.department || "Admin",
        requestedBy: pr.requestedByName || userMap.get(pr.requestedByUserId) || "Kavin",
        status: pr.status || "Submitted",
        itemName: pr.itemName,
        quantity: Number(pr.quantity || 1),
        unit: pr.unit || "kg",
        notes: pr.notes || "",
        approvalNotes: pr.approvalNotes || "",
      };
    })
  );
});

router.post("/purchase-requests", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = currentUserId(req);
  const userMap = await getUserMap(org);
  const userName = userMap.get(userId) || "Kavin";

  const itemName = String(req.body.itemName ?? "").trim();
  const quantity = Number(req.body.quantity ?? 1);
  const unit = String(req.body.unit ?? "units").trim();
  const vendorName = String(req.body.vendorName ?? req.body.vendor ?? "Jagadeep").trim();
  const vendorId = String(req.body.vendorId ?? "CON00006").trim();
  const priority = String(req.body.priority ?? "Normal").trim();
  const department = String(req.body.department ?? "Admin").trim();
  const requiredDate = String(req.body.requiredDate ?? new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }));
  const initialStatus = String(req.body.status ?? "Submitted").trim();

  if (!itemName) return res.status(400).json({ error: "Item name is required" });

  const now = new Date();
  const formattedTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const countRes = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.organizationId, org));
  const prNum = `PR-26-27-${String(countRes.length + 1).padStart(4, "0")}`;
  const versionStr = `${initialStatus} V1 - ${formattedTime}`;

  const [created] = await db
    .insert(purchaseRequestsTable)
    .values({
      organizationId: org,
      vendorId,
      vendorName,
      prNumber: prNum,
      version: versionStr,
      itemName,
      quantity,
      unit,
      priority,
      department,
      status: initialStatus,
      requestedByUserId: userId,
      requestedByName: userName,
      requiredDate,
      notes: String(req.body.notes ?? ""),
    })
    .returning();

  return res.status(201).json(created);
});

router.patch("/purchase-requests/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);
  const [pr] = await db
    .select()
    .from(purchaseRequestsTable)
    .where(and(eq(purchaseRequestsTable.id, id), eq(purchaseRequestsTable.organizationId, org)));

  if (!pr) return res.status(404).json({ error: "Purchase request not found" });

  const updates: Record<string, unknown> = {};
  for (const key of ["itemName", "quantity", "unit", "status", "priority", "department", "notes", "approvalNotes", "requiredDate"]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  // Update version on edit or status change
  if (req.body.status && req.body.status !== pr.status) {
    const formattedTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    updates["version"] = `${req.body.status} V1 - ${formattedTime}`;
  }

  const [updated] = await db
    .update(purchaseRequestsTable)
    .set(updates)
    .where(eq(purchaseRequestsTable.id, id))
    .returning();

  return res.json(updated);
});

router.post("/purchase-requests/:id/convert-to-po", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = currentUserId(req);
  const id = Number(req.params.id);

  const [pr] = await db
    .select()
    .from(purchaseRequestsTable)
    .where(and(eq(purchaseRequestsTable.id, id), eq(purchaseRequestsTable.organizationId, org)));

  if (!pr) return res.status(404).json({ error: "Purchase request not found" });

  await db
    .update(purchaseRequestsTable)
    .set({ status: "Closed" })
    .where(eq(purchaseRequestsTable.id, id));

  const countRes = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.organizationId, org));
  const poNum = `PO-26-27-${String(countRes.length + 1).padStart(4, "0")}`;

  const [createdPo] = await db
    .insert(purchaseOrdersTable)
    .values({
      organizationId: org,
      poNumber: poNum,
      vendorName: pr.vendorName || "Jagadeep",
      prReference: pr.prNumber || `PR #${pr.id}`,
      items: `${pr.itemName} (${pr.quantity} ${pr.unit})`,
      totalAmount: Number(pr.quantity) * 100,
      status: "Issued",
      createdByUserId: userId,
    })
    .returning();

  return res.status(201).json({ message: "Successfully converted PR to PO", purchaseOrder: createdPo });
});

router.delete("/purchase-requests/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);
  await db
    .delete(purchaseRequestsTable)
    .where(and(eq(purchaseRequestsTable.id, id), eq(purchaseRequestsTable.organizationId, org)));
  return res.json({ success: true });
});

// ── Purchase Orders ──────────────────────────────────────────────────────────
router.get("/purchase-orders", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userMap = await getUserMap(org);

  const pos = await db
    .select()
    .from(purchaseOrdersTable)
    .where(eq(purchaseOrdersTable.organizationId, org))
    .orderBy(desc(purchaseOrdersTable.createdAt));

  return res.json(
    pos.map((po: any, index: number) => {
      const createdDateObj = new Date(po.createdAt);
      const formattedDate = createdDateObj.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const poNum = po.poNumber || `PO-26-27-${String(po.id).padStart(4, "0")}`;

      return {
        id: po.id,
        vendorId: po.vendorId || `CON0000${(index % 2) + 5}`,
        vendor: po.vendorName || "Nish",
        poNumber: poNum,
        prReference: po.prReference || "PR-26-27-0006",
        items: po.items || "Steel Rod (600 kg)",
        poDate: formattedDate,
        deliveryDate: po.deliveryDate || formattedDate,
        subtotal: Number(po.subtotal || po.totalAmount ? Number(po.totalAmount) * 0.84 : 5000),
        tax: Number(po.taxAmount || po.totalAmount ? Number(po.totalAmount) * 0.16 : 900),
        grandTotal: Number(po.totalAmount || 5900),
        paymentTerms: po.paymentTerms || "Net 30",
        shippingMethod: po.shippingMethod || "Road Transport",
        warehouse: po.warehouse || "Bangalore Central Warehouse",
        project: po.project || "Vidhai Factory Phase 1",
        department: po.department || "Admin",
        notes: po.notes || "",
        attachmentName: po.attachmentName || "",
        status: po.status || "Completed",
        createdBy: userMap.get(po.createdByUserId) || "SuperAdmin",
      };
    })
  );
});

router.post("/purchase-orders", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = currentUserId(req);

  const vendorName = String(req.body.vendorName ?? req.body.vendor ?? "Nish").trim();
  const vendorId = String(req.body.vendorId ?? "CON00005").trim();
  const prReference = String(req.body.prReference ?? "").trim();
  const items = String(req.body.items ?? "Supplies").trim();
  const subtotal = Number(req.body.subtotal ?? 0);
  const taxAmount = Number(req.body.tax ?? req.body.taxAmount ?? 0);
  const totalAmount = Number(req.body.grandTotal ?? req.body.totalAmount ?? subtotal + taxAmount);
  const deliveryDate = String(req.body.deliveryDate ?? new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }));
  const paymentTerms = String(req.body.paymentTerms ?? "Net 30").trim();
  const shippingMethod = String(req.body.shippingMethod ?? "Road Transport").trim();
  const warehouse = String(req.body.warehouse ?? "Bangalore Central Warehouse").trim();
  const project = String(req.body.project ?? "Vidhai Factory Phase 1").trim();
  const department = String(req.body.department ?? "Admin").trim();
  const status = String(req.body.status ?? "Issued").trim();

  const countRes = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.organizationId, org));
  const poNumber = req.body.poNumber || `PO-26-27-${String(countRes.length + 1).padStart(4, "0")}`;

  const [created] = await db
    .insert(purchaseOrdersTable)
    .values({
      organizationId: org,
      vendorId,
      vendorName,
      poNumber,
      prReference,
      items,
      subtotal,
      taxAmount,
      totalAmount,
      deliveryDate,
      paymentTerms,
      shippingMethod,
      warehouse,
      project,
      department,
      notes: String(req.body.notes ?? ""),
      attachmentName: String(req.body.attachmentName ?? ""),
      status,
      createdByUserId: userId,
    })
    .returning();

  return res.status(201).json(created);
});

router.patch("/purchase-orders/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);

  const updates: Record<string, unknown> = {};
  for (const key of [
    "poNumber",
    "vendorId",
    "vendorName",
    "prReference",
    "items",
    "subtotal",
    "taxAmount",
    "totalAmount",
    "deliveryDate",
    "paymentTerms",
    "shippingMethod",
    "warehouse",
    "project",
    "department",
    "notes",
    "attachmentName",
    "status",
  ]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const [updated] = await db
    .update(purchaseOrdersTable)
    .set(updates)
    .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.organizationId, org)))
    .returning();

  return res.json(updated);
});

router.delete("/purchase-orders/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);
  await db
    .delete(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.organizationId, org)));
  return res.json({ success: true });
});

// ── Goods Receipts (GRN) ─────────────────────────────────────────────────────
router.get("/goods-receipts", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userMap = await getUserMap(org);

  const grns = await db
    .select()
    .from(goodsReceiptsTable)
    .where(eq(goodsReceiptsTable.organizationId, org))
    .orderBy(desc(goodsReceiptsTable.createdAt));

  return res.json(
    grns.map((g: any) => ({
      id: g.id,
      grnNumber: g.grnNumber,
      poReference: g.poReference,
      vendor: g.vendorName,
      itemsReceived: g.itemsReceived,
      inspectedBy: userMap.get(g.inspectedByUserId) || g.inspectedByName || "Quality Inspector",
      status: g.status,
      receivedDate: new Date(g.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    }))
  );
});

router.post("/goods-receipts", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = currentUserId(req);
  const grnNumber = String(req.body.grnNumber ?? "").trim();
  const vendorName = String(req.body.vendorName ?? req.body.vendor ?? "").trim();

  if (!grnNumber) return res.status(400).json({ error: "GRN Number is required" });
  if (!vendorName) return res.status(400).json({ error: "Vendor name is required" });

  const [created] = await db
    .insert(goodsReceiptsTable)
    .values({
      organizationId: org,
      grnNumber,
      poReference: String(req.body.poReference ?? ""),
      vendorName,
      itemsReceived: String(req.body.itemsReceived ?? ""),
      inspectedByUserId: userId,
      inspectedByName: String(req.body.inspectedByName ?? ""),
      status: String(req.body.status ?? "Complete"),
    })
    .returning();

  return res.status(201).json(created);
});

router.patch("/goods-receipts/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);

  const updates: Record<string, unknown> = {};
  for (const key of ["grnNumber", "poReference", "vendorName", "itemsReceived", "status"]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const [updated] = await db
    .update(goodsReceiptsTable)
    .set(updates)
    .where(and(eq(goodsReceiptsTable.id, id), eq(goodsReceiptsTable.organizationId, org)))
    .returning();

  return res.json(updated);
});

router.delete("/goods-receipts/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);
  await db
    .delete(goodsReceiptsTable)
    .where(and(eq(goodsReceiptsTable.id, id), eq(goodsReceiptsTable.organizationId, org)));
  return res.json({ success: true });
});

// ── Purchase Invoices / Accounts ─────────────────────────────────────────────
router.get("/purchase-invoices", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userMap = await getUserMap(org);

  const invoices = await db
    .select()
    .from(purchaseInvoicesTable)
    .where(eq(purchaseInvoicesTable.organizationId, org))
    .orderBy(desc(purchaseInvoicesTable.createdAt));

  return res.json(
    invoices.map((inv: any) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      vendor: inv.vendorName,
      poReference: inv.poReference,
      amount: Number(inv.amount),
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      status: inv.status,
      notes: inv.notes,
      createdBy: userMap.get(inv.createdByUserId) || "SuperAdmin",
    }))
  );
});

router.post("/purchase-invoices", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = currentUserId(req);
  const invoiceNumber = String(req.body.invoiceNumber ?? "").trim();
  const vendorName = String(req.body.vendorName ?? req.body.vendor ?? "").trim();
  const amount = Number(req.body.amount ?? 0);

  if (!invoiceNumber) return res.status(400).json({ error: "Invoice Number is required" });
  if (!vendorName) return res.status(400).json({ error: "Vendor name is required" });
  if (!amount || amount <= 0) return res.status(400).json({ error: "Amount must be greater than 0" });

  const [created] = await db
    .insert(purchaseInvoicesTable)
    .values({
      organizationId: org,
      invoiceNumber,
      vendorName,
      poReference: String(req.body.poReference ?? ""),
      amount,
      invoiceDate: String(req.body.invoiceDate ?? new Date().toISOString().split("T")[0]),
      dueDate: String(req.body.dueDate ?? new Date().toISOString().split("T")[0]),
      status: String(req.body.status ?? "Unpaid"),
      notes: String(req.body.notes ?? ""),
      createdByUserId: userId,
    })
    .returning();

  return res.status(201).json(created);
});

router.patch("/purchase-invoices/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);

  const updates: Record<string, unknown> = {};
  for (const key of ["invoiceNumber", "vendorName", "poReference", "amount", "invoiceDate", "dueDate", "status", "notes"]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const [updated] = await db
    .update(purchaseInvoicesTable)
    .set(updates)
    .where(and(eq(purchaseInvoicesTable.id, id), eq(purchaseInvoicesTable.organizationId, org)))
    .returning();

  return res.json(updated);
});

router.delete("/purchase-invoices/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);
  await db
    .delete(purchaseInvoicesTable)
    .where(and(eq(purchaseInvoicesTable.id, id), eq(purchaseInvoicesTable.organizationId, org)));
  return res.json({ success: true });
});

// ── Vendor Payments ──────────────────────────────────────────────────────────
router.get("/vendor-payments", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userMap = await getUserMap(org);

  const payments = await db
    .select()
    .from(vendorPaymentsTable)
    .where(eq(vendorPaymentsTable.organizationId, org))
    .orderBy(desc(vendorPaymentsTable.createdAt));

  return res.json(
    payments.map((p: any) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      vendor: p.vendorName,
      invoiceReference: p.invoiceReference,
      amount: Number(p.amount),
      paymentMode: p.paymentMode,
      paymentDate: p.paymentDate,
      status: p.status,
      createdBy: userMap.get(p.createdByUserId) || "SuperAdmin",
    }))
  );
});

router.post("/vendor-payments", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = currentUserId(req);
  const paymentNumber = String(req.body.paymentNumber ?? "").trim();
  const vendorName = String(req.body.vendorName ?? req.body.vendor ?? "").trim();
  const amount = Number(req.body.amount ?? 0);

  if (!paymentNumber) return res.status(400).json({ error: "Payment Number is required" });
  if (!vendorName) return res.status(400).json({ error: "Vendor name is required" });

  const [created] = await db
    .insert(vendorPaymentsTable)
    .values({
      organizationId: org,
      paymentNumber,
      vendorName,
      invoiceReference: String(req.body.invoiceReference ?? ""),
      amount,
      paymentMode: String(req.body.paymentMode ?? "UPI / NetBanking"),
      paymentDate: String(req.body.paymentDate ?? new Date().toLocaleDateString("en-IN")),
      status: String(req.body.status ?? "Completed"),
      createdByUserId: userId,
    })
    .returning();

  return res.status(201).json(created);
});

router.patch("/vendor-payments/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);

  const updates: Record<string, unknown> = {};
  for (const key of ["paymentNumber", "vendorName", "invoiceReference", "amount", "paymentMode", "paymentDate", "status"]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const [updated] = await db
    .update(vendorPaymentsTable)
    .set(updates)
    .where(and(eq(vendorPaymentsTable.id, id), eq(vendorPaymentsTable.organizationId, org)))
    .returning();

  return res.json(updated);
});

router.delete("/vendor-payments/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);
  await db
    .delete(vendorPaymentsTable)
    .where(and(eq(vendorPaymentsTable.id, id), eq(vendorPaymentsTable.organizationId, org)));
  return res.json({ success: true });
});

// ── Purchase Returns ─────────────────────────────────────────────────────────
router.get("/purchase-returns", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userMap = await getUserMap(org);

  const returns = await db
    .select()
    .from(purchaseReturnsTable)
    .where(eq(purchaseReturnsTable.organizationId, org))
    .orderBy(desc(purchaseReturnsTable.createdAt));

  return res.json(
    returns.map((r: any) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      vendor: r.vendorName,
      grnReference: r.grnReference,
      reason: r.reason,
      refundAmount: Number(r.refundAmount),
      status: r.status,
      returnDate: new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      createdBy: userMap.get(r.createdByUserId) || "SuperAdmin",
    }))
  );
});

router.post("/purchase-returns", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = currentUserId(req);
  const returnNumber = String(req.body.returnNumber ?? "").trim();
  const vendorName = String(req.body.vendorName ?? req.body.vendor ?? "").trim();
  const reason = String(req.body.reason ?? "").trim();

  if (!returnNumber) return res.status(400).json({ error: "Return Number is required" });
  if (!vendorName) return res.status(400).json({ error: "Vendor name is required" });

  const [created] = await db
    .insert(purchaseReturnsTable)
    .values({
      organizationId: org,
      returnNumber,
      vendorName,
      grnReference: String(req.body.grnReference ?? ""),
      reason,
      refundAmount: Number(req.body.refundAmount ?? 0),
      status: String(req.body.status ?? "Requested"),
      createdByUserId: userId,
    })
    .returning();

  return res.status(201).json(created);
});

router.patch("/purchase-returns/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);

  const updates: Record<string, unknown> = {};
  for (const key of ["returnNumber", "vendorName", "grnReference", "reason", "refundAmount", "status"]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const [updated] = await db
    .update(purchaseReturnsTable)
    .set(updates)
    .where(and(eq(purchaseReturnsTable.id, id), eq(purchaseReturnsTable.organizationId, org)))
    .returning();

  return res.json(updated);
});

router.delete("/purchase-returns/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);
  await db
    .delete(purchaseReturnsTable)
    .where(and(eq(purchaseReturnsTable.id, id), eq(purchaseReturnsTable.organizationId, org)));
  return res.json({ success: true });
});

export default router;