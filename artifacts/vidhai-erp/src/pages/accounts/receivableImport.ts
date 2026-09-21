// Receivables only: preserve the old eight-column format and map new headers by name.
export function parseReceivableSheet(data: unknown[][]) {
  const norm = (value: unknown) => String(value ?? "").trim().replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const aliases: Record<string, string> = { customer: "customer", "invoice number": "invoiceNumber", "invoice date": "invoiceDate", "due date": "dueDate", amount: "amount", "received amount": "receivedAmount", "adjusted amount": "adjustedAmount", "payment date": "paymentDate", "from account": "fromAccount", "to account": "toAccount", notes: "notes" };
  const headers = (data[0] || []).map(norm);
  const keys = headers.map(header => aliases[header]);
  for (const required of ["customer", "invoiceNumber", "invoiceDate", "dueDate", "amount"]) {
    if (!keys.includes(required)) throw new Error(`Missing Receivables column: ${required}`);
  }
  if (keys.some((key, i) => key && keys.indexOf(key) !== i)) throw new Error("Duplicate Receivables column");
  const paymentFieldsPresent = keys.some(key => ["paymentDate", "fromAccount", "toAccount"].includes(key));
  return data.slice(1).map((cells, i) => {
    if (!cells.some(value => String(value ?? "").trim())) return null;
    const row: Record<string, any> = { rowNumber: i + 2, entryType: "Invoice", paymentFieldsPresent };
    keys.forEach((key, column) => { if (key) row[key] = String(cells[column] ?? "").trim(); });
    return row;
  }).filter((row): row is Record<string, any> => row !== null);
}
