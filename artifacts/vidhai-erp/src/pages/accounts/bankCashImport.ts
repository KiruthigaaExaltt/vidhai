const aliases: Record<string, string> = {
  type: "mode", mode: "mode", "credit/debit": "mode",
  "account name": "bankCashAccount", "from chart of account": "bankCashAccount",
  "counter account": "counterAccount", "transfer to": "transferToAccount",
  amount: "amount", date: "transactionDate", "payment date": "transactionDate",
  reference: "reference", "reference id": "reference", "invoice number": "reference",
  "document reference": "reference", "reference id / invoice number": "reference",
  remarks: "remarks", notes: "remarks", "client name": "clientName", client: "clientName",
  "payment method": "paymentMethod", "payment mode": "paymentMethod", period: "period",
  "bank charges": "bankCharges", "transaction fees": "transactionFees",
};
export function parseBankCashSheet(data: unknown[][]) {
  const headers = (data[0] || []).map((value) => String(value ?? "").replace(/\*/g, "").trim().replace(/\s+/g, " ").toLowerCase());
  const keys = headers.map((header) => aliases[header]);
  const recognized = keys.filter(Boolean);
  if (new Set(recognized).size !== recognized.length) throw new Error("Duplicate payment columns: use only one column for each field, including Notes and Reference");
  for (const key of ["mode", "bankCashAccount", "amount", "transactionDate"]) {
    if (!recognized.includes(key)) throw new Error(`Missing payment column: ${key}`);
  }
  return data.slice(1).flatMap((row, index) => {
    if (!row.some((cell) => String(cell ?? "").trim())) return [];
    const record: Record<string, string | number> = { rowNumber: index + 2 };
    keys.forEach((key, column) => { if (key) record[key] = String(row[column] ?? "").trim(); });
    return [record];
  });
}
