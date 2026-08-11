import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import locationsRouter from "./locations";
import alertColorsRouter from "./alertColors";
import materialsRouter from "./materials";
import inventoryRouter from "./inventory";
import spawnRouter from "./spawn";
import batchesRouter from "./batches";
import chambersRouter from "./chambers";
import dashboardRouter from "./dashboard";
import coimbatoreRouter from "./coimbatore";
import labRouter from "./lab";
import ootyRouter from "./ooty";
import traceabilityRouter from "./traceability";
import schedulingRouter from "./scheduling";
import salesRouter from "./sales";
import fleetRouter from "./fleet";
import reportsRouter from "./reports";
import rolesRouter from "./roles";
import tasksRouter from "./tasks";
import contactsRouter from "./contacts";
import departmentsRouter from "./departments";
import templatesRouter from "./templates";
import permissionsRouter from "./permissions";
import flexRouter from "./flex";
import vendorAvailabilityRouter from "./vendorAvailability";
import crewRouter from "./crew";
import crewPayRouter from "./crewpay";
import servicesRouter from "./services";
import categoriesRouter from "./categories";
import vaultLocationsRouter from "./vaultLocations";
import itemNamesRouter from "./itemNames";
import assetsRouter from "./assets";
import accountsRouter from "./accounts";
import workOrdersRouter from "./workOrders";
import organizationSettingsRouter from "./organizationSettings";
import { requireModulePermission } from "../lib/access";

const segment = (path: string, index = 0) =>
  path.split("/").filter(Boolean)[index] ?? "";
const salesScope = (req: any) => {
  const part = segment(req.path);
  if (part.startsWith("proforma")) return "sales.proforma_invoices";
  if (part === "challans") return "sales.delivery_challans";
  if (part === "invoices") return "sales.invoices";
  if (part === "payments" || part === "receivable-adjustments")
    return "sales.payments";
  if (part === "returns") return "sales.returns";
  return "sales.quotations";
};
const flexScope = (req: any) =>
  ({
    "purchase-requests": "flex.purchase_requests",
    "purchase-orders": "flex.purchase_orders",
    "goods-receipts": "flex.goods_receipts",
    "purchase-invoices": "flex.purchase_invoices",
    "vendor-payments": "flex.vendor_payments",
    "purchase-returns": "flex.purchase_returns",
  })[segment(req.path)] ?? "flex.dashboard";
const crewScope = (req: any) =>
  ({
    leaves: "crew.leave",
    claims: "crew.claims",
    overtime: "crew.overtime",
    bonus: "crew.bonus",
    deductions: "crew.deductions",
    attendance: "crew.attendance",
    employees: "crew.employees",
    files: "crew.claims",
  })[segment(req.path)] ?? "crew.employees";
const crewPayScope = (req: any) =>
  segment(req.path).startsWith("payroll")
    ? "crewpay.payroll"
    : "crewpay.salary_slip";
const accountsScope = (req: any) =>
  ({
    coa: "accounts.chart_of_accounts",
    "journal-entries": "accounts.journal_entries",
    "customer-ledger": "accounts.customer_ledger",
    "vendor-ledger": "accounts.vendor_ledger",
    "accounts-payable": "accounts.accounts_payable",
    "accounts-receivable": "accounts.accounts_receivable",
    "financial-statements": "accounts.financial_statements",
  })[segment(req.path)] ?? "accounts.finance_dashboard";
const router: IRouter = Router();
router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/settings/users", usersRouter);
router.use("/locations", locationsRouter);
router.use(
  "/alert-colors",
  requireModulePermission("settings.alert_colors"),
  alertColorsRouter,
);
router.use(
  "/materials",
  requireModulePermission("inventory.materials"),
  materialsRouter,
);
router.use(
  "/inventory",
  requireModulePermission("inventory.stock"),
  inventoryRouter,
);
router.use(
  "/spawn",
  requireModulePermission("production.spawn_batches"),
  spawnRouter,
);
router.use(
  "/batches",
  requireModulePermission("production.batches"),
  batchesRouter,
);
router.use(
  "/chambers",
  requireModulePermission("production.chambers"),
  chambersRouter,
);
router.use("/dashboard", requireModulePermission("dashboard"), dashboardRouter);
router.use(
  "/coimbatore",
  requireModulePermission("production.casing_soil"),
  coimbatoreRouter,
);
router.use(
  "/lab",
  requireModulePermission("production.spawn_batches"),
  labRouter,
);
router.use(
  "/ooty",
  requireModulePermission("production.growing_rooms"),
  ootyRouter,
);
router.use(
  "/traceability",
  requireModulePermission("traceability"),
  traceabilityRouter,
);
router.use(
  "/scheduling",
  requireModulePermission((req) =>
    req.path.startsWith("/suggest")
      ? "scheduling.plan_schedule"
      : "scheduling.calendar",
  ),
  schedulingRouter,
);
router.use("/organization-settings", organizationSettingsRouter);
router.use("/sales", requireModulePermission(salesScope), salesRouter);
router.use("/fleet", requireModulePermission("fleet.vehicles"), fleetRouter);
router.use("/reports", requireModulePermission("reports"), reportsRouter);
router.use("/roles", rolesRouter);
router.use("/settings/roles", rolesRouter);
router.use(
  "/tasks",
  requireModulePermission((req) =>
    req.path.includes("time-logs") ? "task.time_logs" : "task.task_board",
  ),
  tasksRouter,
);
router.use(
  "/contacts",
  requireModulePermission("crm.contacts"),
  contactsRouter,
);
router.use("/departments", departmentsRouter);
router.use(templatesRouter);
router.use("/settings", templatesRouter);
router.use(permissionsRouter);
router.use("/flex", requireModulePermission(flexScope), flexRouter);
router.use(
  "/flex",
  requireModulePermission(flexScope),
  vendorAvailabilityRouter,
);
router.use("/crew", requireModulePermission(crewScope), crewRouter);
router.use("/crewpay", requireModulePermission(crewPayScope), crewPayRouter);
router.use(
  "/services",
  requireModulePermission("inventory.materials"),
  servicesRouter,
);
router.use(
  "/categories",
  requireModulePermission("inventory.categories"),
  categoriesRouter,
);
router.use(
  "/vault/locations",
  requireModulePermission("inventory.warehouses"),
  vaultLocationsRouter,
);
router.use(
  "/vault/item-names",
  requireModulePermission("inventory.materials"),
  itemNamesRouter,
);
router.use(
  "/assets",
  requireModulePermission("inventory.assets"),
  assetsRouter,
);
router.use("/accounts", requireModulePermission(accountsScope), accountsRouter);
router.use(
  "/work-orders",
  requireModulePermission("task.task_board"),
  workOrdersRouter,
);

export default router;
