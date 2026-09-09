import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const routePath = new URL("../src/routes/accounts.ts", import.meta.url);
const source = await readFile(routePath, "utf8");
const tableNames = [...new Set(source.match(/\b\w+Table\b/g))];
const dbModule = `export const db = __testDb.db;
${tableNames.map((name) => `export const ${name} = __testDb.table('${name}');`).join("\n")}
export const eq = (field, value) => row => String(row[field.name]) === String(value);
export const and = (...conditions) => row => conditions.every(condition => condition(row));
export const asc = field => ({field, direction: 1});
export const desc = field => ({field, direction: -1});
export const syncTableCustomIndexes = async () => {};`;

const bundled = await build({
  stdin: {
    contents: source + "\nexport { decorateHistoryLines };",
    resolveDir: fileURLToPath(new URL("../src/routes", import.meta.url)),
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  packages: "external",
  plugins: [{
    name: "isolated-accounts",
    setup(builder) {
      builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "test" }));
      builder.onResolve({ filter: /\/lib\/(access|procurementAutomation|uploadStorage)$/ }, (args) => ({ path: args.path.split("/").pop(), namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, (args) => ({
        contents: args.path === "db"
          ? dbModule
          : args.path === "access"
          ? "export const getAuthUser = async r => r.acc.user; export const effectivePermissions = async () => ['*'];"
          : args.path === "uploadStorage"
          ? "export const resolveUploadPath = () => { throw Error('No test file access'); };"
          : "export const postMatchedPurchaseInvoice = async () => {};",
        loader: "js",
      }));
    },
  }],
});

function fixture(snapshot) {
  let data = structuredClone(snapshot || {});
  let failTable = "";
  const table = (name) => new Proxy({ _name: name }, { get: (target, key) => key in target ? target[key] : { name: key } });
  const rows = (name) => data[name] ||= [];
  function query(kind, target) {
    let predicate = () => true, values, order, limit = Infinity, promise;
    const execute = () => {
      const name = target._name;
      if (kind === "insert") {
        if (failTable === name) throw new Error("Injected write failure");
        const created = {
          id: Math.max(0, ...rows(name).map((row) => row.id)) + 1,
          organizationId: 1,
          createdAt: new Date(),
          isActive: true,
          currentBalance: 0,
          openingBalance: 0,
          debit: 0,
          credit: 0,
          approvalStatus: name === "journalEntriesTable" ? "Approved" : "Pending Approval",
          requiredApprovals: 1,
          approvalLevel: 0,
          approvedByUserIds: "[]",
          ...values,
        };
        rows(name).push(created);
        return [structuredClone(created)];
      }
      let selected = rows(name).filter(predicate);
      if (kind === "update") selected.forEach((row) => Object.assign(row, values));
      if (kind === "delete") data[name] = rows(name).filter((row) => !predicate(row));
      if (order) selected.sort((a, b) => String(a[order.field.name]).localeCompare(String(b[order.field.name])) * order.direction);
      return structuredClone(selected.slice(0, limit));
    };
    const chain = {
      from(value) { target = value; return chain; },
      where(value) { predicate = value; return chain; },
      orderBy(value) { order = value; return chain; },
      limit(value) { limit = value; return chain; },
      values(value) { values = value; return chain; },
      set(value) { values = value; return chain; },
      returning() { return chain; },
      then(resolve, reject) { promise ||= Promise.resolve().then(execute); return promise.then(resolve, reject); },
    };
    return chain;
  }
  const db = {
    select: () => query("select"),
    insert: (t) => query("insert", t),
    update: (t) => query("update", t),
    delete: (t) => query("delete", t),
    transaction: async (fn) => {
      const before = structuredClone(data);
      try { return await fn(db); } catch (error) { data = before; throw error; }
    },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "__testDb", bundled.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports, { db, table }
  );
  const router = module.exports.default;
  async function call(method, path, body = {}, params = {}, permissions = ["*"], org = 1, query = {}, userId = 1) {
    const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
    assert.ok(route, `${method} ${path} exists`);
    const req = { body, params, query, acc: { org, p: permissions, user: { id: userId } } };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await route.route.stack[0].handle(req, res);
    return res;
  }
  if (!snapshot) {
    rows("chartOfAccountsTable").push(
      { id: 100, organizationId: 1, accountCode: "1099", accountName: "Test Bank", accountType: "Asset", isActive: true, currentBalance: 0, openingBalance: 0 },
      { id: 101, organizationId: 1, accountCode: "5150", accountName: "Bank Charges", accountType: "Expense", isActive: true, currentBalance: 0, openingBalance: 0 },
      { id: 102, organizationId: 1, accountCode: "5160", accountName: "TDS Payable", accountType: "Liability", isActive: true, currentBalance: 0, openingBalance: 0 }
    );
    rows("contactsTable").push(
      { id: 1, type: "client", name: "AK-MUSHROOMS", contactCode: "C1" },
      { id: 2, type: "vendor", name: "Supplier Spores", contactCode: "V1" }
    );
  }
  return {
    call,
    rows,
    reload: () => fixture(data),
    fail: (name) => { failTable = name; },
    post: module.exports.postJournal,
    reverse: module.exports.reverseJournal,
    assertBalanced: module.exports.assertJournalBalanced,
  };
}

