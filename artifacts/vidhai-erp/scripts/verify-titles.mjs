import assert from "node:assert/strict";
import { getDocumentTitle, resolvePageTitle } from "../src/lib/titles.ts";

const testCases = [
  // Top-level core modules
  { path: "/dashboard", expected: "Vidhai ERP | Dashboard" },
  { path: "/accounts", expected: "Vidhai ERP | Accounts" },
  { path: "/sales", expected: "Vidhai ERP | Sales" },
  { path: "/crew", expected: "Vidhai ERP | Crew" },
  { path: "/crewpay", expected: "Vidhai ERP | CrewPay" },
  { path: "/crm", expected: "Vidhai ERP | CRM" },
  { path: "/tasks", expected: "Vidhai ERP | Tasks" },
  { path: "/inventory", expected: "Vidhai ERP | Inventory" },
  { path: "/settings", expected: "Vidhai ERP | Settings" },
  { path: "/profile", expected: "Vidhai ERP | Profile" },
  { path: "/notifications", expected: "Vidhai ERP | Notifications" },
  { path: "/traceability", expected: "Vidhai ERP | Traceability" },
  { path: "/login", expected: "Vidhai ERP | Login" },

  // Scheduling
  { path: "/scheduling", expected: "Vidhai ERP | Calendar" },
  { path: "/scheduling/suggest", expected: "Vidhai ERP | Plan Schedule" },

  // Location A: Annur
  { path: "/annur/batches", expected: "Vidhai ERP | Batches" },
  { path: "/annur/batches/new", expected: "Vidhai ERP | Batches | New Batch" },
  { path: "/annur/batches/101", expected: "Vidhai ERP | Batches" },
  { path: "/annur/chambers", expected: "Vidhai ERP | Chambers" },

  // Location B: Ooty
  { path: "/ooty", expected: "Vidhai ERP | Growing Rooms" },
  { path: "/ooty/history", expected: "Vidhai ERP | Room History" },
  { path: "/ooty/rooms/room-5", expected: "Vidhai ERP | Growing Rooms" },

  // Location C: Coimbatore
  { path: "/coimbatore/batches", expected: "Vidhai ERP | Casing Soil Batches" },
  { path: "/coimbatore/batches/batch-12", expected: "Vidhai ERP | Casing Soil Batches" },
  { path: "/coimbatore/chambers", expected: "Vidhai ERP | Casing Soil Chambers" },

  // Location D: Lab
  { path: "/lab/batches", expected: "Vidhai ERP | Spawn Batches" },
  { path: "/lab/batches/spawn-8", expected: "Vidhai ERP | Spawn Batches" },

  // Fleet
  { path: "/fleet", expected: "Vidhai ERP | Vehicle Fleet" },
  { path: "/fleet/settings", expected: "Vidhai ERP | Vehicle Fleet" },
  { path: "/fleet/vehicle-42", expected: "Vidhai ERP | Vehicle Fleet" },

  // Reports
  { path: "/reports", expected: "Vidhai ERP | Reports" },
  { path: "/reports/batch-summary", expected: "Vidhai ERP | Reports | Batch Summary" },
  { path: "/reports/monthly-production", expected: "Vidhai ERP | Reports | Monthly Production" },
  { path: "/reports/quality-trend", expected: "Vidhai ERP | Reports | Quality Trend" },
  { path: "/reports/vehicle-utilization", expected: "Vidhai ERP | Reports | Vehicle Utilization" },
  { path: "/reports/fuel-consumption", expected: "Vidhai ERP | Reports | Fuel Consumption" },
  { path: "/reports/batch-costing", expected: "Vidhai ERP | Reports | Batch Costing" },
  { path: "/reports/annur-batch-yield", expected: "Vidhai ERP | Reports | Annur Batch Yield" },

  // Procurement (Flex)
  { path: "/flex", expected: "Vidhai ERP | Procurement" },
  { path: "/flex/purchase-requests", expected: "Vidhai ERP | Procurement | Purchase Requests" },
  { path: "/flex/purchase-orders", expected: "Vidhai ERP | Procurement | Purchase Orders" },
  { path: "/flex/goods-receipts", expected: "Vidhai ERP | Procurement | Goods Receipts" },
  { path: "/flex/purchase-invoices", expected: "Vidhai ERP | Procurement | Purchase Invoices" },
  { path: "/flex/vendor-payments", expected: "Vidhai ERP | Procurement | Vendor Payments" },
  { path: "/flex/purchase-returns", expected: "Vidhai ERP | Procurement | Purchase Returns" },

  // Query strings, hashes, trailing slashes
  { path: "/accounts/", expected: "Vidhai ERP | Accounts" },
  { path: "/settings?section=users", expected: "Vidhai ERP | Settings" },
  { path: "/flex/purchase-requests?status=pending", expected: "Vidhai ERP | Procurement | Purchase Requests" },
  { path: "/ooty#room-1", expected: "Vidhai ERP | Growing Rooms" },

  // Parent module fallbacks
  { path: "/flex/new-unmapped-child", expected: "Vidhai ERP | Procurement" },
  { path: "/reports/custom-export", expected: "Vidhai ERP | Reports" },
  { path: "/ooty/unmapped-sub", expected: "Vidhai ERP | Growing Rooms" },

  // Landing & Unknown / Unmapped routes
  { path: "/", expected: "Vidhai ERP" },
  { path: "", expected: "Vidhai ERP" },
  { path: "/nonexistent-page", expected: "Vidhai ERP" },
  { path: "/404-random", expected: "Vidhai ERP" },
];

console.log(`Running ${testCases.length} route title test cases...`);

for (const { path, expected } of testCases) {
  const result = getDocumentTitle(path);
  assert.equal(
    result,
    expected,
    `Failed for path "${path}". Expected "${expected}", got "${result}"`
  );
}

console.log("All route title test cases passed successfully!");
