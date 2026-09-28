/** Isolated local API regression audit. Never connects to the app database. */
import assert from "node:assert/strict";
import { randomBytes, publicEncrypt, constants } from "node:crypto";
import mongoose from "mongoose";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFile, writeFile, unlink } from "node:fs/promises";

const database = `vidhai_debit_note_audit_${Date.now()}`;
process.env.MONGODB_URI = `mongodb://127.0.0.1:27017/${database}?replicaSet=rs0`;
process.env.BOOTSTRAP_ADMIN_USERNAME = "audit_admin";
process.env.BOOTSTRAP_ADMIN_PASSWORD = randomBytes(24).toString("hex");
process.env.SESSION_SECRET = randomBytes(32).toString("hex");
process.env.JWT_ACCESS_SECRET = randomBytes(32).toString("hex");
process.env.JWT_REFRESH_SECRET = randomBytes(32).toString("hex");
process.env.JWT_ACCESS_EXPIRY = "15m";
process.env.JWT_REFRESH_EXPIRY = "3d";
process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS = "259200000";
process.env.SESSION_COOKIE_MAX_AGE_MS = "259200000";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";
process.env.UPLOAD_ROOT = await mkdtemp(path.join(tmpdir(), "vidhai-debit-note-audit-"));

const { default: app } = await import("../../artifacts/api-server/src/app");
const schema = await import("@workspace/db");
const { db, eq } = schema;
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
type Client = { token?: string; cookies?: string };
async function request(client: Client, path: string, method = "GET", body?: any, expected = 200) {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(client.token ? { Authorization: `Bearer ${client.token}` } : {}), ...(client.cookies ? { Cookie: client.cookies } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data: any = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  const cookies = response.headers.getSetCookie();
  if (cookies.length) {
    const jar = new Map((client.cookies || "").split("; ").filter(Boolean).map((entry) => { const index = entry.indexOf("="); return [entry.slice(0, index), entry.slice(index + 1)]; }));
    for (const cookie of cookies) { const pair = cookie.split(";")[0]; const index = pair.indexOf("="); jar.set(pair.slice(0, index), pair.slice(index + 1)); }
    client.cookies = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  }
  return data;
}
async function login(username: string, password: string) {
  const client: Client = {};
  const { publicKey } = await request(client, "/auth/login-key");
  const encrypted = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(password)).toString("base64");
  const result = await request(client, "/auth/login", "POST", { username, password: encrypted, passwordEncoding: "rsa-oaep-256" });
  client.token = result.accessToken;
  return client;
}
try {
  if (process.env.REPRODUCE_OLD_DEBIT_SAVE === "1") {
    const routeUrl = new URL("../../artifacts/api-server/src/routes/accounts.ts", import.meta.url);
    const copyUrl = new URL(`../../artifacts/api-server/src/routes/accounts.audit-${Date.now()}.ts`, import.meta.url);
    const currentSource = await readFile(routeUrl, "utf8");
    const beforeSource = currentSource.replace(
      /const accounts = await tx.select\(\).from\(chartOfAccountsTable\).where\(eq\(chartOfAccountsTable.organizationId, org\)\);/,
      "const accounts = await coa(org);",
    );
    assert.notEqual(beforeSource, currentSource);
    await writeFile(copyUrl, beforeSource);
    try {
      const { default: currentRouter } = await import(routeUrl.href);
      const { default: beforeRouter } = await import(copyUrl.href);
      currentRouter.stack = beforeRouter.stack;
    } finally { await unlink(copyUrl); }
    console.log("REPRODUCING OLD SAVE HANDLER with real MongoDB");

  }
  const admin = await login("audit_admin", process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  const modulePassword = randomBytes(3).toString("hex");
  await request(admin, "/settings/module-encryption", "PUT", { module: "ledger", password: modulePassword });
  await request(admin, "/module-encryption/verify", "POST", { module: "ledger", password: modulePassword });
  const [vendor] = await db.insert(schema.contactsTable).values({ type: "vendor", name: "Debit Note Audit Vendor" }).returning();
  const accounts = await request(admin, "/accounts/coa");
  const expense = accounts.find((account: any) => account.accountCode === "5100");
  await request(admin, "/accounts/ap", "POST", {
    vendorId: vendor.id, billNumber: "AUDIT-BILL", billDate: "2026-09-28", dueDate: "2026-09-28",
    amount: 1500, paidAmount: 0, adjustedAmount: 0, entryType: "Bill", sourceType: "Manual",
  }, 201);
  console.log("BILL CREATED; saving debit note against real MongoDB");
  if (process.env.REPRODUCE_OLD_DEBIT_SAVE === "1") {
    const transaction = db.transaction.bind(db);
    db.transaction = async <T>(fn: (tx: typeof db) => Promise<T>): Promise<T> => {
      let attempts = 0;
      return transaction(async (tx: any) => {
        attempts++;
        try { return await fn(tx); } catch (error: any) {
          console.log(`TRANSACTION ATTEMPT ${attempts}: ${error.codeName || error.name}: ${error.message}`);
          if (attempts >= 3) throw new Error("Audit stopped after 3 failed transaction attempts");
          throw error;
        }
      });
    };
  }
  const started = Date.now();
  const note = await request(admin, "/accounts/ap", "POST", {
    vendorId: vendor.id, billNumber: "AUDIT-DN", againstBillNumber: "AUDIT-BILL",
    billDate: "2026-09-28", dueDate: "2026-09-28", amount: 500, paidAmount: 500,
    adjustedAmount: 0, coaAccountId: expense.id, entryType: "Debit Note", sourceType: "Manual", notes: "",
  }, 201);
  console.log(`DEBIT NOTE SAVED in ${Date.now() - started}ms`);
  const [saved] = await db.select().from(schema.accountsPayableTable).where(eq(schema.accountsPayableTable.id, note.id));
  assert.equal(Number(saved.appliedAmount), 500);
  const [bill] = await db.select().from(schema.accountsPayableTable).where(eq(schema.accountsPayableTable.billNumber, "AUDIT-BILL"));
  assert.equal(Number(bill.adjustedAmount), 500);
  console.log(`PASS real database save and linked bill adjustment; isolated database ${database}`);
} finally {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await mongoose.disconnect();
}


