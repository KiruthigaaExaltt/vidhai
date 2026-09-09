import { parsePayableSheet } from "../../vidhai-erp/src/pages/accounts/payableImport.ts";
import { disbursementAccounts } from "../src/lib/payableAccounts.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Execute the real Accounts handlers with an isolated transactional database double.
// Never import @workspace/db at runtime: its startup connects and bootstraps users.
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
  stdin: { contents: source + "\nexport { decorateHistoryLines };", resolveDir: fileURLToPath(new URL("../src/routes", import.meta.url)), loader: "ts" },
  bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
  plugins: [{ name: "isolated-accounts", setup(builder) {
    builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "test" }));
    builder.onResolve({ filter: /\/lib\/(access|procurementAutomation|uploadStorage)$/ }, (args) => ({ path: args.path.split("/").pop(), namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, (args) => ({ contents: args.path === "db" ? dbModule : args.path === "access"
      ? "export const getAuthUser = async r => r.acc.user; export const effectivePermissions = async () => ['*'];"
      : args.path === "uploadStorage" ? "export const resolveUploadPath = () => { throw Error('No test file access'); };"
      : "export const postMatchedPurchaseInvoice = async () => {};", loader: "js" }));
  } }],
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
        const created = { id: Math.max(0, ...rows(name).map((row) => row.id)) + 1,
          organizationId: 1, createdAt: new Date(), isActive: true, currentBalance: 0, openingBalance: 0,
          debit: 0, credit: 0, approvalStatus: name === "journalEntriesTable" ? "Approved" : "Pending Approval",
          requiredApprovals: 1, approvalLevel: 0, approvedByUserIds: "[]", ...values };
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
      from(value) { target = value; return chain; }, where(value) { predicate = value; return chain; },
      orderBy(value) { order = value; return chain; }, limit(value) { limit = value; return chain; },
      values(value) { values = value; return chain; }, set(value) { values = value; return chain; },
      returning() { return chain; },
      then(resolve, reject) { promise ||= Promise.resolve().then(execute); return promise.then(resolve, reject); },
    };
    return chain;
  }
  const db = { select: () => query("select"), insert: (t) => query("insert", t), update: (t) => query("update", t), delete: (t) => query("delete", t),
    transaction: async (fn) => { const before = structuredClone(data); try { return await fn(db); } catch (error) { data = before; throw error; } },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "__testDb", bundled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports, { db, table });
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
      { id: 100, organizationId: 1, accountCode: "1099", accountName: "Custom Bank", accountType: "Asset", isActive: true, currentBalance: 0, openingBalance: 0 },
      { id: 101, organizationId: 1, accountCode: "5150", accountName: "Bank Charges", accountType: "Expense", isActive: true, currentBalance: 0, openingBalance: 0 },
      { id: 102, organizationId: 1, accountCode: "5160", accountName: "TDS Payable", accountType: "Liability", isActive: true, currentBalance: 0, openingBalance: 0 }
    );
    rows("contactsTable").push({ id: 8, type: "vendor", name: "Vendor A", contactCode: "V8" });
  }
  return { call, rows, reload: () => fixture(data), fail: (name) => { failTable = name; }, decorate: module.exports.decorateHistoryLines, post: module.exports.postJournal };
}

async function payableFixture() {
  const f = fixture();
  await f.call("get", "/coa");
  const to = f.rows("chartOfAccountsTable").find(row => row.accountCode === "2100").id;
  f.rows("accountsPayableTable").push({
    id: 20, organizationId: 1, sourceType: "Manual", entryType: "Bill",
    vendorId: 8, vendorName: "Vendor A", billNumber: "AP-NEW",
    billDate: "2026-09-01", dueDate: "2026-09-30", amount: 10000,
    paidAmount: 0, adjustedAmount: 0, approvalStatus: "Approved"
  });
  return { f, body: { amount: 3000, paymentDate: "2026-09-02", fromAccountId: 100, toAccountId: to, paymentId: "payment-1", paymentMethod: "" } };
}

