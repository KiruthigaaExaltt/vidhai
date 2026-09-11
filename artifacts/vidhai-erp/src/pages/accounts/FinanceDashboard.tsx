import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  Loader2,
  TrendingUp,
  TrendingDown,
  Calendar,
  ShoppingCart,
  CircleDollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Wallet,
  Scale,
  Users,
  Building2,
  Receipt,
  CreditCard,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
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
      <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 shadow-xl text-xs space-y-2 min-w-[200px] max-w-[260px]">
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

  const netIncomeVal = summary?.netIncome ?? (numeric(summary?.income) - numeric(summary?.expenses));
  const isNetIncomePositive = numeric(netIncomeVal) >= 0;
  const isGrossProfitPositive = numeric(data?.grossProfit) >= 0;

  const metricCards = [
    {
      key: "totalSales",
      label: "Total Sales",
      value: data?.totalSales,
      icon: TrendingUp,
      subtitle: "Gross Invoiced Revenue",
      accent: "from-emerald-500 to-teal-400",
      iconBg: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
      borderHover: "hover:border-emerald-500/50 hover:shadow-emerald-500/10",
      valueColor: "text-slate-900 dark:text-slate-50",
    },
    {
      key: "totalPurchase",
      label: "Total Purchase",
      value: data?.totalPurchase,
      icon: ShoppingCart,
      subtitle: "Procurement & Inward Bills",
      accent: "from-blue-500 to-cyan-400",
      iconBg: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
      borderHover: "hover:border-blue-500/50 hover:shadow-blue-500/10",
      valueColor: "text-slate-900 dark:text-slate-50",
    },
    {
      key: "grossProfit",
      label: "Gross Profit",
      value: data?.grossProfit,
      icon: CircleDollarSign,
      subtitle: isGrossProfitPositive ? "Sales Surplus" : "Gross Deficit",
      accent: isGrossProfitPositive ? "from-teal-500 to-emerald-400" : "from-rose-500 to-red-400",
      iconBg: isGrossProfitPositive
        ? "bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400"
        : "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
      borderHover: isGrossProfitPositive
        ? "hover:border-teal-500/50 hover:shadow-teal-500/10"
        : "hover:border-rose-500/50 hover:shadow-rose-500/10",
      valueColor: isGrossProfitPositive
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400",
    },
    {
      key: "receivables",
      label: "Receivables",
      value: data?.receivables,
      icon: ArrowDownLeft,
      subtitle: "Pending from Customers",
      accent: "from-amber-500 to-orange-400",
      iconBg: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
      borderHover: "hover:border-amber-500/50 hover:shadow-amber-500/10",
      valueColor: "text-slate-900 dark:text-slate-50",
    },
    {
      key: "payables",
      label: "Payables",
      value: data?.payables,
      icon: ArrowUpRight,
      subtitle: "Pending to Vendors",
      accent: "from-purple-500 to-violet-400",
      iconBg: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
      borderHover: "hover:border-purple-500/50 hover:shadow-purple-500/10",
      valueColor: "text-slate-900 dark:text-slate-50",
    },
    {
      key: "inventoryValue",
      label: "Inventory Value",
      value: data?.inventoryValue,
      icon: Boxes,
      subtitle: "Current Stock Valuation",
      accent: "from-indigo-500 to-blue-400",
      iconBg: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
      borderHover: "hover:border-indigo-500/50 hover:shadow-indigo-500/10",
      valueColor: "text-slate-900 dark:text-slate-50",
    },
    {
      key: "cashBooks",
      label: "Cash (Books)",
      value: summary?.cash,
      icon: Wallet,
      subtitle: "Bank & Liquid Reserves",
      accent: "from-emerald-500 to-teal-400",
      iconBg: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
      borderHover: "hover:border-emerald-500/50 hover:shadow-emerald-500/10",
      valueColor: "text-slate-900 dark:text-slate-50",
    },
    {
      key: "netIncome",
      label: "Net Income (Books)",
      value: netIncomeVal,
      icon: Scale,
      subtitle: isNetIncomePositive ? "Net Operating Profit" : "Net Operating Deficit",
      accent: isNetIncomePositive ? "from-emerald-500 to-teal-400" : "from-rose-500 to-red-400",
      iconBg: isNetIncomePositive
        ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
        : "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
      borderHover: isNetIncomePositive
        ? "hover:border-emerald-500/50 hover:shadow-emerald-500/10"
        : "hover:border-rose-500/50 hover:shadow-rose-500/10",
      valueColor: isNetIncomePositive
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400",
    },
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
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => {
            const IconComponent = card.icon;
            return (
              <div
                key={card.key}
                className={`group relative overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 shadow-xs transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg ${card.borderHover} cursor-default`}
              >
                {/* Top Accent Gradient Bar */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.accent} opacity-85 group-hover:h-1.5 group-hover:opacity-100 transition-all duration-300`}
                />

                {/* Ambient Soft Glow on Hover */}
                <div
                  className={`absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-gradient-to-br ${card.accent} opacity-0 blur-2xl group-hover:opacity-20 transition-opacity duration-500 pointer-events-none`}
                />

                <div className="relative z-10 flex flex-col justify-between h-full space-y-3">
                  {/* Top: Title & Icon Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {card.label}
                    </span>
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 shrink-0 shadow-xs ${card.iconBg}`}
                    >
                      <IconComponent className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Bottom: Big Value & Subtitle */}
                  <div>
                    <div className={`text-2xl font-bold tracking-tight tabular-nums ${card.valueColor}`}>
                      {money(card.value)}
                    </div>
                    <p className="mt-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-r ${card.accent}`} />
                      <span>{card.subtitle}</span>
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Section Heading: Performance & Cash Flow Analytics */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between pt-2 pb-0.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/20 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20 shadow-xs">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Performance & Cash Flow Analytics
              </h2>
              <p className="text-xs text-muted-foreground">
                Revenue vs procurement trends, cash liquidity, outstanding balances & ledger activity
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <Card className="shadow-xs border-slate-200/80 dark:border-slate-800 overflow-visible relative z-10">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 rounded-t-xl">
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
            <CardContent className="p-4 pt-6 overflow-visible">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data?.trend || []}
                    margin={{ top: 12, right: 16, left: -4, bottom: 4 }}
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

          {/* Cash Flow Summary Card */}
          <CashFlowSummaryCard data={data} />
        </div>

        {/* Top Customers & Vendors Pending */}
        <div className="grid gap-4 lg:grid-cols-2">
          <PendingCard
            title="Top Customers Pending"
            type="customer"
            rows={data?.topCustomers || []}
            empty="No pending customer balances found."
          />
          <PendingCard
            title="Top Vendors Pending"
            type="vendor"
            rows={data?.topVendors || []}
            empty="No pending vendor balances found."
          />
        </div>

        {/* Recent Receivables & Payables */}
        <div className="grid gap-4 lg:grid-cols-2">
          <RecentTransactionsCard
            title="Recent Receivables"
            type="receivable"
            rows={recentReceivables.map((row) => ({
              name: row.clientName,
              reference: row.invoiceNumber,
              amount: row.amount,
            }))}
            empty="No recent receivables recorded."
          />
          <RecentTransactionsCard
            title="Recent Payables"
            type="payable"
            rows={recentPayables.map((row) => ({
              name: row.vendorName,
              reference: row.billNumber,
              amount: row.amount,
            }))}
            empty="No recent payables recorded."
          />
        </div>
      </>}
    </div>
  );
}