// ==================================================
// 1. RECEIVABLES PAYMENT JOURNAL
// ==================================================
test("1. Receivables payment journal: Dr Settlement Bank, Cr AR 1100, balanced, exact amount, actual payment date, metadata, no duplicate", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  const arAccountId = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "1100").id;

  f.rows("accountsReceivableTable").push({
    id: 10, organizationId: 1, sourceType: "Manual", entryType: "Invoice",
    clientId: 1, clientName: "AK-MUSHROOMS", invoiceNumber: "INV-AK-001",
    invoiceDate: "2026-09-01", dueDate: "2026-09-30", amount: 1000,
    receivedAmount: 0, adjustedAmount: 0, approvalStatus: "Approved",
  });

  const res = await f.call("post", "/ar/:id/payment", {
    amount: 1000,
    paymentDate: "2026-09-08",
    fromAccountId: arAccountId,
    toAccountId: 100, // Test Bank
    receiptId: "rcpt-001",
    paymentMethod: "Bank Transfer",
    notes: "Payment received for INV-AK-001",
  }, { id: 10 });

  assert.equal(res.statusCode, 201);
  const journal = f.rows("journalEntriesTable").find((row) => row.id === res.body.journalEntryId);
  assert.ok(journal, "Journal entry must exist");
  assert.equal(journal.entryDate, "2026-09-08", "Journal date must be actual payment date, NOT invoice date");
  assert.equal(journal.totalDebit, 1000);
  assert.equal(journal.totalCredit, 1000);
  assert.equal(journal.voucherType, "Receipt");
  assert.equal(journal.sourceType, "Manual AR Receipt");

  // Metadata verification
  assert.equal(journal.metadata.arId, 10);
  assert.equal(journal.metadata.clientId, 1);
  assert.equal(journal.metadata.clientName, "AK-MUSHROOMS");
  assert.equal(journal.metadata.documentReference, "INV-AK-001");
  assert.equal(journal.metadata.paymentMethod, "Bank Transfer");
  assert.equal(journal.metadata.paymentDate, "2026-09-08");

  // Lines verification: Dr Test Bank (100) ₹1,000, Cr AR (1100) ₹1,000
  const lines = f.rows("journalLinesTable").filter((l) => l.journalEntryId === journal.id);
  assert.equal(lines.length, 2);
  const debitLine = lines.find((l) => l.accountId === 100);
  const creditLine = lines.find((l) => l.accountId === arAccountId);
  assert.equal(debitLine.debit, 1000);
  assert.equal(debitLine.credit, 0);
  assert.equal(creditLine.debit, 0);
  assert.equal(creditLine.credit, 1000);

  // Idempotency: retry does not duplicate journal
  const retry = await f.call("post", "/ar/:id/payment", {
    amount: 1000, paymentDate: "2026-09-08", fromAccountId: arAccountId,
    toAccountId: 100, receiptId: "rcpt-001", paymentMethod: "Bank Transfer",
    notes: "Payment received for INV-AK-001",
  }, { id: 10 });
  assert.equal(retry.statusCode, 201);
  assert.equal(f.rows("journalEntriesTable").length, 1, "Duplicate retry must not create extra journal");
});

// ==================================================
// 2. PAYABLES PAYMENT JOURNAL
// ==================================================
test("2. Payables payment journal: Dr AP 2100, Cr Settlement Bank, balanced, exact amount, actual payment date, metadata, no duplicate", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  const apAccountId = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "2100").id;

  f.rows("accountsPayableTable").push({
    id: 20, organizationId: 1, sourceType: "Manual", entryType: "Bill",
    vendorId: 2, vendorName: "Supplier Spores", billNumber: "BILL-SP-001",
    billDate: "2026-09-01", dueDate: "2026-09-30", amount: 1000,
    paidAmount: 0, adjustedAmount: 0, approvalStatus: "Approved",
  });

  const res = await f.call("post", "/ap/:id/payment", {
    amount: 1000,
    paymentDate: "2026-09-09",
    fromAccountId: 100, // Test Bank
    toAccountId: apAccountId,
    paymentId: "pmt-001",
    paymentMethod: "UPI",
    notes: "Vendor settlement for BILL-SP-001",
  }, { id: 20 });

  assert.equal(res.statusCode, 201);
  const journal = f.rows("journalEntriesTable").find((row) => row.id === res.body.journalEntryId);
  assert.ok(journal, "Journal entry must exist");
  assert.equal(journal.entryDate, "2026-09-09", "Journal date must be actual payment date, NOT bill date");
  assert.equal(journal.totalDebit, 1000);
  assert.equal(journal.totalCredit, 1000);
  assert.equal(journal.voucherType, "Payment");
  assert.equal(journal.sourceType, "Manual AP Payment");

  // Metadata verification
  assert.equal(journal.metadata.apId, 20);
  assert.equal(journal.metadata.vendorId, 2);
  assert.equal(journal.metadata.vendorName, "Supplier Spores");
  assert.equal(journal.metadata.documentReference, "BILL-SP-001");
  assert.equal(journal.metadata.paymentMethod, "UPI");
  assert.equal(journal.metadata.paymentDate, "2026-09-09");

  // Lines verification: Dr AP 2100 ₹1,000, Cr Test Bank (100) ₹1,000
  const lines = f.rows("journalLinesTable").filter((l) => l.journalEntryId === journal.id);
  assert.equal(lines.length, 2);
  const debitLine = lines.find((l) => l.accountId === apAccountId);
  const creditLine = lines.find((l) => l.accountId === 100);
  assert.equal(debitLine.debit, 1000);
  assert.equal(debitLine.credit, 0);
  assert.equal(creditLine.debit, 0);
  assert.equal(creditLine.credit, 1000);

  // Idempotency: retry does not duplicate journal
  const retry = await f.call("post", "/ap/:id/payment", {
    amount: 1000, paymentDate: "2026-09-09", fromAccountId: 100,
    toAccountId: apAccountId, paymentId: "pmt-001", paymentMethod: "UPI",
    notes: "Vendor settlement for BILL-SP-001",
  }, { id: 20 });
  assert.equal(retry.statusCode, 201);
  assert.equal(f.rows("journalEntriesTable").length, 1, "Duplicate retry must not create extra journal");
});

