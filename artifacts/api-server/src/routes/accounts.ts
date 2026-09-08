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
  salesInvoiceItemsTable,
  salesPaymentsTable,
  contactsTable,
  vendorPaymentsTable,
} from "@workspace/db";
import { paginateQuery, paginationMetadata } from "../lib/pagination";
import { postMatchedPurchaseInvoice } from "../lib/procurementAutomation";
import { effectivePermissions, getAuthUser } from "../lib/access";
import { resolveUploadPath } from "../lib/uploadStorage";
import { addBankChargeLines, bankCashExportRow, paymentDetails, paymentMethods, paymentMoney, prepareBankCash } from "../lib/accountPayments";
const router = Router(),
  m = (v: any) => {
    const parsed = Number(v?.$numberDecimal ?? v?.toString?.() ?? v ?? 0);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
  },
  day = () => new Date().toISOString().slice(0, 10);
const canonical = [
  ["1030", "Cash in Hand", "Asset"],
  ["1100", "Accounts Receivable", "Asset"],
  ["1200", "Credit Note", "Asset"],
  ["2100", "Accounts Payable", "Liability"],
  ["2200", "Debit Note", "Liability"],
  ["3000", "Capital", "Equity"],
  ["3100", "Owner Withdrawal", "Equity"],
  ["4100", "Sales Revenue", "Revenue"],
  ["5100", "Purchase Expense", "Expense"],
  ["5140", "Claim Expense", "Expense"],
  ["5150", "Bank Charges", "Expense"],
  ["5160", "Miscellaneous Expenses", "Expense"],
] as const;
const accountTypes = ["Asset", "Liability", "Equity", "Revenue", "Expense"] as const;
const gstSeedAccounts = [
  ["Input CGST", "Asset"],
  ["Input SGST", "Asset"],
  ["Input IGST", "Asset"],
  ["Output CGST", "Liability"],
  ["Output SGST", "Liability"],
  ["Output IGST", "Liability"],
] as const;
const systemAccountCodes = new Set<string>(canonical.map(([code]) => code));
const norm = (value: any) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const systemAccountNames = new Set<string>([
  ...canonical.map(([, name]) => norm(name)),
  ...gstSeedAccounts.map(([name]) => norm(name)),
]);
const isSystemAccountRow = (account: any) =>
  systemAccountCodes.has(String(account?.accountCode || "")) || systemAccountNames.has(norm(account?.accountName));
const padRef = (value: number) => String(value).padStart(6, "0");
const refNumber = (reference: any, prefix: string) => {
  const match = String(reference || "").match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
  return match ? Number(match[1]) : 0;
};
async function nextReference(org: number, prefix: string) {
  const { bankCashTransactionsTable } = await accountTables();
  const [journals, receivables, payables, bankCash] = await Promise.all([
    db.select().from(journalEntriesTable).where(eq(journalEntriesTable.organizationId, org)),
    db.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.organizationId, org)),
    db.select().from(accountsPayableTable).where(eq(accountsPayableTable.organizationId, org)),
    db.select().from(bankCashTransactionsTable).where(eq(bankCashTransactionsTable.organizationId, org)),
  ]);
  const refs = [
    ...journals.map((row: any) => row.reference),
    ...receivables.flatMap((row: any) => [row.invoiceNumber, row.creditNoteNumber]),
    ...payables.map((row: any) => row.billNumber),
    ...bankCash.map((row: any) => row.reference),
  ];
  const next = Math.max(0, ...refs.map((reference) => refNumber(reference, prefix))) + 1;
  return `${prefix}-${padRef(next)}`;
}
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
async function repointAccountReferences(from: any, to: any) {
  if (Number(from.id) === Number(to.id)) return;
  await db.update(journalLinesTable).set({ accountId: to.id, accountCode: to.accountCode, accountName: to.accountName }).where(eq(journalLinesTable.accountId, from.id));
  const { bankCashTransactionsTable } = await accountTables();
  await db.update(bankCashTransactionsTable).set({ bankCashAccountId: to.id }).where(eq(bankCashTransactionsTable.bankCashAccountId, from.id));
  await db.update(bankCashTransactionsTable).set({ transferToAccountId: to.id }).where(eq(bankCashTransactionsTable.transferToAccountId, from.id));
  await db.update(bankCashTransactionsTable).set({ counterAccountId: to.id }).where(eq(bankCashTransactionsTable.counterAccountId, from.id));
  await db.delete(chartOfAccountsTable).where(eq(chartOfAccountsTable.id, from.id));
}
async function consolidateDuplicateAccounts(org: number, rows: any[]) {
  const choose = (items: any[]) =>
    [...items].sort((left, right) => {
      const leftSystem = isSystemAccountRow(left) ? 0 : 1;
      const rightSystem = isSystemAccountRow(right) ? 0 : 1;
      const leftTouched = m(left.currentBalance) !== 0 || m(left.openingBalance) !== 0 ? 0 : 1;
      const rightTouched = m(right.currentBalance) !== 0 || m(right.openingBalance) !== 0 ? 0 : 1;
      return leftSystem - rightSystem || leftTouched - rightTouched || Number(left.id) - Number(right.id);
    })[0];
  for (const key of ["accountCode", "accountName"] as const) {
    const groups = new Map<string, any[]>();
    for (const row of rows) {
      const normalized = norm(row[key]);
      if (!normalized) continue;
      groups.set(normalized, [...(groups.get(normalized) || []), row]);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const canonicalAccount = choose(group);
      for (const duplicate of group) await repointAccountReferences(duplicate, canonicalAccount);
    }
    rows = await db.select().from(chartOfAccountsTable).where(eq(chartOfAccountsTable.organizationId, org));
  }
}
async function accountHasTransactions(org: number, accountId: number) {
  const journalRefs = await db.select().from(journalLinesTable).where(and(eq(journalLinesTable.organizationId, org), eq(journalLinesTable.accountId, accountId)));
  if (journalRefs.length) return true;
  const { bankCashTransactionsTable } = await accountTables();
  const [bankRows, payableRows, receivableRows] = await Promise.all([
    db.select().from(bankCashTransactionsTable).where(eq(bankCashTransactionsTable.organizationId, org)),
    db.select().from(accountsPayableTable).where(eq(accountsPayableTable.organizationId, org)),
    db.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.organizationId, org)),
  ]);
  return (bankRows as any[]).some((row) => [row.bankCashAccountId, row.transferToAccountId, row.counterAccountId].some((value) => Number(value) === accountId)) ||
    (payableRows as any[]).some((row) => Number(row.coaAccountId) === accountId) ||
    (receivableRows as any[]).some((row) => Number(row.coaAccountId) === accountId);
}
function accountInput(body: any, existing: any[] = [], currentId?: number) {
  const accountCode = String(body.accountCode || "").trim();
  const accountName = String(body.accountName || "").trim().replace(/\s+/g, " ");
  const accountType = String(body.accountType || "").trim();
  if (!accountCode || !accountName) throw new Error("Account code and account name are required");
  if (!accountTypes.includes(accountType as any)) throw new Error("Account type must be Asset, Liability, Equity, Revenue or Expense");
  const duplicateCode = existing.find((account: any) => Number(account.id) !== Number(currentId) && norm(account.accountCode) === norm(accountCode));
  if (duplicateCode) throw new Error(`Account code already exists: ${duplicateCode.accountCode}`);
  const duplicateName = existing.find((account: any) => Number(account.id) !== Number(currentId) && norm(account.accountName) === norm(accountName));
  if (duplicateName) throw new Error(`Account name already exists: ${duplicateName.accountName}`);
  return { accountCode, accountName, accountType, normalizedAccountCode: norm(accountCode), normalizedAccountName: norm(accountName) };
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
function itemTaxAmount(line: any, key: "cgst" | "sgst" | "igst") {
  const quantity = m(line.quantity ?? line.qty ?? line.receivedQty ?? 0);
  const rate = m(line.rate ?? line.unitPrice ?? line.price ?? 0);
  const discountPercent = m(line.discountPercent ?? line.discount ?? 0);
  const taxable = Math.max(0, quantity * rate * (1 - discountPercent / 100));
  const amount = m(line[`${key}Amount`] ?? line[`${key}Value`] ?? line[`${key}Tax`] ?? 0);
  if (amount > 0) return amount;
  const percent = m(line[`${key}Percent`] ?? line[`${key}Pct`] ?? line[key] ?? 0);
  return m(taxable * percent / 100);
}
function purchaseInvoiceTaxAmount(invoice: any, key: "cgst" | "sgst" | "igst") {
  const items = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  const fromItems = items.reduce((sum: number, line: any) => sum + itemTaxAmount(line, key), 0);
  return m(fromItems || invoice[`${key}Amount`] || invoice[`${key}Total`] || invoice[`${key}Value`] || 0);
}
function historySource(sourceType: any) {
  const value = String(sourceType || "").toLowerCase();
  if (value === "manual ar receipt" || value === "manual ar") return "Receivables";
  if (value === "manual ap") return "Payables";
  if (value.includes("credit note")) return "Credit Note";
  if (value.includes("debit note")) return "Debit Note";
  if (value.includes("payable") || value.includes("purchase") || value.includes("vendor")) return "Payables";
  if (value.includes("receivable") || value.includes("sales") || value.includes("customer")) return "Receivables";
  return "Manual";
}
function decorateHistoryLines(accounts: any[], receivables: any[], payables: any[], salesPayments: any[] = [], vendorPayments: any[] = [], clients: any[] = []) {
  const arById = new Map(receivables.map((row: any) => [Number(row.id), row]));
  const apById = new Map(payables.map((row: any) => [Number(row.id), row]));
  const findAr = (line: any) => receivables.find((row: any) => Boolean(line.reference) && (norm(row.invoiceNumber) === norm(line.reference) || norm(row.creditNoteNumber) === norm(line.reference))) ||
    (line.sourceType === "Sales Invoice" ? receivables.find((row: any) => row.sourceType === "Sales Invoice" && Number(row.sourceId) === Number(line.sourceId)) : arById.get(Number(line.sourceId)));
  const findAp = (line: any) => payables.find((row: any) => Boolean(line.reference) && norm(row.billNumber) === norm(line.reference)) ||
    (line.sourceType === "Purchase Invoice" ? payables.find((row: any) => row.sourceType === "Purchase Invoice" && Number(row.sourceId) === Number(line.sourceId)) : apById.get(Number(line.sourceId)));
  for (const account of accounts as any[]) {
    for (const line of account.lines || []) {
      const source = historySource(line.sourceType);
      const metadata = line.metadata || {};
      let party: any;
      if (line.sourceType === "Bank Cash Transaction") {
        const client = clients.find((row: any) => Number(row.id) === Number(metadata.clientId));
        party = client ? { clientId: client.id, clientName: client.name } : undefined;
      } else if (line.sourceType === "Manual AR Receipt") {
        party = arById.get(Number(metadata.arId));
      } else if (line.sourceType === "Customer Payment") {
        if (String(line.reference).startsWith("AUTO:AR:PAYMENT:")) party = arById.get(Number(line.sourceId));
        else {
          const payment = salesPayments.find((row: any) => Number(row.journalEntryId) === Number(line.journalEntryId));
          party = payment && receivables.find((row: any) => row.sourceType === "Sales Invoice" && Number(row.sourceId) === Number(payment.invoiceId));
          if (payment) { line.paymentMethod = payment.paymentMethod || ""; line.notes = payment.notes || ""; line.referenceId = payment.reference || party?.invoiceNumber || ""; }
        }
      } else if (source === "Payables" || source === "Debit Note") {
        const payment = vendorPayments.find((row: any) => Number(row.journalEntryId) === Number(line.journalEntryId));
        party = payment ? payables.find((row: any) => norm(row.billNumber) === norm(payment.invoiceReference)) : findAp(line);
        if (payment) { line.paymentMethod = payment.paymentMode || ""; line.notes = payment.notes || ""; line.referenceId = payment.invoiceReference || payment.transactionReference || ""; }
      } else if (source === "Receivables" || source === "Credit Note") party = findAr(line);
      line.source = source;
      line.partyName = party?.vendorName || party?.clientName || metadata.clientName || "N/A";
      line.partyId = party?.vendorId || party?.clientId || "N/A";
      line.referenceId = metadata.documentReference ?? line.referenceId ?? line.reference ?? "";
      line.paymentMethod = metadata.paymentMethod || line.paymentMethod || "";
      line.notes = metadata.notes ?? line.notes ?? "";
      line.accountName = account.accountName;
      line.paymentDate = String(line.paymentDate || line.entryDate || "").slice(0, 10);
    }
  }
}
async function coa(org: number) {
  let rows = await db
    .select()
    .from(chartOfAccountsTable)
    .where(eq(chartOfAccountsTable.organizationId, org));
  for (const [accountCode, accountName, accountType] of canonical) {
    const codeMatch = rows.find((x: any) => norm(x.accountCode) === norm(accountCode));
    const nameMatch = rows.find((x: any) => norm(x.accountName) === norm(accountName));
    if (codeMatch && nameMatch && Number(codeMatch.id) !== Number(nameMatch.id)) {
      await repointAccountReferences(nameMatch, codeMatch);
      rows = await db.select().from(chartOfAccountsTable).where(eq(chartOfAccountsTable.organizationId, org));
    }
    const existing = rows.find((x: any) => norm(x.accountCode) === norm(accountCode)) || rows.find((x: any) => norm(x.accountName) === norm(accountName));
    if (existing) {
      const patch: any = { accountCode, accountName, accountType, normalizedAccountCode: norm(accountCode), normalizedAccountName: norm(accountName), tallyLedgerName: existing.tallyLedgerName || accountName, isActive: existing.isActive !== false };
      await db.update(chartOfAccountsTable).set(patch).where(eq(chartOfAccountsTable.id, existing.id));
      continue;
    }
    const [created] = await db.insert(chartOfAccountsTable).values({
      organizationId: org,
      accountCode,
      accountName,
      accountType,
      normalizedAccountCode: norm(accountCode),
      normalizedAccountName: norm(accountName),
      currentBalance: 0,
      groupName: accountType,
      tallyLedgerName: accountName,
      tallyGroupName: accountType,
      isActive: true,
    }).returning();
    rows.push(created as any);
  }
const usedCodes = new Set((rows as any[]).map((row) => String(row.accountCode)));
  const nextAccountCode = (accountType: string) => {
    const bases: Record<string, number> = { Asset: 1000, Liability: 2000, Equity: 3000, Revenue: 4000, Expense: 5000 };
    const used = (rows as any[])
      .filter((row) => String(row.accountType) === accountType)
      .map((row) => Number.parseInt(String(row.accountCode), 10))
      .filter(Number.isFinite);
    let code = Math.max(bases[accountType] || 9000, ...used) + 10;
    while (usedCodes.has(String(code))) code += 10;
    usedCodes.add(String(code));
    return String(code);
  };
  for (const [accountName, accountType] of gstSeedAccounts) {
    const existing = (rows as any[]).find((row) => norm(row.accountName) === norm(accountName));
    if (existing) {
      if (existing.accountType !== accountType)
        await db.update(chartOfAccountsTable).set({ accountType, groupName: accountType, tallyGroupName: accountType } as any).where(eq(chartOfAccountsTable.id, existing.id));
      continue;
    }
    const accountCode = nextAccountCode(accountType);
    try {
      const [created] = await db.insert(chartOfAccountsTable).values({
        organizationId: org,
        accountCode,
        accountName,
        accountType,
        normalizedAccountCode: norm(accountCode),
        normalizedAccountName: norm(accountName),
        currentBalance: 0,
        groupName: accountType,
        tallyLedgerName: accountName,
        tallyGroupName: accountType,
        isActive: true,
      }).returning();
      rows.push(created as any);
    } catch (error: any) {
      rows = await db.select().from(chartOfAccountsTable).where(eq(chartOfAccountsTable.organizationId, org));
      if (!(rows as any[]).some((row) => norm(row.accountName) === norm(accountName))) throw error;
    }
  }
  await consolidateDuplicateAccounts(org, rows);
  rows = await db.select().from(chartOfAccountsTable).where(eq(chartOfAccountsTable.organizationId, org));
  for (const account of rows as any[]) {
    await db
      .update(chartOfAccountsTable)
      .set({ normalizedAccountCode: norm(account.accountCode), normalizedAccountName: norm(account.accountName) } as any)
      .where(eq(chartOfAccountsTable.id, Number(account.id)));
  }
  try {
    const { syncTableCustomIndexes } = await accountTables();
    await syncTableCustomIndexes(chartOfAccountsTable, [
      { key: { organizationId: 1, normalizedAccountCode: 1 }, name: "chart_of_accounts_org_normalized_code_unique", unique: true },
      { key: { organizationId: 1, normalizedAccountName: 1 }, name: "chart_of_accounts_org_normalized_name_unique", unique: true },
    ]);
  } catch (error: any) {
    // Ignore index creation errors to prevent blocking financial calculations
  }
  rows = await db
    .select()
    .from(chartOfAccountsTable)
    .where(eq(chartOfAccountsTable.organizationId, org))
    .orderBy(asc(chartOfAccountsTable.accountCode));
  const lines = await db
    .select()
    .from(journalLinesTable)
    .where(eq(journalLinesTable.organizationId, org));
  const entries = await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.organizationId, org));

  for (const a of rows as any[]) {
    const accountLines = lines.filter((l: any) => String(l.accountId ?? "") === String(a.id));
    const netDebit = accountLines.reduce((s: number, l: any) => s + Number(l.debit || 0) - Number(l.credit || 0), 0);
    const b = m(Number(a.openingBalance || 0) + netDebit);
    if (m(a.currentBalance) !== b) {
      await db.update(chartOfAccountsTable).set({ currentBalance: b } as any).where(eq(chartOfAccountsTable.id, a.id));
    }
    a.currentBalance = String(b);

    const historyLines = accountLines
      .map((l: any) => {
        const entry = entries.find((e: any) => Number(e.id) === Number(l.journalEntryId));
        return {
          id: l.id,
          journalEntryId: l.journalEntryId,
          entryDate: entry?.entryDate || "",
          reference: entry?.reference || l.memo || "",
          description: entry?.description || l.memo || "",
          sourceType: entry?.sourceType || "",
          sourceId: entry?.sourceId || "",
          metadata: entry?.metadata || {},
          notes: l.memo || "",
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          runningBalance: 0,
        };
      })
      .sort((x: any, y: any) => String(x.entryDate).localeCompare(String(y.entryDate)) || Number(x.id) - Number(y.id));

    let running = m(a.openingBalance || 0);
    for (const h of historyLines) {
      const lineNet = h.debit - h.credit;
      running = m(running + lineNet);
      h.runningBalance = running;
    }
    a.lines = historyLines;
  }

  const [receivableRows, payableRows, salesPaymentRows, vendorPaymentRows, salesInvoiceItemRows, purchaseInvoiceRows] = await Promise.all([
    db.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.organizationId, org)),
    db.select().from(accountsPayableTable).where(eq(accountsPayableTable.organizationId, org)),
    db.select().from(salesPaymentsTable),
    db.select().from(vendorPaymentsTable).where(eq(vendorPaymentsTable.organizationId, org)),
    db.select().from(salesInvoiceItemsTable),
    db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.organizationId, org)),
  ]);
  const resetAccount = async (code: string, balance: number, derivedLines: any[]) => {
    const account = (rows as any[]).find((row: any) => String(row.accountCode) === code);
    if (!account) return;
    const isCreditNormal = ["Revenue", "Liability", "Equity"].includes(String(account.accountType));
    let running = m(account.openingBalance || 0);
    const currentBalance = m(Number(account.openingBalance || 0) + balance);
    account.currentBalance = String(currentBalance);
    await db.update(chartOfAccountsTable).set({ currentBalance } as any).where(eq(chartOfAccountsTable.id, account.id));
    account.lines = derivedLines
      .filter((line) => m(line.debit) > 0 || m(line.credit) > 0)
      .sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate)) || String(left.reference).localeCompare(String(right.reference)))
      .map((line, index) => {
        running = m(running + (isCreditNormal ? m(line.credit) - m(line.debit) : m(line.debit) - m(line.credit)));
        return { id: `derived-${code}-${index}`, journalEntryId: null, runningBalance: running, ...line };
      });
  };
  const invoices = (receivableRows as any[]).filter((row) => row.entryType !== "Credit Note");
  const bills = (payableRows as any[]).filter((row) => row.entryType !== "Debit Note");
  const latestDate = (dates: any[]) => dates.map((value) => String(value || "").slice(0, 10)).filter(Boolean).sort().pop() || "";
  const paidInvoiceDate = (row: any) =>
    latestDate((salesPaymentRows as any[]).filter((payment) => Number(payment.invoiceId) === Number(row.sourceId)).map((payment) => payment.paymentDate)) || row.invoiceDate;
  const paidBillDate = (row: any) =>
    latestDate((vendorPaymentRows as any[]).filter((payment) => norm(payment.invoiceReference) === norm(row.billNumber)).map((payment) => payment.paymentDate)) || row.billDate;
  await resetAccount(
    "1100",
    invoices.reduce((sum, row) => sum + receivableOutstanding(row), 0),
    invoices.map((row) => ({
      entryDate: row.invoiceDate,
      reference: row.invoiceNumber,
      description: row.clientName || "Customer invoice",
      sourceType: row.sourceType === "Manual" ? "Manual AR" : row.sourceType || "Sales Invoice",
      sourceId: row.sourceId || row.id,
      debit: receivableOutstanding(row),
      credit: 0,
    })),
  );
  await resetAccount(
    "4100",
    invoices.reduce((sum, row) => sum + m(row.receivedAmount), 0),
    invoices.map((row) => ({
      entryDate: paidInvoiceDate(row),
      reference: row.invoiceNumber,
      description: row.clientName || "Customer payment received",
      sourceType: row.sourceType === "Manual" ? "Manual AR" : row.sourceType || "Sales Invoice",
      sourceId: row.sourceId || row.id,
      debit: 0,
      credit: m(row.receivedAmount),
    })),
  );
  await resetAccount(
    "2100",
    bills.reduce((sum, row) => sum + payableOutstanding(row), 0),
    bills.map((row) => ({
      entryDate: row.billDate,
      reference: row.billNumber,
      description: row.vendorName || "Vendor bill",
      sourceType: row.sourceType === "Manual" ? "Manual AP" : row.sourceType || "Purchase Invoice",
      sourceId: row.sourceId || row.id,
      debit: 0,
      credit: payableOutstanding(row),
    })),
  );
  await resetAccount(
    "5100",
    bills.reduce((sum, row) => sum + m(row.paidAmount), 0),
    bills.map((row) => ({
      entryDate: paidBillDate(row),
      reference: row.billNumber,
      description: row.vendorName || "Vendor payment made",
      sourceType: row.sourceType === "Manual" ? "Manual AP" : row.sourceType || "Purchase Invoice",
      sourceId: row.sourceId || row.id,
      debit: m(row.paidAmount),
      credit: 0,
    })),
  );
