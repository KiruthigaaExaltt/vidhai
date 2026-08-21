import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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
  partyLedgerEntriesTable,
  inventoryTable,
  purchaseInvoicesTable,
  salesInvoicesTable,
  salesPaymentsTable,
} from "@workspace/db";
import { paginateQuery, paginationMetadata } from "../lib/pagination";
import { postMatchedPurchaseInvoice } from "../lib/procurementAutomation";
import { effectivePermissions, getAuthUser } from "../lib/access";
import { resolveUploadPath } from "../lib/uploadStorage";
const router = Router(),
  m = (v: any) => {
    const parsed = Number(v?.$numberDecimal ?? v?.toString?.() ?? v ?? 0);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
  },
  day = () => new Date().toISOString().slice(0, 10);
const canonical = [
  ["1020", "Bank Account", "Asset"],
  ["1021", "SBI Current A/c", "Asset"],
  ["1022", "HDFC Current A/c", "Asset"],
  ["1023", "UPI Settlement A/c", "Asset"],
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
const accountSourceRegistry = {
  financeDashboard: ["chart_of_accounts", "journal_entries", "journal_lines", "accounts_payable", "accounts_receivable", "party_ledger_entries", "bank_cash_transactions", "sales_invoices", "purchase_invoices", "sales_payments", "vendor_payments", "inventory"],
  customerLedger: ["accounts_receivable", "party_ledger_entries", "journal_entries", "journal_lines", "sales_invoices", "sales_payments", "sales_returns"],
  vendorLedger: ["accounts_payable", "party_ledger_entries", "journal_entries", "journal_lines", "purchase_invoices", "vendor_payments", "purchase_returns"],
  chartOfAccounts: ["chart_of_accounts", "account_groups", "account_cost_centers", "journal_lines", "bank_cash_transactions"],
  accountsPayable: ["accounts_payable", "party_ledger_entries", "journal_entries", "journal_lines", "purchase_invoices", "vendor_payments", "purchase_returns"],
  accountsReceivable: ["accounts_receivable", "party_ledger_entries", "journal_entries", "journal_lines", "sales_invoices", "sales_payments", "sales_returns"],
  journalEntries: ["journal_entries", "journal_lines", "chart_of_accounts", "account_documents", "bank_cash_transactions", "accounts_receivable", "accounts_payable"],
  financialStatements: ["chart_of_accounts", "journal_entries", "journal_lines", "account_groups", "account_cost_centers", "bank_cash_transactions", "accounts_receivable", "accounts_payable", "sales_invoices", "purchase_invoices", "sales_payments", "vendor_payments"],
  tallyExport: ["chart_of_accounts", "account_groups", "account_cost_centers", "journal_entries", "journal_lines", "bank_cash_transactions", "accounts_receivable", "accounts_payable", "sales_invoices", "purchase_invoices", "sales_payments", "vendor_payments"],
};
const defaultTransactionTypes = [
  ["OPENING_BALANCE", "Opening Balance", "Credit", "Journal"],
  ["OWNER_CONTRIBUTION", "Owner Contribution", "Credit", "Receipt"],
  ["OWNER_WITHDRAWAL", "Owner Withdrawal", "Debit", "Payment"],
  ["BANK_DEPOSIT", "Bank Deposit", "Credit", "Receipt"],
  ["BANK_WITHDRAWAL", "Bank Withdrawal", "Debit", "Payment"],
  ["BANK_TRANSFER", "Bank Transfer", "Transfer", "Contra"],
  ["MISC_INCOME", "Miscellaneous Income", "Credit", "Receipt"],
  ["MISC_EXPENSE", "Miscellaneous Expense", "Debit", "Payment"],
  ["ADJUSTMENT", "Adjustment", "Either", "Journal"],
] as const;
const sanitizeFileName = (value: string) =>
  String(value || "document")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "document";
async function accountTables() {
  return import("@workspace/db");
}
async function ensureAccountMasters(org: number) {
  const { accountGroupsTable, accountTransactionTypesTable } = await accountTables();
  const groups = [
    ["Bank Accounts", "Current Assets", "Asset"],
    ["Cash-in-Hand", "Current Assets", "Asset"],
    ["Capital Account", "Equity", "Equity"],
    ["Direct Expenses", "Expense", "Expense"],
    ["Indirect Expenses", "Expense", "Expense"],
    ["Sales Accounts", "Revenue", "Revenue"],
    ["Purchase Accounts", "Expense", "Expense"],
  ];
  const existingGroups = await db.select().from(accountGroupsTable).where(eq(accountGroupsTable.organizationId, org));
  for (const [name, parentName, accountType] of groups)
    if (!existingGroups.some((row: any) => String(row.name).toLowerCase() === name.toLowerCase()))
      await db.insert(accountGroupsTable).values({ organizationId: org, name, parentName, tallyGroupName: name, accountType, isSystem: true, isActive: true });
  const existingTypes = await db.select().from(accountTransactionTypesTable).where(eq(accountTransactionTypesTable.organizationId, org));
  for (const [code, name, direction, tallyVoucherType] of defaultTransactionTypes)
    if (!existingTypes.some((row: any) => String(row.code).toUpperCase() === code))
      await db.insert(accountTransactionTypesTable).values({ organizationId: org, code, name, direction, tallyVoucherType, isSystem: true, isActive: true });
}
async function saveAccountDocument(org: number, userId: number, sourceType: string, sourceId: number, data: any, journalEntryId?: number) {
  if (!data?.content || typeof data.content !== "string") return null;
  const match = data.content.match(/^data:([\w/+.-]+);base64,(.+)$/s);
  if (!match) throw new Error("Invalid account document upload");
  const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
  const mimeType = match[1];
  if (!allowed.has(mimeType)) throw new Error("Unsupported account document type");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 10 * 1024 * 1024) throw new Error("Account document must not exceed 10 MB");
  const ext = mimeType.includes("pdf") ? "pdf" : mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : mimeType.includes("spreadsheet") ? "xlsx" : mimeType.includes("excel") ? "xls" : "jpg";
  const directory = resolveUploadPath("accounts", String(org), sourceType);
  await mkdir(directory, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}-${sanitizeFileName(data.name || "document")}.${ext}`;
  await writeFile(path.join(directory, fileName), buffer);
  const { accountDocumentsTable } = await accountTables();
  const [row] = await db.insert(accountDocumentsTable).values({
    organizationId: org, sourceType, sourceId, journalEntryId: journalEntryId ?? null,
    fileName, originalName: data.name || fileName, mimeType, size: buffer.length,
    url: `/api/accounts/files/${sourceType}/${fileName}`, uploadedByUserId: userId,
  }).returning();
  return row;
}
async function documentsFor(sourceType: string, sourceIds: number[]) {
  if (!sourceIds.length) return new Map<number, any[]>();
  const { accountDocumentsTable } = await accountTables();
  const rows = await db.select().from(accountDocumentsTable);
  const map = new Map<number, any[]>();
  for (const row of rows as any[]) {
    if (row.sourceType !== sourceType || !sourceIds.includes(Number(row.sourceId))) continue;
    const list = map.get(Number(row.sourceId)) || [];
    list.push(row);
    map.set(Number(row.sourceId), list);
  }
  return map;
}
function tallyDate(value: any) {
  return String(value || day()).slice(0, 10).replace(/-/g, "");
}
function xml(value: any) {
  return String(value ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] || c);
}
function csv(value: any) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function downloadName(ext: string) {
  return `tally-export-${day()}.${ext}`;
}
async function coa(org: number) {
  await ensureAccountMasters(org);
  const old = await db
    .select()
    .from(chartOfAccountsTable)
    .where(eq(chartOfAccountsTable.organizationId, org));
  for (const [accountCode, accountName, accountType] of canonical)
    if (!old.some((x: any) => x.accountCode === accountCode))
      await db.insert(chartOfAccountsTable).values({
        organizationId: org,
        accountCode,
        accountName,
        accountType,
        currentBalance: 0,
        isBankCash: ["1020", "1021", "1022", "1023", "1030"].includes(accountCode),
        groupName: accountCode === "1030" ? "Cash-in-Hand" : ["1020", "1021", "1022", "1023"].includes(accountCode) ? "Bank Accounts" : "",
        tallyLedgerName: accountName,
        tallyGroupName: accountCode === "1030" ? "Cash-in-Hand" : ["1020", "1021", "1022", "1023"].includes(accountCode) ? "Bank Accounts" : "",
        isActive: true,
      });
  for (const code of ["1020", "1021", "1022", "1023", "1030"]) {
    const account = old.find((x: any) => x.accountCode === code);
    if (account && !account.isBankCash) await db.update(chartOfAccountsTable).set({ isBankCash: true }).where(eq(chartOfAccountsTable.id, account.id));
  }
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
    const accountLines = lines.filter(
      (l: any) =>
        String(l.accountId ?? "") === String(a.id) ||
        String(l.accountCode ?? "") === String(a.accountCode),
    );
    if (!accountLines.length) continue;
    const b = m(
      accountLines
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
        status: b.status || "Posted",
        approvalStatus: b.approvalStatus || "Approved",
        approvalLevel: b.approvalLevel ?? 1,
        requiredApprovals: b.requiredApprovals ?? 1,
        approvedByUserIds: b.approvedByUserIds || "[]",
        approvalRemarks: b.approvalRemarks || "",
        voucherType: b.voucherType || "Journal",
        tallyVoucherType: b.tallyVoucherType || b.voucherType || "Journal",
        metadata: b.metadata || {},
        sourceType: b.sourceType || "Manual",
        sourceId: b.sourceId,
        createdByUserId: userId,
      })
      .returning();
    for (const l of ls) {
      const a = accounts.find((x: any) => Number(x.id) === Number(l.accountId));
      if (!a) throw Error("Invalid account");
      await tx.insert(journalLinesTable).values({
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
    const eligible =
      ["Approved", "Paid"].includes(x.status) && m(x.grandTotal) > 0;
    if (!eligible) {
      const staleReceivables = (
        await db
          .select()
          .from(accountsReceivableTable)
          .where(eq(accountsReceivableTable.organizationId, org))
      ).filter(
        (row: any) =>
          row.sourceType === "Sales Invoice" &&
          Number(row.sourceId) === Number(x.id),
      );
      for (const row of staleReceivables)
        await db
          .delete(accountsReceivableTable)
          .where(eq(accountsReceivableTable.id, row.id));
      const staleJournals = (
        await db
          .select()
          .from(journalEntriesTable)
          .where(eq(journalEntriesTable.organizationId, org))
      ).filter(
        (row: any) =>
          row.sourceType === "Sales Invoice" &&
          Number(row.sourceId) === Number(x.id),
      );
      for (const journal of staleJournals)
        await reverseJournal(org, journal.id);
      if (x.journalEntryId)
        await db
          .update(salesInvoicesTable)
          .set({ journalEntryId: null })
          .where(eq(salesInvoicesTable.id, x.id));
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
    const keeper =
      linkedJournal ||
      sourceJournals.sort((a: any, b: any) => Number(b.id) - Number(a.id))[0];
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
      await db.insert(accountsReceivableTable).values({
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
        approvalStatus: "Approved",
        approvalLevel: 1,
        requiredApprovals: 1,
        approvedByUserIds: "[]",
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
  const receivableAdjustments = await db
    .select()
    .from(salesReceivableAdjustmentsTable);
  for (const ar of receivables.filter(
    (row: any) =>
      row.entryType === "Invoice" &&
      ["Pending", "Partial", "Overdue"].includes(row.status),
  )) {
    const requestedAdjustment =
      ar.sourceType === "Sales Invoice" && ar.sourceId
        ? m(
            creditedReturns
              .filter(
                (row: any) => Number(row.invoiceId) === Number(ar.sourceId),
              )
              .reduce((sum: number, row: any) => sum + m(row.grandTotal), 0) +
              receivableAdjustments
                .filter(
                  (row: any) => Number(row.invoiceId) === Number(ar.sourceId),
                )
                .reduce((sum: number, row: any) => sum + m(row.amount), 0),
          )
        : m(ar.adjustedAmount);
    const adjustedAmount = Math.min(
      Math.max(0, m(ar.amount) - m(ar.receivedAmount)),
      requestedAdjustment,
    );
    const outstanding = m(m(ar.amount) - m(ar.receivedAmount) - adjustedAmount);
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
    await postMatchedPurchaseInvoice(org, Number(x.id));
    if (
      ["2-Way Match", "3-Way Match", "Matched"].includes(String(x.matchStatus))
    ) {
      const linkedBills = await db
        .select()
        .from(accountsPayableTable)
        .where(eq(accountsPayableTable.organizationId, org));
      for (const bill of linkedBills.filter(
        (entry: any) =>
          entry.sourceType === "Purchase Invoice" &&
          Number(entry.sourceId) === Number(x.id) &&
          entry.approvalStatus !== "Approved",
      ))
        await db
          .update(accountsPayableTable)
          .set({
            approvalStatus: "Approved",
            approvalLevel: 1,
            requiredApprovals: 1,
          })
          .where(eq(accountsPayableTable.id, bill.id));
    }
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
  const pagination = paginateQuery(r.query, 25),
    { skip, limit } = pagination;
  return {
    items: xs.slice(skip, skip + limit),
    total: xs.length,
    skip,
    limit,
    ...paginationMetadata(xs.length, pagination),
  };
};
const serializeMoneyFields = (row: any) => {
  const result = { ...row };
  for (const field of [
    "amount",
    "paidAmount",
    "receivedAmount",
    "adjustedAmount",
    "totalDebit",
    "totalCredit",
    "currentBalance",
  ])
    if (field in result) result[field] = m(result[field]);
  return result;
};
router.get("/sources", async (r: any, s): Promise<any> => {
  if (need(r, s, "accounts.finance_dashboard.view")) s.json(accountSourceRegistry);
});
router.get("/masters", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.masters.view")) return;
  await ensureAccountMasters(r.acc.org);
  const { accountGroupsTable, accountCostCentersTable, accountTransactionTypesTable } = await accountTables();
  const [groups, costCenters, transactionTypes] = await Promise.all([
    db.select().from(accountGroupsTable).where(eq(accountGroupsTable.organizationId, r.acc.org)),
    db.select().from(accountCostCentersTable).where(eq(accountCostCentersTable.organizationId, r.acc.org)),
    db.select().from(accountTransactionTypesTable).where(eq(accountTransactionTypesTable.organizationId, r.acc.org)),
  ]);
  s.json({ groups, costCenters, transactionTypes, sourceRegistry: accountSourceRegistry });
});
router.post("/masters/transaction-types", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.masters.create")) return;
  const { accountTransactionTypesTable } = await accountTables();
  const code = String(r.body.code || r.body.name || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const name = String(r.body.name || "").trim();
  if (!code || !name) return s.status(400).json({ error: "Code and name are required" });
  const [row] = await db.insert(accountTransactionTypesTable).values({
    organizationId: r.acc.org, code, name,
    direction: r.body.direction || "Either",
    tallyVoucherType: r.body.tallyVoucherType || "Journal",
    isSystem: false, isActive: r.body.isActive !== false,
  }).returning();
  s.status(201).json(row);
});
router.patch("/masters/transaction-types/:id", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.masters.update")) return;
  const { accountTransactionTypesTable } = await accountTables();
  const updates: any = { updatedAt: new Date() };
  for (const key of ["name", "direction", "tallyVoucherType", "isActive"])
    if (r.body[key] !== undefined) updates[key] = r.body[key];
  const [row] = await db.update(accountTransactionTypesTable).set(updates).where(eq(accountTransactionTypesTable.id, Number(r.params.id))).returning();
  if (!row) return s.status(404).json({ error: "Transaction type not found" });
  s.json(row);
});
router.get("/bank-cash-accounts", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.bank_cash.view")) return;
  const accounts = await coa(r.acc.org);
  s.json(accounts.filter((account: any) => account.isBankCash || ["1020", "1021", "1022", "1023", "1030"].includes(String(account.accountCode))));
});
async function bankCashRows(org: number) {
  const { bankCashTransactionsTable } = await accountTables();
  const rows = await db.select().from(bankCashTransactionsTable).where(eq(bankCashTransactionsTable.organizationId, org));
  const docs = await documentsFor("bank-cash", rows.map((row: any) => Number(row.id)));
  return rows.map((row: any) => ({ ...row, documents: docs.get(Number(row.id)) || [] })).sort((a: any, b: any) => String(b.transactionDate).localeCompare(String(a.transactionDate)) || Number(b.id) - Number(a.id));
}
router.get("/bank-cash-transactions", async (r: any, s): Promise<any> => {
  if (need(r, s, "accounts.bank_cash.view")) s.json(await bankCashRows(r.acc.org));
});
async function createBankCash(r: any, s: any, source: "bank-cash" | "opening-balance") {
  const amount = m(r.body.amount);
  if (!(amount > 0)) return s.status(400).json({ error: "Amount must be greater than zero" });
  const accounts = await coa(r.acc.org);
  const bank = accounts.find((a: any) => Number(a.id) === Number(r.body.bankCashAccountId));
  if (!bank || !(bank.isBankCash || ["1020", "1021", "1022", "1023", "1030"].includes(String(bank.accountCode))))
    return s.status(400).json({ error: "Choose a valid bank/cash ledger" });
  const isOpening = source === "opening-balance";
  const isTransfer = String(r.body.mode || "").toLowerCase() === "transfer";
  if (isTransfer && Number(r.body.transferToAccountId) === Number(bank.id))
    return s.status(400).json({ error: "Transfer accounts must be different" });
  const { bankCashTransactionsTable } = await accountTables();
  const [row] = await db.insert(bankCashTransactionsTable).values({
    organizationId: r.acc.org,
    transactionDate: r.body.transactionDate || r.body.entryDate || day(),
    transactionTypeId: r.body.transactionTypeId || null,
    transactionTypeName: isOpening ? "Opening Balance" : String(r.body.transactionTypeName || r.body.typeName || "Bank/Cash Transaction"),
    mode: isOpening ? "Credit" : (r.body.mode || "Credit"),
    bankCashAccountId: Number(bank.id),
    transferToAccountId: isTransfer ? Number(r.body.transferToAccountId) : null,
    counterAccountId: r.body.counterAccountId ? Number(r.body.counterAccountId) : null,
    amount,
    reference: String(r.body.reference || `${isOpening ? "OB" : "BC"}-${Date.now()}`),
    remarks: String(r.body.remarks || r.body.notes || ""),
    createdByUserId: Number(r.acc.user.id),
  }).returning();
  if (r.body.document) await saveAccountDocument(r.acc.org, Number(r.acc.user.id), "bank-cash", Number(row.id), r.body.document);
  s.status(201).json({ ...row, documents: (await documentsFor("bank-cash", [Number(row.id)])).get(Number(row.id)) || [] });
}
router.post("/opening-balances", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.opening_balances.create")) return;
  return createBankCash(r, s, "opening-balance");
});
router.post("/bank-cash-transactions", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.bank_cash.create")) return;
  return createBankCash(r, s, "bank-cash");
});
async function approveBankCash(r: any, s: any) {
  if (!need(r, s, "accounts.bank_cash.approve")) return;
  const { bankCashTransactionsTable, accountDocumentsTable } = await accountTables();
  const [entry] = await db.select().from(bankCashTransactionsTable).where(eq(bankCashTransactionsTable.id, Number(r.params.id))).limit(1);
  if (!entry || Number(entry.organizationId) !== Number(r.acc.org)) return s.status(404).json({ error: "Bank/cash transaction not found" });
  if (entry.approvalStatus === "Rejected") return s.status(409).json({ error: "Rejected transaction cannot be approved" });
  if (entry.approvalStatus === "Approved") return s.json(entry);
  const approvers = JSON.parse(String(entry.approvedByUserIds || "[]")) as number[];
  if (approvers.includes(Number(r.acc.user.id))) return s.status(409).json({ error: "You already approved this transaction" });
  const nextApprovers = [...approvers, Number(r.acc.user.id)], nextLevel = Number(entry.approvalLevel || 0) + 1;
  if (nextLevel < Number(entry.requiredApprovals || 1)) {
    const [updated] = await db.update(bankCashTransactionsTable).set({ approvalLevel: nextLevel, approvedByUserIds: JSON.stringify(nextApprovers), approvalRemarks: String(r.body.remarks || ""), updatedAt: new Date() }).where(eq(bankCashTransactionsTable.id, entry.id)).returning();
    return s.json(updated);
  }
  const accounts = await coa(r.acc.org);
  const byId = (id: any) => accounts.find((a: any) => Number(a.id) === Number(id));
  const bank = byId(entry.bankCashAccountId), transferTo = byId(entry.transferToAccountId), counter = byId(entry.counterAccountId);
  const capital = accounts.find((a: any) => a.accountCode === "3000"), otherIncome = accounts.find((a: any) => a.accountCode === "4200"), miscExpense = accounts.find((a: any) => a.accountCode === "5150"), ownerDraw = accounts.find((a: any) => a.accountCode === "3300");
  if (!bank) return s.status(400).json({ error: "Bank/cash ledger is missing" });
  const mode = String(entry.mode || "Credit").toLowerCase();
  const typeName = String(entry.transactionTypeName || "").toLowerCase();
  let lines: any[] = [];
  let voucherType = entry.transactionTypeName === "Opening Balance" ? "Opening Balance" : mode === "transfer" ? "Contra" : mode === "debit" ? "Payment" : "Receipt";
  if (mode === "transfer") {
    if (!transferTo) return s.status(400).json({ error: "Transfer destination account is missing" });
    lines = [{ accountId: transferTo.id, debit: m(entry.amount) }, { accountId: bank.id, credit: m(entry.amount) }];
  } else if (mode === "debit") {
    const debitAccount = counter || (typeName.includes("owner") ? ownerDraw : miscExpense);
    if (!debitAccount) return s.status(400).json({ error: "Debit counter account is missing" });
    lines = [{ accountId: debitAccount.id, debit: m(entry.amount) }, { accountId: bank.id, credit: m(entry.amount) }];
  } else {
    const creditAccount = entry.transactionTypeName === "Opening Balance" ? capital : counter || otherIncome || capital;
    if (!creditAccount) return s.status(400).json({ error: "Credit counter account is missing" });
    lines = [{ accountId: bank.id, debit: m(entry.amount) }, { accountId: creditAccount.id, credit: m(entry.amount) }];
  }
  const journal = await post(r.acc.org, {
    entryDate: entry.transactionDate,
    reference: entry.reference,
    description: `${entry.transactionTypeName} - ${bank.accountName}`,
    sourceType: "Bank Cash Transaction",
    sourceId: entry.id,
    voucherType,
    tallyVoucherType: voucherType === "Opening Balance" ? "Journal" : voucherType,
    metadata: { bankCashTransactionId: entry.id, mode: entry.mode },
    lines,
  }, Number(r.acc.user.id));
  const [updated] = await db.update(bankCashTransactionsTable).set({ status: "Approved", approvalStatus: "Approved", approvalLevel: nextLevel, approvedByUserIds: JSON.stringify(nextApprovers), approvalRemarks: String(r.body.remarks || ""), journalEntryId: journal.id, updatedAt: new Date() }).where(eq(bankCashTransactionsTable.id, entry.id)).returning();
  await db.update(accountDocumentsTable).set({ journalEntryId: journal.id }).where(and(eq(accountDocumentsTable.sourceType, "bank-cash"), eq(accountDocumentsTable.sourceId, entry.id)));
  return s.json(updated);
}
router.post("/bank-cash-transactions/:id/approve", approveBankCash);
router.post("/opening-balances/:id/approve", approveBankCash);
async function rejectBankCash(r: any, s: any) {
  if (!need(r, s, "accounts.bank_cash.reject")) return;
  const remarks = String(r.body.remarks || "").trim();
  if (!remarks) return s.status(400).json({ error: "Rejection remarks are required" });
  const { bankCashTransactionsTable } = await accountTables();
  const [updated] = await db.update(bankCashTransactionsTable).set({ status: "Rejected", approvalStatus: "Rejected", rejectedByUserId: Number(r.acc.user.id), rejectedAt: new Date(), rejectionRemarks: remarks, updatedAt: new Date() }).where(eq(bankCashTransactionsTable.id, Number(r.params.id))).returning();
  if (!updated) return s.status(404).json({ error: "Bank/cash transaction not found" });
  s.json(updated);
}
router.post("/bank-cash-transactions/:id/reject", rejectBankCash);
router.post("/opening-balances/:id/reject", rejectBankCash);
router.get("/files/:sourceType/:file", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.bank_cash.view")) return;
  const sourceType = path.basename(String(r.params.sourceType));
  const fileName = path.basename(String(r.params.file));
  return s.sendFile(resolveUploadPath("accounts", String(r.acc.org), sourceType, fileName), { dotfiles: "deny" });
});
router.get("/tally/export", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.tally.export")) return;
  const format = String(r.query.format || "xml").toLowerCase();
  if (!["xml", "csv", "json"].includes(format)) return s.status(400).json({ error: "Unsupported Tally export format" });
  const [accounts, entries, lines] = await Promise.all([
    coa(r.acc.org),
    db.select().from(journalEntriesTable).where(eq(journalEntriesTable.organizationId, r.acc.org)),
    db.select().from(journalLinesTable).where(eq(journalLinesTable.organizationId, r.acc.org)),
  ]);
  const activeAccounts = (accounts as any[]).filter((a) => a.isActive !== false);
  const postedEntries = (entries as any[]).filter((e) => e.status === "Posted" || e.approvalStatus === "Approved");
  const entryLines = (entryId: any) => (lines as any[]).filter((l) => Number(l.journalEntryId) === Number(entryId));
  const ledgers = activeAccounts.map((a) => ({
    accountCode: a.accountCode,
    ledgerName: a.tallyLedgerName || a.accountName,
    parentGroup: a.tallyGroupName || a.groupName || (a.accountType === "Asset" ? "Current Assets" : a.accountType),
    accountType: a.accountType,
    openingBalance: m(a.openingBalance || 0),
    currentBalance: m(a.currentBalance || 0),
    isBankCash: a.isBankCash === true,
  }));
  const vouchers = postedEntries.map((e) => ({
    voucherId: e.id,
    date: String(e.entryDate || "").slice(0, 10),
    reference: e.reference,
    voucherType: e.voucherType || "Journal",
    tallyVoucherType: e.tallyVoucherType || e.voucherType || "Journal",
    description: e.description,
    status: e.status,
    approvalStatus: e.approvalStatus,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
  }));
  const voucherLines = postedEntries.flatMap((e) => entryLines(e.id).map((l) => ({
    voucherId: e.id,
    date: String(e.entryDate || "").slice(0, 10),
    reference: e.reference,
    voucherType: e.voucherType || "Journal",
    tallyVoucherType: e.tallyVoucherType || e.voucherType || "Journal",
    accountName: l.accountName,
    debit: m(l.debit),
    credit: m(l.credit),
    tallyAmount: (m(l.debit) > 0 ? m(l.debit) : -m(l.credit)).toFixed(2),
    narration: l.narration || e.description,
  })));
  if (format === "json") return s.json({ ledgers, vouchers, voucherLines });
  if (format === "csv") {
    const rows = [
      ["Record Type", "Account Code", "Ledger Name", "Parent Group", "Account Type", "Opening Balance", "Current Balance", "Voucher ID", "Date", "Reference", "Voucher Type", "Tally Voucher Type", "Account Name", "Debit", "Credit", "Tally Amount", "Narration"],
      ...ledgers.map((l) => ["Ledger", l.accountCode, l.ledgerName, l.parentGroup, l.accountType, l.openingBalance, l.currentBalance, "", "", "", "", "", "", "", "", "", ""]),
      ...voucherLines.map((l) => ["Voucher Line", "", "", "", "", "", "", l.voucherId, l.date, l.reference, l.voucherType, l.tallyVoucherType, l.accountName, l.debit, l.credit, l.tallyAmount, l.narration]),
    ];
    s.setHeader("Content-Type", "text/csv; charset=utf-8");
    s.setHeader("Content-Disposition", `attachment; filename="${downloadName("csv")}"`);
    return s.send(rows.map((row) => row.map(csv).join(",")).join("\n"));
  }
  const ledgerXml = ledgers.map((a) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xml(a.ledgerName)}" RESERVEDNAME=""><PARENT>${xml(a.parentGroup)}</PARENT><OPENINGBALANCE>${a.openingBalance}</OPENINGBALANCE></LEDGER></TALLYMESSAGE>`).join("");
  const voucherXml = postedEntries.map((e) => {
    const linesForEntry = entryLines(e.id);
    return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${xml(e.tallyVoucherType || e.voucherType || "Journal")}" ACTION="Create"><DATE>${tallyDate(e.entryDate)}</DATE><VOUCHERTYPENAME>${xml(e.tallyVoucherType || e.voucherType || "Journal")}</VOUCHERTYPENAME><VOUCHERNUMBER>${xml(e.reference)}</VOUCHERNUMBER><NARRATION>${xml(e.description)}</NARRATION>${linesForEntry.map((l) => { const amount = m(l.debit) > 0 ? m(l.debit) : -m(l.credit); return `<LEDGERENTRIES.LIST><LEDGERNAME>${xml(l.accountName)}</LEDGERNAME><ISDEEMEDPOSITIVE>${amount < 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${amount.toFixed(2)}</AMOUNT></LEDGERENTRIES.LIST>`; }).join("")}</VOUCHER></TALLYMESSAGE>`;
  }).join("");
  const body = `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC><REQUESTDATA>${ledgerXml}${voucherXml}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
  s.setHeader("Content-Disposition", `attachment; filename="${downloadName("xml")}"`);
  s.type("application/xml").send(body);
});
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
          ).map((row: any) => {
            const serialized = serializeMoneyFields(row);
            if (c.p === "ap") {
              const balance = Math.max(
                0,
                m(row.amount) - m(row.paidAmount) - m(row.adjustedAmount),
              );
              if (row.entryType !== "Debit Note" && row.status !== "Rejected")
                serialized.status =
                  balance <= 0
                    ? "Paid"
                    : String(row.dueDate).slice(0, 10) < day()
                      ? "Overdue"
                      : m(row.paidAmount) > 0 || m(row.adjustedAmount) > 0
                        ? "Partial"
                        : "Pending";
              if (
                row.entryType === "Debit Note" &&
                row.sourceType === "Purchase Return"
              ) {
                serialized.status = "Paid";
                serialized.approvalStatus = "Approved";
                serialized.appliedAmount = m(row.appliedAmount);
                serialized.availableCredit = Math.max(
                  m(row.availableCredit),
                  m(row.amount) - m(row.appliedAmount),
                );
              }
              serialized.balance = balance;
              serialized.approvalStatus =
                serialized.approvalStatus ||
                row.approvalStatus ||
                (row.sourceType === "Purchase Invoice"
                  ? "Approved"
                  : "Pending Approval");
            }
            if (c.p === "ar") {
              const balance = Math.max(
                0,
                m(row.amount) - m(row.receivedAmount) - m(row.adjustedAmount),
              );
              if (row.entryType !== "Credit Note" && row.status !== "Rejected")
                serialized.status =
                  balance <= 0
                    ? m(row.adjustedAmount) > 0
                      ? "Settled"
                      : "Received"
                    : String(row.dueDate).slice(0, 10) < day()
                      ? "Overdue"
                      : m(row.receivedAmount) > 0 || m(row.adjustedAmount) > 0
                        ? "Partial"
                        : "Pending";
              serialized.balance = balance;
              serialized.approvalStatus =
                row.sourceType === "Sales Invoice" ||
                row.sourceType === "Sales Credit Note"
                  ? "Approved"
                  : row.approvalStatus || "Pending Approval";
            }
            return serialized;
          }),
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
    if (c.p === "ap") {
      const existing = await db
        .select()
        .from(accountsPayableTable)
        .where(eq(accountsPayableTable.organizationId, r.acc.org));
      if (
        existing.some(
          (entry: any) =>
            String(entry.billNumber).trim().toLowerCase() ===
            String(r.body.billNumber).trim().toLowerCase(),
        )
      )
        return s
          .status(409)
          .json({ error: "Bill or debit-note number already exists" });
      if (r.body.entryType === "Debit Note") {
        const linkedBill = existing.find(
          (entry: any) =>
            entry.entryType !== "Debit Note" &&
            entry.billNumber === r.body.againstBillNumber &&
            entry.vendorName === r.body.vendorName,
        );
        if (!linkedBill)
          return s
            .status(400)
            .json({ error: "Linked vendor bill was not found" });
        const eligible = Math.max(
          0,
          m(linkedBill.amount) -
            m(linkedBill.paidAmount) -
            m(linkedBill.adjustedAmount),
        );
        const maximumDebitNote =
          m(linkedBill.paidAmount) >= m(linkedBill.amount) - 0.009
            ? m(linkedBill.amount)
            : eligible;
        if (amount > maximumDebitNote + 0.009)
          return s
            .status(400)
            .json({ error: `Debit note cannot exceed ${maximumDebitNote}` });
      }
    }
    if (c.p === "ar") {
      const existing = await db
        .select()
        .from(accountsReceivableTable)
        .where(eq(accountsReceivableTable.organizationId, r.acc.org));
      const reference = String(
        r.body.entryType === "Credit Note"
          ? r.body.creditNoteNumber || r.body.invoiceNumber
          : r.body.invoiceNumber,
      )
        .trim()
        .toLowerCase();
      if (!reference)
        return s
          .status(400)
          .json({ error: "Invoice or credit-note reference is required" });
      if (
        existing.some(
          (entry: any) =>
            String(
              entry.entryType === "Credit Note"
                ? entry.creditNoteNumber || entry.invoiceNumber
                : entry.invoiceNumber,
            )
              .trim()
              .toLowerCase() === reference,
        )
      )
        return s
          .status(409)
          .json({ error: "Invoice or credit-note reference already exists" });
      if (r.body.entryType === "Credit Note") {
        const linked = existing.find(
          (entry: any) =>
            entry.entryType !== "Credit Note" &&
            String(entry.invoiceNumber).trim().toLowerCase() ===
              String(r.body.linkedInvoiceNumber).trim().toLowerCase(),
        );
        if (!linked)
          return s
            .status(400)
            .json({ error: "Linked customer invoice was not found" });
        if (
          String(linked.clientName).trim().toLowerCase() !==
          String(r.body.clientName).trim().toLowerCase()
        )
          return s
            .status(400)
            .json({
              error: "Credit-note customer must match the linked invoice",
            });
        const eligible = Math.max(
          0,
          m(linked.amount) -
            m(linked.receivedAmount) -
            m(linked.adjustedAmount),
        );
        if (amount > eligible + 0.009)
          return s
            .status(400)
            .json({ error: `Credit note cannot exceed ${eligible}` });
      }
      r.body.receivedAmount = 0;
      r.body.adjustedAmount = 0;
    }
    const [x] = await db
      .insert(c.t)
      .values({
        ...r.body,
        organizationId: r.acc.org,
        amount,
        approvalStatus: "Pending Approval",
        requiredApprovals: Math.max(
          1,
          Number(
            process.env[
              c.p === "ap"
                ? "LEDGER_AP_REQUIRED_APPROVALS"
                : "LEDGER_AR_REQUIRED_APPROVALS"
            ] ?? 1,
          ),
        ),
        status:
          c.p === "ap" && r.body.entryType === "Debit Note"
            ? "Pending"
            : covered >= amount
              ? c.done
              : covered > 0
                ? "Partial"
                : "Pending",
      })
      .returning();
    s.status(201).json(x);
  });
  router.patch(`/${c.p}/:id`, async (r: any, s): Promise<any> => {
    if (!need(r, s, `${c.k}.edit`)) return;
    if (c.p === "ap" && r.body.paidAmount !== undefined)
      return s
        .status(400)
        .json({ error: "Use the approved Record Payment workflow" });
    if (
      c.p === "ar" &&
      (r.body.receivedAmount !== undefined ||
        r.body.adjustedAmount !== undefined)
    )
      return s
        .status(400)
        .json({
          error: "Use Sales Payment or the approved credit-note workflow",
        });
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
    if (c.p === "ap" && x.entryType !== "Debit Note") {
      const invoices = await db
        .select()
        .from(purchaseInvoicesTable)
        .where(eq(purchaseInvoicesTable.organizationId, r.acc.org));
      const linkedInvoice = invoices.find(
        (invoice: any) =>
          (x.sourceType === "Purchase Invoice" &&
            Number(x.sourceId) === Number(invoice.id)) ||
          (String(invoice.invoiceNumber).trim().toLowerCase() ===
            String(x.billNumber).trim().toLowerCase() &&
            String(invoice.vendorName).trim().toLowerCase() ===
              String(x.vendorName).trim().toLowerCase()),
      );
      if (linkedInvoice) {
        const invoiceAmount = m(linkedInvoice.amount);
        const invoiceCovered = Math.min(
          invoiceAmount,
          m(x.paidAmount) + m(x.adjustedAmount),
        );
        const invoiceStatus =
          invoiceCovered >= invoiceAmount - 0.005
            ? "Paid"
            : invoiceCovered > 0
              ? "Partially Paid"
              : "Unpaid";
        await db
          .update(purchaseInvoicesTable)
          .set({ status: invoiceStatus })
          .where(eq(purchaseInvoicesTable.id, linkedInvoice.id));
      }
    }
    s.json(x);
  });
  router.delete(`/${c.p}/:id`, async (r: any, s): Promise<any> => {
    if (need(r, s, `${c.k}.delete`)) {
      await db.delete(c.t).where(eq(c.t.id, Number(r.params.id)));
      s.status(204).send();
    }
  });
}
router.post("/ap/:id/approve", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.accounts_payable.edit")) return;
  const id = Number(r.params.id);
  const [entry] = await db
    .select()
    .from(accountsPayableTable)
    .where(
      and(
        eq(accountsPayableTable.organizationId, r.acc.org),
        eq(accountsPayableTable.id, id),
      ),
    )
    .limit(1);
  if (!entry) return s.status(404).json({ error: "AP entry not found" });
  if (entry.approvalStatus === "Rejected")
    return s
      .status(409)
      .json({ error: "Rejected AP entry cannot be approved" });
  if (entry.approvalStatus === "Approved") return s.json(entry);
  const approvers = JSON.parse(
    String(entry.approvedByUserIds || "[]"),
  ) as number[];
  if (approvers.includes(Number(r.acc.user.id)))
    return s.status(409).json({ error: "You already approved this entry" });
  const nextApprovers = [...approvers, Number(r.acc.user.id)];
  const nextLevel = Number(entry.approvalLevel || 0) + 1;
  if (nextLevel < Number(entry.requiredApprovals || 1)) {
    const [updated] = await db
      .update(accountsPayableTable)
      .set({
        approvalLevel: nextLevel,
        approvedByUserIds: JSON.stringify(nextApprovers),
        approvalRemarks: String(r.body.remarks || ""),
      })
      .where(eq(accountsPayableTable.id, id))
      .returning();
    return s.json(updated);
  }
  if (entry.entryType === "Debit Note") {
    const [bill] = await db
      .select()
      .from(accountsPayableTable)
      .where(
        and(
          eq(accountsPayableTable.organizationId, r.acc.org),
          eq(accountsPayableTable.billNumber, entry.againstBillNumber),
          eq(accountsPayableTable.vendorName, entry.vendorName),
        ),
      )
      .limit(1);
    if (!bill) return s.status(400).json({ error: "Linked bill not found" });
    const eligible = Math.max(
      0,
      m(bill.amount) - m(bill.paidAmount) - m(bill.adjustedAmount),
    );
    const billIsPaid = m(bill.paidAmount) >= m(bill.amount) - 0.009;
    const maximumDebitNote = billIsPaid ? m(bill.amount) : eligible;
    if (m(entry.amount) > maximumDebitNote + 0.009)
      return s
        .status(400)
        .json({ error: "Debit note exceeds the eligible bill balance" });
    const accounts = await coa(r.acc.org);
    const payable = accounts.find(
      (account: any) => account.accountCode === "2100",
    );
    const vendorReceivable = accounts.find(
      (account: any) => account.accountCode === "1140",
    );
    const returns =
      accounts.find((account: any) => account.accountCode === "1200") ||
      accounts.find((account: any) => account.accountCode === "5100");
    const [linkedInvoice] =
      bill.sourceType === "Purchase Invoice" && bill.sourceId
        ? await db
            .select()
            .from(purchaseInvoicesTable)
            .where(eq(purchaseInvoicesTable.id, Number(bill.sourceId)))
            .limit(1)
        : [];
    const ratio =
      linkedInvoice && m(linkedInvoice.amount) > 0
        ? m(entry.amount) / m(linkedInvoice.amount)
        : 0;
    const taxCredits = [
      ["1410", "1130", m(linkedInvoice?.cgstAmount) * ratio],
      ["1420", "1131", m(linkedInvoice?.sgstAmount) * ratio],
      ["1430", "1132", m(linkedInvoice?.igstAmount) * ratio],
    ]
      .map(([primary, fallback, credit]) => ({
        account:
          accounts.find((account: any) => account.accountCode === primary) ||
          accounts.find((account: any) => account.accountCode === fallback),
        credit: m(credit),
      }))
      .filter((line) => line.account && line.credit > 0);
    const totalTaxCredit = m(
      taxCredits.reduce((sum, line) => sum + line.credit, 0),
    );
    const journal = await post(
      r.acc.org,
      {
        entryDate: entry.billDate,
        reference: `AP:DN:${entry.billNumber}`,
        description: `Debit note ${entry.billNumber}`,
        sourceType: "AP Debit Note",
        sourceId: entry.id,
        lines: [
          {
            accountId: billIsPaid ? vendorReceivable?.id : payable?.id,
            debit: m(entry.amount),
          },
          { accountId: returns?.id, credit: m(entry.amount) - totalTaxCredit },
          ...taxCredits.map((line) => ({
            accountId: line.account!.id,
            credit: line.credit,
          })),
        ],
      },
      r.acc.user.id,
    );
    if (billIsPaid) {
      await db
        .update(accountsPayableTable)
        .set({
          appliedAmount: 0,
          availableCredit: m(entry.amount),
          journalEntryId: journal.id,
        })
        .where(eq(accountsPayableTable.id, entry.id));
    } else {
      const adjustedAmount = m(bill.adjustedAmount) + m(entry.amount);
      const covered = m(bill.paidAmount) + adjustedAmount;
      const billStatus =
        covered >= m(bill.amount) - 0.009
          ? "Paid"
          : covered > 0
            ? "Partial"
            : "Pending";
      await db
        .update(accountsPayableTable)
        .set({ adjustedAmount, status: billStatus })
        .where(eq(accountsPayableTable.id, bill.id));
      await db
        .update(accountsPayableTable)
        .set({
          appliedAmount: m(entry.amount),
          availableCredit: 0,
          journalEntryId: journal.id,
        })
        .where(eq(accountsPayableTable.id, entry.id));
      if (bill.sourceType === "Purchase Invoice" && bill.sourceId)
        await db
          .update(purchaseInvoicesTable)
          .set({ status: billStatus === "Paid" ? "Paid" : "Partially Paid" })
          .where(eq(purchaseInvoicesTable.id, bill.sourceId));
    }
  }
  const [updated] = await db
    .update(accountsPayableTable)
    .set({
      approvalStatus: "Approved",
      status: entry.entryType === "Debit Note" ? "Approved" : entry.status,
      approvalLevel: nextLevel,
      approvedByUserIds: JSON.stringify(nextApprovers),
      approvalRemarks: String(r.body.remarks || ""),
    })
    .where(eq(accountsPayableTable.id, id))
    .returning();
  return s.json(updated);
});

router.post("/ap/:id/reject", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.accounts_payable.edit")) return;
  const remarks = String(r.body.remarks || "").trim();
  if (!remarks)
    return s.status(400).json({ error: "Rejection remarks are required" });
  const [updated] = await db
    .update(accountsPayableTable)
    .set({
      approvalStatus: "Rejected",
      approvalRemarks: remarks,
      status: "Rejected",
    })
    .where(
      and(
        eq(accountsPayableTable.organizationId, r.acc.org),
        eq(accountsPayableTable.id, Number(r.params.id)),
        eq(accountsPayableTable.approvalStatus, "Pending Approval"),
      ),
    )
    .returning();
  if (!updated)
    return s
      .status(409)
      .json({ error: "Only pending AP entries can be rejected" });
  return s.json(updated);
});
router.post("/ar/:id/approve", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.accounts_receivable.edit")) return;
  const id = Number(r.params.id);
  const [entry] = await db
    .select()
    .from(accountsReceivableTable)
    .where(
      and(
        eq(accountsReceivableTable.organizationId, r.acc.org),
        eq(accountsReceivableTable.id, id),
      ),
    )
    .limit(1);
  if (!entry) return s.status(404).json({ error: "AR entry not found" });
  if (entry.approvalStatus === "Rejected")
    return s
      .status(409)
      .json({ error: "Rejected AR entry cannot be approved" });
  if (entry.approvalStatus === "Approved") return s.json(entry);
  let approvedBy: number[] = [];
  try {
    approvedBy = JSON.parse(String(entry.approvedByUserIds || "[]")).map(
      Number,
    );
  } catch {
    approvedBy = [];
  }
  if (approvedBy.includes(Number(r.acc.user.id)))
    return s
      .status(409)
      .json({ error: "This approver has already approved the entry" });
  const nextApprovers = [...approvedBy, Number(r.acc.user.id)];
  const nextLevel = Number(entry.approvalLevel || 0) + 1;
  const final = nextLevel >= Number(entry.requiredApprovals || 1);
  const finalUpdates: Record<string, any> = {};
  if (final && entry.entryType === "Credit Note") {
    const [linked] = (
      await db
        .select()
        .from(accountsReceivableTable)
        .where(eq(accountsReceivableTable.organizationId, r.acc.org))
    ).filter(
      (row: any) =>
        row.entryType !== "Credit Note" &&
        String(row.invoiceNumber).trim().toLowerCase() ===
          String(entry.linkedInvoiceNumber).trim().toLowerCase(),
    );
    if (!linked)
      return s
        .status(400)
        .json({ error: "Linked customer invoice was not found" });
    const eligible = Math.max(
      0,
      m(linked.amount) - m(linked.receivedAmount) - m(linked.adjustedAmount),
    );
    if (m(entry.amount) > eligible + 0.009)
      return s
        .status(409)
        .json({ error: `Credit note cannot exceed ${eligible}` });
    const journal = await post(
      r.acc.org,
      {
        entryDate: entry.invoiceDate,
        reference: `AUTO:AR:CREDIT:${entry.creditNoteNumber || entry.invoiceNumber}`,
        description: `Customer credit note ${entry.creditNoteNumber || entry.invoiceNumber}`,
        sourceType: "AR Credit Note",
        sourceId: entry.id,
        lines: [
          {
            accountId: (await coa(r.acc.org)).find(
              (account: any) => account.accountCode === "4110",
            )?.id,
            debit: m(entry.amount),
          },
          {
            accountId: (await coa(r.acc.org)).find(
              (account: any) => account.accountCode === "1100",
            )?.id,
            credit: m(entry.amount),
          },
        ],
      },
      r.acc.user.id,
    );
    const adjustedAmount = m(linked.adjustedAmount) + m(entry.amount);
    const balance = Math.max(
      0,
      m(linked.amount) - m(linked.receivedAmount) - adjustedAmount,
    );
    const linkedStatus = balance <= 0 ? "Settled" : "Partial";
    await db
      .update(accountsReceivableTable)
      .set({ adjustedAmount, status: linkedStatus })
      .where(eq(accountsReceivableTable.id, linked.id));
    if (linked.sourceType === "Sales Invoice" && linked.sourceId)
      await db
        .update(salesInvoicesTable)
        .set({
          balanceDue: String(balance),
          paymentStatus: balance <= 0 ? "Settled" : "Partial",
        })
        .where(eq(salesInvoicesTable.id, linked.sourceId));
    finalUpdates.adjustedAmount = m(entry.amount);
    finalUpdates.status = "Credited";
    finalUpdates.journalEntryId = journal.id;
  }
  const [updated] = await db
    .update(accountsReceivableTable)
    .set({
      approvalStatus: final ? "Approved" : "Pending Approval",
      approvalLevel: nextLevel,
      approvedByUserIds: JSON.stringify(nextApprovers),
      approvalRemarks: String(r.body.remarks || ""),
      ...finalUpdates,
    })
    .where(eq(accountsReceivableTable.id, id))
    .returning();
  return s.json(updated);
});
router.post("/ar/:id/reject", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.accounts_receivable.edit")) return;
  const remarks = String(r.body.remarks || "").trim();
  if (!remarks)
    return s.status(400).json({ error: "Rejection remarks are required" });
  const [updated] = await db
    .update(accountsReceivableTable)
    .set({
      approvalStatus: "Rejected",
      approvalRemarks: remarks,
      status: "Rejected",
    })
    .where(
      and(
        eq(accountsReceivableTable.organizationId, r.acc.org),
        eq(accountsReceivableTable.id, Number(r.params.id)),
        eq(accountsReceivableTable.approvalStatus, "Pending Approval"),
      ),
    )
    .returning();
  if (!updated)
    return s
      .status(409)
      .json({ error: "Only pending AR entries can be rejected" });
  return s.json(updated);
});
router.get("/dashboard-summary", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.finance_dashboard.view")) return;
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
      ),
    today = new Date(),
    age = (rows: any[], paidField: string, closed: string[]) => {
      const result = { days30: 0, days60: 0, days90: 0 };
      for (const row of rows) {
        if (closed.includes(String(row.status))) continue;
        const outstanding = out(row, paidField);
        if (!outstanding) continue;
        const due = new Date(`${row.dueDate}T00:00:00`);
        const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
        if (days > 90) result.days90 = m(result.days90 + outstanding);
        else if (days > 60) result.days60 = m(result.days60 + outstanding);
        else if (days > 30) result.days30 = m(result.days30 + outstanding);
      }
      return result;
    };
  s.json({
    cash: m(
      a
        .filter((x: any) => x.accountType === "Asset")
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
    netIncome: m(
      a
        .filter((x: any) => x.accountType === "Revenue")
        .reduce((q: number, x: any) => q - Number(x.currentBalance), 0) -
        a
          .filter((x: any) => x.accountType === "Expense")
          .reduce((q: number, x: any) => q + Number(x.currentBalance), 0),
    ),
    arAging: age(ar, "receivedAmount", ["Received", "Settled", "Cancelled"]),
    apAging: age(ap, "paidAmount", ["Paid"]),
  });
});
router.get("/business-dashboard", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.finance_dashboard.view")) return;
  try {
    const pad = (value: number) => String(value).padStart(2, "0");
    const dateKey = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    const now = new Date();
    const today = dateKey(now);
    const requested = String(r.query.range || "month");
    let from = today;
    let to = today;
    if (requested === "week") {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      from = dateKey(start);
    } else if (requested === "month") {
      from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    } else if (requested === "custom" && r.query.dateFrom && r.query.dateTo) {
      from = String(r.query.dateFrom);
      to = String(r.query.dateTo);
    } else if (requested === "custom") {
      from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    }

    const [sales, purchases, payments, ap, ar, inventory] = await Promise.all([
      db.select().from(salesInvoicesTable),
      db.select().from(purchaseInvoicesTable),
      db.select().from(salesPaymentsTable),
      db.select().from(accountsPayableTable).where(eq(accountsPayableTable.organizationId, r.acc.org)),
      db.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.organizationId, r.acc.org)),
      db.select().from(inventoryTable),
    ]);
    const inRange = (value: any, start = from, end = to) => {
      const key = String(value || "").slice(0, 10);
      return key >= start && key <= end;
    };
    const outstanding = (row: any, paidField: string) => {
      const total = Math.max(0, m(row.amount));
      const covered = Math.min(total, Math.max(0, m(row[paidField])) + Math.max(0, m(row.adjustedAmount)));
      return m(Math.max(0, total - covered));
    };
    const periodSales = sales.filter((row: any) => inRange(row.invoiceDate));
    const periodPurchases = purchases.filter((row: any) => inRange(row.invoiceDate));
    const totalSales = m(periodSales.reduce((sum: number, row: any) => sum + m(row.grandTotal), 0));
    const totalPurchase = m(periodPurchases.reduce((sum: number, row: any) => sum + m(row.amount), 0));
    const receivables = m(ar.filter((row: any) => row.entryType === "Invoice").reduce((sum: number, row: any) => sum + outstanding(row, "receivedAmount"), 0));
    const payables = m(ap.filter((row: any) => row.entryType === "Bill").reduce((sum: number, row: any) => sum + outstanding(row, "paidAmount"), 0));
    const inventoryValue = m(inventory.reduce((sum: number, row: any) => sum + m(row.quantityOnHand) * m(row.costBasis), 0));
    const cashIncome = m(payments.filter((row: any) => inRange(row.paymentDate)).reduce((sum: number, row: any) => sum + m(row.amount), 0));
    const cashExpenses = m(ap.filter((row: any) => row.entryType === "Bill" && m(row.paidAmount) > 0 && inRange(row.updatedAt)).reduce((sum: number, row: any) => sum + m(row.paidAmount), 0));

    const groupPending = (rows: any[], nameField: string, paidField: string, entryType: string) => {
      const grouped = new Map<string, number>();
      for (const row of rows.filter((item: any) => item.entryType === entryType)) {
        const name = String(row[nameField] || "").trim();
        if (!name) continue;
        grouped.set(name, m((grouped.get(name) || 0) + outstanding(row, paidField)));
      }
      return [...grouped.entries()].filter(([, value]) => value > 0).sort((left, right) => right[1] - left[1]).slice(0, 5).map(([name, value]) => ({ name, outstanding: value }));
    };
    const endMonth = new Date(`${to}T12:00:00`);
    const trendStart = new Date(endMonth.getFullYear(), endMonth.getMonth() - 5, 1);
    const trend = Array.from({ length: 6 }, (_, index) => {
      const month = new Date(trendStart.getFullYear(), trendStart.getMonth() + index, 1);
      const key = `${month.getFullYear()}-${pad(month.getMonth() + 1)}`;
      return {
        key,
        month: month.toLocaleDateString("en-IN", { month: "short" }),
        sales: m(sales.filter((row: any) => String(row.invoiceDate || "").startsWith(key)).reduce((sum: number, row: any) => sum + m(row.grandTotal), 0)),
        purchase: m(purchases.filter((row: any) => String(row.invoiceDate || "").startsWith(key)).reduce((sum: number, row: any) => sum + m(row.amount), 0)),
      };
    });
    return s.json({
      range: { from, to, selected: requested },
      totalSales,
      totalPurchase,
      grossProfit: m(totalSales - totalPurchase),
      receivables,
      payables,
      inventoryValue,
      cashFlow: { income: cashIncome, expenses: cashExpenses, net: m(cashIncome - cashExpenses) },
      trend,
      topCustomers: groupPending(ar, "clientName", "receivedAmount", "Invoice"),
      topVendors: groupPending(ap, "vendorName", "paidAmount", "Bill"),
    });
  } catch (error) {
    console.error("Failed to load business dashboard", error);
    return s.status(500).json({ error: "Failed to load business dashboard" });
  }
});
router.post("/reconcile", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.finance_dashboard.view")) return;
  await automate(r.acc.org);
  return s.json({ success: true, reconciledAt: new Date().toISOString() });
});
async function financialStatementData(org: number, query: any) {
  const dateFrom = String(query?.dateFrom || "").trim();
  const dateTo = String(query?.dateTo || "").trim();
  if (dateFrom && dateTo && dateFrom > dateTo)
    throw Object.assign(new Error("From date must be on or before To date"), {
      status: 400,
    });

  const [accounts, entries, lines] = await Promise.all([
    coa(org),
    db
      .select()
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.organizationId, org)),
    db
      .select()
      .from(journalLinesTable)
      .where(eq(journalLinesTable.organizationId, org)),
  ]);
  const hasDateFilter = Boolean(dateFrom || dateTo);
  const entryIds = new Set(
    entries
      .filter((entry: any) => {
        const entryDate = String(entry.entryDate || "").slice(0, 10);
        return (
          String(entry.status || "Posted").toLowerCase() === "posted" &&
          (!dateFrom || entryDate >= dateFrom) &&
          (!dateTo || entryDate <= dateTo)
        );
      })
      .map((entry: any) => String(entry.id)),
  );
  const activity = new Map<string, { debit: number; credit: number }>();
  for (const line of lines) {
    if (!entryIds.has(String(line.journalEntryId))) continue;
    const account = accounts.find(
      (candidate: any) =>
        String(candidate.id) === String(line.accountId ?? "") ||
        String(candidate.accountCode) === String(line.accountCode ?? ""),
    );
    if (!account) continue;
    const key = String(account.id);
    const total = activity.get(key) || { debit: 0, credit: 0 };
    total.debit = m(total.debit + m(line.debit));
    total.credit = m(total.credit + m(line.credit));
    activity.set(key, total);
  }
  return {
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    accounts: accounts.map((account: any) => {
      const period = activity.get(String(account.id));
      const periodDebit = m(period?.debit ?? 0);
      const periodCredit = m(period?.credit ?? 0);
      return {
        ...account,
        periodDebit,
        periodCredit,
        periodBalance:
          !hasDateFilter && !period
            ? m(account.currentBalance)
            : m(periodDebit - periodCredit),
      };
    }),
  };
}
router.get("/financial-statements", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.financial_statements.view")) return;
  try {
    return s.json(await financialStatementData(r.acc.org, r.query));
  } catch (error: any) {
    return s.status(error?.status || 500).json({ error: error?.message || "Failed to prepare financial statements" });
  }
});
router.get("/financial-statements/export", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.financial_statements.export")) return;
  try {
    return s.json(await financialStatementData(r.acc.org, r.query));
  } catch (error: any) {
    return s.status(error?.status || 500).json({ error: error?.message || "Failed to export financial statements" });
  }
});
router.get("/financial-statements/download", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.financial_statements.download")) return;
  try {
    return s.json(await financialStatementData(r.acc.org, r.query));
  } catch (error: any) {
    return s.status(error?.status || 500).json({ error: error?.message || "Failed to download financial statements" });
  }
});
router.get("/customer-ledger", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.customer_ledger.view")) return;
  const [receivables, partyEntries] = await Promise.all([
    db
      .select()
      .from(accountsReceivableTable)
      .where(eq(accountsReceivableTable.organizationId, r.acc.org)),
    db
      .select()
      .from(partyLedgerEntriesTable)
      .where(eq(partyLedgerEntriesTable.organizationId, r.acc.org)),
  ]);
  const z = new Map<string, any>();
  const customerRows = (partyEntries as any[]).filter((x) => String(x.partyType || "").toLowerCase() === "customer");
  for (const x of receivables as any[]) {
    const k = x.clientName;
    const q = z.get(k) || {
      clientId: x.clientId,
      clientName: k,
      invoiced: 0,
      received: 0,
      credited: 0,
      outstanding: 0,
      sources: new Set<string>(),
    };
    q.sources.add("accounts_receivable");
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
  for (const x of customerRows) {
    if (x.linkedArId) continue;
    const k = x.clientName || "Unassigned Customer";
    const q = z.get(k) || {
      clientId: x.clientId,
      clientName: k,
      invoiced: 0,
      received: 0,
      credited: 0,
      outstanding: 0,
      sources: new Set<string>(),
    };
    const value = m(x.amount);
    const drCr = String(x.drCr || "").toLowerCase();
    const entryType = String(x.entryType || "").toLowerCase();
    q.sources.add("party_ledger_entries");
    if (drCr === "debit") q.invoiced += value;
    else if (entryType.includes("credit")) q.credited += value;
    else q.received += value;
    q.outstanding = Math.max(0, q.invoiced - q.received - q.credited);
    z.set(k, q);
  }
  s.json([...z.values()].map((row) => ({ ...row, sources: [...row.sources] })));
});
router.get("/vendor-ledger", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.vendor_ledger.view")) return;
  const [payables, partyEntries] = await Promise.all([
    db
      .select()
      .from(accountsPayableTable)
      .where(eq(accountsPayableTable.organizationId, r.acc.org)),
    db
      .select()
      .from(partyLedgerEntriesTable)
      .where(eq(partyLedgerEntriesTable.organizationId, r.acc.org)),
  ]);
  const z = new Map<string, any>();
  const vendorRows = (partyEntries as any[]).filter((x) => String(x.partyType || "").toLowerCase() === "vendor");
  for (const x of payables as any[]) {
    const k = x.vendorName;
    const q = z.get(k) || { vendorName: k, billed: 0, paid: 0, credited: 0, outstanding: 0, sources: new Set<string>() };
    q.sources.add("accounts_payable");
    if (x.entryType === "Debit Note") {
      q.credited += m(x.amount);
      z.set(k, q);
      continue;
    }
    q.billed += m(x.amount);
    q.paid += m(x.paidAmount);
    q.outstanding += Math.max(
      0,
      m(x.amount) - m(x.paidAmount) - m(x.adjustedAmount),
    );
    z.set(k, q);
  }
  for (const x of vendorRows) {
    if (x.linkedApId) continue;
    const k = x.vendorName || "Unassigned Vendor";
    const q = z.get(k) || { vendorName: k, billed: 0, paid: 0, credited: 0, outstanding: 0, sources: new Set<string>() };
    const value = m(x.amount);
    const drCr = String(x.drCr || "").toLowerCase();
    const entryType = String(x.entryType || "").toLowerCase();
    q.sources.add("party_ledger_entries");
    if (drCr === "credit") q.billed += value;
    else if (entryType.includes("debit") || entryType.includes("credit")) q.credited += value;
    else q.paid += value;
    q.outstanding = Math.max(0, q.billed - q.paid - q.credited);
    z.set(k, q);
  }
  s.json([...z.values()].map((row) => ({ ...row, sources: [...row.sources] })));
});
router.get("/business-dashboard", async (r: any, s): Promise<any> => {
  if (need(r, s, "accounts.finance_dashboard.view"))
    s.redirect(307, "./dashboard-summary");
});
export { post as postJournal, coa as ensureCanonicalAccounts, reverseJournal };
export default router;





