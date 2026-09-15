export const APP_NAME = "Vidhai ERP";
export const TITLE_SEPARATOR = " | ";

/**
 * Exact and parameterized route to module/page title mapping.
 * Nested routes specify their hierarchical title (e.g., "Procurement | Purchase Requests").
 */
export const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/login": "Login",
  "/notifications": "Notifications",
  "/settings": "Settings",
  "/inventory": "Inventory",
  "/crm": "CRM",
  "/tasks": "Tasks",
  "/profile": "Profile",
  "/traceability": "Traceability",
  "/sales": "Sales",
  "/accounts": "Accounts",
  "/crew": "Crew",
  "/crewpay": "CrewPay",
  "/scheduling": "Calendar",
  "/scheduling/suggest": "Plan Schedule",

  // Annur (Location A)
  "/annur/batches": "Batches",
  "/annur/batches/new": "Batches | New Batch",
  "/annur/batches/:id": "Batches",
  "/annur/chambers": "Chambers",

  // Ooty (Location B)
  "/ooty": "Growing Rooms",
  "/ooty/history": "Room History",
  "/ooty/rooms/:id": "Growing Rooms",

  // Coimbatore (Location C)
  "/coimbatore/batches": "Casing Soil Batches",
  "/coimbatore/batches/:id": "Casing Soil Batches",
  "/coimbatore/chambers": "Casing Soil Chambers",

  // Lab (Location D)
  "/lab/batches": "Spawn Batches",
  "/lab/batches/:id": "Spawn Batches",

  // Vehicle Fleet
  "/fleet": "Vehicle Fleet",
  "/fleet/settings": "Vehicle Fleet",
  "/fleet/:id": "Vehicle Fleet",

  // Reports
  "/reports": "Reports",
  "/reports/batch-summary": "Reports | Batch Summary",
  "/reports/monthly-production": "Reports | Monthly Production",
  "/reports/quality-trend": "Reports | Quality Trend",
  "/reports/vehicle-utilization": "Reports | Vehicle Utilization",
  "/reports/fuel-consumption": "Reports | Fuel Consumption",
  "/reports/batch-costing": "Reports | Batch Costing",
  "/reports/annur-batch-yield": "Reports | Annur Batch Yield",

  // Procurement (Flex)
  "/flex": "Procurement",
  "/flex/purchase-requests": "Procurement | Purchase Requests",
  "/flex/purchase-orders": "Procurement | Purchase Orders",
  "/flex/goods-receipts": "Procurement | Goods Receipts",
  "/flex/purchase-invoices": "Procurement | Purchase Invoices",
  "/flex/vendor-payments": "Procurement | Vendor Payments",
  "/flex/purchase-returns": "Procurement | Purchase Returns",
};

/**
 * Parent module fallbacks for any unmapped nested child paths.
 */
export const PARENT_MODULE_FALLBACKS: Array<{ prefix: string; title: string }> = [
  { prefix: "/flex", title: "Procurement" },
  { prefix: "/reports", title: "Reports" },
  { prefix: "/fleet", title: "Vehicle Fleet" },
  { prefix: "/ooty", title: "Growing Rooms" },
  { prefix: "/coimbatore", title: "Casing Soil Batches" },
  { prefix: "/lab", title: "Spawn Batches" },
  { prefix: "/annur/batches", title: "Batches" },
  { prefix: "/annur/chambers", title: "Chambers" },
  { prefix: "/annur", title: "Batches" },
  { prefix: "/scheduling", title: "Calendar" },
  { prefix: "/inventory", title: "Inventory" },
  { prefix: "/settings", title: "Settings" },
  { prefix: "/crm", title: "CRM" },
  { prefix: "/tasks", title: "Tasks" },
  { prefix: "/accounts", title: "Accounts" },
  { prefix: "/sales", title: "Sales" },
  { prefix: "/crewpay", title: "CrewPay" },
  { prefix: "/crew", title: "Crew" },
  { prefix: "/traceability", title: "Traceability" },
  { prefix: "/notifications", title: "Notifications" },
  { prefix: "/profile", title: "Profile" },
];

/**
 * Convert a route pattern with `:param` to a regular expression.
 */
function routePatternToRegExp(pattern: string): RegExp {
  const regexStr = pattern
    .replace(/:[a-zA-Z0-9_]+/g, "[^/]+")
    .replace(/\//g, "\\/");
  return new RegExp(`^${regexStr}$`);
}

// Precompile parameterized route patterns
const COMPILED_ROUTE_PATTERNS = Object.entries(ROUTE_TITLES)
  .filter(([path]) => path.includes(":"))
  .map(([pattern, title]) => ({
    pattern,
    regex: routePatternToRegExp(pattern),
    title,
  }));

/**
 * Clean and normalize pathname for route matching.
 */
export function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  // Strip query strings or hashes if present
  let clean = pathname.split("?")[0].split("#")[0];
  // Remove trailing slash if length > 1
  if (clean.length > 1 && clean.endsWith("/")) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

/**
 * Resolve the page title for a given URL path.
 * Returns null if the route is unmapped (unknown / 404 / root landing).
 */
export function resolvePageTitle(pathname: string): string | null {
  const normalized = normalizePathname(pathname);

  // Landing route "/" does not have an explicit module title until redirected
  if (normalized === "/" || normalized === "") {
    return null;
  }

  // 1. Direct exact match in ROUTE_TITLES
  if (ROUTE_TITLES[normalized]) {
    return ROUTE_TITLES[normalized];
  }

  // 2. Parameterized pattern match (e.g. /fleet/:id, /ooty/rooms/:id)
  for (const { regex, title } of COMPILED_ROUTE_PATTERNS) {
    if (regex.test(normalized)) {
      return title;
    }
  }

  // 3. Parent module prefix fallback for any nested unmapped child routes
  for (const { prefix, title } of PARENT_MODULE_FALLBACKS) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return title;
    }
  }

  return null;
}

/**
 * Get the full browser document title for a given URL pathname.
 * Format: `Vidhai ERP — [Current Module/Page]`
 * Fallback for unmapped / unknown routes: `Vidhai ERP`
 */
export function getDocumentTitle(pathname: string): string {
  const pageTitle = resolvePageTitle(pathname);
  if (!pageTitle) {
    return APP_NAME;
  }
  return `${APP_NAME}${TITLE_SEPARATOR}${pageTitle}`;
}
