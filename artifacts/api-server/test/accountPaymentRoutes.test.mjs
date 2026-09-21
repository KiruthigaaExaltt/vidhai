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
    rows("chartOfAccountsTable").push({ id: 100, organizationId: 1, accountCode: "1099", accountName: "Custom Bank", accountType: "Asset", isActive: true, currentBalance: 0, openingBalance: 0 });
    rows("contactsTable").push({ id: 7, type: "client", name: "Client A", contactCode: "C7" });
  }
  return { call, rows, reload: () => fixture(data), fail: (name) => { failTable = name; }, decorate: module.exports.decorateHistoryLines, post: module.exports.postJournal };
}
const input = { bankCashAccountId: 100, amount: "100", transactionDate: "2026-09-07", reference: "INV-1", creditName: "Client A", debitName: "Client A", clientId: 7, paymentMethod: "UPI", notes: "Payment note", period: "Sep", bankCharges: "5", transactionFees: "2" };

test("INV-1001 settles with 3000 + 2000 + 5000, three journals and reloaded receipt history", async () => {
  const f = fixture();
  f.rows("accountsReceivableTable").push({ id: 10, organizationId: 1, sourceType: "Manual", clientId: 7, clientName: "Client A", invoiceNumber: "INV-1001", amount: 10000, receivedAmount: 0, adjustedAmount: 0 });
  const ids = [];
  let total = 0;
  for (const amount of [3000, 2000, 5000]) {
    total += amount;
    const result = await f.call("post", "/ar/:id/payment", { amount, settlementAccountId: 100, paymentDate: "2026-09-07", paymentMethod: "Bank Transfer", reference: "INV-1001", notes: `Receipt ${amount}`, period: "Sep", bankCharges: "", transactionFees: "", receiptId: `part-${amount}` }, { id: 10 });
    assert.equal(result.statusCode, 201);
    assert.equal(result.body.receivable.receivedAmount, total);
    ids.push(result.body.journalEntryId);
  }
  assert.equal(new Set(ids).size, 3);
  const reloaded = f.reload();
  const row = (await reloaded.call("get", "/ar")).body.items[0];
  assert.equal(row.status, "Received");
  assert.equal(Number(row.amount) - Number(row.receivedAmount) - Number(row.adjustedAmount), 0);
  assert.equal(row.paymentHistory.length, 3);
  assert.deepEqual(row.paymentHistory.map((payment) => payment.amount).sort((a, b) => a - b), [2000, 3000, 5000]);
  assert.ok(row.paymentHistory.every((payment) => payment.reference === "INV-1001" && payment.period === "Sep" && payment.clientName === "Client A" && payment.paymentMethod === "Bank Transfer" && payment.paymentDate === "2026-09-07" && payment.notes.startsWith("Receipt ")));
  assert.equal(Number(reloaded.rows("chartOfAccountsTable").find((account) => account.id === 100).currentBalance), 10000);
  const history = (await reloaded.call("get", "/coa")).body.find((account) => account.id === 100).lines;
  assert.equal(history.length, 3);
  assert.deepEqual(history.map((line) => line.runningBalance), [3000, 5000, 10000]);
});

test("Credit, Debit and Transfer with blank fees preserve principal balances and reload fields", async () => {
  for (const mode of ["Credit", "Debit", "Transfer"]) {
    const f = fixture();
    f.rows("chartOfAccountsTable").push({ id: 101, organizationId: 1, accountCode: "1098", accountName: "Second Bank", accountType: "Asset", isActive: true, currentBalance: 0, openingBalance: 0 });
    const result = await f.call("post", "/bank-cash-transactions", { ...input, mode, bankCharges: "", transactionFees: "", transferToAccountId: 101 });
    assert.equal(result.statusCode, 201);
    assert.equal(f.rows("journalEntriesTable").length, 0);
    assert.equal(Number(f.rows("chartOfAccountsTable").find((account) => account.id === 100).currentBalance), 0);
    await f.call("post", "/bank-cash-transactions/:id/approve", {}, { id: result.body.id });
    const journal = f.rows("journalEntriesTable")[0];
    assert.equal(journal.totalDebit, 100);
    assert.equal(journal.totalCredit, 100);
    assert.equal(Number(f.rows("chartOfAccountsTable").find((account) => account.id === 100).currentBalance), mode === "Credit" ? 100 : -100);
    const row = (await f.reload().call("get", "/bank-cash-transactions")).body[0];
    assert.equal(row.mode, mode);
    assert.equal(row.clientName, "Client A");
    assert.equal(row.paymentMethod, "UPI");
    assert.equal(row.reference, "INV-1");
    assert.equal(row.notes, "Payment note");
    assert.equal(row.period, "Sep");
    assert.equal(row.bankCharges, 0);
    assert.equal(row.transactionFees, 0);
  }
});