// ==================================================
// 3. SALES INVOICE JOURNAL
// ==================================================
test("3. Sales invoice journal: Dr AR 1100, Cr Sales 4100, invoice date, balanced amount", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  const arAccount = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "1100");
  const salesAccount = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "4100");

  const journal = await f.post(1, {
    entryDate: "2026-09-05",
    reference: "SALE:INV-001",
    description: "Sales invoice INV-001",
    sourceType: "Sales Invoice",
    sourceId: 55,
    lines: [
      { accountId: arAccount.id, debit: 2500, credit: 0, memo: "INV-001" },
      { accountId: salesAccount.id, debit: 0, credit: 2500, memo: "INV-001" },
    ],
  });

  assert.equal(journal.entryDate, "2026-09-05");
  assert.equal(journal.totalDebit, 2500);
  assert.equal(journal.totalCredit, 2500);
  const lines = f.rows("journalLinesTable").filter((l) => l.journalEntryId === journal.id);
  assert.equal(lines.length, 2);
  assert.equal(lines.find((l) => l.accountId === arAccount.id).debit, 2500);
  assert.equal(lines.find((l) => l.accountId === salesAccount.id).credit, 2500);
});

// ==================================================
// 4. PURCHASE INVOICE JOURNAL
// ==================================================
test("4. Purchase invoice journal: Dr Purchase 5100, Cr AP 2100, invoice date, balanced amount", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  const apAccount = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "2100");
  const purchaseAccount = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "5100");

  const journal = await f.post(1, {
    entryDate: "2026-09-04",
    reference: "PURCH:BILL-001",
    description: "Purchase invoice BILL-001",
    sourceType: "Purchase Invoice",
    sourceId: 77,
    lines: [
      { accountId: purchaseAccount.id, debit: 4200, credit: 0, memo: "BILL-001" },
      { accountId: apAccount.id, debit: 0, credit: 4200, memo: "BILL-001" },
    ],
  });

  assert.equal(journal.entryDate, "2026-09-04");
  assert.equal(journal.totalDebit, 4200);
  assert.equal(journal.totalCredit, 4200);
  const lines = f.rows("journalLinesTable").filter((l) => l.journalEntryId === journal.id);
  assert.equal(lines.length, 2);
  assert.equal(lines.find((l) => l.accountId === purchaseAccount.id).debit, 4200);
  assert.equal(lines.find((l) => l.accountId === apAccount.id).credit, 4200);
});

// ==================================================
// 5. PARTIAL PAYMENT JOURNALS (RECEIVABLES & PAYABLES)
// ==================================================
test("5. Partial payment journals: Receivables ₹10,000 -> 3 separate journal events with distinct dates and exact balances", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  const arAccountId = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "1100").id;

  f.rows("accountsReceivableTable").push({
    id: 11, organizationId: 1, sourceType: "Manual", entryType: "Invoice",
    clientId: 1, clientName: "AK-MUSHROOMS", invoiceNumber: "INV-PARTIAL-AR",
    invoiceDate: "2026-09-01", dueDate: "2026-09-30", amount: 10000,
    receivedAmount: 0, adjustedAmount: 0, approvalStatus: "Approved",
  });

  const payments = [
    { amount: 3000, date: "2026-09-02", id: "p1", expectedRemaining: 7000 },
    { amount: 2000, date: "2026-09-03", id: "p2", expectedRemaining: 5000 },
    { amount: 5000, date: "2026-09-04", id: "p3", expectedRemaining: 0 },
  ];

  for (const p of payments) {
    const res = await f.call("post", "/ar/:id/payment", {
      amount: p.amount,
      paymentDate: p.date,
      fromAccountId: arAccountId,
      toAccountId: 100,
      receiptId: p.id,
    }, { id: 11 });
    assert.equal(res.statusCode, 201);
    assert.equal(10000 - res.body.receivable.receivedAmount, p.expectedRemaining);
    const j = f.rows("journalEntriesTable").find((row) => row.id === res.body.journalEntryId);
    assert.equal(j.entryDate, p.date);
    assert.equal(j.totalDebit, p.amount);
    assert.equal(j.totalCredit, p.amount);
  }

  assert.equal(f.rows("journalEntriesTable").length, 3, "Three separate journals must be created without merging");
});

