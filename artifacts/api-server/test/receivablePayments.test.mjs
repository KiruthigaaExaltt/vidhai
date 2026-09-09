import { parseReceivableSheet } from "../../vidhai-erp/src/pages/accounts/receivableImport.ts";
import { receiptAccounts } from "../src/lib/receivableAccounts.ts";
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

async function receivableFixture() {
  const f = fixture();
  await f.call("get", "/coa");
  const from = f.rows("chartOfAccountsTable").find(row => row.accountCode === "1100").id;
  f.rows("accountsReceivableTable").push({ id: 10, organizationId: 1, sourceType: "Manual", entryType: "Invoice", clientId: 7, clientName: "Client A", invoiceNumber: "AR-NEW", invoiceDate: "2026-09-01", dueDate: "2026-09-30", amount: 10000, receivedAmount: 0, adjustedAmount: 0 });
  return { f, body: { amount: 3000, paymentDate: "2026-09-02", fromAccountId: from, toAccountId: 100, receiptId: "receipt-1", paymentMethod: "" } };
}
test("three partial receipts retain dates, direction, history, customer ledger and COA events", async () => {
  const {f, body} = await receivableFixture();
  for (const [i, amount] of [3000, 2000, 5000].entries()) {
    const result = await f.call("post", "/ar/:id/payment", { ...body, amount, paymentDate: `2026-09-0${i + 2}`, receiptId: `partial-${i}` }, {id:10});
    assert.equal(result.statusCode, 201);
    assert.equal(10000 - result.body.receivable.receivedAmount, [7000, 5000, 0][i]);
    const journal = f.rows("journalEntriesTable").find(row => row.id === result.body.journalEntryId);
    assert.equal(journal.entryDate, `2026-09-0${i + 2}`);
    assert.equal(journal.metadata.paymentDate, journal.entryDate);
    assert.equal(journal.metadata.fromAccountId, body.fromAccountId);
    assert.equal(journal.metadata.toAccountId, 100);
    const lines = f.rows("journalLinesTable").filter(row => row.journalEntryId === journal.id);
    assert.equal(lines.length, 2);
    assert.equal(lines.find(row => row.accountId === 100).debit, amount);
    assert.equal(lines.find(row => row.accountId === body.fromAccountId).credit, amount);
  }
  const fresh=f.reload();
  const history=await fresh.call("get", "/ar");
  const historyRows=Array.isArray(history.body) ? history.body : history.body.items;
  assert.equal(historyRows.find(row=>row.id===10).paymentHistory.length,3);
  const ledger=await fresh.call("get", "/customer-ledger");
  const record=ledger.body[0].records.find(row=>row.id===10);
  assert.deepEqual(record.payments.map(row=>row.paymentDate).sort(),["2026-09-02","2026-09-03","2026-09-04"]);
  assert.equal(record.payments[0].toAccountName,"Custom Bank");
  const coa=await fresh.call("get","/coa");
  assert.equal(coa.body.find(row=>row.id===100).receivablePaymentEvents.length,3);
  assert.equal(coa.body.find(row=>row.id===body.fromAccountId).receivablePaymentEvents.length,3);
  assert.equal(f.rows("journalEntriesTable").length,3);
  const arLines = coa.body.find(row=>row.id===body.fromAccountId).lines;
  assert.equal(arLines.length, 4, "Account 1100 must have 1 invoice line + 3 partial payment lines");
  assert.equal(arLines[0].debit, 10000);
  assert.equal(arLines[0].credit, 0);
  assert.equal(arLines[1].credit, 3000);
  assert.equal(arLines[2].credit, 2000);
  assert.equal(arLines[3].credit, 5000);
  assert.equal(arLines[3].runningBalance, 0);
});
for (const [label, patch] of [
  ["missing date",{paymentDate:""}], ["invalid date",{paymentDate:"2026-02-30"}],
  ["missing from",{fromAccountId:""}], ["missing to",{toAccountId:""}],
  ["unknown from",{fromAccountId:9999}], ["unknown to",{toAccountId:9999}],
  ["wrong from",{fromAccountId:100}], ["zero amount",{amount:0}],
  ["negative amount",{amount:-1}], ["overpayment",{amount:10001}],
  ["missing retry identity",{receiptId:""}],
]) test(`receipt rejects ${label} without writes`,async()=>{
  const {f,body}=await receivableFixture();
  assert.equal((await f.call("post","/ar/:id/payment",{...body,...patch},{id:10})).statusCode,400);
  assert.equal(f.rows("journalEntriesTable").length,0);
  assert.equal(f.rows("accountsReceivableTable")[0].receivedAmount,0);
});
for (const side of ["fromAccountId","toAccountId"]) test(`receipt rejects inactive ${side}`,async()=>{
  const {f,body}=await receivableFixture();
  f.rows("chartOfAccountsTable").find(row=>row.id===body[side]).isActive=false;
  assert.equal((await f.call("post","/ar/:id/payment",body,{id:10})).statusCode,400);
});
test("receipt validates CRM and rejects identical accounts",async()=>{
  const {f,body}=await receivableFixture();
  assert.equal((await f.call("post","/ar/:id/payment",{...body,toAccountId:body.fromAccountId},{id:10})).statusCode,400);
  f.rows("contactsTable").length=0;
  assert.equal((await f.call("post","/ar/:id/payment",body,{id:10})).statusCode,400);
});
test("receipt retry is idempotent and changed retry is rejected",async()=>{
  const {f,body}=await receivableFixture();
  const first=await f.call("post","/ar/:id/payment",body,{id:10});
  const retry=await f.call("post","/ar/:id/payment",body,{id:10});
  assert.equal(first.body.journalEntryId,retry.body.journalEntryId);
  assert.equal(f.rows("journalEntriesTable").length,1);
  assert.equal((await f.call("post","/ar/:id/payment",{...body,paymentDate:"2026-09-03"},{id:10})).statusCode,409);
});
const importRow={entryType:"Invoice",customer:"Client A",invoiceNumber:"IMPORTED-AR",invoiceDate:"2026-09-01",dueDate:"2026-09-30",amount:"10000",receivedAmount:"3000",paymentDate:"2026-09-06",fromAccount:"1100",toAccount:"1099",notes:"Imported receipt",paymentFieldsPresent:true};
test("Excel initial receipt uses shared posting and duplicate import cannot double-pay",async()=>{
  const {f}=await receivableFixture();
  const result=await f.call("post","/ar/import",{rows:[importRow]});
  assert.equal(result.statusCode,201);
  const entry=f.rows("accountsReceivableTable").find(row=>row.invoiceNumber==="IMPORTED-AR");
  assert.equal(entry.receivedAmount,3000);
  assert.equal(f.rows("journalEntriesTable")[0].entryDate,"2026-09-06");
  assert.equal(f.rows("journalEntriesTable")[0].metadata.arId,entry.id);
  assert.equal((await f.call("post","/ar/import",{rows:[importRow]})).statusCode,400);
  assert.equal(f.rows("journalEntriesTable").length,1);
});
for(const patch of [{paymentDate:""},{toAccount:""},{fromAccount:"1099"},{receivedAmount:"10001"},{receivedAmount:"invalid"},{customer:"Unknown"}]) test(`Excel rejects invalid payment ${JSON.stringify(patch)}`,async()=>{
  const {f}=await receivableFixture();
  assert.equal((await f.call("post","/ar/import",{rows:[{...importRow,...patch}]})).statusCode,400);
  assert.equal(f.rows("accountsReceivableTable").length,1);
  assert.equal(f.rows("journalEntriesTable").length,0);
});
test("Excel payment failure rolls back invoice and receipt together",async()=>{
  const {f}=await receivableFixture();f.fail("journalLinesTable");
  await assert.rejects(f.call("post","/ar/import",{rows:[importRow]}),/Injected write failure/);
  assert.equal(f.rows("accountsReceivableTable").length,1);
  assert.equal(f.rows("journalEntriesTable").length,0);
});
test("historical totals and legacy imports never fabricate receipt events",async()=>{
  const {f}=await receivableFixture();
  const legacy={...importRow};delete legacy.paymentDate;delete legacy.fromAccount;delete legacy.toAccount;delete legacy.paymentFieldsPresent;
  assert.equal((await f.call("post","/ar/import",{rows:[legacy]})).statusCode,201);
  assert.equal(f.rows("journalEntriesTable").length,0);
  const ledger=await f.call("get","/customer-ledger");
  assert.equal(ledger.body[0].records.find(row=>row.invoiceNumber==="IMPORTED-AR").payments.length,0);
});
test("new Excel unpaid invoice requires no invented payment fields",async()=>{
  const {f}=await receivableFixture();
  assert.equal((await f.call("post","/ar/import",{rows:[{...importRow,receivedAmount:"0",paymentDate:"",fromAccount:"",toAccount:""}]})).statusCode,201);
  assert.equal(f.rows("journalEntriesTable").length,0);
});

