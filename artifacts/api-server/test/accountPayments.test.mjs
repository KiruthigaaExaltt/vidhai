import assert from "node:assert/strict";
import test from "node:test";
import { addBankChargeLines, bankCashExportRow, buildBankChargeJournalLines, paymentDetails, paymentMoney, prepareBankCash } from "../src/lib/accountPayments.ts";
import { parseBankCashSheet } from "../../vidhai-erp/src/pages/accounts/bankCashImport.ts";

const accounts = [
  { id: 1, accountCode: "1001", accountName: "Test Bank", isActive: true },
  { id: 2, accountCode: "1002", accountName: "Other Bank", isActive: true },
  { id: 3, accountCode: "5150", accountName: "Existing charge ledger", isActive: true },
  { id: 4, accountCode: "1004", accountName: "Inactive", isActive: false },
];
const clients = [{ id: 7, name: "Client A", contactCode: "C007", type: "client" }];
const base = { mode: "Credit", bankCashAccountId: 1, creditName: "Client A", amount: "100", transactionDate: "2026-09-07" };

test("explicit account IDs are not confused with another account's code", () => {
  const colliding = [...accounts, { id: 99, accountCode: "1", accountName: "Different account", isActive: true }];
  assert.equal(prepareBankCash(base, colliding, clients).bankCashAccountId, 1);
});

test("explicit invalid client IDs cannot silently become an unassigned payment", () => {
  for (const clientId of [0, -1, false, "unknown"])
    assert.throws(() => prepareBankCash({ mode: "Credit", bankCashAccountId: 1, amount: "100", transactionDate: "2026-09-07", clientId }, accounts, clients), /Client|Credit Name/i);
});

test("Credit mode requires valid CRM Credit Name; Debit Name not required", () => {
  const row = prepareBankCash({ mode: "Credit", bankCashAccountId: 1, creditName: "Client A", amount: "100", transactionDate: "2026-09-07" }, accounts, clients);
  assert.equal(row.mode, "Credit");
  assert.equal(row.creditContactId, 7);
  assert.equal(row.debitContactId, null);
  assert.equal(row.clientId, 7);

  assert.throws(() => prepareBankCash({ mode: "Credit", bankCashAccountId: 1, amount: "100", transactionDate: "2026-09-07" }, accounts, clients), /Credit Name/);
  assert.throws(() => prepareBankCash({ mode: "Credit", bankCashAccountId: 1, creditName: "Invalid Client", amount: "100", transactionDate: "2026-09-07" }, accounts, clients), /Credit Name/);
});

test("Debit mode requires valid CRM Debit Name; Credit Name not required", () => {
  const row = prepareBankCash({ mode: "Debit", bankCashAccountId: 1, debitName: "Client A", amount: "100", transactionDate: "2026-09-07" }, accounts, clients);
  assert.equal(row.mode, "Debit");
  assert.equal(row.debitContactId, 7);
  assert.equal(row.creditContactId, null);
  assert.equal(row.clientId, 7);

  assert.throws(() => prepareBankCash({ mode: "Debit", bankCashAccountId: 1, amount: "100", transactionDate: "2026-09-07" }, accounts, clients), /Debit Name/);
  assert.throws(() => prepareBankCash({ mode: "Debit", bankCashAccountId: 1, debitName: "Nonexistent", amount: "100", transactionDate: "2026-09-07" }, accounts, clients), /Debit Name/);
});

test("Transfer requires From and To accounts, accepts empty names or valid CRM names", () => {
  const emptyNamesRow = prepareBankCash({ mode: "Transfer", bankCashAccountId: 1, counterAccount: "1002 - Other Bank", amount: "100", transactionDate: "2026-09-07" }, accounts, clients);
  assert.equal(emptyNamesRow.mode, "Transfer");
  assert.equal(emptyNamesRow.transferToAccountId, 2);
  assert.equal(emptyNamesRow.creditContactId, null);
  assert.equal(emptyNamesRow.debitContactId, null);

  const validNamesRow = prepareBankCash({ mode: "Transfer", bankCashAccountId: 1, counterAccount: "1002 - Other Bank", creditName: "Client A", debitName: "Client A", amount: "100", transactionDate: "2026-09-07" }, accounts, clients);
  assert.equal(validNamesRow.creditContactId, 7);
  assert.equal(validNamesRow.debitContactId, 7);

  assert.throws(() => prepareBankCash({ mode: "Transfer", bankCashAccountId: 1, transferToAccountId: 1, amount: "100", transactionDate: "2026-09-07" }, accounts, clients), /different/);
  assert.throws(() => prepareBankCash({ mode: "Transfer", bankCashAccountId: 1, transferToAccountId: 2, creditName: "Bad Client", amount: "100", transactionDate: "2026-09-07" }, accounts, clients), /Credit Name/);
});

