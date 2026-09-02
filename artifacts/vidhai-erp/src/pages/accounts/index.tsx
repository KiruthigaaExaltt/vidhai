const SYSTEM_ACCOUNT_CODES = new Set(["1030", "1100", "1200", "2100", "2200", "3000", "3100", "4100", "5100", "5140", "5150", "5160"]);
const SYSTEM_ACCOUNT_NAMES = new Set(["Input CGST", "Input SGST", "Input IGST", "Output CGST", "Output SGST", "Output IGST"]);
const isSystemAccount = (account: any) => SYSTEM_ACCOUNT_CODES.has(String(account?.accountCode || "")) || SYSTEM_ACCOUNT_NAMES.has(String(account?.accountName || ""));

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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
const accountTypes = ["Asset", "Liability", "Equity", "Revenue", "Expense"] as const;

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
    [crmClients, setCrmClients] = useState<any[]>([]),
    [crmVendors, setCrmVendors] = useState<any[]>([]),
    [arDocuments, setArDocuments] = useState<any[]>([]),
    [apDocuments, setApDocuments] = useState<any[]>([]),
    [masters, setMasters] = useState<any>({ transactionTypes: [], sourceRegistry: {} }),
    [bankCash, setBankCash] = useState<any[]>([]),
    [bankDecision, setBankDecision] = useState<{ row: any; remarks: string } | null>(null),
    [activeTab, setActiveTab] = useState("dashboard"),
    [search, setSearch] = useState(""),
    [fromDate, setFromDate] = useState(""),
    [toDate, setToDate] = useState(""),
    [apStatusFilter, setApStatusFilter] = useState("All"),
    [apApprovalFilter, setApApprovalFilter] = useState("All"),
    [apFromDate, setApFromDate] = useState(""),
    [apToDate, setApToDate] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [paymentAr, setPaymentAr] = useState<any | null>(null),
    [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({}),
    [expandedVendors, setExpandedVendors] = useState<Record<string, boolean>>({}),
    [paymentAmount, setPaymentAmount] = useState(""),
    [apSettlementAccountId, setApSettlementAccountId] = useState(""),
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
    bankAccount: "Cash in Hand (1030)",
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
    settlementAccountId: "",
  });
  const [bankForm, setBankForm] = useState({ mode: "Credit", transactionTypeId: "", transactionTypeName: "", bankCashAccountId: "", transferToAccountId: "", counterAccountId: "", amount: "", transactionDate: new Date().toISOString().slice(0, 10), reference: "", remarks: "" });
  const [accountDocument, setAccountDocument] = useState<any | null>(null);
  const accountTabGroups = [
    {
      group: "Overview",
      tabs: [["dashboard", "Dashboard", "accounts.finance_dashboard.view"]],
    },
    {
      group: "Daily Work",
      tabs: [
        ["bankcash", "Bank & Cash", "accounts.bank_cash.view"],
        ["ar", "Receivables", "accounts.accounts_receivable.view"],
        ["ap", "Payables", "accounts.accounts_payable.view"],
        ["customers", "Customer Ledger", "accounts.customer_ledger.view"],
        ["vendors", "Vendor Ledger", "accounts.vendor_ledger.view"],
      ],
    },
    {
      group: "Reports",
      tabs: [
        ["statements", "Financial Statements", "accounts.financial_statements.view"],
        ["journals", "Journal Entries", "accounts.journal_entries.view"],
      ],
    },
    {
      group: "Setup & Audit",
      tabs: [
        ["coa", "Chart of Accounts", "accounts.chart_of_accounts.view"],
        // DISABLED: Opening Balances is handled through Bank & Cash.
        // DISABLED: Masters module is not required for this phase
        // ["masters", "Masters", "accounts.masters.view"],
        ["tally", "Tally Export", "accounts.tally.view"],
      ],
    },
  ] as const;
  const visibleAccountGroups = accountTabGroups
    .map((section) => ({
      ...section,
      tabs: section.tabs.filter(([, , permission]) => can(permission)),
    }))
    .filter((section) => section.tabs.length);
  const visibleAccountTabs = visibleAccountGroups.flatMap((section) => section.tabs);
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
      sourceType: "Manual",
      sourceId: null,
      ...seed,
    });
    if (type === "ar") void loadArDocuments(seed.clientId ? String(seed.clientId) : undefined, seed.entryType === "Credit Note" ? "credit-note" : undefined);
    if (type === "ap") void loadApDocuments(seed.vendorId ? String(seed.vendorId) : undefined, seed.entryType === "Debit Note" ? "debit-note" : undefined);
  };
  const setManualField = (key: string, value: any) =>
    setManual((current: any) => ({ ...current, [key]: value }));
