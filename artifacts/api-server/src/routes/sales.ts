import { Router } from "express";
import { db } from "@workspace/db";
import { salesOrdersTable, locationsTable, usersTable } from "@workspace/db";
import { eq, desc } from "@workspace/db";

const router = Router();

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

router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.id, id)).limit(1);
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.patch("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
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
  await db.delete(salesOrdersTable).where(eq(salesOrdersTable.id, Number(req.params.id)));
  return res.status(204).send();
});

export default router;
