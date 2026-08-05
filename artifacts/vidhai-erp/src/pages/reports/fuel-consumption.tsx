import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetReportFuelConsumption,
  getGetReportFuelConsumptionQueryKey,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Fuel } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function ReportFuelConsumption() {
  const [, setLocation] = useLocation();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);

  const params = { from, to };
  const { data, isLoading } = useGetReportFuelConsumption(params, {
    query: { queryKey: getGetReportFuelConsumptionQueryKey(params) },
  });
  const report = data as any;
  const vehicles: any[] = (report?.vehicles ?? []).map((v: any) => ({
    ...v,
    label: v.vehicleName,
    totalLitres: Number(v.totalLitres ?? 0),
    totalCost: Number(v.totalCost ?? 0),
  }));
  const logs: any[] = report?.logs ?? [];
  const totalLitres = Number(report?.totalLitres ?? 0);
  const totalCost = Number(report?.totalCost ?? 0);

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6">
        <Button variant="ghost" onClick={() => setLocation("/reports")} className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Reports
        </Button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Fuel className="w-6 h-6 text-primary" /> Fuel Consumption
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Litres and cost per vehicle over the selected period, with fill-level breakdown.</p>
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

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Litres", value: `${totalLitres.toFixed(1)} L` },
            { label: "Total Cost", value: totalCost > 0 ? `₹${totalCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—" },
            {
              label: "Avg Cost/Litre",
              value: totalLitres > 0 && totalCost > 0 ? `₹${(totalCost / totalLitres).toFixed(2)}` : "—",
            },
          ].map((s) => (
            <Card key={s.label} className="rounded-sm border-border shadow-none">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{s.label}</p>
                <p className="text-lg font-bold font-mono">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Cost bar chart */}
        {vehicles.length > 0 && (
          <Card className="rounded-sm border-border shadow-none">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Fuel Cost (₹) by Vehicle</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 pb-2">
              {isLoading ? (
                <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(140, vehicles.length * 40)}>
                  <BarChart data={vehicles} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} width={120} />
                    <Tooltip
                      contentStyle={{ borderRadius: "2px", border: "1px solid #e5e7eb", fontSize: 12 }}
                      formatter={(v: any) => [`₹${Number(v).toLocaleString("en-IN")}`, "Cost"]}
                    />
                    <Bar dataKey="totalCost" fill="#21C7B3" radius={[0, 2, 2, 0]} name="Cost (₹)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* Vehicle summary table */}
        <Card className="rounded-sm border-border shadow-none">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Per-Vehicle Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {vehicles.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground text-center">No fuel records in this period.</div>
            ) : (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Vehicle</th>
                    <th className="px-4 py-2 font-medium">Reg No.</th>
                    <th className="px-4 py-2 font-medium text-right">Litres</th>
                    <th className="px-4 py-2 font-medium text-right">Total Cost (₹)</th>
                    <th className="px-4 py-2 font-medium text-right">Fills</th>
                    <th className="px-4 py-2 font-medium text-right">Avg ₹/L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vehicles.map((v: any) => (
                    <tr key={v.vehicleId} className="h-[36px] hover:bg-muted/20">
                      <td className="px-4 font-semibold">{v.vehicleName}</td>
                      <td className="px-4 font-mono text-muted-foreground">{v.vehicleRegNo}</td>
                      <td className="px-4 font-mono text-right">{v.totalLitres.toFixed(1)}</td>
                      <td className="px-4 font-mono text-right font-semibold">{v.totalCost > 0 ? `₹${v.totalCost.toLocaleString("en-IN")}` : "—"}</td>
                      <td className="px-4 font-mono text-right text-muted-foreground">{v.fillCount}</td>
                      <td className="px-4 font-mono text-right text-muted-foreground">
                        {v.totalLitres > 0 && v.totalCost > 0 ? `₹${(v.totalCost / v.totalLitres).toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Fuel log detail */}
        {logs.length > 0 && (
          <Card className="rounded-sm border-border shadow-none">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Fill-Level Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Vehicle</th>
                    <th className="px-4 py-2 font-medium text-right">Litres</th>
                    <th className="px-4 py-2 font-medium text-right">Cost (₹)</th>
                    <th className="px-4 py-2 font-medium text-right">Odometer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.slice().sort((a: any, b: any) => b.fuelDate.localeCompare(a.fuelDate)).map((l: any, i) => (
                    <tr key={i} className="h-[36px] hover:bg-muted/20">
                      <td className="px-4 font-mono text-muted-foreground">{fmt(l.fuelDate)}</td>
                      <td className="px-4">{l.vehicleName}</td>
                      <td className="px-4 font-mono text-right">{Number(l.litres).toFixed(2)}</td>
                      <td className="px-4 font-mono text-right">{l.totalCost != null ? `₹${Number(l.totalCost).toLocaleString("en-IN")}` : "—"}</td>
                      <td className="px-4 font-mono text-right text-muted-foreground">{l.odometer != null ? `${Number(l.odometer).toLocaleString("en-IN")} km` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </Shell>
  );
}