test("three partial disbursements retain dates, direction, history, vendor ledger and COA events", async () => {
  const {f, body} = await payableFixture();
  for (const [i, amount] of [3000, 2000, 5000].entries()) {
    const result = await f.call("post", "/ap/:id/payment", { ...body, amount, paymentDate: `2026-09-0${i + 2}`, paymentId: `partial-${i}` }, {id:20});
    assert.equal(result.statusCode, 201);
    assert.equal(10000 - result.body.payable.paidAmount, [7000, 5000, 0][i]);
    const journal = f.rows("journalEntriesTable").find(row => row.id === result.body.journalEntryId);
    assert.equal(journal.entryDate, `2026-09-0${i + 2}`);
    assert.equal(journal.metadata.paymentDate, journal.entryDate);
    assert.equal(journal.metadata.fromAccountId, 100);
    assert.equal(journal.metadata.toAccountId, body.toAccountId);
    const lines = f.rows("journalLinesTable").filter(row => row.journalEntryId === journal.id);
    assert.equal(lines.length, 2);
    // Debit AP 2100, Credit Bank 1099
    assert.equal(lines.find(row => row.accountId === body.toAccountId).debit, amount);
    assert.equal(lines.find(row => row.accountId === 100).credit, amount);
  }
  const fresh = f.reload();
  const history = await fresh.call("get", "/ap");
  const historyRows = Array.isArray(history.body) ? history.body : history.body.items;
  assert.equal(historyRows.find(row => row.id === 20).paymentHistory.length, 3);
  const ledger = await fresh.call("get", "/vendor-ledger");
  const record = ledger.body[0].records.find(row => row.id === 20);
  assert.deepEqual(record.payments.map(row => row.paymentDate).sort(), ["2026-09-02", "2026-09-03", "2026-09-04"]);
  assert.equal(record.payments[0].fromAccountName, "Custom Bank");
  assert.equal(record.payments[0].toAccountName, "Accounts Payable");
  assert.equal(record.outstanding, 0);
  const coa = await fresh.call("get", "/coa");
  assert.equal(coa.body.find(row => row.id === 100).payablePaymentEvents.length, 3);
  const apCoa = coa.body.find(row => row.id === body.toAccountId);
  assert.equal(apCoa.payablePaymentEvents.length, 3);
  assert.equal(apCoa.lines.length, 4);
  const billLine = apCoa.lines.find(l => l.credit === 10000);
  assert.ok(billLine, "Bill credit line exists");
  assert.equal(billLine.debit, 0);
  const paymentLines = apCoa.lines.filter(l => l.debit > 0);
  assert.equal(paymentLines.length, 3);
  assert.deepEqual(paymentLines.map(l => l.debit), [3000, 2000, 5000]);
  assert.equal(apCoa.lines[apCoa.lines.length - 1].runningBalance, 0);
  assert.equal(f.rows("journalEntriesTable").length, 3);
});

for (const [label, patch] of [
  ["missing date", {paymentDate:""}], ["invalid date", {paymentDate:"2026-02-30"}],
  ["missing from", {fromAccountId:""}], ["missing to", {toAccountId:""}],
  ["unknown from", {fromAccountId:9999}], ["unknown to", {toAccountId:9999}],
  ["wrong from", {fromAccountId:body => body.toAccountId}], ["wrong to", {toAccountId:100}],
  ["zero amount", {amount:0}], ["negative amount", {amount:-1}],
  ["overpayment", {amount:10001}], ["missing retry identity", {paymentId:""}],
]) test(`disbursement rejects ${label} without writes`, async () => {
  const {f, body} = await payableFixture();
  const evaluatedPatch = Object.fromEntries(
    Object.entries(patch).map(([k, v]) => [k, typeof v === "function" ? v(body) : v])
  );
  assert.equal((await f.call("post", "/ap/:id/payment", { ...body, ...evaluatedPatch }, { id: 20 })).statusCode, 400);
  assert.equal(f.rows("journalEntriesTable").length, 0);
  assert.equal(f.rows("accountsPayableTable")[0].paidAmount, 0);
});

test("disbursement rejects unapproved bill without writes", async () => {
  const {f, body} = await payableFixture();
  f.rows("accountsPayableTable")[0].approvalStatus = "Pending Approval";
  assert.equal((await f.call("post", "/ap/:id/payment", body, { id: 20 })).statusCode, 400);
  assert.equal(f.rows("journalEntriesTable").length, 0);
  assert.equal(f.rows("accountsPayableTable")[0].paidAmount, 0);
});

