// Normalize date string or Excel serial date into YYYY-MM-DD
export function normalizeDate(value: unknown): string {
  const str = String(value ?? "").replace(/[\uFEFF\u200B\u00A0]/g, " ").trim();
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const ymd = /^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/.exec(str);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  const dmy = /^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/.exec(str);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const num = Number(str);
  if (!isNaN(num) && num > 25569 && num < 100000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, "0");
      const d = String(date.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  return str;
}

// Payables only: preserve the old eight-column format and map new headers by name.
export function parsePayableSheet(data: unknown[][]) {
  const clean = (v: unknown) => String(v ?? "").replace(/[\uFEFF\u200B\u00A0]/g, " ").trim();
  const norm = (value: unknown) => clean(value).replace(/[\u2013\u2014]/g, "-").replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const aliases: Record<string, string> = {
    vendor: "vendor",
    "bill number": "billNumber",
    "bill date": "billDate",
    "due date": "dueDate",
    amount: "amount",
    "paid amount": "paidAmount",
    "adjusted amount": "adjustedAmount",
    "payment date": "paymentDate",
    "from account": "fromAccount",
    "to account": "toAccount",
    notes: "notes",
  };

  // Find header row index (allow title/blank rows before headers)
  let headerIndex = data.findIndex((row) => {
    const headers = (row || []).map(norm);
    const keys = headers.map((header) => aliases[header]);
    return keys.includes("vendor") && keys.includes("billNumber") && keys.includes("amount");
  });
  if (headerIndex === -1) headerIndex = 0;

  const headers = (data[headerIndex] || []).map(norm);
  const keys = headers.map((header) => aliases[header]);
  for (const required of ["vendor", "billNumber", "billDate", "dueDate", "amount"]) {
    if (!keys.includes(required)) throw new Error(`Missing Payables column: ${required}`);
  }
  if (keys.some((key, i) => key && keys.indexOf(key) !== i)) throw new Error("Duplicate Payables column");
  const paymentFieldsPresent = keys.some((key) => ["paymentDate", "fromAccount", "toAccount"].includes(key));
  return data.slice(headerIndex + 1).map((cells, i) => {
    if (!cells.some((value) => clean(value) !== "")) return null;
    const row: Record<string, any> = { rowNumber: headerIndex + i + 2, entryType: "Bill", paymentFieldsPresent };
    keys.forEach((key, column) => {
      if (key) {
        let val = clean(cells[column]);
        if (["amount", "paidAmount", "adjustedAmount"].includes(key)) {
          val = val.replace(/,/g, "").replace(/^[₹$€£]\s*/, "").trim();
        }
        if (["billDate", "dueDate", "paymentDate"].includes(key)) {
          val = normalizeDate(val);
        }
        row[key] = val;
      }
    });
    return row;
  }).filter((row): row is Record<string, any> => row !== null);
}
