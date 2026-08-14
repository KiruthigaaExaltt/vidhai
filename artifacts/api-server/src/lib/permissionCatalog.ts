export const ACTIONS = [
  "view",
  "create",
  "update",
  "delete",
  "notification",
  "approve",
  "reject",
  "export",
  "assign",
  "import",
  "restore",
  "manage_settings",
  "upload",
  "download",
  "change_time",
  "for_own",
  "for_others",
] as const;
export type PermissionAction = (typeof ACTIONS)[number];
export type PermissionCatalogRow = {
  module: string;
  key: string;
  actions: PermissionAction[];
};
const crud: PermissionAction[] = ["view", "create", "update", "delete"];
const scoped: PermissionAction[] = [
  "view",
  "create",
  "update",
  "delete",
  "notification",
  "for_own",
  "for_others",
];
export const permissionCatalog: PermissionCatalogRow[] = [
  { module: "Dashboard", key: "dashboard", actions: ["view"] },
  { module: "CRM � Contacts", key: "crm.contacts", actions: crud },
  { module: "Task � Task Board", key: "task.task_board", actions: scoped },
  {
    module: "Task � Time Logs",
    key: "task.time_logs",
    actions: ["view", "create", "update", "delete", "for_own", "for_others"],
  },
  { module: "Calendar", key: "scheduling.calendar", actions: crud },
  {
    module: "Plan Schedule",
    key: "scheduling.plan_schedule",
    actions: ["view", "create"],
  },
  {
    module: "Production � Batches",
    key: "production.batches",
    actions: [...crud, "approve"],
  },
  {
    module: "Production � Chambers",
    key: "production.chambers",
    actions: crud,
  },
  {
    module: "Production � Growing Rooms",
    key: "production.growing_rooms",
    actions: [...crud, "import"],
  },
  {
    module: "Production � Casing Soil",
    key: "production.casing_soil",
    actions: crud,
  },
  {
    module: "Production � Spawn Batches",
    key: "production.spawn_batches",
    actions: crud,
  },
  { module: "Crew � Employees", key: "crew.employees", actions: scoped },
  {
    module: "Crew � Attendance",
    key: "crew.attendance",
    actions: [...scoped, "change_time"],
  },
  {
    module: "Crew � Leave",
    key: "crew.leave",
    actions: [...scoped, "approve", "reject"],
  },
  {
    module: "Crew � Claims",
    key: "crew.claims",
    actions: [...scoped, "approve", "reject", "upload", "download"],
  },
  {
    module: "Crew � Overtime",
    key: "crew.overtime",
    actions: [...scoped, "approve", "reject"],
  },
  {
    module: "Crew � Bonus",
    key: "crew.bonus",
    actions: [...scoped, "approve", "reject"],
  },
  {
    module: "Crew � Deductions",
    key: "crew.deductions",
    actions: [...scoped, "approve", "reject"],
  },
  {
    module: "CrewPay � Salary Slip",
    key: "crewpay.salary_slip",
    actions: scoped,
  },
  {
    module: "CrewPay � Payroll",
    key: "crewpay.payroll",
    actions: [...scoped, "approve", "export"],
  },
  {
    module: "Sales � Quotations",
    key: "sales.quotations",
    actions: [...crud, "approve", "reject", "restore", "export"],
  },
  {
    module: "Sales � Proforma Invoices",
    key: "sales.proforma_invoices",
    actions: [...crud, "export"],
  },
  {
    module: "Sales � Delivery Challans",
    key: "sales.delivery_challans",
    actions: [...crud, "export"],
  },
  {
    module: "Sales � Invoices",
    key: "sales.invoices",
    actions: [...crud, "approve", "export"],
  },
  { module: "Sales � Payments", key: "sales.payments", actions: crud },
  {
    module: "Sales � Returns",
    key: "sales.returns",
    actions: [...crud, "approve", "reject"],
  },
  {
    module: "Accounts � Finance Dashboard",
    key: "accounts.finance_dashboard",
    actions: ["view"],
  },
  {
    module: "Accounts � Customer Ledger",
    key: "accounts.customer_ledger",
    actions: crud,
  },
  {
    module: "Accounts � Vendor Ledger",
    key: "accounts.vendor_ledger",
    actions: crud,
  },
  {
    module: "Accounts � Chart of Accounts",
    key: "accounts.chart_of_accounts",
    actions: crud,
  },
  {
    module: "Accounts � Accounts Payable",
    key: "accounts.accounts_payable",
    actions: [...crud, "approve"],
  },
  {
    module: "Accounts � Accounts Receivable",
    key: "accounts.accounts_receivable",
    actions: [...crud, "approve"],
  },
  {
    module: "Accounts � Journal Entries",
    key: "accounts.journal_entries",
    actions: [...crud, "approve"],
  },
  {
    module: "Accounts � Financial Statements",
    key: "accounts.financial_statements",
    actions: ["view", "export", "download"],
  },
  { module: "Vehicle Fleet", key: "fleet.vehicles", actions: crud },
  {
    module: "Reports",
    key: "reports",
    actions: ["view", "export", "download"],
  },
  { module: "Traceability", key: "traceability", actions: ["view", "export"] },
  { module: "Flex � Dashboard", key: "flex.dashboard", actions: ["view"] },
  {
    module: "Flex � Purchase Requests",
    key: "flex.purchase_requests",
    actions: [...crud, "approve", "reject"],
  },
  {
    module: "Flex � Purchase Orders",
    key: "flex.purchase_orders",
    actions: [...crud, "approve", "export"],
  },
  {
    module: "Flex � Goods Receipts",
    key: "flex.goods_receipts",
    actions: [...crud, "approve"],
  },
  {
    module: "Flex � Purchase Invoices",
    key: "flex.purchase_invoices",
    actions: [...crud, "approve"],
  },
  {
    module: "Flex � Vendor Payments",
    key: "flex.vendor_payments",
    actions: [...crud, "approve"],
  },
  {
    module: "Flex � Purchase Returns",
    key: "flex.purchase_returns",
    actions: [...crud, "approve", "reject"],
  },
  { module: "Inventory � Stock", key: "inventory.stock", actions: crud },
  {
    module: "Inventory � Materials",
    key: "inventory.materials",
    actions: crud,
  },
  {
    module: "Inventory � Categories",
    key: "inventory.categories",
    actions: crud,
  },
  {
    module: "Inventory � Warehouses",
    key: "inventory.warehouses",
    actions: crud,
  },
  {
    module: "Inventory � Assets",
    key: "inventory.assets",
    actions: [...crud, "assign"],
  },
  {
    module: "Settings � Company Profile",
    key: "settings.company_profile",
    actions: ["view", "update", "manage_settings"],
  },
  {
    module: "Settings � User Management",
    key: "settings.user_management",
    actions: [...crud, "manage_settings"],
  },
  { module: "Settings � Templates", key: "settings.templates", actions: crud },
  {
    module: "Settings � Master Settings",
    key: "settings.master_settings",
    actions: crud,
  },
  {
    module: "Settings � Alert Colors",
    key: "settings.alert_colors",
    actions: crud,
  },
  { module: "Settings � Locations", key: "settings.locations", actions: crud },
];
const notificationScopes = new Set([
  "task.task_board",
  "task.time_logs",
  "scheduling.calendar",
  "scheduling.plan_schedule",
  "production.batches",
  "production.chambers",
  "production.growing_rooms",
  "production.casing_soil",
  "production.spawn_batches",
  "crew.attendance",
  "crew.leave",
  "crew.claims",
  "crew.overtime",
  "crew.bonus",
  "crew.deductions",
  "sales.quotations",
  "sales.proforma_invoices",
  "sales.delivery_challans",
  "sales.invoices",
  "sales.returns",
  "accounts.chart_of_accounts",
  "accounts.accounts_payable",
  "accounts.accounts_receivable",
  "accounts.journal_entries",
  "accounts.financial_statements",
  "flex.purchase_requests",
  "flex.purchase_orders",
  "flex.goods_receipts",
  "flex.purchase_invoices",
  "flex.purchase_returns",
  "inventory.stock",
  "inventory.materials",
  "inventory.categories",
  "inventory.warehouses",
  "inventory.assets",
]);
for (const row of permissionCatalog)
  if (notificationScopes.has(row.key) && !row.actions.includes("notification"))
    row.actions.push("notification");