for (const side of ["fromAccountId", "toAccountId"]) test(`disbursement rejects inactive ${side}`, async () => {
  const {f, body} = await payableFixture();
  f.rows("chartOfAccountsTable").find(row => row.id === body[side]).isActive = false;
  assert.equal((await f.call("post", "/ap/:id/payment", body, { id: 20 })).statusCode, 400);
});

test("disbursement validates CRM vendor and rejects identical accounts", async () => {
  const {f, body} = await payableFixture();
  assert.equal((await f.call("post", "/ap/:id/payment", { ...body, toAccountId: body.fromAccountId }, { id: 20 })).statusCode, 400);
  f.rows("contactsTable").length = 0;
  assert.equal((await f.call("post", "/ap/:id/payment", body, { id: 20 })).statusCode, 400);
});

test("disbursement retry is idempotent and changed retry is rejected", async () => {
  const {f, body} = await payableFixture();
  const first = await f.call("post", "/ap/:id/payment", body, { id: 20 });
  const retry = await f.call("post", "/ap/:id/payment", body, { id: 20 });
  assert.equal(first.body.journalEntryId, retry.body.journalEntryId);
  assert.equal(f.rows("journalEntriesTable").length, 1);
  assert.equal((await f.call("post", "/ap/:id/payment", { ...body, paymentDate: "2026-09-03" }, { id: 20 })).statusCode, 409);
});

test("disbursement with bank charges and TDS creates properly balanced journal lines", async () => {
  const {f, body} = await payableFixture();
  const result = await f.call("post", "/ap/:id/payment", { ...body, amount: 3000, bankCharges: 100, tdsAmount: 50 }, { id: 20 });
  assert.equal(result.statusCode, 201);
  const lines = f.rows("journalLinesTable").filter(row => row.journalEntryId === result.body.journalEntryId);
  assert.equal(lines.length, 4);
  const apLine = lines.find(l => l.accountId === body.toAccountId);
  const chargeLine = lines.find(l => l.accountCode === "5150");
  const tdsLine = lines.find(l => l.accountCode === "5160");
  const bankLine = lines.find(l => l.accountId === 100);
  assert.equal(apLine.debit, 3000);
  assert.equal(chargeLine.debit, 100);
  assert.equal(tdsLine.credit, 50);
  assert.equal(bankLine.credit, 3050); // net disbursed: 3000 + 100 - 50 = 3050
  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  assert.equal(totalDebit, 3100);
  assert.equal(totalCredit, 3100);
});

const importRow = {
  entryType: "Bill", vendor: "Vendor A", billNumber: "IMPORTED-AP",
  billDate: "2026-09-01", dueDate: "2026-09-30", amount: "10000",
  paidAmount: "3000", paymentDate: "2026-09-06", fromAccount: "1099",
  toAccount: "2100", notes: "Imported disbursement", paymentFieldsPresent: true
};

test("Excel initial disbursement uses shared posting and duplicate import cannot double-pay", async () => {
  const {f} = await payableFixture();
  const result = await f.call("post", "/ap/import", { rows: [importRow] });
  assert.equal(result.statusCode, 201);
  const entry = f.rows("accountsPayableTable").find(row => row.billNumber === "IMPORTED-AP");
  assert.equal(entry.paidAmount, 3000);
  assert.equal(f.rows("journalEntriesTable")[0].entryDate, "2026-09-06");
  assert.equal(f.rows("journalEntriesTable")[0].metadata.apId, entry.id);
  assert.equal((await f.call("post", "/ap/import", { rows: [importRow] })).statusCode, 400);
  assert.equal(f.rows("journalEntriesTable").length, 1);
});

for (const patch of [
  {paymentDate: ""}, {fromAccount: ""}, {toAccount: ""},
  {toAccount: "1099"}, {fromAccount: "2100"}, {paidAmount: "10001"},
  {paidAmount: "invalid"}, {vendor: "Unknown"}
]) test(`Excel rejects invalid disbursement ${JSON.stringify(patch)}`, async () => {
  const {f} = await payableFixture();
  assert.equal((await f.call("post", "/ap/import", { rows: [{ ...importRow, ...patch }] })).statusCode, 400);
  assert.equal(f.rows("accountsPayableTable").length, 1);
  assert.equal(f.rows("journalEntriesTable").length, 0);
});