test("5b. Partial payment journals: Payables ₹10,000 -> 3 separate journal events with distinct dates and exact balances", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  const apAccountId = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "2100").id;

  f.rows("accountsPayableTable").push({
    id: 21, organizationId: 1, sourceType: "Manual", entryType: "Bill",
    vendorId: 2, vendorName: "Supplier Spores", billNumber: "BILL-PARTIAL-AP",
    billDate: "2026-09-01", dueDate: "2026-09-30", amount: 10000,
    paidAmount: 0, adjustedAmount: 0, approvalStatus: "Approved",
  });

  const payments = [
    { amount: 3000, date: "2026-09-02", id: "ap1", expectedRemaining: 7000 },
    { amount: 2000, date: "2026-09-03", id: "ap2", expectedRemaining: 5000 },
    { amount: 5000, date: "2026-09-04", id: "ap3", expectedRemaining: 0 },
  ];

  for (const p of payments) {
    const res = await f.call("post", "/ap/:id/payment", {
      amount: p.amount,
      paymentDate: p.date,
      fromAccountId: 100,
      toAccountId: apAccountId,
      paymentId: p.id,
    }, { id: 21 });
    assert.equal(res.statusCode, 201);
    assert.equal(10000 - res.body.payable.paidAmount, p.expectedRemaining);
    const j = f.rows("journalEntriesTable").find((row) => row.id === res.body.journalEntryId);
    assert.equal(j.entryDate, p.date);
    assert.equal(j.totalDebit, p.amount);
    assert.equal(j.totalCredit, p.amount);
  }

  assert.equal(f.rows("journalEntriesTable").length, 3, "Three separate journals must be created without merging");
});

// ==================================================
// 6. PAYMENT DATE VERIFICATION
// ==================================================
test("6. Payment date verification: Journal entry strictly uses payment date, never bill/invoice date or current date", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  const apAccountId = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "2100").id;

  f.rows("accountsPayableTable").push({
    id: 22, organizationId: 1, sourceType: "Manual", entryType: "Bill",
    vendorId: 2, vendorName: "Supplier Spores", billNumber: "BILL-DATE-TEST",
    billDate: "2026-08-01", dueDate: "2026-08-31", amount: 1500,
    paidAmount: 0, adjustedAmount: 0, approvalStatus: "Approved",
  });

  const res = await f.call("post", "/ap/:id/payment", {
    amount: 1500,
    paymentDate: "2026-09-15",
    fromAccountId: 100,
    toAccountId: apAccountId,
    paymentId: "date-test-1",
  }, { id: 22 });

  assert.equal(res.statusCode, 201);
  const j = f.rows("journalEntriesTable").find((row) => row.id === res.body.journalEntryId);
  assert.equal(j.entryDate, "2026-09-15", "Journal date must be the exact payment date 2026-09-15, not billDate 2026-08-01");
});

// ==================================================
// 7. BALANCE VALIDATION
// ==================================================
test("7. Balance validation: assertJournalBalanced helper rejects unbalanced, zero, or empty journal lines", () => {
  const f = fixture();
  // Valid balanced journal passes
  const valid = f.assertBalanced([
    { debit: 1000, credit: 0 },
    { debit: 0, credit: 1000 },
  ]);
  assert.equal(valid.totalDebit, 1000);
  assert.equal(valid.totalCredit, 1000);

  // Unbalanced rejects
  assert.throws(
    () => f.assertBalanced([
      { debit: 1000, credit: 0 },
      { debit: 0, credit: 950 },
    ]),
    /Journal debit and credit must balance/
  );

  // Zero amounts reject
  assert.throws(
    () => f.assertBalanced([
      { debit: 0, credit: 0 },
    ]),
    /Journal debit and credit must balance/
  );

  // Empty lines reject
  assert.throws(
    () => f.assertBalanced([]),
    /Journal debit and credit must balance/
  );
});

// ==================================================
// 8. DUPLICATE / IDEMPOTENCY
// ==================================================
test("8. Duplicate protection: Altering payment parameters on retry throws 409 Conflict", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  const apAccountId = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "2100").id;

  f.rows("accountsPayableTable").push({
    id: 23, organizationId: 1, sourceType: "Manual", entryType: "Bill",
    vendorId: 2, vendorName: "Supplier Spores", billNumber: "BILL-RETRY-TEST",
    billDate: "2026-09-01", dueDate: "2026-09-30", amount: 5000,
    paidAmount: 0, adjustedAmount: 0, approvalStatus: "Approved",
  });

  // First call succeeds
  const res1 = await f.call("post", "/ap/:id/payment", {
    amount: 2000, paymentDate: "2026-09-05", fromAccountId: 100,
    toAccountId: apAccountId, paymentId: "fixed-key",
  }, { id: 23 });
  assert.equal(res1.statusCode, 201);

  // Retry with altered amount throws 409
  const res2 = await f.call("post", "/ap/:id/payment", {
    amount: 2500, paymentDate: "2026-09-05", fromAccountId: 100,
    toAccountId: apAccountId, paymentId: "fixed-key",
  }, { id: 23 });
  assert.equal(res2.statusCode, 409);
});