test("dynamic COA and client selection, method, date and metadata", () => {
  const newAccounts = [...accounts, { id: 12, accountCode: "1099", accountName: "Newly created account" }];
  const row = prepareBankCash({ ...base, bankCashAccountId: 12, creditName: "Client A - C007", paymentMode: "upi", notes: "One note", invoiceNumber: "INV-1", period: "Sep 2026", bankCharges: "2.50", transactionFees: "1" }, newAccounts, clients);
  assert.equal(row.bankCashAccountId, 12);
  assert.equal(row.clientId, 7);
  assert.equal(row.creditContactId, 7);
  assert.equal(row.paymentMethod, "UPI");
  assert.equal(row.transactionDate, "2026-09-07");
  assert.equal(row.reference, "INV-1");
  assert.equal(row.remarks, "One note");
  assert.equal(row.period, "Sep 2026");
  assert.equal(row.bankCharges, 2.5);
  assert.equal(row.transactionFees, 1);
});

test("invalid accounts, clients, methods, modes and real calendar dates are rejected", () => {
  for (const patch of [{ bankCashAccountId: 99 }, { bankCashAccountId: 4 }, { creditName: 99 }, { paymentMethod: "Crypto" }, { mode: "Other" }, { transactionDate: "2026-02-30" }, { counterAccountId: 99 }])
    assert.throws(() => prepareBankCash({ ...base, ...patch }, accounts, clients));
  assert.throws(() => prepareBankCash({ ...base, creditName: "Client A" }, accounts, [...clients, { ...clients[0], id: 8 }]), /unambiguous/);
});

test("invalid amounts and optional fees are not silently coerced to zero", () => {
  for (const key of ["amount", "bankCharges", "transactionFees"]) {
    for (const value of ["abc", "NaN", "Infinity", "-1", true, {}, "1,000", "0x10"])
      assert.throws(() => prepareBankCash({ ...base, [key]: value }, accounts, clients));
  }
  assert.equal(paymentMoney("", "Optional", true), 0);
  assert.equal(paymentMoney("12.345", "Amount"), 12.35);
  assert.throws(() => prepareBankCash({ ...base, amount: "0" }, accounts, clients));
  assert.throws(() => prepareBankCash({ ...base, bankCharges: "101" }, accounts, clients));
});

test("bank charges balance receipts, payments and transfers; fees stay informational", () => {
  for (const mode of ["Credit", "Debit", "Transfer"]) {
    const lines = mode === "Credit" ? [{ accountId: 1, debit: 100 }, { accountId: 2, credit: 100 }] : [{ accountId: 2, debit: 100 }, { accountId: 1, credit: 100 }];
    assert.deepEqual(addBankChargeLines(lines, { ...base, mode }, accounts), lines);
    const charged = addBankChargeLines(lines, { ...base, mode, bankCharges: 5, transactionFees: 999 }, accounts);
    assert.equal(charged.reduce((sum, line) => sum + (line.debit || 0) - (line.credit || 0), 0), 0);
    assert.equal(charged.find((line) => line.accountId === 3).debit, 5);
    assert.equal(charged.reduce((sum, line) => sum + (line.debit || 0), 0), mode === "Credit" ? 100 : 105);
  }
});

test("old seven-column Excel format still maps and validates", () => {
  const rows = parseBankCashSheet([
    ["Type *", "From Chart Of Account *", "Counter Account", "Amount *", "Date *", "Reference", "Remarks"],
    ["Credit", "Test Bank", "", "100", "2026-09-07", "INV-OLD", "Legacy notes"],
  ]);
  const row = prepareBankCash({ ...rows[0], creditName: "Client A" }, accounts, clients);
  assert.equal(row.reference, "INV-OLD");
  assert.equal(row.remarks, "Legacy notes");
  assert.equal(row.transactionFees, 0);
});

test("reordered new headers, Credit Name / Debit Name aliases and missing optional columns", () => {
  for (const reference of ["Reference", "Reference ID", "Invoice Number", "Document Reference", "Reference ID / Invoice Number"]) {
    const rows = parseBankCashSheet([
      ["Notes", "Payment Date", "Account Name", reference, "Type", "Amount", "Payment Mode", "Credit Name", "Bank Charges", "Transaction Fees", "Period"],
      ["hello", "2026-09-07", "Test Bank", "INV", "Credit", "100", "Cash", "Client A", "", "", "Sep"],
    ]);
    const row = prepareBankCash(rows[0], accounts, clients);
    assert.equal(row.reference, "INV");
    assert.equal(row.paymentMethod, "Cash");
    assert.equal(row.creditContactId, 7);
  }
  assert.equal(parseBankCashSheet([["Type", "Account Name", "Amount", "Date"], [], ["Debit", "Test Bank", 5, "2026-09-07"]])[0].rowNumber, 3);
  assert.throws(() => parseBankCashSheet([["Notes", "Remarks"]]), /Duplicate/);
  assert.throws(() => parseBankCashSheet([["Type", "Amount"]]), /Missing/);
});

