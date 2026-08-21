import { Router } from "express";
import {
  db,
  spawnEntriesTable,
  spawnVaultTransactionsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "@workspace/db";
import { desc } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  const entries = await db
    .select({
      id: spawnEntriesTable.id,
      strainName: spawnEntriesTable.strainName,
      quantityKg: spawnEntriesTable.quantityKg,
      reservedQuantityKg: spawnEntriesTable.reservedQuantityKg,
      source: spawnEntriesTable.source,
      sourceType: spawnEntriesTable.sourceType,
      sourceReference: spawnEntriesTable.sourceReference,
      supplierName: spawnEntriesTable.supplierName,
      supplierLot: spawnEntriesTable.supplierLot,
      purchaseReference: spawnEntriesTable.purchaseReference,
      receivedAt: spawnEntriesTable.receivedAt,
      expiresAt: spawnEntriesTable.expiresAt,
      status: spawnEntriesTable.status,
    })
    .from(spawnEntriesTable)
    .orderBy(desc(spawnEntriesTable.createdAt));
  res.json(
    entries.map((e) => ({
      ...e,
      quantityKg: Number(e.quantityKg),
      reservedQuantityKg: Number(e.reservedQuantityKg || 0),
      freeAvailableQuantityKg: Math.max(
        0,
        Number(e.quantityKg) - Number(e.reservedQuantityKg || 0),
      ),
    })),
  );
});

router.get("/transactions", async (_req, res) => {
  const rows = await db
    .select({
      transaction: spawnVaultTransactionsTable,
      recordedByName: usersTable.displayName,
    })
    .from(spawnVaultTransactionsTable)
    .leftJoin(
      usersTable,
      eq(spawnVaultTransactionsTable.recordedByUserId, usersTable.id),
    )
    .orderBy(desc(spawnVaultTransactionsTable.createdAt));
  res.json(
    rows.map((row: any) => ({
      ...row.transaction,
      quantityInKg: Number(row.transaction.quantityInKg),
      quantityOutKg: Number(row.transaction.quantityOutKg),
      balanceAfterKg: Number(row.transaction.balanceAfterKg),
      recordedByName: row.recordedByName ?? "System",
    })),
  );
});

router.post("/", async (req, res) => {
  const userId = Number((req.session as any)?.userId);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const { strainName, quantityKg } = req.body as any;
  const quantity = Number(quantityKg);
  if (!String(strainName || "").trim())
    return res.status(400).json({ error: "Strain name is required" });
  if (!(quantity > 0))
    return res
      .status(400)
      .json({ error: "Quantity must be greater than zero" });

  const entry = await db.transaction(async (tx) => {
    const now = new Date();
    const datePart = now.toISOString().slice(2, 10).replace(/-/g, "");
    const reference = `EXT-${datePart}-${String(now.getTime()).slice(-6)}`;
    const [created] = await tx
      .insert(spawnEntriesTable)
      .values({
        strainName: String(strainName).trim(),
        quantityKg: String(quantity),
        producedQuantityKg: String(quantity),
        source: "Manual External Spawn",
        sourceType: "EXTERNAL",
        sourceReferenceType: "MANUAL_EXTERNAL",
        sourceReference: reference,
        supplierName: null,
        supplierLot: reference,
        purchaseReference: null,
        receivedAt: now.toISOString().split("T")[0],
        expiresAt: null,
        status: "available",
        notes: null,
      })
      .returning();

    await tx.insert(spawnVaultTransactionsTable).values({
      transactionKey: `external-spawn:${created.id}:${Date.now()}`,
      spawnEntryId: created.id,
      transactionType: "EXTERNAL_RECEIPT",
      quantityInKg: String(quantity),
      quantityOutKg: "0",
      balanceAfterKg: String(quantity),
      referenceType: "MANUAL_EXTERNAL",
      referenceId: created.id,
      reference,
      notes: null,
      recordedByUserId: userId,
    });
    return created;
  });

  return res
    .status(201)
    .json({ ...entry, quantityKg: Number(entry.quantityKg) });
});

export default router;