test("legacy records and payload aliases remain readable and usable", async () => {
  const f = fixture();
  f.rows("bankCashTransactionsTable").push({ id: 20, organizationId: 1, mode: "Credit", transactionDate: "2025-01-01", bankCashAccountId: 100, amount: 10, reference: "OLD", remarks: "Old note" });
  f.rows("bankCashTransactionsTable").push({ id: 21, organizationId: 1, mode: "Debit", transactionDate: "2025-01-02", bankCashAccountId: 100, amount: 10, reference: "OLD2", paymentMethod: "UPI / NetBanking" });
  const rows = (await f.call("get", "/bank-cash-transactions")).body;
  assert.equal(rows.find((row) => row.id === 20).paymentMethod, "");
  assert.equal(rows.find((row) => row.id === 20).bankCharges, 0);
  assert.equal(rows.find((row) => row.id === 21).paymentMethod, "UPI / NetBanking");
  for (const [dateKey, refKey] of [["entryDate", "referenceId"], ["date", "invoiceNumber"], ["paymentDate", "documentReference"]]) {
    const result = await f.call("post", "/bank-cash-transactions", { type: "debit", debitName: "Client A", fromChartOfAccount: "Custom Bank", amount: 1, [dateKey]: "2026-09-07", [refKey]: "DOC", paymentMode: "Cash", notes: "Alias" });
    assert.equal(result.statusCode, 201);
    assert.equal(result.body.reference, "DOC");
    assert.equal(result.body.transactionDate, "2026-09-07");
    assert.equal(result.body.remarks, "Alias");
  }
});

test("new COA creation refreshes options; duplicate client names use IDs and expose only option fields", async () => {
  const f = fixture();
  const created = await f.call("post", "/coa", { accountCode: "1999", accountName: "Fresh ledger", accountType: "Asset" });
  assert.equal(created.statusCode, 201);
  f.rows("chartOfAccountsTable").push({ id: 900, organizationId: 1, accountCode: "9990", accountName: "Inactive ledger", accountType: "Asset", isActive: false });
  f.rows("contactsTable").push({ id: 8, type: "client", name: "Client A", contactCode: "C8" });
  const options = (await f.call("get", "/bank-cash-transactions/options", {}, {}, ["accounts.bank_cash.view"])).body;
  assert.ok(options.accounts.some((account) => account.accountName === "Fresh ledger"));
  assert.ok(!options.accounts.some((account) => account.id === 900));
  assert.ok(options.accounts.every((account) => account.lines === undefined && account.currentBalance === undefined && account.bankAccountNumber === undefined));
  assert.equal(options.clients.length, 2);
  const result = await f.call("post", "/bank-cash-transactions", { ...input, creditName: "", clientId: 8 });
  assert.equal(result.body.clientId, 8);
});

test("invalid manual and Excel values are rejected without inserting payment rows", async () => {
  const f = fixture();
  f.rows("chartOfAccountsTable").push({ id: 900, organizationId: 1, accountCode: "9990", accountName: "Inactive", accountType: "Asset", isActive: false });
  for (const patch of [{ bankCashAccountId: 900 }, { bankCashAccountId: 9999 }, { creditName: "Unknown Client" }, { clientId: 9999 }, { clientId: 0 }, { amount: "bad" }, { amount: -1 }, { paymentMethod: "Other" }, { transactionDate: "2026-02-30" }, { bankCharges: -1 }, { transactionFees: "bad" }, { transactionFees: -1 }]) {
    assert.equal((await f.call("post", "/bank-cash-transactions", { ...input, ...patch })).statusCode, 400);
    const imported = await f.call("post", "/bank-cash-transactions/import", { rows: [{ ...input, mode: "Credit", ...patch, rowNumber: 42 }] });
    assert.equal(imported.statusCode, 400);
    assert.match(imported.body.error, /Row 42/);
  }
  assert.equal(f.rows("bankCashTransactionsTable").length, 0);
});

test("Excel import accepts 5000 rows and rejects 5001 without partial inserts", async () => {
  const f = fixture();
  const rows = Array.from({ length: 5000 }, (_, i) => ({ ...input, mode: "Credit", rowNumber: i + 2 }));
  assert.equal((await f.call("post", "/bank-cash-transactions/import", { rows: [...rows, rows[0]] })).statusCode, 400);
  assert.equal(f.rows("bankCashTransactionsTable").length, 0);
  const imported = await f.call("post", "/bank-cash-transactions/import", { rows });
  assert.equal(imported.statusCode, 201);
  assert.equal(imported.body.created, 5000);
  assert.equal(f.rows("bankCashTransactionsTable").length, 5000);
});

