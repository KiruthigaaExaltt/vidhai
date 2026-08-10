import { Router } from "express";
import {
  db, eq, and, desc, inventoryTable, quotationItemsTable, quotationsTable,
  proformaInvoiceItemsTable, proformaInvoicesTable, salesWorkOrdersTable,
  workOrderTemplatesTable, tasksTable,
} from "@workspace/db";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

const numberValue = (value: any) => Number(value?.$numberDecimal ?? value?.toString?.() ?? value ?? 0) || 0;

router.get("/templates", requireAuth, async (_req, res) => {
  return res.json(await db.select().from(workOrderTemplatesTable).orderBy(workOrderTemplatesTable.name));
});

router.get("/", requireAuth, async (_req, res) => {
  return res.json(await db.select().from(salesWorkOrdersTable).orderBy(desc(salesWorkOrdersTable.createdAt)));
});

router.post("/", requireAuth, async (req, res) => {
  const input = req.body || {};
  const sourceDocumentType = String(input.sourceDocumentType || "");
  const sourceDocumentId = Number(input.sourceDocumentId);
  if (!(["Quotation", "Proforma Invoice"].includes(sourceDocumentType)) || !sourceDocumentId) {
    return res.status(400).json({ error: "An approved Quotation or Proforma Invoice is required" });
  }

  const [duplicate] = await db.select().from(salesWorkOrdersTable).where(and(
    eq(salesWorkOrdersTable.sourceDocumentType, sourceDocumentType),
    eq(salesWorkOrdersTable.sourceDocumentId, sourceDocumentId),
  )).limit(1);
  if (duplicate) return res.status(409).json({ error: "A work order already exists for this document", existingWorkOrder: duplicate });

  const documentTable = sourceDocumentType === "Quotation" ? quotationsTable : proformaInvoicesTable;
  const [source] = await db.select().from(documentTable).where(eq(documentTable.id, sourceDocumentId)).limit(1);
  if (!source || source.status !== "Approved" || !source.customerResponseAt) {
    return res.status(400).json({ error: "Only the latest customer-approved document can start a Work Order" });
  }
  if (source.isLatestVersion === false) return res.status(400).json({ error: "Only the latest approved document version can start a Work Order" });

  const sourceItems = sourceDocumentType === "Quotation"
    ? await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quoteId, sourceDocumentId))
    : await db.select().from(proformaInvoiceItemsTable).where(eq(proformaInvoiceItemsTable.piId, sourceDocumentId));
  const [inventory, activeWorkOrders] = await Promise.all([
    db.select().from(inventoryTable),
    db.select().from(salesWorkOrdersTable),
  ]);
  const stock = new Map<number, number>();
  for (const row of inventory) stock.set(Number(row.materialId), (stock.get(Number(row.materialId)) || 0) + numberValue(row.quantityOnHand));
  for (const active of activeWorkOrders.filter((row: any) => !["Completed", "Cancelled", "Rejected"].includes(String(row.status)))) {
    for (const reserved of Array.isArray(active.materialRequirements) ? active.materialRequirements : []) {
      const materialId = Number(reserved.materialId);
      if (materialId) stock.set(materialId, (stock.get(materialId) || 0) - numberValue(reserved.requiredQuantity));
    }
  }
  const insufficient = sourceItems
    .filter((item: any) => !item.serviceId && item.itemId && (stock.get(Number(item.itemId)) || 0) < numberValue(item.quantity))
    .map((item: any) => ({ description: item.description || item.productName || `Item ${item.itemId}`, required: numberValue(item.quantity), available: stock.get(Number(item.itemId)) || 0 }));
  if (insufficient.length) {
    return res.status(400).json({ error: `Insufficient stock: ${insufficient.map(item => `${item.description} requires ${item.required}, available ${item.available}`).join("; ")}`, insufficientItems: insufficient });
  }

  const [template] = input.workOrderTemplateId
    ? await db.select().from(workOrderTemplatesTable).where(eq(workOrderTemplatesTable.id, Number(input.workOrderTemplateId))).limit(1)
    : [];
  if (input.workOrderTemplateId && !template) return res.status(400).json({ error: "Selected Work Order template was not found" });

  const productionQuantity = numberValue(input.productionQuantity) || sourceItems.reduce((sum: number, item: any) => sum + numberValue(item.quantity), 0);
  if (productionQuantity <= 0) return res.status(400).json({ error: "Production quantity must be greater than zero" });
  const materialRequirements = Array.isArray(template?.materialRequirements) && template.materialRequirements.length
    ? template.materialRequirements.map((item: any) => ({ ...item, requiredQuantity: numberValue(item.quantityPerUnit) * productionQuantity }))
    : sourceItems.filter((item: any) => item.itemId && !item.serviceId).map((item: any) => ({ materialId: item.itemId, description: item.description || item.productName, requiredQuantity: numberValue(item.quantity), warehouseId: item.warehouseId || null }));
  const unavailableMaterials = materialRequirements.filter((item: any) => item.materialId && (stock.get(Number(item.materialId)) || 0) < numberValue(item.requiredQuantity));
  if (unavailableMaterials.length) {
    return res.status(400).json({ error: `Insufficient material stock: ${unavailableMaterials.map((item: any) => `${item.description || `Material ${item.materialId}`} requires ${numberValue(item.requiredQuantity)}, available ${stock.get(Number(item.materialId)) || 0}`).join("; ")}` });
  }

  const existingCount = (await db.select().from(salesWorkOrdersTable)).length;
  const workOrderNumber = `WO-${new Date().getFullYear()}-${String(existingCount + 1).padStart(4, "0")}`;
  const [workOrder] = await db.insert(salesWorkOrdersTable).values({
    workOrderNumber,
    clientId: Number(source.clientId),
    clientName: String(source.clientName || source.customerCompany || ""),
    productId: input.productId ? Number(input.productId) : (sourceItems[0]?.productId || sourceItems[0]?.itemId || null),
    variantId: input.variantId ? Number(input.variantId) : (sourceItems[0]?.variantId || null),
    productionQuantity: String(productionQuantity),
    productionUom: String(input.productionUom || sourceItems[0]?.uom || "Nos"),
    sourceDocumentType,
    sourceDocumentId,
    sourceDocumentNumber: String(input.sourceDocumentNumber || source.rootQuoteNumber || source.quotationNumber || source.piNumber || ""),
    workOrderTemplateId: template?.id || null,
    expectedCompletionDate: input.expectedCompletionDate || null,
    items: sourceItems,
    materialRequirements,
    generatedTaskIds: [],
    status: "Active",
    productionStatus: "Pending",
    createdByUserId: (req.session as any).userId,
  }).returning();

  // A sales document produces one Work Order task. Production stages are
  // managed inside that task instead of creating separate preparation,
  // production and quality-check tasks.
  const [task] = await db.insert(tasksTable).values({
    title: `${workOrderNumber} - ${workOrder.clientName}`,
    description: `Complete Work Order for ${sourceDocumentType} ${workOrder.sourceDocumentNumber}`,
    assigneeId: null,
    locationId: null,
    status: "todo",
    priority: "medium",
    startTime: null,
    estimatedMinutes: null,
    notes: `Source: ${sourceDocumentType} ${workOrder.sourceDocumentNumber}`,
    batchRef: workOrderNumber,
    sourceWorkOrderId: workOrder.id,
    sequenceNumber: 1,
    checklist: [],
    createdByUserId: (req.session as any).userId,
  }).returning();
  const taskIds = [Number(task.id)];

  const [activated] = await db.update(salesWorkOrdersTable).set({
    generatedTaskIds: taskIds,
    status: taskIds.length ? "Task Created" : "Active",
    productionStatus: "Material Ready",
    updatedAt: new Date(),
  }).where(eq(salesWorkOrdersTable.id, workOrder.id)).returning();
  return res.status(201).json(activated);
});

export default router;
