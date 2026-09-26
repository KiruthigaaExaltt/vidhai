import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function runBrowserChecks({ base, adminPassword, request, admin, db, schema, pass }) {
  const root = path.resolve(import.meta.dirname, "../..");
  const output = path.join(root, "docs/qa/browser");
  await fs.mkdir(output, { recursive: true });
  const playwrightPath = process.env.PLAYWRIGHT_MODULE || path.join(root, "tmp/browser-tools/node_modules/playwright/index.mjs");
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  console.log("BROWSER: Playwright loaded; starting isolated frontend");
  const { createServer } = await import(pathToFileURL(path.join(root, "artifacts/vidhai-erp/node_modules/vite/dist/node/index.js")).href);
  process.env.PORT = "5173";
  process.env.BASE_PATH = "/";
  process.env.VITE_API_BASE = "";
  process.env.VITE_ENABLE_PWA_DEV = "false";
  process.env.API_PROXY_TARGET = base.replace(/\/api$/, "");
  const vite = await createServer({
    configFile: path.join(root, "artifacts/vidhai-erp/vite.config.ts"),
    server: { host: "127.0.0.1", port: 5189, strictPort: false },
    resolve: { alias: { "@tensorflow-models/blazeface": path.join(root, "scripts/test/fixtures/browser-face-detector.mjs") } },
    logLevel: "warn",
  });
  let browser;
  const errors = [];
  try {
    await vite.listen();
    console.log("BROWSER: frontend ready; launching headless Chrome");
    const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
    browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["camera", "geolocation"], geolocation: { latitude: 11.0168, longitude: 76.9558, accuracy: 10 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on("pageerror", error => errors.push(error.message));
    const login = async (target, username, password) => {
      await target.goto(`${url}/login`);
      await target.getByLabel("Username", { exact: true }).fill(username);
      await target.getByLabel("Password", { exact: true }).fill(password);
      await target.getByRole("button", { name: "Sign In", exact: true }).click();
      await target.waitForURL(location => !["/login", "/"].includes(location.pathname), { timeout: 60000 });
    };
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const pattern = await request(admin, "/work-pattern-templates", "POST", { templateName: "Browser all working days", ...Object.fromEntries([1,2,3,4,5].map(n => [`week${n}OffDays`, []])) }, 201);
    const holiday = await request(admin, "/holiday-templates", "POST", { templateName: "Browser holidays", effectiveYear: Number(today.slice(0,4)), effectiveFrom: `${today.slice(0,4)}-01-01`, holidays: [] }, 201);
    const attendance = await request(admin, "/attendance-templates", "POST", { templateName: "Browser attendance", workStartTime: "09:30", workEndTime: "18:30", fineType: "based_on_salary", finePerHour: 0 }, 201);
    const salary = await request(admin, "/salary-templates", "POST", { templateName: "Browser salary", components: [{ id: "basic", name: "Basic", calculationType: "fixed", value: "20000", order: 1 }] }, 201);
    const [employee] = await db.insert(schema.employeesTable).values({ name: "Browser Crew", employeeCode: "BROWSER-1", designation: "Tester", department: "QA", employmentType: "Full Time", workMode: "On-site", location: "QA", joinDate: `${today.slice(0,4)}-01-01`, baseSalary: "20000", annualCtc: "240000", attendanceRulesTemplate: attendance.id, workPatternTemplate: pattern.id, salaryTemplateId: salary.id, holidayTemplate: holiday.id, fixedComponentValues: '{"basic":20000}' }).returning();
    await db.insert(schema.rolesTable).values({ name: "Browser dashboard", slug: "browser_dashboard", permissions: '["dashboard.view"]' });
    await request(admin, "/users", "POST", { username: "browser_crew", name: "Browser Crew", role: "browser_dashboard", employeeId: employee.id }, 201);
    await login(page, "audit_crew", "vidhaii123");
    assert.ok(page.url().endsWith("/crew"), "An employee without dashboard permission lands in Crew");
    await page.getByRole("button", { name: "Attendance logs", exact: true }).waitFor();
    assert.equal(await page.getByText("ACCESS DENIED", { exact: true }).count(), 0);
    // Logout through the real API, then clear this browser context for the dashboard user.
    await page.evaluate(() => fetch("/api/auth/logout", { method: "POST", credentials: "include" }));
    await context.clearCookies();
    pass("Browser login routes employees without dashboard permission to their allowed Crew page");
    await login(page, "browser_crew", "vidhaii123");
    await page.waitForURL("**/dashboard");
    await page.getByRole("button", { name: "Punch In", exact: true }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Punch In", exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, "desktop-dashboard.png"), fullPage: true, animations: "disabled" });
    pass("Browser employee login and page reload restore session with self-service attendance");

    await context.clearPermissions();
    await context.grantPermissions(["camera"]);
    await page.getByRole("button", { name: "Punch In", exact: true }).click();
    await page.getByText("Location permission denied", { exact: true }).first().waitFor();
    assert.equal(await page.getByRole("button", { name: "Confirm Punch In" }).isDisabled(), true);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await context.grantPermissions(["camera", "geolocation"]);
    pass("Browser denied geolocation blocks attendance confirmation and exposes recovery guidance");

    // Address service outage must preserve captured GPS. No real external geocoder needed.
    await page.route("**/api/crew/attendance/reverse-geocode", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Simulated geocoder outage"}' }));
    await page.getByRole("button", { name: "Punch In", exact: true }).click();
    await page.getByText("Location captured (GPS)", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Confirm Punch In" }).isDisabled(), true);
    await page.evaluate(() => { window.__auditFaceCount = 0; });
    await page.getByText("No face detected", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Capture Photo", exact: true }).isDisabled(), true);
    await page.evaluate(() => { window.__auditFaceCount = 1; });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent.includes("Capture Photo") && !b.disabled));
    await page.getByRole("button", { name: "Capture Photo", exact: true }).click();
    await page.getByAltText("Captured attendance evidence").waitFor();
    await page.screenshot({ path: path.join(output, "desktop-punch-evidence.png"), fullPage: true, animations: "disabled" });
    await page.getByRole("button", { name: "Confirm Punch In" }).click();
    await page.getByRole("button", { name: "Punch Out", exact: true }).waitFor();
    pass("Browser punch-in requires camera capture and GPS; geocoder outage preserves valid coordinates");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Punch Out", exact: true }).click();
    await page.getByText("Location captured (GPS)", { exact: true }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent.includes("Capture Photo") && !b.disabled));
    await page.getByRole("button", { name: "Capture Photo", exact: true }).click();
    await page.getByRole("button", { name: "Confirm Punch Out" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.screenshot({ path: path.join(output, "mobile-dashboard.png"), fullPage: true, animations: "disabled" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "Mobile dashboard must not overflow horizontally");
    const rows = await db.select().from(schema.attendanceLogsTable);
    const punch = rows.find(r => Number(r.employeeId) === Number(employee.id));
    assert.ok(punch?.checkInPhoto && punch?.checkOutPhoto);
    assert.equal(punch.approvalStatus, "Pending");
    pass("Mobile viewport completes punch-out; real API saves both camera images and pending request");

    const storage = await context.storageState();
    const reopened = await browser.newContext({ storageState: storage, viewport: { width: 390, height: 844 } });
    const reopenedPage = await reopened.newPage();
    await reopenedPage.goto(`${url}/dashboard`);
    await reopenedPage.getByText("Attendance submitted for approval", { exact: true }).waitFor();
    assert.ok(!reopenedPage.url().endsWith("/login"));
    await reopened.close();
    pass("Fresh browser context restores employee session using persistent cookies");

    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const adminPage = await adminContext.newPage();
    adminPage.setDefaultTimeout(30000);
    adminPage.on("pageerror", error => errors.push(error.message));
    await login(adminPage, "audit_admin", adminPassword);
    await adminPage.goto(`${url}/crew`);
    await adminPage.getByRole("button", { name: "Salary structure for Browser Crew", exact: true }).click();
    await adminPage.getByRole("dialog").getByText("Salary Structure", { exact: true }).waitFor();
    await adminPage.locator("#fixed-basic").fill("21000");
    assert.equal(await adminPage.getByRole("button", { name: "Save Salary Structure" }).isDisabled(), true);
    await adminPage.locator("#fixed-basic").fill("20000");
    await adminPage.getByRole("button", { name: "Save Salary Structure" }).click();
    await adminPage.getByRole("dialog").waitFor({ state: "hidden" });
    await adminPage.getByRole("button", { name: "Salary structure for Browser Crew", exact: true }).click();
    await adminPage.locator("#fixed-basic").waitFor();
    assert.equal(await adminPage.locator("#fixed-basic").inputValue(), "20000");
    await adminPage.screenshot({ path: path.join(output, "salary-structure.png"), fullPage: true, animations: "disabled" });
    await adminPage.getByRole("button", { name: "Close", exact: true }).click();
    pass("Browser salary dialog rejects excessive components and persists valid salary on reopen");

    const hrContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const hrPage = await hrContext.newPage();
    hrPage.setDefaultTimeout(30000);
    await login(hrPage, "audit_hr", "vidhaii123");
    await hrPage.goto(`${url}/crew?tab=attendance`);
    await hrPage.getByRole("button", { name: /^Approvals \(/ }).click();
    await hrPage.getByLabel("Filter attendance by employee").selectOption(String(employee.id));
    await hrPage.getByRole("button", { name: "Approve", exact: true }).click();
    const review = hrPage.getByRole("dialog");
    await review.getByLabel("Punch in", { exact: true }).fill("09:30");
    await review.getByLabel("Punch out", { exact: true }).fill("18:30");
    await review.getByText("Calculated fine: INR 0.00", { exact: false }).waitFor();
    await review.getByRole("button", { name: "Approve", exact: true }).click();
    await review.waitFor({ state: "hidden" });
    await hrPage.getByLabel("Approval status").selectOption("Approved");
    await hrPage.getByRole("table").first().getByRole("row").filter({ hasText: "Browser Crew" }).waitFor();
    await hrPage.screenshot({ path: path.join(output, "hr-approval.png"), fullPage: true, animations: "disabled" });
    const approved = (await db.select().from(schema.attendanceLogsTable)).find(r => r.id === punch.id);
    assert.equal(approved.approvalStatus, "Approved");
    assert.equal(approved.checkInTime, "09:30");
    assert.equal(approved.checkOutTime, "18:30");
    pass("HR browser approval works without employee/update access and saves reviewed time corrections");

    await request(admin, "/crewpay/salary-slips/generate", "POST", { employeeId: employee.id, year: Number(today.slice(0,4)), month: Number(today.slice(5,7)) });
    await adminPage.goto(`${url}/crewpay`);
    await adminPage.locator('input[type="month"]').fill(today.slice(0,7));
    await adminPage.getByRole("row").filter({ hasText: "Browser Crew" }).getByRole("button").click();
    await adminPage.getByRole("button", { name: "Preview", exact: true }).click();
    await adminPage.getByRole("dialog").getByText("Salary slip preview", { exact: true }).waitFor();
    const pdfUrl = await adminPage.locator('iframe[title="Salary slip PDF"]').getAttribute("src");
    assert.ok(pdfUrl.startsWith("blob:"));
    const pdfHeader = await adminPage.evaluate(async url => (await (await fetch(url)).text()).slice(0,5), pdfUrl);
    assert.equal(pdfHeader, "%PDF-");
    const downloaded = adminPage.waitForEvent("download");
    await adminPage.getByRole("dialog").getByRole("link", { name: "Download PDF" }).click();
    await (await downloaded).saveAs(path.join(output, "browser-salary-slip.pdf"));
    await adminPage.screenshot({ path: path.join(output, "salary-pdf-preview.png"), fullPage: true, animations: "disabled" });
    pass("Browser salary preview generates a PDF and download completes");
    await fs.writeFile(path.join(output, "result.json"), JSON.stringify({ checkedAt: new Date().toISOString(), browser: await browser.version(), simulated: ["camera stream", "GPS", "face detector", "geocoder outage"], pageErrors: errors }, null, 2));
    assert.deepEqual(errors, [], "No uncaught browser exceptions");
  } catch (error) {
    if (browser) for (const [index, context] of browser.contexts().entries()) for (const [p, page] of context.pages().entries()) {
      await page.screenshot({ path: path.join(output, `failure-${index}-${p}.png`), fullPage: true }).catch(() => {});
      await fs.writeFile(path.join(output, `failure-${index}-${p}.txt`), await page.locator("body").innerText().catch(() => "Page unavailable"));
    }
    throw error;
  } finally {
    await browser?.close();
    await vite.close();
  }
}