const resetGstAccount = async (accountName: string, derivedLines: any[]) => {
    const account = (rows as any[]).find((row: any) => norm(row.accountName) === norm(accountName));
    if (!account) return;
    const isCreditNormal = ["Revenue", "Liability", "Equity"].includes(String(account.accountType));
    let running = m(account.openingBalance || 0);
    const filteredLines = derivedLines.filter((line) => m(line.debit) > 0 || m(line.credit) > 0);
    const balance = m(Number(account.openingBalance || 0) + filteredLines.reduce((sum, line) => sum + (isCreditNormal ? m(line.credit) - m(line.debit) : m(line.debit) - m(line.credit)), 0));
    account.currentBalance = String(balance);
    await db.update(chartOfAccountsTable).set({ currentBalance: balance } as any).where(eq(chartOfAccountsTable.id, account.id));
    account.lines = filteredLines
      .sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate)) || String(left.reference).localeCompare(String(right.reference)))
      .map((line, index) => {
        running = m(running + (isCreditNormal ? m(line.credit) - m(line.debit) : m(line.debit) - m(line.credit)));
        return { id: `derived-gst-${account.id}-${index}`, journalEntryId: null, runningBalance: running, ...line };
      });
  };
  const salesInvoicesById = new Map(invoices.filter((row) => row.sourceType === "Sales Invoice" && row.sourceId).map((row) => [Number(row.sourceId), row]));
  const salesGstLines = (key: "cgst" | "sgst" | "igst") => (salesInvoiceItemRows as any[]).reduce((map, item: any) => {
    const invoice = salesInvoicesById.get(Number(item.invoiceId));
    if (!invoice) return map;
    const value = itemTaxAmount(item, key);
    const current = map.get(Number(item.invoiceId)) || {
      entryDate: invoice.invoiceDate,
      reference: invoice.invoiceNumber,
      description: `${invoice.clientName || "Sales invoice"} GST`,
      sourceType: "Receivables",
      sourceId: invoice.id,
      debit: 0,
      credit: 0,
    };
    current.debit = m(current.debit + value);
    map.set(Number(item.invoiceId), current);
    return map;
  }, new Map<number, any>());
  const purchaseGstLines = (key: "cgst" | "sgst" | "igst") => (purchaseInvoiceRows as any[]).map((invoice: any) => ({
    entryDate: invoice.invoiceDate,
    reference: invoice.invoiceNumber,
    description: `${invoice.vendorName || "Purchase invoice"} GST`,
    sourceType: "Payables",
    sourceId: invoice.id,
    debit: 0,
    credit: purchaseInvoiceTaxAmount(invoice, key),
  }));
  await resetGstAccount("Input CGST", [...salesGstLines("cgst").values()]);
  await resetGstAccount("Input SGST", [...salesGstLines("sgst").values()]);
  await resetGstAccount("Input IGST", [...salesGstLines("igst").values()]);
  await resetGstAccount("Output CGST", purchaseGstLines("cgst"));
  await resetGstAccount("Output SGST", purchaseGstLines("sgst"));
  await resetGstAccount("Output IGST", purchaseGstLines("igst"));
  decorateHistoryLines(rows as any[], receivableRows as any[], payableRows as any[], salesPaymentRows as any[], vendorPaymentRows as any[], await contactsFor("client"));
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
        reference: b.reference || await nextReference(org, "JE"),
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
        credit: m(x.grandTotal),
      },
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
        { accountId: id("1030"), credit: m(x.amount) },
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
        { accountId: id("5160"), debit: m(x.grossPay) },
        { accountId: id("2100"), credit: m(x.grossPay) },
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
          { accountId: id("2100"), debit: m(x.netPay) },
          { accountId: id("1030"), credit: m(x.netPay) },
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
        { accountId: id("2100"), credit: m(x.amount) },
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
const dateRangeFilter = (query: any, field: string) => {
  const dateFrom = String(query?.dateFrom || "").slice(0, 10);
  const dateTo = String(query?.dateTo || "").slice(0, 10);
  if (dateFrom && dateTo && dateFrom > dateTo)
    throw Object.assign(new Error("From date must be on or before To date"), {
      status: 400,
    });
  return (row: any) => {
    const value = String(row?.[field] || "").slice(0, 10);
    return (!dateFrom || value >= dateFrom) && (!dateTo || value <= dateTo);
  };
};
async function contactsFor(type?: "client" | "vendor" | "other") {
  const rows = await db.select().from(contactsTable);
  return (rows as any[]).filter((row) => !type || String(row.type || "").toLowerCase() === type);
}
async function contactMaps() {
  const contacts = await contactsFor();
  return {
    byId: new Map(contacts.map((contact: any) => [Number(contact.id), contact])),
    byNameType: new Map(
      contacts.map((contact: any) => [
        `${String(contact.type || "").toLowerCase()}:${norm(contact.name)}`,
        contact,
      ]),
    ),
  };
}
function contactLabel(contact: any, fallback = "") {
  if (!contact) return fallback;
  return contact.contactCode ? `${contact.name} - ${contact.contactCode}` : contact.name;
}
async function resolveContact(type: "client" | "vendor", id: any, name?: any) {
  const contacts = await contactsFor(type);
  const byId = contacts.find((contact: any) => Number(contact.id) === Number(id));
  if (byId) return byId;
  const matches = contacts.filter((contact: any) => norm(contact.name) === norm(name));
  return matches.length === 1 ? matches[0] : null;
}
async function enrichReceivables(rows: any[]) {
  const maps = await contactMaps();
  return rows.map((row: any) => {
    const contact = maps.byId.get(Number(row.clientId)) || maps.byNameType.get(`client:${norm(row.clientName)}`);
    return {
      ...row,
      clientId: contact?.id ?? row.clientId ?? null,
      clientCode: contact?.contactCode || "",
      clientName: contact?.name || row.clientName,
      customerDisplay: contactLabel(contact, row.clientName),
    };
  });
}
async function enrichPayables(rows: any[]) {
  const maps = await contactMaps();
  return rows.map((row: any) => {
    const contact = maps.byId.get(Number(row.vendorId)) || maps.byNameType.get(`vendor:${norm(row.vendorName)}`);
    return {
      ...row,
      vendorId: contact?.id ?? row.vendorId ?? null,
      vendorCode: contact?.contactCode || "",
      vendorName: contact?.name || row.vendorName,
      vendorDisplay: contactLabel(contact, row.vendorName),
    };
  });
}
function payableOutstanding(row: any) {
  return Math.max(0, m(row.amount) - m(row.paidAmount) - m(row.adjustedAmount));
}
function receivableOutstanding(row: any) {
  return Math.max(0, m(row.amount) - m(row.receivedAmount) - m(row.adjustedAmount));
}
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
router.get("/party-options", async (r: any, s): Promise<any> => {
  if (!can(r, "accounts.accounts_receivable.view") && !can(r, "accounts.accounts_payable.view") && !can(r, "accounts.customer_ledger.view") && !can(r, "accounts.vendor_ledger.view"))
    return s.status(403).json({ error: "Forbidden" });
  const type = String(r.query.type || "").toLowerCase();
  if (!["client", "vendor", "other"].includes(type))
    return s.status(400).json({ error: "Invalid contact type" });
  const rows = await contactsFor(type as any);
  s.json(
    rows
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))
      .map((contact: any) => ({
        id: contact.id,
        name: contact.name,
        contactCode: contact.contactCode || "",
        displayName: contactLabel(contact),
        address: contact.address || "",
        company: contact.company || "",
      })),
  );
});
router.get("/receivable-documents", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.accounts_receivable.view")) return;
  const clientId = Number(r.query.clientId || 0);
  const mode = String(r.query.mode || "").toLowerCase();
  const [invoices, receivables] = await Promise.all([
    db.select().from(salesInvoicesTable),
    db.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.organizationId, r.acc.org)),
  ]);
  if (mode === "credit-note") {
    const rows = (receivables as any[])
      .filter((row) => row.entryType !== "Credit Note")
      .filter((row) => Number(row.clientId) === (clientId || Number(row.clientId)))
      .filter((row) => m(row.receivedAmount) > 0 || ["received", "partial", "paid"].includes(String(row.status || "").toLowerCase()))
      .map((row) => {
        const received = m(row.receivedAmount);
        const total = m(row.amount);
        return { id: row.id, sourceType: row.sourceType || "Accounts Receivable", clientId: row.clientId, clientName: row.clientName, invoiceNumber: row.invoiceNumber, invoiceDate: row.invoiceDate, dueDate: row.dueDate || row.invoiceDate, totalAmount: total, amountReceived: received, adjustedAmount: m(row.adjustedAmount), outstandingAmount: receivableOutstanding(row), displayName: `${row.invoiceNumber} - ${row.clientName} - ${String(row.status || "Partial")}` };
      });
    return s.json(rows);
  }
  const linkedInvoiceIds = new Set((receivables as any[]).filter((row) => row.sourceType === "Sales Invoice" && row.sourceId).map((row) => Number(row.sourceId)));
  const rows = (invoices as any[])
    .filter((invoice) => Number(invoice.clientId) === (clientId || Number(invoice.clientId)))
    .filter((invoice) => invoice.isLatestVersion !== false)
    .filter((invoice) => ["Approved", "Paid"].includes(String(invoice.status || "")))
    .filter((invoice) => !["Paid", "Settled", "Cancelled", "Rejected"].includes(String(invoice.paymentStatus || invoice.status || "")))
    .filter((invoice) => !linkedInvoiceIds.has(Number(invoice.id)))
    .map((invoice) => {
      const paid = m(invoice.amountPaid);
      const total = m(invoice.grandTotal);
      const outstanding = Math.max(0, m(invoice.balanceDue || total - paid));
      return { id: invoice.id, sourceType: "Sales Invoice", clientId: invoice.clientId, clientName: invoice.clientName, invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate || invoice.invoiceDate, totalAmount: total, amountReceived: paid, adjustedAmount: m(invoice.adjustedAmount), outstandingAmount: outstanding, displayName: `${invoice.invoiceNumber} - ${invoice.clientName} - ${outstanding} Outstanding` };
    })
    .filter((invoice) => invoice.outstandingAmount > 0);
  s.json(rows);
});
router.get("/payable-documents", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.accounts_payable.view")) return;
  const vendorId = Number(r.query.vendorId || 0);
  const mode = String(r.query.mode || "").toLowerCase();
  const [invoices, payables] = await Promise.all([
    db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.organizationId, r.acc.org)),
    db.select().from(accountsPayableTable).where(eq(accountsPayableTable.organizationId, r.acc.org)),
  ]);
  if (mode === "debit-note") {
    const rows = (payables as any[])
      .filter((row) => row.entryType !== "Debit Note")
      .filter((row) => Number(row.vendorId) === (vendorId || Number(row.vendorId)))
      .filter((row) => m(row.paidAmount) > 0 || ["paid", "partial"].includes(String(row.status || "").toLowerCase()))
      .map((row) => {
        const paid = m(row.paidAmount);
        const total = m(row.amount);
        return { id: row.id, sourceType: row.sourceType || "Accounts Payable", vendorId: Number(row.vendorId) || null, vendorName: row.vendorName, billNumber: row.billNumber, billDate: row.billDate, dueDate: row.dueDate || row.billDate, totalAmount: total, paidAmount: paid, debitNoteAmount: m(row.adjustedAmount), outstandingAmount: payableOutstanding(row), displayName: `${row.billNumber} - ${row.vendorName} - ${String(row.status || "Partial")}` };
      });
    return s.json(rows);
  }
  const linkedInvoiceIds = new Set((payables as any[]).filter((row) => row.sourceType === "Purchase Invoice" && row.sourceId).map((row) => Number(row.sourceId)));
  const rows = (invoices as any[])
    .filter((invoice) => Number(invoice.vendorId) === (vendorId || Number(invoice.vendorId)))
    .filter((invoice) => ["2-Way Match", "3-Way Match", "Matched"].includes(String(invoice.matchStatus || "")))
    .filter((invoice) => !["Paid", "Cancelled", "Rejected"].includes(String(invoice.status || "")))
    .filter((invoice) => !linkedInvoiceIds.has(Number(invoice.id)))
    .map((invoice) => {
      const bill = (payables as any[]).find((row) => row.sourceType === "Purchase Invoice" && Number(row.sourceId) === Number(invoice.id));
      const paid = m(bill?.paidAmount);
      const adjusted = m(bill?.adjustedAmount);
      const total = m(invoice.amount);
      return { id: invoice.id, sourceType: "Purchase Invoice", vendorId: Number(invoice.vendorId) || null, vendorName: invoice.vendorName, billNumber: invoice.invoiceNumber, billDate: invoice.invoiceDate, dueDate: invoice.dueDate || invoice.invoiceDate, totalAmount: total, paidAmount: paid, debitNoteAmount: adjusted, outstandingAmount: Math.max(0, total - paid - adjusted), displayName: `${invoice.invoiceNumber} - ${invoice.vendorName} - ${Math.max(0, total - paid - adjusted)} Outstanding` };
    })
    .filter((invoice) => invoice.outstandingAmount > 0);
  s.json(rows);
});

