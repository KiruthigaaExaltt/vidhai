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
  materialsTable,
  inventoryLocationsTable,
  departmentsTable,
  vendorAvailabilityTable,
  inventoryTable,
  inventoryMovementsTable,
  accountsPayableTable,
} from "@workspace/db";

const router = Router();
const FLEX_API_MESSAGES = {
  amountMustBeGreaterThanZero: "Amount must be greater than 0",
  grnNumberRequired: "GRN Number is required",
  invoiceNumberRequired: "Invoice Number is required",
  itemNameRequired: "Item name is required",
  paymentNumberRequired: "Payment Number is required",
  purchaseRequestNotFound: "Purchase request not found",
  returnNumberRequired: "Return Number is required",
  successfullyConvertedPrToPo: "Successfully converted PR to PO",
  vendorNameRequired: "Vendor name is required",
} as const;

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
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.organizationId, org));
  const map = new Map<number, string>();
  users.forEach((u: any) => map.set(u.id, u.displayName || u.username));
  return map;
}

async function getVendorMap() {
  const vendors = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.type, "vendor"));
  return new Map(
    vendors.map((vendor: any) => [
      String(vendor.name).toLowerCase(),
      String(vendor.id),
    ]),
  );
}
// ── Dashboard ────────────────────────────────────────────────────────────────
router.get("/dashboard", requireAuth, async (req, res) => {
  const org = orgId(req);

  const prs = await db
    .select()
    .from(purchaseRequestsTable)
    .where(eq(purchaseRequestsTable.organizationId, org));
  const pos = await db
    .select()
    .from(purchaseOrdersTable)
    .where(eq(purchaseOrdersTable.organizationId, org));
  const grns = await db
    .select()
    .from(goodsReceiptsTable)
    .where(eq(goodsReceiptsTable.organizationId, org));
  const invoices = await db
    .select()
    .from(purchaseInvoicesTable)
    .where(eq(purchaseInvoicesTable.organizationId, org));
  const returns = await db
    .select()
    .from(purchaseReturnsTable)
    .where(eq(purchaseReturnsTable.organizationId, org));

  const pendingPurchaseRequests = prs.filter(
    (pr: any) => pr.status === "Submitted",
  ).length;
  const pendingPOs = pos.filter(
    (po: any) => po.status === "Issued" || po.status === "Draft",
  ).length;
  const pendingGRNs = grns.filter((g: any) => g.status === "Pending").length;
  const unpaidInvoices = invoices.filter(
    (i: any) => i.status === "Unpaid" || i.status === "Overdue",
  ).length;

  const totalSpend = invoices
    .filter((i: any) => i.status === "Paid")
    .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);

  const vendors = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.type, "vendor")));

  const returnCountByVendor = new Map<string, number>();
  returns.forEach((item: any) =>
    returnCountByVendor.set(
      item.vendorName,
      (returnCountByVendor.get(item.vendorName) || 0) + 1,
    ),
  );
  const vendorIdByName = new Map(
    vendors.map((vendor: any) => [vendor.name, vendor.id]),
  );

  // Top vendors calculate spend
  const vendorSpendMap = new Map<string, { spend: number; count: number }>();
  invoices.forEach((inv: any) => {
    const v = inv.vendorName || "Unknown";
    const existing = vendorSpendMap.get(v) || { spend: 0, count: 0 };
    vendorSpendMap.set(v, {
      spend: existing.spend + Number(inv.amount || 0),
      count: existing.count + 1,
    });
  });

  const topVendors = Array.from(vendorSpendMap.entries())
    .map(([name, stat], idx) => ({
      id: vendorIdByName.get(name) || name,
      name,
      spend: stat.spend,
      onTimePercent: null,
      returns: returnCountByVendor.get(name) || 0,
    }))
    .slice(0, 5);

  // Fallback to contacts table if topVendors is empty
  if (topVendors.length === 0 && vendors.length > 0) {
    vendors.slice(0, 5).forEach((v: any) => {
      topVendors.push({
        id: v.id,
        name: v.name,
        spend: 0,
        onTimePercent: null,
        returns: returnCountByVendor.get(v.name) || 0,
      });
    });
  }

  // Recent activities list
  const recentPrs = [...prs]
    .sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
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
    .sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
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
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const paidSpend = (from: Date, to: Date) =>
    invoices
      .filter(
        (invoice: any) =>
          invoice.status === "Paid" &&
          new Date(invoice.createdAt) >= from &&
          new Date(invoice.createdAt) < to,
      )
      .reduce(
        (sum: number, invoice: any) => sum + Number(invoice.amount || 0),
        0,
      );
  const currentMonthSpend = paidSpend(currentMonthStart, now);
  const previousMonthSpend = paidSpend(previousMonthStart, currentMonthStart);
  const totalSpendChangePercent =
    previousMonthSpend > 0
      ? ((currentMonthSpend - previousMonthSpend) / previousMonthSpend) * 100
      : null;

  return res.json({
    pendingPurchaseRequests,
    openVendorResponses: null,
    pendingPOs,
    pendingGRNs,
    unpaidInvoices,
    totalSpend,
    totalSpendChangePercent,
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

  return res.json(
    vendors.map((v: any) => ({
      id: String(v.id),
      name: v.name,
      phone: v.phone,
      email: v.email,
    })),
  );
});

router.get("/master-data", requireAuth, async (req, res) => {
  const org = orgId(req);
  const [vendors, users, items, warehouses, departments, purchaseOrders] =
    await Promise.all([
      db
        .select()
        .from(contactsTable)
        .where(eq(contactsTable.type, "vendor"))
        .orderBy(contactsTable.name),
      db.select().from(usersTable).where(eq(usersTable.organizationId, org)),
      db
        .select()
        .from(materialsTable)
        .where(eq(materialsTable.active, true))
        .orderBy(materialsTable.name),
      db
        .select()
        .from(inventoryLocationsTable)
        .where(eq(inventoryLocationsTable.isActive, true))
        .orderBy(inventoryLocationsTable.locationName),
      db
        .select()
        .from(departmentsTable)
        .where(
          and(
            eq(departmentsTable.organizationId, org),
            eq(departmentsTable.status, "Active"),
          ),
        )
        .orderBy(departmentsTable.name),
      db
        .select()
        .from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.organizationId, org)),
    ]);
  const activeUsers = users.filter(
    (user: any) => user.isDeleted !== true && user.isActive !== false,
  );
  const projects = Array.from(
    new Set(
      purchaseOrders
        .map((order: any) => String(order.project ?? "").trim())
        .filter(Boolean),
    ),
  ).sort();
  return res.json({
    vendors: vendors.map((vendor: any) => ({
      id: String(vendor.id),
      name: vendor.name,
      company: vendor.company,
      phone: vendor.phone,
      whatsapp: vendor.whatsappNumber,
      email: vendor.email,
      address: vendor.address,
    })),
    users: activeUsers.map((user: any) => ({
      id: user.id,
      name: user.displayName || user.name || user.username,
      department: user.department,
    })),
    departments: departments.map((department: any) => ({
      id: department.id,
      name: department.name,
    })),
    projects,
    items: items.map((item: any) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      hsnSac: item.hsnSac,
      buyPricePerUnit:
        item.buyPricePerUnit == null ? null : Number(item.buyPricePerUnit),
    })),
    warehouses: warehouses.map((warehouse: any) => ({
      id: warehouse.id,
      code: warehouse.warehouseCode,
      name: warehouse.locationName,
      address: warehouse.address,
    })),
  });
});
// ── Purchase Requests ────────────────────────────────────────────────────────
router.get("/purchase-requests", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userMap = await getUserMap(org);
  const vendorRecords = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.type, "vendor"));
  const vendorNameById = new Map(
    vendorRecords.map((vendor: any) => [
      String(vendor.id),
      String(vendor.name),
    ]),
  );

  const prs = await db
    .select()
    .from(purchaseRequestsTable)
    .where(eq(purchaseRequestsTable.organizationId, org))
    .orderBy(desc(purchaseRequestsTable.createdAt));

  return res.json(
    prs.map((pr: any) => {
      const createdDateObj = new Date(pr.createdAt);
      const formattedTime = createdDateObj.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      const formattedDate = createdDateObj.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const prCode =
        pr.prNumber || `PR-26-27-${String(pr.id).padStart(4, "0")}`;

      const vendorIds = Array.isArray(pr.vendorIds)
        ? pr.vendorIds.map(String).filter(Boolean)
        : [String(pr.vendorId || "")].filter(Boolean);
      const vendorNames = vendorIds
        .map((vendorId: string) => vendorNameById.get(vendorId))
        .filter(Boolean) as string[];
      if (!vendorNames.length && pr.vendorName) {
        vendorNames.push(pr.vendorName);
      }

      return {
        id: pr.id,
        vendorId: pr.vendorId,
        vendorIds,
        vendorNames,
        vendor: vendorNames.join(", ") || pr.vendorName,
        prNumber: prCode,
        version: pr.version || `Submitted V1 - ${formattedTime}`,
        reqDate: formattedDate,
        requiredDate: pr.requiredDate,
        priority: pr.priority,
        departmentId: pr.departmentId,
        department: pr.department,
        requestedBy:
          pr.requestedByName || userMap.get(pr.requestedByUserId) || "",
        requestedByUserId: pr.requestedByUserId,
        status: pr.status,
        itemName: pr.itemName,
        lineItems:
          Array.isArray(pr.lineItems) && pr.lineItems.length > 0
            ? pr.lineItems
            : [
                {
                  itemName: pr.itemName,
                  description: "",
                  quantity: Number(pr.quantity || 1),
                  unit: pr.unit,
                },
              ],
        quantity: Number(pr.quantity || 1),
        unit: pr.unit,
        project: pr.project || "",
        attachmentName: pr.attachmentName || "",
        notes: pr.notes || "",
        approvalNotes: pr.approvalNotes || "",
      };
    }),
  );
});