test("create/read/export preserve all payment fields and options include new COA accounts", async () => {
  const f = fixture();
  const create = await f.call("post", "/bank-cash-transactions", input);
  assert.equal(create.statusCode, 201);
  assert.equal(create.body.remarks, "Payment note");
  const list = await f.call("get", "/bank-cash-transactions");
  assert.equal(list.body[0].accountName, "Custom Bank");
  assert.equal(list.body[0].clientName, "Client A");
  assert.equal(list.body[0].paymentDate, input.transactionDate);
  assert.equal(list.body[0].paymentMethod, "UPI");
  assert.equal(list.body[0].bankCharges, 5);
  assert.equal(list.body[0].transactionFees, 2);
  assert.equal(list.body[0].period, "Sep");
  assert.equal(list.body[0].notes, "Payment note");
  const exported = await f.call("get", "/bank-cash-transactions/export");
  assert.equal(exported.body.rows[0].Reference, "INV-1");
  assert.equal(exported.body.rows[0].Notes, "Payment note");
  const options = await f.call("get", "/bank-cash-transactions/options", {}, {}, ["accounts.bank_cash.view"]);
  assert.ok(options.body.accounts.some((row) => row.id === 100));
  assert.equal(options.body.clients[0].id, 7);
  f.rows("chartOfAccountsTable").push({ id: 900, organizationId: 1, accountCode: "1098", accountName: "New Account", accountType: "Asset", isActive: true });
  const refreshed = await f.call("get", "/bank-cash-transactions/options");
  assert.ok(refreshed.body.accounts.some((row) => row.id === 900));
  assert.equal((await f.call("get", "/bank-cash-transactions/options", {}, {}, [])).statusCode, 403);
});
test("Credit, Debit and Transfer approval balance charges and retries do not repost", async () => {
  for (const mode of ["Credit", "Debit", "Transfer"]) {
    const f = fixture();
    f.rows("chartOfAccountsTable").push({ id: 101, organizationId: 1, accountCode: "1098", accountName: "Destination", accountType: "Asset", isActive: true });
    const created = await f.call("post", "/bank-cash-transactions", { ...input, mode, transferToAccountId: 101 });
    const params = { id: created.body.id };
    const approved = await f.call("post", "/bank-cash-transactions/:id/approve", {}, params);
    assert.equal(approved.statusCode, 200);
    const lines = f.rows("journalLinesTable");
    assert.equal(lines.reduce((sum, line) => sum + line.debit - line.credit, 0), 0);
    assert.equal(lines.filter((line) => line.accountCode === "5150").reduce((sum, line) => sum + line.debit, 0), 5);
    assert.equal(Number(f.rows("chartOfAccountsTable").find((row) => row.id === 100).currentBalance), mode === "Credit" ? 95 : -105);
    await f.call("post", "/bank-cash-transactions/:id/approve", {}, params);
    assert.equal(f.rows("journalEntriesTable").length, 2);
    assert.equal((await f.call("post", "/bank-cash-transactions/:id/reject", { remarks: "No" }, params)).statusCode, 409);
  }
});
test("two transactions with the same document reference have distinct journals", async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) {
    const created = await f.call("post", "/bank-cash-transactions", input);
    await f.call("post", "/bank-cash-transactions/:id/approve", {}, { id: created.body.id });
  }
  const journals = f.rows("journalEntriesTable");
  assert.equal(journals.length, 4);
  assert.notEqual(journals[0].reference, journals[1].reference);
  assert.ok(journals.every((row) => row.metadata.documentReference === "INV-1"));
});
test("rejection and approval permissions preserve tenant and posting boundaries", async () => {
  const f = fixture();
  const created = await f.call("post", "/bank-cash-transactions", input);
  const params = { id: created.body.id };
  assert.equal((await f.call("post", "/bank-cash-transactions/:id/approve", {}, params, [])).statusCode, 403);
  assert.equal((await f.call("post", "/bank-cash-transactions/:id/reject", { remarks: "No" }, params, ["*"], 2)).statusCode, 404);
  assert.equal((await f.call("post", "/bank-cash-transactions/:id/reject", { remarks: "No" }, params)).body.approvalStatus, "Rejected");
  assert.equal((await f.call("post", "/bank-cash-transactions/:id/reject", { remarks: "No" }, params)).statusCode, 200);
  assert.equal((await f.call("post", "/bank-cash-transactions/:id/approve", {}, params)).statusCode, 409);
  assert.equal(f.rows("journalEntriesTable").length, 0);
});
test("import validates every row before writing, allows partial payment references, and preserves metadata", async () => {
  const f = fixture();
  const valid = { ...input, bankCashAccount: "Custom Bank", mode: "Credit", clientName: "Client A", rowNumber: 2 };
  const invalid = await f.call("post", "/bank-cash-transactions/import", { rows: [valid, { ...valid, rowNumber: 4, bankCharges: "bad" }] });
  assert.equal(invalid.statusCode, 400);
  assert.match(invalid.body.error, /Row 4.*Bank Charges/);
  assert.equal(f.rows("bankCashTransactionsTable").length, 0);
  assert.equal((await f.call("post", "/bank-cash-transactions/import", { rows: [valid, valid] })).statusCode, 201);
  assert.equal(f.rows("bankCashTransactionsTable").length, 2);
  assert.ok(f.rows("bankCashTransactionsTable").every((row) => row.reference === "INV-1" && row.transactionFees === 2));
});
test("manual AR partial receipts have distinct identities; retry is idempotent and write failure rolls back", async () => {
  const f = fixture();
  f.rows("accountsReceivableTable").push({ id: 10, organizationId: 1, sourceType: "Manual", clientId: 7, clientName: "Client A", invoiceNumber: "INV-AR", amount: 300, receivedAmount: 0, adjustedAmount: 0 });
  const body = { amount: 100, settlementAccountId: 100, paymentDate: "2026-09-07", paymentMethod: "Cheque", reference: "INV-AR", notes: "Manual note", bankCharges: 5, period: "Sep", transactionFees: 2, receiptId: "receipt-one" };
  const first = await f.call("post", "/ar/:id/payment", body, { id: 10 });
  assert.equal(first.statusCode, 201);
  const second = await f.call("post", "/ar/:id/payment", { ...body, receiptId: "receipt-two" }, { id: 10 });
  assert.notEqual(first.body.journalEntryId, second.body.journalEntryId);
  assert.equal(second.body.receivable.receivedAmount, 200);
  const retry = await f.call("post", "/ar/:id/payment", body, { id: 10 });
  assert.equal(retry.body.journalEntryId, first.body.journalEntryId);
  assert.equal(retry.body.receivable.receivedAmount, 200);
  assert.equal((await f.call("post", "/ar/:id/payment", { ...body, amount: 50 }, { id: 10 })).statusCode, 409);
  assert.equal(f.rows("journalEntriesTable").length, 2);
  assert.equal(first.body.payment.notes, "Manual note");
  assert.equal(first.body.payment.paymentMethod, "Cheque");
  assert.equal(first.body.payment.transactionFees, 2);
  const history = await f.call("get", "/ar");
  const receiptHistory = history.body.items[0].paymentHistory;
  assert.equal(receiptHistory.length, 2);
  assert.equal(receiptHistory[0].reference, "INV-AR");
  assert.equal(receiptHistory[0].accountName, "Custom Bank");
  assert.equal(receiptHistory[0].notes, "Manual note");
  f.fail("journalLinesTable");
  assert.equal((await f.call("post", "/ar/:id/payment", { ...body, receiptId: "receipt-three" }, { id: 10 })).statusCode, 400);
  assert.equal(f.rows("journalEntriesTable").length, 2);
  assert.equal(f.rows("accountsReceivableTable")[0].receivedAmount, 200);
});
test("history uses explicit receipt relationships and exposes document reference, method and notes", () => {
  const f = fixture();
  const accounts = [{ accountName: "Custom Bank", lines: [
    { sourceType: "Manual AR Receipt", sourceId: 999, reference: "INTERNAL", metadata: { arId: 10, documentReference: "INV-AR", paymentMethod: "Cash", notes: "Receipt note" }, entryDate: "2026-09-07", runningBalance: 95, debit: 95 },
    { sourceType: "Bank Cash Transaction", sourceId: 10, reference: "INTERNAL2", metadata: { clientId: 7, documentReference: "DOC", notes: "Bank note" } },
  ] }];
  f.decorate(accounts, [{ id: 10, clientId: 7, clientName: "Client A" }], [], [], [], f.rows("contactsTable"));
  const [receipt, bank] = accounts[0].lines;
  assert.equal(receipt.partyName, "Client A");
  assert.equal(receipt.accountName, "Custom Bank");
  assert.equal(receipt.referenceId, "INV-AR");
  assert.equal(receipt.paymentMethod, "Cash");
  assert.equal(receipt.notes, "Receipt note");
  assert.equal(receipt.paymentDate, "2026-09-07");
  assert.equal(receipt.runningBalance, 95);
  assert.equal(bank.referenceId, "DOC");
});

