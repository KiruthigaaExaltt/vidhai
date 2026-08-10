import { Router } from "express";
import {
  accountsPayableTable,
  accountsReceivableTable,
  and,
  asc,
  chartOfAccountsTable,
  db,
  desc,
  eq,
  journalEntriesTable,
  journalLinesTable,
} from "@workspace/db";
import { effectivePermissions, getAuthUser } from "../lib/access";
const router = Router(),
  m = (v: any) => {
    const parsed = Number(v?.$numberDecimal ?? v?.toString?.() ?? v ?? 0);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
  },
  day = () => new Date().toISOString().slice(0, 10);
const canonical = [
  ["1020", "Bank Account", "Asset"],
  ["1030", "Cash in Hand", "Asset"],
  ["1100", "Accounts Receivable", "Asset"],
  ["1110", "Advance to Vendor", "Asset"],
  ["1120", "TDS Receivable", "Asset"],
  ["1130", "CGST Input Credit", "Asset"],
  ["1131", "SGST Input Credit", "Asset"],
  ["1132", "IGST Input Credit", "Asset"],
  ["1140", "Vendor Receivable", "Asset"],
  ["1150", "Employee Advance", "Asset"],
  ["1160", "Purchase Return Receivable", "Asset"],
  ["1200", "Inventory / Stock-in-Hand", "Asset"],
  ["2100", "Accounts Payable", "Liability"],
  ["2110", "Vendor Advances", "Liability"],
  ["2130", "Expense Claims Payable", "Liability"],
  ["2140", "Accrued Expenses", "Liability"],
  ["2150", "TDS Payable", "Liability"],
  ["2210", "CGST Output", "Liability"],
  ["2220", "SGST Output", "Liability"],
  ["2230", "IGST Output", "Liability"],
  ["3000", "Capital A/c", "Equity"],
  ["3100", "Retained Earnings", "Equity"],
  ["3200", "Current Year Profit & Loss", "Equity"],
  ["3300", "Owner Withdrawals", "Equity"],
  ["4100", "Sales Revenue", "Revenue"],
  ["4110", "Sales Return", "Revenue"],
  ["4200", "Other Income", "Revenue"],
  ["5100", "Procurement Expense", "Expense"],
  ["5120", "Freight / Transportation", "Expense"],
  ["5130", "Purchase Discounts", "Expense"],
  ["5140", "Claims Expense", "Expense"],
  ["5150", "Miscellaneous Expense", "Expense"],
  ["5200", "Bank Charges", "Expense"],
] as const;
router.use(async (req: any, res, next): Promise<any> => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  req.acc = {
    user,
    org: Number(user.organizationId ?? 1),
    p: await effectivePermissions(user),
  };
  next();
});
const can = (r: any, k: string) => r.acc.p.includes("*") || r.acc.p.includes(k),
  need = (r: any, s: any, k: string) =>
    can(r, k)
      ? true
      : (s.status(403).json({ error: `Missing permission: ${k}` }), false);