router.post("/purchase-requests", requireAuth, async (req, res) => {
  const org = orgId(req);
  const currentId = currentUserId(req);
  const requestedByUserId = Number(req.body.requestedByUserId || currentId);
  const userMap = await getUserMap(org);
  const userName = userMap.get(requestedByUserId) || "";
  if (!userName) {
    return res
      .status(400)
      .json({ error: "Please select a valid requested by user" });
  }

  const selectedItemId = Number(req.body.itemId || 0);
  const [selectedItem] = selectedItemId
    ? await db
        .select()
        .from(materialsTable)
        .where(eq(materialsTable.id, selectedItemId))
        .limit(1)
    : [null];
  if (selectedItemId && (!selectedItem || selectedItem.active === false)) {
    return res
      .status(400)
      .json({ error: "Selected inventory item was not found" });
  }
  const itemName = String(selectedItem?.name ?? req.body.itemName ?? "").trim();
  const quantity = Number(req.body.quantity ?? 0);
  const unit = String(selectedItem?.unit ?? req.body.unit ?? "").trim();
  const submittedLineItems = (
    Array.isArray(req.body.lineItems)
      ? req.body.lineItems
      : [{ itemName, quantity, unit, description: "" }]
  )
    .map((line: any) => ({
      itemId: line.itemId == null ? undefined : Number(line.itemId),
      itemName: String(line.itemName ?? line.item ?? "").trim(),
      description: String(line.description ?? "").trim(),
      quantity: Number(line.quantity ?? line.qty ?? 0),
      unit: String(line.unit ?? "").trim(),
    }))
    .filter((line: any) => line.itemName);
  const submittedVendorIds: string[] = Array.from(
    new Set<string>(
      (Array.isArray(req.body.vendorIds)
        ? req.body.vendorIds
        : [req.body.vendorId]
      )
        .map((id: unknown) => String(id ?? "").trim())
        .filter(Boolean),
    ),
  );
  const vendorRecordsForCreate = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.type, "vendor"));
  const vendorById = new Map(
    vendorRecordsForCreate.map((vendor: any) => [String(vendor.id), vendor]),
  );
  const selectedVendors = submittedVendorIds
    .map((vendorId) => vendorById.get(vendorId))
    .filter(Boolean);
  if (
    selectedVendors.length === 0 ||
    selectedVendors.length !== submittedVendorIds.length
  ) {
    return res
      .status(400)
      .json({ error: "One or more selected vendors were not found" });
  }
  const selectedVendor = selectedVendors[0] as any;
  const vendorId = String(selectedVendor.id);
  const vendorName = String(selectedVendor.name);
  const priority = String(req.body.priority ?? "Normal").trim();
  const selectedDepartmentId = Number(req.body.departmentId || 0);
  const [selectedDepartment] = selectedDepartmentId
    ? await db
        .select()
        .from(departmentsTable)
        .where(
          and(
            eq(departmentsTable.id, selectedDepartmentId),
            eq(departmentsTable.organizationId, org),
            eq(departmentsTable.status, "Active"),
          ),
        )
        .limit(1)
    : [null];
  if (selectedDepartmentId && !selectedDepartment) {
    return res
      .status(400)
      .json({ error: "Please select an active department" });
  }
  const departmentId = selectedDepartment?.id ?? null;
  const department = selectedDepartment?.name ?? "";
  const requiredDate = String(req.body.requiredDate ?? "").trim();
  const initialStatus = String(req.body.status ?? "Submitted").trim();

  if (!itemName)
    return res.status(400).json({ error: FLEX_API_MESSAGES.itemNameRequired });

  const now = new Date();
  const formattedTime = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const countRes = await db
    .select()
    .from(purchaseRequestsTable)
    .where(eq(purchaseRequestsTable.organizationId, org));
  const highestSequence = countRes.reduce((highest: number, request: any) => {
    const match = String(request.prNumber || "").match(/^PR-26-27-(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const prNum = `PR-26-27-${String(highestSequence + 1).padStart(4, "0")}`;
  const versionStr = `${initialStatus} V1 - ${formattedTime}`;

  const [created] = await db
    .insert(purchaseRequestsTable)
    .values({
      organizationId: org,
      vendorId,
      vendorName,
      vendorIds: submittedVendorIds,
      prNumber: prNum,
      version: versionStr,
      itemName,
      lineItems: submittedLineItems,
      quantity,
      unit,
      priority,
      departmentId,
      department,
      status: initialStatus,
      requestedByUserId,
      requestedByName: userName,
      requiredDate,
      project: String(req.body.project ?? ""),
      attachmentName: String(req.body.attachmentName ?? ""),
      termsConditions: String(req.body.termsConditions ?? ""),
      notes: String(req.body.notes ?? ""),
    })
    .returning();

  for (const selectedVendorRecord of selectedVendors as any[]) {
    await db.insert(vendorAvailabilityTable).values({
      organizationId: org,
      purchaseRequestId: created.id,
      vendorId: String(selectedVendorRecord.id),
      status: "Pending",
      updatedAt: new Date(),
    });
  }

  return res.status(201).json(created);
});

router.patch("/purchase-requests/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);
  const [pr] = await db
    .select()
    .from(purchaseRequestsTable)
    .where(
      and(
        eq(purchaseRequestsTable.id, id),
        eq(purchaseRequestsTable.organizationId, org),
      ),
    );

  if (!pr)
    return res
      .status(404)
      .json({ error: FLEX_API_MESSAGES.purchaseRequestNotFound });

  const updates: Record<string, unknown> = {};
  if (req.body.departmentId !== undefined) {
    const departmentId = Number(req.body.departmentId);
    const [department] = await db
      .select()
      .from(departmentsTable)
      .where(
        and(
          eq(departmentsTable.id, departmentId),
          eq(departmentsTable.organizationId, org),
          eq(departmentsTable.status, "Active"),
        ),
      )
      .limit(1);
    if (!department) {
      return res
        .status(400)
        .json({ error: "Please select an active department" });
    }
    updates.departmentId = department.id;
    updates.department = department.name;
  }
  for (const key of [
    "vendorId",
    "vendorName",
    "requestedByUserId",
    "requestedByName",
    "itemName",
    "quantity",
    "unit",
    "status",
    "priority",
    "notes",
    "approvalNotes",
    "requiredDate",
  ]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  // Update version on edit or status change
  if (req.body.status && req.body.status !== pr.status) {
    const formattedTime = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    updates["version"] = `${req.body.status} V1 - ${formattedTime}`;
  }

  const [updated] = await db
    .update(purchaseRequestsTable)
    .set(updates)
    .where(eq(purchaseRequestsTable.id, id))
    .returning();

  return res.json(updated);
});

router.post(
  "/purchase-requests/:id/convert-to-po",
  requireAuth,
  async (req, res) => {
    const org = orgId(req);
    const userId = currentUserId(req);
    const id = Number(req.params.id);

    const [pr] = await db
      .select()
      .from(purchaseRequestsTable)
      .where(
        and(
          eq(purchaseRequestsTable.id, id),
          eq(purchaseRequestsTable.organizationId, org),
        ),
      );

    if (!pr)
      return res
        .status(404)
        .json({ error: FLEX_API_MESSAGES.purchaseRequestNotFound });

    await db
      .update(purchaseRequestsTable)
      .set({ status: "Closed" })
      .where(eq(purchaseRequestsTable.id, id));

    const countRes = await db
      .select()
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.organizationId, org));
    const poNum = `PO-26-27-${String(countRes.length + 1).padStart(4, "0")}`;

    const [createdPo] = await db
      .insert(purchaseOrdersTable)
      .values({
        organizationId: org,
        poNumber: poNum,
        vendorId: pr.vendorId,
        vendorName: pr.vendorName,
        prReference: pr.prNumber,
        items: `${pr.itemName} (${pr.quantity} ${pr.unit})`,
        totalAmount: 0,
        status: "Issued",
        createdByUserId: userId,
      })
      .returning();

    return res.status(201).json({
      message: FLEX_API_MESSAGES.successfullyConvertedPrToPo,
      purchaseOrder: createdPo,
    });
  },
);

router.delete("/purchase-requests/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);
  await db
    .delete(purchaseRequestsTable)
    .where(
      and(
        eq(purchaseRequestsTable.id, id),
        eq(purchaseRequestsTable.organizationId, org),
      ),
    );
  return res.json({ success: true });
});

// ── Purchase Orders ──────────────────────────────────────────────────────────
router.get("/purchase-orders", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userMap = await getUserMap(org);
  const vendorContacts = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.type, "vendor"));
  const vendorContactById = new Map(
    vendorContacts.map((vendor: any) => [String(vendor.id), vendor]),
  );

  const pos = await db
    .select()
    .from(purchaseOrdersTable)
    .where(eq(purchaseOrdersTable.organizationId, org))
    .orderBy(desc(purchaseOrdersTable.createdAt));

  return res.json(
    pos.map((po: any) => {
      const createdDateObj = new Date(po.createdAt);
      const formattedDate = createdDateObj.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const vendorContact: any = vendorContactById.get(String(po.vendorId));
      const poNum = po.poNumber || `PO-26-27-${String(po.id).padStart(4, "0")}`;

      return {
        id: po.id,
        vendorId: po.vendorId,
        vendor: po.vendorName,
        contactPerson:
          po.contactPerson ||
          vendorContact?.company ||
          vendorContact?.name ||
          "",
        vendorGst: po.vendorGst || vendorContact?.gstin || "",
        vendorAddress: po.vendorAddress || vendorContact?.address || "",
        vendorPhone: po.vendorPhone || vendorContact?.phone || "",
        vendorWhatsapp:
          vendorContact?.whatsappNumber || vendorContact?.phone || "",
        placeOfSupply: po.placeOfSupply || vendorContact?.stateCode || "",
        poNumber: poNum,
        prReference: po.prReference,
        items: po.items,
        lineItems: Array.isArray(po.lineItems) ? po.lineItems : [],
        poDate: formattedDate,
        poDateValue: po.createdAt,
        deliveryDate: po.deliveryDate,
        subtotal: Number(po.subtotal),
        tax: Number(po.taxAmount || 0),
        cgstAmount: Number(po.taxAmount || 0) / 2,
        sgstAmount: Number(po.taxAmount || 0) / 2,
        grandTotal: Number(po.totalAmount || 0),
        paymentTerms: po.paymentTerms || "Net 30",
        shippingMethod: po.shippingMethod || "Road Transport",
        warehouse: po.warehouse,
        project: po.project,
        department: po.department,
        notes: po.notes || "",
        attachmentName: po.attachmentName || "",
        termsConditions: po.termsConditions || "",
        sentAt: po.sentAt || null,
        status: po.status,
        createdBy: userMap.get(po.createdByUserId) || "",
      };
    }),
  );
});