const loadArDocuments = async (clientId?: string, mode?: string) => {
    if (!can("accounts.accounts_receivable.view")) return;
    const params = new URLSearchParams();
    if (clientId) params.set("clientId", clientId);
    if (mode) params.set("mode", mode);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    setArDocuments(await api(`/receivable-documents${suffix}`).catch(() => []));
  };
  const loadApDocuments = async (vendorId?: string, mode?: string) => {
    if (!can("accounts.accounts_payable.view")) return;
    const params = new URLSearchParams();
    if (vendorId) params.set("vendorId", vendorId);
    if (mode) params.set("mode", mode);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    setApDocuments(await api(`/payable-documents${suffix}`).catch(() => []));
  };
  const selectClient = (id: string) => {
    const client = crmClients.find((row) => String(row.id) === id);
    setManual((current: any) => ({
      ...current,
      clientId: id,
      clientName: client?.name || "",
      sourceType: current.sourceType === "Sales Invoice" ? "Manual" : current.sourceType,
      sourceId: current.sourceType === "Sales Invoice" ? null : current.sourceId,
    }));
    void loadArDocuments(id, manual.entryType === "Credit Note" ? "credit-note" : undefined);
  };
  const selectVendor = (id: string) => {
    const vendor = crmVendors.find((row) => String(row.id) === id);
    setManual((current: any) => ({
      ...current,
      vendorId: id,
      vendorName: vendor?.name || "",
      sourceType: current.sourceType === "Purchase Invoice" ? "Manual" : current.sourceType,
      sourceId: current.sourceType === "Purchase Invoice" ? null : current.sourceId,
    }));
    void loadApDocuments(id, manual.entryType === "Debit Note" ? "debit-note" : undefined);
  };
  const selectArDocument = (value: string) => {
    const doc = arDocuments.find((row) => row.displayName === value || row.invoiceNumber === value);
    setManual((current: any) => ({
      ...current,
      invoiceNumber: doc?.invoiceNumber || value,
      clientId: doc ? String(doc.clientId) : current.clientId,
      clientName: doc?.clientName || current.clientName,
      invoiceDate: doc?.invoiceDate || current.invoiceDate,
      dueDate: doc?.dueDate || current.dueDate,
      amount: doc ? String(doc.totalAmount) : current.amount,
      receivedAmount: doc ? String(doc.amountReceived || 0) : current.receivedAmount,
      adjustedAmount: doc ? String(doc.adjustedAmount || 0) : current.adjustedAmount,
      sourceType: doc ? "Sales Invoice" : "Manual",
      sourceId: doc?.id || null,
    }));
  };
  const selectLinkedArInvoice = (value: string) => {
    const doc = arDocuments.find((row) => String(row.invoiceNumber) === value || row.displayName === value);
    setManual((current: any) => ({ ...current, linkedInvoiceNumber: doc?.invoiceNumber || value, clientId: doc ? String(doc.clientId) : current.clientId, clientName: doc?.clientName || current.clientName, invoiceDate: current.invoiceDate || doc?.invoiceDate, dueDate: current.dueDate || doc?.dueDate }));
  };
  const selectApDocument = (value: string) => {
    const doc = apDocuments.find((row) => row.displayName === value || row.billNumber === value);
    setManual((current: any) => ({
      ...current,
      billNumber: current.entryType === "Debit Note" ? current.billNumber : doc?.billNumber || value,
      againstBillNumber: current.entryType === "Debit Note" ? doc?.billNumber || value : current.againstBillNumber,
      vendorId: doc ? String(doc.vendorId) : current.vendorId,
      vendorName: doc?.vendorName || current.vendorName,
      billDate: doc?.billDate || current.billDate,
      dueDate: doc?.dueDate || current.dueDate,
      amount: current.entryType === "Debit Note" ? current.amount : doc ? String(doc.totalAmount) : current.amount,
      paidAmount: current.entryType === "Debit Note" ? current.paidAmount : doc ? String(doc.paidAmount || 0) : current.paidAmount,
      adjustedAmount: current.entryType === "Debit Note" ? current.adjustedAmount : doc ? String(doc.debitNoteAmount || 0) : current.adjustedAmount,
      sourceType: current.entryType === "Debit Note" ? "Manual" : doc ? "Purchase Invoice" : "Manual",
      sourceId: current.entryType === "Debit Note" ? null : doc?.id || null,
    }));
  };
  const submitManual = async () => {
    if (!manualType) return;
    setSubmitting(true);
    setError("");
    try {
      if (manualType === "account")
        await api(manual.id ? `/coa/${manual.id}` : "/coa", {
          method: manual.id ? "PATCH" : "POST",
          body: JSON.stringify({
            accountCode: manual.accountCode?.trim(),
            accountName: manual.accountName?.trim(),
            accountType: manual.accountType,
            description: manual.description || "",
            isActive: manual.isActive !== false,
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
            sourceType: manual.sourceType || "Manual",
            sourceId: manual.sourceId ? Number(manual.sourceId) : null,
            metadata: { notes: manual.notes || "" },
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
            vendorId: manual.vendorId ? Number(manual.vendorId) : null,
            vendorName: manual.vendorName?.trim(),
            billNumber: manual.billNumber?.trim(),
            againstBillNumber:
              manual.entryType === "Debit Note"
                ? manual.againstBillNumber?.trim()
                : "",
            billDate: manual.billDate,
            dueDate: manual.dueDate,
            amount: numberValue(manual.amount),
            paidAmount: manual.entryType === "Debit Note" ? numberValue(manual.amount) : numberValue(manual.paidAmount),
            adjustedAmount: manual.entryType === "Debit Note" ? 0 : numberValue(manual.adjustedAmount),
            coaAccountId: manual.coaAccountId ? Number(manual.coaAccountId) : null,
            entryType: manual.entryType,
            notes: manual.notes || "",
            sourceType: manual.sourceType || "Manual",
            sourceId: manual.sourceId ? Number(manual.sourceId) : null,
          }),
        });
      if (manualType === "ar")
        await api("/ar", {
          method: "POST",
          body: JSON.stringify({
            clientId: manual.clientId ? Number(manual.clientId) : null,
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
            receivedAmount: manual.entryType === "Credit Note" ? numberValue(manual.amount) : numberValue(manual.receivedAmount),
            adjustedAmount: manual.entryType === "Credit Note" ? 0 : numberValue(manual.adjustedAmount),
            coaAccountId: manual.coaAccountId ? Number(manual.coaAccountId) : null,
            entryType: manual.entryType,
            notes: manual.notes || "",
            sourceType: manual.sourceType || "Manual",
            sourceId: manual.sourceId ? Number(manual.sourceId) : null,
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
  const listingDateQuery = () => {
    const params = new URLSearchParams();
    if (fromDate) params.set("dateFrom", fromDate);
    if (toDate) params.set("dateTo", toDate);
    if (search.trim()) params.set("search", search.trim());
    const query = params.toString();
    return query ? `&${query}` : "";
  };
  const withListingDates = (path: string) => {
    const query = listingDateQuery();
    if (!query) return path;
    return `${path}${path.includes("?") ? query : `?${query.slice(1)}`}`;
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
      ...(!can("accounts.chart_of_accounts.view") &&
      !can("accounts.journal_entries.view") &&
      (can("accounts.accounts_receivable.edit") ||
        can("accounts.accounts_payable.edit"))
        ? [["paymentCoa", "/payment-accounts"]]
        : []),
      // DISABLED: Masters module is not required for this phase
      // ...(can("accounts.masters.view") ? [["m", "/masters"]] : []),
      ...(can("accounts.accounts_receivable.view") ? [["clients", "/party-options?type=client"]] : []),
      ...(can("accounts.accounts_payable.view") ? [["vendorsOpt", "/party-options?type=vendor"]] : []),
      ...(can("accounts.bank_cash.view") ? [["bc", withListingDates("/bank-cash-transactions")]] : []),
      ...(can("accounts.journal_entries.view")
        ? [
            [
              "j",
              withListingDates(`/journal-entries?skip=${(listPaging.j.page - 1) * listPaging.j.size}&limit=${listPaging.j.size}`),
            ],
          ]
        : []),
      ...(can("accounts.accounts_payable.view")
        ? [
            [
              "ap",
              withListingDates(`/ap?skip=${(listPaging.ap.page - 1) * listPaging.ap.size}&limit=${listPaging.ap.size}`),
            ],
          ]
        : []),
      ...(can("accounts.accounts_receivable.view")
        ? [
            [
              "ar",
              withListingDates(`/ar?skip=${(listPaging.ar.page - 1) * listPaging.ar.size}&limit=${listPaging.ar.size}`),
            ],
          ]
        : []),
      ...(can("accounts.customer_ledger.view")
        ? [["cu", withListingDates("/customer-ledger")]]
        : []),
      ...(can("accounts.vendor_ledger.view") ? [["v", withListingDates("/vendor-ledger")]] : []),
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
      if (k === "paymentCoa") setCoa(v as any[]);
      // DISABLED: Masters module is not required for this phase
      // if (k === "m") setMasters(v);
      if (k === "bc") setBankCash(v as any[]);
      if (k === "clients") setCrmClients(v as any[]);
      if (k === "vendorsOpt") setCrmVendors(v as any[]);
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
    fromDate,
    toDate,
    search,
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
  const toggleCustomer = (key: string) =>
    setExpandedCustomers((current) => ({ ...current, [key]: !current[key] }));
  const toggleVendor = (key: string) =>
    setExpandedVendors((current) => ({ ...current, [key]: !current[key] }));
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({
    Asset: true,
    Liability: true,
    Equity: true,
    Revenue: true,
    Expense: true,
  });
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});

  const toggleType = (type: string) =>
    setExpandedTypes((current) => ({ ...current, [type]: !current[type] }));
  const toggleAccount = (id: string | number) =>
    setExpandedAccounts((current) => ({ ...current, [id]: !current[id] }));

  const setListingFromDate = (value: string) => {
    setFromDate(value);
    setListPaging((current) => ({
      j: { ...current.j, page: 1 },
      ap: { ...current.ap, page: 1 },
      ar: { ...current.ar, page: 1 },
    }));
  };
  const setListingToDate = (value: string) => {
    setToDate(value);
    setListPaging((current) => ({
      j: { ...current.j, page: 1 },
      ap: { ...current.ap, page: 1 },
      ar: { ...current.ar, page: 1 },
    }));
  };
  const clearListingDates = () => {
    setFromDate("");
    setToDate("");
    setListPaging((current) => ({
      j: { ...current.j, page: 1 },
      ap: { ...current.ap, page: 1 },
      ar: { ...current.ar, page: 1 },
    }));
  };
  const match = (x: any) => JSON.stringify(x).toLowerCase().includes(search.toLowerCase()),
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
      if (settlement.kind === "ap") {
        await flexApi("/vendor-payments", {
          method: "POST",
          body: JSON.stringify({
            vendorName: settlement.row.vendorName,
            invoiceReference: settlement.row.billNumber,
            payableId: settlement.row.id,
            amount,
            settlementAccountId: Number(apSettlementAccountId),
            recordImmediately: true,
            ...apPayment,
          }),
        });
      } else {
        await api(`/${settlement.kind}/${settlement.row.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            [field]: numberValue(settlement.row[field]) + amount,
          }),
        });
      }
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
    if (kind === "ap") setApSettlementAccountId("");
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
    setArPayment((value) => ({ ...value, settlementAccountId: "" }));
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
    if (!paymentAr) return;
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
      if (paymentAr.sourceType === "Sales Invoice" && paymentAr.sourceId) {
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
      } else {
        await api(`/ar/${paymentAr.id}/payment`, {
          method: "POST",
          body: JSON.stringify({
            amount,
            paymentDate: arPayment.paymentDate,
            bankCharges: numberValue(arPayment.bankCharges),
            tdsAmount: numberValue(arPayment.tdsAmount),
            settlementAccountId: Number(arPayment.settlementAccountId),
          }),
        });
      }
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
  const readAccountFile = (file?: File | null) =>
    new Promise<any | null>((resolve, reject) => {
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, content: String(reader.result || "") });
      reader.onerror = () => reject(reader.error || new Error("Unable to read document"));
      reader.readAsDataURL(file);
    });
  const submitBankCash = async () => {
    setSubmitting(true);
    setError("");
    try {
      const type = (masters.transactionTypes || []).find((row: any) => String(row.id) === String(bankForm.transactionTypeId));
      await api("/bank-cash-transactions", { method: "POST", body: JSON.stringify({ ...bankForm, transactionTypeName: bankForm.transactionTypeName || type?.name || "Bank/Cash Transaction", transactionTypeId: bankForm.transactionTypeId ? Number(bankForm.transactionTypeId) : undefined, bankCashAccountId: Number(bankForm.bankCashAccountId), transferToAccountId: bankForm.transferToAccountId ? Number(bankForm.transferToAccountId) : undefined, counterAccountId: bankForm.counterAccountId ? Number(bankForm.counterAccountId) : undefined, amount: numberValue(bankForm.amount), document: accountDocument }) });
      setBankForm({ mode: "Credit", transactionTypeId: "", transactionTypeName: "", bankCashAccountId: "", transferToAccountId: "", counterAccountId: "", amount: "", transactionDate: new Date().toISOString().slice(0, 10), reference: "", remarks: "" });
      setAccountDocument(null);
      await load();
    } catch (e: any) { setError(e.message); } finally { setSubmitting(false); }
  };
  const bankCashDecision = async (row: any, action: "approve" | "reject", remarks = "Approved") => {
    if (action === "reject" && !remarks.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await api(`/bank-cash-transactions/${row.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ remarks }),
      });
      setBankDecision(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };
  const saveTransactionType = async (row: any, patch: any) => {
    setSubmitting(true);
    setError("");
    try { await api(`/masters/transaction-types/${row.id}`, { method: "PATCH", body: JSON.stringify(patch) }); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  };
  const downloadBlob = (blob: Blob, fileName: string) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const fetchTallyExport = async (format: "xml" | "csv" | "json") => {
    const response = await fetch(`${base}/api/accounts/tally/export?format=${format}`, { credentials: "include" });
    if (response.status === 423) notifyModuleLocked("ledger");
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Unable to export Tally ${format.toUpperCase()}`);
    }
    return response;
  };
  const exportTallyFile = async (format: "xml" | "csv") => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetchTallyExport(format);
      const blob = await response.blob();
      downloadBlob(blob, `tally-export-${new Date().toISOString().slice(0, 10)}.${format}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };
  const exportTallyXlsx = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetchTallyExport("json");
      const payload = await response.json();
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.ledgers || []), "Ledgers");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.vouchers || []), "Vouchers");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.voucherLines || []), "Voucher Lines");
      XLSX.writeFile(workbook, `tally-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };  const statusBadge = (value: any) => {
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
                      {c[2] ? c[2](r[c[1]], r) : String(r[c[1]] ?? "—")}
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
                <ChevronLeft className="h-4 w-4" />
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
                <ChevronRight className="h-4 w-4" />
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
    dashboard: ["Finance Dashboard", "Today's receivables, payables, cash position and account health"],
    bankcash: ["Bank & Cash", "Record deposits, withdrawals, transfers and cash movements"],
    ar: ["Receivables", "Customer invoices, credit notes and receipts"],
    ap: ["Payables", "Vendor bills, debit notes and payments"],
    customers: ["Customer Ledger", "Customer-wise invoices, receipts, credits and outstanding balances"],
    vendors: ["Vendor Ledger", "Vendor-wise bills, payments, credits and outstanding balances"],
    statements: ["Financial Statements", "Profit & Loss, Balance Sheet and Trial Balance from posted vouchers"],
    journals: ["Journal Entries", "Posted double-entry vouchers behind every account movement"],
    coa: ["Chart of Accounts", "Ledger structure, bank/cash accounts and account balances"],
    // opening: ["Opening Balances", "Starting balances for bank and cash ledgers with approval"],
    masters: ["Accounts Masters", "Transaction types and source mapping used by accounting workflows"],
    tally: ["Tally Export", "Export ledgers and posted vouchers for TallyPrime and audit review"],
  };
  const activePageTitle = pageTitles[activeTab] || ["Accounts", "Finance and accounting operations"];
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{activePageTitle[0]}</h2>
            <p className="text-sm text-muted-foreground">{activePageTitle[1]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground font-medium whitespace-nowrap">From:</span>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setListingFromDate(e.target.value)}
                className="h-9 w-36 text-xs bg-background"
              />
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground font-medium whitespace-nowrap">To:</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setListingToDate(e.target.value)}
                className="h-9 w-36 text-xs bg-background"
              />
            </div>
            {(fromDate || toDate) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-9 text-xs px-2 text-muted-foreground hover:text-foreground"
                onClick={clearListingDates}
              >
                Clear Dates
              </Button>
            )}
            <Input
              placeholder={`Search ${activePageTitle[0].toLowerCase()}...`}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setListPaging((current) => ({ j: { ...current.j, page: 1 }, ap: { ...current.ap, page: 1 }, ar: { ...current.ar, page: 1 } })); }}
              className="h-9 w-48 text-xs bg-background"
            />
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="space-y-2 rounded-lg border bg-white p-2">
            {visibleAccountGroups.map((section) => (
              <div key={section.group} className="flex flex-col gap-1 md:flex-row md:items-center">
                <div className="w-28 shrink-0 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {section.group}
                </div>
                <TabsList className="flex h-auto flex-1 justify-start gap-1 overflow-x-auto bg-transparent p-0 [&>*]:shrink-0 [&>*]:whitespace-nowrap">
                  {section.tabs.map(([value, label]) => (
                    <TabsTrigger key={value} value={value}>
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            ))}
          </div>          <TabsContent value="dashboard">
            <FinanceDashboard
              request={api}
              summary={summary}
              receivables={ar}
              payables={ap}
              can={can}
            />
          </TabsContent>
                    <TabsContent value="customers" className="space-y-3">
            {f(customers).map((customer) => {
              const key = String(customer.clientId || customer.clientName);
              const open = Boolean(expandedCustomers[key]);
              return (
                <Card key={key} className="overflow-hidden rounded-md">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/40"
                    onClick={() => toggleCustomer(key)}
                  >
                    <div className="font-medium">{open ? "v" : ">"} {customer.customerDisplay || customer.clientName}</div>
                    <div className="grid min-w-[560px] grid-cols-4 gap-3 text-right text-sm">
                      <span>{inr(customer.invoiced)}</span>
                      <span>{inr(customer.received)}</span>
                      <span>{inr(customer.credited)}</span>
                      <span className="font-semibold">{inr(customer.outstanding)}</span>
                    </div>
                  </button>
                  {open && (
                    <div className="overflow-x-auto border-t">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/35 text-muted-foreground">
                          <tr>
                            <th className="px-4 py-2 text-left">Invoice Number</th>
                            <th className="px-4 py-2 text-left">Invoice Date</th>
                            <th className="px-4 py-2 text-right">Invoiced</th>
                            <th className="px-4 py-2 text-right">Received</th>
                            <th className="px-4 py-2 text-right">Credits</th>
                            <th className="px-4 py-2 text-right">Outstanding</th>
                            <th className="px-4 py-2 text-left">Paid Date</th>
                            <th className="px-4 py-2 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(customer.records || []).map((record: any) => (
                            <tr key={`${record.sourceType || "row"}-${record.id}`} className="border-t">
                              <td className="px-4 py-2">{record.invoiceNumber}</td>
                              <td className="px-4 py-2">{String(record.invoiceDate || "").slice(0, 10)}</td>
                              <td className="px-4 py-2 text-right">{inr(record.invoicedAmount)}</td>
                              <td className="px-4 py-2 text-right">{inr(record.receivedAmount)}</td>
                              <td className="px-4 py-2 text-right">{inr(record.credits)}</td>
                              <td className="px-4 py-2 text-right">{inr(record.outstanding)}</td>
                              <td className="px-4 py-2">{record.paidDate || "-"}</td>
                              <td className="px-4 py-2">{record.status || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              );
            })}
          </TabsContent>
          <TabsContent value="vendors" className="space-y-3">
            {f(vendors).map((vendor) => {
              const key = String(vendor.vendorId || vendor.vendorName);
              const open = Boolean(expandedVendors[key]);
              return (
                <Card key={key} className="overflow-hidden rounded-md">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/40"
                    onClick={() => toggleVendor(key)}
                  >
                    <div className="font-medium">{open ? "v" : ">"} {vendor.vendorDisplay || vendor.vendorName}</div>
                    <div className="grid min-w-[420px] grid-cols-4 gap-3 text-right text-sm">
                      <span>{inr(vendor.billed)}</span>
                      <span>{inr(vendor.paid)}</span>
                      <span>{inr(vendor.credited)}</span>
                      <span className="font-semibold">{inr(vendor.outstanding)}</span>
                    </div>
                  </button>
                  {open && (
                    <div className="overflow-x-auto border-t">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/35 text-muted-foreground">
                          <tr>
                            <th className="px-4 py-2 text-left">Bill Number</th>
                            <th className="px-4 py-2 text-left">Billed Date</th>
                            <th className="px-4 py-2 text-right">Billed</th>
                            <th className="px-4 py-2 text-right">Paid</th>
                            <th className="px-4 py-2 text-right">Debit Note</th>
                            <th className="px-4 py-2 text-right">Outstanding</th>
                            <th className="px-4 py-2 text-left">Paid Date</th>
                            <th className="px-4 py-2 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(vendor.records || []).map((record: any) => (
                            <tr key={`${record.sourceType || "row"}-${record.id}`} className="border-t">
                              <td className="px-4 py-2">{record.billNumber}</td>
                              <td className="px-4 py-2">{String(record.billedDate || "").slice(0, 10)}</td>
                              <td className="px-4 py-2 text-right">{inr(record.billedAmount)}</td>
                              <td className="px-4 py-2 text-right">{inr(record.paidAmount)}</td>
                              <td className="px-4 py-2 text-right">{inr(record.debitNote)}</td>
                              <td className="px-4 py-2 text-right">{inr(record.outstanding)}</td>
                              <td className="px-4 py-2">{record.paidDate || "-"}</td>
                              <td className="px-4 py-2">{record.status || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              );
            })}
          </TabsContent>
          <TabsContent value="coa" className="space-y-4">
            {can("accounts.chart_of_accounts.create") && (
              <div className="flex justify-end">
                <Button onClick={() => openManual("account")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Account
                </Button>
              </div>
            )}
            {["Asset", "Liability", "Equity", "Revenue", "Expense"].map((type) => {
              const categoryAccounts = f(coa).filter(
                (a: any) => String(a.accountType || "").toLowerCase() === type.toLowerCase()
              );
              if (!categoryAccounts.length && search) return null;
              const categoryTotal = categoryAccounts.reduce(
                (sum: number, a: any) => sum + numberValue(a.currentBalance),
                0
              );
              const isTypeExpanded = expandedTypes[type] !== false;

              return (
                <Card key={type} className="overflow-hidden border border-border shadow-xs">
                  <div
                    onClick={() => toggleType(type)}
                    className="flex cursor-pointer items-center justify-between bg-muted/40 px-4 py-3 font-semibold hover:bg-muted/70 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="ghost" className="h-6 w-6 p-0 pointer-events-none">
                        {isTypeExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      <span className="text-base text-foreground font-bold">{type}</span>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary font-semibold">
                        {categoryAccounts.length} {categoryAccounts.length === 1 ? "account" : "accounts"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground font-medium">Category Balance:</span>
                      <span className="text-sm font-bold text-foreground font-mono">
                        {inr(categoryTotal)}
                      </span>
                    </div>
                  </div>

                  {isTypeExpanded && (
                    <div className="divide-y border-t">
                      {!categoryAccounts.length ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No accounts configured under {type}.
                        </div>
                      ) : (
                        categoryAccounts.map((account: any) => {
                          const isAccExpanded = Boolean(expandedAccounts[account.id]);
                          const historyLines = account.lines || [];
                          const isCreditNormalAccount = ["Revenue", "Liability", "Equity"].includes(String(account.accountType));
                          const displayedBalance = isCreditNormalAccount ? Math.abs(numberValue(account.currentBalance)) : numberValue(account.currentBalance);
                          return (
                            <div key={account.id} className="bg-background">
                              <div className="flex flex-wrap items-center justify-between px-4 py-3 hover:bg-muted/20 gap-2">
                                <div className="flex items-center gap-3">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => toggleAccount(account.id)}
                                    title="Toggle Entry History"
                                  >
                                    {isAccExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-primary" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </Button>
                                  <span className="font-mono text-xs font-semibold text-muted-foreground min-w-14">
                                    {account.accountCode}
                                  </span>
                                  <span className="text-sm font-semibold text-foreground">
                                    {account.accountName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm font-bold text-foreground">
                                      {inr(displayedBalance)}
                                    </span>
                                    {isCreditNormalAccount && numberValue(account.currentBalance) > 0 && (
                                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                                        Credit
                                      </span>
                                    )}
                                  </div>
                                  {can("accounts.chart_of_accounts.edit") && !isSystemAccount(account) ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={() => openManual("account", account)}
                                    >
                                      Edit
                                    </Button>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground px-2 py-0.5 bg-muted rounded font-mono">
                                      System
                                    </span>
                                  )}
                                </div>
                              </div>

                              {isAccExpanded && (
                                <div className="bg-muted/15 p-4 border-t">
                                  <div className="mb-2 flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                      Entry History & Ledger Movement
                                    </h4>
                                    <span className="text-[11px] text-muted-foreground font-medium">
                                      {historyLines.length} {historyLines.length === 1 ? "entry" : "entries"} recorded
                                    </span>
                                  </div>
                                  {!historyLines.length ? (
                                    <div className="rounded-md border bg-background p-3 text-center text-xs text-muted-foreground">
                                      No entry history recorded for this account.
                                    </div>
                                  ) : (
                                    <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-md border bg-background">
                                      <table className="w-full text-xs">
                                        <thead className="bg-muted/40 font-semibold text-muted-foreground">
                                          <tr>
                                            <th className="px-3 py-2 text-left">Date of Payment</th>
                                            <th className="px-3 py-2 text-left">Source</th>
                                            <th className="px-3 py-2 text-left">Customer/Vendor</th>
                                            <th className="px-3 py-2 text-left">Customer/Vendor ID</th>
                                            <th className="px-3 py-2 text-left">Reference ID</th>
                                            <th className="px-3 py-2 text-left">Description</th>
                                            <th className="px-3 py-2 text-right">Debit Amount</th>
                                            <th className="px-3 py-2 text-right">Credit Amount</th>
                                            <th className="px-3 py-2 text-right">Running Balance (₹)</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                          {historyLines.map((line: any, idx: number) => (
                                            <tr key={line.id || idx} className="hover:bg-muted/10">
                                              <td className="px-3 py-1.5 font-mono text-muted-foreground">
                                                {String(line.paymentDate || line.entryDate || "").slice(0, 10) || "—"}
                                              </td>
                                              <td className="px-3 py-1.5 font-medium">
                                                {line.source || line.sourceType || "Manual"}
                                              </td>
                                              <td className="px-3 py-1.5">
                                                {line.partyName || "N/A"}
                                              </td>
                                              <td className="px-3 py-1.5 font-mono text-muted-foreground">
                                                {line.partyId || "N/A"}
                                              </td>
                                              <td className="px-3 py-1.5 font-mono">
                                                {line.referenceId || line.reference || line.sourceId || "—"}
                                              </td>
                                              <td className="px-3 py-1.5 text-muted-foreground">
                                                {line.description || "—"}
                                              </td>
                                              <td className="px-3 py-1.5 text-right font-mono text-emerald-600 font-semibold">
                                                {line.debit ? inr(line.debit) : "—"}
                                              </td>
                                              <td className="px-3 py-1.5 text-right font-mono text-blue-600 font-semibold">
                                                {line.credit ? inr(line.credit) : "—"}
                                              </td>
                                              <td className="px-3 py-1.5 text-right font-mono font-bold">
                                                {inr(line.runningBalance)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </TabsContent>
          <TabsContent value="bankcash" className="space-y-3">
            <Card className="rounded-md border bg-white shadow-sm">
              <CardHeader><CardTitle className="text-base">Bank & Cash Transaction</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-5">
                <select className="h-10 rounded-md border px-3 text-sm" value={bankForm.mode} onChange={(e) => setBankForm({ ...bankForm, mode: e.target.value })}><option>Credit</option><option>Debit</option><option>Transfer</option></select>
                <select className="h-10 rounded-md border px-3 text-sm md:col-span-2" value={bankForm.bankCashAccountId} onChange={(e) => setBankForm({ ...bankForm, bankCashAccountId: e.target.value })}>
                  <option value="">From / Chart of Account</option>{coa.map((a: any) => <option key={a.id} value={a.id}>{a.accountCode} - {a.accountName}</option>)}
                </select>
                {bankForm.mode === "Transfer" ? <select className="h-10 rounded-md border px-3 text-sm md:col-span-2" value={bankForm.transferToAccountId} onChange={(e) => setBankForm({ ...bankForm, transferToAccountId: e.target.value })}><option value="">Transfer to</option>{coa.map((a: any) => <option key={a.id} value={a.id}>{a.accountCode} - {a.accountName}</option>)}</select> : <select className="h-10 rounded-md border px-3 text-sm md:col-span-2" value={bankForm.counterAccountId} onChange={(e) => setBankForm({ ...bankForm, counterAccountId: e.target.value })}><option value="">Counter account (optional)</option>{coa.map((a: any) => <option key={a.id} value={a.id}>{a.accountCode} - {a.accountName}</option>)}</select>}
                <Input type="number" step="0.01" placeholder="Amount" value={bankForm.amount} onChange={(e) => setBankForm({ ...bankForm, amount: e.target.value })} />
                <Input type="date" value={bankForm.transactionDate} onChange={(e) => setBankForm({ ...bankForm, transactionDate: e.target.value })} />
                <Input placeholder="Reference (optional)" value={bankForm.reference} onChange={(e) => setBankForm({ ...bankForm, reference: e.target.value })} />
                <Input placeholder="Remarks (optional)" value={bankForm.remarks} onChange={(e) => setBankForm({ ...bankForm, remarks: e.target.value })} />
                <Button disabled={submitting || !bankForm.bankCashAccountId || !bankForm.amount} onClick={() => void submitBankCash()}>Submit for Approval</Button>
              </CardContent>
            </Card>
            <Table rows={f(bankCash.filter((row) => row.transactionTypeName !== "Opening Balance"))} cols={[
              ["Date", "transactionDate"], ["Reference", "reference"], ["Type", "transactionTypeName"], ["Mode", "mode"], ["Amount", "amount", inr], ["Status", "approvalStatus", statusBadge],
              ["Actions", "id", (_: any, row: any) => row.approvalStatus === "Pending Approval" && can("accounts.bank_cash.approve") ? <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void bankCashDecision(row, "approve")}>Approve</Button><Button size="sm" variant="outline" onClick={() => setBankDecision({ row, remarks: "" })}>Reject</Button></div> : "—"],
              ["Reject Remarks", "rejectionRemarks", (value: any) => String(value || "").trim() || "-"],
              ["Notes", "remarks", (value: any) => String(value || "").trim() || "—"],
            ]} />
          </TabsContent>
          {/* DISABLED: Masters module is not required for this phase */}
          {/* <TabsContent value="masters" className="space-y-3">
            <Table rows={f(masters.transactionTypes || [])} cols={[
              ["Code", "code"], ["Name", "name"], ["Direction", "direction"], ["Tally Voucher", "tallyVoucherType"], ["Active", "isActive", (v: any) => v === false ? "No" : "Yes"],
              ["Actions", "id", (_: any, row: any) => <Button size="sm" variant="outline" onClick={() => void saveTransactionType(row, { isActive: row.isActive === false })}>{row.isActive === false ? "Enable" : "Disable"}</Button>],
            ]} />
            <Card className="rounded-md border bg-white shadow-sm"><CardHeader><CardTitle className="text-base">Accounts Data Sources</CardTitle></CardHeader><CardContent className="grid gap-2 md:grid-cols-2">{Object.entries(masters.sourceRegistry || {}).map(([key, value]: any) => <div key={key} className="rounded border p-3"><p className="font-medium capitalize">{key.replace(/([A-Z])/g, " $1")}</p><p className="text-xs text-muted-foreground">{(value || []).join(", ")}</p></div>)}</CardContent></Card>
          </TabsContent> */}
          <TabsContent value="tally" className="space-y-3">
            <Card className="rounded-md border bg-white shadow-sm"><CardHeader><CardTitle className="text-base">TallyPrime Export</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3">{can("accounts.tally.export") ? <><Button variant="outline" disabled={submitting} onClick={() => void exportTallyFile("xml")}>Export Chart of Accounts + Posted Vouchers XML</Button><Button variant="outline" disabled={submitting} onClick={() => void exportTallyXlsx()}>Export Chart of Accounts + Posted Vouchers XLSX</Button><Button variant="outline" disabled={submitting} onClick={() => void exportTallyFile("csv")}>Export Chart of Accounts + Posted Vouchers CSV</Button></> : <p className="text-sm text-muted-foreground">You need Tally export permission.</p>}</CardContent></Card>
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
                    ["Notes", "notes"],
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
                          {row.approvalStatus === "Approved" &&
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
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            title="Delete"
                            aria-label={`Delete ${row.invoiceNumber}`}
                            onClick={() => void deleteReceivable(row)}
                            disabled={submitting || row.sourceType !== "Manual"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ),
                    ],
                    ["Notes", "notes"],
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
                    ["Notes", "notes"],
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
                ["Notes", "notes", (_value: any, row: any) => row.metadata?.notes || "—"],
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
                  ? (manual.id ? "Edit Ledger Account" : "Add Ledger Account")
                  : manualType === "journal"
                    ? "New Journal Entry"
                    : manualType === "ap"
                      ? `Add ${manual.entryType || "Payable"}`
                      : `Add ${manual.entryType || "Receivable"}`}
              </DialogTitle>
            </DialogHeader>
            {manualType && (
              <div className="grid gap-4 sm:grid-cols-2">
                {error && (
                  <div className="sm:col-span-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    {error}
                  </div>
                )}
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
                            {a.accountCode} - {a.accountName}
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
                            {a.accountCode} - {a.accountName}
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
                        onChange={(e) => setManual((current: any) => ({ ...current, amount: e.target.value, paidAmount: current.entryType === "Debit Note" ? e.target.value : current.paidAmount, receivedAmount: current.entryType === "Credit Note" ? e.target.value : current.receivedAmount }))}
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
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={manual.vendorId || ""}
                        onChange={(e) => selectVendor(e.target.value)}
                      >
                        <option value="">Select vendor</option>
                        {crmVendors.map((vendor) => (
                          <option key={vendor.id} value={vendor.id}>
                            {vendor.displayName || `${vendor.name} - ${vendor.contactCode}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        {manual.entryType === "Debit Note"
                          ? "Debit Note #"
                          : "Bill #"}{" "}
                        *
                      </Label>
                      {manual.entryType === "Debit Note" ? (
                        <Input value={manual.billNumber || ""} onChange={(e) => setManualField("billNumber", e.target.value)} />
                      ) : (
                        <Input list="accounts-ap-documents" value={manual.billNumber || ""} onChange={(e) => selectApDocument(e.target.value)} />
                      )}
                      <datalist id="accounts-ap-documents">
                        {apDocuments.map((doc) => (
                          <option key={doc.id} value={doc.displayName} />
                        ))}
                      </datalist>
                    </div>
                    {manual.entryType === "Debit Note" && (
                      <div className="space-y-1.5">
                        <Label>Against Bill *</Label>
                        <select className="h-10 w-full rounded-md border bg-background px-3" value={manual.againstBillNumber || ""} onChange={(e) => selectApDocument(e.target.value)}>
                          <option value="">Select paid/partial bill</option>
                          {apDocuments.map((doc) => <option key={doc.id} value={doc.billNumber}>{doc.displayName || doc.billNumber}</option>)}
                        </select>
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
                        onChange={(e) => setManual((current: any) => ({ ...current, amount: e.target.value, paidAmount: current.entryType === "Debit Note" ? e.target.value : current.paidAmount, receivedAmount: current.entryType === "Credit Note" ? e.target.value : current.receivedAmount }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Paid Amount</Label>
                      <Input
                        readOnly={manual.entryType === "Debit Note"}
                        type="number"
                        min="0"
                        step="0.01"
                        value={manual.paidAmount || ""}
                        onChange={(e) =>
                          setManualField("paidAmount", e.target.value)
                        }
                      />
                    </div>{manual.entryType !== "Debit Note" && (
                      <div className="space-y-1.5">
                        <Label>Adjusted Amount</Label>
                        <Input type="number" min="0" step="0.01" value={manual.adjustedAmount || ""} onChange={(e) => setManualField("adjustedAmount", e.target.value)} />
                      </div>
                    )}
{manual.entryType === "Debit Note" && (
                      <div className="space-y-1.5">
                        <Label>Account Name *</Label>
                        <select className="h-10 w-full rounded-md border bg-background px-3" value={manual.coaAccountId || ""} onChange={(e) => setManualField("coaAccountId", e.target.value)}>
                          <option value="">Select account</option>
                          {coa.map((account: any) => <option key={account.id} value={account.id}>{account.accountCode} - {account.accountName}</option>)}
                        </select>
                      </div>
                    )}
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
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={manual.clientId || ""}
                        onChange={(e) => selectClient(e.target.value)}
                      >
                        <option value="">Select customer</option>
                        {crmClients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.displayName || `${client.name} - ${client.contactCode}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        {manual.entryType === "Credit Note"
                          ? "Credit Note #"
                          : "Invoice #"}{" "}
                        *
                      </Label>
                      <Input
                        list={manual.entryType === "Credit Note" ? undefined : "accounts-ar-documents"}
                        value={manual.invoiceNumber || ""}
                        onChange={(e) => setManualField("invoiceNumber", e.target.value)}
                      />
                      <datalist id="accounts-ar-documents">
                        {arDocuments.map((doc) => (
                          <option key={doc.id} value={doc.displayName} />
                        ))}
                      </datalist>
                    </div>
                    {manual.entryType === "Credit Note" && (
                      <div className="space-y-1.5">
                        <Label>Linked Invoice *</Label>
                        <select className="h-10 w-full rounded-md border bg-background px-3" value={manual.linkedInvoiceNumber || ""} onChange={(e) => selectLinkedArInvoice(e.target.value)}>
                          <option value="">Select paid/partial invoice</option>
                          {arDocuments.map((doc) => <option key={doc.id} value={doc.invoiceNumber}>{doc.displayName || doc.invoiceNumber}</option>)}
                        </select>
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
                        onChange={(e) => setManual((current: any) => ({ ...current, amount: e.target.value, paidAmount: current.entryType === "Debit Note" ? e.target.value : current.paidAmount, receivedAmount: current.entryType === "Credit Note" ? e.target.value : current.receivedAmount }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Received Amount</Label>
                      <Input
                        readOnly={manual.entryType === "Credit Note"}
                        type="number"
                        min="0"
                        step="0.01"
                        value={manual.receivedAmount || ""}
                        onChange={(e) =>
                          setManualField("receivedAmount", e.target.value)
                        }
                      />
                    </div>{manual.entryType !== "Credit Note" && (
                      <div className="space-y-1.5">
                        <Label>Adjusted Amount</Label>
                        <Input type="number" min="0" step="0.01" value={manual.adjustedAmount || ""} onChange={(e) => setManualField("adjustedAmount", e.target.value)} />
                      </div>
                    )}
                    {manual.entryType === "Credit Note" && (
                      <div className="space-y-1.5">
                        <Label>Account Name *</Label>
                        <select className="h-10 w-full rounded-md border bg-background px-3" value={manual.coaAccountId || ""} onChange={(e) => setManualField("coaAccountId", e.target.value)}>
                          <option value="">Select account</option>
                          {coa.map((account: any) => <option key={account.id} value={account.id}>{account.accountCode} - {account.accountName}</option>)}
                        </select>
                      </div>
                    )}
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
              <Button onClick={() => void submitManual()} disabled={submitting || ((manual.entryType === "Credit Note" || manual.entryType === "Debit Note") && !manual.coaAccountId)}>
                {submitting ? "Saving..." : "Save Entry"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(bankDecision)}
          onOpenChange={(open) => {
            if (!open && !submitting) setBankDecision(null);
          }}
        >
          <DialogContent className="max-w-md rounded-md border bg-background shadow-xl">
            <DialogHeader>
              <DialogTitle>Reject Bank & Cash Transaction</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {bankDecision?.row && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="font-medium">{bankDecision.row.reference || bankDecision.row.transactionTypeName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {String(bankDecision.row.transactionDate || "").slice(0, 10)} - {inr(bankDecision.row.amount)}
                  </div>
                </div>
              )}
              <label className="space-y-1.5 text-sm">
                <Label>Rejection Remarks *</Label>
                <Input
                  value={bankDecision?.remarks || ""}
                  onChange={(event) =>
                    setBankDecision((current) =>
                      current ? { ...current, remarks: event.target.value } : current,
                    )
                  }
                  placeholder="Enter reason for rejection"
                />
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBankDecision(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={submitting || !bankDecision?.remarks.trim()}
                onClick={() => bankDecision && void bankCashDecision(bankDecision.row, "reject", bankDecision.remarks.trim())}
              >
                {submitting ? "Rejecting..." : "Reject"}
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
                {error && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    {error}
                  </div>
                )}
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
                  <Label htmlFor="ap-payment-amount">Payment Amount</Label>
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
                <div className="space-y-1.5">
                  <Label htmlFor="ap-account-name">Account Name *</Label>
                  <select
                    id="ap-account-name"
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={apSettlementAccountId}
                    onChange={(event) => setApSettlementAccountId(event.target.value)}
                    required
                  >
                    <option value="">Select account</option>
                    {coa.filter((account) => account.isActive !== false).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.accountName} ({account.accountCode})
                      </option>
                    ))}
                  </select>
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
                disabled={submitting || !settlementAmount || !apSettlementAccountId}
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
                {error && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    {error}
                  </div>
                )}
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
                  <Label htmlFor="payment-amount">Payment Amount</Label>
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
                <div className="space-y-1.5">
                  <Label htmlFor="ar-account-name">Account Name *</Label>
                  <select
                    id="ar-account-name"
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={arPayment.settlementAccountId}
                    onChange={(event) => setArPayment((value) => ({
                      ...value,
                      settlementAccountId: event.target.value,
                    }))}
                    required
                  >
                    <option value="">Select account</option>
                    {coa.filter((account) => account.isActive !== false).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.accountName} ({account.accountCode})
                      </option>
                    ))}
                  </select>
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
                disabled={submitting || !paymentAmount || !arPayment.settlementAccountId}
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