test("Receivables parser maps new and reordered payment columns",()=>{
  const headers=["Customer *","Invoice Number *","Invoice Date *","Due Date *","Amount *","Received Amount","Payment Date","From Account","To Account","Notes"];
  const values=["Client A","PARSED","2026-09-01","2026-09-30","10000","3000","2026-09-06","1100","1099","note"];
  const row=parseReceivableSheet([headers,values])[0];
  assert.equal(row.paymentDate,"2026-09-06");assert.equal(row.fromAccount,"1100");assert.equal(row.toAccount,"1099");assert.equal(row.paymentFieldsPresent,true);
  assert.deepEqual(parseReceivableSheet([[...headers].reverse(),[...values].reverse()])[0],row);
});
test("Receivables parser retains old adjusted amount and notes without invented payments",()=>{
  const row=parseReceivableSheet([["Customer *","Invoice Number *","Invoice Date *","Due Date *","Amount *","Received Amount","Adjusted Amount","Notes"],["Client A","OLD","2026-09-01","2026-09-30","10000","3000","50","legacy"]])[0];
  assert.equal(row.adjustedAmount,"50");assert.equal(row.notes,"legacy");assert.equal(row.paymentFieldsPresent,false);assert.equal(row.paymentDate,undefined);
});
test("Receivables parser rejects missing or duplicate headers",()=>{
  assert.throws(()=>parseReceivableSheet([["Customer"]]),/Missing/);
  assert.throws(()=>parseReceivableSheet([["Customer","Invoice Number","Invoice Date","Due Date","Amount","Amount"]]),/Duplicate/);
});
test("shared Sales/manual account validation preserves settlement alias and enforces From direction",()=>{
  const accounts=[{id:1,accountCode:"1100",accountName:"CRM receivable",isActive:true},{id:2,accountCode:"1099",accountName:"Real receiving account",isActive:true}];
  assert.equal(receiptAccounts({settlementAccountId:2},accounts).settlement.id,2);
  assert.equal(receiptAccounts({fromAccountId:1,toAccountId:2},accounts).receivable.id,1);
  assert.throws(()=>receiptAccounts({fromAccountId:2,toAccountId:1},accounts),/From Account/);
  assert.throws(()=>receiptAccounts({fromAccountId:1,toAccountId:2,settlementAccountId:1},accounts),/conflicts/);
});
test("manual invoice creation with historical received amount does not fabricate payment",async()=>{
  const {f}=await receivableFixture();
  const result=await f.call("post","/ar",{clientId:7,invoiceNumber:"HISTORY",invoiceDate:"2026-09-01",dueDate:"2026-09-30",amount:1000,receivedAmount:200,sourceType:"Manual"});
  assert.equal(result.statusCode,201);assert.equal(result.body.receivedAmount,200);assert.equal(f.rows("journalEntriesTable").length,0);
});
test("manual customer ledger does not borrow Sales events with colliding source IDs",async()=>{
  const {f}=await receivableFixture();
  f.rows("accountsReceivableTable")[0].sourceId=99;
  f.rows("salesPaymentsTable").push({id:1,invoiceId:99,paymentDate:"2026-09-07",amount:100});
  const result=await f.call("get","/customer-ledger");assert.equal(result.body[0].records[0].payments.length,0);
});