// ==================================================
// 9. BANK CHARGES & TDS ACCOUNTING
// ==================================================
test("9a. Payables payment with TDS and Bank Charges creates balanced journal", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  const apAccountId = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "2100").id;
  const chargesAccount = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "5150").id;
  const tdsAccount = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "5160").id;

  f.rows("accountsPayableTable").push({
    id: 24, organizationId: 1, sourceType: "Manual", entryType: "Bill",
    vendorId: 2, vendorName: "Supplier Spores", billNumber: "BILL-TDS-TEST",
    billDate: "2026-09-01", dueDate: "2026-09-30", amount: 10000,
    paidAmount: 0, adjustedAmount: 0, approvalStatus: "Approved",
  });

  // Payment = 10,000, TDS = 500, Charges = 100
  // Debit: AP 2100 (10000), Bank Charges 5150 (100) = Total Dr 10100
  // Credit: TDS 5160 (500), Settlement Bank 100 (9600) = Total Cr 10100
  const res = await f.call("post", "/ap/:id/payment", {
    amount: 10000,
    paymentDate: "2026-09-07",
    fromAccountId: 100,
    toAccountId: apAccountId,
    tdsAmount: 500,
    bankCharges: 100,
    paymentId: "tds-ap-01",
  }, { id: 24 });

  assert.equal(res.statusCode, 201);
  const journal = f.rows("journalEntriesTable").find((row) => row.id === res.body.journalEntryId);
  assert.equal(journal.totalDebit, 10100);
  assert.equal(journal.totalCredit, 10100);

  const lines = f.rows("journalLinesTable").filter((l) => l.journalEntryId === journal.id);
  assert.equal(lines.find((l) => l.accountId === apAccountId).debit, 10000);
  assert.equal(lines.find((l) => l.accountId === chargesAccount).debit, 100);
  assert.equal(lines.find((l) => l.accountId === tdsAccount).credit, 500);
  assert.equal(lines.find((l) => l.accountId === 100).credit, 9600);
});

test("9b. Receivables receipt with TDS and Bank Charges creates balanced journal", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  const arAccountId = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "1100").id;
  const chargesAccount = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "5150").id;
  const tdsAccount = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "5160").id;

  f.rows("accountsReceivableTable").push({
    id: 12, organizationId: 1, sourceType: "Manual", entryType: "Invoice",
    clientId: 1, clientName: "AK-MUSHROOMS", invoiceNumber: "INV-TDS-TEST",
    invoiceDate: "2026-09-01", dueDate: "2026-09-30", amount: 10000,
    receivedAmount: 0, adjustedAmount: 0, approvalStatus: "Approved",
  });

  // Receipt = 10,000, TDS = 500, Charges = 100
  // Debit: Settlement Bank 100 (9400), TDS 5160 (500), Bank Charges 5150 (100) = Total Dr 10000
  // Credit: AR 1100 (10000) = Total Cr 10000
  const res = await f.call("post", "/ar/:id/payment", {
    amount: 10000,
    paymentDate: "2026-09-07",
    fromAccountId: arAccountId,
    toAccountId: 100,
    tdsAmount: 500,
    bankCharges: 100,
    receiptId: "tds-ar-01",
  }, { id: 12 });

  assert.equal(res.statusCode, 201);
  const journal = f.rows("journalEntriesTable").find((row) => row.id === res.body.journalEntryId);
  assert.equal(journal.totalDebit, 10000);
  assert.equal(journal.totalCredit, 10000);

  const lines = f.rows("journalLinesTable").filter((l) => l.journalEntryId === journal.id);
  assert.equal(lines.find((l) => l.accountId === 100).debit, 9400);
  assert.equal(lines.find((l) => l.accountId === tdsAccount).debit, 500);
  assert.equal(lines.find((l) => l.accountId === chargesAccount).debit, 100);
  assert.equal(lines.find((l) => l.accountId === arAccountId).credit, 10000);
});

// ==================================================
// 10. LEDGER CONSISTENCY
// ==================================================
test("10. Ledger consistency: Payments reflect correctly in Vendor Ledger and Customer Ledger", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  const apAccountId = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "2100").id;
  const arAccountId = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "1100").id;

  f.rows("accountsPayableTable").push({
    id: 25, organizationId: 1, sourceType: "Manual", entryType: "Bill",
    vendorId: 2, vendorName: "Supplier Spores", billNumber: "BILL-LEDGER-01",
    billDate: "2026-09-01", dueDate: "2026-09-30", amount: 3000,
    paidAmount: 0, adjustedAmount: 0, approvalStatus: "Approved",
  });
  f.rows("accountsReceivableTable").push({
    id: 15, organizationId: 1, sourceType: "Manual", entryType: "Invoice",
    clientId: 1, clientName: "AK-MUSHROOMS", invoiceNumber: "INV-LEDGER-01",
    invoiceDate: "2026-09-01", dueDate: "2026-09-30", amount: 3000,
    receivedAmount: 0, adjustedAmount: 0, approvalStatus: "Approved",
  });

  await f.call("post", "/ap/:id/payment", {
    amount: 3000, paymentDate: "2026-09-06", fromAccountId: 100,
    toAccountId: apAccountId, paymentId: "vl-01",
  }, { id: 25 });

  await f.call("post", "/ar/:id/payment", {
    amount: 3000, paymentDate: "2026-09-06", fromAccountId: arAccountId,
    toAccountId: 100, receiptId: "cl-01",
  }, { id: 15 });

  const fresh = f.reload();
  const vl = await fresh.call("get", "/vendor-ledger");
  const cl = await fresh.call("get", "/customer-ledger");

  const vGroup = vl.body.find((g) => g.vendorName === "Supplier Spores");
  assert.ok(vGroup, "Vendor group must exist in Vendor Ledger");
  assert.equal(vGroup.billed, 3000);
  assert.equal(vGroup.paid, 3000);
  assert.equal(vGroup.outstanding, 0);

  const cGroup = cl.body.find((g) => g.customerName === "AK-MUSHROOMS" || g.clientName === "AK-MUSHROOMS");
  assert.ok(cGroup, "Customer group must exist in Customer Ledger");
  assert.equal(cGroup.invoiced, 3000);
  assert.equal(cGroup.received, 3000);
  assert.equal(cGroup.outstanding, 0);
});

