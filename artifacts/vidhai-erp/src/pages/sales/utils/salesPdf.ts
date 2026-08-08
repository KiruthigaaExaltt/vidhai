export type SalesPdfLine = { description: string; hsn?: string; quantity: number; uom?: string; rate: number; cgstPercent?: number; sgstPercent?: number; igstPercent?: number; lineTotal: number };
export type SalesPdfInput = {
  documentType: string; documentNumber: string; docDate: string; dueDate?: string; docDateLabel: string; dueDateLabel: string; status?: string;
  companyName: string; companyAddress?: string; companyGstin?: string; companyPhone?: string;
  clientName: string; clientAddress?: string; clientGstin?: string; clientPhone?: string; placeOfSupply?: string;
  lines: SalesPdfLine[]; subtotal: number; cgstTotal: number; sgstTotal: number; igstTotal: number; grandTotal: number;
  bankName?: string; accountNumber?: string; ifscCode?: string; branch?: string; terms?: string; notes?: string;
};

const money = (value: number) => `Rs ${Number(value || 0).toFixed(2)}`;
const safe = (value: unknown) => String(value ?? "").replace(/[^\x20-\x7e]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const text = (x: number, y: number, value: unknown, size = 9, bold = false) => `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${safe(value)}) Tj ET\n`;
const line = (x1: number, y1: number, x2: number, y2: number) => `${x1} ${y1} m ${x2} ${y2} l S\n`;
const rect = (x: number, y: number, width: number, height: number, fill = false) => `${x} ${y} ${width} ${height} re ${fill ? "f" : "S"}\n`;
const truncate = (value: unknown, length: number) => { const raw = String(value ?? ""); return raw.length > length ? `${raw.slice(0, length - 3)}...` : raw; };

function pageStream(input: SalesPdfInput, rows: SalesPdfLine[], page: number, pages: number) {
  const width = 842; let y = 555; let stream = "0.15 0.15 0.15 RG 0.6 w\n";
  stream += text(36, y, input.companyName || "Company", 15, true) + text(36, y - 16, truncate(input.companyAddress, 90), 8) + text(36, y - 29, `GSTIN: ${input.companyGstin || "-"}   Phone: ${input.companyPhone || "-"}`, 8);
  stream += text(650, y, input.documentType.toUpperCase(), 16, true) + text(650, y - 18, input.documentNumber || "Draft", 10, true) + text(650, y - 32, input.status || "Draft", 8);
  y -= 52; stream += line(36, y, width - 36, y); y -= 22;
  stream += text(42, y, "BILL TO", 8, true) + text(435, y, "DOCUMENT DETAILS", 8, true);
  stream += text(42, y - 17, input.clientName || "Unknown Client", 11, true) + text(42, y - 32, truncate(input.clientAddress, 55), 8) + text(42, y - 46, `GSTIN: ${input.clientGstin || "-"}`, 8) + text(42, y - 60, `Phone: ${input.clientPhone || "-"}   Place of Supply: ${input.placeOfSupply || "-"}`, 8);
  stream += text(435, y - 17, `${input.docDateLabel}: ${input.docDate || "-"}`, 9) + text(435, y - 34, `${input.dueDateLabel}: ${input.dueDate || "-"}`, 9) + text(435, y - 51, `Page: ${page} / ${pages}`, 9);
  y -= 84; const cols = [36, 330, 385, 425, 475, 550, 620, 700, 806];
  stream += "0.94 0.97 0.96 rg " + rect(36, y, 770, 22, true) + "0 0 0 rg ";
  ["Description", "HSN", "Qty", "UOM", "Rate", "CGST%", "SGST/IGST%", "Line Total"].forEach((heading, index) => stream += text(cols[index] + 4, y + 7, heading, 7, true));
  y -= 1;
  rows.forEach((item) => { y -= 22; stream += line(36, y, 806, y); stream += text(40, y + 7, truncate(item.description, 49), 8) + text(334, y + 7, item.hsn || "-", 8) + text(389, y + 7, item.quantity, 8) + text(429, y + 7, item.uom || "Nos", 8) + text(479, y + 7, money(item.rate), 8) + text(554, y + 7, Number(item.cgstPercent || 0).toFixed(2), 8) + text(624, y + 7, Number(item.igstPercent || item.sgstPercent || 0).toFixed(2), 8) + text(704, y + 7, money(item.lineTotal), 8, true); });
  if (page === pages) {
    y -= 30; stream += text(570, y, `${input.documentType} Summary`, 9, true); y -= 17;
    [["Subtotal", input.subtotal], ["CGST", input.cgstTotal], ["SGST", input.sgstTotal], ["IGST", input.igstTotal], ["Grand Total", input.grandTotal]].filter(([, value]) => Number(value) || value === input.subtotal || value === input.grandTotal).forEach(([label, value]) => { stream += text(570, y, label, 8, label === "Grand Total") + text(710, y, money(Number(value)), 8, label === "Grand Total"); y -= 15; });
    const bottom = 76; stream += line(36, 150, 806, 150) + text(42, 135, "TERMS & CONDITIONS", 8, true) + text(430, 135, "BANK DETAILS", 8, true);
    String(input.terms || "Payment is subject to the agreed terms and conditions.").split(/\r?\n/).slice(0, 4).forEach((term, index) => stream += text(42, 119 - index * 13, truncate(term, 64), 7));
    stream += text(430, 119, `Bank: ${input.bankName || "-"}`, 7) + text(430, 106, `A/C No: ${input.accountNumber || "-"}`, 7) + text(430, 93, `IFSC: ${input.ifscCode || "-"}`, 7) + text(430, bottom, `Branch: ${input.branch || "-"}`, 7);
  }
  stream += text(300, 24, `Generated for ${input.companyName || "Sales Document"}`, 7);
  return stream;
}

export function buildSalesPdfBlob(input: SalesPdfInput) {
  const chunks: SalesPdfLine[][] = []; const lines = input.lines.length ? input.lines : [{ description: "No line items", quantity: 0, rate: 0, lineTotal: 0 }];
  for (let index = 0; index < lines.length; index += 12) chunks.push(lines.slice(index, index + 12));
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const pageIds: number[] = [];
  chunks.forEach((rows, index) => { const stream = pageStream(input, rows, index + 1, chunks.length); const pageId = objects.length + 1; const contentId = pageId + 1; pageIds.push(pageId); objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`); objects.push(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}endstream`); });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n"; const offsets = [0]; objects.forEach((object, index) => { offsets.push(new TextEncoder().encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = new TextEncoder().encode(pdf).length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export function salesPdfFileName(input: SalesPdfInput) { return `${input.documentType}-${input.documentNumber}-${input.clientName}.pdf`.toLowerCase().replace(/[^a-z0-9.]+/g, "-"); }
export function downloadSalesPdf(blob: Blob, input: SalesPdfInput) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = salesPdfFileName(input); document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
