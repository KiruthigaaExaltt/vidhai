import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/lib/auth";
import { installImageFallback } from "@/lib/imageFallback";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Settings from "@/pages/settings/index";
import Inventory from "@/pages/inventory/index";
import CRM from "@/pages/crm/index";
import Batches from "@/pages/annur/batches/index";
import NewBatch from "@/pages/annur/batches/new";
import BatchDetail from "@/pages/annur/batches/[id]";
import Chambers from "@/pages/annur/chambers";
import CoimbatoreBatches from "@/pages/coimbatore/batches/index";
import CoimbatoreBatchDetail from "@/pages/coimbatore/batches/[id]";
import LabBatches from "@/pages/lab/batches/index";
import LabBatchDetail from "@/pages/lab/batches/[id]";
import OotyRooms from "@/pages/ooty/index";
import OotyRoomDetail from "@/pages/ooty/rooms/[id]";
import Traceability from "@/pages/traceability/index";
import SchedulingCalendar from "@/pages/scheduling/index";
import ScheduleSuggest from "@/pages/scheduling/suggest";
import Sales from "@/pages/sales/index";
import FleetList from "@/pages/fleet/index";
import FleetDetail from "@/pages/fleet/[id]";
import ReportsLanding from "@/pages/reports/index";
import ReportBatchSummary from "@/pages/reports/batch-summary";
import ReportMonthlyProduction from "@/pages/reports/monthly-production";
import ReportQualityTrend from "@/pages/reports/quality-trend";
import ReportVehicleUtilization from "@/pages/reports/vehicle-utilization";
import ReportFuelConsumption from "@/pages/reports/fuel-consumption";
import ReportBatchCosting from "@/pages/reports/batch-costing";
import ReportAnnurBatchYield from "@/pages/reports/annur-batch-yield";
import Tasks from "@/pages/tasks/index";
import Profile from "@/pages/profile";
import FlexDashboard from "@/pages/flex/index";
import PurchaseRequests from "@/pages/flex/purchase-requests";
import PurchaseOrders from "@/pages/flex/purchase-orders";
import GoodsReceipts from "@/pages/flex/goods-receipts";
import PurchaseInvoices from "@/pages/flex/purchase-invoices";
import VendorPayments from "@/pages/flex/vendor-payments";
import PurchaseReturns from "@/pages/flex/purchase-returns";
import Crew from "@/pages/crew";
import CrewPay from "@/pages/crewpay";
import Accounts from "@/pages/accounts";
import NotificationsPage from "@/pages/notifications";
import { NotificationProvider } from "@/notifications/NotificationProvider";
import ModuleEncryptionGate from "@/components/security/ModuleEncryptionGate";
import { Shell } from "@/components/layout/Shell";

const queryClient = new QueryClient();

const ACCOUNT_VIEW_PERMISSIONS = [
  "accounts.finance_dashboard.view",
  "accounts.customer_ledger.view",
  "accounts.vendor_ledger.view",
  "accounts.chart_of_accounts.view",
  "accounts.accounts_payable.view",
  "accounts.accounts_receivable.view",
  "accounts.journal_entries.view",
  "accounts.financial_statements.view",
];
const INVENTORY_VIEW_PERMISSIONS = [
  "inventory.stock.view",
  "inventory.materials.view",
  "inventory.categories.view",
  "inventory.warehouses.view",
  "inventory.assets.view",
];
const PROCUREMENT_VIEW_PERMISSIONS = [
  "flex.dashboard.view",
  "flex.purchase_requests.view",
  "flex.purchase_orders.view",
  "flex.goods_receipts.view",
  "flex.purchase_invoices.view",
  "flex.vendor_payments.view",
  "flex.purchase_returns.view",
];

function ProtectedRoute({
  component: Component,
  adminOnly,
  permission,
  moduleKey,
  ...rest
}: any) {
  const { user, isLoading, can, isModuleEnabled, isSuperAdmin } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [isLoading, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm font-mono text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (moduleKey && !isModuleEnabled(moduleKey)) return <NotFound />;

  if (
    (adminOnly && !isSuperAdmin) ||
    (permission &&
      !(Array.isArray(permission) ? permission.some(can) : can(permission)))
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm font-mono text-destructive">ACCESS DENIED</div>
      </div>
    );
  }

  return <Component {...rest} />;
}