router.post("/purchase-orders", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = currentUserId(req);

  const vendorName = String(
    req.body.vendorName ?? req.body.vendor ?? "",
  ).trim();
  const vendorId = String(req.body.vendorId ?? "").trim();
  const prReference = String(req.body.prReference ?? "").trim();
  const selectedItemIds = Array.isArray(req.body.itemIds)
    ? req.body.itemIds.map(Number).filter(Boolean)
    : [];
  const selectedItems = selectedItemIds.length
    ? (await db.select().from(materialsTable)).filter((item: any) =>
        selectedItemIds.includes(Number(item.id)),
      )
    : [];
  const items = String(
    selectedItems.length
      ? selectedItems.map((item: any) => item.name).join(", ")
      : (req.body.items ?? ""),
  ).trim();
  const subtotal = Number(req.body.subtotal ?? 0);
  const taxAmount = Number(req.body.tax ?? req.body.taxAmount ?? 0);
  const totalAmount = Number(
    req.body.grandTotal ?? req.body.totalAmount ?? subtotal + taxAmount,
  );
  const deliveryDate = String(req.body.deliveryDate ?? "");
  const paymentTerms = String(req.body.paymentTerms ?? "Net 30").trim();
  const shippingMethod = String(
    req.body.shippingMethod ?? "Road Transport",
  ).trim();
  const warehouseId = Number(req.body.warehouseId || 0);
  const [selectedWarehouse] = warehouseId
    ? await db
        .select()
        .from(inventoryLocationsTable)
        .where(eq(inventoryLocationsTable.id, warehouseId))
        .limit(1)
    : [null];
  const warehouse = String(
    selectedWarehouse?.locationName ?? req.body.warehouse ?? "",
  ).trim();
  const project = String(req.body.project ?? "").trim();
  const department = String(req.body.department ?? "").trim();
  const status = String(req.body.status ?? "Issued").trim();
  const submittedLineItems = Array.isArray(req.body.lineItems)
    ? req.body.lineItems
    : [];

  if (!vendorId || !vendorName) {
    return res.status(400).json({ error: "Vendor is required" });
  }
  if (
    !submittedLineItems.length ||
    submittedLineItems.some(
      (line: any) => !String(line.description || "").trim(),
    )
  ) {
    return res
      .status(400)
      .json({ error: "At least one valid line item is required" });
  }
  if (
    ![subtotal, taxAmount, totalAmount].every(Number.isFinite) ||
    totalAmount <= 0
  ) {
    return res
      .status(400)
      .json({ error: "Purchase Order total must be greater than zero" });
  }
  if (!warehouse) {
    return res.status(400).json({ error: "Destination warehouse is required" });
  }

  const [creatingUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const countRes = await db
    .select()
    .from(purchaseOrdersTable)
    .where(eq(purchaseOrdersTable.organizationId, org));
  const poNumber =
    req.body.poNumber ||
    `PO-26-27-${String(countRes.length + 1).padStart(4, "0")}`;

  const [created] = await db
    .insert(purchaseOrdersTable)
    .values({
      organizationId: org,
      vendorId,
      vendorName,
      contactPerson: String(req.body.contactPerson ?? ""),
      vendorGst: String(req.body.vendorGst ?? ""),
      vendorAddress: String(req.body.vendorAddress ?? ""),
      vendorPhone: String(req.body.vendorPhone ?? ""),
      placeOfSupply: String(req.body.placeOfSupply ?? ""),
      poNumber,
      prReference,
      items,
      lineItems: submittedLineItems,
      subtotal,
      taxAmount,
      totalAmount,
      poDate: String(req.body.poDate ?? ""),
      deliveryDate,
      paymentTerms,
      shippingMethod,
      warehouse,
      project,
      department,
      notes: String(req.body.notes ?? ""),
      attachmentName: String(req.body.attachmentName ?? ""),
      termsConditions: String(req.body.termsConditions ?? ""),
      status,
      createdByUserId: creatingUser ? userId : null,
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
    "contactPerson",
    "vendorGst",
    "vendorAddress",
    "vendorPhone",
    "placeOfSupply",
    "prReference",
    "items",
    "lineItems",
    "subtotal",
    "taxAmount",
    "totalAmount",
    "poDate",
    "deliveryDate",
    "paymentTerms",
    "shippingMethod",
    "warehouse",
    "project",
    "department",
    "notes",
    "attachmentName",
    "termsConditions",
    "status",
  ]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (updates.status === "Sent") updates.sentAt = new Date();

  const [updated] = await db
    .update(purchaseOrdersTable)
    .set(updates)
    .where(
      and(
        eq(purchaseOrdersTable.id, id),
        eq(purchaseOrdersTable.organizationId, org),
      ),
    )
    .returning();

  return res.json(updated);
});

router.delete("/purchase-orders/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);
  await db
    .delete(purchaseOrdersTable)
    .where(
      and(
        eq(purchaseOrdersTable.id, id),
        eq(purchaseOrdersTable.organizationId, org),
      ),
    );
  return res.json({ success: true });
});

// ── Goods Receipts (GRN) ─────────────────────────────────────────────────────
router.get("/goods-receipts", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userMap = await getUserMap(org);
  const [grns, purchaseOrders] = await Promise.all([
    db
      .select()
      .from(goodsReceiptsTable)
      .where(eq(goodsReceiptsTable.organizationId, org))
      .orderBy(desc(goodsReceiptsTable.createdAt)),
    db
      .select()
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.organizationId, org)),
  ]);
  const completedPurchaseOrderIds = new Set(
    (purchaseOrders as any[])
      .filter((purchaseOrder) => purchaseOrder.status === "Completed")
      .map((purchaseOrder) => Number(purchaseOrder.id)),
  );
  return res.json(
    grns.map((g: any) => {
      const mappedPurchaseOrderIds =
        Array.isArray(g.purchaseOrderIds) && g.purchaseOrderIds.length
          ? g.purchaseOrderIds.map(Number).filter(Boolean)
          : g.purchaseOrderId
            ? [Number(g.purchaseOrderId)]
            : [];
      return {
        id: g.id,
        grnNumber: g.grnNumber,
        purchaseOrderId: g.purchaseOrderId,
        purchaseOrderIds:
          Array.isArray(g.purchaseOrderIds) && g.purchaseOrderIds.length
            ? g.purchaseOrderIds
            : g.purchaseOrderId
              ? [g.purchaseOrderId]
              : [],
        poReferences:
          Array.isArray(g.poReferences) && g.poReferences.length
            ? g.poReferences
            : g.poReference
              ? [g.poReference]
              : [],
        vendorIds:
          Array.isArray(g.vendorIds) && g.vendorIds.length
            ? g.vendorIds
            : g.vendorId
              ? [g.vendorId]
              : [],
        poReference: g.poReference,
        vendorId: g.vendorId || "",
        vendor: g.vendorName,
        itemsReceived: g.itemsReceived,
        lineItems: Array.isArray(g.lineItems) ? g.lineItems : [],
        receivedDate:
          g.receivedDate || new Date(g.createdAt).toISOString().slice(0, 10),
        inspectedByUserId: g.inspectedByUserId,
        inspectedBy:
          userMap.get(g.inspectedByUserId) || g.inspectedByName || "",
        notes: g.notes || "",
        attachmentName: g.attachmentName || "",
        receivedQuantity:
          g.receivedQuantity != null
            ? Number(g.receivedQuantity)
            : (Array.isArray(g.lineItems) ? g.lineItems : []).reduce(
                (sum: number, line: any) => sum + Number(line.receivedQty || 0),
                0,
              ),
        totalAmount: (Array.isArray(g.lineItems) ? g.lineItems : []).reduce(
          (sum: number, line: any) =>
            sum +
            Number(
              line.lineTotal ??
                Number(line.receivedQty || 0) * Number(line.unitPrice || 0),
            ),
          0,
        ),
        orderedQuantity:
          g.orderedQuantity != null
            ? Number(g.orderedQuantity)
            : (Array.isArray(g.lineItems) ? g.lineItems : []).reduce(
                (sum: number, line: any) => sum + Number(line.orderedQty || 0),
                0,
              ),
        remainingQuantity:
          g.remainingQuantity != null
            ? Number(g.remainingQuantity)
            : (Array.isArray(g.lineItems) ? g.lineItems : []).reduce(
                (sum: number, line: any) =>
                  sum +
                  Math.max(
                    0,
                    Number(line.orderedQty || 0) -
                      Number(line.alreadyReceived || 0) -
                      Number(line.receivedQty || 0),
                  ),
                0,
              ),
        status: mappedPurchaseOrderIds.some((purchaseOrderId: number) =>
          completedPurchaseOrderIds.has(purchaseOrderId),
        )
          ? "Complete"
          : g.status,
        createdAt: g.createdAt,
      };
    }),
  );
});