async function coa(org: number) {
  const old = await db
    .select()
    .from(chartOfAccountsTable)
    .where(eq(chartOfAccountsTable.organizationId, org));
  for (const [accountCode, accountName, accountType] of canonical)
    if (!old.some((x: any) => x.accountCode === accountCode))
      await db
        .insert(chartOfAccountsTable)
        .values({
          organizationId: org,
          accountCode,
          accountName,
          accountType,
          currentBalance: 0,
          isActive: true,
        });
  const rows = await db
      .select()
      .from(chartOfAccountsTable)
      .where(eq(chartOfAccountsTable.organizationId, org))
      .orderBy(asc(chartOfAccountsTable.accountCode)),
    lines = await db
      .select()
      .from(journalLinesTable)
      .where(eq(journalLinesTable.organizationId, org));
  for (const a of rows) {
    const b = m(
      lines
        .filter((l: any) => l.accountId === a.id)
        .reduce(
          (s: number, l: any) => s + Number(l.debit) - Number(l.credit),
          0,
        ),
    );
    if (m(a.currentBalance) !== b)
      await db
        .update(chartOfAccountsTable)
        .set({ currentBalance: b })
        .where(eq(chartOfAccountsTable.id, a.id));
    a.currentBalance = String(b);
  }
  return rows;
}
async function post(org: number, b: any, userId?: number) {
  const ls = (b.lines || []).map((l: any) => ({
      ...l,
      debit: m(l.debit),
      credit: m(l.credit),
    })),
    dr = m(ls.reduce((s: number, l: any) => s + l.debit, 0)),
    cr = m(ls.reduce((s: number, l: any) => s + l.credit, 0));
  if (!ls.length || dr <= 0 || Math.abs(dr - cr) > 0.009)
    throw Error("Journal debit and credit must balance");
  const dup = (
    await db
      .select()
      .from(journalEntriesTable)
      .where(
        and(
          eq(journalEntriesTable.organizationId, org),
          eq(journalEntriesTable.reference, String(b.reference)),
        ),
      )
  )[0];
  if (dup) return dup;
  if (b.sourceType && b.sourceType !== "Manual" && b.sourceId) {
    const sourceDuplicate = (
      await db
        .select()
        .from(journalEntriesTable)
        .where(eq(journalEntriesTable.organizationId, org))
    ).find(
      (entry: any) =>
        entry.sourceType === b.sourceType &&
        Number(entry.sourceId) === Number(b.sourceId),
    );
    if (sourceDuplicate) return sourceDuplicate;
  }
  const accounts = await coa(org);
  return db.transaction(async (tx) => {
    const [e] = await tx
      .insert(journalEntriesTable)
      .values({
        organizationId: org,
        entryDate: b.entryDate || day(),
        reference: b.reference || `MANUAL:${Date.now()}`,
        description: b.description || "Journal entry",
        totalDebit: dr,
        totalCredit: cr,
        status: "Posted",
        sourceType: b.sourceType || "Manual",
        sourceId: b.sourceId,
        createdByUserId: userId,
      })
      .returning();
    for (const l of ls) {
      const a = accounts.find((x: any) => Number(x.id) === Number(l.accountId));
      if (!a) throw Error("Invalid account");
      await tx
        .insert(journalLinesTable)
        .values({
          organizationId: org,
          journalEntryId: e.id,
          accountId: a.id,
          accountCode: a.accountCode,
          accountName: a.accountName,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo || "",
        });
      await tx
        .update(chartOfAccountsTable)
        .set({
          currentBalance: m(Number(a.currentBalance) + l.debit - l.credit),
        })
        .where(eq(chartOfAccountsTable.id, a.id));
    }
    return e;
  });
}
async function reverseJournal(org: number, journalEntryId: number) {
  const [entry] = await db
    .select()
    .from(journalEntriesTable)
    .where(
      and(
        eq(journalEntriesTable.organizationId, org),
        eq(journalEntriesTable.id, journalEntryId),
      ),
    )
    .limit(1);
  if (!entry) return false;
  const lines = await db
    .select()
    .from(journalLinesTable)
    .where(eq(journalLinesTable.journalEntryId, journalEntryId));
  await db.transaction(async (tx) => {
    for (const line of lines) {
      const [account] = await tx
        .select()
        .from(chartOfAccountsTable)
        .where(eq(chartOfAccountsTable.id, line.accountId))
        .limit(1);
      if (account)
        await tx
          .update(chartOfAccountsTable)
          .set({
            currentBalance: m(
              Number(account.currentBalance) -
                Number(line.debit) +
                Number(line.credit),
            ),
          })
          .where(eq(chartOfAccountsTable.id, account.id));
    }
    await tx
      .delete(journalEntriesTable)
      .where(eq(journalEntriesTable.id, journalEntryId));
  });
  return true;
}
async function automate(org: number) {
  const accounts = await coa(org),
    id = (code: string) =>
      accounts.find((a: any) => a.accountCode === code)?.id;
  const {
    salesInvoicesTable,
    salesReturnsTable,
    salesReceivableAdjustmentsTable,
    purchaseInvoicesTable,
    vendorPaymentsTable,
    payrollTable,
    crewClaimsTable,
  } = await import("@workspace/db");
  for (const x of await db.select().from(salesInvoicesTable)) {
    const eligible = ["Approved", "Paid"].includes(x.status) && m(x.grandTotal) > 0;
    if (!eligible) {
      const staleReceivables = (
        await db
          .select()
          .from(accountsReceivableTable)
          .where(eq(accountsReceivableTable.organizationId, org))
      ).filter((row: any) => row.sourceType === "Sales Invoice" && Number(row.sourceId) === Number(x.id));
      for (const row of staleReceivables)
        await db.delete(accountsReceivableTable).where(eq(accountsReceivableTable.id, row.id));
      const staleJournals = (
        await db
          .select()
          .from(journalEntriesTable)
          .where(eq(journalEntriesTable.organizationId, org))
      ).filter((row: any) => row.sourceType === "Sales Invoice" && Number(row.sourceId) === Number(x.id));
      for (const journal of staleJournals) await reverseJournal(org, journal.id);
      if (x.journalEntryId)
        await db.update(salesInvoicesTable).set({ journalEntryId: null }).where(eq(salesInvoicesTable.id, x.id));
      continue;
    }
    const lines = [
      { accountId: id("1100"), debit: m(x.grandTotal) },
      {
        accountId: id("4100"),
        credit: m(
          m(x.grandTotal) - m(x.cgstTotal) - m(x.sgstTotal) - m(x.igstTotal),
        ),
      },
      { accountId: id("2210"), credit: m(x.cgstTotal) },
      { accountId: id("2220"), credit: m(x.sgstTotal) },
      { accountId: id("2230"), credit: m(x.igstTotal) },
    ].filter((l: any) => l.debit || l.credit);
    const sourceJournals = (
      await db
        .select()
        .from(journalEntriesTable)
        .where(eq(journalEntriesTable.organizationId, org))
    ).filter(
      (entry: any) =>
        entry.sourceType === "Sales Invoice" &&
        Number(entry.sourceId) === Number(x.id),
    );
    const linkedJournal = sourceJournals.find(
      (entry: any) => Number(entry.id) === Number(x.journalEntryId),
    );
    const keeper = linkedJournal || sourceJournals.sort((a: any, b: any) => Number(b.id) - Number(a.id))[0];
    for (const duplicate of sourceJournals)
      if (keeper && Number(duplicate.id) !== Number(keeper.id))
        await reverseJournal(org, duplicate.id);
    const j =
      keeper ||
      (await post(org, {
        entryDate: x.invoiceDate,
        reference: `AUTO:SALES:${x.invoiceNumber}:${x.id}`,
        description: `Sales invoice ${x.invoiceNumber}`,
        sourceType: "Sales Invoice",
        sourceId: x.id,
        lines,
      }));
    if (Number(x.journalEntryId || 0) !== Number(j.id))
      await db
        .update(salesInvoicesTable)
        .set({ journalEntryId: j.id })
        .where(eq(salesInvoicesTable.id, x.id));
    const existingReceivable = (
      await db
        .select()
        .from(accountsReceivableTable)
        .where(
          and(
            eq(accountsReceivableTable.organizationId, org),
            eq(accountsReceivableTable.sourceType, "Sales Invoice"),
            eq(accountsReceivableTable.sourceId, x.id),
          ),
        )
    )[0];
    if (!existingReceivable)
      await db
        .insert(accountsReceivableTable)
        .values({
          organizationId: org,
          clientId: x.clientId,
          clientName: x.clientName,
          invoiceNumber: x.invoiceNumber,
          invoiceDate: x.invoiceDate,
          dueDate: x.dueDate || x.invoiceDate,
          amount: m(x.grandTotal),
          receivedAmount: m(x.amountPaid),
          adjustedAmount: 0,
          status:
            m(x.amountPaid) >= m(x.grandTotal)
              ? "Received"
              : m(x.amountPaid) > 0
                ? "Partial"
                : "Pending",
          entryType: "Invoice",
          journalEntryId: j.id,
          sourceType: "Sales Invoice",
          sourceId: x.id,
        });
    else if (Number(existingReceivable.journalEntryId) !== Number(j.id))
      await db
        .update(accountsReceivableTable)
        .set({ journalEntryId: j.id })
        .where(eq(accountsReceivableTable.id, existingReceivable.id));
  }
  const receivables = await db
    .select()
    .from(accountsReceivableTable)
    .where(eq(accountsReceivableTable.organizationId, org));
  const creditedReturns = (await db.select().from(salesReturnsTable)).filter(
    (row: any) => row.status === "Credit Issued" && row.invoiceId,
  );
  const receivableAdjustments = await db.select().from(salesReceivableAdjustmentsTable);
  for (const ar of receivables.filter(
    (row: any) =>
      row.entryType === "Invoice" &&
      ["Pending", "Partial", "Overdue"].includes(row.status),
  )) {
    const requestedAdjustment =
      ar.sourceType === "Sales Invoice" && ar.sourceId
        ? m(
            creditedReturns
              .filter((row: any) => Number(row.invoiceId) === Number(ar.sourceId))
              .reduce((sum: number, row: any) => sum + m(row.grandTotal), 0) +
              receivableAdjustments
                .filter((row: any) => Number(row.invoiceId) === Number(ar.sourceId))
                .reduce((sum: number, row: any) => sum + m(row.amount), 0),
          )
        : m(ar.adjustedAmount);
    const adjustedAmount = Math.min(
      Math.max(0, m(ar.amount) - m(ar.receivedAmount)),
      requestedAdjustment,
    );
    const outstanding = m(
      m(ar.amount) - m(ar.receivedAmount) - adjustedAmount,
    );
    const overdue = outstanding > 0 && String(ar.dueDate).slice(0, 10) < day();
    const nextArStatus =
      outstanding <= 0
        ? adjustedAmount > 0
          ? "Settled"
          : "Received"
        : overdue
          ? "Overdue"
          : m(ar.receivedAmount) > 0 || adjustedAmount > 0
            ? "Partial"
            : "Pending";
    if (nextArStatus !== ar.status || adjustedAmount !== m(ar.adjustedAmount))
      await db
        .update(accountsReceivableTable)
        .set({ status: nextArStatus, adjustedAmount: String(adjustedAmount) })
        .where(eq(accountsReceivableTable.id, ar.id));
    if (ar.sourceType === "Sales Invoice" && ar.sourceId)
      await db
        .update(salesInvoicesTable)
        .set({
          balanceDue: String(Math.max(0, outstanding)),
          paymentStatus:
            nextArStatus === "Received"
              ? "Paid"
              : nextArStatus === "Settled"
                ? "Settled"
                : nextArStatus === "Pending"
                  ? "Unpaid"
                  : nextArStatus,
        })
        .where(eq(salesInvoicesTable.id, ar.sourceId));
  }
  for (const x of await db.select().from(purchaseInvoicesTable)) {
    if (Number(x.amount) <= 0) continue;
    const j = await post(org, {
      entryDate: x.invoiceDate,
      reference: `PURCH:${x.invoiceNumber}`,
      description: `Purchase invoice ${x.invoiceNumber}`,
      sourceType: "Purchase Invoice",
      sourceId: x.id,
      lines: [
        { accountId: id("5100"), debit: m(x.amount) },
        { accountId: id("2100"), credit: m(x.amount) },
      ],
    });
    if (
      !(
        await db
          .select()
          .from(accountsPayableTable)
          .where(
            and(
              eq(accountsPayableTable.organizationId, org),
              eq(accountsPayableTable.billNumber, x.invoiceNumber),
            ),
          )
      ).length
    )
      await db
        .insert(accountsPayableTable)
        .values({
          organizationId: org,
          vendorName: x.vendorName,
          billNumber: x.invoiceNumber,
          billDate: x.invoiceDate,
          dueDate: x.dueDate,
          amount: m(x.amount),
          paidAmount: x.status === "Paid" ? m(x.amount) : 0,
          adjustedAmount: 0,
          status: x.status === "Paid" ? "Paid" : "Pending",
          entryType: "Bill",
          journalEntryId: j.id,
          sourceType: "Purchase Invoice",
          sourceId: x.id,
        });
  }
  for (const x of await db.select().from(vendorPaymentsTable)) {
    if (x.status !== "Completed" || Number(x.amount) <= 0) continue;
    await post(org, {
      entryDate: x.paymentDate,
      reference: `AUTO:FLEX:PAY:${x.invoiceReference}:${x.paymentNumber}`,
      description: `Vendor payment ${x.paymentNumber}`,
      sourceType: "Vendor Payment",
      sourceId: x.id,
      lines: [
        { accountId: id("2100"), debit: m(x.amount) },
        { accountId: id("1020"), credit: m(x.amount) },
      ],
    });
  }
  for (const x of await db.select().from(payrollTable)) {
    if (!["Processed", "Approved", "Paid"].includes(x.status)) continue;
    await post(org, {
      entryDate: x.processedAt
        ? new Date(x.processedAt).toISOString().slice(0, 10)
        : day(),
      reference: `PAY-${x.payPeriod}-${x.id}-ACCRUAL`,
      description: `Payroll accrual - ${x.employeeName}`,
      sourceType: "Payroll",
      sourceId: x.id,
      lines: [
        { accountId: id("5150"), debit: m(x.grossPay) },
        { accountId: id("2150"), credit: m(x.deductions) },
        { accountId: id("2140"), credit: m(x.netPay) },
      ],
    });
    if (x.status === "Paid")
      await post(org, {
        entryDate: x.paidAt
          ? new Date(x.paidAt).toISOString().slice(0, 10)
          : day(),
        reference: `PAY-${x.payPeriod}-${x.id}-PAYMENT`,
        description: `Payroll settlement - ${x.employeeName}`,
        sourceType: "Payroll Payment",
        sourceId: x.id,
        lines: [
          { accountId: id("2140"), debit: m(x.netPay) },
          { accountId: id("1020"), credit: m(x.netPay) },
        ],
      });
  }
  for (const x of await db.select().from(crewClaimsTable)) {
    if (
      x.status !== "Approved" ||
      x.claimType === "bonus" ||
      Number(x.amount) <= 0
    )
      continue;
    await post(org, {
      entryDate: x.approvedAt
        ? new Date(x.approvedAt).toISOString().slice(0, 10)
        : day(),
      reference: `AUTO:CREW:CLAIM:${x.id}`,
      description: `Crew claim - ${x.employeeName}`,
      sourceType: "Crew Claim",
      sourceId: x.id,
      lines: [
        { accountId: id("5140"), debit: m(x.amount) },
        { accountId: id("2130"), credit: m(x.amount) },
      ],
    });
  }
}
const pg = (xs: any[], r: any) => {
  const skip = Math.max(0, Number(r.query.skip || 0)),
    limit = Math.min(100, Math.max(1, Number(r.query.limit || 25)));
  return { items: xs.slice(skip, skip + limit), total: xs.length, skip, limit };
};
const serializeMoneyFields = (row: any) => {
  const result = { ...row };
  for (const field of ["amount", "paidAmount", "receivedAmount", "adjustedAmount", "totalDebit", "totalCredit", "currentBalance"])
    if (field in result) result[field] = m(result[field]);
  return result;
};
router.get("/coa", async (r: any, s): Promise<any> => {
  if (need(r, s, "accounts.chart_of_accounts.view"))
    s.json(await coa(r.acc.org));
});
router.get("/coa/summary", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.chart_of_accounts.view")) return;
  const a = await coa(r.acc.org);
  s.json({
    accounts: a,
    groups: Object.fromEntries(
      ["Asset", "Liability", "Equity", "Revenue", "Expense"].map((t) => [
        t,
        a.filter((x: any) => x.accountType === t),
      ]),
    ),
  });
});
router.post("/coa/migrate-canonical", async (r: any, s): Promise<any> => {
  if (need(r, s, "accounts.chart_of_accounts.edit"))
    s.json(await coa(r.acc.org));
});
router.post("/coa", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.chart_of_accounts.create")) return;
  const dup = (
    await db
      .select()
      .from(chartOfAccountsTable)
      .where(
        and(
          eq(chartOfAccountsTable.organizationId, r.acc.org),
          eq(chartOfAccountsTable.accountCode, String(r.body.accountCode)),
        ),
      )
  )[0];
  if (dup) return s.status(409).json({ error: "Account code already exists" });
  const [x] = await db
    .insert(chartOfAccountsTable)
    .values({
      ...r.body,
      organizationId: r.acc.org,
      currentBalance: m(r.body.currentBalance),
    })
    .returning();
  s.status(201).json(x);
});
router.patch("/coa/:id", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.chart_of_accounts.edit")) return;
  const [x] = await db
    .update(chartOfAccountsTable)
    .set(r.body)
    .where(
      and(
        eq(chartOfAccountsTable.organizationId, r.acc.org),
        eq(chartOfAccountsTable.id, Number(r.params.id)),
      ),
    )
    .returning();
  s.json(x);
});
router.delete("/coa/:id", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.chart_of_accounts.delete")) return;
  if (
    (
      await db
        .select()
        .from(journalLinesTable)
        .where(eq(journalLinesTable.accountId, Number(r.params.id)))
    ).length
  )
    return s
      .status(409)
      .json({ error: "Referenced accounts cannot be deleted" });
  await db
    .delete(chartOfAccountsTable)
    .where(eq(chartOfAccountsTable.id, Number(r.params.id)));
  s.status(204).send();
});
router.get("/journal-entries", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.journal_entries.view")) return;
  let x = await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.organizationId, r.acc.org))
    .orderBy(desc(journalEntriesTable.entryDate));
  s.json(pg(x, r));
});
router.get("/journal-entries/:id/lines", async (r: any, s): Promise<any> => {
  if (need(r, s, "accounts.journal_entries.view"))
    s.json(
      await db
        .select()
        .from(journalLinesTable)
        .where(
          and(
            eq(journalLinesTable.organizationId, r.acc.org),
            eq(journalLinesTable.journalEntryId, Number(r.params.id)),
          ),
        ),
    );
});
router.post("/journal-entries", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.journal_entries.create")) return;
  try {
    s.status(201).json(await post(r.acc.org, r.body, r.acc.user.id));
  } catch (e: any) {
    s.status(400).json({ error: e.message });
  }
});
router.delete("/journal-entries/:id", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.journal_entries.delete")) return;
  await reverseJournal(r.acc.org, Number(r.params.id));
  s.status(204).send();
});
for (const c of [
  {
    p: "ap",
    t: accountsPayableTable,
    k: "accounts.accounts_payable",
    paid: "paidAmount",
    done: "Paid",
  },
  {
    p: "ar",
    t: accountsReceivableTable,
    k: "accounts.accounts_receivable",
    paid: "receivedAmount",
    done: "Received",
  },
] as const) {
  router.get(`/${c.p}`, async (r: any, s): Promise<any> => {
    if (need(r, s, `${c.k}.view`))
      s.json(
        pg(
          (
            await db
              .select()
              .from(c.t)
              .where(eq(c.t.organizationId, r.acc.org))
              .orderBy(desc(c.t.createdAt))
          ).map(serializeMoneyFields),
          r,
        ),
      );
  });
  router.post(`/${c.p}`, async (r: any, s): Promise<any> => {
    if (!need(r, s, `${c.k}.create`)) return;
    const amount = m(r.body.amount),
      covered = m(r.body[c.paid]) + m(r.body.adjustedAmount);
    if (amount <= 0)
      return s.status(400).json({ error: "Amount must be positive" });
    const [x] = await db
      .insert(c.t)
      .values({
        ...r.body,
        organizationId: r.acc.org,
        amount,
        status:
          covered >= amount ? c.done : covered > 0 ? "Partial" : "Pending",
      })
      .returning();
    s.status(201).json(x);
  });
  router.patch(`/${c.p}/:id`, async (r: any, s): Promise<any> => {
    if (!need(r, s, `${c.k}.edit`)) return;
    const [o] = await db
        .select()
        .from(c.t)
        .where(eq(c.t.id, Number(r.params.id)))
        .limit(1),
      b = { ...o, ...r.body },
      covered = m(b[c.paid]) + m(b.adjustedAmount);
    const [x] = await db
      .update(c.t)
      .set({
        ...r.body,
        status:
          covered >= m(b.amount) ? c.done : covered > 0 ? "Partial" : "Pending",
      })
      .where(eq(c.t.id, o.id))
      .returning();
    s.json(x);
  });
  router.delete(`/${c.p}/:id`, async (r: any, s): Promise<any> => {
    if (need(r, s, `${c.k}.delete`)) {
      await db.delete(c.t).where(eq(c.t.id, Number(r.params.id)));
      s.status(204).send();
    }
  });
}
router.get("/dashboard-summary", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.finance_dashboard.view")) return;
  await automate(r.acc.org);
  const [a, ap, ar] = await Promise.all([
      coa(r.acc.org),
      db
        .select()
        .from(accountsPayableTable)
        .where(eq(accountsPayableTable.organizationId, r.acc.org)),
      db
        .select()
        .from(accountsReceivableTable)
        .where(eq(accountsReceivableTable.organizationId, r.acc.org)),
    ]),
    out = (x: any, p: string) =>
      Math.max(
        0,
        m(Number(x.amount) - Number(x[p]) - Number(x.adjustedAmount)),
      );
  s.json({
    cash: m(
      a
        .filter((x: any) => ["1020", "1030"].includes(x.accountCode))
        .reduce((q: number, x: any) => q + Number(x.currentBalance), 0),
    ),
    receivables: m(
      ar
        .filter((x: any) => x.entryType !== "Credit Note")
        .reduce((q: number, x: any) => q + out(x, "receivedAmount"), 0),
    ),
    payables: m(ap.reduce((q: number, x: any) => q + out(x, "paidAmount"), 0)),
    income: m(
      a
        .filter((x: any) => x.accountType === "Revenue")
        .reduce((q: number, x: any) => q - Number(x.currentBalance), 0),
    ),
    expenses: m(
      a
        .filter((x: any) => x.accountType === "Expense")
        .reduce((q: number, x: any) => q + Number(x.currentBalance), 0),
    ),
  });
});
router.get("/financial-statements", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.financial_statements.view")) return;
  const a = await coa(r.acc.org),
    v = (x: any) =>
      m(
        ["Liability", "Equity", "Revenue"].includes(x.accountType)
          ? -Number(x.currentBalance)
          : Number(x.currentBalance),
      ),
    g = (t: string) =>
      a
        .filter((x: any) => x.accountType === t)
        .map((x: any) => ({ ...x, balance: v(x) })),
    revenue = g("Revenue"),
    expenses = g("Expense"),
    netIncome = m(
      revenue.reduce((q: number, x: any) => q + x.balance, 0) -
        expenses.reduce((q: number, x: any) => q + x.balance, 0),
    );
  s.json({
    profitAndLoss: { revenue, expenses, netIncome },
    balanceSheet: {
      assets: g("Asset"),
      liabilities: g("Liability"),
      equity: g("Equity"),
      currentPeriodEarnings: netIncome,
    },
    trialBalance: a.map((x: any) => ({
      ...x,
      debit: Math.max(0, Number(x.currentBalance)),
      credit: Math.max(0, -Number(x.currentBalance)),
    })),
  });
});
router.get("/customer-ledger", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.customer_ledger.view")) return;
  const xs = await db
      .select()
      .from(accountsReceivableTable)
      .where(eq(accountsReceivableTable.organizationId, r.acc.org)),
    z = new Map<string, any>();
  for (const x of xs) {
    const k = x.clientName,
      q = z.get(k) || {
        clientId: x.clientId,
        clientName: k,
        invoiced: 0,
        received: 0,
        credited: 0,
        outstanding: 0,
      };
    if (x.entryType === "Credit Note") {
      q.credited += m(x.amount);
      z.set(k, q);
      continue;
    }
    q.invoiced += m(x.amount);
    q.received += m(x.receivedAmount);
    q.outstanding += Math.max(
      0,
      m(x.amount) - m(x.receivedAmount) - m(x.adjustedAmount),
    );
    z.set(k, q);
  }
  s.json([...z.values()]);
});
router.get("/vendor-ledger", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.vendor_ledger.view")) return;
  const xs = await db
      .select()
      .from(accountsPayableTable)
      .where(eq(accountsPayableTable.organizationId, r.acc.org)),
    z = new Map<string, any>();
  for (const x of xs) {
    const k = x.vendorName,
      q = z.get(k) || { vendorName: k, billed: 0, paid: 0, outstanding: 0 };
    q.billed += Number(x.amount);
    q.paid += Number(x.paidAmount);
    q.outstanding += Math.max(
      0,
      Number(x.amount) - Number(x.paidAmount) - Number(x.adjustedAmount),
    );
    z.set(k, q);
  }
  s.json([...z.values()]);
});
router.get("/business-dashboard", async (r: any, s): Promise<any> => {
  if (need(r, s, "accounts.finance_dashboard.view"))
    s.redirect(307, "./dashboard-summary");
});
export {
  post as postJournal,
  coa as ensureCanonicalAccounts,
  reverseJournal,
};
export default router;
