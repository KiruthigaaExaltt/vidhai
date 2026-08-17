import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
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
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount(value));
const displayBalance = (account: Account) =>
  ["Liability", "Equity", "Revenue"].includes(account.accountType)
    ? -amount(account.periodBalance)
    : amount(account.periodBalance);
const byCode = (left: Account, right: Account) => left.accountCode.localeCompare(right.accountCode, undefined, { numeric: true });

function AccountRows({ rows }: { rows: Account[] }) {
  if (!rows.length) return <div className="p-5 text-center text-sm text-muted-foreground">No accounts.</div>;
  return (
    <div className="divide-y">
      {rows.map((account) => (
        <div key={account.id} className="grid grid-cols-[90px_1fr_auto] gap-3 px-4 py-2.5 text-sm">
          <span className="font-mono text-muted-foreground">{account.accountCode}</span>
          <span>{account.accountName}</span>
          <span className="font-medium tabular-nums">{money(displayBalance(account))}</span>
        </div>
      ))}
    </div>
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
    return () => { active = false; };
  }, [can, dateFrom, dateTo, query, request]);

  const calculated = useMemo(() => {
    const typed = (type: Account["accountType"]) => accounts.filter((account) => account.accountType === type).sort(byCode);
    const revenue = typed("Revenue");
    const expenses = typed("Expense");
    const assets = typed("Asset");
    const liabilities = typed("Liability");
    const equity = typed("Equity");
    const sum = (rows: Account[]) => amount(rows.reduce((total, account) => total + displayBalance(account), 0));
    const totalRevenue = sum(revenue);
    const totalExpenses = sum(expenses);
    const netIncome = amount(totalRevenue - totalExpenses);
    const currentPeriodEarnings = equity.some((account) => account.accountCode === "3200") ? 0 : netIncome;
    const totalAssets = sum(assets);
    const totalLiabilities = sum(liabilities);
    const totalEquity = amount(sum(equity) + currentPeriodEarnings);
    const balanceDifference = amount(totalAssets - totalLiabilities - totalEquity);
    const trial = [...accounts].sort(byCode).map((account) => {
      const net = displayBalance(account);
      return {
        ...account,
        trialDebit: amount(account.periodDebit) > 0 ? amount(account.periodDebit) : Math.max(0, net),
        trialCredit: amount(account.periodCredit) > 0 ? amount(account.periodCredit) : Math.max(0, -net),
      };
    });
    const totalDebit = amount(trial.reduce((total, account) => total + account.trialDebit, 0));
    const totalCredit = amount(trial.reduce((total, account) => total + account.trialCredit, 0));
    return { revenue, expenses, assets, liabilities, equity, totalRevenue, totalExpenses, netIncome, currentPeriodEarnings, totalAssets, totalLiabilities, totalEquity, balanceDifference, trial, totalDebit, totalCredit, trialDifference: amount(totalDebit - totalCredit) };
  }, [accounts]);

  const periodLabel = dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : dateFrom ? `From ${dateFrom}` : dateTo ? `Up to ${dateTo}` : `As of ${new Date().toLocaleDateString("en-IN")}`;
  const exportRows = () => {
    if (report === "profit-loss") return [
      ...calculated.revenue.map((x) => ({ Section: "Revenue", Code: x.accountCode, Account: x.accountName, Amount: displayBalance(x) })),
      ...calculated.expenses.map((x) => ({ Section: "Expense", Code: x.accountCode, Account: x.accountName, Amount: displayBalance(x) })),
      { Section: "Total Revenue", Code: "", Account: "", Amount: calculated.totalRevenue },
      { Section: "Total Expense", Code: "", Account: "", Amount: calculated.totalExpenses },
      { Section: calculated.netIncome >= 0 ? "Net Profit" : "Net Loss", Code: "", Account: "", Amount: Math.abs(calculated.netIncome) },
    ];
    if (report === "balance-sheet") return [
      ...calculated.assets.map((x) => ({ Section: "Asset", Code: x.accountCode, Account: x.accountName, Amount: displayBalance(x) })),
      ...calculated.liabilities.map((x) => ({ Section: "Liability", Code: x.accountCode, Account: x.accountName, Amount: displayBalance(x) })),
      ...calculated.equity.map((x) => ({ Section: "Equity", Code: x.accountCode, Account: x.accountName, Amount: displayBalance(x) })),
      ...(calculated.currentPeriodEarnings ? [{ Section: "Equity", Code: "CYPL", Account: "Current Period Earnings", Amount: calculated.currentPeriodEarnings }] : []),
      { Section: "Total Assets", Code: "", Account: "", Amount: calculated.totalAssets },
      { Section: "Liabilities + Equity", Code: "", Account: "", Amount: amount(calculated.totalLiabilities + calculated.totalEquity) },
      { Section: "Difference", Code: "", Account: "", Amount: calculated.balanceDifference },
    ];
    return calculated.trial.map((x) => ({ Code: x.accountCode, Account: x.accountName, Type: x.accountType, Debit: x.trialDebit, Credit: x.trialCredit }));
  };
  const reportName = report === "profit-loss" ? "Profit & Loss" : report === "balance-sheet" ? "Balance Sheet" : "Trial Balance";

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
    } catch (reason: any) { toast.error(reason?.message || "Unable to export report."); }
  };
  const downloadPdf = async () => {
    try {
      await request(`/financial-statements/download${query}`);
      const popup = window.open("", "_blank");
      if (!popup) throw Error("Allow pop-ups to download the PDF report.");
      popup.opener = null;
      const rows = exportRows();
      const columns = Object.keys(rows[0] || {});
      const escape = (value: unknown) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[char] || char);
      popup.document.write(`<!doctype html><html><head><title>${escape(reportName)}</title><style>body{font:14px Arial;padding:28px;color:#172b26}h1{margin-bottom:4px}p{color:#607b73}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border:1px solid #cbd8d4;padding:8px;text-align:left}th{background:#edf4f2}@media print{button{display:none}}</style></head><body><h1>${escape(reportName)}</h1><p>${escape(periodLabel)}</p><table><thead><tr>${columns.map((c) => `<th>${escape(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((row: any) => `<tr>${columns.map((c) => `<td>${escape(row[c])}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
      popup.document.close();
    } catch (reason: any) { toast.error(reason?.message || "Unable to prepare PDF report."); }
  };

  if (!can("accounts.financial_statements.view")) return <Card><CardContent className="p-8 text-center"><h3 className="font-semibold">Access Denied</h3><p className="mt-1 text-sm text-muted-foreground">You do not have permission to view Financial Statements.</p></CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="statement-from">From date</Label><Input id="statement-from" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="statement-to">To date</Label><Input id="statement-to" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("accounts.financial_statements.export") && <Button variant="outline" onClick={() => void exportExcel()} disabled={loading}><FileSpreadsheet className="mr-2 h-4 w-4" />Export XLSX</Button>}
          {can("accounts.financial_statements.download") && <Button variant="outline" onClick={() => void downloadPdf()} disabled={loading}><Download className="mr-2 h-4 w-4" />Download PDF</Button>}
        </div>
      </div>
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {loading ? <div className="flex min-h-56 items-center justify-center rounded-lg border bg-white text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading financial statements...</div> : (
        <Tabs value={report} onValueChange={setReport}>
          <TabsList className="grid h-auto w-full grid-cols-1 sm:grid-cols-3"><TabsTrigger value="profit-loss">Profit & Loss</TabsTrigger><TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger><TabsTrigger value="trial-balance">Trial Balance</TabsTrigger></TabsList>
          <div className="py-3 text-center"><h2 className="text-lg font-semibold">{reportName}</h2><p className="text-sm text-muted-foreground">{periodLabel}</p></div>
          <TabsContent value="profit-loss" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2"><StatementSection title="Revenue"><AccountRows rows={calculated.revenue} /><Total label="Total Revenue" value={calculated.totalRevenue} /></StatementSection><StatementSection title="Expenses"><AccountRows rows={calculated.expenses} /><Total label="Total Expenses" value={calculated.totalExpenses} /></StatementSection></div>
            <Total label={calculated.netIncome >= 0 ? "Net Profit" : "Net Loss"} value={Math.abs(calculated.netIncome)} state={calculated.netIncome >= 0} />
          </TabsContent>
          <TabsContent value="balance-sheet" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2"><StatementSection title="Assets"><AccountRows rows={calculated.assets} /><Total label="Total Assets" value={calculated.totalAssets} /></StatementSection><div className="space-y-4"><StatementSection title="Liabilities"><AccountRows rows={calculated.liabilities} /><Total label="Total Liabilities" value={calculated.totalLiabilities} /></StatementSection><StatementSection title="Equity"><AccountRows rows={calculated.equity} />{calculated.currentPeriodEarnings !== 0 && <div className="grid grid-cols-[90px_1fr_auto] gap-3 border-t px-4 py-2.5 text-sm"><span className="font-mono">CYPL</span><span>Current Period Earnings</span><b>{money(calculated.currentPeriodEarnings)}</b></div>}<Total label="Total Equity" value={calculated.totalEquity} /></StatementSection></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><Total label="Liabilities + Equity" value={calculated.totalLiabilities + calculated.totalEquity} /><Total label="Balance Sheet Difference" value={calculated.balanceDifference} state={Math.abs(calculated.balanceDifference) <= 0.01} /></div>
          </TabsContent>
          <TabsContent value="trial-balance"><div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="px-4 py-3 text-left">Account Code</th><th className="px-4 py-3 text-left">Account Name</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-right">Debit</th><th className="px-4 py-3 text-right">Credit</th></tr></thead><tbody className="divide-y">{calculated.trial.map((account) => <tr key={account.id}><td className="px-4 py-2.5 font-mono">{account.accountCode}</td><td className="px-4 py-2.5">{account.accountName}</td><td className="px-4 py-2.5">{account.accountType}</td><td className="px-4 py-2.5 text-right tabular-nums">{money(account.trialDebit)}</td><td className="px-4 py-2.5 text-right tabular-nums">{money(account.trialCredit)}</td></tr>)}</tbody><tfoot className="border-t-2 bg-muted/30 font-semibold"><tr><td className="px-4 py-3" colSpan={3}>Total</td><td className="px-4 py-3 text-right">{money(calculated.totalDebit)}</td><td className="px-4 py-3 text-right">{money(calculated.totalCredit)}</td></tr><tr><td className={Math.abs(calculated.trialDifference) <= 0.01 ? "px-4 py-3 text-emerald-700" : "px-4 py-3 text-red-600"} colSpan={5}>Difference: {money(calculated.trialDifference)}</td></tr></tfoot></table></div></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function StatementSection({ title, children }: { title: string; children: React.ReactNode }) { return <Card><CardHeader className="border-b py-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="p-0">{children}</CardContent></Card>; }
function Total({ label, value, state }: { label: string; value: number; state?: boolean }) { return <div className={`flex items-center justify-between rounded-md border bg-muted/30 px-4 py-3 font-semibold ${state === true ? "text-emerald-700" : state === false ? "text-red-600" : ""}`}><span>{label}</span><span className="tabular-nums">{money(value)}</span></div>; }