router.post("/goods-receipts", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = currentUserId(req);
  const purchaseOrderIds = [
    ...new Set(
      (Array.isArray(req.body.purchaseOrderIds)
        ? req.body.purchaseOrderIds
        : [req.body.purchaseOrderId]
      )
        .map(Number)
        .filter(Boolean),
    ),
  ];
  const inspectedByUserId = Number(req.body.inspectedByUserId);
  const receivedDate = String(req.body.receivedDate || "").trim();
  const requestedLines = Array.isArray(req.body.lineItems)
    ? req.body.lineItems
    : [];
  if (!purchaseOrderIds.length)
    return res
      .status(400)
      .json({ error: "At least one Purchase Order is required" });
  if (!inspectedByUserId)
    return res.status(400).json({ error: "Received By is required" });
  if (!receivedDate)
    return res.status(400).json({ error: "Received Date is required" });
  if (!requestedLines.length)
    return res
      .status(400)
      .json({ error: "At least one line item is required" });

  const purchaseOrders: any[] = [];
  for (const purchaseOrderId of purchaseOrderIds) {
    const [po] = await db
      .select()
      .from(purchaseOrdersTable)
      .where(
        and(
          eq(purchaseOrdersTable.id, purchaseOrderId),
          eq(purchaseOrdersTable.organizationId, org),
        ),
      )
      .limit(1);
    if (!po)
      return res
        .status(404)
        .json({ error: "A selected Purchase Order was not found" });
    purchaseOrders.push(po);
  }
  const vendorIds = [
    ...new Set(purchaseOrders.map((po) => String(po.vendorId))),
  ];
  for (const id of vendorIds) {
    const numericId = Number(id);
    const [vendor] = Number.isFinite(numericId)
      ? await db
          .select()
          .from(contactsTable)
          .where(
            and(
              eq(contactsTable.id, numericId),
              eq(contactsTable.type, "vendor"),
            ),
          )
          .limit(1)
      : [null];
    if (!vendor)
      return res
        .status(400)
        .json({ error: "A Purchase Order vendor is invalid" });
  }
  const [inspector] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.id, inspectedByUserId),
        eq(usersTable.organizationId, org),
      ),
    )
    .limit(1);
  if (!inspector)
    return res.status(400).json({ error: "Selected employee is invalid" });
  const activeWarehouses = await db
    .select()
    .from(inventoryLocationsTable)
    .where(eq(inventoryLocationsTable.isActive, true));
  const validWarehouses = new Set(
    activeWarehouses.map((warehouse: any) =>
      String(warehouse.locationName).trim().toLowerCase(),
    ),
  );

  const warehouseByName = new Map(
    activeWarehouses.map((warehouse: any) => [
      String(warehouse.locationName).trim().toLowerCase(),
      warehouse,
    ]),
  );

  const keyOf = (line: any) =>
    String(line.itemId || line.poLineId || line.id || line.description || "")
      .trim()
      .toLowerCase();
  const receiptLines: any[] = [];
  const priorByPo = new Map<number, Map<string, number>>();
  for (const po of purchaseOrders) {
    const orderedLines = Array.isArray(po.lineItems) ? po.lineItems : [];
    if (!orderedLines.length)
      return res
        .status(400)
        .json({ error: `${po.poNumber} has no receivable line items` });
    const prior = await db
      .select()
      .from(goodsReceiptsTable)
      .where(eq(goodsReceiptsTable.organizationId, org));
    const priorByItem = new Map<string, number>();
    for (const receipt of prior as any[])
      for (const line of Array.isArray(receipt.lineItems)
        ? receipt.lineItems.filter(
            (item: any) =>
              Number(item.purchaseOrderId || receipt.purchaseOrderId) ===
              Number(po.id),
          )
        : [])
        priorByItem.set(
          keyOf(line),
          (priorByItem.get(keyOf(line)) || 0) + Number(line.receivedQty || 0),
        );
    priorByPo.set(po.id, priorByItem);
  }

  for (const requested of requestedLines) {
    const po = purchaseOrders.find(
      (order) => Number(order.id) === Number(requested.purchaseOrderId),
    );
    if (!po)
      return res
        .status(400)
        .json({ error: "A received item has an invalid Purchase Order" });
    const ordered = (Array.isArray(po.lineItems) ? po.lineItems : []).find(
      (line: any) => keyOf(line) === keyOf(requested),
    );
    if (!ordered)
      return res
        .status(400)
        .json({ error: "A received item is not part of its Purchase Order" });
    const orderedQty = Number(ordered.qty ?? ordered.quantity ?? 0);
    const alreadyReceived = priorByPo.get(po.id)?.get(keyOf(requested)) || 0;
    const receivedQty = Number(requested.receivedQty || 0);
    const remaining = Math.max(0, orderedQty - alreadyReceived);
    if (!Number.isFinite(receivedQty) || receivedQty <= 0)
      return res
        .status(400)
        .json({ error: "Received quantity must be greater than zero" });
    if (receivedQty > remaining)
      return res.status(400).json({
        error: `Cannot receive ${receivedQty}. Only ${remaining} units remain for this purchase order item.`,
      });
    const warehouse = String(requested.warehouse || po.warehouse || "").trim();
    if (!warehouse || !validWarehouses.has(warehouse.toLowerCase()))
      return res
        .status(400)
        .json({ error: "Select a valid warehouse for every received item" });
    const materialId = Number(ordered.itemId ?? requested.itemId);
    if (!materialId)
      return res
        .status(400)
        .json({ error: "A received line is not linked to an Inventory item" });
    const [material] = await db
      .select()
      .from(materialsTable)
      .where(eq(materialsTable.id, materialId))
      .limit(1);
    if (!material)
      return res
        .status(400)
        .json({ error: "A received Inventory item was not found" });
    const unitPrice = Number(
      ordered.rate ?? ordered.price ?? requested.unitPrice ?? 0,
    );
    const cgstPct = Number(ordered.cgstPct || 0),
      sgstPct = Number(ordered.sgstPct || 0),
      igstPct = Number(ordered.igstPct || 0);
    const taxPct = cgstPct + sgstPct + igstPct;
    const baseAmount = receivedQty * unitPrice;
    receiptLines.push({
      purchaseOrderId: po.id,
      poNumber: po.poNumber,
      poLineId: ordered.id ?? null,
      itemId: materialId,
      description: String(ordered.description || requested.description || ""),
      orderedQty,
      alreadyReceived,
      receivedQty,
      unit: String(ordered.unit || requested.unit || ""),
      unitPrice,
      warehouse,
      cgstPct,
      sgstPct,
      igstPct,
      taxPct,
      lineTotal: baseAmount + (baseAmount * taxPct) / 100,
    });
  }

  const completionByPurchaseOrder = new Map<number, boolean>();
  let orderedQuantity = 0;
  let remainingQuantity = 0;
  for (const po of purchaseOrders) {
    const totals = new Map(priorByPo.get(po.id));
    for (const line of receiptLines.filter(
      (item) => item.purchaseOrderId === po.id,
    ))
      totals.set(
        keyOf(line),
        (totals.get(keyOf(line)) || 0) + line.receivedQty,
      );
    for (const line of po.lineItems) {
      const ordered = Number(line.qty ?? line.quantity ?? 0);
      orderedQuantity += ordered;
      remainingQuantity += Math.max(
        0,
        ordered - (totals.get(keyOf(line)) || 0),
      );
    }
    completionByPurchaseOrder.set(
      po.id,
      po.lineItems.every(
        (line: any) =>
          (totals.get(keyOf(line)) || 0) >=
          Number(line.qty ?? line.quantity ?? 0),
      ),
    );
  }
  const receiptStatus = purchaseOrders.every((po) =>
    completionByPurchaseOrder.get(po.id),
  )
    ? "Complete"
    : "Partial";

  const primaryPo = purchaseOrders[0];
  const values = {
    organizationId: org,
    purchaseOrderId: primaryPo.id,
    purchaseOrderIds,
    poReference: purchaseOrders.map((po) => po.poNumber).join(", "),
    poReferences: purchaseOrders.map((po) => po.poNumber),
    vendorId: vendorIds.join(", "),
    vendorIds,
    vendorName: [...new Set(purchaseOrders.map((po) => po.vendorName))].join(
      ", ",
    ),
    itemsReceived: receiptLines.map((line) => line.description).join(", "),
    lineItems: receiptLines,
    orderedQuantity,
    receivedQuantity: receiptLines.reduce(
      (sum, line) => sum + line.receivedQty,
      0,
    ),
    remainingQuantity,
    receivedDate,
    inspectedByUserId,
    inspectedByName: inspector.displayName || inspector.username || "",
    notes: String(req.body.notes || ""),
    attachmentName: String(req.body.attachmentName || ""),
    status: receiptStatus,
  };
  let created: any;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    const existingGrns = await db
      .select()
      .from(goodsReceiptsTable)
      .where(eq(goodsReceiptsTable.organizationId, org));
    const highestSequence = existingGrns.reduce(
      (highest: number, receipt: any) => {
        const match = String(receipt.grnNumber || "").match(
          /^GRN-26-27-(\d+)$/,
        );
        return match ? Math.max(highest, Number(match[1])) : highest;
      },
      0,
    );
    const grnNumber = `GRN-26-27-${String(highestSequence + 1).padStart(4, "0")}`;
    try {
      [created] = await db
        .insert(goodsReceiptsTable)
        .values({ ...values, grnNumber })
        .returning();
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  }
  if (!created)
    return res
      .status(409)
      .json({ error: "Could not generate a unique GRN number. Please retry." });

  const stockRollbacks: Array<{
    id: number;
    created: boolean;
    previousQuantity?: string;
  }> = [];
  const movementIds: number[] = [];
  const purchaseOrderRollbacks: Array<{ id: number; status: string }> = [];
  try {
    for (const line of receiptLines) {
      const warehouseRecord: any = warehouseByName.get(
        String(line.warehouse).trim().toLowerCase(),
      );
      const locationId = Number(warehouseRecord?.id);
      if (!locationId) throw new Error("Selected GRN warehouse was not found");

      const [existingStock] = await db
        .select()
        .from(inventoryTable)
        .where(
          and(
            eq(inventoryTable.materialId, Number(line.itemId)),
            eq(inventoryTable.locationId, locationId),
          ),
        )
        .limit(1);

      if (existingStock) {
        stockRollbacks.push({
          id: existingStock.id,
          created: false,
          previousQuantity: String(existingStock.quantityOnHand),
        });
        await db
          .update(inventoryTable)
          .set({
            quantityOnHand: String(
              Number(existingStock.quantityOnHand) + Number(line.receivedQty),
            ),
            lastUpdated: new Date(),
          })
          .where(eq(inventoryTable.id, existingStock.id));
      } else {
        const [newStock] = await db
          .insert(inventoryTable)
          .values({
            materialId: Number(line.itemId),
            locationId,
            quantityOnHand: String(line.receivedQty),
            costBasis: String(line.unitPrice || 0),
          })
          .returning();
        stockRollbacks.push({ id: newStock.id, created: true });
      }

      const [movement] = await db
        .insert(inventoryMovementsTable)
        .values({
          materialId: Number(line.itemId),
          fromLocationId: null,
          toLocationId: locationId,
          quantityKg: String(line.receivedQty),
          reason: "Inward",
          notes: `Goods Receipt ${created.grnNumber} (${line.poNumber})`,
          createdByUserId: userId,
        })
        .returning();
      movementIds.push(movement.id);
    }

    for (const po of purchaseOrders) {
      const complete = completionByPurchaseOrder.get(po.id);
      if (complete) {
        purchaseOrderRollbacks.push({ id: po.id, status: po.status });
        await db
          .update(purchaseOrdersTable)
          .set({ status: "Completed" })
          .where(
            and(
              eq(purchaseOrdersTable.id, po.id),
              eq(purchaseOrdersTable.organizationId, org),
            ),
          );
      }
    }

    // A GRN status represents the state of its purchase order. Once a PO is
    // fully received, keep every receipt mapped to that PO in sync so an
    // earlier partial receipt is not left looking incomplete.
    const completedPurchaseOrderIds = new Set(
      purchaseOrders
        .filter((po) => completionByPurchaseOrder.get(po.id))
        .map((po) => Number(po.id)),
    );
    if (completedPurchaseOrderIds.size) {
      const relatedReceipts = await db
        .select()
        .from(goodsReceiptsTable)
        .where(eq(goodsReceiptsTable.organizationId, org));
      for (const receipt of relatedReceipts as any[]) {
        const receiptPurchaseOrderIds =
          Array.isArray(receipt.purchaseOrderIds) &&
          receipt.purchaseOrderIds.length
            ? receipt.purchaseOrderIds.map(Number).filter(Boolean)
            : receipt.purchaseOrderId
              ? [Number(receipt.purchaseOrderId)]
              : [];
        if (
          receiptPurchaseOrderIds.some((purchaseOrderId: number) =>
            completedPurchaseOrderIds.has(purchaseOrderId),
          ) &&
          receipt.status !== "Complete"
        ) {
          await db
            .update(goodsReceiptsTable)
            .set({ status: "Complete" })
            .where(
              and(
                eq(goodsReceiptsTable.id, receipt.id),
                eq(goodsReceiptsTable.organizationId, org),
              ),
            );
        }
      }
    }
  } catch (error) {
    for (const rollback of [...purchaseOrderRollbacks].reverse())
      await db
        .update(purchaseOrdersTable)
        .set({ status: rollback.status })
        .where(eq(purchaseOrdersTable.id, rollback.id));
    for (const movementId of [...movementIds].reverse())
      await db
        .delete(inventoryMovementsTable)
        .where(eq(inventoryMovementsTable.id, movementId));
    for (const rollback of [...stockRollbacks].reverse()) {
      if (rollback.created)
        await db
          .delete(inventoryTable)
          .where(eq(inventoryTable.id, rollback.id));
      else
        await db
          .update(inventoryTable)
          .set({
            quantityOnHand: rollback.previousQuantity || "0",
            lastUpdated: new Date(),
          })
          .where(eq(inventoryTable.id, rollback.id));
    }
    await db
      .delete(goodsReceiptsTable)
      .where(eq(goodsReceiptsTable.id, created.id));
    throw error;
  }
  return res.status(201).json(created);
});
router.patch("/goods-receipts/:id", requireAuth, async (req, res) => {
  const org = orgId(req),
    id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  for (const key of ["receivedDate", "notes", "attachmentName", "status"])
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  const [updated] = await db
    .update(goodsReceiptsTable)
    .set(updates)
    .where(
      and(
        eq(goodsReceiptsTable.id, id),
        eq(goodsReceiptsTable.organizationId, org),
      ),
    )
    .returning();
  if (!updated)
    return res.status(404).json({ error: "Goods Receipt not found" });
  if (String(req.body.status || "") === "Complete") {
    const mappedPurchaseOrderIds =
      Array.isArray(updated.purchaseOrderIds) && updated.purchaseOrderIds.length
        ? updated.purchaseOrderIds.map(Number).filter(Boolean)
        : updated.purchaseOrderId
          ? [Number(updated.purchaseOrderId)]
          : [];
    for (const purchaseOrderId of mappedPurchaseOrderIds) {
      await db
        .update(purchaseOrdersTable)
        .set({ status: "Completed" })
        .where(
          and(
            eq(purchaseOrdersTable.id, purchaseOrderId),
            eq(purchaseOrdersTable.organizationId, org),
          ),
        );
    }

    const relatedReceipts = await db
      .select()
      .from(goodsReceiptsTable)
      .where(eq(goodsReceiptsTable.organizationId, org));
    const mappedPurchaseOrderIdSet = new Set(mappedPurchaseOrderIds);
    for (const receipt of relatedReceipts as any[]) {
      const receiptPurchaseOrderIds =
        Array.isArray(receipt.purchaseOrderIds) &&
        receipt.purchaseOrderIds.length
          ? receipt.purchaseOrderIds.map(Number).filter(Boolean)
          : receipt.purchaseOrderId
            ? [Number(receipt.purchaseOrderId)]
            : [];
      if (
        receiptPurchaseOrderIds.some((purchaseOrderId: number) =>
          mappedPurchaseOrderIdSet.has(purchaseOrderId),
        ) &&
        receipt.status !== "Complete"
      ) {
        await db
          .update(goodsReceiptsTable)
          .set({ status: "Complete" })
          .where(
            and(
              eq(goodsReceiptsTable.id, receipt.id),
              eq(goodsReceiptsTable.organizationId, org),
            ),
          );
      }
    }
  }
  return res.json(updated);
});

