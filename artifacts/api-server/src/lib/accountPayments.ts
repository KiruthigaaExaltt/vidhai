// Accounts-only validation shared by manual entry and Excel import.
export const paymentMethods = ["Bank Transfer", "UPI", "Cheque", "Cash"];
const norm = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const supplied = (value: unknown) => value != null && String(value).trim() !== "";
const validId = (value: unknown) => (typeof value === "string" || typeof value === "number") && /^\d+$/.test(String(value).trim()) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
export function paymentMoney(value: unknown, label: string, optional = false) {
  if (!supplied(value) && optional) return 0;
  if ((typeof value !== "string" && typeof value !== "number") ||
      !/^\d*(?:\.\d+)?$/.test(String(value).trim()) || !supplied(value))
    throw new Error(`${label} must be a valid non-negative number`);
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100)))
    throw new Error(`${label} must be a valid non-negative number`);
  return Math.round(amount * 100) / 100;
}
export function paymentDetails(body: Record<string, any>, defaultDate?: string) {
  const transactionDate = String(body.transactionDate || body.paymentDate || body.entryDate || body.date || defaultDate || "").trim();
  const parsed = new Date(`${transactionDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== transactionDate)
    throw new Error("Payment Date must be a valid YYYY-MM-DD date");
  const method = body.paymentMethod ?? body.paymentMode;
  const paymentMethod = supplied(method) ? paymentMethods.find((item) => norm(item) === norm(method)) : "";
  if (paymentMethod === undefined) throw new Error("Payment Method must be Bank Transfer, UPI, Cheque, or Cash");
  return {
    transactionDate, paymentMethod,
    reference: String(body.reference || body.referenceId || body.invoiceNumber || body.documentReference || "").trim(),
    remarks: String(body.remarks || body.notes || ""),
    period: String(body.period || "").trim(),
    bankCharges: paymentMoney(body.bankCharges, "Bank Charges", true),
    transactionFees: paymentMoney(body.transactionFees, "Transaction Fees", true),
  };
}
export function prepareBankCash(body: Record<string, any>, accounts: any[], clients: any[], defaultDate?: string) {
  const details = paymentDetails(body, defaultDate);
  const amount = paymentMoney(body.amount, "Amount");
  if (amount <= 0) throw new Error("Amount must be greater than zero");
  const mode = ["Credit", "Debit", "Transfer"].find((value) => norm(value) === norm(body.mode || body.type || "Credit"));
  if (!mode) throw new Error("Type must be Credit, Debit, or Transfer");
  const resolve = (value: unknown, label: string, required = false, idOnly = false) => {
    if (!supplied(value) && !required) return null;
    if (idOnly && !validId(value)) throw new Error(`${label}: choose a valid active COA account`);
    const matches = accounts.filter((account) => account.isActive !== false &&
      (idOnly ? Number(account.id) === Number(value) : [account.id, account.accountCode, account.accountName, `${account.accountCode} - ${account.accountName}`].some((option) => norm(option) === norm(value))));
    if (matches.length !== 1) throw new Error(`${label}: choose a valid active COA account`);
    return Number(matches[0].id);
  };
  const resolveField = (id: unknown, fallback: unknown, label: string, required = false) =>
    resolve(supplied(id) ? id : fallback, label, required, supplied(id));
  const bankCashAccountId = resolveField(body.bankCashAccountId, body.bankCashAccount || body.fromChartOfAccount || body.accountName, "Account Name", true)!;
  const transferToAccountId = mode !== "Transfer" ? null : supplied(body.transferToAccountId) || supplied(body.transferToAccount)
    ? resolveField(body.transferToAccountId, body.transferToAccount, "Transfer destination", true)
    : resolveField(body.counterAccountId, body.counterAccount, "Transfer destination", true);
  const counterAccountId = mode === "Transfer" ? null : resolveField(body.counterAccountId, body.counterAccount, "Counter Account");
  if (transferToAccountId === bankCashAccountId) throw new Error("Transfer accounts must be different");
  const hasClientId = supplied(body.clientId);
  const clientValue = hasClientId ? body.clientId : body.clientName || body.client;
  let clientId: number | null = null;
  if (supplied(clientValue)) {
    if (hasClientId && !validId(body.clientId)) throw new Error("Client Name: choose a valid existing client ID");
    const matches = clients.filter((client) => norm(client.type || "client") === "client" &&
      (hasClientId ? Number(client.id) === Number(body.clientId) :
        [client.name, client.contactCode ? `${client.name} - ${client.contactCode}` : client.name].some((option) => norm(option) === norm(clientValue))));
    if (matches.length !== 1) throw new Error("Client Name: choose a valid, unambiguous existing client");
    clientId = Number(matches[0].id);
  }
  if (mode === "Credit" && details.bankCharges > amount) throw new Error("Bank Charges cannot exceed the receipt amount");
  return { ...details, amount, mode, bankCashAccountId, transferToAccountId, counterAccountId, clientId };
}
export function addBankChargeLines(lines: any[], entry: any, accounts: any[]) {
  const charges = paymentMoney(String(entry.bankCharges ?? 0), "Bank Charges", true);
  if (!charges) return lines;
  if (entry.transactionTypeName === "Opening Balance") throw new Error("Bank Charges cannot be applied to an opening balance");
  const chargeAccount = accounts.find((account) => account.accountCode === "5150" && account.isActive !== false);
  if (!chargeAccount) throw new Error("The existing bank-charge COA account is not configured or active");
  const result = lines.map((line) => ({ ...line }));
  if (norm(entry.mode) === "credit") {
    if (charges > Number(entry.amount)) throw new Error("Bank Charges cannot exceed the receipt amount");
    const bankLine = result.find((line) => Number(line.accountId) === Number(entry.bankCashAccountId) && line.debit > 0);
    if (!bankLine) throw new Error("Receipt bank entry is missing");
    bankLine.debit = Math.round((bankLine.debit - charges) * 100) / 100;
  } else {
    // Outgoing charges are paid from the source account, in addition to the principal.
    result.push({ accountId: entry.bankCashAccountId, credit: charges });
  }
  result.push({ accountId: chargeAccount.id, debit: charges });
  // Transaction fees are informational until a posting rule is established.
  // The shared poster updates each account from its starting balance, so combine
  // repeated accounts before posting the principal and its charge together.
  const combined = new Map<number, { accountId: number; debit: number; credit: number }>();
  for (const line of result) {
    const id = Number(line.accountId);
    const total = combined.get(id) || { accountId: id, debit: 0, credit: 0 };
    total.debit = Math.round((total.debit + Number(line.debit || 0)) * 100) / 100;
    total.credit = Math.round((total.credit + Number(line.credit || 0)) * 100) / 100;
    combined.set(id, total);
  }
  return [...combined.values()].filter((line) => line.debit > 0 || line.credit > 0);
}
export function bankCashExportRow(row: any) {
  return {
    "Type *": row.mode, "Account Name *": row.accountDisplay || "",
    "Counter Account": row.counterAccountDisplay || "", "Amount *": Number(row.amount),
    "Payment Date *": row.transactionDate, "Reference ID / Invoice Number": row.reference || "",
    Notes: row.remarks || "", "Client Name": row.clientDisplay || row.clientName || "",
    "Payment Method": row.paymentMethod || "", Period: row.period || "",
    "Bank Charges": Number(row.bankCharges || 0), "Transaction Fees": Number(row.transactionFees || 0),
  };
}
