import { Router } from "express";
import {
  effectivePermissions,
  getAuthUser,
  requirePermission,
} from "../lib/access";

const router = Router();
export const permissionCatalog = [
  { module: "Dashboard", key: "dashboard", actions: ["view"] },
  {
    module: "User Management",
    key: "settings.user_management",
    actions: ["view", "create", "update", "delete", "manage_settings"],
  },
  {
    module: "Templates",
    key: "settings.templates",
    actions: ["view", "create", "update", "delete"],
  },
  {
    module: "Inventory",
    key: "inventory",
    actions: ["view", "create", "update", "delete"],
  },
  {
    module: "Production",
    key: "production",
    actions: ["view", "create", "update", "delete", "approve", "export"],
  },
  {
    module: "Sales & Dispatch",
    key: "sales",
    actions: ["view", "create", "update", "delete", "approve", "export"],
  },
  { module: "Reports", key: "reports", actions: ["view", "export"] },
  {
    module: "Crew Â· Employees",
    key: "crew.employees",
    actions: ["view", "create", "update", "delete", "forOwn", "forOthers"],
  },
  {
    module: "Crew Â· Attendance",
    key: "crew.attendance",
    actions: [
      "view",
      "create",
      "update",
      "delete",
      "notification",
      "forOwn",
      "forOthers",
      "changeTime",
    ],
  },
  {
    module: "Crew Â· Leave",
    key: "crew.leave",
    actions: [
      "view",
      "create",
      "update",
      "delete",
      "approve",
      "reject",
      "forOwn",
      "forOthers",
    ],
  },
  {
    module: "Crew Â· Claims",
    key: "crew.claims",
    actions: [
      "view",
      "create",
      "update",
      "approve",
      "reject",
      "forOwn",
      "forOthers",
    ],
  },
  {
    module: "Crew Â· Overtime",
    key: "crew.overtime",
    actions: [
      "view",
      "create",
      "update",
      "approve",
      "reject",
      "forOwn",
      "forOthers",
    ],
  },
  {
    module: "Crew Â· Bonus",
    key: "crew.bonus",
    actions: [
      "view",
      "create",
      "update",
      "approve",
      "reject",
      "forOwn",
      "forOthers",
    ],
  },
  {
    module: "Crew Â· Deductions",
    key: "crew.deductions",
    actions: [
      "view",
      "create",
      "update",
      "delete",
      "approve",
      "reject",
      "forOwn",
      "forOthers",
    ],
  },
  {
    module: "CrewPay Â· Salary Slip",
    key: "crewpay.salary_slip",
    actions: ["view", "create", "update", "forOwn", "forOthers"],
  },
  {
    module: "CrewPay Â· Payroll",
    key: "crewpay.payroll",
    actions: ["view", "create", "update", "forOwn", "forOthers"],
  },
  {
    module: "Accounts · Finance Dashboard",
    key: "accounts.finance_dashboard",
    actions: ["view"],
  },
  {
    module: "Accounts · Customer Ledger",
    key: "accounts.customer_ledger",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    module: "Accounts · Vendor Ledger",
    key: "accounts.vendor_ledger",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    module: "Accounts · Chart of Accounts",
    key: "accounts.chart_of_accounts",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    module: "Accounts · Accounts Payable",
    key: "accounts.accounts_payable",
    actions: ["view", "create", "edit", "delete", "approve"],
  },
  {
    module: "Accounts · Accounts Receivable",
    key: "accounts.accounts_receivable",
    actions: ["view", "create", "edit", "delete", "approve"],
  },
  {
    module: "Accounts · Journal Entries",
    key: "accounts.journal_entries",
    actions: ["view", "create", "edit", "delete", "approve"],
  },
  {
    module: "Accounts · Financial Statements",
    key: "accounts.financial_statements",
    actions: ["view", "export", "download"],
  },
];
router.get("/permissions/me", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  return res.json({ permissions: await effectivePermissions(user) });
});
router.get(
  "/settings/permissions/catalog",
  requirePermission("settings.user_management.view"),
  (_req, res) => res.json(permissionCatalog),
);
export default router;
