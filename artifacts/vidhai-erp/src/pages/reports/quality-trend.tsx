import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetReportQualityTrend,
  getGetReportQualityTrendQueryKey,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";

const BENCHMARK_G = 20;

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function ReportQualityTrend() {
  const [, setLocation] = useLocation();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);

  const params = { from, to };
  const { data, isLoading } = useGetReportQualityTrend(params, {
    query: { queryKey: getGetReportQualityTrendQueryKey(params) },
  });
  const report = data as any;
  const harvests: any[] = (report?.harvests ?? []).map((h: any) => ({
    ...h,
    label: fmt(h.harvestDate),
    avgWeightG: Number(h.avgWeightG ?? 0),
    weightKg: Number(h.weightKg ?? 0),
    benchmark: BENCHMARK_G,
  }));

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6">
        <Button variant="ghost" onClick={() => setLocation("/reports")} className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Reports
        </Button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" /> Quality Trend
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Average mushroom weight per harvest vs the ~{BENCHMARK_G} g benchmark.
          </p>
        </div>

        {/* Date filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-sm h-9 font-mono w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-sm h-9 font-mono w-[150px]" />
          </div>
        </div>

        {/* Summary stats */}
        {report && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Harvests", value: report.totalHarvests },
              {
                label: "Avg Weight",
                value: `${Number(report.avgMushroomWeightG ?? 0).toFixed(1)} g`,
                cls: Number(report.avgMushroomWeightG ?? 0) >= BENCHMARK_G ? "text-primary" : "text-amber-600",
              },
              { label: "Total Yield", value: `${Number(report.totalKg ?? 0).toFixed(1)} kg` },
              {
                label: "Meets Standard",
                value: `${report.qualityPercent ?? 0}%`,
                cls: (report.qualityPercent ?? 0) >= 80 ? "text-green-600" : "text-red-600",
              },
            ].map((s) => (
              <Card key={s.label} className="rounded-sm border-border shadow-none">
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{s.label}</p>
                  <p className={`text-lg font-bold font-mono ${s.cls ?? ""}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Trend chart */}
        <Card className="rounded-sm border-border shadow-none">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Avg Mushroom Weight (g) per Harvest · Benchmark {BENCHMARK_G} g
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 pb-2">
            {isLoading ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : harvests.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No harvest data in this period.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={harvests} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, "auto"]} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} unit=" g" />
                  <Tooltip
                    contentStyle={{ borderRadius: "2px", border: "1px solid #e5e7eb", fontSize: 12 }}
                    formatter={(v: any, name: string) => [name === "avgWeightG" ? `${Number(v).toFixed(1)} g` : `${Number(v)} g`, name === "avgWeightG" ? "Avg Weight" : "Benchmark"]}
                  />
                  <ReferenceLine y={BENCHMARK_G} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: "~20 g", position: "insideTopRight", fill: "#f59e0b", fontSize: 11 }} />
                  <Line type="monotone" dataKey="avgWeightG" stroke="#21C7B3" strokeWidth={2} dot={{ r: 3, fill: "#21C7B3" }} name="avgWeightG" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Harvest table */}
        <Card className="rounded-sm border-border shadow-none">
          <CardContent className="p-0 overflow-x-auto">
            {harvests.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground text-center">No harvests in this period.</div>
            ) : (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Batch</th>
                    <th className="px-4 py-2 font-medium">Flush</th>
                    <th className="px-4 py-2 font-medium text-right">Weight (kg)</th>
                    <th className="px-4 py-2 font-medium text-right">Count</th>
                    <th className="px-4 py-2 font-medium text-right">Avg (g)</th>
                    <th className="px-4 py-2 font-medium">Quality Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {harvests.map((h: any, i) => (
                    <tr key={i} className="h-[36px] hover:bg-muted/20">
                      <td className="px-4 font-mono text-muted-foreground">{fmt(h.harvestDate)}</td>
                      <td className="px-4 font-mono text-xs">{h.batchCode}</td>
                      <td className="px-4 font-mono text-muted-foreground text-center">{h.flushNumber ?? "—"}</td>
                      <td className="px-4 font-mono text-right font-semibold">{h.weightKg.toFixed(2)}</td>
                      <td className="px-4 font-mono text-right text-muted-foreground">{h.mushroomCount ?? "—"}</td>
                      <td className={`px-4 font-mono text-right font-semibold ${h.avgWeightG >= BENCHMARK_G ? "text-primary" : "text-amber-600"}`}>
                        {h.avgWeightG.toFixed(1)}
                      </td>
                      <td className="px-4 text-xs text-muted-foreground">{h.qualityNote ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