const landingRoutes = [
  { path: "/dashboard", permissions: ["dashboard.view"] },
  { path: "/tasks", permissions: ["task.task_board.view"] },
  {
    path: "/crew",
    permissions: [
      "crew.employees.view",
      "crew.attendance.view",
      "crew.leave.view",
      "crew.claims.view",
      "crew.overtime.view",
      "crew.bonus.view",
      "crew.deductions.view",
    ],
  },
  {
    path: "/crewpay",
    permissions: ["crewpay.salary_slip.view", "crewpay.payroll.view"],
  },
  { path: "/scheduling", permissions: ["scheduling.calendar.view"] },
  { path: "/annur/batches", permissions: ["production.batches.view"] },
  { path: "/ooty", permissions: ["production.growing_rooms.view"] },
  { path: "/coimbatore/batches", permissions: ["production.casing_soil.view"] },
  { path: "/lab/batches", permissions: ["production.spawn_batches.view"] },
  { path: "/crm", permissions: ["crm.contacts.view"] },
  {
    path: "/sales",
    permissions: [
      "sales.quotations.view",
      "sales.proforma_invoices.view",
      "sales.delivery_challans.view",
      "sales.invoices.view",
      "sales.payments.view",
      "sales.returns.view",
    ],
  },
  { path: "/inventory", permissions: INVENTORY_VIEW_PERMISSIONS },
  {
    path: "/accounts",
    permissions: ACCOUNT_VIEW_PERMISSIONS,
    moduleKey: "ledger",
  },
  { path: "/reports", permissions: ["reports.view"] },
  {
    path: "/settings",
    permissions: [
      "settings.company_profile.view",
      "settings.user_management.view",
      "settings.templates.view",
      "settings.master_settings.view",
      "settings.alert_colors.view",
      "settings.locations.view",
      "settings.module_encryption.view",
    ],
  },
] as const;

