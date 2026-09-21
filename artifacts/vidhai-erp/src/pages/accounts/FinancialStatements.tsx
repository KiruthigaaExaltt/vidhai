import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  TrendingUp,
  TrendingDown,
  Scale,
  Building2,
  Wallet,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Calendar,
  ArrowRight,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

type Account = {
  id: number;
  accountCode: string;
  accountName: string;
  accountType: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
  currentBalance: unknown;
  periodBalance: unknown;
  periodDebit: unknown;
  periodCredit: unknown;
};

const amount = (value: unknown) => {
  const parsed = Number((value as any)?.$numberDecimal ?? value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};

const money = (value: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount(value));

const displayBalance = (account: Account) =>
  ["Liability", "Equity", "Revenue"].includes(account.accountType)
    ? -amount(account.periodBalance)
    : amount(account.periodBalance);

const byCode = (left: Account, right: Account) =>
  left.accountCode.localeCompare(right.accountCode, undefined, { numeric: true });

function AccountRows({ rows }: { rows: Account[] }) {
  if (!rows.length) {
    return (
      <div className="py-8 px-4 text-center text-xs text-muted-foreground flex flex-col items-center justify-center">
        <FileText className="h-6 w-6 text-slate-300 dark:text-slate-600 mb-1.5" />
        <span>No accounts recorded for this category in the selected period.</span>
      </div>
    );
  }
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
      {rows.map((account) => {
        const bal = displayBalance(account);
        const isNegative = bal < 0;
        return (
          <div
            key={account.id}
            className="grid grid-cols-[80px_1fr_auto] sm:grid-cols-[90px_1fr_auto] gap-3 px-4 sm:px-5 py-3 text-sm items-center hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
          >
            <span className="inline-flex items-center justify-center font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
              {account.accountCode}
            </span>
            <span
              className="font-medium text-slate-800 dark:text-slate-200 truncate"
              title={account.accountName}
            >
              {account.accountName}
            </span>
            <span
              className={`font-mono font-bold text-right tabular-nums text-sm ${
                isNegative
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-slate-900 dark:text-slate-100"
              }`}
            >
              {money(bal)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatementSection({
  title,
  subtitle,
  icon: Icon,
  accent,
  count,
  total,
  totalLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: any;
  accent?: string;
  count?: number;
  total: number;
  totalLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col justify-between">
      <div>
        {/* Top Accent Ribbon */}
        <div
          className={`h-1.5 w-full bg-gradient-to-r ${
            accent || "from-emerald-500 via-teal-500 to-cyan-500"
          }`}
        />

        {/* Section Header */}
        <div className="p-4 sm:p-5 pb-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 ring-1 ring-slate-200/60 dark:ring-slate-700/60 shadow-2xs">
                <Icon className="h-4 w-4" />
              </div>
            )}
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {title}
              </h3>
              {subtitle && (
                <p className="text-[11px] text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>

          {typeof count === "number" && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
              {count} {count === 1 ? "account" : "accounts"}
            </span>
          )}
        </div>

        {/* Section Rows */}
        <div className="p-0">{children}</div>
      </div>

      {/* Subtotal Footer */}
      <div className="p-3.5 px-5 bg-slate-50/90 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {totalLabel || `Total ${title}`}
        </span>
        <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-slate-100 font-mono">
          {money(total)}
        </span>
      </div>
    </Card>
  );
}

export function FinancialStatements({
  request,
  can,
}: {
  request: (path: string, options?: RequestInit) => Promise<any>;
  can: (permission: string) => boolean;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [report, setReport] = useState("profit-loss");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString() ? `?${params}` : "";
  }, [dateFrom, dateTo]);

  const applyPreset = (preset: "this-month" | "this-fy" | "all") => {
    const now = new Date();
    const currentYear = now.getFullYear();
    if (preset === "this-month") {
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const lastDay = new Date(currentYear, now.getMonth() + 1, 0).getDate();
      setDateFrom(`${currentYear}-${month}-01`);
      setDateTo(`${currentYear}-${month}-${String(lastDay).padStart(2, "0")}`);
    } else if (preset === "this-fy") {
      const fyStart = now.getMonth() >= 3 ? currentYear : currentYear - 1;
      setDateFrom(`${fyStart}-04-01`);
      setDateTo(`${fyStart + 1}-03-31`);
    } else {
      setDateFrom("");
      setDateTo("");
    }
  };

  useEffect(() => {
    if (!can("accounts.financial_statements.view")) return;
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError("From date must be on or before To date.");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    request(`/financial-statements${query}`)
      .then((data) => active && setAccounts(Array.isArray(data?.accounts) ? data.accounts : []))
      .catch((reason) => active && setError(reason?.message || "Unable to load financial statements."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [can, dateFrom, dateTo, query, request]);

  const calculated = useMemo(() => {
    const typed = (type: Account["accountType"]) =>
      accounts.filter((account) => account.accountType === type).sort(byCode);
    const revenue = typed("Revenue");
    const expenses = typed("Expense");
    const assets = typed("Asset");
    const liabilities = typed("Liability");
    const equity = typed("Equity");
    const sum = (rows: Account[]) =>
      amount(rows.reduce((total, account) => total + displayBalance(account), 0));
    const totalRevenue = sum(revenue);
    const totalExpenses = sum(expenses);
    const netIncome = amount(totalRevenue - totalExpenses);
    const totalAssets = sum(assets);
    const totalLiabilities = sum(liabilities);
    const totalEquity = sum(equity);
    const balanceDifference = amount(totalAssets - totalLiabilities - totalEquity);
    const trial = [...accounts].sort(byCode).map((account) => {
      const net = displayBalance(account);
      return {
        ...account,
        trialDebit: amount(account.periodDebit) > 0 ? amount(account.periodDebit) : Math.max(0, net),
        trialCredit:
          amount(account.periodCredit) > 0 ? amount(account.periodCredit) : Math.max(0, -net),
      };
    });
    const totalDebit = amount(trial.reduce((total, account) => total + account.trialDebit, 0));
    const totalCredit = amount(trial.reduce((total, account) => total + account.trialCredit, 0));
    return {
      revenue,
      expenses,
      assets,
      liabilities,
      equity,
      totalRevenue,
      totalExpenses,
      netIncome,
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanceDifference,
      trial,
      totalDebit,
      totalCredit,
      trialDifference: amount(totalDebit - totalCredit),
    };
  }, [accounts]);

  const periodLabel =
    dateFrom && dateTo
      ? `${dateFrom} to ${dateTo}`
      : dateFrom
        ? `From ${dateFrom}`
        : dateTo
          ? `Up to ${dateTo}`
          : `As of ${new Date().toLocaleDateString("en-IN")}`;

  const exportRows = () => {
    if (report === "profit-loss")
      return [
        ...calculated.revenue.map((x) => ({
          Section: "Revenue",
          Code: x.accountCode,
          Account: x.accountName,
          Amount: displayBalance(x),
        })),
        ...calculated.expenses.map((x) => ({
          Section: "Expense",
          Code: x.accountCode,
          Account: x.accountName,
          Amount: displayBalance(x),
        })),
        { Section: "Total Revenue", Code: "", Account: "", Amount: calculated.totalRevenue },
        { Section: "Total Expense", Code: "", Account: "", Amount: calculated.totalExpenses },
        {
          Section: calculated.netIncome >= 0 ? "Net Profit" : "Net Loss",
          Code: "",
          Account: "",
          Amount: Math.abs(calculated.netIncome),
        },
      ];
    if (report === "balance-sheet")
      return [
        ...calculated.assets.map((x) => ({
          Section: "Asset",
          Code: x.accountCode,
          Account: x.accountName,
          Amount: displayBalance(x),
        })),
        ...calculated.liabilities.map((x) => ({
          Section: "Liability",
          Code: x.accountCode,
          Account: x.accountName,
          Amount: displayBalance(x),
        })),
        ...calculated.equity.map((x) => ({
          Section: "Equity",
          Code: x.accountCode,
          Account: x.accountName,
          Amount: displayBalance(x),
        })),
        { Section: "Total Assets", Code: "", Account: "", Amount: calculated.totalAssets },
        {
          Section: "Liabilities + Equity",
          Code: "",
          Account: "",
          Amount: amount(calculated.totalLiabilities + calculated.totalEquity),
        },
        { Section: "Difference", Code: "", Account: "", Amount: calculated.balanceDifference },
      ];
    return calculated.trial.map((x) => ({
      Code: x.accountCode,
      Account: x.accountName,
      Type: x.accountType,
      Debit: x.trialDebit,
      Credit: x.trialCredit,
    }));
  };

  const reportName =
    report === "profit-loss"
      ? "Profit & Loss"
      : report === "balance-sheet"
        ? "Balance Sheet"
        : "Trial Balance";

  const exportExcel = async () => {
    try {
      await request(`/financial-statements/export${query}`);
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet([
        { Section: reportName, Code: "", Account: periodLabel, Amount: "" },
        ...exportRows(),
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, reportName.slice(0, 31));
      XLSX.writeFile(workbook, `${reportName.replace(/[^A-Za-z]+/g, "_")}.xlsx`);
    } catch (reason: any) {
      toast.error(reason?.message || "Unable to export report.");
    }
  };

  const downloadPdf = async () => {
    try {
      await request(`/financial-statements/download${query}`);
      const popup = window.open("", "_blank");
      if (!popup) throw Error("Allow pop-ups to download the PDF report.");
      popup.opener = null;
      const rows = exportRows();
      const columns = Object.keys(rows[0] || {});
      const escape = (value: unknown) =>
        String(value ?? "").replace(
          /[&<>\"]/g,
          (char) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '\"': "&quot;",
            })[char] || char,
        );
      popup.document.write(
        `<!doctype html><html><head><title>${escape(reportName)}</title><style>body{font:14px Arial;padding:28px;color:#172b26}h1{margin-bottom:4px}p{color:#607b73}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border:1px solid #cbd8d4;padding:8px;text-align:left}th{background:#edf4f2}@media print{button{display:none}}</style></head><body><h1>${escape(reportName)}</h1><p>${escape(periodLabel)}</p><table><thead><tr>${columns.map((c) => `<th>${escape(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((row: any) => `<tr>${columns.map((c) => `<td>${escape(row[c])}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`,
      );
      popup.document.close();
    } catch (reason: any) {
      toast.error(reason?.message || "Unable to prepare PDF report.");
    }
  };

  if (!can("accounts.financial_statements.view")) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <h3 className="font-semibold">Access Denied</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            You do not have permission to view Financial Statements.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Filter & Action Toolbar */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              Presets:
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              onClick={() => applyPreset("this-month")}
            >
              This Month
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              onClick={() => applyPreset("this-fy")}
            >
              Current FY
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              onClick={() => applyPreset("all")}
            >
              All Time
            </Button>
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-2">
            {can("accounts.financial_statements.export") && (
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3.5 rounded-xl border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 font-semibold text-xs sm:text-sm shadow-2xs cursor-pointer"
                onClick={() => void exportExcel()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
                )}
                Export XLSX
              </Button>
            )}
            {can("accounts.financial_statements.download") && (
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3.5 rounded-xl border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs sm:text-sm shadow-2xs cursor-pointer"
                onClick={() => void downloadPdf()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4 text-slate-600" />
                )}
                Download PDF
              </Button>
            )}
          </div>
        </div>

        {/* Custom Date Filter Inputs */}
        <div className="grid gap-3 sm:grid-cols-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <Label
              htmlFor="statement-from"
              className="text-xs font-semibold text-slate-600 dark:text-slate-400"
            >
              From Date
            </Label>
            <Input
              id="statement-from"
              type="date"
              className="h-9 rounded-lg"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="statement-to"
              className="text-xs font-semibold text-slate-600 dark:text-slate-400"
            >
              To Date
            </Label>
            <Input
              id="statement-to"
              type="date"
              className="h-9 rounded-lg"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
          Calculating financial statements...
        </div>
      ) : (
        <Tabs value={report} onValueChange={setReport} className="space-y-5">
          {/* Segmented Tab List */}
          <TabsList className="grid h-12 w-full grid-cols-3 rounded-2xl bg-slate-100/90 dark:bg-slate-800/80 p-1.5 border border-slate-200/70 dark:border-slate-700/60 shadow-xs">
            <TabsTrigger
              value="profit-loss"
              className="rounded-xl font-bold text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm cursor-pointer"
            >
              <TrendingUp className="mr-2 h-4 w-4 text-emerald-500" />
              Profit & Loss
            </TabsTrigger>
            <TabsTrigger
              value="balance-sheet"
              className="rounded-xl font-bold text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm cursor-pointer"
            >
              <Building2 className="mr-2 h-4 w-4 text-blue-500" />
              Balance Sheet
            </TabsTrigger>
            <TabsTrigger
              value="trial-balance"
              className="rounded-xl font-bold text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm cursor-pointer"
            >
              <Scale className="mr-2 h-4 w-4 text-purple-500" />
              Trial Balance
            </TabsTrigger>
          </TabsList>

          {/* Statement Period Badge */}
          <div className="text-center">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {reportName} Statement
            </h2>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
              Period: {periodLabel}
            </p>
          </div>

          {/* ======================================================== */}
          {/* 1. PROFIT & LOSS VIEW */}
          {/* ======================================================== */}
          <TabsContent value="profit-loss" className="space-y-5 mt-0">
            {/* Executive KPI Metric Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Revenue Metric */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Revenue
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                    {money(calculated.totalRevenue)}
                  </div>
                  <span className="text-[11px] font-medium text-slate-500">
                    {calculated.revenue.length} income line(s)
                  </span>
                </div>
                <div className="h-11 w-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ring-4 ring-emerald-500/5">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>

              {/* Expenses Metric */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Expenses
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                    {money(calculated.totalExpenses)}
                  </div>
                  <span className="text-[11px] font-medium text-slate-500">
                    {calculated.expenses.length} expense category(s)
                  </span>
                </div>
                <div className="h-11 w-11 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 ring-4 ring-rose-500/5">
                  <TrendingDown className="h-5 w-5" />
                </div>
              </div>

              {/* Net Result Metric */}
              <div
                className={`rounded-2xl border p-4 sm:p-5 shadow-xs flex items-center justify-between ${
                  calculated.netIncome >= 0
                    ? "border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/20"
                    : "border-rose-500/30 bg-rose-50/30 dark:bg-rose-950/20"
                }`}
              >
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    {calculated.netIncome >= 0 ? "Net Profit" : "Net Loss"}
                  </span>
                  <div
                    className={`text-xl sm:text-2xl font-black font-mono mt-0.5 ${
                      calculated.netIncome >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {money(Math.abs(calculated.netIncome))}
                  </div>
                  <span
                    className={`text-[11px] font-bold ${
                      calculated.netIncome >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {calculated.netIncome >= 0 ? "Profitable Period" : "Operating Deficit"}
                  </span>
                </div>
                <div
                  className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ring-4 ${
                    calculated.netIncome >= 0
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20 ring-emerald-500/10"
                      : "bg-rose-600 text-white shadow-md shadow-rose-600/20 ring-rose-500/10"
                  }`}
                >
                  {calculated.netIncome >= 0 ? (
                    <TrendingUp className="h-5 w-5" />
                  ) : (
                    <TrendingDown className="h-5 w-5" />
                  )}
                </div>
              </div>
            </div>

            {/* Revenue & Expenses 2-Column Ledger Cards */}
            <div className="grid gap-5 lg:grid-cols-2">
              <StatementSection
                title="Revenue"
                subtitle="Income from sales & services"
                icon={TrendingUp}
                accent="from-emerald-400 via-teal-500 to-cyan-500"
                count={calculated.revenue.length}
                total={calculated.totalRevenue}
                totalLabel="Total Revenue"
              >
                <AccountRows rows={calculated.revenue} />
              </StatementSection>

              <StatementSection
                title="Expenses"
                subtitle="Operating, administrative & financial charges"
                icon={TrendingDown}
                accent="from-rose-500 via-pink-500 to-amber-500"
                count={calculated.expenses.length}
                total={calculated.totalExpenses}
                totalLabel="Total Expenses"
              >
                <AccountRows rows={calculated.expenses} />
              </StatementSection>
            </div>

            {/* High-Impact Luxury Net Result Banner */}
            <div
              className={`relative overflow-hidden rounded-2xl p-5 sm:p-6 border-2 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all ${
                calculated.netIncome >= 0
                  ? "bg-gradient-to-r from-emerald-50/90 via-teal-50/50 to-emerald-50/90 dark:from-emerald-950/40 dark:via-teal-950/20 dark:to-emerald-950/30 border-emerald-500/30"
                  : "bg-gradient-to-r from-rose-50/90 via-amber-50/40 to-rose-50/90 dark:from-rose-950/40 dark:via-amber-950/20 dark:to-rose-950/30 border-rose-500/30"
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-md ring-4 shrink-0 ${
                    calculated.netIncome >= 0
                      ? "bg-emerald-600 text-white shadow-emerald-500/20 ring-emerald-500/10"
                      : "bg-rose-600 text-white shadow-rose-500/20 ring-rose-500/10"
                  }`}
                >
                  {calculated.netIncome >= 0 ? (
                    <TrendingUp className="h-6 w-6" />
                  ) : (
                    <TrendingDown className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                      {calculated.netIncome >= 0 ? "Net Profit" : "Net Loss"}
                    </h3>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        calculated.netIncome >= 0
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20"
                      }`}
                    >
                      {calculated.netIncome >= 0 ? "Profitable Period" : "Operating Deficit"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Calculated as Total Revenue ({money(calculated.totalRevenue)}) minus Total
                    Expenses ({money(calculated.totalExpenses)})
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  {calculated.netIncome >= 0 ? "Total Net Profit" : "Total Net Loss"}
                </span>
                <div
                  className={`text-2xl sm:text-3xl font-black tracking-tight font-mono mt-0.5 ${
                    calculated.netIncome >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {money(Math.abs(calculated.netIncome))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ======================================================== */}
          {/* 2. BALANCE SHEET VIEW */}
          {/* ======================================================== */}
          <TabsContent value="balance-sheet" className="space-y-5 mt-0">
            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Assets
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                    {money(calculated.totalAssets)}
                  </div>
                  <span className="text-[11px] font-medium text-slate-500">
                    {calculated.assets.length} asset accounts
                  </span>
                </div>
                <div className="h-11 w-11 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Wallet className="h-5 w-5" />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Liabilities
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                    {money(calculated.totalLiabilities)}
                  </div>
                  <span className="text-[11px] font-medium text-slate-500">
                    {calculated.liabilities.length} liability accounts
                  </span>
                </div>
                <div className="h-11 w-11 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <CreditCard className="h-5 w-5" />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Equity
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                    {money(calculated.totalEquity)}
                  </div>
                  <span className="text-[11px] font-medium text-slate-500">
                    {calculated.equity.length} equity accounts
                  </span>
                </div>
                <div className="h-11 w-11 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Sections */}
            <div className="grid gap-5 lg:grid-cols-2">
              <StatementSection
                title="Assets"
                subtitle="Current, liquid & non-current resources"
                icon={Wallet}
                accent="from-blue-500 via-cyan-500 to-teal-500"
                count={calculated.assets.length}
                total={calculated.totalAssets}
                totalLabel="Total Assets"
              >
                <AccountRows rows={calculated.assets} />
              </StatementSection>

              <div className="space-y-5">
                <StatementSection
                  title="Liabilities"
                  subtitle="Debts, payables & financial obligations"
                  icon={CreditCard}
                  accent="from-amber-500 via-orange-500 to-rose-500"
                  count={calculated.liabilities.length}
                  total={calculated.totalLiabilities}
                  totalLabel="Total Liabilities"
                >
                  <AccountRows rows={calculated.liabilities} />
                </StatementSection>

                <StatementSection
                  title="Equity"
                  subtitle="Owner's equity, capital & reserves"
                  icon={Building2}
                  accent="from-purple-500 via-indigo-500 to-blue-500"
                  count={calculated.equity.length}
                  total={calculated.totalEquity}
                  totalLabel="Total Equity"
                >
                  <AccountRows rows={calculated.equity} />
                </StatementSection>
              </div>
            </div>

            {/* Balance Sheet Verification Cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <Scale className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold">
                      Liabilities + Equity
                    </p>
                    <p className="text-lg sm:text-xl font-black font-mono text-slate-900 dark:text-slate-100">
                      {money(calculated.totalLiabilities + calculated.totalEquity)}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`rounded-2xl border p-4 sm:p-5 flex items-center justify-between shadow-xs ${
                  Math.abs(calculated.balanceDifference) <= 0.01
                    ? "border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200"
                    : "border-rose-500/30 bg-rose-50/40 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                      Math.abs(calculated.balanceDifference) <= 0.01
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-rose-500/10 text-rose-600"
                    }`}
                  >
                    {Math.abs(calculated.balanceDifference) <= 0.01 ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <AlertCircle className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold">
                      {Math.abs(calculated.balanceDifference) <= 0.01
                        ? "Balance Sheet Status"
                        : "Balance Difference"}
                    </p>
                    <p className="text-lg sm:text-xl font-black font-mono">
                      {Math.abs(calculated.balanceDifference) <= 0.01
                        ? "Balanced & Reconciled (₹0.00)"
                        : money(calculated.balanceDifference)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ======================================================== */}
          {/* 3. TRIAL BALANCE VIEW */}
          {/* ======================================================== */}
          <TabsContent value="trial-balance" className="space-y-5 mt-0">
            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Debits
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                    {money(calculated.totalDebit)}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <Scale className="h-5 w-5" />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Credits
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                    {money(calculated.totalCredit)}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
                  <Scale className="h-5 w-5" />
                </div>
              </div>

              <div
                className={`rounded-2xl border p-4 sm:p-5 shadow-xs flex items-center justify-between ${
                  Math.abs(calculated.trialDifference) <= 0.01
                    ? "border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200"
                    : "border-rose-500/30 bg-rose-50/40 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200"
                }`}
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider block">
                    {Math.abs(calculated.trialDifference) <= 0.01
                      ? "Trial Balance Status"
                      : "Difference"}
                  </span>
                  <div className="text-lg sm:text-xl font-black font-mono mt-0.5">
                    {Math.abs(calculated.trialDifference) <= 0.01
                      ? "Fully Balanced"
                      : money(calculated.trialDifference)}
                  </div>
                </div>
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                    Math.abs(calculated.trialDifference) <= 0.01
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-rose-500/10 text-rose-600"
                  }`}
                >
                  {Math.abs(calculated.trialDifference) <= 0.01 ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <AlertCircle className="h-5 w-5" />
                  )}
                </div>
              </div>
            </div>

            {/* Trial Balance Table */}
            <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs accounts-scroll">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800/90 font-bold border-b border-slate-200 dark:border-slate-700 backdrop-blur-xs">
                  <tr>
                    <th className="px-5 py-3.5 text-left font-bold text-xs uppercase tracking-wider text-slate-500">
                      Code
                    </th>
                    <th className="px-5 py-3.5 text-left font-bold text-xs uppercase tracking-wider text-slate-500">
                      Account Name
                    </th>
                    <th className="px-5 py-3.5 text-left font-bold text-xs uppercase tracking-wider text-slate-500">
                      Type
                    </th>
                    <th className="px-5 py-3.5 text-right font-bold text-xs uppercase tracking-wider text-slate-500">
                      Debit
                    </th>
                    <th className="px-5 py-3.5 text-right font-bold text-xs uppercase tracking-wider text-slate-500">
                      Credit
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {calculated.trial.map((account) => (
                    <tr
                      key={account.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-5 py-3 font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
                        {account.accountCode}
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {account.accountName}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {account.accountType}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {money(account.trialDebit)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {money(account.trialCredit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800/80 font-bold">
                  <tr>
                    <td className="px-5 py-3.5 font-bold uppercase text-xs text-slate-600 dark:text-slate-300" colSpan={3}>
                      Total Summary
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-900 dark:text-slate-100 font-bold">
                      {money(calculated.totalDebit)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-900 dark:text-slate-100 font-bold">
                      {money(calculated.totalCredit)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      className={`px-5 py-3 text-xs font-bold ${
                        Math.abs(calculated.trialDifference) <= 0.01
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                      colSpan={5}
                    >
                      Difference: {money(calculated.trialDifference)}{" "}
                      {Math.abs(calculated.trialDifference) <= 0.01 ? "✓ Reconciled" : "⚠️ Needs Review"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
