import { Router } from "express";
import {
  and,
  contactsTable,
  db,
  eq,
  purchaseOrdersTable,
  purchaseRequestsTable,
  vendorAvailabilityTable,
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
const orgId = (req: any) => Number((req.session as any)?.organizationId ?? 1);
const userId = (req: any) => Number((req.session as any)?.userId ?? 1);
const confirmationInProgress = new Set<number>();

router.get("/vendor-availability", requireAuth, async (req, res) => {
  const org = orgId(req);
  const [requests, contacts] = await Promise.all([
    db
      .select()
      .from(purchaseRequestsTable)
      .where(eq(purchaseRequestsTable.organizationId, org)),
    db.select().from(contactsTable).where(eq(contactsTable.type, "vendor")),
  ]);
  let rows = await db
    .select()
    .from(vendorAvailabilityTable)
    .where(eq(vendorAvailabilityTable.organizationId, org));
  const keys = new Set(
    rows.map((row: any) => `${row.purchaseRequestId}:${String(row.vendorId)}`),
  );
  for (const request of requests as any[]) {
    const vendorIds =
      Array.isArray(request.vendorIds) && request.vendorIds.length
        ? request.vendorIds.map(String)
        : [String(request.vendorId || "")].filter(Boolean);
    for (const vendorId of vendorIds) {
      const key = `${request.id}:${vendorId}`;
      if (keys.has(key)) continue;
      const [created] = await db
        .insert(vendorAvailabilityTable)
        .values({
          organizationId: org,
          purchaseRequestId: request.id,
          vendorId,
          status: "Pending",
          updatedAt: new Date(),
        })
        .returning();
      rows.push(created);
      keys.add(key);
    }
  }
  const requestById = new Map(
    requests.map((request: any) => [request.id, request]),
  );
  const contactById = new Map(
    contacts.map((contact: any) => [String(contact.id), contact]),
  );
  return res.json(
    rows.map((availability: any) => {
      const request: any = requestById.get(availability.purchaseRequestId);
      const vendor: any = contactById.get(String(availability.vendorId));
      return {
        ...availability,
        prNumber: request?.prNumber || "",
        version: request?.version || "",
        vendorName: vendor?.name || request?.vendorName || "",
        phone: vendor?.phone || "",
        whatsapp: vendor?.whatsappNumber || "",
        lineItems:
          Array.isArray(request?.lineItems) && request.lineItems.length
            ? request.lineItems
            : request
              ? [
                  {
                    itemName: request.itemName,
                    description: "",
                    quantity: Number(request.quantity || 0),
                    unit: request.unit,
                  },
                ]
              : [],
      };
    }),
  );
});

router.patch("/vendor-availability/:id/send", requireAuth, async (req, res) => {
  const org = orgId(req),
    id = Number(req.params.id);
  const [existing] = await db
    .select()
    .from(vendorAvailabilityTable)
    .where(
      and(
        eq(vendorAvailabilityTable.id, id),
        eq(vendorAvailabilityTable.organizationId, org),
      ),
    )
    .limit(1);
  if (!existing)
    return res.status(404).json({ error: "Vendor availability not found" });
  if (existing.status === "Confirmed")
    return res.status(400).json({ error: "Vendor is already confirmed" });
  const [updated] = await db
    .update(vendorAvailabilityTable)
    .set({
      status: "Sent",
      sentAt: existing.sentAt || new Date(),
      updatedAt: new Date(),
    })
    .where(eq(vendorAvailabilityTable.id, id))
    .returning();
  return res.json(updated);
});

router.post(
  "/vendor-availability/:id/confirm",
  requireAuth,
  async (req, res) => {
    const org = orgId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid vendor availability ID" });
    }
    if (confirmationInProgress.has(id)) {
      return res
        .status(409)
        .json({ error: "Vendor confirmation is already in progress" });
    }

    confirmationInProgress.add(id);
    let originalRows: any[] = [];
    let requestToRestore: any = null;
    let createdPurchaseOrderId: number | null = null;
    try {
      const [availability] = await db
        .select()
        .from(vendorAvailabilityTable)
        .where(
          and(
            eq(vendorAvailabilityTable.id, id),
            eq(vendorAvailabilityTable.organizationId, org),
          ),
        )
        .limit(1);
      if (!availability) throw new Error("Vendor availability not found");
      if (!["Sent", "Confirmed"].includes(availability.status)) {
        throw new Error("Send the purchase request before confirming");
      }

      const [request] = await db
        .select()
        .from(purchaseRequestsTable)
        .where(
          and(
            eq(purchaseRequestsTable.id, availability.purchaseRequestId),
            eq(purchaseRequestsTable.organizationId, org),
          ),
        )
        .limit(1);
      if (!request) throw new Error("Purchase request not found");
      requestToRestore = request;

      const [vendor] = await db
        .select()
        .from(contactsTable)
        .where(
          and(
            eq(contactsTable.id, Number(availability.vendorId)),
            eq(contactsTable.type, "vendor"),
          ),
        )
        .limit(1);
      if (!vendor) throw new Error("Selected vendor was not found");

      const orders = await db
        .select()
        .from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.organizationId, org));
      let purchaseOrder = orders.find(
        (order: any) =>
          order.prReference === request.prNumber &&
          String(order.vendorId) === String(availability.vendorId),
      );

      originalRows = await db
        .select()
        .from(vendorAvailabilityTable)
        .where(
          and(
            eq(
              vendorAvailabilityTable.purchaseRequestId,
              availability.purchaseRequestId,
            ),
            eq(vendorAvailabilityTable.organizationId, org),
          ),
        );
      if (!originalRows.some((row) => row.id === availability.id)) {
        throw new Error(
          "Selected vendor is not associated with this purchase request",
        );
      }

      const now = new Date();
      for (const sibling of originalRows) {
        const [changed] = await db
          .update(vendorAvailabilityTable)
          .set({
            status: sibling.id === availability.id ? "Confirmed" : "Rejected",
            confirmedAt:
              sibling.id === availability.id
                ? availability.confirmedAt || now
                : sibling.confirmedAt,
            purchaseOrderId:
              sibling.id === availability.id
                ? purchaseOrder?.id || sibling.purchaseOrderId
                : null,
            updatedAt: now,
          })
          .where(eq(vendorAvailabilityTable.id, sibling.id))
          .returning();
        if (!changed) throw new Error("Unable to update vendor availability");
      }

      if (!purchaseOrder) {
        const lineItems =
          Array.isArray(request.lineItems) && request.lineItems.length
            ? request.lineItems
            : [
                {
                  itemName: request.itemName,
                  quantity: request.quantity,
                  unit: request.unit,
                },
              ];
        [purchaseOrder] = await db
          .insert(purchaseOrdersTable)
          .values({
            organizationId: org,
            poNumber: `PO-26-27-${String(orders.length + 1).padStart(4, "0")}`,
            vendorId: String(vendor.id),
            vendorName: vendor.name,
            prReference: request.prNumber,
            lineItems: lineItems.map((line: any) => ({
              itemId: line.itemId,
              description: line.itemName || line.item || "",
              hsn: line.hsn || "",
              qty: Number(line.quantity || line.qty || 0),
              unit: line.unit || "",
              rate: Number(line.rate || 0),
              cgstPct: Number(line.cgstPct || 0),
              sgstPct: Number(line.sgstPct || 0),
              igstPct: Number(line.igstPct || 0),
              total: Number(line.total || 0),
            })),
            items: lineItems
              .map(
                (line: any) =>
                  `${line.itemName || line.item} (${line.quantity || line.qty} ${line.unit})`,
              )
              .join(", "),
            totalAmount: 0,
            deliveryDate: request.requiredDate || "",
            project: request.project || "",
            department: request.department || "",
            notes: request.notes || "",
            attachmentName: request.attachmentName || "",
            status: "Draft",
            createdByUserId: userId(req),
          })
          .returning();
        if (!purchaseOrder)
          throw new Error("Unable to create Purchase Order draft");
        createdPurchaseOrderId = purchaseOrder.id;
      }

      const [confirmedAvailability] = await db
        .update(vendorAvailabilityTable)
        .set({
          status: "Confirmed",
          confirmedAt: availability.confirmedAt || now,
          purchaseOrderId: purchaseOrder.id,
          updatedAt: now,
        })
        .where(eq(vendorAvailabilityTable.id, availability.id))
        .returning();
      if (!confirmedAvailability) {
        throw new Error(
          "Unable to link the Purchase Order to the confirmed vendor",
        );
      }

      const [updatedRequest] = await db
        .update(purchaseRequestsTable)
        .set({ status: "PO Created" })
        .where(eq(purchaseRequestsTable.id, request.id))
        .returning();
      if (!updatedRequest)
        throw new Error("Unable to update the purchase request");

      return res.json({
        success: true,
        availability: confirmedAvailability,
        purchaseOrder,
        purchaseOrderId: purchaseOrder.id,
        vendorId: availability.vendorId,
        purchaseRequestId: request.id,
        navigationPath: "/flex/purchase-orders",
      });
    } catch (error: any) {
      const rollbackErrors: unknown[] = [];
      if (createdPurchaseOrderId) {
        try {
          await db
            .delete(purchaseOrdersTable)
            .where(eq(purchaseOrdersTable.id, createdPurchaseOrderId));
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      for (const original of originalRows) {
        try {
          await db
            .update(vendorAvailabilityTable)
            .set({
              status: original.status,
              sentAt: original.sentAt,
              confirmedAt: original.confirmedAt,
              purchaseOrderId: original.purchaseOrderId,
              updatedAt: original.updatedAt,
            })
            .where(eq(vendorAvailabilityTable.id, original.id));
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (requestToRestore) {
        try {
          await db
            .update(purchaseRequestsTable)
            .set({ status: requestToRestore.status })
            .where(eq(purchaseRequestsTable.id, requestToRestore.id));
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      console.error("Unable to confirm vendor", error);
      if (rollbackErrors.length) {
        console.error(
          "Confirm vendor rollback encountered errors",
          rollbackErrors,
        );
      }
      return res.status(400).json({
        error: error?.message || "Unable to confirm vendor. Please try again.",
      });
    } finally {
      confirmationInProgress.delete(id);
    }
  },
);
export default router;