test("legacy aggregate AR/AP history preserves party identity and balances", () => {
  const f = fixture();
  const accounts = [{ accountName: "Aggregate", lines: [
    { sourceType: "Manual AR", sourceId: 1, reference: "AR-1", debit: 60, runningBalance: 60 },
    { sourceType: "Manual AP", sourceId: 2, reference: "AP-1", credit: 50, runningBalance: 50 },
    { sourceType: "Sales Invoice", sourceId: 1, reference: "SALES-1", credit: 10, runningBalance: 10 },
  ] }];
  f.decorate(accounts, [{ id: 1, clientName: "Manual Client", invoiceNumber: "AR-1" }, { id: 3, sourceType: "Sales Invoice", sourceId: 1, clientName: "Sales Client", invoiceNumber: "SALES-1" }], [{ id: 2, vendorName: "Vendor", billNumber: "AP-1" }]);
  assert.deepEqual(accounts[0].lines.map((line) => line.partyName), ["Manual Client", "Vendor", "Sales Client"]);
  assert.deepEqual(accounts[0].lines.map((line) => line.runningBalance), [60, 50, 10]);
});

test("multi-level approval retains its order and posting failure can be retried", async () => {
  const f = fixture();
  const created = await f.call("post", "/bank-cash-transactions", input);
  f.rows("bankCashTransactionsTable")[0].requiredApprovals = 2;
  const params = { id: created.body.id };
  assert.equal((await f.call("post", "/bank-cash-transactions/:id/approve", {}, params)).body.approvalLevel, 1);
  assert.equal(f.rows("journalEntriesTable").length, 0);
  assert.equal((await f.call("post", "/bank-cash-transactions/:id/approve", {}, params)).statusCode, 409);
  f.fail("journalLinesTable");
  await assert.rejects(f.call("post", "/bank-cash-transactions/:id/approve", {}, params, ["*"], 1, {}, 2), /Injected/);
  assert.equal(f.rows("journalEntriesTable").length, 0);
  f.fail("");
  assert.equal((await f.call("post", "/bank-cash-transactions/:id/approve", {}, params, ["*"], 1, {}, 2)).body.approvalStatus, "Approved");
  assert.equal(f.rows("journalEntriesTable").length, 2);
});
test("existing AP, AR, debit/credit note and journal imports and exports still work", async () => {
  const f = fixture();
  f.rows("contactsTable").push({ id: 8, name: "Vendor A", type: "vendor" });
  const bill = { vendor: "Vendor A", billNumber: "BILL-1", billDate: "2026-09-07", dueDate: "2026-09-30", amount: 100, paidAmount: 50, notes: "Bill note" };
  const invoice = { customer: "Client A", invoiceNumber: "AR-1", invoiceDate: "2026-09-07", dueDate: "2026-09-30", amount: 100, receivedAmount: 50, notes: "Invoice note" };
  assert.equal((await f.call("post", "/ap/import", { rows: [bill] })).statusCode, 201);
  assert.equal((await f.call("post", "/ar/import", { rows: [invoice] })).statusCode, 201);
  assert.equal((await f.call("post", "/ap/import", { rows: [{ ...bill, entryType: "Debit Note", billNumber: "DN-1", againstBillNumber: "BILL-1", amount: 10, accountName: "Custom Bank" }] })).statusCode, 201);
  assert.equal((await f.call("post", "/ar/import", { rows: [{ ...invoice, entryType: "Credit Note", invoiceNumber: "CN-1", linkedInvoiceNumber: "AR-1", amount: 10, accountName: "Custom Bank" }] })).statusCode, 201);
  assert.equal((await f.call("post", "/journal-entries/import", { rows: [{ entryDate: "2026-09-07", reference: "JE-TEST", description: "Journal", debitAccount: "Custom Bank", creditAccount: "Capital", amount: 10, memo: "Memo", notes: "Journal note" }] })).statusCode, 201);
  const ap = await f.call("get", "/ap/export");
  const ar = await f.call("get", "/ar/export");
  const journals = await f.call("get", "/journal-entries/export");
  assert.equal(ap.body.rows.find((row) => row.billNumber === "BILL-1").notes, "Bill note");
  assert.equal(ar.body.rows.find((row) => row.invoiceNumber === "AR-1").notes, "Invoice note");
  assert.equal(journals.body.rows.find((row) => row.reference === "JE-TEST").metadata.notes, "Journal note");
  assert.equal((await f.call("get", "/financial-statements")).statusCode, 200);
  assert.equal((await f.call("get", "/dashboard-summary")).statusCode, 200);
});
test("shared Sales, Vendor and Crew journal identities retain their existing behavior", async () => {
  const f = fixture();
  for (const sourceType of ["Customer Payment", "Vendor Payment", "Crew Claim"]) {
    const body = { sourceType, sourceId: 1, reference: `${sourceType}-1`, entryDate: "2026-09-07", lines: [{ accountId: 100, debit: 10 }, { accountId: 100, credit: 10 }] };
    const first = await f.post(1, body, 1);
    const repeat = await f.post(1, body, 1);
    assert.equal(first.id, repeat.id);
  }
  assert.equal(f.rows("journalEntriesTable").length, 3);
});

