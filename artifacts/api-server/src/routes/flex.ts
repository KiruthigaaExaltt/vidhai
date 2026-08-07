import { Router } from "express";
import { db, eq, desc, and } from "@workspace/db";
import { purchaseRequestsTable, contactsTable, usersTable } from "@workspace/db";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

function orgId(req: any): number {
  return Number((req.session as any)?.organizationId ?? 1);
}

function prCode(id: number) {
  return `PR #${id}`;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
// NOTE: purchaseOrders / goodsReceipts / purchaseInvoices / vendorPayments /
// purchaseReturns tables don't exist yet — those counts are stubbed at 0 until
// those modules are built. Only Purchase Requests and vendor data are real.
router.get("/dashboard", requireAuth, async (req, res) => {
  const org = orgId(req);

  const prs = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.organizationId, org));
  const pendingPurchaseRequests = prs.filter((pr: any) => pr.status === "Submitted").length;

  const vendors = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.type, "vendor")));

  const recentPrs = [...prs]
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 7);

  const recentActivities = recentPrs.map((pr: any) => ({
    id: pr.id,
    title: `${prCode(pr.id)} - ${pr.itemName}`,
    timestamp: new Date(pr.createdAt).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    status: pr.status,
  }));

  return res.json({
    pendingPurchaseRequests,
    openVendorResponses: 0,
    pendingPOs: 0,
    pendingGRNs: 0,
    unpaidInvoices: 0,
    totalSpend: 0,
    totalSpendChangePercent: 0,
    purchaseReturns: 0,
    activeVendors: vendors.length,
    topVendors: vendors.slice(0, 5).map((v: any) => ({ id: v.id, name: v.name, spend: 0, onTimePercent: 0, returns: 0 })),
    recentActivities,
  });
});

// ── Purchase Requests ────────────────────────────────────────────────────────
router.get("/purchase-requests", requireAuth, async (req, res) => {
  const org = orgId(req);
  const prs = await db
    .select()
    .from(purchaseRequestsTable)
    .where(eq(purchaseRequestsTable.organizationId, org))
    .orderBy(desc(purchaseRequestsTable.createdAt));

  const userIds = [...new Set(prs.map((pr: any) => pr.requestedByUserId).filter(Boolean))];
  const requesters = userIds.length
    ? await db.select().from(usersTable).where(eq(usersTable.organizationId, org))
    : [];
  const requesterName = (id: number) => requesters.find((u: any) => u.id === id)?.displayName ?? "—";

  return res.json(
    prs.map((pr: any) => ({
      id: pr.id,
      code: prCode(pr.id),
      title: pr.itemName,
      requestedBy: requesterName(pr.requestedByUserId),
      quantity: Number(pr.quantity),
      unit: pr.unit,
      status: pr.status,
      createdAt: new Date(pr.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    }))
  );
});

router.post("/purchase-requests", requireAuth, async (req, res) => {
  const org = orgId(req);
  const userId = Number((req.session as any).userId);
  const itemName = String(req.body.itemName ?? "").trim();
  const quantity = Number(req.body.quantity);
  const unit = String(req.body.unit ?? "units").trim();

  if (!itemName) return res.status(400).json({ error: "Item name is required" });
  if (!quantity || quantity <= 0) return res.status(400).json({ error: "Quantity must be greater than 0" });

  const [created] = await db
    .insert(purchaseRequestsTable)
    .values({
      organizationId: org,
      itemName,
      quantity,
      unit,
      status: "Draft",
      requestedByUserId: userId,
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
  for (const key of ["itemName", "quantity", "unit", "status", "notes"]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const validStatuses = ["Draft", "Submitted", "Approved", "Rejected", "Closed"];
  if (updates.status && !validStatuses.includes(updates.status as string)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const [updated] = await db
    .update(purchaseRequestsTable)
    .set(updates)
    .where(eq(purchaseRequestsTable.id, id))
    .returning();

  return res.json(updated);
});

export default router;