// ==================================================
// 11. REGRESSION: THREE AP PARTIAL PAYMENTS P1, P2, P3
// ==================================================
test("11. Three AP partial payments (P1: ₹3000, P2: ₹2000, P3: ₹5000) create balanced journals with propagated references and dates", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  const apAccountId = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "2100").id;
  const bankAccountId = 100;

  // Add Praneesh AP vendor
  f.rows("contactsTable").push({
    id: 3,
    type: "vendor",
    name: "Praneesh AP",
    contactCode: "V-PRANEESH",
  });

  // Bill: LIVE-AP-PARTIAL-002, Vendor: Praneesh AP, Bill Amount: ₹10,000
  f.rows("accountsPayableTable").push({
    id: 99,
    organizationId: 1,
    sourceType: "Manual",
    entryType: "Bill",
    vendorId: 3,
    vendorName: "Praneesh AP",
    billNumber: "LIVE-AP-PARTIAL-002",
    billDate: "2026-09-01",
    dueDate: "2026-09-30",
    amount: 10000,
    paidAmount: 0,
    adjustedAmount: 0,
    approvalStatus: "Approved",
  });

  // P1: ₹3,000 on 2026-09-02, Reference: LIVE-AP-PARTIAL-002-P1
  const resP1 = await f.call("post", "/ap/:id/payment", {
    amount: 3000,
    paymentDate: "2026-09-02",
    reference: "LIVE-AP-PARTIAL-002-P1",
    fromAccountId: bankAccountId,
    toAccountId: apAccountId,
    paymentId: "p1-uuid",
  }, { id: 99 });
  assert.equal(resP1.statusCode, 201);

  // P2: ₹2,000 on 2026-09-03, Reference: LIVE-AP-PARTIAL-002-P2
  const resP2 = await f.call("post", "/ap/:id/payment", {
    amount: 2000,
    paymentDate: "2026-09-03",
    reference: "LIVE-AP-PARTIAL-002-P2",
    fromAccountId: bankAccountId,
    toAccountId: apAccountId,
    paymentId: "p2-uuid",
  }, { id: 99 });
  assert.equal(resP2.statusCode, 201);

  // P3: ₹5,000 on 2026-09-04, Reference: LIVE-AP-PARTIAL-002-P3
  const resP3 = await f.call("post", "/ap/:id/payment", {
    amount: 5000,
    paymentDate: "2026-09-04",
    reference: "LIVE-AP-PARTIAL-002-P3",
    fromAccountId: bankAccountId,
    toAccountId: apAccountId,
    paymentId: "p3-uuid",
  }, { id: 99 });
  assert.equal(resP3.statusCode, 201);

  // Assert AP bill state: Paid, paidAmount = 10,000, balance = 0
  const updatedBill = f.rows("accountsPayableTable").find((row) => row.id === 99);
  assert.equal(updatedBill.paidAmount, 10000);
  assert.equal(updatedBill.status, "Paid");

  // Assert all three journal entries exist
  const j1 = f.rows("journalEntriesTable").find((row) => row.id === resP1.body.journalEntryId);
  const j2 = f.rows("journalEntriesTable").find((row) => row.id === resP2.body.journalEntryId);
  const j3 = f.rows("journalEntriesTable").find((row) => row.id === resP3.body.journalEntryId);

  assert.ok(j1, "P1 journal must exist");
  assert.ok(j2, "P2 journal must exist");
  assert.ok(j3, "P3 journal must exist");

  // Assert P1 journal
  assert.equal(j1.entryDate, "2026-09-02");
  assert.ok(j1.reference.includes("LIVE-AP-PARTIAL-002-P1"), "P1 reference must contain LIVE-AP-PARTIAL-002-P1");
  assert.equal(j1.description, "Vendor payment for LIVE-AP-PARTIAL-002");
  assert.equal(j1.totalDebit, 3000);
  assert.equal(j1.totalCredit, 3000);

  // Assert P2 journal
  assert.equal(j2.entryDate, "2026-09-03");
  assert.ok(j2.reference.includes("LIVE-AP-PARTIAL-002-P2"), "P2 reference must contain LIVE-AP-PARTIAL-002-P2");
  assert.equal(j2.description, "Vendor payment for LIVE-AP-PARTIAL-002");
  assert.equal(j2.totalDebit, 2000);
  assert.equal(j2.totalCredit, 2000);

  // Assert P3 journal
  assert.equal(j3.entryDate, "2026-09-04");
  assert.ok(j3.reference.includes("LIVE-AP-PARTIAL-002-P3"), "P3 reference must contain LIVE-AP-PARTIAL-002-P3");
  assert.equal(j3.description, "Vendor payment for LIVE-AP-PARTIAL-002");
  assert.equal(j3.totalDebit, 5000);
  assert.equal(j3.totalCredit, 5000);

  // Assert journal lines for P3
  const linesP3 = f.rows("journalLinesTable").filter((l) => l.journalEntryId === j3.id);
  const drLine = linesP3.find((l) => l.accountId === apAccountId);
  const crLine = linesP3.find((l) => l.accountId === bankAccountId);
  assert.equal(drLine.debit, 5000);
  assert.equal(drLine.credit, 0);
  assert.equal(crLine.debit, 0);
  assert.equal(crLine.credit, 5000);

  // Assert searching Journal Entries by P3 reference
  const searchP3 = await f.call("get", "/journal-entries", {}, {}, ["*"], 1, { search: "LIVE-AP-PARTIAL-002-P3" });
  assert.equal(searchP3.statusCode, 200);
  assert.equal(searchP3.body.items.length, 1);
  assert.equal(searchP3.body.items[0].id, j3.id);
  assert.ok(searchP3.body.items[0].reference.includes("LIVE-AP-PARTIAL-002-P3"));

  // Assert searching Journal Entries by bill number returns all 3 partial payment journals
  const searchBill = await f.call("get", "/journal-entries", {}, {}, ["*"], 1, { search: "LIVE-AP-PARTIAL-002" });
  assert.equal(searchBill.statusCode, 200);
  assert.equal(searchBill.body.items.length, 3);

  // Assert idempotency / no duplicate journal creation on retry
  const retryP3 = await f.call("post", "/ap/:id/payment", {
    amount: 5000,
    paymentDate: "2026-09-04",
    reference: "LIVE-AP-PARTIAL-002-P3",
    fromAccountId: bankAccountId,
    toAccountId: apAccountId,
    paymentId: "p3-uuid",
  }, { id: 99 });
  assert.equal(retryP3.statusCode, 201);
  assert.equal(retryP3.body.journalEntryId, j3.id);
  const totalJournalsForP3 = f.rows("journalEntriesTable").filter((r) => r.reference.includes("LIVE-AP-PARTIAL-002-P3"));
  assert.equal(totalJournalsForP3.length, 1, "Duplicate journal must not be created");
});

