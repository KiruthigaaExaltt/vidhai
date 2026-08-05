import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sprout, TrendingUp } from "lucide-react";

function fmt(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ReportAnnurBatchYield() {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["report-annur-batch-yield"],
    queryFn: async () => {
      const res = await fetch("/api/reports/annur-batch-yield", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json() as Promise<{
        rows: {
          annurBatchId: number;
          annurBatchCode: string;
          annurActualBags: number | null;
          annurCreatedAt: string | null;
          roomCount: number;
          totalBagsInOoty: number;
          flush1Kg: number;
          flush2Kg: number;
          totalYieldKg: number;
          yieldPerBag: number | null;
        }[];
      }>;
    },
  });

  const rows = data?.rows ?? [];
  const totalYield = rows.reduce((s, r) => s + r.totalYieldKg, 0);
  const totalBags  = rows.reduce((s, r) => s + (r.totalBagsInOoty || 0), 0);

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
        <Button
          variant="ghost"
          onClick={() => setLocation("/reports")}
          className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Reports
        </Button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sprout className="w-6 h-6 text-primary" /> Annur Batch Yield Report
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Total mushroom output per Annur grow-bag batch, rolled up across all Ooty growing rooms
            that received bags from each batch (Flush 1 + Flush 2 combined).
          </p>
        </div>

        {/* Summary strip */}
        {rows.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Annur Batches Tracked", value: rows.length.toString() },
              { label: "Total Bags in Ooty", value: totalBags.toLocaleString() },
              { label: "Total Mushroom Yield", value: `${totalYield.toFixed(1)} kg` },
              {
                label: "Avg Yield / Bag",
                value: totalBags > 0 ? `${(totalYield / totalBags).toFixed(3)} kg` : "—",
              },
            ].map((kpi) => (
              <Card key={kpi.label} className="rounded-sm border-border shadow-none">
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{kpi.label}</p>
                  <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Main table */}
        <Card className="rounded-sm border-border shadow-none">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Yield by Annur Batch
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No data yet. Harvest records will appear here once Ooty Flush 1 / Flush 2 stages are completed
                for batches that have an Annur grow-bag batch linked.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-muted/40 text-muted-foreground text-[10px] uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-medium">Annur Batch</th>
                      <th className="px-4 py-3 font-medium text-right">Bags Produced</th>
                      <th className="px-4 py-3 font-medium text-right">Bags in Ooty</th>
                      <th className="px-4 py-3 font-medium text-right">Rooms</th>
                      <th className="px-4 py-3 font-medium text-right">Flush 1 (kg)</th>
                      <th className="px-4 py-3 font-medium text-right">Flush 2 (kg)</th>
                      <th className="px-4 py-3 font-medium text-right">Total Yield (kg)</th>
                      <th className="px-4 py-3 font-medium text-right">Yield / Bag</th>
                      <th className="px-4 py-3 font-medium">Batch Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row) => {
                      const hasYield = row.totalYieldKg > 0;
                      return (
                        <tr key={row.annurBatchId} className="h-[44px] hover:bg-muted/20 transition-colors">
                          <td className="px-4">
                            <span className="font-mono text-sm font-semibold text-primary">
                              {row.annurBatchCode}
                            </span>
                          </td>
                          <td className="px-4 font-mono text-right text-muted-foreground">
                            {row.annurActualBags?.toLocaleString() ?? "—"}
                          </td>
                          <td className="px-4 font-mono text-right">
                            {row.totalBagsInOoty.toLocaleString()}
                          </td>
                          <td className="px-4 text-right">
                            <Badge variant="outline" className="rounded-sm font-mono text-[11px]">
                              {row.roomCount} {row.roomCount === 1 ? "room" : "rooms"}
                            </Badge>
                          </td>
                          <td className="px-4 font-mono text-right">
                            {hasYield && row.flush1Kg > 0 ? (
                              <span className="text-foreground font-semibold">{row.flush1Kg.toFixed(2)}</span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-4 font-mono text-right">
                            {hasYield && row.flush2Kg > 0 ? (
                              <span className="text-foreground font-semibold">{row.flush2Kg.toFixed(2)}</span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-4 font-mono text-right">
                            {hasYield ? (
                              <span className="text-primary font-bold">{row.totalYieldKg.toFixed(2)}</span>
                            ) : (
                              <span className="text-muted-foreground/40 text-xs">pending</span>
                            )}
                          </td>
                          <td className="px-4 font-mono text-right text-muted-foreground">
                            {row.yieldPerBag != null ? row.yieldPerBag.toFixed(3) : "—"}
                          </td>
                          <td className="px-4 text-muted-foreground text-xs">
                            {fmt(row.annurCreatedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {rows.length > 1 && (
                    <tfoot className="border-t-2 border-border bg-muted/30">
                      <tr className="h-[40px]">
                        <td className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Total
                        </td>
                        <td className="px-4 font-mono text-right text-muted-foreground">—</td>
                        <td className="px-4 font-mono text-right font-semibold">
                          {totalBags.toLocaleString()}
                        </td>
                        <td className="px-4 text-right text-muted-foreground">—</td>
                        <td className="px-4 font-mono text-right font-semibold">
                          {rows.reduce((s, r) => s + r.flush1Kg, 0).toFixed(2)}
                        </td>
                        <td className="px-4 font-mono text-right font-semibold">
                          {rows.reduce((s, r) => s + r.flush2Kg, 0).toFixed(2)}
                        </td>
                        <td className="px-4 font-mono text-right text-primary font-bold">
                          {totalYield.toFixed(2)}
                        </td>
                        <td className="px-4 font-mono text-right text-muted-foreground">
                          {totalBags > 0 ? (totalYield / totalBags).toFixed(3) : "—"}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground">
          * "Bags in Ooty" is the sum of bags assigned per room from this Annur batch via the traceability link.
          Yield / Bag = Total Yield ÷ Bags in Ooty (a measure of growing-room efficiency per bag).
        </p>
      </div>
    </Shell>
  );
}
