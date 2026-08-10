import {
  accountsReceivableTable,
  and,
  db,
  eq,
  salesInvoicesTable,
  salesPaymentsTable,
  salesReceivableAdjustmentsTable,
  salesReturnsTable,
} from "@workspace/db";
import {
  ensureCanonicalAccounts,
  postJournal,
  reverseJournal,
} from "../routes/accounts";

const money = (value: any) =>
  Math.round(Number(value?.$numberDecimal ?? value ?? 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

async function accountIds(organizationId: number) {
  const accounts = await ensureCanonicalAccounts(organizationId);
  const id = (code: string) => {
    const account = accounts.find((row: any) => row.accountCode === code);
    if (!account) throw new Error(`Account ${code} is not configured`);
    return account.id;
  };
  return id;
}

async function invoiceAr(organizationId: number, invoice: any) {
  return (
    await db
      .select()
      .from(accountsReceivableTable)
      .where(
        and(
          eq(accountsReceivableTable.organizationId, organizationId),
          eq(accountsReceivableTable.sourceType, "Sales Invoice"),
          eq(accountsReceivableTable.sourceId, Number(invoice.id)),
        ),
      )
      .limit(1)
  )[0];
}

export async function recalculateInvoiceAccounting(
  invoiceId: number,
  organizationId: number,
) {
  const [invoice] = await db
    .select()
    .from(salesInvoicesTable)
    .where(eq(salesInvoicesTable.id, invoiceId))
    .limit(1);
  if (!invoice) throw new Error("Invoice not found");

  const payments = await db
    .select()
    .from(salesPaymentsTable)
    .where(eq(salesPaymentsTable.invoiceId, invoiceId));
  const adjustments = await db
    .select()
    .from(salesReceivableAdjustmentsTable)
    .where(eq(salesReceivableAdjustmentsTable.invoiceId, invoiceId));
  const returns = await db
    .select()
    .from(salesReturnsTable)
    .where(eq(salesReturnsTable.invoiceId, invoiceId));
  const totalPaid = money(
    payments.reduce((sum: number, payment: any) => sum + money(payment.amount), 0),
  );
  const requestedAdjustment = money(
    returns
      .filter((row: any) => row.status === "Credit Issued")
      .reduce((sum: number, row: any) => sum + money(row.grandTotal), 0) +
      adjustments.reduce((sum: number, row: any) => sum + money(row.amount), 0),
  );
  const grandTotal = money(invoice.grandTotal);
  const adjustedAmount = Math.min(
    Math.max(0, money(grandTotal - totalPaid)),
    requestedAdjustment,
  );
  const balanceDue = Math.max(0, money(grandTotal - totalPaid - adjustedAmount));
  const overdue = Boolean(
    balanceDue > 0 && invoice.dueDate && String(invoice.dueDate).slice(0, 10) < today(),
  );
  const paymentStatus =
    balanceDue <= 0 && adjustedAmount > 0
      ? "Settled"
      : totalPaid >= grandTotal
        ? "Paid"
        : overdue
          ? "Overdue"
          : totalPaid > 0
            ? "Partial"
            : "Unpaid";
  const documentStatus =
    paymentStatus === "Paid"
      ? "Paid"
      : invoice.status === "Paid"
        ? "Approved"
        : invoice.status;

  await db
    .update(salesInvoicesTable)
    .set({
      amountPaid: String(totalPaid),
      balanceDue: String(balanceDue),
      paymentStatus,
      status: documentStatus,
    })
    .where(eq(salesInvoicesTable.id, invoiceId));

  const ar = await invoiceAr(organizationId, invoice);
  if (ar) {
    const arStatus =
      balanceDue <= 0
        ? adjustedAmount > 0
          ? "Settled"
          : "Received"
        : overdue
          ? "Overdue"
          : totalPaid > 0
            ? "Partial"
            : "Pending";
    await db
      .update(accountsReceivableTable)
      .set({
        receivedAmount: String(totalPaid),
        adjustedAmount: String(adjustedAmount),
        status: arStatus,
      })
      .where(eq(accountsReceivableTable.id, ar.id));
  }
  return { totalPaid, adjustedAmount, balanceDue, paymentStatus };
}

export async function triggerInvoiceApproved(
  invoiceId: number,
  organizationId: number,
  userId?: number,
) {
  const [invoice] = await db
    .select()
    .from(salesInvoicesTable)
    .where(eq(salesInvoicesTable.id, invoiceId))
    .limit(1);
  if (!invoice || !["Approved", "Paid"].includes(invoice.status)) return null;
  const id = await accountIds(organizationId);
  const grandTotal = money(invoice.grandTotal);
  const cgst = money(invoice.cgstTotal);
  const sgst = money(invoice.sgstTotal);
  const igst = money(invoice.igstTotal);
  const revenue = money(grandTotal - cgst - sgst - igst);
  const journal = await postJournal(
    organizationId,
    {
      entryDate: invoice.invoiceDate,
      reference: `AUTO:SALES:${invoice.invoiceNumber}:${invoice.id}`,
      description: `Sales invoice ${invoice.invoiceNumber}`,
      sourceType: "Sales Invoice",
      sourceId: invoice.id,
      lines: [
        { accountId: id("1100"), debit: grandTotal },
        { accountId: id("4100"), credit: revenue },
        { accountId: id("2210"), credit: cgst },
        { accountId: id("2220"), credit: sgst },
        { accountId: id("2230"), credit: igst },
      ].filter((line) => money(line.debit ?? line.credit) > 0),
    },
    userId,
  );
  await db
    .update(salesInvoicesTable)
    .set({ journalEntryId: journal.id })
    .where(eq(salesInvoicesTable.id, invoice.id));

  let ar = await invoiceAr(organizationId, invoice);
  if (!ar) {
    [ar] = await db
      .insert(accountsReceivableTable)
      .values({
        organizationId,
        clientId: invoice.clientId,
        clientName: invoice.clientName,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate || invoice.invoiceDate,
        amount: String(grandTotal),
        receivedAmount: "0",
        adjustedAmount: "0",
        status: "Pending",
        entryType: "Invoice",
        journalEntryId: journal.id,
        sourceType: "Sales Invoice",
        sourceId: invoice.id,
      })
      .returning();
  }
  await recalculateInvoiceAccounting(invoice.id, organizationId);
  return { journal, ar };
}

export async function triggerPaymentReceived(
  paymentId: number,
  organizationId: number,
  userId?: number,
) {
  const [payment] = await db
    .select()
    .from(salesPaymentsTable)
    .where(eq(salesPaymentsTable.id, paymentId))
    .limit(1);
  if (!payment) throw new Error("Payment not found");
  const [invoice] = await db
    .select()
    .from(salesInvoicesTable)
    .where(eq(salesInvoicesTable.id, payment.invoiceId))
    .limit(1);
  if (!invoice) throw new Error("Invoice not found");
  const id = await accountIds(organizationId);
  const amount = money(payment.amount);
  const tds = money(payment.tdsAmount);
  const charges = money(payment.bankCharges);
  const net = money(amount - tds - charges);
  const journal = await postJournal(
    organizationId,
    {
      entryDate: payment.paymentDate,
      reference: `AUTO:SALES:PAYMENT:${payment.paymentNumber}`,
      description: `Customer payment ${payment.paymentNumber} for ${invoice.invoiceNumber}`,
      sourceType: "Customer Payment",
      sourceId: payment.id,
      lines: [
        { accountId: id("1020"), debit: net },
        { accountId: id("1120"), debit: tds },
        { accountId: id("5200"), debit: charges },
        { accountId: id("1100"), credit: amount },
      ].filter((line) => money(line.debit ?? line.credit) > 0),
    },
    userId,
  );
  await db
    .update(salesPaymentsTable)
    .set({ journalEntryId: journal.id, netReceived: String(net) })
    .where(eq(salesPaymentsTable.id, payment.id));
  await recalculateInvoiceAccounting(invoice.id, organizationId);
  return journal;
}

export async function triggerSalesReturnCredited(
  returnId: number,
  organizationId: number,
  userId?: number,
) {
  const [salesReturn] = await db
    .select()
    .from(salesReturnsTable)
    .where(eq(salesReturnsTable.id, returnId))
    .limit(1);
  if (!salesReturn?.invoiceId || !["Credit Issued", "Credited"].includes(salesReturn.status)) return null;
  const id = await accountIds(organizationId);
  const total = money(salesReturn.grandTotal);
  const cgst = money(salesReturn.cgstTotal);
  const sgst = money(salesReturn.sgstTotal);
  const igst = money(salesReturn.igstTotal);
  const revenue = money(total - cgst - sgst - igst);
  const journal = await postJournal(
    organizationId,
    {
      entryDate: salesReturn.returnDate,
      reference: `AUTO:SALES:CREDIT:${salesReturn.returnNumber}`,
      description: `Sales credit note ${salesReturn.returnNumber}`,
      sourceType: "Sales Credit Note",
      sourceId: salesReturn.id,
      lines: [
        { accountId: id("4100"), debit: revenue },
        { accountId: id("2210"), debit: cgst },
        { accountId: id("2220"), debit: sgst },
        { accountId: id("2230"), debit: igst },
        { accountId: id("1100"), credit: total },
      ].filter((line) => money(line.debit ?? line.credit) > 0),
    },
    userId,
  );
  const creditNoteNumber = salesReturn.creditNoteNumber || salesReturn.returnNumber || `SR-${returnId}`;
  await db
    .update(salesReturnsTable)
    .set({ status: "Credit Issued", creditNoteNumber, journalEntryId: journal.id })
    .where(eq(salesReturnsTable.id, returnId));
  const [sourceInvoice] = await db
    .select()
    .from(salesInvoicesTable)
    .where(eq(salesInvoicesTable.id, salesReturn.invoiceId))
    .limit(1);
  if (!sourceInvoice) throw new Error("Linked sales invoice not found");
  const existingCreditNote = (
    await db
      .select()
      .from(accountsReceivableTable)
      .where(
        and(
          eq(accountsReceivableTable.organizationId, organizationId),
          eq(accountsReceivableTable.sourceType, "Sales Credit Note"),
          eq(accountsReceivableTable.sourceId, salesReturn.id),
        ),
      )
      .limit(1)
  )[0];
  if (!existingCreditNote) {
    const originalReceivable = await invoiceAr(organizationId, sourceInvoice);
    const unpaidBeforeCredit = originalReceivable
      ? Math.max(0, money(originalReceivable.amount) - money(originalReceivable.receivedAmount) - money(originalReceivable.adjustedAmount))
      : Math.max(0, money(sourceInvoice?.grandTotal) - money(sourceInvoice?.amountPaid));
    const appliedToInvoice = Math.min(total, unpaidBeforeCredit);
    await db.insert(accountsReceivableTable).values({
      organizationId,
      clientId: salesReturn.clientId,
      clientName: salesReturn.clientName,
      creditNoteNumber,
      invoiceNumber: creditNoteNumber,
      linkedInvoiceNumber: sourceInvoice?.invoiceNumber || "",
      invoiceDate: salesReturn.returnDate,
      dueDate: salesReturn.returnDate,
      amount: String(total),
      receivedAmount: "0",
      adjustedAmount: String(appliedToInvoice),
      status: "Credited",
      entryType: "Credit Note",
      journalEntryId: journal.id,
      sourceType: "Sales Credit Note",
      sourceId: salesReturn.id,
    });
  }
  await recalculateInvoiceAccounting(salesReturn.invoiceId, organizationId);
  return journal;
}

export async function deletePaymentAccounting(
  paymentId: number,
  organizationId: number,
) {
  const [payment] = await db
    .select()
    .from(salesPaymentsTable)
    .where(eq(salesPaymentsTable.id, paymentId))
    .limit(1);
  if (!payment) return false;
  if (payment.journalEntryId)
    await reverseJournal(organizationId, Number(payment.journalEntryId));
  await db.delete(salesPaymentsTable).where(eq(salesPaymentsTable.id, paymentId));
  await recalculateInvoiceAccounting(payment.invoiceId, organizationId);
  return true;
}

export async function triggerReceivableAdjustment(
  adjustmentId: number,
  organizationId: number,
  userId?: number,
) {
  const [adjustment] = await db
    .select()
    .from(salesReceivableAdjustmentsTable)
    .where(eq(salesReceivableAdjustmentsTable.id, adjustmentId))
    .limit(1);
  if (!adjustment) throw new Error("Receivable adjustment not found");
  const [invoice] = await db
    .select()
    .from(salesInvoicesTable)
    .where(eq(salesInvoicesTable.id, adjustment.invoiceId))
    .limit(1);
  if (!invoice) throw new Error("Invoice not found");
  const id = await accountIds(organizationId);
  const amount = money(adjustment.amount);
  const journal = await postJournal(
    organizationId,
    {
      entryDate: adjustment.adjustmentDate,
      reference: `AUTO:AR:ADJUST:${adjustment.adjustmentNumber}`,
      description: `${adjustment.reason} - ${invoice.invoiceNumber}`,
      sourceType: "AR Adjustment",
      sourceId: adjustment.id,
      lines: [
        { accountId: id("4110"), debit: amount },
        { accountId: id("1100"), credit: amount },
      ],
    },
    userId,
  );
  await db
    .update(salesReceivableAdjustmentsTable)
    .set({ journalEntryId: journal.id })
    .where(eq(salesReceivableAdjustmentsTable.id, adjustment.id));
  await recalculateInvoiceAccounting(invoice.id, organizationId);
  return journal;
}

export async function deleteReceivableAdjustment(
  adjustmentId: number,
  organizationId: number,
) {
  const [adjustment] = await db
    .select()
    .from(salesReceivableAdjustmentsTable)
    .where(eq(salesReceivableAdjustmentsTable.id, adjustmentId))
    .limit(1);
  if (!adjustment) return false;
  if (adjustment.journalEntryId)
    await reverseJournal(organizationId, Number(adjustment.journalEntryId));
  await db
    .delete(salesReceivableAdjustmentsTable)
    .where(eq(salesReceivableAdjustmentsTable.id, adjustmentId));
  await recalculateInvoiceAccounting(adjustment.invoiceId, organizationId);
  return true;
}

export async function cancelInvoiceAccounting(
  invoiceId: number,
  organizationId: number,
) {
  const [invoice] = await db
    .select()
    .from(salesInvoicesTable)
    .where(eq(salesInvoicesTable.id, invoiceId))
    .limit(1);
  if (!invoice) throw new Error("Invoice not found");
  const payments = await db
    .select()
    .from(salesPaymentsTable)
    .where(eq(salesPaymentsTable.invoiceId, invoiceId));
  const adjustments = await db
    .select()
    .from(salesReceivableAdjustmentsTable)
    .where(eq(salesReceivableAdjustmentsTable.invoiceId, invoiceId));
  for (const payment of payments)
    if (payment.journalEntryId)
      await reverseJournal(organizationId, Number(payment.journalEntryId));
  await db.delete(salesPaymentsTable).where(eq(salesPaymentsTable.invoiceId, invoiceId));
  for (const adjustment of adjustments)
    if (adjustment.journalEntryId)
      await reverseJournal(organizationId, Number(adjustment.journalEntryId));
  await db
    .delete(salesReceivableAdjustmentsTable)
    .where(eq(salesReceivableAdjustmentsTable.invoiceId, invoiceId));
  if (invoice.journalEntryId)
    await reverseJournal(organizationId, Number(invoice.journalEntryId));
  const ar = await invoiceAr(organizationId, invoice);
  if (ar)
    await db
      .delete(accountsReceivableTable)
      .where(eq(accountsReceivableTable.id, ar.id));
  await db
    .update(salesInvoicesTable)
    .set({
      status: "Cancelled",
      paymentStatus: "Cancelled",
      amountPaid: "0",
      balanceDue: "0",
      journalEntryId: null,
      isLocked: true,
    })
    .where(eq(salesInvoicesTable.id, invoiceId));
}