// ==================================================
// 12. FOCUSED REGRESSION: COA TEST BANK ACCOUNT DEBIT/CREDIT MOVEMENT FOR AR/AP
// ==================================================
test("12. COA Test Bank Account: AR receipt ₹2,300 appears as DEBIT ₹2,300, AP payment ₹2,345 appears as CREDIT ₹2,345, balanced", async () => {
  const f = fixture();
  await f.call("get", "/coa");

  // Create Test Bank Account (Asset)
  const testBankId = 200;
  f.rows("chartOfAccountsTable").push({
    id: testBankId,
    organizationId: 1,
    accountCode: "1050",
    accountName: "Test Bank Account",
    accountType: "Asset",
    isActive: true,
    currentBalance: 0,
    openingBalance: 0,
  });

  const arAccountId = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "1100").id;
  const apAccountId = f.rows("chartOfAccountsTable").find((row) => row.accountCode === "2100").id;

  // 1. Receivables: Customer Akash, Invoice 7890, Amount ₹2,300
  f.rows("contactsTable").push({
    id: 101,
    type: "client",
    name: "Akash",
    contactCode: "C-AKASH",
  });
  f.rows("accountsReceivableTable").push({
    id: 88,
    organizationId: 1,
    sourceType: "Manual",
    entryType: "Invoice",
    clientId: 101,
    clientName: "Akash",
    invoiceNumber: "7890",
    invoiceDate: "2026-09-08",
    dueDate: "2026-09-30",
    amount: 2300,
    receivedAmount: 0,
    adjustedAmount: 0,
  });

  // Record full receipt of ₹2,300 into Test Bank Account
  const receiptRes = await f.call("post", "/ar/:id/payment", {
    amount: 2300,
    paymentDate: "2026-09-09",
    fromAccountId: arAccountId,
    toAccountId: testBankId,
    receiptId: "rcpt-akash-7890",
    reference: "7890",
    notes: "Full payment from Akash",
  }, { id: 88 });
  assert.equal(receiptRes.statusCode, 201);
  assert.equal(receiptRes.body.receivable.receivedAmount, 2300);

  // Verify journal for AR receipt: Dr Test Bank Account ₹2,300 / Cr AR 1100 ₹2,300
  const arJournal = f.rows("journalEntriesTable").find((j) => j.id === receiptRes.body.journalEntryId);
  assert.equal(arJournal.totalDebit, 2300);
  assert.equal(arJournal.totalCredit, 2300);
  const arJournalLines = f.rows("journalLinesTable").filter((l) => l.journalEntryId === arJournal.id);
  const bankArLine = arJournalLines.find((l) => l.accountId === testBankId);
  const arRecLine = arJournalLines.find((l) => l.accountId === arAccountId);
  assert.equal(bankArLine.debit, 2300, "Underlying journal: Test Bank Account must be DEBIT ₹2,300");
  assert.equal(bankArLine.credit, 0, "Underlying journal: Test Bank Account credit must be 0");
  assert.equal(arRecLine.debit, 0);
  assert.equal(arRecLine.credit, 2300);

  // 2. Payables: Vendor Pranesh, Bill Amount ₹2,345
  f.rows("contactsTable").push({
    id: 102,
    type: "vendor",
    name: "Pranesh",
    contactCode: "V-PRANESH",
  });
  f.rows("accountsPayableTable").push({
    id: 89,
    organizationId: 1,
    sourceType: "Manual",
    entryType: "Bill",
    vendorId: 102,
    vendorName: "Pranesh",
    billNumber: "BILL-PRANESH-789",
    billDate: "2026-09-08",
    dueDate: "2026-09-30",
    amount: 2345,
    paidAmount: 0,
    adjustedAmount: 0,
    approvalStatus: "Approved",
  });

  // Record full payment of ₹2,345 from Test Bank Account
  const paymentRes = await f.call("post", "/ap/:id/payment", {
    amount: 2345,
    paymentDate: "2026-09-09",
    fromAccountId: testBankId,
    toAccountId: apAccountId,
    paymentId: "pay-pranesh-2345",
    reference: "BILL-PRANESH-789",
    notes: "Full payment to Pranesh",
  }, { id: 89 });
  assert.equal(paymentRes.statusCode, 201);
  assert.equal(paymentRes.body.payable.paidAmount, 2345);

  // Verify journal for AP payment: Dr AP 2100 ₹2,345 / Cr Test Bank Account ₹2,345
  const apJournal = f.rows("journalEntriesTable").find((j) => j.id === paymentRes.body.journalEntryId);
  assert.equal(apJournal.totalDebit, 2345);
  assert.equal(apJournal.totalCredit, 2345);
  const apJournalLines = f.rows("journalLinesTable").filter((l) => l.journalEntryId === apJournal.id);
  const bankApLine = apJournalLines.find((l) => l.accountId === testBankId);
  const apPayLine = apJournalLines.find((l) => l.accountId === apAccountId);
  assert.equal(bankApLine.debit, 0, "Underlying journal: Test Bank Account debit must be 0");
  assert.equal(bankApLine.credit, 2345, "Underlying journal: Test Bank Account must be CREDIT ₹2,345");
  assert.equal(apPayLine.debit, 2345);
  assert.equal(apPayLine.credit, 0);

  // 3. Inspect Chart of Accounts ledger movement for Test Bank Account
  const fresh = f.reload();
  const coaRes = await fresh.call("get", "/coa");
  assert.equal(coaRes.statusCode, 200);

  const testBankCoa = coaRes.body.find((a) => a.id === testBankId);
  assert.ok(testBankCoa, "Test Bank Account must exist in Chart of Accounts");

  // Verify COA ledger lines (Entry History & Ledger Movement)
  assert.equal(testBankCoa.lines.length, 2, "Test Bank Account must have exactly 2 ledger lines");

  // Line 1: AR receipt movement
  const receiptLine = testBankCoa.lines.find((l) => l.journalEntryId === arJournal.id);
  assert.ok(receiptLine, "AR receipt movement line must exist in Test Bank Account ledger");
  assert.equal(receiptLine.debit, 2300, "AR receipt: Test Bank Account ledger DEBIT must be ₹2,300");
  assert.equal(receiptLine.credit, 0, "AR receipt: Test Bank Account ledger CREDIT must be 0");
  assert.equal(receiptLine.partyName, "Akash");
  assert.equal(receiptLine.referenceId, "7890");

  // Line 2: AP payment movement
  const paymentLine = testBankCoa.lines.find((l) => l.journalEntryId === apJournal.id);
  assert.ok(paymentLine, "AP payment movement line must exist in Test Bank Account ledger");
  assert.equal(paymentLine.debit, 0, "AP payment: Test Bank Account ledger DEBIT must be 0");
  assert.equal(paymentLine.credit, 2345, "AP payment: Test Bank Account ledger CREDIT must be ₹2,345");
  assert.equal(paymentLine.partyName, "Pranesh");
  assert.equal(paymentLine.referenceId, "BILL-PRANESH-789");

  // Verify payment events metadata on Test Bank Account
  assert.equal(testBankCoa.receivablePaymentEvents.length, 1);
  assert.equal(testBankCoa.receivablePaymentEvents[0].debit, 2300);
  assert.equal(testBankCoa.receivablePaymentEvents[0].credit, 0);

  assert.equal(testBankCoa.payablePaymentEvents.length, 1);
  assert.equal(testBankCoa.payablePaymentEvents[0].debit, 0);
  assert.equal(testBankCoa.payablePaymentEvents[0].credit, 2345);

  // Verify running balance and net balance
  // Opening = 0 + 2300 (Dr) - 2345 (Cr) = -45
  assert.equal(testBankCoa.currentBalance, "-45");
});

