import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, TrendingUp, Calendar } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const numeric = (value: unknown) => {
  const parsed = Number((value as any)?.$numberDecimal ?? value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: unknown) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(numeric(value));

const formatYAxis = (val: any) => {
  const v = numeric(val);
  if (v === 0) return "₹0";
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${Math.round(v / 1000)}k`;
  return `₹${v}`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const sales = numeric(payload.find((p: any) => p.dataKey === "sales")?.value);
    const purchase = numeric(payload.find((p: any) => p.dataKey === "purchase")?.value);
    const net = sales - purchase;
    const isProfit = net >= 0;

    return (
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 shadow-xl text-xs space-y-2 min-w-[190px] max-w-[220px]">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
            <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>{label}</span>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            Trend
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Sales:</span>
            </div>
            <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
              {money(sales)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
              <span>Purchase:</span>
            </div>
            <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
              {money(purchase)}
            </span>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 flex items-center justify-between gap-3">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Net:</span>
          <span
            className={`font-bold tabular-nums px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap ${
              isProfit
                ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50"
                : "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50"
            }`}
          >
            {isProfit ? "+" : ""}
            {money(net)}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

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

  const maxTrendValue = useMemo(() => {
    const list = data?.trend || [];
    let max = 0;
    for (const item of list) {
      max = Math.max(max, numeric(item.sales), numeric(item.purchase));
    }
    return max;
  }, [data?.trend]);

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
          <Card className="shadow-xs border-slate-200/80 dark:border-slate-800 overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Sales vs Purchase Trend
                    </CardTitle>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Monthly comparison of revenue generation against procurement costs
                    </p>
                  </div>
                </div>

                {/* Quick Indicators */}
                <div className="flex items-center gap-2.5 text-xs">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 font-medium">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Sales</span>
                    <span className="font-bold tabular-nums ml-1">
                      {money(data?.totalSales)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 font-medium">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span>Purchase</span>
                    <span className="font-bold tabular-nums ml-1">
                      {money(data?.totalPurchase)}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-6">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data?.trend || []}
                    margin={{ top: 12, right: 12, left: -4, bottom: 4 }}
                    barGap={6}
                    barCategoryGap="25%"
                  >
                    <defs>
                      <linearGradient id="salesBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.75} />
                      </linearGradient>
                      <linearGradient id="purchaseBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#e11d48" stopOpacity={0.75} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="4 4"
                      vertical={false}
                      stroke="#e2e8f0"
                      className="stroke-slate-200/60 dark:stroke-slate-800/60"
                    />
                    <XAxis
                      dataKey="month"
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "#64748b", fontWeight: 500 }}
                      dy={6}
                    />
                    <YAxis
                      domain={maxTrendValue > 0 ? [0, "auto"] : [0, 50000]}
                      ticks={maxTrendValue > 0 ? undefined : [0, 10000, 20000, 30000, 40000, 50000]}
                      tickFormatter={formatYAxis}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      width={54}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={<CustomTooltip />}
                      cursor={false}
                      allowEscapeViewBox={{ x: true, y: true }}
                      wrapperStyle={{ outline: "none", zIndex: 50, pointerEvents: "none" }}
                    />
                    <Bar
                      dataKey="sales"
                      name="Sales"
                      fill="url(#salesBarGradient)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                      minPointSize={6}
                    />
                    <Bar
                      dataKey="purchase"
                      name="Purchase"
                      fill="url(#purchaseBarGradient)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                      minPointSize={6}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
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