function LandingRoute() {
  const { user, isLoading, can, isModuleEnabled } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setLocation("/login");
      return;
    }
    const destination = landingRoutes.find(
      ({ permissions, ...route }) =>
        (!("moduleKey" in route) || isModuleEnabled(route.moduleKey)) &&
        permissions.some((permission) => can(permission)),
    );
    setLocation(destination?.path ?? "/profile");
  }, [isLoading, user, can, isModuleEnabled, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-sm font-mono text-muted-foreground">Loading...</div>
    </div>
  );
}
function LedgerPage() {
  return (
    <ModuleEncryptionGate
      module="ledger"
      label="Ledger"
      lockedLayout={(content) => <Shell>{content}</Shell>}
    >
      <Accounts />
    </ModuleEncryptionGate>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />

      <Route path="/notifications">
        <ProtectedRoute component={NotificationsPage} />
      </Route>

      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} permission="dashboard.view" />
      </Route>

      <Route path="/" component={LandingRoute} />

      <Route path="/settings">
        <ProtectedRoute
          component={Settings}
          permission={[
            "settings.company_profile.view",
            "settings.user_management.view",
            "settings.templates.view",
            "settings.master_settings.view",
            "settings.alert_colors.view",
            "settings.locations.view",
            "settings.module_encryption.view",
          ]}
        />
      </Route>

      {/* Inventory Routes */}
      <Route path="/inventory">
        <ProtectedRoute
          component={Inventory}
          permission={INVENTORY_VIEW_PERMISSIONS}
        />
      </Route>

      {/* CRM */}
      <Route path="/crm">
        <ProtectedRoute component={CRM} permission="crm.contacts.view" />
      </Route>

      {/* Coimbatore Routes */}
      <Route path="/coimbatore/batches">
        <ProtectedRoute
          component={CoimbatoreBatches}
          permission="production.casing_soil.view"
        />
      </Route>
      <Route path="/coimbatore/batches/:id">
        <ProtectedRoute
          component={CoimbatoreBatchDetail}
          permission="production.casing_soil.view"
        />
      </Route>

      {/* Ooty Routes */}
      <Route path="/ooty">
        <ProtectedRoute
          component={OotyRooms}
          permission="production.growing_rooms.view"
        />
      </Route>
      <Route path="/ooty/rooms/:id">
        <ProtectedRoute
          component={OotyRoomDetail}
          permission="production.growing_rooms.view"
        />
      </Route>
      <Route path="/traceability">
        <ProtectedRoute
          component={Traceability}
          permission="traceability.view"
        />
      </Route>
      <Route path="/scheduling/suggest">
        <ProtectedRoute
          component={ScheduleSuggest}
          permission="scheduling.plan_schedule.view"
        />
      </Route>
      <Route path="/scheduling">
        <ProtectedRoute
          component={SchedulingCalendar}
          permission="scheduling.calendar.view"
        />
      </Route>
      <Route path="/sales">
        <ProtectedRoute
          component={Sales}
          permission={[
            "sales.quotations.view",
            "sales.proforma_invoices.view",
            "sales.delivery_challans.view",
            "sales.invoices.view",
            "sales.payments.view",
            "sales.returns.view",
          ]}
        />
      </Route>
      <Route path="/fleet/:id">
        <ProtectedRoute
          component={FleetDetail}
          permission="fleet.vehicles.view"
        />
      </Route>
      <Route path="/fleet">
        <ProtectedRoute
          component={FleetList}
          permission="fleet.vehicles.view"
        />
      </Route>
      <Route path="/reports/batch-summary">
        <ProtectedRoute
          component={ReportBatchSummary}
          permission="reports.view"
        />
      </Route>
      <Route path="/reports/monthly-production">
        <ProtectedRoute
          component={ReportMonthlyProduction}
          permission="reports.view"
        />
      </Route>
      <Route path="/reports/quality-trend">
        <ProtectedRoute
          component={ReportQualityTrend}
          permission="reports.view"
        />
      </Route>
      <Route path="/reports/vehicle-utilization">
        <ProtectedRoute
          component={ReportVehicleUtilization}
          permission="reports.view"
        />
      </Route>
      <Route path="/reports/fuel-consumption">
        <ProtectedRoute
          component={ReportFuelConsumption}
          permission="reports.view"
        />
      </Route>
      <Route path="/reports/batch-costing">
        <ProtectedRoute
          component={ReportBatchCosting}
          permission="reports.view"
        />
      </Route>
      <Route path="/reports/annur-batch-yield">
        <ProtectedRoute
          component={ReportAnnurBatchYield}
          permission="reports.view"
        />
      </Route>
      <Route path="/reports">
        <ProtectedRoute component={ReportsLanding} permission="reports.view" />
      </Route>
      <Route path="/tasks">
        <ProtectedRoute component={Tasks} permission="task.task_board.view" />
      </Route>
      {/* Flex Routes */}
      <Route path="/flex">
        <ProtectedRoute
          component={FlexDashboard}
          permission={PROCUREMENT_VIEW_PERMISSIONS}
        />
      </Route>
      <Route path="/flex/purchase-requests">
        <ProtectedRoute
          component={PurchaseRequests}
          permission="flex.purchase_requests.view"
        />
      </Route>
      <Route path="/flex/purchase-orders">
        <ProtectedRoute
          component={PurchaseOrders}
          permission="flex.purchase_orders.view"
        />
      </Route>
      <Route path="/flex/goods-receipts">
        <ProtectedRoute
          component={GoodsReceipts}
          permission="flex.goods_receipts.view"
        />
      </Route>
      <Route path="/flex/purchase-invoices">
        <ProtectedRoute
          component={PurchaseInvoices}
          permission="flex.purchase_invoices.view"
        />
      </Route>
      <Route path="/flex/vendor-payments">
        <ProtectedRoute
          component={VendorPayments}
          permission="flex.vendor_payments.view"
        />
      </Route>
      <Route path="/flex/purchase-returns">
        <ProtectedRoute
          component={PurchaseReturns}
          permission="flex.purchase_returns.view"
        />
      </Route>

      <Route path="/accounts">
        <ProtectedRoute
          component={LedgerPage}
          permission={ACCOUNT_VIEW_PERMISSIONS}
          moduleKey="ledger"
        />
      </Route>

      <Route path="/profile">
        <ProtectedRoute component={Profile} />
      </Route>
      <Route path="/crew">
        <ProtectedRoute
          component={Crew}
          permission={[
            "crew.employees.view",
            "crew.attendance.view",
            "crew.leave.view",
            "crew.claims.view",
            "crew.overtime.view",
            "crew.bonus.view",
            "crew.deductions.view",
          ]}
        />
      </Route>
      <Route path="/crewpay">
        <ProtectedRoute
          component={CrewPay}
          permission={["crewpay.salary_slip.view", "crewpay.payroll.view"]}
        />
      </Route>

      {/* Lab Routes */}
      <Route path="/lab/batches">
        <ProtectedRoute
          component={LabBatches}
          permission="production.spawn_batches.view"
        />
      </Route>
      <Route path="/lab/batches/:id">
        <ProtectedRoute
          component={LabBatchDetail}
          permission="production.spawn_batches.view"
        />
      </Route>
      {/* Annur Routes */}
      <Route path="/annur/batches">
        <ProtectedRoute
          component={Batches}
          permission="production.batches.view"
        />
      </Route>
      <Route path="/annur/batches/new">
        <ProtectedRoute
          component={NewBatch}
          permission="production.batches.create"
        />
      </Route>
      <Route path="/annur/batches/:id">
        <ProtectedRoute
          component={BatchDetail}
          permission="production.batches.view"
        />
      </Route>
      <Route path="/annur/chambers">
        <ProtectedRoute
          component={Chambers}
          permission="production.chambers.view"
        />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => installImageFallback(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <NotificationProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </NotificationProvider>
        </AuthProvider>
        <Toaster />
        <SonnerToaster position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