router.delete("/goods-receipts/:id", requireAuth, async (req, res) => {
  const org = orgId(req),
    id = Number(req.params.id);
  await db
    .delete(goodsReceiptsTable)
    .where(
      and(
        eq(goodsReceiptsTable.id, id),
        eq(goodsReceiptsTable.organizationId, org),
      ),
    );
  return res.json({ success: true });
});

// -- Purchase Invoices / Accounts ---------------------------------------------
function calculatePurchaseInvoiceMatchStatus(
  invoiceAmount: number,
  poAmount: number,
  grnAmount: number,
) {
  const poMatch = poAmount > 0 && Math.abs(invoiceAmount - poAmount) < 1;
  const grnMatch = grnAmount > 0 && Math.abs(invoiceAmount - grnAmount) < 1;
  if (poAmount > 0 && grnAmount > 0) {
    if (poMatch && grnMatch) return "3-Way Match";
    if (poMatch || grnMatch) return "Partial Match";
    return "Mismatch";
  }
  if ((poAmount > 0 && poMatch) || (grnAmount > 0 && grnMatch)) {
    return "2-Way Match";
  }
  return "Mismatch";
}

function isPurchaseInvoicePaymentEligible(invoice: any) {
  const status = String(invoice?.status || "Unpaid").trim().toLowerCase();
  return Number(invoice?.amount || 0) > 0 && status !== "paid";
}

function calculatePurchaseReturnPosting(
  billAmount: number,
  paidAmount: number,
  previousAdjustment: number,
  returnAmount: number,
) {
  const amount = Math.max(0, Number(billAmount || 0));
  const paid = Math.min(amount, Math.max(0, Number(paidAmount || 0)));
  const adjustment = Math.min(
    Math.max(0, amount - paid),
    Math.max(0, Number(previousAdjustment || 0)),
  );
  const returned = Math.max(0, Number(returnAmount || 0));
  const fullyPaidByPayment = amount > 0 && paid >= amount - 0.005;

  if (fullyPaidByPayment) {
    return { debitNoteAmount: returned, adjustedAmount: adjustment };
  }

  const remainingPayable = Math.max(0, amount - paid - adjustment);
  return {
    debitNoteAmount: 0,
    adjustedAmount: adjustment + Math.min(returned, remainingPayable),
  };
}
router.get("/purchase-invoices", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userMap = await getUserMap(org);
  const vendorMap = await getVendorMap();

  const invoices = await db
    .select()
    .from(purchaseInvoicesTable)
    .where(eq(purchaseInvoicesTable.organizationId, org))
    .orderBy(desc(purchaseInvoicesTable.createdAt));

  return res.json(
    invoices.map((inv: any) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      vendorId:
        inv.vendorId ||
        vendorMap.get(String(inv.vendorName).toLowerCase()) ||
        "",
      vendor: inv.vendorName,
      vendorAddress: inv.vendorAddress || "",
      vendorPhone: inv.vendorPhone || "",
      poReference: inv.poReference,
      grnReference: inv.grnReference,
      purchaseOrderId: inv.purchaseOrderId,
      goodsReceiptId: inv.goodsReceiptId,
      amount: Number(inv.amount),
      poAmount: Number(inv.poAmount || 0),
      grnAmount: Number(inv.grnAmount || 0),
      matchStatus: inv.matchStatus || "Mismatch",
      lineItems: Array.isArray(inv.lineItems) ? inv.lineItems : [],
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      status: inv.status,
      notes: inv.notes,
      attachmentName: inv.attachmentName || "",
      createdBy: userMap.get(inv.createdByUserId) || "",
    })),
  );
});