test("option scopes use the calling module without bypassing normal Ledger protection", async () => {
  const registration = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  const scope = registration.slice(registration.indexOf("const accountsScope ="), registration.indexOf("const router: IRouter"));
  const output = await build({ stdin: { contents: 'const segment = path => path.split("/").filter(Boolean)[0];\n' + scope + "\nexport { accountsScope };", loader: "ts" }, write: false, format: "cjs", platform: "node" });
  const module = { exports: {} };
  new Function("module", "exports", output.outputFiles[0].text)(module, module.exports);
  const resolve = (path, context) => module.exports.accountsScope({ path, query: { context } });
  assert.equal(resolve("/bank-cash-transactions/options"), "accounts.bank_cash");
  assert.equal(resolve("/payment-accounts", "ar"), "accounts.accounts_receivable");
  assert.equal(resolve("/payment-accounts", "ap"), "accounts.accounts_payable");
  assert.equal(resolve("/import-options", "journal"), "accounts.journal_entries");
  assert.equal(resolve("/party-options", "ar"), "accounts.accounts_receivable");
  assert.equal(resolve("/import-options", "unknown"), "accounts.finance_dashboard");
  assert.equal(resolve("/payment-accounts"), "accounts.finance_dashboard");
});

test("GET /api/accounts/coa and GET /api/accounts/dashboard-summary return 200 without ReferenceError for clients", async () => {
  const f = fixture();
  f.rows("contactsTable").push({ id: 10, name: "Test Client", type: "client" });
  f.rows("chartOfAccountsTable").push({ id: 100, accountCode: "1030", accountName: "Cash in Hand", accountType: "Asset", organizationId: 1, isActive: true });
  f.rows("journalEntriesTable").push({ id: 1, organizationId: 1, sourceType: "Bank Cash Transaction", sourceId: 5, reference: "BC-1", metadata: { clientId: 10 } });
  f.rows("journalLinesTable").push({ id: 1, organizationId: 1, journalEntryId: 1, accountId: 100, accountCode: "1030", accountName: "Cash in Hand", debit: 500, credit: 0 });

  const coaRes = await f.call("get", "/coa");
  assert.equal(coaRes.statusCode, 200);
  assert.ok(Array.isArray(coaRes.body));

  const dashRes = await f.call("get", "/dashboard-summary");
  assert.equal(dashRes.statusCode, 200);
});

