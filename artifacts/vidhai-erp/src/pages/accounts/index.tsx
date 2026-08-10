import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, RefreshCw } from "lucide-react";
const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "",
  api = (p: string, o?: RequestInit) =>
    fetch(`${base}/api/accounts${p}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...o,
    }).then(async (r) => {
      if (!r.ok)
        throw Error(
          (await r.json().catch(() => ({}))).error || "Request failed",
        );
      return r.status === 204 ? null : r.json();
    });
const inr = (v: any) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(v || 0));
export default function Accounts() {
  const { can } = useAuth(),
    [summary, setSummary] = useState<any>({}),
    [coa, setCoa] = useState<any[]>([]),
    [journals, setJournals] = useState<any[]>([]),
    [ap, setAp] = useState<any[]>([]),
    [ar, setAr] = useState<any[]>([]),
    [customers, setCustomers] = useState<any[]>([]),
    [vendors, setVendors] = useState<any[]>([]),
    [statements, setStatements] = useState<any>({}),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    const calls = [
      ["s", "/dashboard-summary"],
      ["c", "/coa"],
      ["j", "/journal-entries?limit=100"],
      ["ap", "/ap?limit=100"],
      ["ar", "/ar?limit=100"],
      ["cu", "/customer-ledger"],
      ["v", "/vendor-ledger"],
      ["f", "/financial-statements"],
    ] as const;
    const out = await Promise.all(
      calls.map(async ([k, p]) => [
        k,
        await api(p).catch((e) => ({ __error: e.message })),
      ]),
    );
    for (const [k, v] of out) {
      if ((v as any).__error) {
        setError((v as any).__error);
        continue;
      }
      if (k === "s") setSummary(v);
      if (k === "c") setCoa(v as any[]);
      if (k === "j") setJournals((v as any).items || []);
      if (k === "ap") setAp((v as any).items || []);
      if (k === "ar") setAr((v as any).items || []);
      if (k === "cu") setCustomers(v as any[]);
      if (k === "v") setVendors(v as any[]);
      if (k === "f") setStatements(v);
    }
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  const match = (x: any) =>
      JSON.stringify(x).toLowerCase().includes(search.toLowerCase()),
    f = (xs: any[]) => xs.filter(match);
  const Table = ({
    rows,
    cols,
  }: {
    rows: any[];
    cols: [string, string, ((v: any) => React.ReactNode)?][];
  }) => (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60">
          <tr>
            {cols.map((c) => (
              <th key={c[0]} className="px-3 py-2 text-left">
                {c[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className="border-t">
              {cols.map((c) => (
                <td key={c[1]} className="px-3 py-2">
                  {c[2] ? c[2](r[c[1]]) : String(r[c[1]] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const cards = [
    ["Cash & Bank", summary.cash],
    ["Receivables", summary.receivables],
    ["Payables", summary.payables],
    ["Income", summary.income],
    ["Expenses", summary.expenses],
  ];
  return (
    <Shell>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <BookOpen />
              Accounts
            </h1>
            <p className="text-sm text-muted-foreground">
              Double-entry ledger, subledgers and financial reporting
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Reconcile
          </Button>
        </div>
        {error && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {error}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-5">
          {cards.map(([x, v]) => (
            <Card key={x}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">
                  {x}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-lg font-semibold">
                {inr(v)}
              </CardContent>
            </Card>
          ))}
        </div>
        <Input
          placeholder="Search current view..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Tabs defaultValue="dashboard">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="dashboard">Finance Dashboard</TabsTrigger>
            <TabsTrigger value="customers">Customer Ledger</TabsTrigger>
            <TabsTrigger value="vendors">Vendor Ledger</TabsTrigger>
            <TabsTrigger value="coa">Chart of Accounts</TabsTrigger>
            <TabsTrigger value="ap">AP</TabsTrigger>
            <TabsTrigger value="ar">AR</TabsTrigger>
            <TabsTrigger value="journals">Journal Entries</TabsTrigger>
            <TabsTrigger value="statements">Financial Statements</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard">
            <Card>
              <CardHeader>
                <CardTitle>Accounting overview</CardTitle>
              </CardHeader>
              <CardContent>
                Canonical balances are reconciled from posted journal lines
                whenever Accounts loads.
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="customers">
            <Table
              rows={f(customers)}
              cols={[
                ["Customer", "clientName"],
                ["Invoiced", "invoiced", inr],
                ["Received", "received", inr],
                ["Outstanding", "outstanding", inr],
              ]}
            />
          </TabsContent>
          <TabsContent value="vendors">
            <Table
              rows={f(vendors)}
              cols={[
                ["Vendor", "vendorName"],
                ["Billed", "billed", inr],
                ["Paid", "paid", inr],
                ["Outstanding", "outstanding", inr],
              ]}
            />
          </TabsContent>
          <TabsContent value="coa">
            <Table
              rows={f(coa)}
              cols={[
                ["Code", "accountCode"],
                ["Account", "accountName"],
                ["Type", "accountType"],
                ["Balance", "currentBalance", inr],
              ]}
            />
          </TabsContent>
          <TabsContent value="ap">
            <Table
              rows={f(ap)}
              cols={[
                ["Bill", "billNumber"],
                ["Vendor", "vendorName"],
                ["Due", "dueDate"],
                ["Amount", "amount", inr],
                ["Paid", "paidAmount", inr],
                ["Status", "status"],
              ]}
            />
          </TabsContent>
          <TabsContent value="ar">
            <Table
              rows={f(ar)}
              cols={[
                ["Invoice", "invoiceNumber"],
                ["Customer", "clientName"],
                ["Due", "dueDate"],
                ["Amount", "amount", inr],
                ["Received", "receivedAmount", inr],
                ["Status", "status"],
              ]}
            />
          </TabsContent>
          <TabsContent value="journals">
            <Table
              rows={f(journals)}
              cols={[
                ["Date", "entryDate"],
                ["Reference", "reference"],
                ["Description", "description"],
                ["Debit", "totalDebit", inr],
                ["Credit", "totalCredit", inr],
              ]}
            />
          </TabsContent>
          <TabsContent value="statements">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Profit & Loss</CardTitle>
                </CardHeader>
                <CardContent>
                  Net income: <b>{inr(statements?.profitAndLoss?.netIncome)}</b>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Balance Sheet</CardTitle>
                </CardHeader>
                <CardContent>
                  Current earnings:{" "}
                  <b>{inr(statements?.balanceSheet?.currentPeriodEarnings)}</b>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Trial Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  {statements?.trialBalance?.length || 0} accounts
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  );
}