test("Excel export round-trips metadata with one Notes column and business reference", () => {
  const exported = bankCashExportRow({ ...base, accountDisplay: "1001 - Test Bank", creditContactDisplay: "Client A - C007", paymentMethod: "Cheque", reference: "INV-X", remarks: "Only note", bankCharges: 2, transactionFees: 3, period: "Q3" });
  assert.equal(Object.keys(exported).filter((key) => /notes|remarks/i.test(key)).length, 1);
  const [parsed] = parseBankCashSheet([Object.keys(exported), Object.values(exported)]);
  const row = prepareBankCash(parsed, accounts, clients);
  assert.equal(row.reference, "INV-X");
  assert.equal(row.remarks, "Only note");
  assert.equal(row.creditContactId, 7);
  assert.equal(row.transactionFees, 3);
  assert.equal(row.period, "Q3");
  assert.equal(paymentDetails({ paymentDate: "2026-09-07", documentReference: "DOC" }).reference, "DOC");
});

test("newly created account 31002 - Test Bank Account is accepted by Excel import and prepareBankCash", () => {
  const newAccounts = [
    ...accounts,
    { id: 15, accountCode: "31002", accountName: "Test Bank Account", isActive: true },
  ];
  for (const accountInput of ["31002 - Test Bank Account", "31002 \u2013 Test Bank Account", "31002-Test Bank Account", "31002", "Test Bank Account"]) {
    const rows = parseBankCashSheet([
      ["Type *", "Account Name *", "Amount *", "Payment Date *"],
      ["Credit", accountInput, "500", "2026-09-08"],
    ]);
    const row = prepareBankCash({ ...rows[0], creditName: "Client A" }, newAccounts, clients);
    assert.equal(row.bankCashAccountId, 15);
  }
  // Confirm inactive / nonexistent accounts remain rejected
  assert.throws(() => prepareBankCash({ mode: "Credit", bankCashAccount: "99999 - Unknown", creditName: "Client A", amount: "100", transactionDate: "2026-09-07" }, newAccounts, clients), /choose a valid active COA account/);
  assert.throws(() => prepareBankCash({ mode: "Credit", bankCashAccount: "1004 - Inactive", creditName: "Client A", amount: "100", transactionDate: "2026-09-07" }, newAccounts, clients), /choose a valid active COA account/);
});

test("downloaded and exported Excel template generates exact 13-column headers in order", () => {
  const exported = bankCashExportRow({ ...base, accountDisplay: "Test Bank", creditContactDisplay: "Client A", paymentMethod: "Cheque", reference: "REF-123", remarks: "Note 1", bankCharges: 10, transactionFees: 5, period: "Q1" });
  const expectedHeaders = [
    "Type *",
    "Account Name",
    "Counter Account",
    "Amount *",
    "Payment Date *",
    "Reference",
    "Notes",
    "Credit Name",
    "Debit Name",
    "Payment Method",
    "Period",
    "Bank Charges",
    "Transaction Fees"
  ];
  assert.deepEqual(Object.keys(exported), expectedHeaders);
});

test("buildBankChargeJournalLines produces separate Dr 5150 Cr Bank lines, rejects opening balance, requires active 5150", () => {
  assert.deepEqual(buildBankChargeJournalLines({ ...base, bankCharges: 0 }, accounts), []);
  assert.deepEqual(buildBankChargeJournalLines({ ...base, bankCharges: "" }, accounts), []);

  for (const mode of ["Credit", "Debit", "Transfer"]) {
    const lines = buildBankChargeJournalLines({ ...base, mode, bankCashAccountId: 1, bankCharges: 50 }, accounts);
    assert.deepEqual(lines, [
      { accountId: 3, debit: 50, credit: 0 },
      { accountId: 1, debit: 0, credit: 50 },
    ]);
    assert.equal(lines.reduce((s, l) => s + l.debit - l.credit, 0), 0);
  }

  assert.throws(() => buildBankChargeJournalLines({ ...base, transactionTypeName: "Opening Balance", bankCharges: 10 }, accounts), /Bank Charges cannot be applied to an opening balance/);

  const noChargeAccounts = accounts.filter(a => a.accountCode !== "5150");
  assert.throws(() => buildBankChargeJournalLines({ ...base, bankCharges: 10 }, noChargeAccounts), /The existing bank-charge COA account is not configured or active/);
});