router.post("/purchase-invoices", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = currentUserId(req);
  const invoiceNumber = String(req.body.invoiceNumber ?? "").trim();
  const vendorName = String(
    req.body.vendorName ?? req.body.vendor ?? "",
  ).trim();
  const amount = Number(req.body.amount ?? 0);
  const poReference = String(req.body.poReference ?? "").trim();
  const poReferences = poReference
    .split(",")
    .map((reference) => reference.trim())
    .filter(Boolean);
  const grnReference = String(req.body.grnReference ?? "").trim();
  const grnReferences = grnReference
    .split(",")
    .map((reference) => reference.trim())
    .filter(Boolean);

  if (!invoiceNumber)
    return res
      .status(400)
      .json({ error: FLEX_API_MESSAGES.invoiceNumberRequired });
  if (!vendorName)
    return res
      .status(400)
      .json({ error: FLEX_API_MESSAGES.vendorNameRequired });
  if (!amount || amount <= 0)
    return res
      .status(400)
      .json({ error: FLEX_API_MESSAGES.amountMustBeGreaterThanZero });

  const existingInvoices = await db
    .select()
    .from(purchaseInvoicesTable)
    .where(eq(purchaseInvoicesTable.organizationId, org));
  const duplicateInvoice = (existingInvoices as any[]).some(
    (invoice) =>
      String(invoice.invoiceNumber || "")
        .trim()
        .toLowerCase() === invoiceNumber.toLowerCase() &&
      String(invoice.vendorName || "")
        .trim()
        .toLowerCase() === vendorName.toLowerCase(),
  );
  if (duplicateInvoice) {
    return res.status(409).json({
      error: `Invoice number "${invoiceNumber}" already exists for this vendor.`,
    });
  }

  const purchaseOrders = poReferences.length
    ? (await db
        .select()
        .from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.organizationId, org)))
        .filter((order) => poReferences.includes(order.poNumber))
    : [];
  const purchaseOrder = purchaseOrders[0];
  const goodsReceipts = grnReferences.length
    ? (await db
        .select()
        .from(goodsReceiptsTable)
        .where(eq(goodsReceiptsTable.organizationId, org)))
        .filter((receipt) => grnReferences.includes(receipt.grnNumber))
    : [];
  const goodsReceipt = goodsReceipts[0];

  if (poReferences.length && purchaseOrders.length !== poReferences.length)
    return res
      .status(400)
      .json({ error: "Selected purchase order was not found" });
  if (grnReferences.length && goodsReceipts.length !== grnReferences.length)
    return res
      .status(400)
      .json({ error: "Selected goods receipt was not found" });

  const grnPurchaseOrderIds = goodsReceipts.flatMap((receipt) =>
    Array.isArray(receipt.purchaseOrderIds) && receipt.purchaseOrderIds.length
      ? receipt.purchaseOrderIds.map(Number)
      : receipt.purchaseOrderId
        ? [Number(receipt.purchaseOrderId)]
        : [],
  );
  if (
    purchaseOrder &&
    goodsReceipt &&
    !grnPurchaseOrderIds.includes(Number(purchaseOrder.id))
  ) {
    return res.status(400).json({
      error:
        "Selected goods receipt is not linked to the selected purchase order",
    });
  }
  const selectedVendorNames = [
    vendorName,
    ...purchaseOrders.map((order) => order.vendorName),
    ...goodsReceipts.map((receipt) => receipt.vendorName),
  ]
    .filter(Boolean)
    .map((name) => String(name).trim().toLowerCase());
  if (new Set(selectedVendorNames).size > 1) {
    return res.status(400).json({
      error: "Purchase order, goods receipt and invoice vendor must match",
    });
  }

  const linkedPurchaseOrder =
    purchaseOrder ||
    (goodsReceipt?.purchaseOrderId
      ? (
          await db
            .select()
            .from(purchaseOrdersTable)
            .where(
              and(
                eq(purchaseOrdersTable.organizationId, org),
                eq(purchaseOrdersTable.id, goodsReceipt.purchaseOrderId),
              ),
            )
            .limit(1)
        )[0]
      : undefined);
  // Only an explicitly selected PO participates in matching. A GRN-linked PO is
  // retained for traceability, but GRN-only invoices remain a 2-way comparison.
  const poAmount = purchaseOrders.reduce(
    (sum, order) => sum + Number(order.totalAmount || 0),
    0,
  );
  const grnAmount = goodsReceipts.reduce(
    (receiptsTotal, receipt) =>
      receiptsTotal +
      (Array.isArray(receipt.lineItems) ? receipt.lineItems : []).reduce(
        (sum: number, line: any) =>
          sum +
          Number(
            line.lineTotal ??
              Number(line.receivedQty || 0) * Number(line.unitPrice || 0),
          ),
        0,
      ),
    0,
  );
  const matchStatus = calculatePurchaseInvoiceMatchStatus(
    amount,
    poAmount,
    grnAmount,
  );
  const submittedLineItems = Array.isArray(req.body.lineItems)
    ? req.body.lineItems
    : [];
  if (
    !submittedLineItems.length ||
    submittedLineItems.some(
      (line: any) =>
        !String(line.item || line.description || "").trim() ||
        !Number.isFinite(Number(line.qty ?? line.quantity)) ||
        Number(line.qty ?? line.quantity) <= 0,
    )
  ) {
    return res.status(400).json({
      error: "At least one valid invoice line item is required",
    });
  }
  const [creatingUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const [created] = await db
    .insert(purchaseInvoicesTable)
    .values({
      organizationId: org,
      invoiceNumber,
      vendorName,
      vendorAddress: String(req.body.vendorAddress ?? "").trim(),
      vendorPhone: String(req.body.vendorPhone ?? "").trim(),
      poReference,
      grnReference,
      purchaseOrderId: linkedPurchaseOrder?.id || null,
      goodsReceiptId: goodsReceipt?.id || null,
      vendorId: String(
        req.body.vendorId ??
          linkedPurchaseOrder?.vendorId ??
          goodsReceipt?.vendorId ??
          "",
      ),
      amount,
      poAmount,
      grnAmount,
      matchStatus,
      lineItems: submittedLineItems,
      invoiceDate: String(
        req.body.invoiceDate ?? new Date().toISOString().split("T")[0],
      ),
      dueDate: String(
        req.body.dueDate ?? new Date().toISOString().split("T")[0],
      ),
      status: String(req.body.status ?? "Unpaid"),
      notes: String(req.body.notes ?? ""),
      attachmentName: String(req.body.attachmentName ?? ""),
      createdByUserId: creatingUser ? userId : null,
    })
    .returning();

  return res.status(201).json(created);
});

router.patch("/purchase-invoices/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);

  const updates: Record<string, unknown> = {};
  for (const key of [
    "invoiceNumber",
    "vendorName",
    "poReference",
    "grnReference",
    "purchaseOrderId",
    "goodsReceiptId",
    "vendorId",
    "amount",
    "poAmount",
    "grnAmount",
    "matchStatus",
    "lineItems",
    "invoiceDate",
    "dueDate",
    "status",
    "notes",
  ]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const [updated] = await db
    .update(purchaseInvoicesTable)
    .set(updates)
    .where(
      and(
        eq(purchaseInvoicesTable.id, id),
        eq(purchaseInvoicesTable.organizationId, org),
      ),
    )
    .returning();

  return res.json(updated);
});

router.delete("/purchase-invoices/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);
  await db
    .delete(purchaseInvoicesTable)
    .where(
      and(
        eq(purchaseInvoicesTable.id, id),
        eq(purchaseInvoicesTable.organizationId, org),
      ),
    );
  return res.json({ success: true });
});

// ── Vendor Payments ──────────────────────────────────────────────────────────
router.get("/vendor-payments/outstanding-bills", requireAuth, async (req, res) => {
  const org = orgId(req);
  const vendorMap = await getVendorMap();
  const [invoices, existingBills, payments] = await Promise.all([
    db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.organizationId, org)),
    db.select().from(accountsPayableTable).where(eq(accountsPayableTable.organizationId, org)),
    db.select().from(vendorPaymentsTable).where(eq(vendorPaymentsTable.organizationId, org)),
  ]);
  const billNumbers = new Set(existingBills.map((bill: any) => bill.billNumber));
  for (const invoice of invoices as any[]) {
    if (
      !isPurchaseInvoicePaymentEligible(invoice) ||
      billNumbers.has(invoice.invoiceNumber) ||
      Number(invoice.amount || 0) <= 0
    )
      continue;
    await db.insert(accountsPayableTable).values({
      organizationId: org, vendorName: invoice.vendorName,
      billNumber: invoice.invoiceNumber, billDate: invoice.invoiceDate,
      dueDate: invoice.dueDate || invoice.invoiceDate, amount: Number(invoice.amount),
      paidAmount: invoice.status === "Paid" ? Number(invoice.amount) : 0,
      adjustedAmount: 0, status: invoice.status === "Paid" ? "Paid" : "Pending",
      entryType: "Bill", notes: `From invoice ${invoice.invoiceNumber}`,
      sourceType: "Purchase Invoice", sourceId: invoice.id,
    });
  }
  const bills = await db.select().from(accountsPayableTable).where(eq(accountsPayableTable.organizationId, org));
  const completedPaymentsByInvoice = new Map<string, number>();
  for (const payment of payments as any[]) {
    if (String(payment.status).toLowerCase() !== "completed") continue;
    const reference = String(payment.invoiceReference || "").trim().toLowerCase();
    if (!reference) continue;
    completedPaymentsByInvoice.set(
      reference,
      (completedPaymentsByInvoice.get(reference) || 0) + Number(payment.amount || 0),
    );
  }
  const invoiceByNumber = new Map(
    (invoices as any[]).map((invoice) => [
      String(invoice.invoiceNumber || "").trim().toLowerCase(),
      invoice,
    ]),
  );
  for (const bill of bills as any[]) {
    const reference = String(bill.billNumber || "").trim().toLowerCase();
    const invoice = invoiceByNumber.get(reference) as any;
    if (!invoice || bill.sourceType !== "Purchase Invoice") continue;
    const amount = Number(bill.amount || 0);
    const paidAmount = Math.min(
      amount,
      Math.max(
        Number(bill.paidAmount || 0),
        completedPaymentsByInvoice.get(reference) || 0,
      ),
    );
    const adjustedAmount = Number(bill.adjustedAmount || 0);
    const covered = paidAmount + adjustedAmount;
    const invoiceStatus =
      covered >= amount - 0.005
        ? "Paid"
        : covered > 0
          ? "Partially Paid"
          : "Unpaid";
    const billStatus =
      covered >= amount - 0.005
        ? "Paid"
        : covered > 0
          ? "Partial"
          : "Pending";
    if (
      paidAmount !== Number(bill.paidAmount || 0) ||
      billStatus !== bill.status
    ) {
      await db
        .update(accountsPayableTable)
        .set({
          paidAmount,
          status: billStatus,
        })
        .where(eq(accountsPayableTable.id, bill.id));
      bill.paidAmount = paidAmount;
      bill.status = billStatus;
    }
    if (invoice.status !== invoiceStatus) {
      await db
        .update(purchaseInvoicesTable)
        .set({ status: invoiceStatus })
        .where(eq(purchaseInvoicesTable.id, invoice.id));
      invoice.status = invoiceStatus;
    }
  }
  const eligibleInvoiceIds = new Set(
    (invoices as any[])
      .filter(isPurchaseInvoicePaymentEligible)
      .map((invoice) => Number(invoice.id)),
  );
  const eligibleInvoiceNumbers = new Set(
    (invoices as any[])
      .filter(isPurchaseInvoicePaymentEligible)
      .map((invoice) => String(invoice.invoiceNumber)),
  );
  return res.json((bills as any[]).filter((bill) =>
    bill.entryType !== "Debit Note" &&
    bill.sourceType === "Purchase Invoice" &&
    (eligibleInvoiceIds.has(Number(bill.sourceId)) ||
      eligibleInvoiceNumbers.has(String(bill.billNumber)))
  ).map((bill) => {
    const reference = String(bill.billNumber || "").trim().toLowerCase();
    const invoice = invoiceByNumber.get(reference) as any;
    const amount = Number(bill.amount || 0);
    const paidAmount = Math.min(
      amount,
      Math.max(
        Number(bill.paidAmount || 0),
        completedPaymentsByInvoice.get(reference) || 0,
      ),
    );
    const adjustedAmount = Number(bill.adjustedAmount || 0);
    return {
      ...bill,
      vendorId: vendorMap.get(String(bill.vendorName).toLowerCase()) || "",
      amount,
      paidAmount,
      adjustedAmount,
      outstanding: Math.max(0, amount - paidAmount - adjustedAmount),
    };
  }));
});

router.get("/vendor-payments", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userMap = await getUserMap(org);
  const vendorMap = await getVendorMap();

  const payments = await db
    .select()
    .from(vendorPaymentsTable)
    .where(eq(vendorPaymentsTable.organizationId, org))
    .orderBy(desc(vendorPaymentsTable.createdAt));

  return res.json(
    payments.map((p: any) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      vendorId: vendorMap.get(String(p.vendorName).toLowerCase()) || "",
      vendor: p.vendorName,
      invoiceReference: p.invoiceReference,
      amount: Number(p.amount),
      paymentMode: p.paymentMode,
      paymentDate: p.paymentDate,
      status: p.status,
      createdBy: userMap.get(p.createdByUserId) || "",
    })),
  );
});