function CashFlowSummaryCard({ data }: { data: any }) {
  const cfIncome = numeric(data?.cashFlow?.income);
  const cfExpenses = numeric(data?.cashFlow?.expenses);
  const cfNet = data?.cashFlow?.net !== undefined ? numeric(data?.cashFlow?.net) : cfIncome - cfExpenses;
  const isNetPositive = cfNet >= 0;
  const totalFlow = cfIncome + cfExpenses;
  const incomePct = totalFlow > 0 ? Math.round((cfIncome / totalFlow) * 100) : 0;
  const expensePct = totalFlow > 0 ? 100 - incomePct : 0;

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-sm hover:shadow-xl hover:border-emerald-500/40 transition-all duration-300 flex flex-col justify-between group">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center ring-1 ring-emerald-500/20 shadow-xs group-hover:scale-105 transition-transform duration-300">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Cash Flow Summary
              </CardTitle>
              <p className="text-xs text-muted-foreground">Inflow vs Outflow overview</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Books
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-2 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-3">
          {/* Income Row */}
          <div className="group/row flex items-center justify-between p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 hover:border-emerald-200/80 dark:hover:border-emerald-900/40 transition-all duration-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-200/60 dark:border-emerald-800/40 shadow-2xs">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">Total Inflow</div>
                <div className="text-[11px] text-muted-foreground">Revenue & Collections</div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-emerald-600/70 mr-0.5">+</span>
              <b className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400 text-base sm:text-lg">
                {money(cfIncome)}
              </b>
            </div>
          </div>

          {/* Expense Row */}
          <div className="group/row flex items-center justify-between p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 hover:border-rose-200/80 dark:hover:border-rose-900/40 transition-all duration-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-100/80 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-200/60 dark:border-rose-800/40 shadow-2xs">
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">Total Outflow</div>
                <div className="text-[11px] text-muted-foreground">Procurements & Expenses</div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-rose-600/70 mr-0.5">-</span>
              <b className="font-bold tabular-nums text-rose-600 dark:text-rose-400 text-base sm:text-lg">
                {money(cfExpenses)}
              </b>
            </div>
          </div>

          {/* Cash Distribution Mini Bar */}
          {totalFlow > 0 && (
            <div className="space-y-1.5 px-0.5 pt-0.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  Inflow <b className="text-emerald-600 dark:text-emerald-400 font-semibold">{incomePct}%</b>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                  Outflow <b className="text-rose-600 dark:text-rose-400 font-semibold">{expensePct}%</b>
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500"
                  style={{ width: `${incomePct}%` }}
                />
                <div
                  className="bg-rose-500 h-full transition-all duration-500"
                  style={{ width: `${expensePct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Net Cash Flow Box */}
        <div
          className={`p-3.5 rounded-xl border transition-all duration-200 ${
            isNetPositive
              ? "bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border-emerald-200/90 dark:border-emerald-800/40"
              : "bg-gradient-to-r from-rose-500/10 via-orange-500/5 to-transparent border-rose-200/90 dark:border-rose-800/40"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Net Cash Flow
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                isNetPositive
                  ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                  : "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
              }`}
            >
              {isNetPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isNetPositive ? "Surplus" : "Deficit"}
            </span>
          </div>
          <div
            className={`text-xl sm:text-2xl font-bold font-mono tracking-tight ${
              isNetPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {isNetPositive ? "+" : ""}
            {money(cfNet)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getInitials(name?: string) {
  if (!name) return "--";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function PendingCard({
  title,
  type,
  rows,
  empty,
}: {
  title: string;
  type: "customer" | "vendor";
  rows: any[];
  empty: string;
}) {
  const isCustomer = type === "customer";
  const Icon = isCustomer ? Users : Building2;
  const iconStyle = isCustomer
    ? "bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 ring-sky-500/20"
    : "bg-violet-500/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400 ring-violet-500/20";
  const avatarStyle = isCustomer
    ? "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200/70 dark:border-sky-800/60"
    : "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200/70 dark:border-violet-800/60";
  const badgeHoverStyle = isCustomer
    ? "group-hover/row:bg-sky-50 dark:group-hover/row:bg-sky-950/40 group-hover/row:text-sky-700 dark:group-hover/row:text-sky-300 group-hover/row:border-sky-200 dark:group-hover/row:border-sky-800/60"
    : "group-hover/row:bg-violet-50 dark:group-hover/row:bg-violet-950/40 group-hover/row:text-violet-700 dark:group-hover/row:text-violet-300 group-hover/row:border-violet-200 dark:group-hover/row:border-violet-800/60";

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-sm hover:shadow-xl transition-all duration-300 group">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ring-1 shadow-xs group-hover:scale-105 transition-transform duration-300 ${iconStyle}`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {title}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {isCustomer ? "Outstanding client receivables" : "Outstanding supplier payables"}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
            {rows.length} {rows.length === 1 ? "Party" : "Parties"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-2">
        {rows.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {rows.map((row, idx) => (
              <div
                key={row.name || idx}
                className="group/row flex items-center justify-between py-3 px-2 rounded-xl transition-all duration-200 hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div
                    className={`w-9 h-9 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 border shadow-2xs ${avatarStyle}`}
                  >
                    {getInitials(row.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate max-w-[180px] sm:max-w-[280px]">
                      {row.name || "Unknown Party"}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Pending Settlement
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`inline-block font-bold tabular-nums text-sm text-slate-900 dark:text-slate-100 px-3 py-1 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 transition-all duration-200 ${badgeHoverStyle}`}
                  >
                    {money(row.outstanding)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60 flex items-center justify-center mb-3 text-emerald-600 dark:text-emerald-400 shadow-2xs">
              <CheckCircle2 className="w-6 h-6 stroke-[2]" />
            </div>
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
              {isCustomer ? "All Customer Dues Clear" : "All Vendor Balances Settled"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">{empty}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentTransactionsCard({
  title,
  type,
  rows,
  empty,
}: {
  title: string;
  type: "receivable" | "payable";
  rows: { name: string; reference: string; amount: any }[];
  empty: string;
}) {
  const isReceivable = type === "receivable";
  const Icon = isReceivable ? Receipt : CreditCard;
  const iconStyle = isReceivable
    ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 ring-emerald-500/20"
    : "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 ring-rose-500/20";
  const chipBg = isReceivable
    ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/50"
    : "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-800/50";
  const amountStyle = isReceivable
    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-900/50"
    : "text-rose-600 dark:text-rose-400 bg-rose-50/70 dark:bg-rose-950/40 border-rose-200/70 dark:border-rose-900/50";

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-sm hover:shadow-xl transition-all duration-300 group">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ring-1 shadow-xs group-hover:scale-105 transition-transform duration-300 ${iconStyle}`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {title}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {isReceivable ? "Latest customer invoice collections" : "Latest inward vendor bills"}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
            {rows.length} {rows.length === 1 ? "Record" : "Records"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-2">
        {rows.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {rows.map((row, index) => (
              <div
                key={`${row.reference}-${index}`}
                className="group/row flex items-center justify-between py-3 px-2 rounded-xl transition-all duration-200 hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs ${chipBg}`}
                  >
                    {isReceivable ? (
                      <ArrowDownLeft className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate max-w-[180px] sm:max-w-[280px]">
                      {row.name || "Unknown Party"}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                        {row.reference || "No Ref"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`inline-block font-bold tabular-nums text-sm px-3 py-1 rounded-lg border shadow-2xs transition-transform duration-200 group-hover/row:scale-105 ${amountStyle}`}
                  >
                    {isReceivable ? "+" : "-"}
                    {money(row.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-3 text-slate-400 shadow-2xs">
              <Icon className="w-6 h-6 stroke-[1.75]" />
            </div>
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">No Transactions</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">{empty}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
