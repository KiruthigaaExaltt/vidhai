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
import {
  BookOpen,
  CreditCard,
  DollarSign,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { DataPagination } from "@/components/ui/data-pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { notifyModuleLocked } from "@/components/security/ModuleEncryptionGate";
import { FinancialStatements } from "./FinancialStatements";
import { FinanceDashboard } from "./FinanceDashboard";
const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "",
  api = (p: string, o?: RequestInit) =>
    fetch(`${base}/api/accounts${p}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...o,
    }).then(async (r) => {
      if (r.status === 423) notifyModuleLocked("ledger");
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
    }),
  flexApi = (p: string, o?: RequestInit) =>
    fetch(`${base}/api/flex${p}`, {
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
    [activeTab, setActiveTab] = useState("ap"),
    [search, setSearch] = useState(""),
    [apStatusFilter, setApStatusFilter] = useState("All"),
    [apApprovalFilter, setApApprovalFilter] = useState("All"),
    [apFromDate, setApFromDate] = useState(""),
    [apToDate, setApToDate] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [paymentAr, setPaymentAr] = useState<any | null>(null),
    [paymentAmount, setPaymentAmount] = useState(""),
    [arFromDate, setArFromDate] = useState(""),
    [arToDate, setArToDate] = useState(""),
    [arCustomer, setArCustomer] = useState("All"),
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
  const [listPaging, setListPaging] = useState<
    Record<"j" | "ap" | "ar", { page: number; size: number }>
  >({
    j: { page: 1, size: 10 },
    ap: { page: 1, size: 10 },
    ar: { page: 1, size: 10 },
  });
  const [listMeta, setListMeta] = useState<
    Record<"j" | "ap" | "ar", { totalCount: number; totalPages: number }>
  >({
    j: { totalCount: 0, totalPages: 0 },
    ap: { totalCount: 0, totalPages: 0 },
    ar: { totalCount: 0, totalPages: 0 },
  });
  const [apPayment, setApPayment] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMode: "Bank Transfer",
    bankAccount: "Bank Account (1020)",
    transactionReference: "",
    notes: "",
    attachmentName: "",
  });
  const [arPayment, setArPayment] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: "Bank Transfer",
    bankCharges: "0",
    tdsAmount: "0",
    reference: "",
    notes: "",
  });
  const visibleAccountTabs = [
    ["dashboard", "Finance Dashboard", "accounts.finance_dashboard.view"],
    ["customers", "Customer Ledger", "accounts.customer_ledger.view"],
    ["vendors", "Vendor Ledger", "accounts.vendor_ledger.view"],
    ["coa", "Chart of Accounts", "accounts.chart_of_accounts.view"],
    ["ap", "AP", "accounts.accounts_payable.view"],
    ["ar", "AR", "accounts.accounts_receivable.view"],
    ["journals", "Journal Entries", "accounts.journal_entries.view"],
    [
      "statements",
      "Financial Statements",
      "accounts.financial_statements.view",
    ],
  ].filter(([, , permission]) => can(permission));
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
      paidAmount: "",
      receivedAmount: "",
      adjustedAmount: "",
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
      ...(can("accounts.finance_dashboard.view")
        ? [["s", "/dashboard-summary"]]
        : []),
      ...(can("accounts.chart_of_accounts.view") ||
      can("accounts.journal_entries.view")
        ? [["c", "/coa"]]
        : []),
      ...(can("accounts.journal_entries.view")
        ? [
            [
              "j",
              `/journal-entries?skip=${(listPaging.j.page - 1) * listPaging.j.size}&limit=${listPaging.j.size}`,
            ],
          ]
        : []),
      ...(can("accounts.accounts_payable.view")
        ? [
            [
              "ap",
              `/ap?skip=${(listPaging.ap.page - 1) * listPaging.ap.size}&limit=${listPaging.ap.size}`,
            ],
          ]
        : []),
      ...(can("accounts.accounts_receivable.view")
        ? [
            [
              "ar",
              `/ar?skip=${(listPaging.ar.page - 1) * listPaging.ar.size}&limit=${listPaging.ar.size}`,
            ],
          ]
        : []),
      ...(can("accounts.customer_ledger.view")
        ? [["cu", "/customer-ledger"]]
        : []),
      ...(can("accounts.vendor_ledger.view") ? [["v", "/vendor-ledger"]] : []),
    ] as string[][];
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
      if (k === "j" || k === "ap" || k === "ar") {
        const response = v as any;
        if (k === "j") setJournals(response.items || []);
        if (k === "ap") setAp(response.items || []);
        if (k === "ar") setAr(response.items || []);
        setListMeta((current) => ({
          ...current,
          [k]: {
            totalCount: Number(response.totalCount ?? response.total ?? 0),
            totalPages: Number(response.totalPages ?? 0),
          },
        }));
      }
      if (k === "cu") setCustomers(v as any[]);
      if (k === "v") setVendors(v as any[]);
    }
    const reconciledAr = can("accounts.accounts_receivable.view")
      ? await api(
          `/ar?skip=${(listPaging.ar.page - 1) * listPaging.ar.size}&limit=${listPaging.ar.size}`,
        ).catch(() => null)
      : null;
    if (reconciledAr) setAr(reconciledAr.items || []);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [
    listPaging.j.page,
    listPaging.j.size,
    listPaging.ap.page,
    listPaging.ap.size,
    listPaging.ar.page,
    listPaging.ar.size,
  ]);
  useEffect(() => {
    if (
      visibleAccountTabs.length &&
      !visibleAccountTabs.some(([value]) => value === activeTab)
    )
      setActiveTab(visibleAccountTabs[0][0]);
  }, [activeTab, visibleAccountTabs.map(([value]) => value).join("|")]);
  const reconcile = async () => {
    setLoading(true);
    setError("");
    try {
      await api("/reconcile", { method: "POST" });
      await load();
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };
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
      if (settlement.kind === "ap")
        await flexApi("/vendor-payments", {
          method: "POST",
          body: JSON.stringify({
            vendorName: settlement.row.vendorName,
            invoiceReference: settlement.row.billNumber,
            amount,
            ...apPayment,
          }),
        });
      else
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
  const openSettlement = (kind: "ap" | "ar", row: any) => {
    const paidField = kind === "ap" ? "paidAmount" : "receivedAmount";
    const balance = Math.max(
      0,
      numberValue(row.amount) -
        numberValue(row[paidField]) -
        numberValue(row.adjustedAmount),
    );
    setSettlement({ kind, row });
    setSettlementAmount(balance.toFixed(2));
    setError("");
  };
  const reviewAp = async (row: any, action: "approve" | "reject") => {
    const remarks = window.prompt(
      `${action === "approve" ? "Approval" : "Rejection"} remarks`,
    );
    if (action === "reject" && !remarks) return;
    setSubmitting(true);
    try {
      await api(`/ap/${row.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ remarks: remarks || "Approved" }),
      });
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
  const reviewAr = async (row: any, action: "approve" | "reject") => {
    const remarks = window.prompt(
      `${action === "approve" ? "Approval" : "Rejection"} remarks`,
    );
    if (action === "reject" && !remarks) return;
    setSubmitting(true);
    setError("");
    try {
      await api(`/ar/${row.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ remarks: remarks || "Approved" }),
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
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
        body: JSON.stringify({
          invoiceId: paymentAr.sourceId,
          amount,
          ...arPayment,
          bankCharges: numberValue(arPayment.bankCharges),
          tdsAmount: numberValue(arPayment.tdsAmount),
        }),
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
  const deletePayable = async (row: any) => {
    if (row.sourceType !== "Manual") return;
    if (!window.confirm(`Delete payable ${row.billNumber}?`)) return;
    setSubmitting(true);
    setError("");
    try {
      await api(`/ap/${row.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };
  const statusBadge = (value: any) => {
    const status = String(value || "Pending");
    const settled = status === "Paid" || status === "Approved";
    return (
      <span
        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${settled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-orange-200 bg-orange-50 text-orange-600"}`}
      >
        {status}
      </span>
    );
  };
  const arStatusBadge = (value: any) => {
    const status = String(value || "Pending");
    const complete =
      status === "Received" ||
      status === "Settled" ||
      status === "Paid" ||
      status === "Approved";
    return (
      <span
        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-orange-200 bg-orange-50 text-orange-600"}`}
      >
        {status === "Pending" ? "$ Pending" : status}
      </span>
    );
  };
  const Table = ({
    rows,
    cols,
    showFooter = true,
    serverKey,
  }: {
    rows: any[];
    cols: [string, string, ((v: any, row: any) => React.ReactNode)?][];
    showFooter?: boolean;
    serverKey?: "j" | "ap" | "ar";
  }) => {
    const clientPagination = useClientPagination(serverKey ? [] : rows);
    const displayedRows = serverKey ? rows : clientPagination.paginatedRows;
    return (
      <div className="overflow-hidden rounded-md border bg-white">
        <div className="overflow-x-auto">
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
              {displayedRows.map((r, i) => (
                <tr key={r.id ?? i} className="border-t">
                  {cols.map((c) => (
                    <td key={c[1]} className="px-3 py-2">
                      {c[2] ? c[2](r[c[1]], r) : String(r[c[1]] ?? "�")}
                    </td>
                  ))}
                </tr>
              ))}
              {!displayedRows.length && (
                <tr className="border-t">
                  <td
                    colSpan={cols.length}
                    className="px-4 py-14 text-center text-muted-foreground"
                  >
                    No records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {false && (
          <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              Showing {rows.length ? 1 : 0} to {Math.min(rows.length, 10)} of{" "}
              {rows.length} records
            </span>
            <div className="flex items-center gap-3">
              <span>Rows per page:</span>
              <span className="rounded-md border bg-white px-4 py-2 text-foreground">
                10
              </span>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled
                aria-label="Previous page"
              >
                ‹
              </Button>
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-red-500 font-medium text-white">
                1
              </span>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={rows.length <= 10}
                aria-label="Next page"
              >
                ›
              </Button>
            </div>
          </div>
        )}
        {showFooter && (
          <DataPagination
            currentPage={
              serverKey
                ? listPaging[serverKey].page
                : clientPagination.currentPage
            }
            pageSize={
              serverKey ? listPaging[serverKey].size : clientPagination.pageSize
            }
            totalCount={
              serverKey
                ? listMeta[serverKey].totalCount
                : clientPagination.totalCount
            }
            totalPages={serverKey ? listMeta[serverKey].totalPages : undefined}
            onPageChange={(page) =>
              serverKey
                ? setListPaging((current) => ({
                    ...current,
                    [serverKey]: { ...current[serverKey], page },
                  }))
                : clientPagination.setCurrentPage(page)
            }
            onPageSizeChange={(size) =>
              serverKey
                ? setListPaging((current) => ({
                    ...current,
                    [serverKey]: { page: 1, size },
                  }))
                : clientPagination.setPageSize(size)
            }
            loading={loading}
          />
        )}
      </div>
    );
  };
  const apBills = ap.filter((entry) => entry.entryType !== "Debit Note");
  const apDebitNotes = ap.filter((entry) => entry.entryType === "Debit Note");
  const filterAp = (rows: any[]) =>
    f(rows).filter(
      (row) =>
        (apStatusFilter === "All" || row.status === apStatusFilter) &&
        (apApprovalFilter === "All" ||
          row.approvalStatus === apApprovalFilter) &&
        (!apFromDate || row.billDate >= apFromDate) &&
        (!apToDate || row.billDate <= apToDate),
    );
  const apSummary = [
    [
      "Total Outstanding",
      apBills.reduce(
        (sum, row) =>
          sum +
          Math.max(
            0,
            numberValue(row.amount) -
              numberValue(row.paidAmount) -
              numberValue(row.adjustedAmount),
          ),
        0,
      ),
    ],
    [
      "Due Today",
      apBills
        .filter((row) => row.dueDate === today)
        .reduce(
          (sum, row) =>
            sum +
            Math.max(
              0,
              numberValue(row.amount) -
                numberValue(row.paidAmount) -
                numberValue(row.adjustedAmount),
            ),
          0,
        ),
    ],
    [
      "Overdue Amount",
      apBills
        .filter((row) => row.dueDate < today && row.status !== "Paid")
        .reduce(
          (sum, row) =>
            sum +
            Math.max(
              0,
              numberValue(row.amount) -
                numberValue(row.paidAmount) -
                numberValue(row.adjustedAmount),
            ),
          0,
        ),
    ],
    [
      "Payments Made",
      apBills.reduce((sum, row) => sum + numberValue(row.paidAmount), 0),
    ],
    [
      "Debit Adjustments",
      apBills.reduce((sum, row) => sum + numberValue(row.adjustedAmount), 0),
    ],
    [
      "Vendor Credits",
      apDebitNotes.reduce(
        (sum, row) => sum + numberValue(row.availableCredit),
        0,
      ),
    ],
  ];
  const arInvoices = ar.filter((row) => row.entryType !== "Credit Note");
  const arCustomers = [
    ...new Set(arInvoices.map((row) => String(row.clientName)).filter(Boolean)),
  ].sort();
  const filteredArInvoices = f(arInvoices).filter(
    (row) =>
      (!arFromDate || row.invoiceDate >= arFromDate) &&
      (!arToDate || row.invoiceDate <= arToDate) &&
      (arCustomer === "All" || row.clientName === arCustomer),
  );
  const arOutstanding = filteredArInvoices.reduce(
    (sum, row) => sum + outstanding(row),
    0,
  );
  const exportAr = () => {
    const fields = [
      "Customer",
      "Invoice",
      "Invoice Date",
      "Due Date",
      "Amount",
      "Received",
      "Adjustment",
      "Balance",
      "Status",
      "Approval",
    ];
    const lines = filteredArInvoices.map((row) => [
      row.clientName,
      row.invoiceNumber,
      row.invoiceDate,
      row.dueDate,
      numberValue(row.amount),
      numberValue(row.receivedAmount),
      numberValue(row.adjustedAmount),
      outstanding(row),
      row.status,
      row.approvalStatus,
    ]);
    const csv = [fields, ...lines]
      .map((line) =>
        line
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `accounts-receivable-${today}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const pageTitles: Record<string, [string, string]> = {
    dashboard: [
      "Finance Dashboard",
      "Accounting overview and financial position",
    ],
    coa: ["Chart of Accounts", "Manage the organization ledger structure"],
    customers: [
      "Customer Ledger",
      "Track customer invoices, receipts and balances",
    ],
    vendors: ["Vendor Ledger", "Track vendor bills, payments and balances"],
    ap: [
      "Accounts Payable (AP)",
      "Manage pending vendor bills, debit notes and payments",
    ],
    ar: ["Accounts Receivable (AR)", "Manage customer invoices and receipts"],
    journals: ["Journal Entries", "Review posted double-entry transactions"],
    statements: [
      "Financial Statements",
      "Review profit, balance sheet and trial balance",
    ],
  };
  return (
    <Shell>
      <div className="min-h-full space-y-5 p-4 pt-16 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:pr-36">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <BookOpen />
              Accounts
            </h1>
          </div>
          {can("accounts.finance_dashboard.view") && (
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                onClick={() => void reconcile()}
                disabled={loading}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />{" "}
                Reconcile
              </Button>
            </div>
          )}
        </div>
        {error && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {error}
          </div>
        )}
        <Input
          placeholder="Search current view..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border bg-white p-1 [&>*]:shrink-0 [&>*]:whitespace-nowrap">
            {visibleAccountTabs.map(([value, label]) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="dashboard">
            <FinanceDashboard
              request={api}
              summary={summary}
              receivables={ar}
              payables={ap}
              can={can}
            />
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
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => openManual("ap", { entryType: "Bill" })}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Bill
                </Button>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => openManual("ap", { entryType: "Debit Note" })}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Debit Note
                </Button>
              </div>
            )}
            <Tabs defaultValue="bills">
              <TabsList className="mb-3 bg-slate-100">
                <TabsTrigger value="bills">Pending Bills</TabsTrigger>
                <TabsTrigger value="debit-notes">Debit Notes</TabsTrigger>
              </TabsList>
              <TabsContent value="bills">
                <Table
                  serverKey="ap"
                  rows={f(
                    ap.filter((entry) => entry.entryType !== "Debit Note"),
                  )}
                  cols={[
                    ["Vendor", "vendorName"],
                    ["Bill #", "billNumber"],
                    ["Bill Date", "billDate"],
                    ["Due Date", "dueDate"],
                    ["Amount", "amount", inr],
                    [
                      "Paid",
                      "paidAmount",
                      (value) => (
                        <span className="font-medium text-emerald-600">
                          {inr(value)}
                        </span>
                      ),
                    ],
                    [
                      "Adjustment",
                      "adjustedAmount",
                      (value) => (
                        <span className="font-medium text-sky-600">
                          {inr(value)}
                        </span>
                      ),
                    ],
                    [
                      "Balance",
                      "balance",
                      (_value, row) => (
                        <span className="font-medium text-red-500">
                          {inr(
                            Math.max(
                              0,
                              numberValue(row.amount) -
                                numberValue(row.paidAmount) -
                                numberValue(row.adjustedAmount),
                            ),
                          )}
                        </span>
                      ),
                    ],
                    ["Status", "status", statusBadge],
                    [
                      "Actions",
                      "actions",
                      (_value, row) => {
                        const balance = Math.max(
                          0,
                          numberValue(row.amount) -
                            numberValue(row.paidAmount) -
                            numberValue(row.adjustedAmount),
                        );
                        return (
                          <div className="flex items-center gap-2">
                            {balance > 0 &&
                              row.approvalStatus === "Approved" && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  title="Record payment"
                                  aria-label={`Record payment for ${row.billNumber}`}
                                  disabled={submitting}
                                  onClick={() => openSettlement("ap", row)}
                                >
                                  <span className="text-base leading-none">
                                    $
                                  </span>
                                </Button>
                              )}
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-slate-300 hover:text-red-500"
                              title={
                                row.sourceType === "Manual"
                                  ? "Delete bill"
                                  : "Linked bills cannot be deleted"
                              }
                              aria-label={`Delete ${row.billNumber}`}
                              disabled={
                                submitting || row.sourceType !== "Manual"
                              }
                              onClick={() => void deletePayable(row)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      },
                    ],
                  ]}
                />
              </TabsContent>
              <TabsContent value="debit-notes">
                <Table
                  serverKey="ap"
                  rows={f(
                    ap.filter((entry) => entry.entryType === "Debit Note"),
                  )}
                  cols={[
                    ["Vendor", "vendorName"],
                    ["Debit Note #", "billNumber"],
                    ["Against Bill", "againstBillNumber"],
                    ["Date", "billDate"],
                    ["Amount", "amount", inr],
                    ["Status", "status", statusBadge],
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
                  <Plus className="mr-2 h-4 w-4" /> Add Invoice
                </Button>
                <Button
                  variant="outline"
                  onClick={() => openManual("ar", { entryType: "Credit Note" })}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Credit Note
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
                  serverKey="ar"
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
                            row.approvalStatus === "Approved" &&
                            outstanding(row) > 0 && (
                              <Button
                                size="sm"
                                onClick={() => openPayment(row)}
                                disabled={submitting}
                              >
                                <CreditCard className="mr-1 h-3.5 w-3.5" /> Pay
                              </Button>
                            )}
                          {row.approvalStatus === "Pending Approval" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => void reviewAr(row, "approve")}
                                disabled={submitting}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void reviewAr(row, "reject")}
                                disabled={submitting}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void deleteReceivable(row)}
                            disabled={submitting || row.sourceType !== "Manual"}
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
                  serverKey="ar"
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
              serverKey="j"
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
            <FinancialStatements request={api} can={can} />
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
                        value={manual.paidAmount || ""}
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
                        value={manual.adjustedAmount || ""}
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
                        value={manual.receivedAmount || ""}
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
                        value={manual.adjustedAmount || ""}
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
          open={settlement?.kind === "ap"}
          onOpenChange={(open) => {
            if (!open && !submitting) {
              setSettlement(null);
              setSettlementAmount("");
            }
          }}
        >
          <DialogContent className="max-w-lg rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-500">
                  <DollarSign className="h-5 w-5" />
                </span>
                Record Payment
              </DialogTitle>
            </DialogHeader>
            {settlement?.kind === "ap" && (
              <div className="space-y-5 py-2">
                <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/45 p-4 text-center">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Total Amount
                    </p>
                    <p className="font-semibold">
                      {inr(settlement.row.amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Already Paid
                    </p>
                    <p className="font-semibold text-emerald-600">
                      {inr(settlement.row.paidAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Balance
                    </p>
                    <p className="font-semibold text-red-500">
                      {inr(
                        Math.max(
                          0,
                          numberValue(settlement.row.amount) -
                            numberValue(settlement.row.paidAmount) -
                            numberValue(settlement.row.adjustedAmount),
                        ),
                      )}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ap-payment-amount">Payment Amount (₹)</Label>
                  <Input
                    id="ap-payment-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={settlementAmount}
                    onChange={(event) =>
                      setSettlementAmount(event.target.value)
                    }
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSettlement(null)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-500 hover:bg-red-600"
                onClick={() => void saveSettlement()}
                disabled={submitting || !settlementAmount}
              >
                <Plus className="mr-2 h-4 w-4" />
                {submitting ? "Recording..." : "Record Payment"}
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
                  <Label htmlFor="payment-amount">Payment Amount (₹)</Label>
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm">
                    <Label>Payment Date</Label>
                    <Input
                      type="date"
                      value={arPayment.paymentDate}
                      onChange={(e) =>
                        setArPayment((value) => ({
                          ...value,
                          paymentDate: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1.5 text-sm">
                    <Label>Payment Method</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3"
                      value={arPayment.paymentMethod}
                      onChange={(e) =>
                        setArPayment((value) => ({
                          ...value,
                          paymentMethod: e.target.value,
                        }))
                      }
                    >
                      {["Bank Transfer", "UPI", "Cheque", "Cash"].map(
                        (method) => (
                          <option key={method}>{method}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="space-y-1.5 text-sm">
                    <Label>Bank Charges</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={arPayment.bankCharges}
                      onChange={(e) =>
                        setArPayment((value) => ({
                          ...value,
                          bankCharges: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1.5 text-sm">
                    <Label>TDS Amount</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={arPayment.tdsAmount}
                      onChange={(e) =>
                        setArPayment((value) => ({
                          ...value,
                          tdsAmount: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1.5 text-sm sm:col-span-2">
                    <Label>Transaction Reference</Label>
                    <Input
                      value={arPayment.reference}
                      onChange={(e) =>
                        setArPayment((value) => ({
                          ...value,
                          reference: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1.5 text-sm sm:col-span-2">
                    <Label>Notes</Label>
                    <Input
                      value={arPayment.notes}
                      onChange={(e) =>
                        setArPayment((value) => ({
                          ...value,
                          notes: e.target.value,
                        }))
                      }
                    />
                  </label>
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
