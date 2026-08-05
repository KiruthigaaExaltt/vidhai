import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/lib/auth";

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
import SpawnStockRedirect from "@/pages/lab/spawn-stock";
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

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, adminOnly, ...rest }: any) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [isLoading, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm font-mono text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  if (adminOnly && user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm font-mono text-destructive">ACCESS DENIED</div>
      </div>
    );
  }

  return <Component {...rest} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      <Route path="/">
        <ProtectedRoute component={Dashboard} />
      </Route>
      
      <Route path="/settings">
        <ProtectedRoute component={Settings} adminOnly />
      </Route>

      {/* Inventory Routes */}
      <Route path="/inventory">
        <ProtectedRoute component={Inventory} />
      </Route>

      {/* CRM */}
      <Route path="/crm">
        <ProtectedRoute component={CRM} />
      </Route>

      {/* Coimbatore Routes */}
      <Route path="/coimbatore/batches">
        <ProtectedRoute component={CoimbatoreBatches} />
      </Route>
      <Route path="/coimbatore/batches/:id">
        <ProtectedRoute component={CoimbatoreBatchDetail} />
      </Route>

      {/* Ooty Routes */}
      <Route path="/ooty">
        <ProtectedRoute component={OotyRooms} />
      </Route>
      <Route path="/ooty/rooms/:id">
        <ProtectedRoute component={OotyRoomDetail} />
      </Route>
      <Route path="/traceability">
        <ProtectedRoute component={Traceability} />
      </Route>
      <Route path="/scheduling/suggest">
        <ProtectedRoute component={ScheduleSuggest} />
      </Route>
      <Route path="/scheduling">
        <ProtectedRoute component={SchedulingCalendar} />
      </Route>
      <Route path="/sales">
        <ProtectedRoute component={Sales} />
      </Route>
      <Route path="/fleet/:id">
        <ProtectedRoute component={FleetDetail} />
      </Route>
      <Route path="/fleet">
        <ProtectedRoute component={FleetList} />
      </Route>
      <Route path="/reports/batch-summary">
        <ProtectedRoute component={ReportBatchSummary} />
      </Route>
      <Route path="/reports/monthly-production">
        <ProtectedRoute component={ReportMonthlyProduction} />
      </Route>
      <Route path="/reports/quality-trend">
        <ProtectedRoute component={ReportQualityTrend} />
      </Route>
      <Route path="/reports/vehicle-utilization">
        <ProtectedRoute component={ReportVehicleUtilization} />
      </Route>
      <Route path="/reports/fuel-consumption">
        <ProtectedRoute component={ReportFuelConsumption} />
      </Route>
      <Route path="/reports/batch-costing">
        <ProtectedRoute component={ReportBatchCosting} />
      </Route>
      <Route path="/reports/annur-batch-yield">
        <ProtectedRoute component={ReportAnnurBatchYield} />
      </Route>
      <Route path="/reports">
        <ProtectedRoute component={ReportsLanding} />
      </Route>
      <Route path="/tasks">
        <ProtectedRoute component={Tasks} />
      </Route>

      <Route path="/profile">
        <ProtectedRoute component={Profile} />
      </Route>

      {/* Lab Routes */}
      <Route path="/lab/batches">
        <ProtectedRoute component={LabBatches} />
      </Route>
      <Route path="/lab/batches/:id">
        <ProtectedRoute component={LabBatchDetail} />
      </Route>
      <Route path="/lab/spawn-stock">
        <ProtectedRoute component={SpawnStockRedirect} />
      </Route>

      {/* Annur Routes */}
      <Route path="/annur/batches">
        <ProtectedRoute component={Batches} />
      </Route>
      <Route path="/annur/batches/new">
        <ProtectedRoute component={NewBatch} />
      </Route>
      <Route path="/annur/batches/:id">
        <ProtectedRoute component={BatchDetail} />
      </Route>
      <Route path="/annur/chambers">
        <ProtectedRoute component={Chambers} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