test("full AR payment LIVE-AR-003-PAY-001 appears in COA 1100 ledger movement with correct date, reference, customer, and balanced running balance", async () => {
  const f = fixture();
  await f.call("get", "/coa");
  const arAccount = f.rows("chartOfAccountsTable").find((r) => r.accountCode === "1100");
  const bankAccount = f.rows("chartOfAccountsTable").find((r) => r.id === 100);

  // 1. Create client AK-MUSHROOMS and invoice LIVE-AR-003
  f.rows("contactsTable").push({ id: 3, type: "client", name: "AK-MUSHROOMS", contactCode: "C3" });
  f.rows("accountsReceivableTable").push({
    id: 9, organizationId: 1, sourceType: "Manual", entryType: "Invoice",
    clientId: 3, clientName: "AK-MUSHROOMS", invoiceNumber: "LIVE-AR-003",
    invoiceDate: "2026-09-09", dueDate: "2026-09-19", amount: 10000,
    receivedAmount: 0, adjustedAmount: 0, approvalStatus: "Approved",
  });

  // 2. Post payment LIVE-AR-003-PAY-001
  const payRes = await f.call("post", "/ar/:id/payment", {
    amount: 10000,
    paymentDate: "2026-09-09",
    fromAccountId: arAccount.id,
    toAccountId: bankAccount.id,
    receiptId: "pay-ak-001",
    reference: "LIVE-AR-003-PAY-001",
    paymentMethod: "Bank Transfer",
    notes: "Live AR AK-MUSHROOMS Full Payment Test",
  }, { id: 9 });

  assert.equal(payRes.statusCode, 201);
  assert.equal(payRes.body.receivable.status, "Received");
  assert.equal(payRes.body.receivable.receivedAmount, 10000);

  // 3. Query Chart of Accounts
  const fresh = f.reload();
  const coaRes = await fresh.call("get", "/coa");
  assert.equal(coaRes.statusCode, 200);

  const freshAr = coaRes.body.find((r) => r.accountCode === "1100");
  assert.ok(freshAr, "AR Account 1100 must exist");
  assert.equal(Number(freshAr.currentBalance), 0, "Account balance must be 0 after full payment");

  // Verify lines in ledger movement
  const lines = freshAr.lines || [];
  assert.equal(lines.length, 2, "Must contain invoice line and payment line");

  const invLine = lines.find((l) => l.debit === 10000);
  assert.ok(invLine, "Invoice debit line must exist");
  assert.equal(invLine.entryDate, "2026-09-09");
  assert.equal(invLine.partyName, "AK-MUSHROOMS");
  assert.equal(invLine.referenceId, "LIVE-AR-003");
  assert.equal(invLine.source, "Receivables");
  assert.equal(invLine.credit, 0);

  const payLine = lines.find((l) => l.credit === 10000);
  assert.ok(payLine, "Payment credit line must exist");
  assert.equal(payLine.paymentDate, "2026-09-09");
  assert.equal(payLine.partyName, "AK-MUSHROOMS");
  assert.equal(payLine.referenceId, "LIVE-AR-003-PAY-001");
  assert.equal(payLine.paymentMethod, "Bank Transfer");
  assert.equal(payLine.source, "Receivables");
  assert.equal(payLine.debit, 0);
  assert.equal(payLine.credit, 10000);
  assert.equal(payLine.runningBalance, 0);

  // Verify settlement bank account
  const freshBank = coaRes.body.find((r) => r.id === bankAccount.id);
  const bankPayLine = (freshBank.lines || []).find((l) => l.debit === 10000);
  assert.ok(bankPayLine, "Bank must have debit line of 10000");
  assert.equal(bankPayLine.partyName, "AK-MUSHROOMS");
  assert.equal(bankPayLine.referenceId, "LIVE-AR-003-PAY-001");
});