test("Excel disbursement failure rolls back bill and payment together", async () => {
  const {f} = await payableFixture();
  f.fail("journalLinesTable");
  await assert.rejects(f.call("post", "/ap/import", { rows: [importRow] }), /Injected write failure/);
  assert.equal(f.rows("accountsPayableTable").length, 1);
  assert.equal(f.rows("journalEntriesTable").length, 0);
});

test("historical totals and legacy imports never fabricate disbursement events", async () => {
  const {f} = await payableFixture();
  const legacy = { ...importRow };
  delete legacy.paymentDate;
  delete legacy.fromAccount;
  delete legacy.toAccount;
  delete legacy.paymentFieldsPresent;
  assert.equal((await f.call("post", "/ap/import", { rows: [legacy] })).statusCode, 201);
  assert.equal(f.rows("journalEntriesTable").length, 0);
  const ledger = await f.call("get", "/vendor-ledger");
  assert.equal(ledger.body[0].records.find(row => row.billNumber === "IMPORTED-AP").payments.length, 0);
});

test("new Excel unpaid bill requires no invented payment fields", async () => {
  const {f} = await payableFixture();
  assert.equal((await f.call("post", "/ap/import", { rows: [{ ...importRow, paidAmount: "0", paymentDate: "", fromAccount: "", toAccount: "" }] })).statusCode, 201);
  assert.equal(f.rows("journalEntriesTable").length, 0);
});

test("Payables parser maps new and reordered payment columns", () => {
  const headers = ["Vendor *", "Bill Number *", "Bill Date *", "Due Date *", "Amount *", "Paid Amount", "Payment Date", "From Account", "To Account", "Notes"];
  const values = ["Vendor A", "PARSED", "2026-09-01", "2026-09-30", "10000", "3000", "2026-09-06", "1099", "2100", "note"];
  const row = parsePayableSheet([headers, values])[0];
  assert.equal(row.paymentDate, "2026-09-06");
  assert.equal(row.fromAccount, "1099");
  assert.equal(row.toAccount, "2100");
  assert.equal(row.paymentFieldsPresent, true);
  assert.deepEqual(parsePayableSheet([[...headers].reverse(), [...values].reverse()])[0], row);
});

test("Payables parser retains old adjusted amount and notes without invented payments", () => {
  const row = parsePayableSheet([
    ["Vendor *", "Bill Number *", "Bill Date *", "Due Date *", "Amount *", "Paid Amount", "Adjusted Amount", "Notes"],
    ["Vendor A", "OLD", "2026-09-01", "2026-09-30", "10000", "3000", "50", "legacy"]
  ])[0];
  assert.equal(row.adjustedAmount, "50");
  assert.equal(row.notes, "legacy");
  assert.equal(row.paymentFieldsPresent, false);
  assert.equal(row.paymentDate, undefined);
});

test("Payables parser rejects missing or duplicate headers", () => {
  assert.throws(() => parsePayableSheet([["Vendor"]]), /Missing/);
  assert.throws(() => parsePayableSheet([["Vendor", "Bill Number", "Bill Date", "Due Date", "Amount", "Amount"]]), /Duplicate/);
});

test("shared Purchase/manual account validation preserves settlement alias and enforces From direction", () => {
  const accounts = [
    { id: 1, accountCode: "2100", accountName: "Accounts Payable", isActive: true },
    { id: 2, accountCode: "1099", accountName: "Real disbursement account", isActive: true }
  ];
  assert.equal(disbursementAccounts({ settlementAccountId: 2 }, accounts).settlement.id, 2);
  assert.equal(disbursementAccounts({ fromAccountId: 2, toAccountId: 1 }, accounts).payable.id, 1);
  assert.throws(() => disbursementAccounts({ fromAccountId: 1, toAccountId: 2 }, accounts), /From Account/);
  assert.throws(() => disbursementAccounts({ fromAccountId: 2, toAccountId: 1, settlementAccountId: 1 }, accounts), /conflicts/);
});

