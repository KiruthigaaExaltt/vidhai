import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetReportVehicleUtilization,
  getGetReportVehicleUtilizationQueryKey,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Truck } from "lucide-react";
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

export default function ReportVehicleUtilization() {
  const [, setLocation] = useLocation();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);

  const params = { from, to };
  const { data, isLoading } = useGetReportVehicleUtilization(params, {
    query: { queryKey: getGetReportVehicleUtilizationQueryKey(params) },
  });
  const report = data as any;
  const vehicles: any[] = (report?.vehicles ?? []).map((v: any) => ({
    ...v,
    label: v.vehicleName,
    totalHours: Number(v.totalHours ?? 0),
    logCount: Number(v.logCount ?? 0),
  }));
  const usageLogs: any[] = report?.usageLogs ?? [];
  const totalHours = vehicles.reduce((s, v) => s + v.totalHours, 0);

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6">
        <Button variant="ghost" onClick={() => setLocation("/reports")} className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Reports
        </Button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" /> Vehicle Utilization
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Hours worked and run count per vehicle over the selected period.</p>
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
            { label: "Total Hours", value: `${totalHours.toFixed(1)} h` },
            { label: "Vehicles Active", value: vehicles.filter((v) => v.totalHours > 0).length },
            { label: "Total Runs", value: usageLogs.length },
          ].map((s) => (
            <Card key={s.label} className="rounded-sm border-border shadow-none">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{s.label}</p>
                <p className="text-lg font-bold font-mono">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Hours bar chart */}
        {vehicles.length > 0 && (
          <Card className="rounded-sm border-border shadow-none">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Hours by Vehicle</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 pb-2">
              {isLoading ? (
                <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(140, vehicles.length * 40)}>
                  <BarChart data={vehicles} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} unit=" h" />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} width={120} />
                    <Tooltip
                      contentStyle={{ borderRadius: "2px", border: "1px solid #e5e7eb", fontSize: 12 }}
                      formatter={(v: any) => [`${Number(v).toFixed(1)} h`, "Hours"]}
                    />
                    <Bar dataKey="totalHours" fill="#21C7B3" radius={[0, 2, 2, 0]} name="Hours" />
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
              <div className="p-8 text-sm text-muted-foreground text-center">No usage data in this period.</div>
            ) : (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Vehicle</th>
                    <th className="px-4 py-2 font-medium">Reg No.</th>
                    <th className="px-4 py-2 font-medium text-right">Total Hours</th>
                    <th className="px-4 py-2 font-medium text-right">Runs</th>
                    <th className="px-4 py-2 font-medium">Work Types</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vehicles.map((v: any) => (
                    <tr key={v.vehicleId} className="h-[36px] hover:bg-muted/20">
                      <td className="px-4 font-semibold">{v.vehicleName}</td>
                      <td className="px-4 font-mono text-muted-foreground">{v.vehicleRegNo}</td>
                      <td className="px-4 font-mono text-right font-semibold">{v.totalHours.toFixed(1)}</td>
                      <td className="px-4 font-mono text-right text-muted-foreground">{v.logCount}</td>
                      <td className="px-4 text-xs text-muted-foreground">{Object.keys(v.workTypes ?? {}).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Usage log detail */}
        {usageLogs.length > 0 && (
          <Card className="rounded-sm border-border shadow-none">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Usage Log Detail</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Vehicle</th>
                    <th className="px-4 py-2 font-medium">Work Type</th>
                    <th className="px-4 py-2 font-medium text-right">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {usageLogs.slice().sort((a: any, b: any) => b.usageDate.localeCompare(a.usageDate)).map((l: any, i) => (
                    <tr key={i} className="h-[36px] hover:bg-muted/20">
                      <td className="px-4 font-mono text-muted-foreground">{fmt(l.usageDate)}</td>
                      <td className="px-4">{l.vehicleName}</td>
                      <td className="px-4 text-muted-foreground">{l.workType}</td>
                      <td className="px-4 font-mono text-right">{l.hoursWorked != null ? Number(l.hoursWorked).toFixed(1) : "—"}</td>
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
