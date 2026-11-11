import {
  accountsReceivableTable,
  and,
  db,
  eq,
  partyLedgerEntriesTable,
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
  const id = ((code: string) => {
    const account = accounts.find((row: any) => row.accountCode === code);
    if (!account) throw new Error(`Account ${code} is not configured`);
    return account.id;
  }) as any;
  id.firstByType = (type: string) => accounts.find((row: any) => row.accountType === type && row.isActive !== false)?.id;
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
          : totalPaid > 0 || adjustedAmount > 0
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
          : totalPaid > 0 || adjustedAmount > 0
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
  const revenueAccountId = id("4100");
  let journal: any = null;
  let journalId = invoice.journalEntryId;
  if (!journalId) {
    journal = await postJournal(
      organizationId,
      {
        entryDate: invoice.invoiceDate,
        reference: `AUTO:SALES:${invoice.invoiceNumber}:${invoice.id}`,
        description: `Sales invoice ${invoice.invoiceNumber}`,
        sourceType: "Sales Invoice",
        sourceId: invoice.id,
        lines: [
          { accountId: id("1100"), debit: grandTotal },
          { accountId: revenueAccountId, credit: grandTotal },
        ],
      },
      userId,
    );
    journalId = journal.id;
  }
  
  if (journalId) {
    await db
      .update(salesInvoicesTable)
      .set({ journalEntryId: journalId })
      .where(eq(salesInvoicesTable.id, invoice.id));
  }

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
        approvalStatus: "Approved",
        approvalLevel: 1,
        requiredApprovals: 1,
        approvedByUserIds: JSON.stringify(userId ? [userId] : []),
        entryType: "Invoice",
        journalEntryId: journalId,
        sourceType: "Sales Invoice",
        sourceId: invoice.id,
      })
      .returning();
  }
  await recalculateInvoiceAccounting(invoice.id, organizationId);
  return { journal: journal || { id: journalId }, journalId, ar };
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
  if (payment.journalEntryId) {
    await recalculateInvoiceAccounting(invoice.id, organizationId);
    return { id: payment.journalEntryId };
  }
  const id = await accountIds(organizationId);
  const accounts = await ensureCanonicalAccounts(organizationId);
  const settlementAccount = accounts.find(
    (row: any) =>
      Number(row.id) === Number(payment.settlementAccountId) &&
      row.isActive !== false,
  );
  if (!settlementAccount)
    throw new Error("Choose a valid active Chart of Accounts account");
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
      metadata: { paymentDate: payment.paymentDate, fromAccountId: id("1100"), toAccountId: settlementAccount.id, settlementAccountId: settlementAccount.id, paymentMethod: payment.paymentMethod || "",
        fromAccountName: accounts.find((account: any) => account.accountCode === "1100")?.accountName || "", toAccountName: settlementAccount.accountName },
      lines: [
        { accountId: settlementAccount.id, debit: net },
        { accountId: id("5160"), debit: tds },
        { accountId: id("5150"), debit: charges },
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

// On approval, the advance noted on an invoice is recorded as already
// received (into Cash in Hand, 1030) so only the balance stays outstanding in
// Accounts Receivable / the customer ledger. It uses the normal sales-payment
// path, so journals, cash book and the invoice's paid/balance follow.
// Idempotent per invoice.
export async function postInvoiceAdvance(
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
  const advance = money((invoice as any).advanceAmount);
  if (!(advance > 0)) return null;
  const paymentNumber = `ADV-${invoice.invoiceNumber}-${invoice.id}`;
  const [existing] = await db
    .select()
    .from(salesPaymentsTable)
    .where(eq(salesPaymentsTable.paymentNumber, paymentNumber))
    .limit(1);
  if (existing) return existing;
  const amount = Math.min(advance, money(invoice.balanceDue ?? invoice.grandTotal));
  if (!(amount > 0)) return null;
  const id = await accountIds(organizationId);
  const [payment] = await db
    .insert(salesPaymentsTable)
    .values({
      invoiceId: invoice.id,
      paymentNumber,
      paymentDate: String(invoice.invoiceDate || today()).slice(0, 10),
      amount: String(amount),
      tdsAmount: "0",
      bankCharges: "0",
      netReceived: String(amount),
      settlementAccountId: id("1030"),
      paymentMethod: "Advance",
      reference: `${invoice.invoiceNumber} / Advance`,
      notes: "Advance received on invoice",
      createdByUserId: userId,
    })
    .returning();
  try {
    await triggerPaymentReceived(payment.id, organizationId, userId);
  } catch (error) {
    await db.delete(salesPaymentsTable).where(eq(salesPaymentsTable.id, payment.id));
    throw error;
  }
  return payment;
}

// Uses a customer's unapplied advances ("Advance Receipt" party entries from
// the ledger) to settle their open receivables, oldest first, so an invoice
// covered by money already held drops out of the outstanding list.
// No new journal: the advance was already posted Dr Bank / Cr Receivable when
// received. Sales invoices get a sales payment pointing at that journal (so
// the normal recalculation updates invoice + AR); manual/opening receivables
// get their received amount increased. The applied part of the advance is
// linked to the receivable (linkedArId), which the ledger then excludes.
export async function applyCustomerAdvances(organizationId: number, clientId: number) {
  const [entries, receivables, invoices] = await Promise.all([
    db.select().from(partyLedgerEntriesTable).where(eq(partyLedgerEntriesTable.organizationId, organizationId)),
    db.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.organizationId, organizationId)),
    db.select().from(salesInvoicesTable),
  ]);
  const advances = (entries as any[])
    .filter((row) => String(row.partyType).toLowerCase() === "customer" && Number(row.clientId) === Number(clientId)
      && row.entryType === "Advance Receipt" && !row.linkedArId && money(row.amount) > 0)
    .sort((a, b) => String(a.entryDate).localeCompare(String(b.entryDate)) || a.id - b.id);
  if (!advances.length) return 0;
  const invoicesById = new Map((invoices as any[]).map((row) => [Number(row.id), row]));
  const open = (receivables as any[])
    .filter((row) => Number(row.clientId) === Number(clientId) && row.entryType !== "Credit Note" && row.approvalStatus === "Approved")
    .map((row) => {
      let outstanding = Math.max(0, money(row.amount) - money(row.receivedAmount) - money(row.adjustedAmount));
      if (row.sourceType === "Sales Invoice") {
        const invoice = invoicesById.get(Number(row.sourceId));
        if (!invoice || !["Approved", "Paid"].includes(String(invoice.status))) return null;
        outstanding = Math.min(outstanding, money(invoice.balanceDue ?? invoice.grandTotal));
      }
      return { row, outstanding };
    })
    .filter((item): item is { row: any; outstanding: number } => Boolean(item && item.outstanding > 0.009))
    .sort((a, b) => String(a.row.invoiceDate).localeCompare(String(b.row.invoiceDate))
      || String(a.row.invoiceNumber).localeCompare(String(b.row.invoiceNumber), undefined, { numeric: true }) || a.row.id - b.row.id);
  let applied = 0;
  for (const advance of advances) {
    let available = money(advance.amount);
    for (const item of open) {
      if (available <= 0.009) break;
      const share = money(Math.min(available, item.outstanding));
      if (share <= 0) continue;
      const { row } = item;
      if (row.sourceType === "Sales Invoice") {
        const invoice = invoicesById.get(Number(row.sourceId));
        await db.insert(salesPaymentsTable).values({
          invoiceId: Number(row.sourceId),
          paymentNumber: `ADVADJ-${advance.id}-${row.id}`,
          paymentDate: [String(advance.entryDate || "").slice(0, 10), String(invoice?.invoiceDate || "").slice(0, 10)].sort().pop() || today(),
          amount: String(share),
          tdsAmount: "0",
          bankCharges: "0",
          netReceived: String(share),
          settlementAccountId: null,
          paymentMethod: "Advance Adjustment",
          reference: `${advance.reference} / ${row.invoiceNumber}`,
          notes: "Customer advance applied to invoice",
          journalEntryId: advance.journalEntryId ?? null,
        });
        await recalculateInvoiceAccounting(Number(row.sourceId), organizationId);
      } else {
        const received = money(money(row.receivedAmount) + share);
        await db.update(accountsReceivableTable).set({
          receivedAmount: String(received),
          status: received + money(row.adjustedAmount) >= money(row.amount) - 0.009 ? "Received" : "Partial",
        }).where(eq(accountsReceivableTable.id, row.id));
        row.receivedAmount = received;
      }
      // Split the advance: the applied part is linked to the receivable.
      if (share >= available - 0.009) {
        await db.update(partyLedgerEntriesTable).set({ linkedArId: row.id, updatedAt: new Date() }).where(eq(partyLedgerEntriesTable.id, advance.id));
      } else {
        await db.update(partyLedgerEntriesTable).set({ amount: String(money(available - share)), updatedAt: new Date() }).where(eq(partyLedgerEntriesTable.id, advance.id));
        const { id: _id, createdAt: _created, updatedAt: _updated, ...copy } = advance;
        await db.insert(partyLedgerEntriesTable).values({ ...copy, amount: String(share), linkedArId: row.id, notes: `Applied to ${row.invoiceNumber}` });
      }
      item.outstanding = money(item.outstanding - share);
      available = money(available - share);
      applied = money(applied + share);
    }
  }
  return applied;
}

