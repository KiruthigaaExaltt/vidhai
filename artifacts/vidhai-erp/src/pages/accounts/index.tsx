import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { BookOpen, CreditCard, Plus, RefreshCw, Trash2 } from "lucide-react";
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
      if (!r.ok)
        throw Error(
          (await r.json().catch(() => ({}))).error || "Request failed",
        );
      return r.status === 204 ? null : r.json();
    });
const numberValue = (value: any) => {
  const parsed = Number(
    value?.$numberDecimal ?? value?.toString?.() ?? value ?? 0,
  );
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
    [submitting, setSubmitting] = useState(false),
    [manualType, setManualType] = useState<
      "account" | "journal" | "ap" | "ar" | null
    >(null),
    [manual, setManual] = useState<any>({}),
    [settlement, setSettlement] = useState<{
      kind: "ap" | "ar";
      row: any;
    } | null>(null),
    [settlementAmount, setSettlementAmount] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const openManual = (
    type: "account" | "journal" | "ap" | "ar",
    seed: any = {},
  ) => {
    setManualType(type);
    setManual({
      entryDate: today,
      billDate: today,
      dueDate: today,
      invoiceDate: today,
      accountType: "Asset",
      entryType: type === "ap" ? "Bill" : "Invoice",
      amount: "",
      paidAmount: "0",
      receivedAmount: "0",
      adjustedAmount: "0",
      debit: "",
      credit: "",
      ...seed,
    });
  };
  const setManualField = (key: string, value: any) =>
    setManual((current: any) => ({ ...current, [key]: value }));
  const submitManual = async () => {
    if (!manualType) return;
    setSubmitting(true);
    setError("");
    try {
      if (manualType === "account")
        await api("/coa", {
          method: "POST",
          body: JSON.stringify({
            accountCode: manual.accountCode?.trim(),
            accountName: manual.accountName?.trim(),
            accountType: manual.accountType,
            currentBalance: numberValue(manual.currentBalance),
            description: manual.description || "",
            isActive: true,
          }),
        });
      if (manualType === "journal") {
        const debitAccount = coa.find(
          (account) => String(account.id) === String(manual.debitAccountId),
        );
        const creditAccount = coa.find(
          (account) => String(account.id) === String(manual.creditAccountId),
        );
        const amount = numberValue(manual.amount);
        if (
          !debitAccount ||
          !creditAccount ||
          debitAccount.id === creditAccount.id ||
          amount <= 0
        )
          throw Error(
            "Choose two different accounts and enter a positive amount.",
          );
        await api("/journal-entries", {
          method: "POST",
          body: JSON.stringify({
            entryDate: manual.entryDate,
            reference: manual.reference?.trim(),
            description: manual.description?.trim(),
            sourceType: "Manual",
            lines: [
              {
                accountId: debitAccount.id,
                accountCode: debitAccount.accountCode,
                accountName: debitAccount.accountName,
                debit: amount,
                credit: 0,
                memo: manual.memo || "",
              },
              {
                accountId: creditAccount.id,
                accountCode: creditAccount.accountCode,
                accountName: creditAccount.accountName,
                debit: 0,
                credit: amount,
                memo: manual.memo || "",
              },
            ],
          }),
        });
      }
      if (manualType === "ap")
        await api("/ap", {
          method: "POST",
          body: JSON.stringify({
            vendorName: manual.vendorName?.trim(),
            billNumber: manual.billNumber?.trim(),
            againstBillNumber:
              manual.entryType === "Debit Note"
                ? manual.againstBillNumber?.trim()
                : "",
            billDate: manual.billDate,
            dueDate: manual.dueDate,
            amount: numberValue(manual.amount),
            paidAmount: numberValue(manual.paidAmount),
            adjustedAmount: numberValue(manual.adjustedAmount),
            entryType: manual.entryType,
            notes: manual.notes || "",
            sourceType: "Manual",
          }),
        });
      if (manualType === "ar")
        await api("/ar", {
          method: "POST",
          body: JSON.stringify({
            clientName: manual.clientName?.trim(),
            invoiceNumber: manual.invoiceNumber?.trim(),
            creditNoteNumber:
              manual.entryType === "Credit Note"
                ? manual.invoiceNumber?.trim()
                : "",
            linkedInvoiceNumber:
              manual.entryType === "Credit Note"
                ? manual.linkedInvoiceNumber?.trim()
                : "",
            invoiceDate: manual.invoiceDate,
            dueDate: manual.dueDate,
            amount: numberValue(manual.amount),
            receivedAmount: numberValue(manual.receivedAmount),
            adjustedAmount: numberValue(manual.adjustedAmount),
            entryType: manual.entryType,
            notes: manual.notes || "",
            sourceType: "Manual",
          }),
        });
      setManualType(null);
      setManual({});
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };
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
  const outstanding = (row: any) =>
    Math.max(
      0,
      numberValue(row.amount) -
        numberValue(row.receivedAmount) -
        numberValue(row.adjustedAmount),
    );
  const saveSettlement = async () => {
    if (!settlement) return;
    const amount = numberValue(settlementAmount);
    const field = settlement.kind === "ap" ? "paidAmount" : "receivedAmount";
    const remaining = Math.max(
      0,
      numberValue(settlement.row.amount) -
        numberValue(settlement.row[field]) -
        numberValue(settlement.row.adjustedAmount),
    );
    if (!(amount > 0) || amount > remaining + 0.009) {
      setError(
        "Enter an amount greater than zero and not more than the balance.",
      );
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api(`/${settlement.kind}/${settlement.row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          [field]: numberValue(settlement.row[field]) + amount,
        }),
      });
      setSettlement(null);
      setSettlementAmount("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };
  const openPayment = (row: any) => {
    setPaymentAr(row);
    setPaymentAmount(String(outstanding(row)));
  };
  const receivePayment = async () => {
    if (!paymentAr?.sourceId) return;
    const amount = numberValue(paymentAmount);
    if (!(amount > 0) || amount > outstanding(paymentAr) + 0.009) {
      setError(
        "Enter a payment amount greater than zero and not more than the balance.",
      );
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await salesApi("/payments", {
        method: "POST",
        body: JSON.stringify({ invoiceId: paymentAr.sourceId, amount }),
      });
      setPaymentAr(null);
      setPaymentAmount("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };
  const deleteReceivable = async (row: any) => {
    const message =
      row.sourceType === "Sales Invoice"
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
                  {c[2] ? c[2](r[c[1]], r) : String(r[c[1]] ?? "�")}
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
          <TabsContent value="coa" className="space-y-3">
            {can("accounts.chart_of_accounts.create") && (
              <div className="flex justify-end">
                <Button onClick={() => openManual("account")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Account
                </Button>
              </div>
            )}
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
          <TabsContent value="ap" className="space-y-3">
            {can("accounts.accounts_payable.create") && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button onClick={() => openManual("ap", { entryType: "Bill" })}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Bill
                </Button>
                <Button
                  variant="outline"
                  onClick={() => openManual("ap", { entryType: "Debit Note" })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Debit Note
                </Button>
              </div>
            )}
            <Tabs defaultValue="bills">
              <TabsList>
                <TabsTrigger value="bills">Pending Bills</TabsTrigger>
                <TabsTrigger value="debit-notes">Debit Notes</TabsTrigger>
              </TabsList>
              <TabsContent value="bills">
                <Table
                  rows={f(
                    ap.filter((entry) => entry.entryType !== "Debit Note"),
                  )}
                  cols={[
                    ["Vendor", "vendorName"],
                    ["Bill #", "billNumber"],
                    ["Bill Date", "billDate"],
                    ["Due Date", "dueDate"],
                    ["Amount", "amount", inr],
                    ["Paid", "paidAmount", inr],
                    ["Adjustment", "adjustedAmount", inr],
                    [
                      "Balance",
                      "balance",
                      (_value, row) =>
                        inr(
                          Math.max(
                            0,
                            numberValue(row.amount) -
                              numberValue(row.paidAmount) -
                              numberValue(row.adjustedAmount),
                          ),
                        ),
                    ],
                    ["Status", "status"],
                  ]}
                />
              </TabsContent>
              <TabsContent value="debit-notes">
                <Table
                  rows={f(
                    ap.filter((entry) => entry.entryType === "Debit Note"),
                  )}
                  cols={[
                    ["Vendor", "vendorName"],
                    ["Debit Note #", "billNumber"],
                    ["Against Bill", "againstBillNumber"],
                    ["Date", "billDate"],
                    ["Amount", "amount", inr],
                    ["Status", "status"],
                    ["Notes", "notes"],
                  ]}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
          <TabsContent value="ar" className="space-y-3">
            {can("accounts.accounts_receivable.create") && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  onClick={() => openManual("ar", { entryType: "Invoice" })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Invoice
                </Button>
                <Button
                  variant="outline"
                  onClick={() => openManual("ar", { entryType: "Credit Note" })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Credit Note
                </Button>
              </div>
            )}
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
                    [
                      "Balance",
                      "balance",
                      (_value, row) => inr(outstanding(row)),
                    ],
                    ["Status", "status"],
                    [
                      "Actions",
                      "actions",
                      (_value, row) => (
                        <div className="flex items-center gap-2">
                          {row.sourceType === "Sales Invoice" &&
                            outstanding(row) > 0 && (
                              <Button
                                size="sm"
                                onClick={() => openPayment(row)}
                                disabled={submitting}
                              >
                                <CreditCard className="mr-1 h-3.5 w-3.5" /> Pay
                              </Button>
                            )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void deleteReceivable(row)}
                            disabled={submitting}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                          </Button>
                        </div>
                      ),
                    ],
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
                    [
                      "Customer Credit",
                      "creditBalance",
                      (_value, row) =>
                        inr(
                          Math.max(
                            0,
                            numberValue(row.amount) -
                              numberValue(row.adjustedAmount),
                          ),
                        ),
                    ],
                    ["Status", "status"],
                  ]}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
          <TabsContent value="journals" className="space-y-3">
            {can("accounts.journal_entries.create") && (
              <div className="flex justify-end">
                <Button onClick={() => openManual("journal")}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Journal
                </Button>
              </div>
            )}
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
        <Dialog
          open={Boolean(manualType)}
          onOpenChange={(open) => {
            if (!open && !submitting) setManualType(null);
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {manualType === "account"
                  ? "Add Ledger Account"
                  : manualType === "journal"
                    ? "New Journal Entry"
                    : manualType === "ap"
                      ? `Add ${manual.entryType || "Payable"}`
                      : `Add ${manual.entryType || "Receivable"}`}
              </DialogTitle>
            </DialogHeader>
            {manualType && (
              <div className="grid gap-4 sm:grid-cols-2">
                {manualType === "account" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Account Code *</Label>
                      <Input
                        value={manual.accountCode || ""}
                        onChange={(e) =>
                          setManualField("accountCode", e.target.value)
                        }
                        placeholder="e.g. 6100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Account Name *</Label>
                      <Input
                        value={manual.accountName || ""}
                        onChange={(e) =>
                          setManualField("accountName", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Account Type *</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={manual.accountType}
                        onChange={(e) =>
                          setManualField("accountType", e.target.value)
                        }
                      >
                        {[
                          "Asset",
                          "Liability",
                          "Equity",
                          "Revenue",
                          "Expense",
                        ].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Opening Balance *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={manual.currentBalance || ""}
                        onChange={(e) =>
                          setManualField("currentBalance", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Description</Label>
                      <Input
                        value={manual.description || ""}
                        onChange={(e) =>
                          setManualField("description", e.target.value)
                        }
                      />
                    </div>
                  </>
                )}
                {manualType === "journal" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Date *</Label>
                      <Input
                        type="date"
                        value={manual.entryDate}
                        onChange={(e) =>
                          setManualField("entryDate", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Reference *</Label>
                      <Input
                        value={manual.reference || ""}
                        onChange={(e) =>
                          setManualField("reference", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Description *</Label>
                      <Input
                        value={manual.description || ""}
                        onChange={(e) =>
                          setManualField("description", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Debit Account *</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={manual.debitAccountId || ""}
                        onChange={(e) =>
                          setManualField("debitAccountId", e.target.value)
                        }
                      >
                        <option value="">Select account</option>
                        {coa.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.accountCode} � {a.accountName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Credit Account *</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={manual.creditAccountId || ""}
                        onChange={(e) =>
                          setManualField("creditAccountId", e.target.value)
                        }
                      >
                        <option value="">Select account</option>
                        {coa.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.accountCode} � {a.accountName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Amount *</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={manual.amount || ""}
                        onChange={(e) =>
                          setManualField("amount", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Memo</Label>
                      <Input
                        value={manual.memo || ""}
                        onChange={(e) => setManualField("memo", e.target.value)}
                      />
                    </div>
                  </>
                )}
                {manualType === "ap" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Entry Type</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={manual.entryType}
                        onChange={(e) =>
                          setManualField("entryType", e.target.value)
                        }
                      >
                        <option>Bill</option>
                        <option>Debit Note</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Vendor *</Label>
                      <Input
                        value={manual.vendorName || ""}
                        onChange={(e) =>
                          setManualField("vendorName", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        {manual.entryType === "Debit Note"
                          ? "Debit Note #"
                          : "Bill #"}{" "}
                        *
                      </Label>
                      <Input
                        value={manual.billNumber || ""}
                        onChange={(e) =>
                          setManualField("billNumber", e.target.value)
                        }
                      />
                    </div>
                    {manual.entryType === "Debit Note" && (
                      <div className="space-y-1.5">
                        <Label>Against Bill # *</Label>
                        <Input
                          value={manual.againstBillNumber || ""}
                          onChange={(e) =>
                            setManualField("againstBillNumber", e.target.value)
                          }
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label>Bill Date *</Label>
                      <Input
                        type="date"
                        value={manual.billDate}
                        onChange={(e) =>
                          setManualField("billDate", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Due Date *</Label>
                      <Input
                        type="date"
                        value={manual.dueDate}
                        onChange={(e) =>
                          setManualField("dueDate", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Amount *</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={manual.amount || ""}
                        onChange={(e) =>
                          setManualField("amount", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Paid Amount</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={manual.paidAmount || "0"}
                        onChange={(e) =>
                          setManualField("paidAmount", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Adjusted Amount</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={manual.adjustedAmount || "0"}
                        onChange={(e) =>
                          setManualField("adjustedAmount", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notes</Label>
                      <Input
                        value={manual.notes || ""}
                        onChange={(e) =>
                          setManualField("notes", e.target.value)
                        }
                      />
                    </div>
                  </>
                )}
                {manualType === "ar" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Entry Type</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={manual.entryType}
                        onChange={(e) =>
                          setManualField("entryType", e.target.value)
                        }
                      >
                        <option>Invoice</option>
                        <option>Credit Note</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Customer *</Label>
                      <Input
                        value={manual.clientName || ""}
                        onChange={(e) =>
                          setManualField("clientName", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        {manual.entryType === "Credit Note"
                          ? "Credit Note #"
                          : "Invoice #"}{" "}
                        *
                      </Label>
                      <Input
                        value={manual.invoiceNumber || ""}
                        onChange={(e) =>
                          setManualField("invoiceNumber", e.target.value)
                        }
                      />
                    </div>
                    {manual.entryType === "Credit Note" && (
                      <div className="space-y-1.5">
                        <Label>Linked Invoice # *</Label>
                        <Input
                          value={manual.linkedInvoiceNumber || ""}
                          onChange={(e) =>
                            setManualField(
                              "linkedInvoiceNumber",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label>Invoice Date *</Label>
                      <Input
                        type="date"
                        value={manual.invoiceDate}
                        onChange={(e) =>
                          setManualField("invoiceDate", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Due Date *</Label>
                      <Input
                        type="date"
                        value={manual.dueDate}
                        onChange={(e) =>
                          setManualField("dueDate", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Amount *</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={manual.amount || ""}
                        onChange={(e) =>
                          setManualField("amount", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Received Amount</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={manual.receivedAmount || "0"}
                        onChange={(e) =>
                          setManualField("receivedAmount", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Adjusted Amount</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={manual.adjustedAmount || "0"}
                        onChange={(e) =>
                          setManualField("adjustedAmount", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notes</Label>
                      <Input
                        value={manual.notes || ""}
                        onChange={(e) =>
                          setManualField("notes", e.target.value)
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setManualType(null)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={() => void submitManual()} disabled={submitting}>
                {submitting ? "Saving..." : "Save Entry"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(paymentAr)}
          onOpenChange={(open) => {
            if (!open && !submitting) setPaymentAr(null);
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Receive Payment</DialogTitle>
            </DialogHeader>
            {paymentAr && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/45 p-4 text-center">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Total Amount
                    </p>
                    <p className="font-semibold">{inr(paymentAr.amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Already Paid
                    </p>
                    <p className="font-semibold text-primary">
                      {inr(paymentAr.receivedAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Balance
                    </p>
                    <p className="font-semibold">
                      {inr(outstanding(paymentAr))}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payment-amount">Payment Amount (?)</Label>
                  <Input
                    id="payment-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={outstanding(paymentAr)}
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPaymentAr(null)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void receivePayment()}
                disabled={submitting || !paymentAmount}
              >
                <CreditCard className="mr-2 h-4 w-4" />{" "}
                {submitting ? "Receiving..." : "Receive Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