test("manual bill creation with historical paid amount does not fabricate payment", async () => {
  const {f} = await payableFixture();
  const result = await f.call("post", "/ap", {
    vendorId: 8, billNumber: "HISTORY", billDate: "2026-09-01", dueDate: "2026-09-30",
    amount: 1000, paidAmount: 200, sourceType: "Manual"
  });
  assert.equal(result.statusCode, 201);
  assert.equal(result.body.paidAmount, 200);
  assert.equal(f.rows("journalEntriesTable").length, 0);
});

test("manual vendor ledger does not borrow Purchase events with colliding source IDs", async () => {
  const {f} = await payableFixture();
  f.rows("accountsPayableTable")[0].sourceId = 99;
  f.rows("purchasePaymentsTable").push({ id: 1, invoiceId: 99, paymentDate: "2026-09-07", amount: 100 });
  const result = await f.call("get", "/vendor-ledger");
  assert.equal(result.body[0].records[0].payments.length, 0);
});

test("Account 2100 retains real AP payment journal lines for LIVE-AP-PARTIAL-003-P1/P2/P3 with preserved dates, debits, references, and no duplicate synthetic payment rows", async () => {
  const {f} = await payableFixture();
  const apAccount = f.rows("chartOfAccountsTable").find(row => row.accountCode === "2100");
  const bankAccount = f.rows("chartOfAccountsTable").find(row => row.accountCode === "1099");

  // Setup bill LIVE-AP-PARTIAL-003
  f.rows("accountsPayableTable").push({
    id: 8,
    organizationId: 1,
    sourceType: "Manual",
    entryType: "Bill",
    vendorId: 8,
    vendorName: "Praneesh AP",
    billNumber: "LIVE-AP-PARTIAL-003",
    billDate: "2026-09-09",
    dueDate: "2026-09-30",
    amount: 10000,
    paidAmount: 0,
    adjustedAmount: 0,
    approvalStatus: "Approved"
  });

  // 1. P1: 2026-09-09, Debit ₹3,000
  const r1 = await f.call("post", "/ap/:id/payment", {
    amount: 3000,
    paymentDate: "2026-09-09",
    fromAccountId: bankAccount.id,
    toAccountId: apAccount.id,
    reference: "LIVE-AP-PARTIAL-003-P1",
    paymentId: "p1",
    paymentMethod: "Bank Transfer",
    notes: "Live AP Partial Payment 3000"
  }, { id: 8 });
  assert.equal(r1.statusCode, 201);

  // 2. P2: 2026-09-03, Debit ₹2,000
  const r2 = await f.call("post", "/ap/:id/payment", {
    amount: 2000,
    paymentDate: "2026-09-03",
    fromAccountId: bankAccount.id,
    toAccountId: apAccount.id,
    reference: "LIVE-AP-PARTIAL-003-P2",
    paymentId: "p2",
    paymentMethod: "Bank Transfer",
    notes: "Live AP Partial Payment 2000"
  }, { id: 8 });
  assert.equal(r2.statusCode, 201);

  // 3. P3: 2026-09-04, Debit ₹5,000
  const r3 = await f.call("post", "/ap/:id/payment", {
    amount: 5000,
    paymentDate: "2026-09-04",
    fromAccountId: bankAccount.id,
    toAccountId: apAccount.id,
    reference: "LIVE-AP-PARTIAL-003-P3",
    paymentId: "p3",
    paymentMethod: "Bank Transfer",
    notes: "Live AP Partial Payment 5000"
  }, { id: 8 });
  assert.equal(r3.statusCode, 201);

  // Check GET /coa
  const fresh = f.reload();
  const coaRes = await fresh.call("get", "/coa");
  const ap = coaRes.body.find(row => row.accountCode === "2100");
  assert.ok(ap, "Account 2100 exists in COA");

  const targetLines = ap.lines.filter(l =>
    String(l.reference || "").includes("LIVE-AP-PARTIAL-003") ||
    String(l.referenceId || "").includes("LIVE-AP-PARTIAL-003") ||
    String(l.metadata?.documentReference || "").includes("LIVE-AP-PARTIAL-003")
  );

  // Must have 4 lines: 1 bill credit + 3 payment debits
  assert.equal(targetLines.length, 4, `Expected 4 target lines, got ${targetLines.length}`);

  const p2 = targetLines.find(l => (l.referenceId || l.reference || "").includes("LIVE-AP-PARTIAL-003-P2"));
  assert.ok(p2, "LIVE-AP-PARTIAL-003-P2 appears in ledger movement");
  assert.equal(p2.debit, 2000);
  assert.equal(p2.credit, 0);
  assert.equal(p2.paymentDate || p2.date, "2026-09-03");
  assert.equal(p2.partyName, "Praneesh AP");
  assert.equal(p2.source, "Payables");
  assert.equal(p2.paymentMethod, "Bank Transfer");

  const p3 = targetLines.find(l => (l.referenceId || l.reference || "").includes("LIVE-AP-PARTIAL-003-P3"));
  assert.ok(p3, "LIVE-AP-PARTIAL-003-P3 appears in ledger movement");
  assert.equal(p3.debit, 5000);
  assert.equal(p3.credit, 0);
  assert.equal(p3.paymentDate || p3.date, "2026-09-04");
  assert.equal(p3.partyName, "Praneesh AP");
  assert.equal(p3.source, "Payables");
  assert.equal(p3.paymentMethod, "Bank Transfer");

  const p1 = targetLines.find(l => (l.referenceId || l.reference || "").includes("LIVE-AP-PARTIAL-003-P1"));
  assert.ok(p1, "LIVE-AP-PARTIAL-003-P1 appears in ledger movement");
  assert.equal(p1.debit, 3000);
  assert.equal(p1.credit, 0);
  assert.equal(p1.paymentDate || p1.date, "2026-09-09");
  assert.equal(p1.partyName, "Praneesh AP");
  assert.equal(p1.source, "Payables");
  assert.equal(p1.paymentMethod, "Bank Transfer");

  const bill = targetLines.find(l => l.credit === 10000);
  assert.ok(bill, "Bill credit line appears in ledger movement");
  assert.equal(bill.debit, 0);
  assert.equal(bill.partyName, "Praneesh AP");
  assert.equal(bill.source, "Payables");

  // No duplicate synthetic payments
  const syntheticPayments = targetLines.filter(l => l.id && String(l.id).startsWith("ap-hist-pay"));
  assert.equal(syntheticPayments.length, 0, "No duplicate synthetic payment rows created");
});

