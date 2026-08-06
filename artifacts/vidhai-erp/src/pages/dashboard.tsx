import { useGetDashboardSummary, useListBatches, useListCoimbatoreBatches, useListLabBatches, useListOotyGrowingBatches } from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus, Thermometer, Box, ShieldCheck, ThermometerSnowflake, FlaskConical, MapPin } from "lucide-react";

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();

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
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-display">System Cockpit</h1>
            
          </div>
          <div className="flex items-center gap-3">
            <Link href="/annur/chambers" className="flex-1 sm:flex-none">
              <Button variant="outline" className="w-full sm:w-auto font-medium rounded-sm shadow-sm h-10 px-4">
                <Thermometer className="w-4 h-4 mr-2" />
                Add Reading
              </Button>
            </Link>
            <Link href="/annur/batches/new" className="flex-1 sm:flex-none">
              <Button className="w-full sm:w-auto font-medium rounded-sm shadow-sm h-10 px-4">
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

        <Card className="rounded-sm border-border shadow-lg">
          <CardHeader className="p-6 border-b bg-muted/20">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground">Global Stage Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-auto max-h-[400px]">
            {isSummaryLoading ? (
              <div className="text-center text-sm text-muted-foreground py-12">Loading...</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 divide-border">
                {summary?.stageBreakdown.map((item) => (
                  <div key={item.stage} className="flex items-center justify-between p-4 border-b border-r hover:bg-muted/30 transition-colors">
                    <span className="text-sm font-medium truncate pr-4 text-muted-foreground">{item.stage.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-base font-semibold bg-white border px-3 py-1 rounded shadow-sm text-foreground">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}

// Temporary import placeholders to fix build errors if missing above
import { Layers } from "lucide-react";