// DISABLED: Masters module is not required for this phase
// router.get("/masters", async (r: any, s): Promise<any> => {
//   if (!need(r, s, "accounts.masters.view")) return;
//   await ensureAccountMasters(r.acc.org);
//   const { accountGroupsTable, accountCostCentersTable, accountTransactionTypesTable } = await accountTables();
//   const [groups, costCenters, transactionTypes] = await Promise.all([
//     db.select().from(accountGroupsTable).where(eq(accountGroupsTable.organizationId, r.acc.org)),
//     db.select().from(accountCostCentersTable).where(eq(accountCostCentersTable.organizationId, r.acc.org)),
//     db.select().from(accountTransactionTypesTable).where(eq(accountTransactionTypesTable.organizationId, r.acc.org)),
//   ]);
//   s.json({ groups, costCenters, transactionTypes, sourceRegistry: accountSourceRegistry });
// });

// router.post("/masters/transaction-types", async (r: any, s): Promise<any> => {
//   if (!need(r, s, "accounts.masters.create")) return;
//   const { accountTransactionTypesTable } = await accountTables();
//   const code = String(r.body.code || r.body.name || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
//   const name = String(r.body.name || "").trim();
//   if (!code || !name) return s.status(400).json({ error: "Code and name are required" });
//   const [row] = await db.insert(accountTransactionTypesTable).values({
//     organizationId: r.acc.org, code, name,
//     direction: r.body.direction || "Either",
//     tallyVoucherType: r.body.tallyVoucherType || "Journal",
//     isSystem: false, isActive: r.body.isActive !== false,
//   }).returning();
//   s.status(201).json(row);
// });