const rows = new Map(permissionCatalog.map((row) => [row.key, row]));
export const allPermissionKeys = permissionCatalog.flatMap((row) =>
  row.actions.map((action) => `${row.key}.${action}`),
);
const known = new Set(allPermissionKeys);
const actionAliases: Record<string, string> = {
  edit: "update",
  forown: "for_own",
  forothers: "for_others",
  changetime: "change_time",
  managesettings: "manage_settings",
};
export function normalizeRbacAction(action: string): PermissionAction | null {
  const normalized = String(action ?? "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const compact = normalized.replaceAll("_", "");
  const canonical = actionAliases[compact] ?? normalized;
  return ACTIONS.includes(canonical as PermissionAction)
    ? (canonical as PermissionAction)
    : null;
}
export function buildPermissionKey(
  moduleKey: string,
  submoduleKey: string | null | undefined,
  action: string,
): string | null {
  const normalizedAction = normalizeRbacAction(action);
  if (!normalizedAction) return null;
  const scope = [moduleKey, submoduleKey].filter(Boolean).join(".");
  return normalizePermissionKey(scope + "." + normalizedAction);
}
const keyAliases: Record<string, string> = {
  tasks: "task.task_board",
  task: "task.task_board",
  "sprint.tasks": "task.task_board",
  "sprint.task_boards": "task.task_board",
  inventory: "inventory.stock",
  production: "production.batches",
  sales: "sales.quotations",
  "crew.attendance_own": "crew.attendance.for_own",
  "crew.attendance_others": "crew.attendance.for_others",
};
export function normalizePermissionKey(value: unknown): string | null {
  let key = String(value ?? "").trim();
  if (!key || key.endsWith(".all")) return null;
  key = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (keyAliases[key]) key = keyAliases[key];
  if (known.has(key)) return key;
  const parts = key.split(".");
  const rawAction = parts.pop() ?? "";
  const action =
    actionAliases[rawAction.replaceAll("_", "")] ??
    actionAliases[rawAction] ??
    rawAction;
  let scope = parts.join(".");
  scope = keyAliases[scope] ?? scope;
  const normalized = `${scope}.${action}`;
  return known.has(normalized) ? normalized : null;
}
export function normalizePermissions(raw: unknown): string[] {
  let value: any = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = [];
    }
  }
  if (!Array.isArray(value) && value && typeof value === "object") {
    const legacyActions = Object.entries(value)
      .filter(([, locations]) => Array.isArray(locations) && locations.length)
      .map(([action]) => action);
    value = permissionCatalog.flatMap((row) =>
      legacyActions
        .map((action) => normalizePermissionKey(`${row.key}.${action}`))
        .filter(Boolean),
    );
  }
  const result = new Set<string>();
  for (const item of Array.isArray(value) ? value : []) {
    const key = normalizePermissionKey(
      typeof item === "string" ? item.replace(/^!/, "") : item?.permissionKey,
    );
    if (
      !key ||
      (typeof item === "string" && item.startsWith("!")) ||
      item?.allowed === false
    )
      continue;
    result.add(key);
    const parts = key.split(".");
    parts[parts.length - 1] = "view";
    const view = parts.join(".");
    if (known.has(view)) result.add(view);
  }
  return [...result].sort();
}
export function normalizeOverrides(
  raw: unknown,
): { permissionKey: string; allowed: boolean }[] {
  let value: any = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = [];
    }
  }
  const map = new Map<string, boolean>();
  for (const item of Array.isArray(value) ? value : []) {
    const stringItem = typeof item === "string";
    const key = normalizePermissionKey(
      stringItem ? String(item).replace(/^!/, "") : item?.permissionKey,
    );
    if (key)
      map.set(
        key,
        stringItem ? !String(item).startsWith("!") : item.allowed === true,
      );
  }
  return [...map].map(([permissionKey, allowed]) => ({
    permissionKey,
    allowed,
  }));
}
export function permissionExists(key: string) {
  return known.has(key);
}
export function moduleViewKeys(prefix: string) {
  return permissionCatalog
    .filter((row) => row.key === prefix || row.key.startsWith(`${prefix}.`))
    .map((row) => `${row.key}.view`);
}
export function rowForKey(key: string) {
  return rows.get(key);
}
