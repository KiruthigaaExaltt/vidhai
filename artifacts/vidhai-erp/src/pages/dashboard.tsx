import { useGetDashboardSummary, useListBatches, useListCoimbatoreBatches, useListLabBatches, useListOotyGrowingBatches } from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Thermometer, Box, ShieldCheck, ThermometerSnowflake, FlaskConical, MapPin, Users, ShoppingCart, Store, ArrowUpRight } from "lucide-react";

type BusinessMetrics = {
  crew: { activeEmployees: number; presentToday: number; lateToday: number; pendingActions: number };
  sales: { quotationsProcessed: number; totalSalesOrders: number; workOrdersStarted: number };
  procurement: { vendors: number; confirmedPurchaseOrders: number; outstandingPayables: number };
  asOf: string;
};

const formatCompactInr = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

async function fetchBusinessMetrics(): Promise<BusinessMetrics> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${base}/api/dashboard/business-metrics`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Unable to load business metrics");
  return response.json();
}

function ModuleMetricCard({ title, icon: Icon, href, accent, metrics }: any) {
  return (
    <Link href={href} className="group block h-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <Card className="relative h-full overflow-hidden rounded-sm border-0 bg-gradient-to-br from-card to-muted/50 shadow-lg transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-xl">
        <div className={`absolute left-0 top-0 h-1 w-full ${accent}`} />
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" />{title}</span>
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-6 pt-2">
          {metrics.map((metric: any, index: number) => (
            <div key={metric.label} className={`flex items-center justify-between gap-4 py-2 ${index < metrics.length - 1 ? "border-b border-border/70" : ""}`}>
              <div className="min-w-0">
                <div className="text-sm font-medium text-muted-foreground">{metric.label}</div>
                {metric.description && <div className="mt-0.5 truncate text-[11px] text-muted-foreground/75">{metric.description}</div>}
              </div>
              <span className={`shrink-0 text-xl font-bold tabular-nums ${metric.tone || "text-foreground"}`}>{metric.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: business, isLoading: isBusinessLoading, isError: isBusinessError } = useQuery({
    queryKey: ["dashboard", "business-metrics"],
    queryFn: fetchBusinessMetrics,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  // Fetch active counts per location
  const { data: annurBatches } = useListBatches({ status: "active" } as any, { query: { enabled: true }} as any);
  const { data: coimBatches } = (useListCoimbatoreBatches as any)({ status: "active" }, { query: { enabled: true }});
  const { data: labBatches } = (useListLabBatches as any)({ status: "active" }, { query: { enabled: true }});
  const { data: ootyBatches } = (useListOotyGrowingBatches as any)({ status: "active" }, { query: { enabled: true }});

  const annurCount = annurBatches?.length || 0;
  const coimCount = coimBatches?.length || 0;
  const labCount = labBatches?.length || 0;
  const ootyCount = ootyBatches?.length || 0;

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-8 p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-display">System Cockpit</h1>
            
          </div>
          <div className="flex items-center gap-3">
            <Link href="/annur/chambers" className="flex-1 sm:flex-none">
              <Button variant="outline" className="w-full sm:w-auto font-medium rounded-lg shadow-sm h-10 px-4">
                <Thermometer className="w-4 h-4 mr-2" />
                Add Reading
              </Button>
            </Link>
            <Link href="/annur/batches/new" className="flex-1 sm:flex-none">
              <Button className="w-full sm:w-auto font-medium rounded-lg shadow-sm h-10 px-4">
                <Plus className="w-4 h-4 mr-2" />
                Initiate Batch
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Active Batches Multi-Location Card */}
          <Card className="rounded-sm border-0 shadow-lg bg-gradient-to-br from-card to-muted/50 overflow-hidden relative group">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary/80"></div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" /> Active Production
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              <div className="text-4xl font-display font-bold mb-6 text-foreground">
                {annurCount + coimCount + labCount + ootyCount} <span className="text-lg font-normal text-muted-foreground">total batches</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2"><Box className="w-4 h-4 text-muted-foreground" /> Annur (A)</div>
                  <span className="font-mono font-semibold bg-white shadow-sm px-2 py-0.5 rounded border">{annurCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2"><ThermometerSnowflake className="w-4 h-4 text-muted-foreground" /> Ooty (B)</div>
                  <span className="font-mono font-semibold bg-white shadow-sm px-2 py-0.5 rounded border">{ootyCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-muted-foreground" /> Coimbatore (C)</div>
                  <span className="font-mono font-semibold bg-white shadow-sm px-2 py-0.5 rounded border">{coimCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2"><FlaskConical className="w-4 h-4 text-muted-foreground" /> Lab (D)</div>
                  <span className="font-mono font-semibold bg-white shadow-sm px-2 py-0.5 rounded border">{labCount}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Chamber Occupancy */}
          <Card className="rounded-sm border-0 shadow-lg bg-gradient-to-br from-card to-muted/50 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-primary" /> Chamber Occupancy
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              <div className="text-4xl font-display font-bold mb-6 text-foreground flex items-baseline gap-2">
                {isSummaryLoading ? "-" : summary?.chamberOccupancy.occupied}
                <span className="text-lg font-normal text-muted-foreground">/ {isSummaryLoading ? "-" : summary?.chamberOccupancy.total} active</span>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1 uppercase tracking-wider font-semibold text-muted-foreground">
                    <span>Occupied</span>
                    <span>{isSummaryLoading ? 0 : Math.round((summary!.chamberOccupancy.occupied / summary!.chamberOccupancy.total) * 100)}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary" 
                      style={{ width: `${isSummaryLoading ? 0 : (summary!.chamberOccupancy.occupied / summary!.chamberOccupancy.total) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex gap-4 pt-2">
                  <div className="flex-1 bg-white border shadow-sm rounded p-3 text-center">
                    <div className="text-2xl font-mono font-semibold text-primary">{isSummaryLoading ? "-" : summary?.chamberOccupancy.occupied}</div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">In Use</div>
                  </div>
                  <div className="flex-1 bg-white border shadow-sm rounded p-3 text-center">
                    <div className="text-2xl font-mono font-semibold text-primary">{isSummaryLoading ? "-" : summary?.chamberOccupancy.idle}</div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">Available</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pending Gates */}
          <Card className="rounded-sm border-0 shadow-lg bg-gradient-to-br from-card to-muted/50 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-destructive"></div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-destructive" /> Action Required
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2 flex flex-col justify-between h-[calc(100%-4rem)]">
              <div>
                <div className="text-4xl font-display font-bold text-foreground">
                  {isSummaryLoading ? "-" : summary?.pendingQualityChecks} <span className="text-lg font-normal text-muted-foreground">QC gates</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Batches awaiting quality control or phase transition approval across all locations.
                </p>
              </div>
              
              <div className="mt-6">
                <Button variant={summary?.pendingQualityChecks && summary.pendingQualityChecks > 0 ? "destructive" : "outline"} className="w-full shadow-sm rounded-sm">
                  {summary?.pendingQualityChecks && summary.pendingQualityChecks > 0 ? "Review Pending Approvals" : "All Clear"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {isBusinessError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Business metrics could not be loaded. The dashboard will retry automatically.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-foreground">Business Overview</h2>
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-primary" /></span>
              Live · 15 sec
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <ModuleMetricCard
              title="Crew"
              icon={Users}
              href="/crew"
              accent="bg-primary"
              metrics={[
                { label: "Present Today", value: isBusinessLoading ? "—" : `${business?.crew.presentToday ?? 0} / ${business?.crew.activeEmployees ?? 0}`, tone: "text-primary", description: "Present out of total active employees" },
                { label: "Late Employees", value: isBusinessLoading ? "—" : business?.crew.lateToday ?? 0, tone: "text-amber-600", description: "Late attendance today" },
                { label: "Pending Actions", value: isBusinessLoading ? "—" : business?.crew.pendingActions ?? 0, tone: "text-amber-600" },
              ]}
            />
            <ModuleMetricCard
              title="Sales"
              icon={ShoppingCart}
              href="/sales"
              accent="bg-primary/80"
              metrics={[
                { label: "Quotations Processed", value: isBusinessLoading ? "—" : business?.sales.quotationsProcessed ?? 0 },
                { label: "Total Sales Orders", value: isBusinessLoading ? "—" : business?.sales.totalSalesOrders ?? 0, tone: "text-primary" },
                { label: "Work Orders Started", value: isBusinessLoading ? "—" : business?.sales.workOrdersStarted ?? 0 },
              ]}
            />
            <ModuleMetricCard
              title="Procurement"
              icon={Store}
              href="/flex"
              accent="bg-accent"
              metrics={[
                { label: "Vendors", value: isBusinessLoading ? "—" : business?.procurement.vendors ?? 0 },
                { label: "Confirmed POs", value: isBusinessLoading ? "—" : business?.procurement.confirmedPurchaseOrders ?? 0, tone: "text-primary" },
                { label: "Outstanding Payables", value: isBusinessLoading ? "—" : formatCompactInr(business?.procurement.outstandingPayables ?? 0), tone: "text-amber-600" },
              ]}
            />
          </div>
        </div>

      </div>
    </Shell>
  );
}

// Temporary import placeholders to fix build errors if missing above
import { Layers } from "lucide-react";
