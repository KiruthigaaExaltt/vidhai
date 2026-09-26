/** Read checks against the populated local app, including real API and browser. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { publicEncrypt, constants } from "node:crypto";
import mongoose from "mongoose";
import type { Field } from "../../lib/db/src/schema/dsl";
const uri = new URL(process.env.MONGODB_URI!);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname));
assert.equal(uri.pathname, "/vidhaiic");
const root = path.resolve(import.meta.dirname, "../..");
const state = JSON.parse(
  await fs.readFile(
    path.join(root, "tmp/local-manual-seed/state.json"),
    "utf8",
  ),
);
assert.equal(state.extrasComplete, true, "Finish local:data:seed first");
process.env.LOG_LEVEL = "silent";
const { default: app } = await import("../../artifacts/api-server/src/app");
const s = await import("@workspace/db");
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const api = `http://127.0.0.1:${(server.address() as any).port}/api`;
let token = "";
let cookies = "";
const apiResults: any[] = [];
const browserResults: any[] = [];
const request = async (route: string, body?: any) => {
  const res = await fetch(api + route, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : { Cookie: cookies }),
      ...(cookies ? { Cookie: cookies } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const jar = new Map(
    cookies
      .split("; ")
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf("=");
        return [c.slice(0, i), c.slice(i + 1)];
      }),
  );
  for (const raw of res.headers.getSetCookie()) {
    const c = raw.split(";")[0],
      i = c.indexOf("=");
    jar.set(c.slice(0, i), c.slice(i + 1));
  }
  cookies = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const data: any = await res.json();
  assert.equal(res.status, 200, `${route}: ${JSON.stringify(data)}`);
  return data;
};
let vite: any, browser: any;
try {
  const key = await request("/auth/login-key");
  const login = await request("/auth/login", {
    username: process.env.BOOTSTRAP_ADMIN_USERNAME,
    password: publicEncrypt(
      {
        key: key.publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(process.env.BOOTSTRAP_ADMIN_PASSWORD!),
    ).toString("base64"),
    passwordEncoding: "rsa-oaep-256",
  });
  token = login.accessToken;
  await request("/module-encryption/verify", {
    module: "ledger",
    password: state.ledgerPassword || process.env.LOCAL_QA_LEDGER_PASSWORD,
  });
  const lists = [
    "/materials",
    "/inventory",
    "/services",
    "/categories",
    "/vault/locations",
    "/vault/item-names",
    "/contacts",
    "/departments",
    "/roles",
    "/users",
    "/assets",
    "/assets/allocations",
    "/tasks",
    "/work-orders",
    "/work-orders/templates",
    "/sales",
    "/sales/quotations",
    "/sales/proforma-invoices",
    "/sales/challans",
    "/sales/invoices",
    "/sales/payments",
    "/sales/returns",
    "/sales/receivable-adjustments",
    "/accounts/bank-cash-transactions",
    "/flex/purchase-requests",
    "/flex/purchase-orders",
    "/flex/goods-receipts",
    "/flex/purchase-invoices",
    "/flex/vendor-payments",
    "/flex/purchase-returns",
    "/fleet/vehicles",
    "/fleet/fuel-logs",
    "/fleet/maintenance-logs",
    "/fleet/usage-logs",
    "/fleet/status-history",
    "/batches",
    "/chambers",
    "/coimbatore/batches",
    "/coimbatore/casing-inventory",
    "/lab/batches",
    "/spawn",
    "/spawn/transactions",
    "/ooty/rooms",
    "/ooty/growing-batches",
    "/traceability/links",
    "/scheduling/events",
    "/crew/employees",
    "/attendance-templates",
    "/salary-templates",
    "/work-pattern-templates",
    "/holiday-templates",
    "/leave-templates",
    `/crewpay/salary-slips?payrollMonth=${state.priorMonth}`,
    "/accounts/coa",
    "/accounts/journal-entries",
  ];
  for (const route of lists) {
    const data = await request(route);
    const array = Array.isArray(data)
      ? data
      : (Object.values(data).find(Array.isArray) as any[]);
    const count = Number(data.totalCount ?? data.total ?? array?.length ?? 0);
    assert.ok(
      count >= 10,
      `${route}: expected 10 rows, found ${count}; keys ${Object.keys(data)}`,
    );
    apiResults.push({ route, count });
  }
  const tables = s.listMongoTables(),
    data = new Map<string, any[]>();
  for (const table of tables)
    data.set(table.$name, await s.db.select().from(table));
  const references: string[] = [];
  for (const table of tables)
    for (const row of data.get(table.$name)!)
      for (const [key, field] of Object.entries(table) as [string, Field][]) {
        if (!field.reference || row[key] == null) continue;
        const target = field.reference(),
          records = data.get(target.table!.$name)!;
        if (!records.some((r) => r[target.name] === row[key]))
          references.push(
            `${table.$name}#${row.id}.${key} -> ${target.table!.$name}#${row[key]}`,
          );
      }
  assert.deepEqual(references, [], "Broken schema references");
  const staff = data
    .get("employees")!
    .filter((e) => String(e.employeeCode).startsWith("MF-"));
  const ids = new Set(staff.map((e) => e.id));
  const slips = data.get("salary_slips")!.filter((p) => ids.has(p.employeeId));
  for (const slip of slips)
    assert.ok(
      Math.abs(
        Number(slip.grossPay) -
          Number(slip.totalDeductions) -
          Number(slip.netPay),
      ) < 0.011,
      `Salary arithmetic ${slip.id}`,
    );
  for (const payroll of data
    .get("payroll")!
    .filter((p) => ids.has(p.employeeId))) {
    const slip = slips.find((p) => p.id === payroll.salarySlipId)!;
    assert.ok(slip, `Missing payroll slip ${payroll.id}`);
    assert.equal(Number(payroll.netPay), Number(slip.netPay));
  }
  console.log(
    `PASS ${apiResults.length} populated API lists, references and ${slips.length} salary totals`,
  );
  const { chromium } = await import(
    pathToFileURL(
      path.join(root, "tmp/browser-tools/node_modules/playwright/index.mjs"),
    ).href
  );
  const { createServer } = await import(
    pathToFileURL(
      path.join(
        root,
        "artifacts/vidhai-erp/node_modules/vite/dist/node/index.js",
      ),
    ).href
  );
  process.env.PORT = "5173";
  process.env.BASE_PATH = "/";
  process.env.VITE_API_BASE = "";
  process.env.VITE_ENABLE_PWA_DEV = "false";
  process.env.API_PROXY_TARGET = api.replace(/\/api$/, "");
  vite = await createServer({
    configFile: path.join(root, "artifacts/vidhai-erp/vite.config.ts"),
    server: { host: "127.0.0.1", port: 5190, strictPort: false },
    resolve: {
      alias: {
        "@tensorflow-models/blazeface": path.join(
          root,
          "scripts/test/fixtures/browser-face-detector.mjs",
        ),
      },
    },
    logLevel: "warn",
  });
  await vite.listen();
  const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultNavigationTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error: any) => errors.push(error.message));
  await page.goto(url + "/login");
  await page
    .getByLabel("Username", { exact: true })
    .fill(process.env.BOOTSTRAP_ADMIN_USERNAME!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("**/dashboard", { timeout: 60000 });
  for (const route of [
    "/dashboard",
    "/crew",
    "/crewpay",
    "/inventory",
    "/crm",
    "/sales",
    "/tasks",
    "/accounts",
    "/fleet",
    "/annur/batches",
    "/coimbatore/batches",
    "/lab/batches",
    "/ooty",
    "/traceability",
    "/scheduling",
    "/flex/purchase-requests",
    "/flex/purchase-orders",
    "/flex/goods-receipts",
    "/flex/purchase-invoices",
    "/flex/vendor-payments",
    "/flex/purchase-returns",
    "/settings",
    "/notifications",
  ]) {
    await page.goto(url + route);
    await page.waitForLoadState("networkidle", { timeout: 60000 });
    if (route === "/accounts") {
      await page
        .locator('input[autocomplete="current-password"]')
        .fill(state.ledgerPassword || process.env.LOCAL_QA_LEDGER_PASSWORD);
      await page
        .getByRole("button", { name: "Unlock Ledger", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Unlock Ledger", exact: true })
        .waitFor({ state: "hidden" });
      await page.waitForLoadState("networkidle");
    }
    const body = await page.locator("body").innerText();
    assert.ok(
      !/Something went wrong|ACCESS DENIED|Unexpected Application Error/.test(
        body,
      ),
      route,
    );
    assert.ok(body.length > 150, `${route} rendered content`);
    browserResults.push({ route, passed: true });
    console.log(`PASS local browser ${route}`);
  }
  await fs.mkdir(path.join(root, "docs/qa/local-browser"), { recursive: true });
  await page.goto(url + "/crew");
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: path.join(root, "docs/qa/local-browser/crew.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(root, "docs/qa/local-data-verification.json"),
    JSON.stringify(
      {
        database: "vidhaiic",
        apiResults,
        browserResults,
        brokenReferences: references,
        verifiedSalarySlips: slips.length,
        pageErrors: errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`PASS ${browserResults.length} populated browser pages`);
} finally {
  if (browser) await browser.close();
  if (vite) await vite.close();
  await new Promise<void>((r) => server.close(() => r()));
  await mongoose.disconnect();
}
