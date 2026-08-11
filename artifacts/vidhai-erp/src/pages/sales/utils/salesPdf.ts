export type SalesPdfLine = {
  description: string;
  hsn?: string;
  quantity: number;
  uom?: string;
  rate: number;
  cgstPercent?: number;
  sgstPercent?: number;
  igstPercent?: number;
  lineTotal: number;
};
export type SalesPdfInput = {
  documentType: string;
  documentNumber: string;
  docDate: string;
  dueDate?: string;
  docDateLabel: string;
  dueDateLabel: string;
  status?: string;
  companyName: string;
  companyAddress?: string;
  companyGstin?: string;
  companyPhone?: string;
  salesExecutive?: string;
  clientName: string;
  clientAddress?: string;
  clientGstin?: string;
  clientPhone?: string;
  placeOfSupply?: string;
  lines: SalesPdfLine[];
  subtotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  grandTotal: number;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branch?: string;
  terms?: string;
  notes?: string;
  documentBody?: string;
  logoUrl?: string;
  watermarkUrl?: string;
  bankQrUrl?: string;
  logoSrc?: string;
  watermarkSrc?: string;
  bankQrSrc?: string;
};
type PdfImage = { bytes: Uint8Array; width: number; height: number };
const encoder = new TextEncoder();
const bytes = (value: string) => encoder.encode(value);
const concat = (parts: Uint8Array[]) => {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};
const money = (value: number) => `Rs ${Number(value || 0).toFixed(2)}`;
const safe = (value: unknown) =>
  String(value ?? "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
const text = (x: number, y: number, value: unknown, size = 9, bold = false) =>
  `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${safe(value)}) Tj ET\n`;
const line = (x1: number, y1: number, x2: number, y2: number) =>
  `${x1} ${y1} m ${x2} ${y2} l S\n`;
const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  fill = false,
) => `${x} ${y} ${width} ${height} re ${fill ? "f" : "S"}\n`;
const truncate = (value: unknown, length: number) => {
  const raw = String(value ?? "");
  return raw.length > length ? `${raw.slice(0, length - 3)}...` : raw;
};
async function toJpeg(source?: string): Promise<string> {
  if (!source) return "";
  let objectUrl = "";
  try {
    let src = source;
    if (!source.startsWith("data:")) {
      const response = await fetch(source, { credentials: "include" });
      if (!response.ok) return "";
      objectUrl = URL.createObjectURL(await response.blob());
      src = objectUrl;
    }
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = src;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.naturalWidth);
    canvas.height = Math.max(1, image.naturalHeight);
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return "";
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
export async function prepareSalesPdfInput(
  input: SalesPdfInput,
): Promise<SalesPdfInput> {
  const [logoSrc, watermarkSrc, bankQrSrc] = await Promise.all([
    toJpeg(input.logoUrl),
    toJpeg(input.watermarkUrl),
    toJpeg(input.bankQrUrl),
  ]);
  return { ...input, logoSrc, watermarkSrc, bankQrSrc };
}
function jpeg(value?: string): PdfImage | null {
  if (!value?.startsWith("data:image/jpeg;base64,")) return null;
  const raw = atob(value.slice(value.indexOf(",") + 1));
  const data = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  let offset = 2,
    width = 0,
    height = 0;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    const length = (data[offset + 2] << 8) + data[offset + 3];
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      height = (data[offset + 5] << 8) + data[offset + 6];
      width = (data[offset + 7] << 8) + data[offset + 8];
      break;
    }
    offset += Math.max(2, length + 2);
  }
  return width && height ? { bytes: data, width, height } : null;
}
function pageStream(
  input: SalesPdfInput,
  rows: SalesPdfLine[],
  page: number,
  pages: number,
  images: { logo?: boolean; watermark?: boolean; qr?: boolean },
) {
  const width = 842;
  let y = 555;
  let stream = "0.15 0.15 0.15 RG 0.6 w\n";
  if (images.watermark) stream += "q /GS1 gs 250 0 0 250 296 170 cm /WM Do Q\n";
  if (images.logo) stream += "q 76 0 0 42 36 513 cm /Logo Do Q\n";
  const companyX = images.logo ? 124 : 36;
  stream +=
    text(companyX, y, input.companyName || "Company", 15, true) +
    text(companyX, y - 16, truncate(input.companyAddress, 78), 8) +
    text(
      companyX,
      y - 29,
      `GSTIN: ${input.companyGstin || "-"}   Phone: ${input.companyPhone || "-"}`,
      8,
    );
  if (input.salesExecutive)
    stream += text(
      companyX,
      y - 41,
      `Sales Executive: ${input.salesExecutive}`,
      7,
    );
  stream +=
    text(650, y, input.documentType.toUpperCase(), 16, true) +
    text(650, y - 18, input.documentNumber || "Draft", 10, true) +
    text(650, y - 32, input.status || "Draft", 8);
  y -= 55;
  stream += line(36, y, width - 36, y);
  y -= 20;
  stream +=
    text(42, y, "BILL TO", 8, true) + text(435, y, "DOCUMENT DETAILS", 8, true);
  stream +=
    text(42, y - 17, input.clientName || "Unknown Client", 11, true) +
    text(42, y - 32, truncate(input.clientAddress, 55), 8) +
    text(42, y - 46, `GSTIN: ${input.clientGstin || "-"}`, 8) +
    text(
      42,
      y - 60,
      `Phone: ${input.clientPhone || "-"}   Place of Supply: ${input.placeOfSupply || "-"}`,
      8,
    );
  stream +=
    text(435, y - 17, `${input.docDateLabel}: ${input.docDate || "-"}`, 9) +
    text(435, y - 34, `${input.dueDateLabel}: ${input.dueDate || "-"}`, 9) +
    text(435, y - 51, `Page: ${page} / ${pages}`, 9);
  y -= 82;
  if (page === 1 && input.documentBody) {
    String(input.documentBody)
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, 3)
      .forEach(
        (bodyLine, index) =>
          (stream += text(42, y - index * 12, truncate(bodyLine, 118), 7)),
      );
    y -= 42;
  }
  const cols = [36, 330, 385, 425, 475, 550, 620, 700, 806];
  stream += "0.94 0.97 0.96 rg " + rect(36, y, 770, 22, true) + "0 0 0 rg ";
  [
    "Description",
    "HSN",
    "Qty",
    "UOM",
    "Rate",
    "CGST%",
    "SGST/IGST%",
    "Line Total",
  ].forEach(
    (heading, index) =>
      (stream += text(cols[index] + 4, y + 7, heading, 7, true)),
  );
  y -= 1;
  rows.forEach((item) => {
    y -= 22;
    stream += line(36, y, 806, y);
    stream +=
      text(40, y + 7, truncate(item.description, 49), 8) +
      text(334, y + 7, item.hsn || "-", 8) +
      text(389, y + 7, item.quantity, 8) +
      text(429, y + 7, item.uom || "Nos", 8) +
      text(479, y + 7, money(item.rate), 8) +
      text(554, y + 7, Number(item.cgstPercent || 0).toFixed(2), 8) +
      text(
        624,
        y + 7,
        Number(item.igstPercent || item.sgstPercent || 0).toFixed(2),
        8,
      ) +
      text(704, y + 7, money(item.lineTotal), 8, true);
  });
  if (page === pages) {
    y -= 30;
    stream += text(570, y, `${input.documentType} Summary`, 9, true);
    y -= 17;
    [
      ["Subtotal", input.subtotal],
      ["CGST", input.cgstTotal],
      ["SGST", input.sgstTotal],
      ["IGST", input.igstTotal],
      ["Grand Total", input.grandTotal],
    ]
      .filter(
        ([, value]) =>
          Number(value) ||
          value === input.subtotal ||
          value === input.grandTotal,
      )
      .forEach(([label, value]) => {
        stream +=
          text(570, y, label, 8, label === "Grand Total") +
          text(710, y, money(Number(value)), 8, label === "Grand Total");
        y -= 15;
      });
    stream +=
      line(36, 150, 806, 150) +
      text(42, 135, "TERMS & CONDITIONS", 8, true) +
      text(430, 135, "BANK DETAILS", 8, true);
    String(
      input.terms || "Payment is subject to the agreed terms and conditions.",
    )
      .split(/\r?\n/)
      .slice(0, 4)
      .forEach(
        (term, index) =>
          (stream += text(42, 119 - index * 13, truncate(term, 64), 7)),
      );
    stream +=
      text(430, 119, `Bank: ${input.bankName || "-"}`, 7) +
      text(430, 106, `A/C No: ${input.accountNumber || "-"}`, 7) +
      text(430, 93, `IFSC: ${input.ifscCode || "-"}`, 7) +
      text(430, 76, `Branch: ${input.branch || "-"}`, 7);
    if (images.qr)
      stream +=
        "q 64 0 0 64 735 67 cm /QR Do Q\n" +
        text(748, 58, "Scan to Pay", 6, true);
  }
  stream += text(
    300,
    24,
    `Generated for ${input.companyName || "Sales Document"}`,
    7,
  );
  return stream;
}
export function buildSalesPdfBlob(input: SalesPdfInput) {
  const imageValues = {
    logo: jpeg(input.logoSrc),
    watermark: jpeg(input.watermarkSrc),
    qr: jpeg(input.bankQrSrc),
  };
  const objects: Uint8Array[] = [
    bytes("<< /Type /Catalog /Pages 2 0 R >>"),
    new Uint8Array(),
    bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"),
  ];
  const imageIds: Record<string, number> = {};
  for (const [name, image] of Object.entries(imageValues))
    if (image) {
      imageIds[name] = objects.length + 1;
      objects.push(
        concat([
          bytes(
            `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
          ),
          image.bytes,
          bytes("\nendstream"),
        ]),
      );
    }
  let gsId = 0;
  if (imageValues.watermark) {
    gsId = objects.length + 1;
    objects.push(bytes("<< /Type /ExtGState /ca 0.08 /CA 0.08 >>"));
  }
  const lines = input.lines.length
    ? input.lines
    : [{ description: "No line items", quantity: 0, rate: 0, lineTotal: 0 }];
  const chunks: SalesPdfLine[][] = [];
  for (let index = 0; index < lines.length; index += 10)
    chunks.push(lines.slice(index, index + 10));
  const pageIds: number[] = [];
  chunks.forEach((rows, index) => {
    const stream = pageStream(input, rows, index + 1, chunks.length, {
      logo: !!imageValues.logo,
      watermark: !!imageValues.watermark,
      qr: !!imageValues.qr,
    });
    const pageId = objects.length + 1,
      contentId = pageId + 1;
    pageIds.push(pageId);
    const xObjects = `${imageIds.logo ? `/Logo ${imageIds.logo} 0 R ` : ""}${imageIds.watermark ? `/WM ${imageIds.watermark} 0 R ` : ""}${imageIds.qr ? `/QR ${imageIds.qr} 0 R` : ""}`;
    objects.push(
      bytes(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xObjects ? `/XObject << ${xObjects} >>` : ""} ${gsId ? `/ExtGState << /GS1 ${gsId} 0 R >>` : ""} >> /Contents ${contentId} 0 R >>`,
      ),
    );
    const content = bytes(stream);
    objects.push(
      concat([
        bytes(`<< /Length ${content.length} >>\nstream\n`),
        content,
        bytes("endstream"),
      ]),
    );
  });
  objects[1] = bytes(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,
  );
  const parts: Uint8Array[] = [bytes("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")],
    offsets = [0];
  let position = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(position);
    const wrapped = concat([
      bytes(`${index + 1} 0 obj\n`),
      object,
      bytes("\nendobj\n"),
    ]);
    parts.push(wrapped);
    position += wrapped.length;
  });
  const xref = position;
  parts.push(
    bytes(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
        .join(
          "\n",
        )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
    ),
  );
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}
export function salesPdfFileName(input: SalesPdfInput) {
  return `${input.documentType}-${input.documentNumber}-${input.clientName}.pdf`
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-");
}
export function downloadSalesPdf(blob: Blob, input: SalesPdfInput) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = salesPdfFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