router.post("/vendor-payments", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = currentUserId(req);
  const existingPayments = await db
    .select()
    .from(vendorPaymentsTable)
    .where(eq(vendorPaymentsTable.organizationId, org));
  const paymentNumber = String(
    req.body.paymentNumber ??
      `PAY-${String(existingPayments.length + 1).padStart(6, "0")}`,
  ).trim();
  const vendorName = String(
    req.body.vendorName ?? req.body.vendor ?? "",
  ).trim();
  const amount = Number(req.body.amount ?? 0);

  if (!paymentNumber)
    return res
      .status(400)
      .json({ error: FLEX_API_MESSAGES.paymentNumberRequired });
  if (!vendorName)
    return res
      .status(400)
      .json({ error: FLEX_API_MESSAGES.vendorNameRequired });

  const invoiceReference = String(req.body.invoiceReference ?? "").trim();
  if (!invoiceReference)
    return res.status(400).json({ error: "Outstanding bill is required" });
  const [matchedInvoice] = await db
    .select()
    .from(purchaseInvoicesTable)
    .where(
      and(
        eq(purchaseInvoicesTable.organizationId, org),
        eq(purchaseInvoicesTable.invoiceNumber, invoiceReference),
      ),
    )
    .limit(1);
  if (!matchedInvoice || !isPurchaseInvoicePaymentEligible(matchedInvoice))
    return res.status(400).json({
      error: "Only unpaid purchase invoices can be paid",
    });
  const [bill] = await db
    .select()
    .from(accountsPayableTable)
    .where(
      and(
        eq(accountsPayableTable.organizationId, org),
        eq(accountsPayableTable.billNumber, invoiceReference),
      ),
    )
    .limit(1);
  if (!bill)
    return res.status(404).json({ error: "Outstanding bill not found" });
  const outstanding = Math.max(
    0,
    Number(bill.amount || 0) -
      Number(bill.paidAmount || 0) -
      Number(bill.adjustedAmount || 0),
  );
  if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding)
    return res.status(400).json({
      error: `Payment must be greater than zero and cannot exceed ₹${outstanding.toLocaleString("en-IN")}`,
    });

  const [created] = await db
    .insert(vendorPaymentsTable)
    .values({
      organizationId: org,
      paymentNumber,
      vendorName,
      invoiceReference,
      amount,
      paymentMode: String(req.body.paymentMode ?? "UPI / NetBanking"),
      bankAccount: String(req.body.bankAccount ?? ""),
      transactionReference: String(req.body.transactionReference ?? ""),
      notes: String(req.body.notes ?? ""),
      attachmentName: String(req.body.attachmentName ?? ""),
      paymentDate: String(
        req.body.paymentDate ?? new Date().toLocaleDateString("en-IN"),
      ),
      status: String(req.body.status ?? "Completed"),
      createdByUserId: userId,
    })
    .returning();

  const paidAmount = Number(bill.paidAmount || 0) + amount;
  const covered = paidAmount + Number(bill.adjustedAmount || 0);
  await db
    .update(accountsPayableTable)
    .set({
      paidAmount,
      status: covered >= Number(bill.amount || 0) ? "Paid" : "Partial",
    })
    .where(eq(accountsPayableTable.id, bill.id));
  if (covered >= Number(bill.amount || 0)) {
    await db
      .update(purchaseInvoicesTable)
      .set({ status: "Paid" })
      .where(
        and(
          eq(purchaseInvoicesTable.organizationId, org),
          eq(purchaseInvoicesTable.invoiceNumber, invoiceReference),
        ),
      );
  }

  return res.status(201).json(created);
});

router.patch("/vendor-payments/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);

  const updates: Record<string, unknown> = {};
  for (const key of [
    "paymentNumber",
    "vendorName",
    "invoiceReference",
    "amount",
    "paymentMode",
    "paymentDate",
    "status",
  ]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const [updated] = await db
    .update(vendorPaymentsTable)
    .set(updates)
    .where(
      and(
        eq(vendorPaymentsTable.id, id),
        eq(vendorPaymentsTable.organizationId, org),
      ),
    )
    .returning();

  return res.json(updated);
});

router.delete("/vendor-payments/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);
  await db
    .delete(vendorPaymentsTable)
    .where(
      and(
        eq(vendorPaymentsTable.id, id),
        eq(vendorPaymentsTable.organizationId, org),
      ),
    );
  return res.json({ success: true });
});

// ── Purchase Returns ─────────────────────────────────────────────────────────
router.get("/purchase-returns", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userMap = await getUserMap(org);
  const vendorMap = await getVendorMap();

  const returns = await db
    .select()
    .from(purchaseReturnsTable)
    .where(eq(purchaseReturnsTable.organizationId, org))
    .orderBy(desc(purchaseReturnsTable.createdAt));

  return res.json(
    returns.map((r: any) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      vendorId:
        r.vendorId || vendorMap.get(String(r.vendorName).toLowerCase()) || "",
      vendor: r.vendorName,
      vendorAddress: r.vendorAddress || "",
      vendorPhone: r.vendorPhone || "",
      invoiceReference: r.invoiceReference || "",
      grnReference: r.grnReference,
      reason: r.reason,
      refundAmount: Number(r.refundAmount),
      lineItems: Array.isArray(r.lineItems) ? r.lineItems : [],
      notes: r.notes || "",
      attachmentName: r.attachmentName || "",
      status: r.status,
      returnDate:
        r.returnDate ||
        new Date(r.createdAt).toISOString().slice(0, 10),
      createdBy: userMap.get(r.createdByUserId) || "",
    })),
  );
});

router.post("/purchase-returns", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = currentUserId(req);
  const existingReturns = await db
    .select()
    .from(purchaseReturnsTable)
    .where(eq(purchaseReturnsTable.organizationId, org));
  const returnNumber = String(
    req.body.returnNumber ??
      `RET-${String(existingReturns.length + 1).padStart(6, "0")}`,
  ).trim();
  const vendorName = String(
    req.body.vendorName ?? req.body.vendor ?? "",
  ).trim();
  const reason = String(req.body.reason ?? "").trim();

  if (!returnNumber)
    return res
      .status(400)
      .json({ error: FLEX_API_MESSAGES.returnNumberRequired });
  if (!vendorName)
    return res
      .status(400)
      .json({ error: FLEX_API_MESSAGES.vendorNameRequired });
  if (!reason)
    return res.status(400).json({ error: "Reason for return is required" });
  const lineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : [];
  if (
    !lineItems.length ||
    lineItems.some(
      (line: any) =>
        !String(line.item || line.description || "").trim() ||
        Number(line.returnQty || 0) <= 0 ||
        Number(line.returnQty || 0) > Number(line.receivedQty || 0) ||
        !String(line.warehouse || "").trim(),
    )
  )
    return res.status(400).json({
      error:
        "Add at least one valid return line with warehouse and return quantity",
    });

  // The financial return value must always follow the quantities actually
  // returned. Do not trust a separately submitted refund total.
  const calculatedReturnAmount = Number(
    lineItems
      .reduce((total: number, line: any) => {
        const quantity = Number(line.returnQty || 0);
        const rate = Number(line.rate || 0);
        const taxPercent =
          Number(line.cgstPct ?? line.cgstPercent ?? 0) +
          Number(line.sgstPct ?? line.sgstPercent ?? 0) +
          Number(line.igstPct ?? line.igstPercent ?? 0);
        const taxableAmount = quantity * rate;
        return total + taxableAmount * (1 + taxPercent / 100);
      }, 0)
      .toFixed(2),
  );

  const [created] = await db
    .insert(purchaseReturnsTable)
    .values({
      organizationId: org,
      returnNumber,
      vendorName,
      vendorId: String(req.body.vendorId ?? ""),
      vendorAddress: String(req.body.vendorAddress ?? ""),
      vendorPhone: String(req.body.vendorPhone ?? ""),
      invoiceReference: String(req.body.invoiceReference ?? ""),
      grnReference: String(req.body.grnReference ?? ""),
      reason,
      refundAmount: calculatedReturnAmount,
      returnDate: String(
        req.body.returnDate ?? new Date().toISOString().slice(0, 10),
      ),
      lineItems,
      notes: String(req.body.notes ?? ""),
      attachmentName: String(req.body.attachmentName ?? ""),
      status: String(req.body.status ?? "Draft"),
      createdByUserId: userId,
    })
    .returning();

  const returnAmount = Number(created.refundAmount || 0);
  // Draft returns do not affect Accounts Payable. Accounting is posted only
  // after the return is confirmed as Product Dispatched.
  if (returnAmount > 0 && created.status === "Product Dispatched") {
    const requestedInvoiceReference = String(
      created.invoiceReference || "",
    ).trim();
    const linkedInvoice = requestedInvoiceReference
      ? (
          await db
            .select()
            .from(purchaseInvoicesTable)
            .where(
              and(
                eq(purchaseInvoicesTable.organizationId, org),
                eq(
                  purchaseInvoicesTable.invoiceNumber,
                  requestedInvoiceReference,
                ),
              ),
            )
            .limit(1)
        )[0]
      : created.grnReference
        ? (
            await db
              .select()
              .from(purchaseInvoicesTable)
              .where(eq(purchaseInvoicesTable.organizationId, org))
          ).find(
            (invoice: any) =>
              String(invoice.grnReference || "") ===
              String(created.grnReference),
          )
        : undefined;
    const againstBillNumber = String(
      linkedInvoice?.invoiceNumber || requestedInvoiceReference,
    );
    let debitNoteAmount = 0;

    if (againstBillNumber) {
      const [bill] = await db
        .select()
        .from(accountsPayableTable)
        .where(
          and(
            eq(accountsPayableTable.organizationId, org),
            eq(accountsPayableTable.billNumber, againstBillNumber),
            eq(accountsPayableTable.vendorName, vendorName),
          ),
        )
        .limit(1);
      if (bill) {
        const billAmount = Number(bill.amount || 0);
        const paidAmount = Number(bill.paidAmount || 0);
        const posting = calculatePurchaseReturnPosting(
          billAmount,
          paidAmount,
          Number(bill.adjustedAmount || 0),
          returnAmount,
        );
        debitNoteAmount = posting.debitNoteAmount;

        // A partially paid bill stays in Pending Bills and the value of only
        // the returned quantity is applied to its adjustment.
        if (debitNoteAmount === 0) {
          const adjustedAmount = posting.adjustedAmount;
          const covered = paidAmount + adjustedAmount;
          await db
            .update(accountsPayableTable)
            .set({
              adjustedAmount,
              status: covered >= billAmount ? "Paid" : "Partial",
            })
            .where(eq(accountsPayableTable.id, bill.id));
        }
      } else if (linkedInvoice) {
        const invoiceAmount = Number(linkedInvoice.amount || 0);
        const invoicePaid = linkedInvoice.status === "Paid";
        const adjustedAmount = invoicePaid
          ? 0
          : Math.min(invoiceAmount, returnAmount);
        debitNoteAmount = invoicePaid ? returnAmount : 0;
        await db.insert(accountsPayableTable).values({
          organizationId: org,
          vendorName,
          billNumber: againstBillNumber,
          billDate: linkedInvoice.invoiceDate,
          dueDate: linkedInvoice.dueDate || linkedInvoice.invoiceDate,
          amount: invoiceAmount,
          paidAmount: linkedInvoice.status === "Paid" ? invoiceAmount : 0,
          adjustedAmount,
          status:
            (linkedInvoice.status === "Paid" ? invoiceAmount : 0) +
                adjustedAmount >=
              invoiceAmount
              ? "Paid"
              : adjustedAmount > 0
                ? "Partial"
                : "Pending",
          entryType: "Bill",
          notes: `From invoice ${againstBillNumber}`,
          sourceType: "Purchase Invoice",
          sourceId: linkedInvoice.id,
        });
      }
    }

    if (debitNoteAmount > 0) {
      await db.insert(accountsPayableTable).values({
        organizationId: org,
        vendorName,
        billNumber: created.returnNumber,
        againstBillNumber,
        billDate: created.returnDate,
        dueDate: created.returnDate,
        amount: debitNoteAmount,
        paidAmount: 0,
        adjustedAmount: debitNoteAmount,
        status: "Paid",
        entryType: "Debit Note",
        notes: `Purchase return ${created.returnNumber}: ${reason}`,
        sourceType: "Purchase Return",
        sourceId: created.id,
      });
    }
  }

  return res.status(201).json(created);
});

