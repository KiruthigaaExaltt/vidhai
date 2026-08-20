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
    .select()
    .from(spawnEntriesTable)
    .orderBy(desc(spawnEntriesTable.createdAt));
  res.json(
    entries.map((e) => ({
      ...e,
      quantityKg: Number(e.quantityKg),
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

router.post("/", async (_req, res) => {
  res.status(403).json({
    error:
      "Manual Spawn Vault receipts are disabled. Stock must come from finalized Lab production or a received Spawn goods receipt.",
  });
});

export default router;