test("Payables Excel import parses 10-column file, validates, imports LIVE-AP-EXCEL-FINAL-001, posts Dr 2100 / Cr 31002, and protects against duplicates", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  f.rows("contactsTable").push({ id: 2, type: "vendor", name: "Praneesh AP", contactCode: "V2" });
  f.rows("chartOfAccountsTable").push(
    { id: 38, organizationId: 1, accountCode: "31002", accountName: "Test Bank Account", accountType: "Asset", isActive: true, currentBalance: 0, openingBalance: 0 }
  );

  const rawSheetData = [
    ["Vendor *", "Bill Number *", "Bill Date *", "Due Date *", "Amount *", "Paid Amount", "Payment Date", "From Account", "To Account", "Notes"],
    ["Praneesh AP", "LIVE-AP-EXCEL-FINAL-001", "2026-09-09", "2026-09-30", "5000", "5000", "2026-09-09", "31002 - Test Bank Account", "2100 - Accounts Payable", "Final AP Excel Test"]
  ];

  const parsed = parsePayableSheet(rawSheetData);
  assert.equal(parsed.length, 1, "Parser returns exactly 1 row");
  assert.equal(parsed[0].vendor, "Praneesh AP");
  assert.equal(parsed[0].billNumber, "LIVE-AP-EXCEL-FINAL-001");
  assert.equal(parsed[0].amount, "5000");
  assert.equal(parsed[0].paidAmount, "5000");
  assert.equal(parsed[0].fromAccount, "31002 - Test Bank Account");
  assert.equal(parsed[0].toAccount, "2100 - Accounts Payable");

  // Post import
  const res = await f.call("post", "/ap/import", { rows: parsed });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.created, 1);

  // Verify created bill
  const bills = f.rows("accountsPayableTable");
  const bill = bills.find(b => b.billNumber === "LIVE-AP-EXCEL-FINAL-001");
  assert.ok(bill, "Bill exists in database");
  assert.equal(bill.vendorName, "Praneesh AP");
  assert.equal(bill.amount, 5000);
  assert.equal(bill.paidAmount, 5000);
  assert.equal(bill.status, "Paid");

  // Verify payment journal entry
  const journals = f.rows("journalEntriesTable");
  const apJournals = journals.filter(j =>
    String(j.reference || "").includes("LIVE-AP-EXCEL-FINAL-001") ||
    String(j.description || "").includes("LIVE-AP-EXCEL-FINAL-001") ||
    String(j.metadata?.documentReference || "").includes("LIVE-AP-EXCEL-FINAL-001")
  );
  assert.equal(apJournals.length, 1, "Payment is posted exactly once in journal");
  const pJournal = apJournals[0];
  assert.equal(pJournal.entryDate, "2026-09-09");
  assert.equal(pJournal.totalDebit, 5000);
  assert.equal(pJournal.totalCredit, 5000);

  const jLines = f.rows("journalLinesTable").filter(l => l.journalEntryId === pJournal.id);
  assert.equal(jLines.length, 2);

  const apAccount = f.rows("chartOfAccountsTable").find(a => a.accountCode === "2100");
  const bankAccount = f.rows("chartOfAccountsTable").find(a => a.accountCode === "31002");

  const drLine = jLines.find(l => l.accountId === apAccount.id);
  assert.ok(drLine, "Dr Accounts Payable 2100 exists");
  assert.equal(drLine.debit, 5000);
  assert.equal(drLine.credit, 0);

  const crLine = jLines.find(l => l.accountId === bankAccount.id);
  assert.ok(crLine, "Cr Test Bank Account 31002 exists");
  assert.equal(crLine.debit, 0);
  assert.equal(crLine.credit, 5000);

  // Duplicate import attempt must not duplicate payment or journal
  const dupRes = await f.call("post", "/ap/import", { rows: parsed });
  assert.equal(dupRes.statusCode, 400);
  assert.match(dupRes.body.error, /already exists/i);

  const journalsAfterDup = f.rows("journalEntriesTable").filter(j =>
    String(j.reference || "").includes("LIVE-AP-EXCEL-FINAL-001") ||
    String(j.description || "").includes("LIVE-AP-EXCEL-FINAL-001") ||
    String(j.metadata?.documentReference || "").includes("LIVE-AP-EXCEL-FINAL-001")
  );
  assert.equal(journalsAfterDup.length, 1, "Duplicate import did not duplicate payment/journal");
});

