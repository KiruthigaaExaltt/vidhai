import path from "node:path";
import { pathToFileURL } from "node:url";

// Inspect the downloaded artifact independently of the application's blob URL.
const root = path.resolve(import.meta.dirname, "../..");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(root, "tmp/browser-tools/node_modules/playwright/index.mjs")).href);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
  await page.goto(pathToFileURL(path.join(root, "docs/qa/browser/browser-salary-slip.pdf")).href);
  // Chrome's built-in PDF renderer paints asynchronously after page load.
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(root, "docs/qa/browser/downloaded-payslip.png"), fullPage: true, animations: "disabled" });
  console.log("Saved downloaded-payslip.png for visual inspection");
} finally {
  await browser.close();
}
