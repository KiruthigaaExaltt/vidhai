import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { BookOpen, CreditCard, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react";
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
    }),
  salesApi = (p: string, o?: RequestInit) =>
    fetch(`${base}/api/sales${p}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...o,
    }).then(async (r) => {
      if (!r.ok) throw Error((await r.json().catch(() => ({}))).error || "Request failed");
      return r.status === 204 ? null : r.json();
    });
const numberValue = (value: any) => {
  const parsed = Number(value?.$numberDecimal ?? value?.toString?.() ?? value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const inr = (v: any) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(numberValue(v));
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
    [error, setError] = useState(""),
    [paymentAr, setPaymentAr] = useState<any | null>(null),
    [paymentAmount, setPaymentAmount] = useState(""),
    [adjustmentAr, setAdjustmentAr] = useState<any | null>(null),
    [adjustmentAmount, setAdjustmentAmount] = useState(""),
    [adjustmentReason, setAdjustmentReason] = useState(""),
    [submitting, setSubmitting] = useState(false);
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
    const reconciledAr = await api("/ar?limit=100").catch(() => null);
    if (reconciledAr) setAr(reconciledAr.items || []);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  const match = (x: any) =>
      JSON.stringify(x).toLowerCase().includes(search.toLowerCase()),
    f = (xs: any[]) => xs.filter(match);
  const outstanding = (row: any) => Math.max(0, numberValue(row.amount) - numberValue(row.receivedAmount) - numberValue(row.adjustedAmount));
  const openPayment = (row: any) => {
    setPaymentAr(row);
    setPaymentAmount(String(outstanding(row)));
  };
  const receivePayment = async () => {
    if (!paymentAr?.sourceId) return;
    const amount = numberValue(paymentAmount);
    if (!(amount > 0) || amount > outstanding(paymentAr) + 0.009) {
      setError("Enter a payment amount greater than zero and not more than the balance.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await salesApi("/payments", { method: "POST", body: JSON.stringify({ invoiceId: paymentAr.sourceId, amount }) });
      setPaymentAr(null);
      setPaymentAmount("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };
  const openAdjustment = (row: any) => {
    setAdjustmentAr(row);
    setAdjustmentAmount("");
    setAdjustmentReason("");
  };
  const saveAdjustment = async () => {
    if (!adjustmentAr?.sourceId) return;
    const amount = numberValue(adjustmentAmount);
    if (!(amount > 0) || amount > outstanding(adjustmentAr) + 0.009) {
      setError("Enter an adjustment greater than zero and not more than the balance.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await salesApi("/receivable-adjustments", { method: "POST", body: JSON.stringify({ invoiceId: adjustmentAr.sourceId, amount, reason: adjustmentReason || "Receivable adjustment" }) });
      setAdjustmentAr(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };
  const deleteReceivable = async (row: any) => {
    const message = row.sourceType === "Sales Invoice"
      ? `Cancel invoice ${row.invoiceNumber} and remove its receivable and accounting entries?`
      : `Delete receivable ${row.invoiceNumber}?`;
    if (!window.confirm(message)) return;
    setSubmitting(true);
    setError("");
    try {
      if (row.sourceType === "Sales Invoice" && row.sourceId)
        await salesApi(`/invoices/${row.sourceId}/cancel`, { method: "POST" });
      else await api(`/ar/${row.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };
  const Table = ({
    rows,
    cols,
  }: {
    rows: any[];
    cols: [string, string, ((v: any, row: any) => React.ReactNode)?][];
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
                  {c[2] ? c[2](r[c[1]], r) : String(r[c[1]] ?? "—")}
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
                ["Credits", "credited", inr],
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
            <Tabs defaultValue="invoices" className="space-y-3">
              <TabsList>
                <TabsTrigger value="invoices">Pending Invoices</TabsTrigger>
                <TabsTrigger value="credit-notes">Credit Notes</TabsTrigger>
              </TabsList>
              <TabsContent value="invoices">
            <Table
              rows={f(ar.filter((row) => row.entryType !== "Credit Note"))}
              cols={[
                ["Invoice", "invoiceNumber"],
                ["Customer", "clientName"],
                ["Due", "dueDate"],
                ["Amount", "amount", inr],
                ["Received", "receivedAmount", inr],
                ["Adjusted", "adjustedAmount", inr],
                ["Balance", "balance", (_value, row) => inr(outstanding(row))],
                ["Status", "status"],
                ["Actions", "actions", (_value, row) => (
                  <div className="flex items-center gap-2">
                    {row.sourceType === "Sales Invoice" && outstanding(row) > 0 && (
                      <Button size="sm" onClick={() => openPayment(row)} disabled={submitting}>
                        <CreditCard className="mr-1 h-3.5 w-3.5" /> Pay
                      </Button>
                    )}
                    {row.sourceType === "Sales Invoice" && outstanding(row) > 0 && (
                      <Button size="sm" variant="outline" onClick={() => openAdjustment(row)} disabled={submitting}>
                        <SlidersHorizontal className="mr-1 h-3.5 w-3.5" /> Adjust
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => void deleteReceivable(row)} disabled={submitting}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                )],
              ]}
            />
              </TabsContent>
              <TabsContent value="credit-notes">
                <Table
                  rows={f(ar.filter((row) => row.entryType === "Credit Note"))}
                  cols={[
                    ["Credit Note", "creditNoteNumber"],
                    ["Original Invoice", "linkedInvoiceNumber"],
                    ["Customer", "clientName"],
                    ["Date", "invoiceDate"],
                    ["Credit Amount", "amount", inr],
                    ["Applied to Invoice", "adjustedAmount", inr],
                    ["Customer Credit", "creditBalance", (_value, row) => inr(Math.max(0, numberValue(row.amount) - numberValue(row.adjustedAmount)))],
                    ["Status", "status"],
                  ]}
                />
              </TabsContent>
            </Tabs>
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
        <Dialog open={Boolean(paymentAr)} onOpenChange={(open) => { if (!open && !submitting) setPaymentAr(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Receive Payment</DialogTitle>
            </DialogHeader>
            {paymentAr && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/45 p-4 text-center">
                  <div><p className="text-[10px] uppercase text-muted-foreground">Total Amount</p><p className="font-semibold">{inr(paymentAr.amount)}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">Already Paid</p><p className="font-semibold text-primary">{inr(paymentAr.receivedAmount)}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">Balance</p><p className="font-semibold">{inr(outstanding(paymentAr))}</p></div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payment-amount">Payment Amount (₹)</Label>
                  <Input id="payment-amount" type="number" min="0.01" step="0.01" max={outstanding(paymentAr)} value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPaymentAr(null)} disabled={submitting}>Cancel</Button>
              <Button onClick={() => void receivePayment()} disabled={submitting || !paymentAmount}>
                <CreditCard className="mr-2 h-4 w-4" /> {submitting ? "Receiving..." : "Receive Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={Boolean(adjustmentAr)} onOpenChange={(open) => { if (!open && !submitting) setAdjustmentAr(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Adjust Receivable</DialogTitle></DialogHeader>
            {adjustmentAr && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/45 p-4 text-center">
                  <div><p className="text-[10px] uppercase text-muted-foreground">Invoice</p><p className="font-semibold">{inr(adjustmentAr.amount)}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">Adjusted</p><p className="font-semibold text-primary">{inr(adjustmentAr.adjustedAmount)}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">Balance</p><p className="font-semibold">{inr(outstanding(adjustmentAr))}</p></div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adjustment-amount">Adjustment Amount (₹)</Label>
                  <Input id="adjustment-amount" type="number" min="0.01" step="0.01" max={outstanding(adjustmentAr)} value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adjustment-reason">Reason</Label>
                  <Input id="adjustment-reason" placeholder="Discount, write-off, settlement..." value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdjustmentAr(null)} disabled={submitting}>Cancel</Button>
              <Button onClick={() => void saveAdjustment()} disabled={submitting || !adjustmentAmount}>
                <SlidersHorizontal className="mr-2 h-4 w-4" /> {submitting ? "Adjusting..." : "Apply Adjustment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