// router.patch("/masters/transaction-types/:id", async (r: any, s): Promise<any> => {
//   if (!need(r, s, "accounts.masters.update")) return;
//   const { accountTransactionTypesTable } = await accountTables();
//   const updates: any = { updatedAt: new Date() };
//   for (const key of ["name", "direction", "tallyVoucherType", "isActive"])
//     if (r.body[key] !== undefined) updates[key] = r.body[key];
//   const [row] = await db.update(accountTransactionTypesTable).set(updates).where(eq(accountTransactionTypesTable.id, Number(r.params.id))).returning();
//   if (!row) return s.status(404).json({ error: "Transaction type not found" });
//   s.json(row);
// });
const ACCOUNT_IMPORT_LIMIT = 5000;
const exactDate = (value: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
const importRows = (body: any) => Array.isArray(body?.rows) ? body.rows : [];
const rowNo = (row: any, index: number) => Number(row?.rowNumber || row?.sNo || index + 2);
const accountLabel = (account: any) => `${account.accountCode} - ${account.accountName}`;
const contactOptionLabel = (contact: any) => contact.contactCode ? `${contact.name} - ${contact.contactCode}` : contact.name;
function importError(errors: string[], index: number, field: string, reason: string) {
  errors.push(`Row ${index}: ${field} - ${reason}`);
}
async function insertImportJournal(tx: any, org: number, b: any, userId?: number) {
  const ls = (b.lines || []).map((line: any) => ({ ...line, debit: m(line.debit), credit: m(line.credit) }));
  const dr = m(ls.reduce((sum: number, line: any) => sum + line.debit, 0));
  const cr = m(ls.reduce((sum: number, line: any) => sum + line.credit, 0));
  if (!ls.length || dr <= 0 || Math.abs(dr - cr) > 0.009) throw Error("Journal debit and credit must balance");
  const accounts = await coa(org);
  const [entry] = await tx.insert(journalEntriesTable).values({
    organizationId: org,
    entryDate: b.entryDate || day(),
    reference: b.reference,
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
  }).returning();
  for (const line of ls) {
    const account = accounts.find((item: any) => Number(item.id) === Number(line.accountId));
    if (!account) throw Error("Invalid account");
    await tx.insert(journalLinesTable).values({
      organizationId: org,
      journalEntryId: entry.id,
      accountId: account.id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      debit: line.debit,
      credit: line.credit,
      memo: line.memo || "",
    });
    await tx.update(chartOfAccountsTable).set({ currentBalance: m(Number(account.currentBalance) + line.debit - line.credit) }).where(eq(chartOfAccountsTable.id, account.id));
  }
  return entry;
}
function resolveAccountOption(accounts: any[], value: any) {
  const key = norm(value);
  if (!key) return null;
  const activeAccounts = accounts.filter((account: any) => account.isActive !== false);
  return (
    activeAccounts.find((a: any) => norm(`${a.accountCode} - ${a.accountName}`) === key || norm(`${a.accountCode}-${a.accountName}`) === key) ||
    activeAccounts.find((a: any) => norm(a.accountCode) === key) ||
    activeAccounts.find((a: any) => norm(a.accountName) === key) ||
    activeAccounts.find((a: any) => norm(a.id) === key) ||
    null
  );
}
async function exportPartyRows(kind: "ap" | "ar", query: any) {
  const table = kind === "ap" ? accountsPayableTable : accountsReceivableTable;
  const dateField = kind === "ap" ? "billDate" : "invoiceDate";
  const search = norm(query.search || "");
  let rows = (await db.select().from(table).where(eq(table.organizationId, query.org)).orderBy(desc(table.createdAt))).filter(dateRangeFilter(query, dateField));
  if (search) rows = rows.filter((row: any) => [row.invoiceNumber, row.creditNoteNumber, row.linkedInvoiceNumber, row.billNumber, row.againstBillNumber, row.clientName, row.vendorName, row.notes, row.status, row.sourceType].some((value) => norm(value).includes(search)));
  const entryType = norm(query.entryType || "");
  if (entryType) rows = rows.filter((row: any) => norm(row.entryType) === entryType || (entryType === "bill" && row.entryType !== "Debit Note") || (entryType === "invoice" && row.entryType !== "Credit Note"));
  if (query.status) rows = rows.filter((row: any) => norm(row.status) === norm(query.status));
  if (query.approvalStatus) rows = rows.filter((row: any) => norm(row.approvalStatus) === norm(query.approvalStatus));
  if (query.localDateFrom) rows = rows.filter((row: any) => String(row[dateField] || "").slice(0, 10) >= String(query.localDateFrom).slice(0, 10));
  if (query.localDateTo) rows = rows.filter((row: any) => String(row[dateField] || "").slice(0, 10) <= String(query.localDateTo).slice(0, 10));
  if (query.customer) rows = rows.filter((row: any) => norm(row.clientName) === norm(query.customer));
  if (query.vendor) rows = rows.filter((row: any) => norm(row.vendorName) === norm(query.vendor));
  return kind === "ap" ? enrichPayables(rows as any[]) : enrichReceivables(rows as any[]);
}

router.get("/bank-cash-transactions/export", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.bank_cash.export")) return;
  try {
    const rows = await bankCashRows(r.acc.org, r.query);
    s.json({
      rows: rows.map(bankCashExportRow),
    });
  }
  catch (error: any) { s.status(error?.status || 500).json({ error: error?.message || "Failed to export bank and cash transactions" }); }
});
router.get("/journal-entries/export", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.journal_entries.export")) return;
  try {
    const search = norm(r.query.search || "");
    let rows = (await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.organizationId, r.acc.org)).orderBy(desc(journalEntriesTable.entryDate))).filter(dateRangeFilter(r.query, "entryDate"));
    if (search) rows = rows.filter((row: any) => [row.reference, row.description, row.voucherType, row.status, row.approvalStatus].some((value) => norm(value).includes(search)));
    s.json({ rows: rows.map((row: any) => serializeMoneyFields(row)) });
  } catch (error: any) { s.status(error?.status || 500).json({ error: error?.message || "Failed to export journal entries" }); }
});
router.get("/ap/export", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.accounts_payable.export")) return;
  try { s.json({ rows: (await exportPartyRows("ap", { ...r.query, org: r.acc.org })).map((row: any) => serializeMoneyFields(row)) }); }
  catch (error: any) { s.status(error?.status || 500).json({ error: error?.message || "Failed to export payables" }); }
});
router.get("/ar/export", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.accounts_receivable.export")) return;
  try { s.json({ rows: (await exportPartyRows("ar", { ...r.query, org: r.acc.org })).map((row: any) => serializeMoneyFields(row)) }); }
  catch (error: any) { s.status(error?.status || 500).json({ error: error?.message || "Failed to export receivables" }); }
});
router.get("/import-options", async (r: any, s): Promise<any> => {
  if (!can(r, "accounts.bank_cash.import") && !can(r, "accounts.accounts_payable.import") && !can(r, "accounts.accounts_receivable.import") && !can(r, "accounts.journal_entries.import")) return s.status(403).json({ error: "Forbidden" });
  const accounts = (await coa(r.acc.org)).filter((account: any) => account.isActive !== false);
  const [clients, vendors] = await Promise.all([contactsFor("client"), contactsFor("vendor")]);
  s.json({
    accounts: accounts.map((account: any) => ({ id: account.id, label: accountLabel(account) })),
    clients: clients.map((contact: any) => ({ id: contact.id, label: contactOptionLabel(contact) })),
    vendors: vendors.map((contact: any) => ({ id: contact.id, label: contactOptionLabel(contact) })),
    bankCashModes: ["Credit", "Debit", "Transfer"],
    paymentMethods: paymentMethods.map((label) => ({ label })),
    payableEntryTypes: ["Bill", "Debit Note"],
    receivableEntryTypes: ["Invoice", "Credit Note"],
  });
});
router.post("/bank-cash-transactions/import", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.bank_cash.import")) return;
  const rows = importRows(r.body);
  if (!rows.length) return s.status(400).json({ error: "No import rows found" });
  if (rows.length > ACCOUNT_IMPORT_LIMIT) return s.status(400).json({ error: `Maximum ${ACCOUNT_IMPORT_LIMIT} rows can be imported at once` });
  const errors: string[] = [];
  const accounts = (await coa(r.acc.org)).filter((account: any) => account.isActive !== false);
  const { bankCashTransactionsTable } = await accountTables();
  const clients = await contactsFor("client");
  const prepared = rows.map((row: any, i: number) => {
    try {
      if (!String(row.mode || row.type || "").trim()) throw new Error("Type is required");
      return { ...prepareBankCash(row, accounts, clients), transactionTypeName: String(row.transactionTypeName || "Bank/Cash Transaction").trim() };
    } catch (error: any) {
      importError(errors, rowNo(row, i), "Payment", error.message);
      return null;
    }
  });
  if (errors.length) return s.status(400).json({ error: errors.join("\n") });
  await db.transaction(async (tx) => {
    for (const item of prepared) await tx.insert(bankCashTransactionsTable).values({
      ...item!,
      organizationId: r.acc.org,
      reference: item!.reference || await nextReference(r.acc.org, "BC"),
      createdByUserId: Number(r.acc.user.id),
    });
  });
  s.status(201).json({ created: rows.length });
});
router.post("/journal-entries/import", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.journal_entries.import")) return;
  const rows = importRows(r.body);
  if (!rows.length) return s.status(400).json({ error: "No import rows found" });
  if (rows.length > ACCOUNT_IMPORT_LIMIT) return s.status(400).json({ error: `Maximum ${ACCOUNT_IMPORT_LIMIT} rows can be imported at once` });
  const errors: string[] = [];
  const accounts = (await coa(r.acc.org)).filter((account: any) => account.isActive !== false);
  const existing = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.organizationId, r.acc.org));
  const seen = new Set<string>();
  const prepared = rows.map((row: any, i: number) => {
    const n = rowNo(row, i);
    const reference = String(row.reference || "").trim();
    const amount = m(row.amount);
    const debit = resolveAccountOption(accounts, row.debitAccount);
    const credit = resolveAccountOption(accounts, row.creditAccount);
    if (!exactDate(row.entryDate)) importError(errors, n, "Entry Date", "must use YYYY-MM-DD");
    if (!reference) importError(errors, n, "Reference", "is required");
    if (!String(row.description || "").trim()) importError(errors, n, "Description", "is required");
    if (!debit) importError(errors, n, "Debit Account", "choose a valid account");
    if (!credit) importError(errors, n, "Credit Account", "choose a valid account");
    if (debit && credit && Number(debit.id) === Number(credit.id)) importError(errors, n, "Credit Account", "must be different from Debit Account");
    if (!(amount > 0)) importError(errors, n, "Amount", "must be greater than zero");
    if (reference) {
      const key = norm(reference);
      if (seen.has(key)) importError(errors, n, "Reference", "duplicate in this Excel file");
      if (existing.some((entry: any) => norm(entry.reference) === key)) importError(errors, n, "Reference", "already exists");
      seen.add(key);
    }
    return { row, reference, amount, debit, credit };
  });
  if (errors.length) return s.status(400).json({ error: errors.join("\n") });
  for (const item of prepared) await post(r.acc.org, { entryDate: item.row.entryDate, reference: item.reference, description: String(item.row.description).trim(), sourceType: "Manual", metadata: { notes: item.row.notes || "" }, lines: [{ accountId: item.debit.id, debit: item.amount, credit: 0, memo: item.row.memo || "" }, { accountId: item.credit.id, debit: 0, credit: item.amount, memo: item.row.memo || "" }] }, r.acc.user.id);
  s.status(201).json({ created: rows.length });
});
router.post("/ap/import", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.accounts_payable.import")) return;
  const rows = importRows(r.body);
  if (!rows.length) return s.status(400).json({ error: "No import rows found" });
  if (rows.length > ACCOUNT_IMPORT_LIMIT) return s.status(400).json({ error: `Maximum ${ACCOUNT_IMPORT_LIMIT} rows can be imported at once` });
  const errors: string[] = [];
  const vendors = await contactsFor("vendor");
  const accounts = (await coa(r.acc.org)).filter((account: any) => account.isActive !== false);
  const existing = await db.select().from(accountsPayableTable).where(eq(accountsPayableTable.organizationId, r.acc.org));
  const seen = new Set<string>();
  const prepared = rows.map((row: any, i: number) => {
    const n = rowNo(row, i);
    const entryType = String(row.entryType || "Bill").trim();
    const billNumber = String(row.billNumber || "").trim();
    const vendor = vendors.find((item: any) => norm(item.id) === norm(row.vendor) || norm(item.name) === norm(row.vendor) || norm(contactOptionLabel(item)) === norm(row.vendor));
    const amount = m(row.amount);
    const paidAmount = entryType === "Debit Note" ? amount : m(row.paidAmount);
    const adjustedAmount = entryType === "Debit Note" ? 0 : m(row.adjustedAmount);
    const account = resolveAccountOption(accounts, row.accountName);
    if (!["Bill", "Debit Note"].includes(entryType)) importError(errors, n, "Entry Type", "must be Bill or Debit Note");
    if (!vendor) importError(errors, n, "Vendor", "choose a valid CRM Vendor");
    if (!billNumber) importError(errors, n, "Bill Number", "is required");
    if (!exactDate(row.billDate)) importError(errors, n, "Bill Date", "must use YYYY-MM-DD");
    if (!exactDate(row.dueDate)) importError(errors, n, "Due Date", "must use YYYY-MM-DD");
    if (!(amount > 0)) importError(errors, n, "Amount", "must be greater than zero");
    if (paidAmount < 0 || adjustedAmount < 0) importError(errors, n, "Paid/Adjusted Amount", "cannot be negative");
    if (paidAmount + adjustedAmount > amount + 0.009) importError(errors, n, "Paid/Adjusted Amount", "cannot exceed Amount");
    if (entryType === "Debit Note") {
      const linkedBill = existing.find((entry: any) => entry.entryType !== "Debit Note" && norm(entry.billNumber) === norm(row.againstBillNumber) && (!vendor || Number(entry.vendorId || vendor.id) === Number(vendor.id)));
      const billPaid = m(linkedBill?.paidAmount);
      const linkedBillStatus = String(linkedBill?.status || "").toLowerCase();
      if (!String(row.againstBillNumber || "").trim()) importError(errors, n, "Against Bill", "is required");
      if (!linkedBill) importError(errors, n, "Against Bill", "linked vendor bill was not found");
      else if (!billPaid && !["paid", "partial"].includes(linkedBillStatus)) importError(errors, n, "Against Bill", "only paid or partial bills can be linked");
      else if (amount > (billPaid >= m(linkedBill.amount) - 0.009 ? m(linkedBill.amount) : billPaid) + 0.009) importError(errors, n, "Amount", "debit note exceeds eligible paid amount");
      if (!account) importError(errors, n, "Account Name", "choose a valid account");
    }
    const key = norm(billNumber);
    if (seen.has(key)) importError(errors, n, "Bill Number", "duplicate in this Excel file");
    if (existing.some((entry: any) => norm(entry.billNumber) === key)) importError(errors, n, "Bill Number", "already exists");
    seen.add(key);
    return { row, entryType, billNumber, vendor, amount, paidAmount, adjustedAmount, account };
  });
  if (errors.length) return s.status(400).json({ error: errors.join("\n") });
  await db.transaction(async (tx) => {
    for (const item of prepared) {
      const covered = m(item.paidAmount + item.adjustedAmount);
      const [created] = await tx.insert(accountsPayableTable).values({ organizationId: r.acc.org, vendorId: item.vendor.id, vendorName: item.vendor.name, billNumber: item.billNumber, againstBillNumber: item.entryType === "Debit Note" ? String(item.row.againstBillNumber || "").trim() : "", billDate: item.row.billDate, dueDate: item.row.dueDate, amount: item.amount, paidAmount: item.paidAmount, adjustedAmount: item.adjustedAmount, status: item.entryType === "Debit Note" ? "Paid" : covered >= item.amount ? "Paid" : covered > 0 ? "Partial" : "Pending", approvalStatus: "Approved", requiredApprovals: Math.max(1, Number(process.env.LEDGER_AP_REQUIRED_APPROVALS ?? 1)), entryType: item.entryType, notes: String(item.row.notes || ""), coaAccountId: item.account ? Number(item.account.id) : null, sourceType: "Manual", sourceId: null }).returning();
      if (item.entryType === "Debit Note") {
        const payable = accounts.find((account: any) => account.accountCode === "2100");
        const linkedBill = existing.find((entry: any) => entry.entryType !== "Debit Note" && norm(entry.billNumber) === norm(item.row.againstBillNumber) && Number(entry.vendorId || item.vendor.id) === Number(item.vendor.id));
        if (!payable || !item.account || !linkedBill) throw Error("Debit note posting accounts or linked bill are missing");
        const journal = await insertImportJournal(tx, r.acc.org, { entryDate: created.billDate || day(), reference: created.billNumber, description: `Debit note ${created.billNumber}`, sourceType: "Debit Note", sourceId: created.id, lines: [{ accountId: payable.id, debit: m(created.amount), memo: created.billNumber }, { accountId: item.account.id, credit: m(created.amount), memo: created.billNumber }] }, r.acc.user.id);
        const adjustedAmount = m(m(linkedBill.adjustedAmount) + m(created.amount));
        const billStatus = m(linkedBill.paidAmount) + adjustedAmount >= m(linkedBill.amount) - 0.009 ? "Paid" : "Partial";
        await tx.update(accountsPayableTable).set({ adjustedAmount, status: billStatus }).where(eq(accountsPayableTable.id, linkedBill.id));
        await tx.update(accountsPayableTable).set({ journalEntryId: journal.id, appliedAmount: m(created.amount), availableCredit: 0 }).where(eq(accountsPayableTable.id, created.id));
      }
    }
  });
  s.status(201).json({ created: rows.length });
});
router.post("/ar/import", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.accounts_receivable.import")) return;
  const rows = importRows(r.body);
  if (!rows.length) return s.status(400).json({ error: "No import rows found" });
  if (rows.length > ACCOUNT_IMPORT_LIMIT) return s.status(400).json({ error: `Maximum ${ACCOUNT_IMPORT_LIMIT} rows can be imported at once` });
  const errors: string[] = [];
  const clients = await contactsFor("client");
  const accounts = (await coa(r.acc.org)).filter((account: any) => account.isActive !== false);
  const existing = await db.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.organizationId, r.acc.org));
  const seen = new Set<string>();
  const prepared = rows.map((row: any, i: number) => {
    const n = rowNo(row, i);
    const entryType = String(row.entryType || "Invoice").trim();
    const invoiceNumber = String(row.invoiceNumber || "").trim();
    const client = clients.find((item: any) => norm(item.id) === norm(row.customer) || norm(item.name) === norm(row.customer) || norm(contactOptionLabel(item)) === norm(row.customer));
    const amount = m(row.amount);
    const receivedAmount = entryType === "Credit Note" ? amount : m(row.receivedAmount);
    const adjustedAmount = entryType === "Credit Note" ? 0 : m(row.adjustedAmount);
    const account = resolveAccountOption(accounts, row.accountName);
    if (!["Invoice", "Credit Note"].includes(entryType)) importError(errors, n, "Entry Type", "must be Invoice or Credit Note");
    if (!client) importError(errors, n, "Customer", "choose a valid CRM Client");
    if (!invoiceNumber) importError(errors, n, "Invoice Number", "is required");
    if (!exactDate(row.invoiceDate)) importError(errors, n, "Invoice Date", "must use YYYY-MM-DD");
    if (!exactDate(row.dueDate)) importError(errors, n, "Due Date", "must use YYYY-MM-DD");
    if (!(amount > 0)) importError(errors, n, "Amount", "must be greater than zero");
    if (receivedAmount < 0 || adjustedAmount < 0) importError(errors, n, "Received/Adjusted Amount", "cannot be negative");
    if (receivedAmount + adjustedAmount > amount + 0.009) importError(errors, n, "Received/Adjusted Amount", "cannot exceed Amount");
    if (entryType === "Credit Note") {
      const linked = existing.find((entry: any) => entry.entryType !== "Credit Note" && norm(entry.invoiceNumber) === norm(row.linkedInvoiceNumber) && (!client || Number(entry.clientId || client.id) === Number(client.id)));
      const received = m(linked?.receivedAmount);
      const linkedStatus = String(linked?.status || "").toLowerCase();
      if (!String(row.linkedInvoiceNumber || "").trim()) importError(errors, n, "Linked Invoice", "is required");
      if (!linked) importError(errors, n, "Linked Invoice", "linked customer invoice was not found");
      else if (!received && !["received", "partial", "paid"].includes(linkedStatus)) importError(errors, n, "Linked Invoice", "only paid or partial invoices can be linked");
      else if (amount > (received >= m(linked.amount) - 0.009 ? m(linked.amount) : received) + 0.009) importError(errors, n, "Amount", "credit note exceeds eligible received amount");
      if (!account) importError(errors, n, "Account Name", "choose a valid account");
    }
    const key = norm(invoiceNumber);
    if (seen.has(key)) importError(errors, n, "Invoice Number", "duplicate in this Excel file");
    if (existing.some((entry: any) => norm(entry.entryType === "Credit Note" ? entry.creditNoteNumber || entry.invoiceNumber : entry.invoiceNumber) === key)) importError(errors, n, "Invoice Number", "already exists");
    seen.add(key);
    return { row, entryType, invoiceNumber, client, amount, receivedAmount, adjustedAmount, account };
  });
  if (errors.length) return s.status(400).json({ error: errors.join("\n") });
  await db.transaction(async (tx) => {
    for (const item of prepared) {
      const covered = m(item.receivedAmount + item.adjustedAmount);
      const [created] = await tx.insert(accountsReceivableTable).values({ organizationId: r.acc.org, clientId: item.client.id, clientName: item.client.name, invoiceNumber: item.invoiceNumber, creditNoteNumber: item.entryType === "Credit Note" ? item.invoiceNumber : "", linkedInvoiceNumber: item.entryType === "Credit Note" ? String(item.row.linkedInvoiceNumber || "").trim() : "", invoiceDate: item.row.invoiceDate, dueDate: item.row.dueDate, amount: item.amount, receivedAmount: item.receivedAmount, adjustedAmount: item.adjustedAmount, status: item.entryType === "Credit Note" ? "Received" : covered >= item.amount ? "Received" : covered > 0 ? "Partial" : "Pending", approvalStatus: "Approved", requiredApprovals: Math.max(1, Number(process.env.LEDGER_AR_REQUIRED_APPROVALS ?? 1)), entryType: item.entryType, notes: String(item.row.notes || ""), coaAccountId: item.account ? Number(item.account.id) : null, sourceType: "Manual", sourceId: null }).returning();
      if (item.entryType === "Credit Note") {
        const creditNote = accounts.find((account: any) => account.accountCode === "1200");
        const linked = existing.find((entry: any) => entry.entryType !== "Credit Note" && norm(entry.invoiceNumber) === norm(item.row.linkedInvoiceNumber) && Number(entry.clientId || item.client.id) === Number(item.client.id));
        if (!creditNote || !item.account || !linked) throw Error("Credit note posting accounts or linked invoice are missing");
        const journal = await insertImportJournal(tx, r.acc.org, { entryDate: created.invoiceDate || day(), reference: created.creditNoteNumber || created.invoiceNumber, description: `Credit note ${created.creditNoteNumber || created.invoiceNumber}`, sourceType: "Credit Note", sourceId: created.id, lines: [{ accountId: item.account.id, debit: m(created.amount), memo: created.creditNoteNumber || created.invoiceNumber }, { accountId: creditNote.id, credit: m(created.amount), memo: created.creditNoteNumber || created.invoiceNumber }] }, r.acc.user.id);
        const adjustedAmount = m(m(linked.adjustedAmount) + m(created.amount));
        const linkedStatus = m(linked.receivedAmount) + adjustedAmount >= m(linked.amount) - 0.009 ? "Received" : "Partial";
        await tx.update(accountsReceivableTable).set({ adjustedAmount, status: linkedStatus }).where(eq(accountsReceivableTable.id, linked.id));
        await tx.update(accountsReceivableTable).set({ journalEntryId: journal.id }).where(eq(accountsReceivableTable.id, created.id));
      }
    }
  });
  s.status(201).json({ created: rows.length });
});
router.get("/bank-cash-accounts", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.bank_cash.view")) return;
  const accounts = await coa(r.acc.org);
  s.json(accounts.filter((account: any) => account.isActive !== false));
});
async function bankCashRows(org: number, query: any = {}) {
  const { bankCashTransactionsTable } = await accountTables();
  const rows = (await db.select().from(bankCashTransactionsTable).where(eq(bankCashTransactionsTable.organizationId, org))).filter(dateRangeFilter(query, "transactionDate"));
  const docs = await documentsFor("bank-cash", rows.map((row: any) => Number(row.id)));
  const [accounts, clients] = await Promise.all([
    db.select().from(chartOfAccountsTable).where(eq(chartOfAccountsTable.organizationId, org)), contactsFor("client"),
  ]);
  const byId = (id: any) => accounts.find((account: any) => Number(account.id) === Number(id));
  return rows.map((row: any) => {
    const account = byId(row.bankCashAccountId), counter = byId(row.transferToAccountId || row.counterAccountId);
    const client = clients.find((contact: any) => Number(contact.id) === Number(row.clientId));
    return { ...row, paymentDate: row.transactionDate, accountName: account?.accountName || "", accountDisplay: account ? accountLabel(account) : "",
      counterAccountDisplay: counter ? accountLabel(counter) : "", clientName: client?.name || "", clientDisplay: client ? contactOptionLabel(client) : "",
      paymentMethod: row.paymentMethod || "", period: row.period || "", bankCharges: m(row.bankCharges), transactionFees: m(row.transactionFees),
      notes: row.remarks || "", documents: docs.get(Number(row.id)) || [] };
  }).sort((a: any, b: any) => String(b.transactionDate).localeCompare(String(a.transactionDate)) || Number(b.id) - Number(a.id));
}
router.get("/bank-cash-transactions/options", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.bank_cash.view")) return;
  const accounts = r.query.clientsOnly === "1" ? [] : (await coa(r.acc.org)).filter((account: any) => account.isActive !== false);
  const clients = await contactsFor("client");
  s.json({ accounts: accounts.map((account: any) => ({ id: account.id, accountCode: account.accountCode, accountName: account.accountName, accountType: account.accountType, isActive: account.isActive, isBankCash: account.isBankCash })),
    clients: clients.map((client: any) => ({ id: client.id, name: client.name, displayName: contactLabel(client) })), paymentMethods });
});
router.get("/bank-cash-transactions", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.bank_cash.view")) return;
  try {
    s.json(await bankCashRows(r.acc.org, r.query));
  } catch (error: any) {
    s.status(error?.status || 500).json({ error: error?.message || "Failed to load bank and cash transactions" });
  }
});
async function createBankCash(r: any, s: any, source: "bank-cash" | "opening-balance") {
  const accounts = await coa(r.acc.org);
  let input: ReturnType<typeof prepareBankCash>;
  try { input = prepareBankCash(r.body, accounts, await contactsFor("client"), day()); }
  catch (error: any) { return s.status(400).json({ error: error.message }); }
  const isOpening = source === "opening-balance";
  const { bankCashTransactionsTable } = await accountTables();
  const [row] = await db.insert(bankCashTransactionsTable).values({
    ...input,
    organizationId: r.acc.org,
    transactionTypeId: r.body.transactionTypeId || null,
    transactionTypeName: isOpening ? "Opening Balance" : String(r.body.transactionTypeName || r.body.typeName || "Bank/Cash Transaction"),
    mode: isOpening ? "Credit" : input.mode,
    reference: input.reference || await nextReference(r.acc.org, isOpening ? "OB" : "BC"),
    createdByUserId: Number(r.acc.user.id),
  }).returning();
  if (r.body.document) await saveAccountDocument(r.acc.org, Number(r.acc.user.id), "bank-cash", Number(row.id), r.body.document);
  s.status(201).json({ ...row, documents: (await documentsFor("bank-cash", [Number(row.id)])).get(Number(row.id)) || [] });
}
/* DISABLED: Opening Balances is handled through Bank & Cash; keep implementation available without exposing a separate submodule route.
router.post("/opening-balances", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.opening_balances.create")) return;
  return createBankCash(r, s, "opening-balance");
});
*/
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
  const cash = accounts.find((a: any) => a.accountCode === "1030"), capital = accounts.find((a: any) => a.accountCode === "3000"), miscExpense = accounts.find((a: any) => a.accountCode === "5160");
  if (!bank || bank.isActive === false || (entry.counterAccountId && (!counter || counter.isActive === false)) || (entry.transferToAccountId && (!transferTo || transferTo.isActive === false)))
    return s.status(400).json({ error: "Choose valid active transaction accounts before approval" });
  const mode = String(entry.mode || "Credit").toLowerCase();
  const typeName = String(entry.transactionTypeName || "").toLowerCase();
  let lines: any[] = [];
  let voucherType = entry.transactionTypeName === "Opening Balance" ? "Opening Balance" : mode === "transfer" ? "Contra" : mode === "debit" ? "Payment" : "Receipt";
  if (mode === "transfer") {
    if (!transferTo) return s.status(400).json({ error: "Transfer destination account is missing" });
    lines = [{ accountId: transferTo.id, debit: m(entry.amount) }, { accountId: bank.id, credit: m(entry.amount) }];
  } else if (mode === "debit") {
    const debitAccount = counter || miscExpense;
    if (!debitAccount) return s.status(400).json({ error: "Debit counter account is missing" });
    lines = [{ accountId: debitAccount.id, debit: m(entry.amount) }, { accountId: bank.id, credit: m(entry.amount) }];
  } else {
    const creditAccount = entry.transactionTypeName === "Opening Balance" ? (bank.accountType === "Asset" || bank.accountType === "Expense" ? capital : bank) : counter || capital;
    const debitAccount = entry.transactionTypeName === "Opening Balance" && creditAccount?.id === bank.id ? cash : bank;
    if (!creditAccount || !debitAccount) return s.status(400).json({ error: "Opening balance counter account is missing" });
    lines = [{ accountId: debitAccount.id, debit: m(entry.amount) }, { accountId: creditAccount.id, credit: m(entry.amount) }];
  }
  try { lines = addBankChargeLines(lines, entry, accounts); }
  catch (error: any) { return s.status(400).json({ error: error.message }); }
  const journal = await post(r.acc.org, {
    entryDate: entry.transactionDate,
    reference: `AUTO:BANKCASH:${r.acc.org}:${entry.id}`,
    description: `${entry.transactionTypeName} - ${bank.accountName}`,
    sourceType: "Bank Cash Transaction",
    sourceId: entry.id,
    voucherType,
    tallyVoucherType: voucherType === "Opening Balance" ? "Journal" : voucherType,
    metadata: { bankCashTransactionId: entry.id, mode: entry.mode, documentReference: entry.reference,
      clientId: entry.clientId, paymentMethod: entry.paymentMethod || "", notes: entry.remarks || "",
      period: entry.period || "", bankCharges: m(entry.bankCharges), transactionFees: m(entry.transactionFees) },
    lines,
  }, Number(r.acc.user.id));
  const [updated] = await db.update(bankCashTransactionsTable).set({ status: "Approved", approvalStatus: "Approved", approvalLevel: nextLevel, approvedByUserIds: JSON.stringify(nextApprovers), approvalRemarks: String(r.body.remarks || ""), journalEntryId: journal.id, updatedAt: new Date() }).where(eq(bankCashTransactionsTable.id, entry.id)).returning();
  await db.update(accountDocumentsTable).set({ journalEntryId: journal.id }).where(and(eq(accountDocumentsTable.sourceType, "bank-cash"), eq(accountDocumentsTable.sourceId, entry.id)));
  return s.json(updated);
}
router.post("/bank-cash-transactions/:id/approve", approveBankCash);
// DISABLED: Opening Balances approval uses Bank & Cash routes now.
async function rejectBankCash(r: any, s: any) {
  if (!need(r, s, "accounts.bank_cash.reject")) return;
  const remarks = String(r.body.remarks || "").trim();
  if (!remarks) return s.status(400).json({ error: "Rejection remarks are required" });
  const { bankCashTransactionsTable } = await accountTables();
  const filter = and(eq(bankCashTransactionsTable.organizationId, r.acc.org), eq(bankCashTransactionsTable.id, Number(r.params.id)));
  const [entry] = await db.select().from(bankCashTransactionsTable).where(filter).limit(1);
  if (!entry) return s.status(404).json({ error: "Bank/cash transaction not found" });
  if (entry.approvalStatus === "Approved") return s.status(409).json({ error: "Approved transaction cannot be rejected" });
  if (entry.approvalStatus === "Rejected") return s.json(entry);
  const [updated] = await db.update(bankCashTransactionsTable).set({ status: "Rejected", approvalStatus: "Rejected", rejectedByUserId: Number(r.acc.user.id), rejectedAt: new Date(), rejectionRemarks: remarks, updatedAt: new Date() }).where(filter).returning();
  if (!updated) return s.status(404).json({ error: "Bank/cash transaction not found" });
  s.json(updated);
}
router.post("/bank-cash-transactions/:id/reject", rejectBankCash);
// DISABLED: Opening Balances rejection uses Bank & Cash routes now.
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
router.get("/payment-accounts", async (r: any, s): Promise<any> => {
  if (
    !can(r, "accounts.accounts_receivable.edit") &&
    !can(r, "accounts.accounts_payable.edit")
  )
    return s.status(403).json({ error: "Missing payment permission" });
  s.json((await coa(r.acc.org)).filter((account: any) => account.isActive !== false));
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
  try {
    const existing = await coa(r.acc.org);
    const input = accountInput(r.body, existing);
    const openingBalance = m(r.body.openingBalance ?? r.body.currentBalance ?? 0);
    const [x] = await db
      .insert(chartOfAccountsTable)
      .values({
        organizationId: r.acc.org,
        ...input,
        currentBalance: openingBalance,
        openingBalance,
        groupName: input.accountType,
        tallyLedgerName: input.accountName,
        tallyGroupName: input.accountType,
        description: String(r.body.description || ""),
        isActive: r.body.isActive !== false,
      })
      .returning();
    s.status(201).json(x);
  } catch (e: any) {
    s.status(409).json({ error: e.message || "Unable to create account" });
  }
});
router.patch("/coa/:id", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.chart_of_accounts.edit")) return;
  try {
    const id = Number(r.params.id);
    const existing = await coa(r.acc.org);
    const current = existing.find((account: any) => Number(account.id) === id);
    if (!current) return s.status(404).json({ error: "Account not found" });
    if (await accountHasTransactions(r.acc.org, id))
      return s.status(409).json({ error: "This ledger account already has transactions and cannot be edited." });
    const input = accountInput({ ...current, ...r.body }, existing, id);
    const openingBalance = m(r.body.openingBalance ?? r.body.currentBalance ?? current.openingBalance ?? current.currentBalance ?? 0);
    const updates: any = {
      ...input,
      groupName: input.accountType,
      tallyLedgerName: String(r.body.tallyLedgerName || input.accountName),
      tallyGroupName: input.accountType,
      description: String(r.body.description ?? current.description ?? ""),
      openingBalance,
      currentBalance: openingBalance,
      isActive: r.body.isActive !== false,
    };
    const [x] = await db
      .update(chartOfAccountsTable)
      .set(updates)
      .where(and(eq(chartOfAccountsTable.organizationId, r.acc.org), eq(chartOfAccountsTable.id, id)))
      .returning();
    await db.update(journalLinesTable).set({ accountCode: x.accountCode, accountName: x.accountName }).where(eq(journalLinesTable.accountId, id));
    s.json(x);
  } catch (e: any) {
    s.status(409).json({ error: e.message || "Unable to update account" });
  }
});
router.delete("/coa/:id", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.chart_of_accounts.delete")) return;
  const id = Number(r.params.id);
  const [account] = await db.select().from(chartOfAccountsTable).where(and(eq(chartOfAccountsTable.organizationId, r.acc.org), eq(chartOfAccountsTable.id, id))).limit(1);
  if (!account) return s.status(404).json({ error: "Account not found" });
  if (isSystemAccountRow(account))
    return s.status(409).json({ error: "Required system accounts cannot be deleted" });
  if ((await db.select().from(journalLinesTable).where(eq(journalLinesTable.accountId, id))).length)
    return s.status(409).json({ error: "Referenced accounts cannot be deleted. Deactivate the account instead." });
  const { bankCashTransactionsTable } = await accountTables();
  const bankRows = await db.select().from(bankCashTransactionsTable).where(eq(bankCashTransactionsTable.organizationId, r.acc.org));
  if (bankRows.some((row: any) => [row.bankCashAccountId, row.transferToAccountId, row.counterAccountId].some((value) => Number(value) === id)))
    return s.status(409).json({ error: "Referenced accounts cannot be deleted. Deactivate the account instead." });
  await db.delete(chartOfAccountsTable).where(eq(chartOfAccountsTable.id, id));
  s.status(204).send();
});
router.get("/journal-entries", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.journal_entries.view")) return;
  try {
    const x = (await db
      .select()
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.organizationId, r.acc.org))
      .orderBy(desc(journalEntriesTable.entryDate))).filter(dateRangeFilter(r.query, "entryDate"));
    s.json(pg(x, r));
  } catch (error: any) {
    s.status(error?.status || 500).json({ error: error?.message || "Failed to load journal entries" });
  }
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
    if (!need(r, s, `${c.k}.view`)) return;
    try {
      const dateField = c.p === "ap" ? "billDate" : "invoiceDate";
      const search = norm(r.query.search || "");
      let rows = (await db.select().from(c.t).where(eq(c.t.organizationId, r.acc.org)).orderBy(desc(c.t.createdAt))).filter(dateRangeFilter(r.query, dateField));
      if (search) rows = rows.filter((row: any) => [row.invoiceNumber, row.creditNoteNumber, row.linkedInvoiceNumber, row.billNumber, row.againstBillNumber, row.clientName, row.vendorName, row.notes, row.status, row.sourceType].some((value) => norm(value).includes(search)));
      const enriched = c.p === "ap" ? await enrichPayables(rows as any[]) : await enrichReceivables(rows as any[]);
      if (c.p === "ar") {
        const [journals, accounts] = await Promise.all([
          db.select().from(journalEntriesTable).where(eq(journalEntriesTable.organizationId, r.acc.org)),
          db.select().from(chartOfAccountsTable).where(eq(chartOfAccountsTable.organizationId, r.acc.org)),
        ]);
        for (const row of enriched as any[]) {
          if (row.sourceType === "Sales Invoice") continue;
          row.paymentHistory = journals.filter((journal: any) =>
            (journal.sourceType === "Manual AR Receipt" && Number(journal.metadata?.arId) === Number(row.id)) ||
            (journal.sourceType === "Customer Payment" && String(journal.reference).startsWith("AUTO:AR:PAYMENT:") && Number(journal.sourceId) === Number(row.id)),
          ).map((journal: any) => {
            const metadata = journal.metadata || {};
            return { id: journal.id, paymentDate: journal.entryDate, clientName: row.clientName,
              accountName: accounts.find((account: any) => Number(account.id) === Number(metadata.settlementAccountId))?.accountName || "",
              paymentMethod: metadata.paymentMethod || "", mode: "Credit", amount: m(metadata.amount ?? journal.totalCredit),
              reference: metadata.documentReference ?? row.invoiceNumber, notes: metadata.notes || "",
              period: metadata.period || "", bankCharges: m(metadata.bankCharges), transactionFees: m(metadata.transactionFees) };
          }).sort((a: any, b: any) => b.paymentDate.localeCompare(a.paymentDate) || b.id - a.id);
        }
      }
      s.json(pg(enriched.map((row: any) => serializeMoneyFields(row)), r));
    } catch (error: any) {
      s.status(error?.status || 500).json({ error: error?.message || `Failed to load ${c.p.toUpperCase()} entries` });
    }
  });
  router.post(`/${c.p}`, async (r: any, s): Promise<any> => {
    if (!need(r, s, `${c.k}.create`)) return;
    const amount = m(r.body.amount);
    if (amount <= 0) return s.status(400).json({ error: "Amount must be positive" });
    if (c.p === "ap") {
      if (!r.body.vendorId && !String(r.body.vendorName || "").trim()) return s.status(400).json({ error: "Vendor is required" });
      const vendor = await resolveContact("vendor", r.body.vendorId, r.body.vendorName);
      if (!vendor) return s.status(400).json({ error: "Choose a valid CRM Vendor" });
      r.body.vendorId = vendor.id;
      r.body.vendorName = vendor.name;
      if (!String(r.body.billNumber || "").trim() && r.body.sourceType !== "Purchase Invoice") r.body.billNumber = await nextReference(r.acc.org, r.body.entryType === "Debit Note" ? "DN" : "PAY");
      if (!String(r.body.billDate || "").trim() && r.body.sourceType !== "Purchase Invoice") return s.status(400).json({ error: "Bill date is required" });
      if (!String(r.body.dueDate || "").trim() && r.body.sourceType !== "Purchase Invoice") return s.status(400).json({ error: "Due date is required" });
      const existing = await db.select().from(accountsPayableTable).where(eq(accountsPayableTable.organizationId, r.acc.org));
      if (r.body.sourceType === "Purchase Invoice" && r.body.sourceId) {
        const [invoice] = await db.select().from(purchaseInvoicesTable).where(and(eq(purchaseInvoicesTable.organizationId, r.acc.org), eq(purchaseInvoicesTable.id, Number(r.body.sourceId)))).limit(1);
        if (!invoice) return s.status(400).json({ error: "Purchase invoice was not found" });
        if (Number(invoice.vendorId) !== Number(vendor.id)) return s.status(400).json({ error: "Purchase invoice does not belong to the selected vendor" });
        if (!["2-Way Match", "3-Way Match", "Matched"].includes(String(invoice.matchStatus || ""))) return s.status(400).json({ error: "Only matched purchase invoices can be linked to Payables" });
        if (["Paid", "Cancelled", "Rejected"].includes(String(invoice.status || ""))) return s.status(400).json({ error: "Only unpaid or partially paid purchase invoices can be linked" });
        if (existing.some((entry: any) => entry.sourceType === "Purchase Invoice" && Number(entry.sourceId) === Number(invoice.id))) return s.status(409).json({ error: "This purchase invoice is already linked to Payables" });
        r.body.billNumber = invoice.invoiceNumber;
        r.body.billDate = invoice.invoiceDate;
        r.body.dueDate = invoice.dueDate || invoice.invoiceDate;
        r.body.amount = m(invoice.amount);
      }
      if (existing.some((entry: any) => String(entry.billNumber).trim().toLowerCase() === String(r.body.billNumber).trim().toLowerCase())) return s.status(409).json({ error: "Bill or debit-note number already exists" });
      if (r.body.entryType === "Debit Note") {
        if (!Number(r.body.coaAccountId)) return s.status(400).json({ error: "Account Name is required" });
        const linkedBill = existing.find((entry: any) => entry.entryType !== "Debit Note" && String(entry.billNumber).trim().toLowerCase() === String(r.body.againstBillNumber).trim().toLowerCase() && Number(entry.vendorId || vendor.id) === Number(vendor.id));
        if (!linkedBill) return s.status(400).json({ error: "Linked vendor bill was not found" });
        const billPaid = m(linkedBill.paidAmount);
        const linkedBillStatus = String(linkedBill.status || "").toLowerCase();
        if (!billPaid && !["paid", "partial"].includes(linkedBillStatus)) return s.status(400).json({ error: "Only paid or partial bills can be linked" });
        const maximumDebitNote = billPaid >= m(linkedBill.amount) - 0.009 ? m(linkedBill.amount) : billPaid;
        if (amount > maximumDebitNote + 0.009) return s.status(400).json({ error: `Debit note cannot exceed ${maximumDebitNote}` });
        r.body.paidAmount = amount;
        r.body.adjustedAmount = 0;
      }
    }
    if (c.p === "ar") {
      const client = await resolveContact("client", r.body.clientId, r.body.clientName);
      if (!client) return s.status(400).json({ error: "Choose a valid CRM Client" });
      r.body.clientId = client.id;
      r.body.clientName = client.name;
      const existing = await db.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.organizationId, r.acc.org));
      if (r.body.sourceType === "Sales Invoice" && r.body.sourceId) {
        const [invoice] = await db.select().from(salesInvoicesTable).where(eq(salesInvoicesTable.id, Number(r.body.sourceId))).limit(1);
        if (!invoice) return s.status(400).json({ error: "Sales invoice was not found" });
        if (Number(invoice.clientId) !== Number(client.id)) return s.status(400).json({ error: "Sales invoice does not belong to the selected client" });
        if (!["Approved", "Paid"].includes(String(invoice.status || ""))) return s.status(400).json({ error: "Only approved sales invoices can be linked to Receivables" });
        if (["Paid", "Settled", "Cancelled", "Rejected"].includes(String(invoice.paymentStatus || invoice.status || ""))) return s.status(400).json({ error: "Only unpaid or partially paid sales invoices can be linked" });
        if (existing.some((entry: any) => entry.sourceType === "Sales Invoice" && Number(entry.sourceId) === Number(invoice.id))) return s.status(409).json({ error: "This sales invoice is already linked to Receivables" });
        r.body.invoiceNumber = invoice.invoiceNumber;
        r.body.invoiceDate = invoice.invoiceDate;
        r.body.dueDate = invoice.dueDate || invoice.invoiceDate;
        r.body.amount = m(invoice.grandTotal);
        r.body.receivedAmount = m(invoice.amountPaid);
      }
      if (!String(r.body.invoiceNumber || r.body.creditNoteNumber || "").trim()) r.body.invoiceNumber = await nextReference(r.acc.org, r.body.entryType === "Credit Note" ? "CN" : "REC");
      if (r.body.entryType === "Credit Note" && !String(r.body.creditNoteNumber || "").trim()) r.body.creditNoteNumber = r.body.invoiceNumber;
      const reference = String(r.body.entryType === "Credit Note" ? r.body.creditNoteNumber || r.body.invoiceNumber : r.body.invoiceNumber).trim().toLowerCase();
      if (!reference) return s.status(400).json({ error: "Invoice or credit-note reference is required" });
      if (existing.some((entry: any) => String(entry.entryType === "Credit Note" ? entry.creditNoteNumber || entry.invoiceNumber : entry.invoiceNumber).trim().toLowerCase() === reference)) return s.status(409).json({ error: "Invoice or credit-note reference already exists" });
      if (r.body.entryType === "Credit Note") {
        if (!Number(r.body.coaAccountId)) return s.status(400).json({ error: "Account Name is required" });
        const linked = existing.find((entry: any) => entry.entryType !== "Credit Note" && String(entry.invoiceNumber).trim().toLowerCase() === String(r.body.linkedInvoiceNumber).trim().toLowerCase() && Number(entry.clientId || client.id) === Number(client.id));
        if (!linked) return s.status(400).json({ error: "Linked customer invoice was not found" });
        const received = m(linked.receivedAmount);
        const linkedStatus = String(linked.status || "").toLowerCase();
        if (!received && !["received", "partial", "paid"].includes(linkedStatus)) return s.status(400).json({ error: "Only paid or partial invoices can be linked" });
        const eligible = received >= m(linked.amount) - 0.009 ? m(linked.amount) : received;
        if (amount > eligible + 0.009) return s.status(400).json({ error: `Credit note cannot exceed ${eligible}` });
        r.body.receivedAmount = amount;
        r.body.adjustedAmount = 0;
      } else {
        r.body.receivedAmount = m(r.body.receivedAmount);
        r.body.adjustedAmount = m(r.body.adjustedAmount);
      }
    }
    const covered = m(r.body[c.paid]) + m(r.body.adjustedAmount);
    const [x] = await db.insert(c.t).values({
      ...r.body,
      organizationId: r.acc.org,
      amount: m(r.body.amount),
      approvalStatus: r.body.approvalStatus || "Approved",
      requiredApprovals: Math.max(1, Number(process.env[c.p === "ap" ? "LEDGER_AP_REQUIRED_APPROVALS" : "LEDGER_AR_REQUIRED_APPROVALS"] ?? 1)),
      status: c.p === "ap" && r.body.entryType === "Debit Note" ? "Paid" : c.p === "ar" && r.body.entryType === "Credit Note" ? "Received" : covered >= m(r.body.amount) ? c.done : covered > 0 ? "Partial" : "Pending",
    }).returning();
    if (c.p === "ap" && x.entryType === "Debit Note") {
      const accounts = await coa(r.acc.org);
      const payable = accounts.find((account: any) => account.accountCode === "2100");
      const selected = accounts.find((account: any) => Number(account.id) === Number(x.coaAccountId));
      if (!payable || !selected) return s.status(409).json({ error: "Required payable or selected COA account is not configured" });
      const journal = await post(r.acc.org, { entryDate: x.billDate || day(), reference: x.billNumber, description: `Debit note ${x.billNumber}`, sourceType: "Debit Note", sourceId: x.id, lines: [{ accountId: payable.id, debit: m(x.amount), memo: x.billNumber }, { accountId: selected.id, credit: m(x.amount), memo: x.billNumber }] }, r.acc.user.id);
      const [linkedBill] = await db.select().from(accountsPayableTable).where(and(eq(accountsPayableTable.organizationId, r.acc.org), eq(accountsPayableTable.billNumber, x.againstBillNumber))).limit(1);
      if (linkedBill) {
        const adjustedAmount = m(m(linkedBill.adjustedAmount) + m(x.amount));
        const billStatus = m(linkedBill.paidAmount) + adjustedAmount >= m(linkedBill.amount) - 0.009 ? "Paid" : "Partial";
        await db.update(accountsPayableTable).set({ adjustedAmount, status: billStatus }).where(eq(accountsPayableTable.id, linkedBill.id));
      }
      const [updated] = await db.update(accountsPayableTable).set({ journalEntryId: journal.id, appliedAmount: m(x.amount), availableCredit: 0 }).where(eq(accountsPayableTable.id, x.id)).returning();
      return s.status(201).json(updated);
    }
    if (c.p === "ar" && x.entryType === "Credit Note") {
      const accounts = await coa(r.acc.org);
      const selected = accounts.find((account: any) => Number(account.id) === Number(x.coaAccountId));
      const creditNote = accounts.find((account: any) => account.accountCode === "1200");
      if (!selected || !creditNote) return s.status(409).json({ error: "Required credit-note or selected COA account is not configured" });
      const journal = await post(r.acc.org, { entryDate: x.invoiceDate || day(), reference: x.creditNoteNumber || x.invoiceNumber, description: `Credit note ${x.creditNoteNumber || x.invoiceNumber}`, sourceType: "Credit Note", sourceId: x.id, lines: [{ accountId: selected.id, debit: m(x.amount), memo: x.creditNoteNumber || x.invoiceNumber }, { accountId: creditNote.id, credit: m(x.amount), memo: x.creditNoteNumber || x.invoiceNumber }] }, r.acc.user.id);
      const [linked] = await db.select().from(accountsReceivableTable).where(and(eq(accountsReceivableTable.organizationId, r.acc.org), eq(accountsReceivableTable.invoiceNumber, x.linkedInvoiceNumber))).limit(1);
      if (linked) {
        const adjustedAmount = m(m(linked.adjustedAmount) + m(x.amount));
        const linkedStatus = m(linked.receivedAmount) + adjustedAmount >= m(linked.amount) - 0.009 ? "Received" : "Partial";
        await db.update(accountsReceivableTable).set({ adjustedAmount, status: linkedStatus }).where(eq(accountsReceivableTable.id, linked.id));
      }
      const [updated] = await db.update(accountsReceivableTable).set({ journalEntryId: journal.id }).where(eq(accountsReceivableTable.id, x.id)).returning();
      return s.status(201).json(updated);
    }
    s.status(201).json(x);
  });
  router.patch(`/${c.p}/:id`, async (r: any, s): Promise<any> => {
    if (!need(r, s, `${c.k}.edit`)) return;
    if (c.p === "ap" && r.body.paidAmount !== undefined) return s.status(400).json({ error: "Use the approved Record Payment workflow" });
    if (c.p === "ar" && r.body.adjustedAmount !== undefined) return s.status(400).json({ error: "Use the approved credit-note workflow" });
    const [o] = await db.select().from(c.t).where(and(eq(c.t.organizationId, r.acc.org), eq(c.t.id, Number(r.params.id)))).limit(1);
    if (!o) return s.status(404).json({ error: `${c.p.toUpperCase()} entry not found` });
    if (c.p === "ar" && r.body.receivedAmount !== undefined && o.sourceType !== "Manual") return s.status(400).json({ error: "Use Sales Payment for linked sales invoices" });
    if (c.p === "ar" && r.body.receivedAmount !== undefined) r.body.receivedAmount = Math.min(m(o.amount), Math.max(0, m(r.body.receivedAmount)));
    const b = { ...o, ...r.body }, covered = m(b[c.paid]) + m(b.adjustedAmount);
    const [x] = await db.update(c.t).set({ ...r.body, status: covered >= m(b.amount) ? c.done : covered > 0 ? "Partial" : "Pending" }).where(eq(c.t.id, o.id)).returning();
    if (c.p === "ap" && x.entryType !== "Debit Note") {
      const invoices = await db.select().from(purchaseInvoicesTable).where(eq(purchaseInvoicesTable.organizationId, r.acc.org));
      const linkedInvoice = invoices.find((invoice: any) => (x.sourceType === "Purchase Invoice" && Number(x.sourceId) === Number(invoice.id)) || (String(invoice.invoiceNumber).trim().toLowerCase() === String(x.billNumber).trim().toLowerCase() && String(invoice.vendorName).trim().toLowerCase() === String(x.vendorName).trim().toLowerCase()));
      if (linkedInvoice) {
        const invoiceAmount = m(linkedInvoice.amount);
        const invoiceCovered = Math.min(invoiceAmount, m(x.paidAmount) + m(x.adjustedAmount));
        const invoiceStatus = invoiceCovered >= invoiceAmount - 0.005 ? "Paid" : invoiceCovered > 0 ? "Partially Paid" : "Unpaid";
        await db.update(purchaseInvoicesTable).set({ status: invoiceStatus }).where(eq(purchaseInvoicesTable.id, linkedInvoice.id));
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
router.post("/ar/:id/payment", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.accounts_receivable.edit")) return;
  let details: ReturnType<typeof paymentDetails>, amount: number;
  try {
    details = paymentDetails(r.body, day());
    amount = paymentMoney(r.body.amount, "Amount");
  } catch (error: any) { return s.status(400).json({ error: error.message }); }
  const receiptId = String(r.body.receiptId || randomUUID());
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(receiptId)) return s.status(400).json({ error: "Invalid receipt identity" });
  const [entry] = await db.select().from(accountsReceivableTable).where(and(
    eq(accountsReceivableTable.organizationId, r.acc.org),
    eq(accountsReceivableTable.id, Number(r.params.id)),
  )).limit(1);
  if (!entry) return s.status(404).json({ error: "AR entry not found" });
  if (entry.sourceType === "Sales Invoice")
    return s.status(400).json({ error: "Use Sales Payment for linked sales invoices" });
  const tds = m(r.body.tdsAmount);
  const charges = details.bankCharges;
  const net = m(amount - tds - charges);
  if (!(amount > 0)) return s.status(400).json({ error: "Payment must be greater than zero" });
  if (tds < 0 || charges < 0 || net < 0)
    return s.status(400).json({ error: "TDS and bank charges must be manually entered, non-negative, and cannot exceed the payment" });
  const accounts = await coa(r.acc.org);
  const settlementAccount = accounts.find((account: any) =>
    Number(account.id) === Number(r.body.settlementAccountId) && account.isActive !== false);
  const receivableAccount = accounts.find((account: any) => account.accountCode === "1100");
  const tdsAccount = accounts.find((account: any) => account.accountCode === "5160");
  const chargesAccount = accounts.find((account: any) => account.accountCode === "5150");
  if (!settlementAccount)
    return s.status(400).json({ error: "Choose a valid active Chart of Accounts account" });
  if (!receivableAccount || (tds > 0 && !tdsAccount) || (charges > 0 && !chargesAccount))
    return s.status(409).json({ error: "Required receivable, TDS, or bank-charge account is not configured" });
  const reference = `AUTO:AR:RECEIPT:${r.acc.org}:${entry.id}:${receiptId}`;
  try {
    // The receipt journal is its own identity; the AR relationship lives in metadata.
    // Keep the journal and cumulative AR update atomic, including transaction retries.
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(accountsReceivableTable).where(and(eq(accountsReceivableTable.organizationId, r.acc.org), eq(accountsReceivableTable.id, entry.id))).limit(1);
      if (!current) throw new Error("AR entry not found");
      const [existing] = await tx.select().from(journalEntriesTable).where(and(eq(journalEntriesTable.organizationId, r.acc.org), eq(journalEntriesTable.reference, reference))).limit(1);
      const metadata = { arId: current.id, clientId: current.clientId, clientName: current.clientName,
        documentReference: details.reference || current.invoiceNumber, paymentMethod: details.paymentMethod,
        paymentDate: details.transactionDate, notes: details.remarks, period: details.period,
        bankCharges: charges, transactionFees: details.transactionFees, amount, tdsAmount: tds, settlementAccountId: settlementAccount.id };
      if (existing) {
        const stored = existing.metadata as Record<string, unknown>;
        if (["amount", "tdsAmount", "bankCharges", "transactionFees", "settlementAccountId", "documentReference", "paymentMethod", "paymentDate", "notes", "period"].some((key) => String(stored?.[key] ?? "") !== String((metadata as Record<string, unknown>)[key] ?? "")))
          throw Object.assign(new Error("Receipt identity was already used with different payment details"), { status: 409 });
        return { receivable: current, journalEntryId: existing.id, payment: existing.metadata };
      }
      const remaining = Math.max(0, m(current.amount) - m(current.receivedAmount) - m(current.adjustedAmount));
      if (amount > remaining + 0.009) throw new Error("Payment cannot exceed the balance");
      const [journal] = await tx.insert(journalEntriesTable).values({
        organizationId: r.acc.org, entryDate: details.transactionDate, reference,
        description: `Customer payment for ${current.invoiceNumber}`, totalDebit: amount, totalCredit: amount,
        voucherType: "Receipt", tallyVoucherType: "Receipt", sourceType: "Manual AR Receipt", metadata, createdByUserId: r.acc.user.id,
      }).returning();
      await tx.update(journalEntriesTable).set({ sourceId: journal.id }).where(eq(journalEntriesTable.id, journal.id));
      const lines = [
        { accountId: settlementAccount.id, debit: net, credit: 0 },
        { accountId: tdsAccount?.id, debit: tds, credit: 0 },
        { accountId: chargesAccount?.id, debit: charges, credit: 0 },
        { accountId: receivableAccount.id, debit: 0, credit: amount },
      ].filter((line) => line.debit > 0 || line.credit > 0);
      for (const line of lines) {
        const [account] = await tx.select().from(chartOfAccountsTable).where(and(eq(chartOfAccountsTable.organizationId, r.acc.org), eq(chartOfAccountsTable.id, line.accountId!))).limit(1);
        if (!account) throw new Error("Receipt account is missing");
        await tx.insert(journalLinesTable).values({ organizationId: r.acc.org, journalEntryId: journal.id,
          ...line, accountCode: account.accountCode, accountName: account.accountName, memo: metadata.documentReference });
        await tx.update(chartOfAccountsTable).set({ currentBalance: m(m(account.currentBalance) + line.debit - line.credit) }).where(eq(chartOfAccountsTable.id, account.id));
      }
      const receivedAmount = m(m(current.receivedAmount) + amount);
      const [updated] = await tx.update(accountsReceivableTable).set({ receivedAmount,
        status: receivedAmount + m(current.adjustedAmount) >= m(current.amount) - 0.009 ? "Received" : "Partial",
      }).where(eq(accountsReceivableTable.id, current.id)).returning();
      return { receivable: updated, journalEntryId: journal.id, payment: metadata };
    });
    return s.status(201).json(result);
  } catch (error: any) { return s.status(error.status || 400).json({ error: error.message || "Unable to record receipt" }); }
});

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
    const returns = accounts.find((account: any) => account.accountCode === "2200");
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
            accountId: payable?.id,
            debit: m(entry.amount),
          },
          { accountId: returns?.id, credit: m(entry.amount) },
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
            accountId: (await coa(r.acc.org)).find((account: any) => account.accountCode === "1200")?.id,
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
  try {
    const receivableDateRange = dateRangeFilter(r.query, "invoiceDate");
    const partyDateRange = dateRangeFilter(r.query, "entryDate");
    const [receivableRows, partyEntries, payments] = await Promise.all([
      db.select().from(accountsReceivableTable).where(eq(accountsReceivableTable.organizationId, r.acc.org)),
      db.select().from(partyLedgerEntriesTable).where(eq(partyLedgerEntriesTable.organizationId, r.acc.org)),
      db.select().from(salesPaymentsTable),
    ]);
    const receivables = await enrichReceivables((receivableRows as any[]).filter(receivableDateRange));
    const groups = new Map<string, any>();
    const ensureGroup = (row: any) => {
      const key = row.clientId ? `client:${row.clientId}` : `legacy:${norm(row.clientName)}`;
      const group = groups.get(key) || {
        clientId: row.clientId || null,
        clientCode: row.clientCode || "",
        clientName: row.clientName || "Unassigned Customer",
        customerDisplay: row.customerDisplay || row.clientName || "Unassigned Customer",
        invoiced: 0,
        received: 0,
        credited: 0,
        outstanding: 0,
        records: [],
        sources: new Set<string>(),
      };
      groups.set(key, group);
      return group;
    };
    const creditNotes = receivables.filter((row: any) => row.entryType === "Credit Note");
    for (const row of receivables.filter((entry: any) => entry.entryType !== "Credit Note")) {
      const group = ensureGroup(row);
      const invoicePayments = (payments as any[]).filter((payment) => Number(payment.invoiceId) === Number(row.sourceId));
      const credits = creditNotes.filter((credit: any) => norm(credit.linkedInvoiceNumber) === norm(row.invoiceNumber));
      const received = m(row.receivedAmount);
      const credited = m(row.adjustedAmount || credits.reduce((sum: number, credit: any) => sum + m(credit.amount), 0));
      const outstanding = receivableOutstanding(row);
      const latestPaymentDate = invoicePayments.map((payment) => String(payment.paymentDate || "").slice(0, 10)).filter(Boolean).sort().pop() || "";
      group.sources.add("accounts_receivable");
      group.invoiced += m(row.amount);
      group.received += received;
      group.credited += credited;
      group.outstanding += outstanding;
      group.records.push({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate,
        invoicedAmount: m(row.amount),
        receivedAmount: received,
        credits: credited,
        outstanding,
        paidDate: outstanding <= 0 ? latestPaymentDate : received > 0 ? "Partial" : "",
        status: row.status,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        payments: invoicePayments.map((payment) => ({
          id: payment.id,
          paymentDate: payment.paymentDate,
          amount: m(payment.amount),
          reference: payment.reference || payment.paymentNumber || "",
        })),
        creditNotes: credits.map((credit) => ({
          id: credit.id,
          creditNoteNumber: credit.creditNoteNumber || credit.invoiceNumber,
          date: credit.invoiceDate,
          amount: m(credit.amount),
        })),
      });
    }
    for (const credit of creditNotes) {
      const hasInvoice = receivables.some((row: any) => row.entryType !== "Credit Note" && norm(row.invoiceNumber) === norm(credit.linkedInvoiceNumber));
      if (hasInvoice) continue;
      const group = ensureGroup(credit);
      group.sources.add("accounts_receivable");
      group.credited += m(credit.amount);
      group.records.push({
        id: credit.id,
        invoiceNumber: credit.creditNoteNumber || credit.invoiceNumber,
        invoiceDate: credit.invoiceDate,
        invoicedAmount: 0,
        receivedAmount: 0,
        credits: m(credit.amount),
        outstanding: 0,
        paidDate: "",
        status: credit.status,
        sourceType: credit.sourceType,
        sourceId: credit.sourceId,
        creditNotes: [{ id: credit.id, creditNoteNumber: credit.creditNoteNumber || credit.invoiceNumber, date: credit.invoiceDate, amount: m(credit.amount) }],
        payments: [],
      });
    }
    for (const row of (partyEntries as any[]).filter((x) => String(x.partyType || "").toLowerCase() === "customer" && !x.linkedArId && partyDateRange(x))) {
      const group = ensureGroup({ clientId: row.clientId, clientName: row.clientName || "Unassigned Customer" });
      const value = m(row.amount);
      const drCr = String(row.drCr || "").toLowerCase();
      const entryType = String(row.entryType || "").toLowerCase();
      group.sources.add("party_ledger_entries");
      if (drCr === "debit") group.invoiced += value;
      else if (entryType.includes("credit")) group.credited += value;
      else group.received += value;
      group.outstanding = Math.max(0, group.invoiced - group.received - group.credited);
    }
    s.json([...groups.values()].map((row) => ({ ...row, sources: [...row.sources], records: row.records.sort((a: any, b: any) => String(b.invoiceDate).localeCompare(String(a.invoiceDate))) })));
  } catch (error: any) {
    s.status(error?.status || 500).json({ error: error?.message || "Failed to load customer ledger" });
  }
});
router.get("/vendor-ledger", async (r: any, s): Promise<any> => {
  if (!need(r, s, "accounts.vendor_ledger.view")) return;
  try {
    const payableDateRange = dateRangeFilter(r.query, "billDate");
    const partyDateRange = dateRangeFilter(r.query, "entryDate");
    const [payableRows, partyEntries, payments] = await Promise.all([
      db.select().from(accountsPayableTable).where(eq(accountsPayableTable.organizationId, r.acc.org)),
      db.select().from(partyLedgerEntriesTable).where(eq(partyLedgerEntriesTable.organizationId, r.acc.org)),
      db.select().from(vendorPaymentsTable).where(eq(vendorPaymentsTable.organizationId, r.acc.org)),
    ]);
    const payables = await enrichPayables((payableRows as any[]).filter(payableDateRange));
    const groups = new Map<string, any>();
    const ensureGroup = (row: any) => {
      const key = row.vendorId ? `vendor:${row.vendorId}` : `legacy:${norm(row.vendorName)}`;
      const group = groups.get(key) || {
        vendorId: row.vendorId || null,
        vendorCode: row.vendorCode || "",
        vendorName: row.vendorName || "Unassigned Vendor",
        vendorDisplay: row.vendorDisplay || row.vendorName || "Unassigned Vendor",
        billed: 0,
        paid: 0,
        credited: 0,
        outstanding: 0,
        records: [],
        sources: new Set<string>(),
      };
      groups.set(key, group);
      return group;
    };
    const debitNotes = payables.filter((row: any) => row.entryType === "Debit Note");
    for (const row of payables.filter((entry: any) => entry.entryType !== "Debit Note")) {
      const group = ensureGroup(row);
      const billPayments = (payments as any[]).filter((payment) => norm(payment.invoiceReference) === norm(row.billNumber));
      const debits = debitNotes.filter((debit: any) => norm(debit.againstBillNumber) === norm(row.billNumber));
      const paid = m(row.paidAmount);
      const credited = m(row.adjustedAmount || debits.reduce((sum: number, debit: any) => sum + m(debit.amount), 0));
      const outstanding = payableOutstanding(row);
      const latestPaymentDate = billPayments.map((payment) => String(payment.paymentDate || "").slice(0, 10)).filter(Boolean).sort().pop() || "";
      group.sources.add("accounts_payable");
      group.billed += m(row.amount);
      group.paid += paid;
      group.credited += credited;
      group.outstanding += outstanding;
      group.records.push({
        id: row.id,
        billNumber: row.billNumber,
        billedDate: row.billDate,
        billedAmount: m(row.amount),
        paidAmount: paid,
        debitNote: credited,
        outstanding,
        paidDate: outstanding <= 0 ? latestPaymentDate : paid > 0 ? "Partial" : "",
        status: row.status,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        payments: billPayments.map((payment) => ({
          id: payment.id,
          paymentDate: payment.paymentDate,
          amount: m(payment.amount),
          reference: payment.transactionReference || payment.paymentNumber || "",
        })),
        debitNotes: debits.map((debit) => ({
          id: debit.id,
          debitNoteNumber: debit.billNumber,
          date: debit.billDate,
          amount: m(debit.amount),
        })),
      });
    }
    for (const debit of debitNotes) {
      const hasBill = payables.some((row: any) => row.entryType !== "Debit Note" && norm(row.billNumber) === norm(debit.againstBillNumber));
      if (hasBill) continue;
      const group = ensureGroup(debit);
      group.sources.add("accounts_payable");
      group.credited += m(debit.amount);
      group.records.push({
        id: debit.id,
        billNumber: debit.billNumber,
        billedDate: debit.billDate,
        billedAmount: 0,
        paidAmount: 0,
        debitNote: m(debit.amount),
        outstanding: 0,
        paidDate: "",
        status: debit.status,
        sourceType: debit.sourceType,
        sourceId: debit.sourceId,
        debitNotes: [{ id: debit.id, debitNoteNumber: debit.billNumber, date: debit.billDate, amount: m(debit.amount) }],
        payments: [],
      });
    }
    for (const row of (partyEntries as any[]).filter((x) => String(x.partyType || "").toLowerCase() === "vendor" && !x.linkedApId && partyDateRange(x))) {
      const group = ensureGroup({ vendorId: row.vendorId, vendorName: row.vendorName || "Unassigned Vendor" });
      const value = m(row.amount);
      const drCr = String(row.drCr || "").toLowerCase();
      const entryType = String(row.entryType || "").toLowerCase();
      group.sources.add("party_ledger_entries");
      if (drCr === "credit") group.billed += value;
      else if (entryType.includes("debit") || entryType.includes("credit")) group.credited += value;
      else group.paid += value;
      group.outstanding = Math.max(0, group.billed - group.paid - group.credited);
    }
    s.json([...groups.values()].map((row) => ({ ...row, sources: [...row.sources], records: row.records.sort((a: any, b: any) => String(b.billedDate).localeCompare(String(a.billedDate))) })));
  } catch (error: any) {
    s.status(error?.status || 500).json({ error: error?.message || "Failed to load vendor ledger" });
  }
});
router.get("/business-dashboard", async (r: any, s): Promise<any> => {
  if (need(r, s, "accounts.finance_dashboard.view"))
    s.redirect(307, "./dashboard-summary");
});
export { post as postJournal, coa as ensureCanonicalAccounts, reverseJournal };
export default router;






