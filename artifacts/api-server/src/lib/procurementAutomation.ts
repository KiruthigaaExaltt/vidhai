import { and, db, eq } from "@workspace/db";
import {
  accountsPayableTable,
  chartOfAccountsTable,
  journalEntriesTable,
  journalLinesTable,
  purchaseInvoicesTable,
} from "@workspace/db";

const round = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;

const postingAccounts = [
  ["5100", "Purchase Expense", "Expense"],
  ["2100", "Accounts Payable", "Liability"],
] as const;

export function isPurchaseInvoiceMatched(matchStatus: unknown) {
  return ["2-Way Match", "3-Way Match", "Matched"].includes(
    String(matchStatus || ""),
  );
}

export async function postMatchedPurchaseInvoice(
  organizationId: number,
  invoiceId: number,
  userId?: number,
) {
  const [invoice] = await db
    .select()
    .from(purchaseInvoicesTable)
    .where(
      and(
        eq(purchaseInvoicesTable.organizationId, organizationId),
        eq(purchaseInvoicesTable.id, invoiceId),
      ),
    )
    .limit(1);
  if (!invoice || !isPurchaseInvoiceMatched(invoice.matchStatus)) return null;
  if (invoice.isPostedToLedger && invoice.journalEntryId) return invoice;
  const existingJournals = await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.organizationId, organizationId));
  const existingJournal = existingJournals.find(
    (entry: any) =>
      (entry.sourceType === "Purchase Invoice" &&
        Number(entry.sourceId) === Number(invoice.id)) ||
      entry.reference === `PURCH:${invoice.invoiceNumber}`,
  );
  if (existingJournal) {
    const [updated] = await db
      .update(purchaseInvoicesTable)
      .set({ isPostedToLedger: true, journalEntryId: existingJournal.id })
      .where(eq(purchaseInvoicesTable.id, invoice.id))
      .returning();
    return updated;
  }

  const existingAccounts = await db
    .select()
    .from(chartOfAccountsTable)
    .where(eq(chartOfAccountsTable.organizationId, organizationId));
  
  const account = (code: string) => {
    const found = existingAccounts.find((entry: any) => entry.accountCode === code);
    if (!found) throw new Error(`Required account ${code} not configured`);
    return found;
  };
  const total = round(invoice.amount);
  const lines = [
    [account("5100"), total, 0],
    [account("2100"), 0, total],
  ].filter(([, debit, credit]) => Number(debit) > 0 || Number(credit) > 0) as any[];
  const debitTotal = round(lines.reduce((sum, line) => sum + Number(line[1]), 0));
  if (Math.abs(debitTotal - total) > 0.01) {
    throw new Error("Purchase invoice tax breakdown does not balance");
  }

  return db.transaction(async (tx) => {
    const [journal] = await tx
      .insert(journalEntriesTable)
      .values({
        organizationId,
        entryDate: invoice.invoiceDate,
        reference: `PURCH:${invoice.invoiceNumber}`,
        description: `Purchase invoice ${invoice.invoiceNumber}`,
        totalDebit: total,
        totalCredit: total,
        status: "Posted",
        sourceType: "Purchase Invoice",
        sourceId: invoice.id,
        createdByUserId: userId,
      })
      .returning();
    for (const [ledgerAccount, debit, credit] of lines) {
      await tx.insert(journalLinesTable).values({
        organizationId,
        journalEntryId: journal.id,
        accountId: ledgerAccount.id,
        accountCode: ledgerAccount.accountCode,
        accountName: ledgerAccount.accountName,
        debit,
        credit,
        memo: invoice.invoiceNumber,
      });
      await tx
        .update(chartOfAccountsTable)
        .set({
          currentBalance: round(
            Number(ledgerAccount.currentBalance || 0) + debit - credit,
          ),
        })
        .where(eq(chartOfAccountsTable.id, ledgerAccount.id));
    }
    const existingPayables = await tx
      .select()
      .from(accountsPayableTable)
      .where(
        and(
          eq(accountsPayableTable.organizationId, organizationId),
          eq(accountsPayableTable.billNumber, invoice.invoiceNumber),
        ),
      );
    if (!existingPayables.length) {
      await tx.insert(accountsPayableTable).values({
        organizationId,
        vendorName: invoice.vendorName,
        billNumber: invoice.invoiceNumber,
        billDate: invoice.invoiceDate,
        dueDate: invoice.dueDate || invoice.invoiceDate,
        amount: total,
        paidAmount: invoice.status === "Paid" ? total : 0,
        adjustedAmount: 0,
        status: invoice.status === "Paid" ? "Paid" : "Pending",
        approvalStatus: "Approved",
        approvalLevel: 1,
        requiredApprovals: 1,
        approvedByUserIds: JSON.stringify(userId ? [userId] : []),
        entryType: "Bill",
        notes: `From matched purchase invoice ${invoice.invoiceNumber}`,
        journalEntryId: journal.id,
        sourceType: "Purchase Invoice",
        sourceId: invoice.id,
      });
    }
    const [updated] = await tx
      .update(purchaseInvoicesTable)
      .set({ isPostedToLedger: true, journalEntryId: journal.id })
      .where(eq(purchaseInvoicesTable.id, invoice.id))
      .returning();
    return updated;
  });
}