test("legacy 8-column Payables Excel format still works without payment fields", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  f.rows("contactsTable").push({ id: 2, type: "vendor", name: "Praneesh AP", contactCode: "V2" });

  const legacySheetData = [
    ["Vendor *", "Bill Number *", "Bill Date *", "Due Date *", "Amount *", "Paid Amount", "Adjusted Amount", "Notes"],
    ["Praneesh AP", "LEGACY-AP-BILL-001", "2026-09-01", "2026-09-20", "2500", "0", "0", "Legacy import test"]
  ];

  const parsed = parsePayableSheet(legacySheetData);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].billNumber, "LEGACY-AP-BILL-001");
  assert.equal(parsed[0].paymentFieldsPresent, false);

  const res = await f.call("post", "/ap/import", { rows: parsed });
  assert.equal(res.statusCode, 201);

  const bill = f.rows("accountsPayableTable").find(b => b.billNumber === "LEGACY-AP-BILL-001");
  assert.ok(bill);
  assert.equal(bill.amount, 2500);
  assert.equal(bill.paidAmount, 0);
  assert.equal(bill.status, "Pending");
});

test("parsePayableSheet handles formatted amounts with commas and currency symbols, slash/dash dates, and extra header spacing", async () => {
  const rawSheetData = [
    ["  Vendor * ", "Bill Number *  ", "Bill Date *", "Due Date *", " Amount * ", "Paid Amount ", "Payment Date", "From Account", "To Account", "Notes"],
    ["Praneesh AP", "FMT-AP-BILL-001", "09/09/2026", "2026/09/30", "₹5,000.00", "5,000", "09-09-2026", "31002 - Test Bank Account", "2100 - Accounts Payable", "Formatted test"]
  ];

  const parsed = parsePayableSheet(rawSheetData);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].amount, "5000.00");
  assert.equal(parsed[0].paidAmount, "5000");
  assert.equal(parsed[0].billDate, "2026-09-09");
  assert.equal(parsed[0].dueDate, "2026-09-30");
  assert.equal(parsed[0].paymentDate, "2026-09-09");
});