test("Bank & Cash transaction auto-generates reference when empty", async () => {
  const f = fixture();
  const res = await f.call("post", "/bank-cash-transactions", {
    mode: "Credit",
    bankCashAccountId: 100,
    creditName: "Client A",
    amount: "150",
    transactionDate: "2026-09-08",
    reference: ""
  });
  assert.equal(res.statusCode, 201);
  assert.ok(res.body.reference.startsWith("BC-"));
});

test("Bank & Cash endpoints enforce mode-specific CRM requirements", async () => {
  const f = fixture();
  // Credit without Credit Name fails
  const creditFail = await f.call("post", "/bank-cash-transactions", {
    mode: "Credit",
    bankCashAccountId: 100,
    amount: "100",
    transactionDate: "2026-09-08"
  });
  assert.equal(creditFail.statusCode, 400);

  // Debit without Debit Name fails
  const debitFail = await f.call("post", "/bank-cash-transactions", {
    mode: "Debit",
    bankCashAccountId: 100,
    amount: "100",
    transactionDate: "2026-09-08"
  });
  assert.equal(debitFail.statusCode, 400);

  // Transfer with empty names succeeds
  f.rows("chartOfAccountsTable").push({ id: 999, organizationId: 1, accountCode: "1098", accountName: "Bank B", accountType: "Asset", isActive: true });
  const transferOk = await f.call("post", "/bank-cash-transactions", {
    mode: "Transfer",
    bankCashAccount: "Custom Bank",
    transferToAccount: "Bank B",
    amount: "200",
    transactionDate: "2026-09-08"
  });
  assert.equal(transferOk.statusCode, 201);
});



for (const [label, creditContactId, debitContactId, legacyId] of [
  ["both Aakash names", 1, 1, null], ["distinct names", 1, 7, null],
  ["credit only", 1, null, null], ["debit only", null, 1, null],
  ["neither name", null, null, null], ["legacy clientId", null, null, 1],
]) {
  test(`Transfer persists and reloads separate CRM names: ${label}`, async () => {
    const f = fixture();
    f.rows("contactsTable").push({ id: 1, type: "client", name: "Aakash" });
    f.rows("chartOfAccountsTable").push({ id: 999, organizationId: 1, accountCode: "1098", accountName: "Bank B", accountType: "Asset", isActive: true });
    const response = await f.call("post", "/bank-cash-transactions", JSON.parse(JSON.stringify({
      mode: "Transfer", bankCashAccountId: 100, transferToAccountId: 999,
      creditContactId: creditContactId ?? undefined, debitContactId: debitContactId ?? undefined,
      clientId: legacyId ?? undefined, amount: 1200, transactionDate: "2026-09-08",
      reference: "TRANSFER-REGRESSION", paymentMethod: "Bank Transfer", notes: "CRM transfer",
    })));
    assert.equal(response.statusCode, 201);
    const stored = f.rows("bankCashTransactionsTable").find(row => row.id === response.body.id);
    assert.equal(stored.creditContactId, creditContactId);
    assert.equal(stored.debitContactId, debitContactId);
    assert.equal(stored.clientId, creditContactId || debitContactId || legacyId);
    const fresh = f.reload();
    const approved = await fresh.call("post", "/bank-cash-transactions/:id/approve", {}, { id: stored.id });
    assert.equal(approved.statusCode, 200);
    const reloaded = fresh.reload();
    const history = await reloaded.call("get", "/bank-cash-transactions");
    const row = history.body.find(row => row.id === stored.id);
    const creditName = creditContactId ? "Aakash" : "";
    const debitName = debitContactId === 7 ? "Client A" : debitContactId ? "Aakash" : "";
    assert.equal(row.creditContactId, creditContactId);
    assert.equal(row.debitContactId, debitContactId);
    assert.equal(row.creditContactName, creditName);
    assert.equal(row.debitContactName, debitName);
    if (legacyId) assert.equal(row.clientName, "Aakash");
    assert.equal(row.paymentDate, "2026-09-08");
    assert.equal(row.paymentMethod, "Bank Transfer");
    const journal = reloaded.rows("journalEntriesTable").find(row => row.id === approved.body.journalEntryId);
    assert.equal(journal.metadata.creditContactId, creditContactId);
    assert.equal(journal.metadata.debitContactId, debitContactId);
    assert.equal(journal.metadata.creditContactName, creditName);
    assert.equal(journal.metadata.debitContactName, debitName);
    const lines = reloaded.rows("journalLinesTable").filter(row => row.journalEntryId === journal.id);
    assert.equal(lines.length, 2);
    assert.equal(lines.find(row => row.accountId === 100).credit, 1200);
    assert.equal(lines.find(row => row.accountId === 999).debit, 1200);
    const accounts = [{ accountName: "Bank B", lines: [{ sourceType: "Bank Cash Transaction", metadata: journal.metadata, entryDate: journal.entryDate }] }];
    reloaded.decorate(accounts, [], [], [], [], reloaded.rows("contactsTable"));
    const line = accounts[0].lines[0];
    assert.equal(line.creditContactName, creditName);
    assert.equal(line.debitContactName, debitName);
    assert.equal(line.partyName, [creditName && `Credit: ${creditName}`, debitName && `Debit: ${debitName}`].filter(Boolean).join("; ") || (legacyId ? "Aakash" : "N/A"));
    assert.equal(line.paymentMethod, "Bank Transfer");
    assert.equal(line.paymentDate, "2026-09-08");
  });
}