// Applies every customer's unapplied advances (startup catch-up). Idempotent:
// only unlinked advance amounts are used.
export async function backfillCustomerAdvanceApplications() {
  const entries = await db.select().from(partyLedgerEntriesTable);
  const pairs = new Set(
    (entries as any[])
      .filter((row) => String(row.partyType).toLowerCase() === "customer" && row.entryType === "Advance Receipt" && !row.linkedArId && row.clientId)
      .map((row) => `${row.organizationId}:${row.clientId}`),
  );
  let applied = 0;
  const failed: string[] = [];
  for (const pair of pairs) {
    const [organizationId, clientId] = pair.split(":").map(Number);
    try {
      applied = money(applied + (await applyCustomerAdvances(organizationId, clientId)));
    } catch (error: any) {
      failed.push(`client ${clientId}: ${error?.message || error}`);
    }
  }
  return { customers: pairs.size, applied, failed };
}

// Catch-up for invoices approved before advances were posted on approval.
// Safe to run on every start: postInvoiceAdvance skips invoices already done.
export async function backfillInvoiceAdvances() {
  const [invoices, receivables, payments] = await Promise.all([
    db.select().from(salesInvoicesTable),
    db.select().from(accountsReceivableTable),
    db.select().from(salesPaymentsTable),
  ]);
  const postedAlready = new Set((payments as any[]).map((row) => String(row.paymentNumber)));
  const orgByInvoice = new Map(
    (receivables as any[])
      .filter((row) => row.sourceType === "Sales Invoice" && row.sourceId)
      .map((row) => [Number(row.sourceId), Number(row.organizationId)]),
  );
  let posted = 0;
  const failed: string[] = [];
  for (const invoice of invoices as any[]) {
    if (!["Approved", "Paid"].includes(invoice.status) || !(money(invoice.advanceAmount) > 0)) continue;
    const organizationId = orgByInvoice.get(Number(invoice.id));
    if (!organizationId || postedAlready.has(`ADV-${invoice.invoiceNumber}-${invoice.id}`)) continue;
    try {
      if (await postInvoiceAdvance(Number(invoice.id), organizationId)) posted += 1;
    } catch (error: any) {
      failed.push(`${invoice.invoiceNumber}: ${error?.message || error}`);
    }
  }
  return { checked: invoices.length, posted, failed };
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
  const revenueAccountId = id("1200");
  let journal: any = salesReturn.journalEntryId ? { id: salesReturn.journalEntryId } : null;
  if (!journal) journal = await postJournal(
    organizationId,
    {
      entryDate: salesReturn.returnDate,
      reference: `AUTO:SALES:CREDIT:${salesReturn.returnNumber}`,
      description: `Sales credit note ${salesReturn.returnNumber}`,
      sourceType: "Sales Credit Note",
      sourceId: salesReturn.id,
      lines: [
        { accountId: revenueAccountId, debit: total },
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
      approvalStatus: "Approved",
      approvalLevel: 1,
      requiredApprovals: 1,
      approvedByUserIds: JSON.stringify(userId ? [userId] : []),
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
  // An advance adjustment shares the original advance's journal; reversing it
  // here would undo the cash receipt itself.
  if (payment.paymentMethod === "Advance Adjustment")
    throw new Error("A customer advance applied to this invoice cannot be deleted here");
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
        { accountId: id("1200"), debit: amount },
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