router.patch("/purchase-returns/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = currentUserId(req);
  const id = Number(req.params.id);

  const [existingReturn] = await db
    .select()
    .from(purchaseReturnsTable)
    .where(
      and(
        eq(purchaseReturnsTable.id, id),
        eq(purchaseReturnsTable.organizationId, org),
      ),
    )
    .limit(1);
  if (!existingReturn)
    return res.status(404).json({ error: "Purchase return not found" });

  const requestedStatus =
    req.body.status === undefined ? undefined : String(req.body.status);
  if (
    requestedStatus &&
    !["Product Dispatched", "Rejected"].includes(requestedStatus)
  )
    return res.status(400).json({ error: "Invalid purchase return status" });
  if (
    requestedStatus &&
    !["Draft", "Requested"].includes(String(existingReturn.status))
  )
    return res.status(409).json({
      error: `This purchase return is already ${existingReturn.status}`,
    });

  if (requestedStatus === "Product Dispatched") {
    const returnLines = Array.isArray(existingReturn.lineItems)
      ? existingReturn.lineItems
      : [];
    const activeWarehouses = await db
      .select()
      .from(inventoryLocationsTable)
      .where(eq(inventoryLocationsTable.isActive, true));
    const warehouseByName = new Map(
      activeWarehouses.map((warehouse: any) => [
        String(warehouse.locationName).trim().toLowerCase(),
        warehouse,
      ]),
    );
    const materials = await db.select().from(materialsTable);
    const dispatches: Array<{
      materialId: number;
      locationId: number;
      inventoryId: number;
      currentQuantity: number;
      returnQuantity: number;
    }> = [];

    for (const line of returnLines as any[]) {
      const returnQuantity = Number(line.returnQty || 0);
      const material = Number(line.itemId)
        ? materials.find((item) => Number(item.id) === Number(line.itemId))
        : materials.find(
            (item) =>
              String(item.name).trim().toLowerCase() ===
              String(line.item || line.description || "").trim().toLowerCase(),
          );
      const warehouse: any = warehouseByName.get(
        String(line.warehouse || "").trim().toLowerCase(),
      );
      if (!material)
        return res.status(400).json({
          error: `${line.item || "A returned item"} was not found in Item & Product Master`,
        });
      if (!warehouse)
        return res.status(400).json({
          error: `Warehouse ${line.warehouse || ""} was not found`,
        });
      const [stock] = await db
        .select()
        .from(inventoryTable)
        .where(
          and(
            eq(inventoryTable.materialId, Number(material.id)),
            eq(inventoryTable.locationId, Number(warehouse.id)),
          ),
        )
        .limit(1);
      const currentQuantity = Number(stock?.quantityOnHand || 0);
      const existingDispatch = dispatches.find(
        (dispatch) =>
          dispatch.materialId === Number(material.id) &&
          dispatch.locationId === Number(warehouse.id),
      );
      const combinedReturnQuantity =
        (existingDispatch?.returnQuantity || 0) + returnQuantity;
      if (!stock || currentQuantity < combinedReturnQuantity)
        return res.status(400).json({
          error: `Only ${currentQuantity} units of ${material.name} are available in ${warehouse.locationName}`,
        });
      if (existingDispatch) {
        existingDispatch.returnQuantity = combinedReturnQuantity;
      } else {
        dispatches.push({
          materialId: Number(material.id),
          locationId: Number(warehouse.id),
          inventoryId: Number(stock.id),
          currentQuantity,
          returnQuantity,
        });
      }
    }

    for (const dispatch of dispatches) {
      await db
        .update(inventoryTable)
        .set({
          quantityOnHand: String(
            dispatch.currentQuantity - dispatch.returnQuantity,
          ),
          lastUpdated: new Date(),
        })
        .where(eq(inventoryTable.id, dispatch.inventoryId));
      await db.insert(inventoryMovementsTable).values({
        materialId: dispatch.materialId,
        fromLocationId: dispatch.locationId,
        toLocationId: null,
        quantityKg: String(dispatch.returnQuantity),
        reason: "Purchase Return",
        notes: `Product dispatched for ${existingReturn.returnNumber}`,
        createdByUserId: userId,
      });
    }

    const returnAmount = Number(existingReturn.refundAmount || 0);
    const invoiceReference = String(
      existingReturn.invoiceReference || "",
    ).trim();
    const [linkedInvoice] = invoiceReference
      ? await db
          .select()
          .from(purchaseInvoicesTable)
          .where(
            and(
              eq(purchaseInvoicesTable.organizationId, org),
              eq(purchaseInvoicesTable.invoiceNumber, invoiceReference),
            ),
          )
          .limit(1)
      : [];
    const againstBillNumber = String(
      linkedInvoice?.invoiceNumber || invoiceReference,
    );

    if (returnAmount > 0 && againstBillNumber) {
      let [bill] = await db
        .select()
        .from(accountsPayableTable)
        .where(
          and(
            eq(accountsPayableTable.organizationId, org),
            eq(accountsPayableTable.billNumber, againstBillNumber),
            eq(accountsPayableTable.vendorName, existingReturn.vendorName),
          ),
        )
        .limit(1);

      if (!bill && linkedInvoice) {
        const invoiceAmount = Number(linkedInvoice.amount || 0);
        const invoiceIsPaid =
          String(linkedInvoice.status).trim().toLowerCase() === "paid";
        [bill] = await db
          .insert(accountsPayableTable)
          .values({
            organizationId: org,
            vendorName: existingReturn.vendorName,
            billNumber: againstBillNumber,
            billDate: linkedInvoice.invoiceDate,
            dueDate: linkedInvoice.dueDate || linkedInvoice.invoiceDate,
            amount: invoiceAmount,
            paidAmount: invoiceIsPaid ? invoiceAmount : 0,
            adjustedAmount: 0,
            status: invoiceIsPaid ? "Paid" : "Pending",
            entryType: "Bill",
            notes: `From invoice ${againstBillNumber}`,
            sourceType: "Purchase Invoice",
            sourceId: linkedInvoice.id,
          })
          .returning();
      }

      if (bill) {
        const billAmount = Number(bill.amount || 0);
        const paidAmount = Number(bill.paidAmount || 0);
        const previousAdjustment = Number(bill.adjustedAmount || 0);
        const isPaid =
          String(bill.status).trim().toLowerCase() === "paid" ||
          paidAmount >= billAmount - 0.005;

        if (isPaid) {
          const existingDebitNotes = await db
            .select()
            .from(accountsPayableTable)
            .where(eq(accountsPayableTable.organizationId, org));
          const alreadyPosted = existingDebitNotes.some(
            (entry: any) =>
              entry.entryType === "Debit Note" &&
              entry.sourceType === "Purchase Return" &&
              Number(entry.sourceId) === Number(existingReturn.id),
          );
          if (!alreadyPosted) {
            await db.insert(accountsPayableTable).values({
              organizationId: org,
              vendorName: existingReturn.vendorName,
              billNumber: existingReturn.returnNumber,
              againstBillNumber,
              billDate: existingReturn.returnDate,
              dueDate: existingReturn.returnDate,
              amount: returnAmount,
              paidAmount: 0,
              adjustedAmount: returnAmount,
              status: "Paid",
              entryType: "Debit Note",
              notes: `Purchase return ${existingReturn.returnNumber}: ${existingReturn.reason}`,
              sourceType: "Purchase Return",
              sourceId: existingReturn.id,
            });
          }
        } else {
          const outstanding = Math.max(
            0,
            billAmount - paidAmount - previousAdjustment,
          );
          const adjustedAmount =
            previousAdjustment + Math.min(returnAmount, outstanding);
          await db
            .update(accountsPayableTable)
            .set({
              adjustedAmount,
              status:
                paidAmount + adjustedAmount >= billAmount
                  ? "Paid"
                  : paidAmount > 0 || adjustedAmount > 0
                    ? "Partial"
                    : "Pending",
            })
            .where(eq(accountsPayableTable.id, bill.id));
        }
      }
    }
  }

  const updates: Record<string, unknown> = {};
  for (const key of [
    "returnNumber",
    "vendorName",
    "grnReference",
    "reason",
    "refundAmount",
    "status",
  ]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const [updated] = await db
    .update(purchaseReturnsTable)
    .set(updates)
    .where(
      and(
        eq(purchaseReturnsTable.id, id),
        eq(purchaseReturnsTable.organizationId, org),
      ),
    )
    .returning();

  return res.json(updated);
});

router.delete("/purchase-returns/:id", requireAuth, async (req, res) => {
  const org = orgId(req);
  const id = Number(req.params.id);
  await db
    .delete(purchaseReturnsTable)
    .where(
      and(
        eq(purchaseReturnsTable.id, id),
        eq(purchaseReturnsTable.organizationId, org),
      ),
    );
  return res.json({ success: true });
});

export default router;