test("real Mongo model serializes both Transfer contact IDs for insertion", async () => {
  const compiled = await build({
    stdin: { contents: 'export { modelFor } from "../../lib/db/src/query"; export { bankCashTransactionsTable } from "../../lib/db/src/schema/accounts";', resolveDir: fileURLToPath(new URL("..", import.meta.url)), loader: "ts" },
    bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(new URL("../../../lib/db/package.json", import.meta.url)), module, module.exports);
  const Model = module.exports.modelFor(module.exports.bankCashTransactionsTable);
  // Exercise real validation and serialization with isolated collection I/O.
  const restores = [];
  for (const field of Object.values(module.exports.bankCashTransactionsTable)) {
    if (!field.reference) continue;
    const collection = module.exports.modelFor(field.reference().table).collection;
    const originalFind = collection.findOne;
    collection.findOne = async filter => ({ id: filter.id });
    restores.push(() => { collection.findOne = originalFind; });
  }
  const original = Model.collection.insertOne;
  let inserted;
  Model.collection.insertOne = async doc => { inserted = structuredClone(doc); return { acknowledged: true, insertedId: doc._id }; };
  try {
    const f = fixture();
    f.rows("contactsTable").push({ id: 1, type: "client", name: "Aakash" });
    f.rows("chartOfAccountsTable").push({ id: 999, organizationId: 1, accountCode: "1098", accountName: "Bank B", accountType: "Asset", isActive: true });
    const result = await f.call("post", "/bank-cash-transactions", { mode: "Transfer", bankCashAccountId: 100, transferToAccountId: 999, creditContactId: 1, debitContactId: 1, amount: 1200, transactionDate: "2026-09-08" });
    assert.equal(result.statusCode, 201);
    await new Model(f.rows("bankCashTransactionsTable")[0]).save();
    assert.equal(inserted.creditContactId, 1);
    assert.equal(inserted.debitContactId, 1);
    const reloaded = Model.hydrate(inserted).toObject();
    assert.equal(reloaded.creditContactId, 1);
    assert.equal(reloaded.debitContactId, 1);
  } finally { Model.collection.insertOne = original; restores.reverse().forEach(restore => restore()); }
});

test("LIVE-BC-CHARGES-FINAL-001 scenario: ₹1,000 credit with ₹50 bank charges posts separate 5150 journal, both searchable", async () => {
  const f = fixture();
  f.rows("chartOfAccountsTable").push({ id: 38, organizationId: 1, accountCode: "31002", accountName: "Test Bank Account", accountType: "Asset", isActive: true, currentBalance: 0, openingBalance: 0 });
  const txInput = {
    bankCashAccountId: 38,
    amount: "1000",
    bankCharges: "50",
    transactionDate: "2026-09-09",
    reference: "LIVE-BC-CHARGES-FINAL-001",
    creditName: "Client A",
    debitName: "Client A",
    clientId: 7,
    paymentMethod: "UPI",
    mode: "Credit",
    remarks: "Final Bank Charges Test",
  };
  const created = await f.call("post", "/bank-cash-transactions", txInput);
  assert.equal(created.statusCode, 201);
  const approved = await f.call("post", "/bank-cash-transactions/:id/approve", {}, { id: created.body.id });
  assert.equal(approved.statusCode, 200);

  const journals = f.rows("journalEntriesTable");
  assert.equal(journals.length, 2);

  // 1. Main journal: full 1000 principal
  const mainJournal = journals.find((j) => j.sourceType === "Bank Cash Transaction");
  assert.ok(mainJournal);
  assert.equal(mainJournal.totalDebit, 1000);
  assert.equal(mainJournal.totalCredit, 1000);
  assert.equal(mainJournal.entryDate, "2026-09-09");
  assert.equal(mainJournal.voucherType, "Receipt");
  assert.equal(mainJournal.metadata?.documentReference, "LIVE-BC-CHARGES-FINAL-001");
  const mainLines = f.rows("journalLinesTable").filter((l) => l.journalEntryId === mainJournal.id);
  assert.equal(mainLines.find((l) => Number(l.accountId) === 38)?.debit, 1000);
  assert.equal(mainLines.find((l) => Number(l.accountId) === 38)?.credit, 0);

  // 2. Separate Bank Charges journal: Dr 5150 ₹50, Cr 31002 ₹50
  const chargeJournal = journals.find((j) => j.sourceType === "Bank Cash Transaction Charges");
  assert.ok(chargeJournal);
  assert.equal(chargeJournal.totalDebit, 50);
  assert.equal(chargeJournal.totalCredit, 50);
  assert.equal(chargeJournal.entryDate, "2026-09-09");
  assert.equal(chargeJournal.voucherType, "Payment");
  assert.equal(chargeJournal.metadata?.documentReference, "LIVE-BC-CHARGES-FINAL-001");
  assert.equal(chargeJournal.metadata?.isBankChargeEntry, true);
  const chargeLines = f.rows("journalLinesTable").filter((l) => l.journalEntryId === chargeJournal.id);
  assert.equal(chargeLines.find((l) => l.accountCode === "5150")?.debit, 50);
  assert.equal(chargeLines.find((l) => l.accountCode === "5150")?.credit, 0);
  assert.equal(chargeLines.find((l) => Number(l.accountId) === 38)?.debit, 0);
  assert.equal(chargeLines.find((l) => Number(l.accountId) === 38)?.credit, 50);

  // 3. Search Journal Entries by reference returns both journals
  const searchRes = await f.call("get", "/journal-entries", {}, {}, ["*"], 1, { search: "LIVE-BC-CHARGES-FINAL-001" });
  assert.equal(searchRes.statusCode, 200);
  assert.equal(searchRes.body.items.length, 2);
  const searchRefs = searchRes.body.items.map((item) => item.reference);
  assert.ok(searchRefs.some((r) => r.includes("LIVE-BC-CHARGES-FINAL-001") && r.includes("AUTO:BANKCASH:1")));
  assert.ok(searchRefs.some((r) => r.includes("LIVE-BC-CHARGES-FINAL-001") && r.includes("AUTO:BANKCASH:CHARGES:1")));
});

test("reconcileBankCashCharges splits legacy combined bank charges journal into separate balanced entries", async () => {
  const f = fixture();
  f.rows("chartOfAccountsTable").push({ id: 38, organizationId: 1, accountCode: "31002", accountName: "Test Bank Account", accountType: "Asset", isActive: true, currentBalance: 950, openingBalance: 0 });
  f.rows("chartOfAccountsTable").push({ id: 102, organizationId: 1, accountCode: "5150", accountName: "Bank Charges", accountType: "Expense", isActive: true, currentBalance: 50, openingBalance: 0 });
  const chargeAccount = f.rows("chartOfAccountsTable").find((a) => a.accountCode === "5150");

  f.rows("bankCashTransactionsTable").push({
    id: 25,
    organizationId: 1,
    transactionDate: "2026-09-09",
    reference: "LIVE-BC-CHARGES-FINAL-001",
    mode: "Credit",
    amount: 1000,
    bankCharges: 50,
    transactionFees: 0,
    bankCashAccountId: 38,
    approvalStatus: "Approved",
    status: "Approved",
    journalEntryId: 42,
  });

  f.rows("journalEntriesTable").push({
    id: 42,
    organizationId: 1,
    entryDate: "2026-09-09",
    reference: "AUTO:BANKCASH:1:25",
    description: "Bank/Cash Transaction - Test Bank Account",
    sourceType: "Bank Cash Transaction",
    sourceId: 25,
    voucherType: "Receipt",
    totalDebit: 1000,
    totalCredit: 1000,
    metadata: {
      bankCashTransactionId: 25,
      documentReference: "LIVE-BC-CHARGES-FINAL-001",
      bankCharges: 50,
    },
  });

  f.rows("journalLinesTable").push(
    { id: 89, organizationId: 1, journalEntryId: 42, accountId: 38, accountCode: "31002", accountName: "Test Bank Account", debit: 950, credit: 0 },
    { id: 90, organizationId: 1, journalEntryId: 42, accountId: 100, accountCode: "3000", accountName: "Capital", debit: 0, credit: 1000 },
    { id: 91, organizationId: 1, journalEntryId: 42, accountId: chargeAccount.id, accountCode: "5150", accountName: "Bank Charges", debit: 50, credit: 0 },
  );

  const searchRes = await f.call("get", "/journal-entries", {}, {}, ["*"], 1, { search: "LIVE-BC-CHARGES-FINAL-001" });
  assert.equal(searchRes.statusCode, 200);
  assert.equal(searchRes.body.items.length, 2);

  const lines42 = f.rows("journalLinesTable").filter((l) => l.journalEntryId === 42);
  assert.equal(lines42.length, 2);
  assert.equal(lines42.find((l) => Number(l.accountId) === 38)?.debit, 1000);
  assert.equal(lines42.find((l) => l.accountCode === "5150"), undefined);

  const chargeJournal = f.rows("journalEntriesTable").find((j) => j.sourceType === "Bank Cash Transaction Charges");
  assert.ok(chargeJournal);
  assert.equal(chargeJournal.totalDebit, 50);
  assert.equal(chargeJournal.totalCredit, 50);
  const chargeLines = f.rows("journalLinesTable").filter((l) => l.journalEntryId === chargeJournal.id);
  assert.equal(chargeLines.find((l) => l.accountCode === "5150")?.debit, 50);
  assert.equal(chargeLines.find((l) => Number(l.accountId) === 38)?.credit, 50);
});
