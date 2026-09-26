import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import * as s from "@workspace/db";
import { resolveUploadPath } from "../../artifacts/api-server/src/lib/uploadStorage";
import { triggerReceivableAdjustment } from "../../artifacts/api-server/src/lib/salesAccounting";

function samplePdf(label: string) {
  const stream = `BT /F1 16 Tf 50 750 Td (${label}) Tj 0 -30 Td (LOCAL TEST FIXTURE - not a real receipt) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
export async function seedLocalDetails() {
  const { db, eq } = s;
  const rows = (t: any) => db.select().from(t);
  const ensure = async (t: any, key: string, value: any, data: any) =>
    (await rows(t)).find((r) => r[key] === value) ||
    (
      await db
        .insert(t)
        .values({ ...data, [key]: value })
        .returning()
    )[0];
  const admin = (await rows(s.usersTable)).find(
    (u) => u.systemKey === "SUPER_ADMIN",
  )!;
  const staff = (await rows(s.employeesTable))
    .filter((e) => String(e.employeeCode).startsWith("MF-"))
    .slice(0, 10);
  const bank = (await rows(s.bankCashTransactionsTable)).filter((e) =>
    String(e.reference).startsWith("LOCAL-QA"),
  );
  const invoices = (await rows(s.salesInvoicesTable))
    .filter(
      (e) =>
        String(e.invoiceNumber).startsWith("MF-") && e.status === "Approved",
    )
    .slice(0, 10);
  const uploadDir = resolveUploadPath("accounts", "1", "bank-cash");
  const root = path.resolve(import.meta.dirname, "../..");
  assert.ok(
    uploadDir.startsWith(root + path.sep),
    "Local uploads must stay inside the workspace",
  );
  await fs.mkdir(uploadDir, { recursive: true });
  for (let i = 0; i < 10; i++) {
    const e = staff[i],
      key = `LOCAL-QA-${i + 1}`;
    // Do not replace a manual edit on a retry after partial completion.
    if (!e.bankName)
      await db
        .update(s.employeesTable)
        .set({
          bankName: "Local QA Test Bank",
          accountHolderName: e.name,
          accountNumber: `00000000${String(i + 1).padStart(4, "0")}`,
          ifscCode: "TEST0000001",
          panNumber: "ABCDE1234F",
          gender: i % 2 ? "Female" : "Male",
          dateOfBirth: `199${i}-05-12`,
          bloodGroup: ["A+", "B+", "O+", "AB+"][i % 4],
          maritalStatus: i % 2 ? "Married" : "Single",
          fatherName: `QA Parent ${i + 1}`,
          motherName: `QA Parent B ${i + 1}`,
          emergencyContactRelation: "Parent",
          emergencyContactPhone: `90000000${String(i + 1).padStart(2, "0")}`,
          skills: JSON.stringify([
            "Quality inspection",
            "Production reporting",
          ]),
          certifications: JSON.stringify(["Local QA training"]),
        })
        .where(eq(s.employeesTable.id, e.id));
    const fileName = `${key}-sample-receipt.pdf`,
      pdf = samplePdf(`${key} sample receipt`);
    await fs.writeFile(path.join(uploadDir, fileName), pdf);
    await ensure(s.accountDocumentsTable, "fileName", fileName, {
      organizationId: 1,
      sourceType: "bank-cash",
      sourceId: bank[i].id,
      originalName: fileName,
      mimeType: "application/pdf",
      size: pdf.length,
      url: `/api/accounts/files/bank-cash/${fileName}`,
      uploadedByUserId: admin.id,
    });
    const adjustment = await ensure(
      s.salesReceivableAdjustmentsTable,
      "adjustmentNumber",
      key,
      {
        invoiceId: invoices[i].id,
        adjustmentDate: new Date().toISOString().slice(0, 10),
        amount: "25",
        reason: "Local QA sample discount",
        createdByUserId: admin.id,
      },
    );
    if (!adjustment.journalEntryId)
      await triggerReceivableAdjustment(adjustment.id, 1, admin.id);
  }
}
