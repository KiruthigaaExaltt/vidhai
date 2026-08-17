import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const numeric = (value: unknown) => {
  const parsed = Number((value as any)?.$numberDecimal ?? value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: unknown) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(numeric(value));

export function FinanceDashboard({
  request,
  summary,
  receivables,
  payables,
  can,
}: {
  request: (path: string, options?: RequestInit) => Promise<any>;
  summary: any;
  receivables: any[];
  payables: any[];
  can: (permission: string) => boolean;
}) {
  const [range, setRange] = useState("month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!can("accounts.finance_dashboard.view")) return;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ range });
    if (range === "custom" && dateFrom && dateTo) {
      query.set("dateFrom", dateFrom);
      query.set("dateTo", dateTo);
    }
    try {
      setData(await request(`/business-dashboard?${query}`));
    } catch (reason: any) {
      setData(null);
      setError(reason?.message || "Failed to load business dashboard.");
    } finally {
      setLoading(false);
    }
  }, [can, dateFrom, dateTo, range, request]);

  useEffect(() => { void load(); }, [load]);

  if (!can("accounts.finance_dashboard.view")) return <Card><CardContent className="p-8 text-center"><h3 className="font-semibold">Access Denied</h3><p className="mt-1 text-sm text-muted-foreground">You do not have permission to view the Finance Dashboard.</p></CardContent></Card>;

  const cards = [
    ["Total Sales", data?.totalSales, ""],
    ["Total Purchase", data?.totalPurchase, ""],
    ["Gross Profit", data?.grossProfit, numeric(data?.grossProfit) >= 0 ? "text-emerald-600" : "text-red-600"],
    ["Receivables", data?.receivables, ""],
    ["Payables", data?.payables, ""],
    ["Inventory Value", data?.inventoryValue, ""],
    ["Cash (Books)", summary?.cash, ""],
    ["Net Income (Books)", summary?.netIncome ?? numeric(summary?.income) - numeric(summary?.expenses), numeric(summary?.netIncome ?? numeric(summary?.income) - numeric(summary?.expenses)) >= 0 ? "text-emerald-600" : "text-red-600"],
  ];
  const recentReceivables = receivables.slice(0, 5);
  const recentPayables = payables.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {["today", "week", "month", "custom"].map((option) => <Button key={option} type="button" size="sm" variant={range === option ? "default" : "outline"} onClick={() => setRange(option)}>{option === "today" ? "Today" : option === "week" ? "This Week" : option === "month" ? "This Month" : "Custom"}</Button>)}
        </div>
        {range === "custom" && <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><div className="space-y-1"><Label htmlFor="dashboard-from">From</Label><Input id="dashboard-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div><div className="space-y-1"><Label htmlFor="dashboard-to">To</Label><Input id="dashboard-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div><Button type="button" onClick={() => void load()}>Apply</Button></div>}
      </div>

      {error && <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</div>}
      {loading ? <div className="flex min-h-64 items-center justify-center rounded-lg border bg-white text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading business dashboard...</div> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, color]) => <Card key={String(label)}><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className={`text-xl font-semibold tabular-nums ${color}`}>{money(value)}</CardContent></Card>)}</div>

        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <Card><CardHeader><CardTitle className="text-base">Sales vs Purchase Trend</CardTitle></CardHeader><CardContent><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.trend || []} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" /><YAxis tickFormatter={(value) => numeric(value) >= 100000 ? `${(numeric(value) / 100000).toFixed(1)}L` : `${Math.round(numeric(value) / 1000)}K`} /><Tooltip formatter={(value) => money(value)} /><Legend /><Bar dataKey="sales" name="Sales" fill="#20bfa9" radius={[3, 3, 0, 0]} /><Bar dataKey="purchase" name="Purchase" fill="#ef5a5a" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Cash Flow Summary</CardTitle></CardHeader><CardContent className="space-y-3"><Metric label="Income" value={data?.cashFlow?.income} color="text-emerald-600" /><Metric label="Expenses" value={data?.cashFlow?.expenses} color="text-red-600" /><div className="border-t pt-3"><Metric label="Net Cash Flow" value={data?.cashFlow?.net} color={numeric(data?.cashFlow?.net) >= 0 ? "text-emerald-600" : "text-red-600"} /></div></CardContent></Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2"><Pending title="Top Customers Pending" rows={data?.topCustomers || []} empty="No pending customer balances." /><Pending title="Top Vendors Pending" rows={data?.topVendors || []} empty="No pending vendor balances." /></div>
        <div className="grid gap-4 lg:grid-cols-2"><Recent title="Recent Receivables" rows={recentReceivables.map((row) => ({ name: row.clientName, reference: row.invoiceNumber, amount: row.amount }))} empty="No recent receivables." /><Recent title="Recent Payables" rows={recentPayables.map((row) => ({ name: row.vendorName, reference: row.billNumber, amount: row.amount }))} empty="No recent payables." /></div>
      </>}
    </div>
  );
}

function Metric({ label, value, color = "" }: { label: string; value: unknown; color?: string }) { return <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><b className={`tabular-nums ${color}`}>{money(value)}</b></div>; }
function Pending({ title, rows, empty }: { title: string; rows: any[]; empty: string }) { return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent>{rows.length ? <div className="divide-y">{rows.map((row) => <div key={row.name} className="flex items-center justify-between py-2.5 text-sm"><span>{row.name}</span><b className="tabular-nums">{money(row.outstanding)}</b></div>)}</div> : <p className="py-5 text-center text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>; }
function Recent({ title, rows, empty }: { title: string; rows: any[]; empty: string }) { return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent>{rows.length ? <div className="divide-y">{rows.map((row, index) => <div key={`${row.reference}-${index}`} className="flex items-center justify-between gap-4 py-2.5 text-sm"><div><div className="font-medium">{row.name || ""}</div><div className="text-xs text-muted-foreground">{row.reference || ""}</div></div><b className="tabular-nums">{money(row.amount)}</b></div>)}</div> : <p className="py-5 text-center text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>; }
