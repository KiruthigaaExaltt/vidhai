import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetReportMonthlyProduction,
  getGetReportMonthlyProductionQueryKey,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function ReportMonthlyProduction() {
  const [, setLocation] = useLocation();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);

  const params = { year };
  const { data, isLoading } = useGetReportMonthlyProduction(params, {
    query: { queryKey: getGetReportMonthlyProductionQueryKey(params) },
  });
  const report = data as any;
  const months: any[] = (report?.months ?? []).map((m: any) => ({
    ...m,
    label: MONTHS[(m.month ?? 1) - 1],
    mushroomKg: Number(m.mushroomKg ?? 0),
    growBagsProduced: Number(m.growBagsProduced ?? 0),
  }));

  const totalMushroom = months.reduce((s, m) => s + m.mushroomKg, 0);
  const totalBags = months.reduce((s, m) => s + m.growBagsProduced, 0);
  const peakMonth = [...months].sort((a, b) => b.mushroomKg - a.mushroomKg)[0];

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-6 md:p-8">
        <Button variant="ghost" onClick={() => setLocation("/reports")} className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Reports
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-primary" /> Monthly Production
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Mushroom harvest (kg) and grow bags produced by month.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-sm h-8 font-mono" onClick={() => setYear((y) => y - 1)}>‹ {year - 1}</Button>
            <span className="font-bold font-mono text-sm px-2">{year}</span>
            <Button variant="outline" size="sm" className="rounded-sm h-8 font-mono" disabled={year >= thisYear} onClick={() => setYear((y) => y + 1)}>{year + 1} ›</Button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Mushroom", value: `${totalMushroom.toFixed(1)} kg` },
            { label: "Total Grow Bags", value: totalBags.toLocaleString("en-IN") },
            { label: "Peak Month", value: peakMonth?.mushroomKg > 0 ? `${peakMonth.label} (${peakMonth.mushroomKg.toFixed(1)} kg)` : "—" },
          ].map((s) => (
            <Card key={s.label} className="rounded-sm border-border shadow-none">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{s.label}</p>
                <p className="text-lg font-bold font-mono">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bar chart */}
        <Card className="rounded-sm border-border shadow-none">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Mushroom Harvest (kg) by Month</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 pb-2">
            {isLoading ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={months} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: "2px", border: "1px solid #e5e7eb", fontSize: 12 }}
                    formatter={(v: any) => [`${Number(v).toFixed(1)} kg`, "Mushroom"]}
                  />
                  <Bar dataKey="mushroomKg" fill="#21C7B3" radius={[2, 2, 0, 0]} name="Mushroom (kg)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Monthly table */}
        <Card className="rounded-sm border-border shadow-none">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                <tr>
                  <th className="px-4 py-2 font-medium">Month</th>
                  <th className="px-4 py-2 font-medium text-right">Mushroom (kg)</th>
                  <th className="px-4 py-2 font-medium text-right">Grow Bags Produced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {months.map((m: any) => (
                  <tr key={m.month} className={`h-[36px] ${m.mushroomKg > 0 ? "hover:bg-muted/20" : "opacity-50"}`}>
                    <td className="px-4 font-semibold">{m.label}</td>
                    <td className="px-4 font-mono text-right">{m.mushroomKg > 0 ? m.mushroomKg.toFixed(1) : "—"}</td>
                    <td className="px-4 font-mono text-right text-muted-foreground">{m.growBagsProduced > 0 ? m.growBagsProduced.toLocaleString("en-IN") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
