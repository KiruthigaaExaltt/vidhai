import { parseReceivableSheet } from "./receivableImport";
import { parsePayableSheet } from "./payableImport";
const SYSTEM_ACCOUNT_CODES = new Set(["1030", "1100", "1200", "2100", "2200", "3000", "3100", "4100", "5100", "5140", "5150", "5160"]);
const SYSTEM_ACCOUNT_NAMES = new Set(["Input CGST", "Input SGST", "Input IGST", "Output CGST", "Output SGST", "Output IGST"]);
const isSystemAccount = (account: any) => SYSTEM_ACCOUNT_CODES.has(String(account?.accountCode || "")) || SYSTEM_ACCOUNT_NAMES.has(String(account?.accountName || ""));

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  DollarSign,
  Download,
  Eye,
  EyeOff,
  FileDown,
  FileUp,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  X,
  LogOut,
  LayoutDashboard,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Users,
  Building2,
  FileSpreadsheet,
  Layers,
  Briefcase,
  FileBarChart,
  Sliders,
} from "lucide-react";
import { DataPagination } from "@/components/ui/data-pagination";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { useToast } from "@/hooks/use-toast";
import { notifyModuleLocked, lockModule } from "@/components/security/ModuleEncryptionGate";
import { FinancialStatements } from "./FinancialStatements";
import { FinanceDashboard } from "./FinanceDashboard";
import { parseBankCashSheet } from "./bankCashImport";
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
type AccountImportKind = "bankCash" | "apBill" | "apDebitNote" | "arInvoice" | "arCreditNote" | "journal";
const paymentMethods = ["Bank Transfer", "UPI", "Cheque", "Cash"];
const emptyBankForm = () => ({ mode: "Credit", transactionTypeId: "", transactionTypeName: "", bankCashAccountId: "", transferToAccountId: "", counterAccountId: "", creditContactId: "", debitContactId: "", amount: "", transactionDate: new Date().toISOString().slice(0, 10), reference: "", remarks: "", clientId: "", paymentMethod: "Bank Transfer", period: "", bankCharges: "", transactionFees: "" });

interface AccountsTableContextValue {
  listPaging: Record<"j" | "ap" | "ar", { page: number; size: number }>;
  listMeta: Record<"j" | "ap" | "ar", { totalCount: number; totalPages: number }>;
  setListPaging: React.Dispatch<
    React.SetStateAction<Record<"j" | "ap" | "ar", { page: number; size: number }>>
  >;
  loading: boolean;
}

const AccountsTableContext = createContext<AccountsTableContextValue | null>(null);

const tableScrollPositions = new Map<string, { left: number; top: number }>();

const Table = ({
  rows,
  cols,
  showFooter = true,
  serverKey,
  tableId,
}: {
  rows: any[];
  cols: [string, string, ((v: any, row: any) => React.ReactNode)?][];
  showFooter?: boolean;
  serverKey?: "j" | "ap" | "ar";
  tableId?: string;
}) => {
  const context = useContext(AccountsTableContext);
  const clientPagination = useClientPagination(serverKey ? [] : rows);
  const displayedRows = serverKey ? rows : clientPagination.paginatedRows;
  const containerRef = useRef<HTMLDivElement>(null);
  const tableKey = tableId || serverKey || String(cols[0]?.[0] || "table");

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    tableScrollPositions.set(tableKey, {
      left: e.currentTarget.scrollLeft,
      top: e.currentTarget.scrollTop,
    });
  };

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const saved = tableScrollPositions.get(tableKey);
    if (saved) {
      if (el.scrollLeft !== saved.left) el.scrollLeft = saved.left;
      if (el.scrollTop !== saved.top) el.scrollTop = saved.top;
    }
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const saved = tableScrollPositions.get(tableKey);
    if (!saved) return;
    const raf = requestAnimationFrame(() => {
      if (el && saved) {
        if (el.scrollLeft !== saved.left) el.scrollLeft = saved.left;
        if (el.scrollTop !== saved.top) el.scrollTop = saved.top;
      }
    });
    const timer = setTimeout(() => {
      if (el && saved) {
        if (el.scrollLeft !== saved.left) el.scrollLeft = saved.left;
        if (el.scrollTop !== saved.top) el.scrollTop = saved.top;
      }
    }, 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [displayedRows, tableKey]);

  return (
    <div className="overflow-hidden rounded-md border bg-white">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        data-table-scroll={tableKey}
        className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto"
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-muted shadow-sm">
            <tr>
              {cols.map((c) => (
                <th
                  key={c[0]}
                  className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-3 py-2.5 text-left font-medium max-w-[220px] break-words align-top border-b"
                >
                  {c[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((r, i) => (
              <tr key={r.id ?? i} className="border-t">
                {cols.map((c) => (
                  <td key={c[1]} className="px-3 py-2 max-w-[240px] break-words align-top">
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
      {showFooter && context && (
        <DataPagination
          currentPage={
            serverKey
              ? context.listPaging[serverKey].page
              : clientPagination.currentPage
          }
          pageSize={
            serverKey ? context.listPaging[serverKey].size : clientPagination.pageSize
          }
          totalCount={
            serverKey
              ? context.listMeta[serverKey].totalCount
              : clientPagination.totalCount
          }
          totalPages={serverKey ? context.listMeta[serverKey].totalPages : undefined}
          onPageChange={(page) =>
            serverKey
              ? context.setListPaging((current) => ({
                  ...current,
                  [serverKey]: { ...current[serverKey], page },
                }))
              : clientPagination.setCurrentPage(page)
          }
          onPageSizeChange={(size) =>
            serverKey
              ? context.setListPaging((current) => ({
                  ...current,
                  [serverKey]: { page: 1, size },
                }))
              : clientPagination.setPageSize(size)
          }
          loading={context.loading}
        />
      )}
    </div>
  );
};

export default function Accounts() {
  const { can } = useAuth();
  const { toast } = useToast();
  const [summary, setSummary] = useState<any>({}),
    [coa, setCoa] = useState<any[]>([]),
    [journals, setJournals] = useState<any[]>([]),
    [ap, setAp] = useState<any[]>([]),
    [ar, setAr] = useState<any[]>([]),
    [customers, setCustomers] = useState<any[]>([]),
    [vendors, setVendors] = useState<any[]>([]),
    [crmClients, setCrmClients] = useState<any[]>([]),
    [crmVendors, setCrmVendors] = useState<any[]>([]),
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
    [paymentAp, setPaymentAp] = useState<any | null>(null),
    [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({}),
    [expandedVendors, setExpandedVendors] = useState<Record<string, boolean>>({}),
    [paymentAmount, setPaymentAmount] = useState(""),
    [paymentApAmount, setPaymentApAmount] = useState(""),
    [apSettlementAccountId, setApSettlementAccountId] = useState(""),
    [arFromDate, setArFromDate] = useState(""),
    [arToDate, setArToDate] = useState(""),
    [arCustomer, setArCustomer] = useState("All"),
    [submitting, setSubmitting] = useState(false),
    [settlement, setSettlement] = useState<{
      kind: "ap" | "ar";
      row: any;
    } | null>(null),
    [settlementAmount, setSettlementAmount] = useState(""),
    [manualType, setManualType] = useState<"account" | "journal" | null>(null),
    [manual, setManual] = useState<any>({});
  const [accountImport, setAccountImport] = useState<AccountImportKind | null>(null);
  const [accountImportRows, setAccountImportRows] = useState<any[]>([]);
  const [accountImportFile, setAccountImportFile] = useState("");
  const [accountImportOptions, setAccountImportOptions] = useState<any | null>(null);
  const [apSubTab, setApSubTab] = useState("bills");
  const [arSubTab, setArSubTab] = useState("invoices");
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
    fromAccountId: "",
    receiptId: "",
    period: "",
    transactionFees: "",
  });
  const [apPaymentForm, setApPaymentForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: "Bank Transfer",
    bankCharges: "0",
    tdsAmount: "0",
    reference: "",
    notes: "",
    settlementAccountId: "",
    fromAccountId: "",
    toAccountId: "",
    paymentId: "",
    period: "",
    transactionFees: "",
  });
  const [bankForm, setBankForm] = useState(emptyBankForm);
  const [accountDocument, setAccountDocument] = useState<any | null>(null);
  const [historyModal, setHistoryModal] = useState<{
    title: string;
    reference?: string;
    contactName?: string;
    payments: any[];
  } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: "payable" | "receivable";
    row: any;
    title: string;
    description: string;
  } | null>(null);
  const accountTabGroups = [
    {
      group: "Overview",
      icon: LayoutDashboard,
      badgeStyle:
        "bg-emerald-50/90 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200/70 dark:border-emerald-800/60",
      tabs: [
        ["dashboard", "Dashboard", "accounts.finance_dashboard.view", LayoutDashboard] as const,
      ],
    },
    {
      group: "Daily Work",
      icon: Briefcase,
      badgeStyle:
        "bg-sky-50/90 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200/70 dark:border-sky-800/60",
      tabs: [
        ["bankcash", "Bank & Cash", "accounts.bank_cash.view", Wallet] as const,
        ["ar", "Receivables", "accounts.accounts_receivable.view", ArrowDownLeft] as const,
        ["ap", "Payables", "accounts.accounts_payable.view", ArrowUpRight] as const,
        ["customers", "Customer Ledger", "accounts.customer_ledger.view", Users] as const,
        ["vendors", "Vendor Ledger", "accounts.vendor_ledger.view", Building2] as const,
      ],
    },
    {
      group: "Reports",
      icon: FileBarChart,
      badgeStyle:
        "bg-purple-50/90 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200/70 dark:border-purple-800/60",
      tabs: [
        ["statements", "Financial Statements", "accounts.financial_statements.view", FileSpreadsheet] as const,
        ["journals", "Journal Entries", "accounts.journal_entries.view", BookOpen] as const,
      ],
    },
    {
      group: "Setup & Audit",
      icon: Sliders,
      badgeStyle:
        "bg-amber-50/90 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200/70 dark:border-amber-800/60",
      tabs: [
        ["coa", "Chart of Accounts", "accounts.chart_of_accounts.view", Layers] as const,
        ["tally", "Tally Export", "accounts.tally.view", Download] as const,
      ],
    },
  ];
  const visibleAccountGroups = accountTabGroups
    .map((section) => ({
      ...section,
      tabs: section.tabs.filter(([, , permission]) => can(permission)),
    }))
    .filter((section) => section.tabs.length);
  const visibleAccountTabs = visibleAccountGroups.flatMap((section) => section.tabs);
  const today = new Intl.DateTimeFormat("en-CA").format(new Date());
  const openManual = (
    type: "account" | "journal",
    seed: any = {},
  ) => {
    setManualType(type);
    setError("");
    setManual({
      entryDate: today,
      accountCode: "",
      accountName: "",
      accountType: "Asset",
      description: "",
      reference: "",
      debitAccountId: "",
      creditAccountId: "",
      amount: "",
      memo: "",
      ...seed,
      openingBalance: seed.openingBalance ?? seed.currentBalance ?? "",
    });
  };
  const setManualField = (key: string, value: any) =>
    setManual((current: any) => ({ ...current, [key]: value }));
  const submitManual = async () => {
    if (!manualType) return;
    setSubmitting(true);
    setError("");
    try {
      if (manualType === "account") {
        if (!manual.accountCode?.trim() || !manual.accountName?.trim()) {
          throw Error("Account Code and Account Name are required.");
        }
        await api(manual.id ? `/coa/${manual.id}` : "/coa", {
          method: manual.id ? "PATCH" : "POST",
          body: JSON.stringify({
            accountCode: manual.accountCode?.trim(),
            accountName: manual.accountName?.trim(),
            accountType: manual.accountType,
            description: manual.description || "",
            openingBalance: numberValue(manual.openingBalance ?? manual.currentBalance),
            isActive: manual.isActive !== false,
          }),
        });
      }
      if (manualType === "journal") {
        if (manual.entryDate && manual.entryDate > today) {
          throw Error("Entry Date cannot be a future date");
        }
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
        ) {
          throw Error(
            "Choose two different accounts and enter a positive amount.",
          );
        }
        if (!manual.reference?.trim() || !manual.description?.trim()) {
          throw Error("Reference and Description are required.");
        }
        await api("/journal-entries", {
          method: "POST",
          body: JSON.stringify({
            entryDate: manual.entryDate || today,
            reference: manual.reference?.trim(),
            description: manual.description?.trim(),
            sourceType: "Manual",
            sourceId: null,
            metadata: { notes: manual.notes || manual.memo || "" },
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
    const fullCoa = can("accounts.chart_of_accounts.view");
    const bankOptions = can("accounts.bank_cash.view") && !fullCoa;
    const calls = [
      ...(can("accounts.finance_dashboard.view")
        ? [["s", "/dashboard-summary"]]
        : []),
      ...(fullCoa || (!bankOptions && can("accounts.journal_entries.view") && !can("accounts.accounts_receivable.edit") && !can("accounts.accounts_payable.edit"))
        ? [["c", "/coa"]]
        : []),
      ...(!fullCoa && !bankOptions &&
        (can("accounts.accounts_receivable.edit") ||
          can("accounts.accounts_payable.edit"))
        ? [["paymentCoa", `/payment-accounts?context=${can("accounts.accounts_receivable.edit") ? "ar" : "ap"}`]]
        : []),
      // DISABLED: Masters module is not required for this phase
      // ...(can("accounts.masters.view") ? [["m", "/masters"]] : []),
      ...(can("accounts.accounts_receivable.view") && !bankOptions ? [["clients", "/party-options?type=client&context=ar"]] : []),
      ...(bankOptions || (can("accounts.bank_cash.view") && !can("accounts.accounts_receivable.view"))
        ? [["bankOptions", `/bank-cash-transactions/options${fullCoa ? "?clientsOnly=1" : ""}`]] : []),
      ...(can("accounts.accounts_payable.view") ? [["vendorsOpt", "/party-options?type=vendor&context=ap"]] : []),
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
      if (k === "bankOptions") {
        const options = v as any;
        if (options.accounts.length) setCoa(options.accounts);
        setCrmClients(options.clients);
      }
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
  const [lockingLedger, setLockingLedger] = useState(false);
  const handleLockLedger = async () => {
    setLockingLedger(true);
    try {
      await lockModule("ledger");
    } catch {
      notifyModuleLocked("ledger");
    } finally {
      setLockingLedger(false);
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
  const payableOutstanding = (row: any) =>
    Math.max(
      0,
      numberValue(row?.amount) -
      numberValue(row?.paidAmount) -
      numberValue(row?.adjustedAmount),
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
    const scrollY = window.scrollY;
    const tableKey = apSubTab === "debit-notes" ? "ap-debit-notes" : "ap-bills";
    const tableEl = document.querySelector(`[data-table-scroll="${tableKey}"]`) as HTMLDivElement | null;
    if (tableEl) {
      tableScrollPositions.set(tableKey, {
        left: tableEl.scrollLeft,
        top: tableEl.scrollTop,
      });
    }
    setSubmitting(true);
    setError("");
    try {
      await api(`/ap/${row.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ remarks: action === "approve" ? "Approved" : "Rejected" }),
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
      const restore = () => {
        window.scrollTo({ top: scrollY, behavior: "instant" });
        const el = document.querySelector(`[data-table-scroll="${tableKey}"]`) as HTMLDivElement | null;
        const saved = tableScrollPositions.get(tableKey);
        if (el && saved) {
          el.scrollLeft = saved.left;
          el.scrollTop = saved.top;
        }
      };
      requestAnimationFrame(restore);
      setTimeout(restore, 50);
    }
  };
  const openApPayment = (row: any) => {
    setPaymentAp(row);
    setPaymentApAmount(String(payableOutstanding(row)));
    const defaultFrom = String(coa.find((a) => a.accountCode !== "2100" && a.isActive !== false)?.id || "");
    const payableAccount = coa.find((a) => a.accountCode === "2100" && a.isActive !== false);
    setApPaymentForm({
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: "Bank Transfer",
      fromAccountId: defaultFrom,
      settlementAccountId: defaultFrom,
      toAccountId: String(payableAccount?.id || ""),
      paymentId: crypto.randomUUID(),
      reference: String(row.billNumber || row.reference || row.invoiceNumber || ""),
      notes: "",
      period: "",
      transactionFees: "",
      bankCharges: "0",
      tdsAmount: "0",
    });
    setError("");
  };
  const recordApPayment = async () => {
    if (!paymentAp) return;
    if (!apPaymentForm.paymentDate || !apPaymentForm.fromAccountId || !apPaymentForm.toAccountId) {
      setError("Payment Date, From Account and To Account are required");
      return;
    }
    const amount = numberValue(paymentApAmount);
    if (!(amount > 0) || amount > payableOutstanding(paymentAp) + 0.009) {
      setError("Enter a payment amount greater than zero and not more than the balance.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (paymentAp.sourceType === "Purchase Invoice" && paymentAp.sourceId) {
        await flexApi("/vendor-payments", {
          method: "POST",
          body: JSON.stringify({
            vendorName: paymentAp.vendorName,
            invoiceReference: paymentAp.billNumber,
            payableId: paymentAp.id,
            amount,
            settlementAccountId: Number(apPaymentForm.fromAccountId),
            fromAccountId: Number(apPaymentForm.fromAccountId),
            toAccountId: Number(apPaymentForm.toAccountId),
            recordImmediately: true,
            paymentDate: apPaymentForm.paymentDate,
            paymentMode: apPaymentForm.paymentMethod,
            paymentMethod: apPaymentForm.paymentMethod,
            transactionReference: apPaymentForm.reference,
            notes: apPaymentForm.notes,
            bankCharges: numberValue(apPaymentForm.bankCharges),
            tdsAmount: numberValue(apPaymentForm.tdsAmount),
          }),
        });
      } else {
        await api(`/ap/${paymentAp.id}/payment`, {
          method: "POST",
          body: JSON.stringify({
            amount,
            paymentDate: apPaymentForm.paymentDate,
            fromAccountId: Number(apPaymentForm.fromAccountId),
            toAccountId: Number(apPaymentForm.toAccountId),
            settlementAccountId: Number(apPaymentForm.fromAccountId),
            paymentMethod: apPaymentForm.paymentMethod,
            reference: apPaymentForm.reference,
            notes: apPaymentForm.notes,
            paymentId: apPaymentForm.paymentId,
            period: apPaymentForm.period,
            transactionFees: apPaymentForm.transactionFees,
            bankCharges: apPaymentForm.bankCharges,
            tdsAmount: numberValue(apPaymentForm.tdsAmount),
          }),
        });
      }
      setPaymentAp(null);
      setPaymentApAmount("");
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
    setArPayment((value) => ({ ...value, paymentDate: new Date().toISOString().slice(0, 10), fromAccountId: String(coa.find((account) => account.accountCode === "1100" && account.isActive !== false)?.id || ""), settlementAccountId: "", receiptId: crypto.randomUUID(), reference: String(row.invoiceNumber || row.reference || row.billNumber || ""), notes: "", period: "", transactionFees: "", bankCharges: "0" }));
  };
  const reviewAr = async (row: any, action: "approve" | "reject") => {
    const scrollY = window.scrollY;
    const tableKey = arSubTab === "credit-notes" ? "ar-credit-notes" : "ar-invoices";
    const tableEl = document.querySelector(`[data-table-scroll="${tableKey}"]`) as HTMLDivElement | null;
    if (tableEl) {
      tableScrollPositions.set(tableKey, {
        left: tableEl.scrollLeft,
        top: tableEl.scrollTop,
      });
    }
    setSubmitting(true);
    setError("");
    try {
      await api(`/ar/${row.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ remarks: action === "approve" ? "Approved" : "Rejected" }),
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
      const restore = () => {
        window.scrollTo({ top: scrollY, behavior: "instant" });
        const el = document.querySelector(`[data-table-scroll="${tableKey}"]`) as HTMLDivElement | null;
        const saved = tableScrollPositions.get(tableKey);
        if (el && saved) {
          el.scrollLeft = saved.left;
          el.scrollTop = saved.top;
        }
      };
      requestAnimationFrame(restore);
      setTimeout(restore, 50);
    }
  };
  const receivePayment = async () => {
    if (!paymentAr) return;
    if (!arPayment.paymentDate || !arPayment.fromAccountId || !arPayment.settlementAccountId) { setError("Payment Date, From Account and To Account are required"); return; }
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
            fromAccountId: Number(arPayment.fromAccountId), toAccountId: Number(arPayment.settlementAccountId),
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
            bankCharges: arPayment.bankCharges,
            tdsAmount: numberValue(arPayment.tdsAmount),
            settlementAccountId: Number(arPayment.settlementAccountId),
            fromAccountId: Number(arPayment.fromAccountId), toAccountId: Number(arPayment.settlementAccountId),
            paymentMethod: arPayment.paymentMethod, reference: arPayment.reference, notes: arPayment.notes,
            receiptId: arPayment.receiptId, period: arPayment.period, transactionFees: arPayment.transactionFees,
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
  const confirmDeleteReceivable = (row: any) => {
    const isSalesInvoice = row.sourceType === "Sales Invoice";
    setDeleteConfirmation({
      type: "receivable",
      row,
      title: isSalesInvoice ? "Cancel Sales Invoice" : "Delete Receivable",
      description: isSalesInvoice
        ? `Are you sure you want to cancel invoice ${row.invoiceNumber} and remove its receivable and accounting entries?`
        : `Are you sure you want to delete receivable ${row.invoiceNumber}? This action cannot be undone.`,
    });
  };

  const confirmDeletePayable = (row: any) => {
    if (row.sourceType !== "Manual") return;
    setDeleteConfirmation({
      type: "payable",
      row,
      title: "Delete Payable",
      description: `Are you sure you want to delete payable ${row.billNumber}? This action cannot be undone.`,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmation) return;
    const { type, row } = deleteConfirmation;
    setSubmitting(true);
    setError("");
    try {
      if (type === "payable") {
        await api(`/ap/${row.id}`, { method: "DELETE" });
        toast({
          title: "Deleted Successfully",
          description: `Payable ${row.billNumber} has been deleted.`,
        });
      } else if (type === "receivable") {
        if (row.sourceType === "Sales Invoice" && row.sourceId) {
          await salesApi(`/invoices/${row.sourceId}/cancel`, { method: "POST" });
          toast({
            title: "Invoice Cancelled",
            description: `Invoice ${row.invoiceNumber} has been cancelled and removed.`,
          });
        } else {
          await api(`/ar/${row.id}`, { method: "DELETE" });
          toast({
            title: "Deleted Successfully",
            description: `Receivable ${row.invoiceNumber} has been deleted.`,
          });
        }
      }
      setDeleteConfirmation(null);
      await load();
    } catch (e: any) {
      setError(e.message);
      toast({
        title: "Delete Failed",
        description: e.message || "Unable to delete record.",
        variant: "destructive",
      });
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
      await api("/bank-cash-transactions", { method: "POST", body: JSON.stringify({ ...bankForm, transactionTypeName: bankForm.transactionTypeName || type?.name || "Bank/Cash Transaction", transactionTypeId: bankForm.transactionTypeId ? Number(bankForm.transactionTypeId) : undefined, bankCashAccountId: Number(bankForm.bankCashAccountId), transferToAccountId: bankForm.transferToAccountId ? Number(bankForm.transferToAccountId) : undefined, counterAccountId: bankForm.counterAccountId ? Number(bankForm.counterAccountId) : undefined, creditContactId: bankForm.creditContactId ? Number(bankForm.creditContactId) : undefined, debitContactId: bankForm.debitContactId ? Number(bankForm.debitContactId) : undefined, clientId: bankForm.mode === "Credit" ? (bankForm.creditContactId ? Number(bankForm.creditContactId) : undefined) : bankForm.mode === "Debit" ? (bankForm.debitContactId ? Number(bankForm.debitContactId) : undefined) : undefined, amount: numberValue(bankForm.amount), document: accountDocument }) });
      setBankForm(emptyBankForm());
      setAccountDocument(null);
      await load();
    } catch (e: any) { setError(e.message); } finally { setSubmitting(false); }
  };
  const bankCashDecision = async (row: any, action: "approve" | "reject", remarks = "Approved") => {
    if (action === "reject" && !remarks.trim()) return;
    const scrollY = window.scrollY;
    const tableEl = document.querySelector('[data-table-scroll="bank-cash"]') as HTMLDivElement | null;
    if (tableEl) {
      tableScrollPositions.set("bank-cash", {
        left: tableEl.scrollLeft,
        top: tableEl.scrollTop,
      });
    }
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
      const restore = () => {
        window.scrollTo({ top: scrollY, behavior: "instant" });
        const el = document.querySelector('[data-table-scroll="bank-cash"]') as HTMLDivElement | null;
        const saved = tableScrollPositions.get("bank-cash");
        if (el && saved) {
          el.scrollLeft = saved.left;
          el.scrollTop = saved.top;
        }
      };
      requestAnimationFrame(restore);
      setTimeout(restore, 50);
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
  };
  const accountImportConfig = {
    bankCash: {
      title: "Bank & Cash",
      file: "bank-cash",
      endpoint: "/bank-cash-transactions/import",
      exportEndpoint: "/bank-cash-transactions/export",
      exportQuery: "",
      headers: ["Type *", "Account Name", "Counter Account", "Amount *", "Payment Date *", "Reference", "Notes", "Credit Name", "Debit Name", "Payment Method", "Period", "Bank Charges", "Transaction Fees"],
      keys: ["mode", "bankCashAccount", "counterAccount", "amount", "transactionDate", "reference", "remarks", "creditName", "debitName", "paymentMethod", "period", "bankCharges", "transactionFees"],
      dropdowns: { 0: ["Credit", "Debit", "Transfer"], 1: "accounts", 2: "accounts", 7: "clients", 8: "clients", 9: paymentMethods },
    },
    apBill: {
      title: "Pending Bills",
      file: "payable-bills",
      endpoint: "/ap/import",
      exportEndpoint: "/ap/export",
      exportQuery: "entryType=Bill",
      entryType: "Bill",
      headers: ["Vendor *", "Bill Number *", "Bill Date *", "Due Date *", "Amount *", "Paid Amount", "Payment Date", "From Account", "To Account", "Notes"],
      keys: ["vendor", "billNumber", "billDate", "dueDate", "amount", "paidAmount", "paymentDate", "fromAccount", "toAccount", "notes"],
      dropdowns: { 0: "vendors", 7: "accounts", 8: "accounts" },
    },
    apDebitNote: {
      title: "Debit Notes",
      file: "payable-debit-notes",
      endpoint: "/ap/import",
      exportEndpoint: "/ap/export",
      exportQuery: "entryType=Debit Note",
      entryType: "Debit Note",
      headers: ["Vendor *", "Debit Note Number *", "Against Bill *", "Bill Date *", "Due Date *", "Amount *", "Account Name *", "Notes"],
      keys: ["vendor", "billNumber", "againstBillNumber", "billDate", "dueDate", "amount", "accountName", "notes"],
      dropdowns: { 0: "vendors", 6: "accounts" },
    },
    arInvoice: {
      title: "Pending Invoices",
      file: "receivable-invoices",
      endpoint: "/ar/import",
      exportEndpoint: "/ar/export",
      exportQuery: "entryType=Invoice",
      entryType: "Invoice",
      headers: ["Customer *", "Invoice Number *", "Invoice Date *", "Due Date *", "Amount *", "Received Amount", "Payment Date", "From Account", "To Account", "Notes"],
      keys: ["customer", "invoiceNumber", "invoiceDate", "dueDate", "amount", "receivedAmount", "paymentDate", "fromAccount", "toAccount", "notes"],
      dropdowns: { 0: "clients", 7: "accounts", 8: "accounts" },
    },
    arCreditNote: {
      title: "Credit Notes",
      file: "receivable-credit-notes",
      endpoint: "/ar/import",
      exportEndpoint: "/ar/export",
      exportQuery: "entryType=Credit Note",
      entryType: "Credit Note",
      headers: ["Customer *", "Credit Note Number *", "Linked Invoice *", "Invoice Date *", "Due Date *", "Amount *", "Account Name *", "Notes"],
      keys: ["customer", "invoiceNumber", "linkedInvoiceNumber", "invoiceDate", "dueDate", "amount", "accountName", "notes"],
      dropdowns: { 0: "clients", 6: "accounts" },
    },
    journal: {
      title: "Journal Entries",
      file: "journal-entries",
      endpoint: "/journal-entries/import",
      exportEndpoint: "/journal-entries/export",
      exportQuery: "",
      headers: ["Entry Date *", "Reference *", "Description *", "Debit Account *", "Credit Account *", "Amount *", "Memo", "Notes"],
      keys: ["entryDate", "reference", "description", "debitAccount", "creditAccount", "amount", "memo", "notes"],
      dropdowns: { 3: "accounts", 4: "accounts" },
    },
  } as const;
  const localImportOptions = () => ({
    accounts: coa
      .filter((account: any) => account.isActive !== false)
      .map((account: any) => ({ id: account.id, label: `${account.accountCode} - ${account.accountName}` })),
    clients: crmClients
      .map((client: any) => ({ id: client.id, label: client.name || client.displayName || client.clientName || "" }))
      .filter((item: any) => item.label),
    vendors: crmVendors
      .map((vendor: any) => ({ id: vendor.id, label: vendor.name || vendor.displayName || vendor.vendorName || "" }))
      .filter((item: any) => item.label),
  });
  const loadImportOptions = async (kind: AccountImportKind) => {
    const payload = await api(kind === "bankCash" ? "/bank-cash-transactions/options" : `/import-options?context=${kind.startsWith("ap") ? "ap" : kind.startsWith("ar") ? "ar" : "journal"}`);
    const options = kind === "bankCash" ? {
      accounts: payload.accounts.map((account: any) => ({ id: account.id, label: `${account.accountCode} - ${account.accountName}` })),
      clients: payload.clients.map((client: any) => ({ id: client.id, label: client.displayName || client.name })),
    } : payload;
    setAccountImportOptions(options);
    return options;
  };
  const xmlText = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const excelColumn = (index: number) => {
    let value = index + 1;
    let column = "";
    while (value > 0) {
      const remainder = (value - 1) % 26;
      column = String.fromCharCode(65 + remainder) + column;
      value = Math.floor((value - 1) / 26);
    }
    return column;
  };
  const crc32 = (input: Uint8Array) => {
    let crc = -1;
    for (const byte of input) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ -1) >>> 0;
  };
  const uint16 = (value: number) => [value & 255, (value >>> 8) & 255];
  const uint32 = (value: number) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
  const zipStore = (files: { name: string; content: string }[]) => {
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const content = encoder.encode(file.content);
      const crc = crc32(content);
      const local = new Uint8Array([
        ...uint32(0x04034b50), ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0),
        ...uint32(crc), ...uint32(content.length), ...uint32(content.length), ...uint16(name.length), ...uint16(0),
      ]);
      chunks.push(local, name, content);
      central.push(new Uint8Array([
        ...uint32(0x02014b50), ...uint16(20), ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0),
        ...uint32(crc), ...uint32(content.length), ...uint32(content.length), ...uint16(name.length), ...uint16(0), ...uint16(0),
        ...uint16(0), ...uint16(0), ...uint32(0), ...uint32(offset),
      ]), name);
      offset += local.length + name.length + content.length;
    }
    const centralOffset = offset;
    central.forEach((chunk) => { chunks.push(chunk); offset += chunk.length; });
    chunks.push(new Uint8Array([
      ...uint32(0x06054b50), ...uint16(0), ...uint16(0), ...uint16(files.length), ...uint16(files.length),
      ...uint32(offset - centralOffset), ...uint32(centralOffset), ...uint16(0),
    ]));
    const blobParts = chunks.map((chunk) => chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
    return new Blob(blobParts, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  };
  const worksheetXml = (headers: readonly string[], validations: { column: number; optionColumn: number; count: number }[], rows: string[][] = []) => {
    const headerCells = headers.map((header, index) => `<c r="${excelColumn(index)}1"${header.includes("*") ? " s=\"1\"" : ""} t="inlineStr"><is><t>${xmlText(header)}</t></is></c>`).join("");
    const bodyRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 2}">${row.map((cell, columnIndex) => `<c r="${excelColumn(columnIndex)}${rowIndex + 2}" t="inlineStr"><is><t>${xmlText(cell)}</t></is></c>`).join("")}</row>`).join("");
    const validationXml = validations.length
      ? `<dataValidations count="${validations.length}">${validations.map((item) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${excelColumn(item.column)}2:${excelColumn(item.column)}5001"><formula1>'Dropdown Values'!$${excelColumn(item.optionColumn)}$2:$${excelColumn(item.optionColumn)}$${item.count + 1}</formula1></dataValidation>`).join("")}</dataValidations>`
      : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${excelColumn(Math.max(headers.length - 1, 0))}5001"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${headers.map((header, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.max(16, header.length + 4)}" customWidth="1"/>`).join("")}</cols><sheetData><row r="1">${headerCells}</row>${bodyRows}</sheetData>${validationXml}</worksheet>`;
  };
  const downloadXlsxBlob = (blob: Blob, fileName: string) => {
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const downloadAccountTemplate = (kind: AccountImportKind) => {
    const config = accountImportConfig[kind];
    const options = accountImportOptions || localImportOptions();
    const dropdownRows: string[][] = [];
    const validations: { column: number; optionColumn: number; count: number }[] = [];
    Object.entries(config.dropdowns).forEach(([index, source], optionColumn) => {
      const values = (Array.isArray(source) ? source : (options[source] || []).map((item: any) => item.label)).filter(Boolean)
        .filter((label: string) => kind !== "arInvoice" || Number(index) !== 7 || /^1100\s*-/.test(label))
        .filter((label: string) => kind !== "apBill" || Number(index) !== 7 || !/^2100\s*-/.test(label))
        .filter((label: string) => kind !== "apBill" || Number(index) !== 8 || /^2100\s*-/.test(label));
      values.forEach((value: string, rowIndex: number) => {
        dropdownRows[rowIndex] = dropdownRows[rowIndex] || [];
        dropdownRows[rowIndex][optionColumn] = value;
      });
      if (values.length) validations.push({ column: Number(index), optionColumn, count: values.length });
    });
    const files = [
      { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlText(config.title.slice(0, 31))}" sheetId="1" r:id="rId1"/><sheet name="Dropdown Values" sheetId="2" r:id="rId2"/></sheets></workbook>` },
      { name: "xl/styles.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="1" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>` },
      { name: "xl/worksheets/sheet1.xml", content: worksheetXml(config.headers, validations) },
      { name: "xl/worksheets/sheet2.xml", content: worksheetXml(Object.keys(config.dropdowns).map((column) => `${config.headers[Number(column)].replace(" *", "")} Options`), [], dropdownRows) },
    ];
    downloadXlsxBlob(zipStore(files), `${config.file}-template.xlsx`);
  };
  const openAccountImport = (kind: keyof typeof accountImportConfig) => {
    setAccountImport(kind);
    setAccountImportRows([]);
    setAccountImportFile("");
    setAccountImportOptions(localImportOptions());
    setError("");
    void loadImportOptions(kind).catch((error) => setError(error.message));
  };
  const parseAccountImportFile = async (file?: File | null) => {
    if (!accountImport || !file) return;
    setAccountImportFile(file.name);
    setAccountImportRows([]);
    setError("");
    if (!/\.xlsx$/i.test(file.name)) {
      setError("Select an Excel .xlsx file");
      return;
    }
    const config = accountImportConfig[accountImport];
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    let sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (accountImport === "apBill") {
      const match = workbook.SheetNames.find((name) => {
        const s = workbook.Sheets[name];
        if (!s) return false;
        const rows = XLSX.utils.sheet_to_json<any[]>(s, { header: 1, defval: "", raw: false });
        return rows.some((row) => row.some((c) => /vendor/i.test(String(c))) && row.some((c) => /bill/i.test(String(c))));
      }) || workbook.SheetNames.find((name) => /pending\s*bills|bills|payables/i.test(name)) || workbook.SheetNames[0];
      sheet = workbook.Sheets[match];
    } else if (accountImport === "arInvoice") {
      const match = workbook.SheetNames.find((name) => {
        const s = workbook.Sheets[name];
        if (!s) return false;
        const rows = XLSX.utils.sheet_to_json<any[]>(s, { header: 1, defval: "", raw: false });
        return rows.some((row) => row.some((c) => /customer/i.test(String(c))) && row.some((c) => /invoice/i.test(String(c))));
      }) || workbook.SheetNames.find((name) => /unpaid\s*invoices|pending\s*invoices|invoices|receivables/i.test(name)) || workbook.SheetNames[0];
      sheet = workbook.Sheets[match];
    }
    const data = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", raw: false });
    if (accountImport === "bankCash") {
      try {
        const rows = parseBankCashSheet(data);
        if (!rows.length) {
          setError("The Excel worksheet contains no import rows");
          setAccountImportRows([]);
          return;
        }
        if (rows.length > 5000) {
          setError("Maximum 5000 rows can be imported at once");
          setAccountImportRows([]);
          return;
        }
        setAccountImportRows(rows);
      } catch (error: any) {
        setError(error.message);
        setAccountImportRows([]);
      }
      return;
    }
    if (accountImport === "arInvoice") {
      try {
        const rows = parseReceivableSheet(data);
        if (!rows.length) {
          setError("The Excel worksheet contains no import rows");
          setAccountImportRows([]);
          return;
        }
        if (rows.length > 5000) {
          setError("Maximum 5000 rows can be imported at once");
          setAccountImportRows([]);
          return;
        }
        setAccountImportRows(rows);
      } catch (error: any) {
        setError(error.message);
        setAccountImportRows([]);
      }
      return;
    }
    if (accountImport === "apBill") {
      try {
        const rows = parsePayableSheet(data);
        if (!rows.length) {
          setError("The Excel worksheet contains no import rows");
          setAccountImportRows([]);
          return;
        }
        if (rows.length > 5000) {
          setError("Maximum 5000 rows can be imported at once");
          setAccountImportRows([]);
          return;
        }
        setAccountImportRows(rows);
      } catch (error: any) {
        setError(error.message);
        setAccountImportRows([]);
      }
      return;
    }
    const bodyRows = data.slice(1).filter((row) => row.some((cell) => String(cell || "").trim()));
    if (!bodyRows.length) {
      setError("The Excel worksheet contains no import rows");
      return;
    }
    if (bodyRows.length > 5000) {
      setError("Maximum 5000 rows can be imported at once");
      return;
    }
    setAccountImportRows(bodyRows.map((row, index) => {
      const record: any = { rowNumber: index + 2 };
      config.keys.forEach((key, columnIndex) => record[key] = String(row[columnIndex] ?? "").trim());
      if ("entryType" in config) record.entryType = config.entryType;
      return record;
    }));
  };
  const submitAccountImport = async () => {
    if (!accountImport || !accountImportRows.length) return;
    const config = accountImportConfig[accountImport];
    setSubmitting(true);
    setError("");
    try {
      const result = await api(config.endpoint, { method: "POST", body: JSON.stringify({ rows: accountImportRows }) });
      toast({ title: `${config.title} import completed`, description: `${result.created || accountImportRows.length} records created.` });
      setAccountImport(null);
      setAccountImportRows([]);
      setAccountImportFile("");
      await load();
    } catch (e: any) {
      const message = e.message || "Import failed";
      setError(message);
      toast({ title: "Import failed", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };
  const exportAccountXlsx = async (kind: keyof typeof accountImportConfig) => {
    const config = accountImportConfig[kind];
    setSubmitting(true);
    setError("");
    try {
      const params = new URLSearchParams(config.exportQuery || "");
      if (kind === "apBill" || kind === "apDebitNote") {
        if (apStatusFilter !== "All") params.set("status", apStatusFilter);
        if (apApprovalFilter !== "All") params.set("approvalStatus", apApprovalFilter);
        if (apFromDate) params.set("localDateFrom", apFromDate);
        if (apToDate) params.set("localDateTo", apToDate);
      }
      if (kind === "arInvoice" || kind === "arCreditNote") {
        if (arFromDate) params.set("localDateFrom", arFromDate);
        if (arToDate) params.set("localDateTo", arToDate);
        if (arCustomer !== "All") params.set("customer", arCustomer);
      }
      const suffix = params.toString();
      const path = suffix ? `${config.exportEndpoint}?${suffix}` : config.exportEndpoint;
      const payload = await api(withListingDates(path));
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.rows || []), config.title.slice(0, 31));
      XLSX.writeFile(workbook, `${config.file}-${today}.xlsx`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };
  const ExcelIconButton = ({ action, onClick }: { action: "import" | "export"; onClick: () => void }) => {
    const isImport = action === "import";
    const label = isImport ? "Import" : "Export";
    return (
      <Button
        type="button"
        variant="outline"
        disabled={submitting}
        onClick={onClick}
        aria-label={label}
        className="h-9 px-3 gap-1.5 border-primary bg-background text-black dark:text-white hover:bg-primary hover:text-white hover:border-primary transition-colors font-medium text-xs sm:text-sm shadow-xs"
      >
        {isImport ? <FileUp className="h-4 w-4 shrink-0" /> : <FileDown className="h-4 w-4 shrink-0" />}
        <span>{label}</span>
      </Button>
    );
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
    <AccountsTableContext.Provider value={{ listPaging, listMeta, setListPaging, loading }}>
      <Shell>
      <div className="min-h-full space-y-5 p-4 sm:p-6">
        <div className="sticky top-16 lg:top-[72px] z-30 -mx-4 -mt-4 mb-2 px-4 py-3 sm:-mx-6 sm:-mt-6 sm:px-6 bg-background/95 backdrop-blur-md border-b border-border/70 shadow-xs flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between transition-all">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-bold flex items-center gap-2.5 text-slate-900 dark:text-slate-100">
              <BookOpen className="h-6 w-6 text-primary shrink-0" />
              <span>Accounts</span>
            </h1>
          </div>
          <div className="flex items-center gap-0 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {can("accounts.finance_dashboard.view") && (
              <Button
                type="button"
                variant="ghost"
                className="h-8 border-0 bg-transparent shadow-none px-3 text-[12px] font-normal text-primary hover:bg-primary/5 hover:text-primary cursor-pointer whitespace-nowrap inline-flex items-center gap-2 transition-colors"
                style={{ border: "unset", fontWeight: 400, fontSize: "12px", background: "unset" }}
                onClick={() => void reconcile()}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 shrink-0 text-primary ${loading ? "animate-spin" : ""}`}
                />
                <span>Reconcile</span>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="h-8 border-0 bg-transparent shadow-none px-3 text-[12px] font-normal text-primary hover:bg-primary/5 hover:text-primary cursor-pointer whitespace-nowrap inline-flex items-center gap-2 transition-colors"
              style={{ border: "unset", fontWeight: 400, fontSize: "12px", background: "unset" }}
              onClick={() => void handleLockLedger()}
              disabled={lockingLedger}
            >
              <LogOut className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{lockingLedger ? "Locking..." : "Lock Ledger"}</span>
            </Button>
          </div>
        </div>
        {error && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {error}
          </div>
        )}
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {activePageTitle[0]}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {activePageTitle[1]}
          </p>
        </div>

        {/* Dedicated Filter & Search Bar */}
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-card p-3 shadow-xs">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Date Filters */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/60 px-2.5 py-1 text-xs transition-colors focus-within:border-primary focus-within:bg-background">
                <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap select-none">
                  From:
                </span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setListingFromDate(e.target.value)}
                  className="h-7 border-0 bg-transparent p-0 text-xs font-medium text-foreground outline-none focus:ring-0 cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/60 px-2.5 py-1 text-xs transition-colors focus-within:border-primary focus-within:bg-background">
                <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap select-none">
                  To:
                </span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setListingToDate(e.target.value)}
                  className="h-7 border-0 bg-transparent p-0 text-xs font-medium text-foreground outline-none focus:ring-0 cursor-pointer"
                />
              </div>
              {(fromDate || toDate) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1 rounded-lg cursor-pointer transition-colors"
                  onClick={clearListingDates}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear Dates
                </Button>
              )}
            </div>

            {/* Search Box with Icon */}
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                type="text"
                placeholder={`Search ${activePageTitle[0].toLowerCase()}...`}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setListPaging((current) => ({
                    j: { ...current.j, page: 1 },
                    ap: { ...current.ap, page: 1 },
                    ar: { ...current.ar, page: 1 },
                  }));
                }}
                className="h-9 pl-9 pr-8 text-xs bg-slate-50/60 dark:bg-slate-900/60 rounded-lg border-slate-200 dark:border-slate-700 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary focus-visible:bg-background transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setListPaging((current) => ({
                      j: { ...current.j, page: 1 },
                      ap: { ...current.ap, page: 1 },
                      ar: { ...current.ar, page: 1 },
                    }));
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer p-0.5 rounded-full hover:bg-muted"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-2xs p-3 space-y-2">
            {visibleAccountGroups.map((section, idx) => (
              <div
                key={section.group}
                className={`flex items-center gap-3 ${
                  idx > 0 ? "pt-2 border-t border-slate-100 dark:border-slate-800/60" : ""
                }`}
              >
                <div className="w-28 shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {section.group}
                </div>
                <TabsList className="flex h-auto flex-1 flex-wrap items-center justify-start !justify-start gap-1.5 bg-transparent p-0 [&>*]:shrink-0">
                  {section.tabs.map(([value, label, , TabIcon]) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 data-[state=active]:bg-[#21C7B3] data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-xs transition-all duration-150 cursor-pointer"
                    >
                      <TabIcon className="h-3.5 w-3.5 opacity-75" />
                      <span>{label}</span>
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
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/40 group transition-colors cursor-pointer"
                    onClick={() => toggleCustomer(key)}
                    title={open ? "Close detail view" : "Open detail view"}
                  >
                    <div className="flex items-center gap-2.5 font-medium min-w-0">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-150 ${
                          open
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-primary/10 text-primary group-hover:bg-primary/20"
                        }`}
                        title={open ? "Close detail view" : "Open detail view"}
                      >
                        {open ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </span>
                      <span className="truncate">{customer.customerDisplay || customer.clientName}</span>
                    </div>
                    <div className="grid min-w-[560px] grid-cols-4 gap-3 text-right text-sm">
                      <span>{inr(customer.invoiced)}</span>
                      <span>{inr(customer.received)}</span>
                      <span>{inr(customer.credited)}</span>
                      <span className="font-semibold">{inr(customer.outstanding)}</span>
                    </div>
                  </button>
                  {open && (
                    <div className="overflow-x-auto max-h-96 overflow-y-auto border-t">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-muted font-semibold text-muted-foreground shadow-sm">
                          <tr>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-left max-w-[200px] break-words align-top border-b">Invoice Number</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-left max-w-[150px] break-words align-top border-b">Invoice Date</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-right max-w-[150px] align-top border-b">Invoiced</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-right max-w-[150px] align-top border-b">Received</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-right max-w-[150px] align-top border-b">Credits</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-right max-w-[150px] align-top border-b">Outstanding</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-left max-w-[150px] break-words align-top border-b">Paid Date</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-left max-w-[150px] break-words align-top border-b">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(customer.records || []).map((record: any) => (
                            <tr key={`${record.sourceType || "row"}-${record.id}`} className="border-t">
                              <td className="px-4 py-2 max-w-[200px] break-words align-top">{record.invoiceNumber}</td>
                              <td className="px-4 py-2 max-w-[150px] break-words align-top">{String(record.invoiceDate || "").slice(0, 10)}</td>
                              <td className="px-4 py-2 text-right max-w-[150px] align-top">{inr(record.invoicedAmount)}</td>
                              <td className="px-4 py-2 text-right max-w-[150px] align-top">{inr(record.receivedAmount)}</td>
                              <td className="px-4 py-2 text-right max-w-[150px] align-top">{inr(record.credits)}</td>
                              <td className="px-4 py-2 text-right max-w-[150px] align-top">{inr(record.outstanding)}</td>
                              <td className="px-4 py-2 max-w-[150px] break-words align-top">
                                {record.paidDate || "-"}
                                {record.payments?.length > 0 && (
                                  <div className="mt-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setHistoryModal({
                                          title: "Receipt Events",
                                          reference: record.invoiceNumber,
                                          contactName: customer.customerDisplay || customer.clientName,
                                          payments: record.payments,
                                        })
                                      }
                                      className="font-semibold text-xs text-primary hover:underline cursor-pointer"
                                    >
                                      {record.payments.length}{" "}
                                      {record.payments.length === 1 ? "receipt" : "receipts"}
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2 max-w-[150px] break-words align-top">{record.status || "-"}</td>
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
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/40 group transition-colors cursor-pointer"
                    onClick={() => toggleVendor(key)}
                    title={open ? "Close detail view" : "Open detail view"}
                  >
                    <div className="flex items-center gap-2.5 font-medium min-w-0">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-150 ${
                          open
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-primary/10 text-primary group-hover:bg-primary/20"
                        }`}
                        title={open ? "Close detail view" : "Open detail view"}
                      >
                        {open ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </span>
                      <span className="truncate">{vendor.vendorDisplay || vendor.vendorName}</span>
                    </div>
                    <div className="grid min-w-[420px] grid-cols-4 gap-3 text-right text-sm">
                      <span>{inr(vendor.billed)}</span>
                      <span>{inr(vendor.paid)}</span>
                      <span>{inr(vendor.credited)}</span>
                      <span className="font-semibold">{inr(vendor.outstanding)}</span>
                    </div>
                  </button>
                  {open && (
                    <div className="overflow-x-auto max-h-96 overflow-y-auto border-t">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-muted font-semibold text-muted-foreground shadow-sm">
                          <tr>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-left max-w-[200px] break-words align-top border-b">Bill Number</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-left max-w-[150px] break-words align-top border-b">Billed Date</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-right max-w-[150px] align-top border-b">Billed</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-right max-w-[150px] align-top border-b">Paid</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-right max-w-[150px] align-top border-b">Debit Note</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-right max-w-[150px] align-top border-b">Outstanding</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-left max-w-[150px] break-words align-top border-b">Paid Date</th>
                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-4 py-2 text-left max-w-[150px] break-words align-top border-b">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(vendor.records || []).map((record: any) => (
                            <tr key={`${record.sourceType || "row"}-${record.id}`} className="border-t">
                              <td className="px-4 py-2 max-w-[200px] break-words align-top">{record.billNumber}</td>
                              <td className="px-4 py-2 max-w-[150px] break-words align-top">{String(record.billedDate || "").slice(0, 10)}</td>
                              <td className="px-4 py-2 text-right max-w-[150px] align-top">{inr(record.billedAmount)}</td>
                              <td className="px-4 py-2 text-right max-w-[150px] align-top">{inr(record.paidAmount)}</td>
                              <td className="px-4 py-2 text-right max-w-[150px] align-top">{inr(record.debitNote)}</td>
                              <td className="px-4 py-2 text-right max-w-[150px] align-top">{inr(record.outstanding)}</td>
                              <td className="px-4 py-2 max-w-[150px] break-words align-top">
                                {record.paidDate || "-"}
                                {record.payments?.length > 0 && (
                                  <div className="mt-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setHistoryModal({
                                          title: "Payment Events",
                                          reference: record.billNumber,
                                          contactName: vendor.vendorDisplay || vendor.vendorName,
                                          payments: record.payments,
                                        })
                                      }
                                      className="font-semibold text-xs text-primary hover:underline cursor-pointer"
                                    >
                                      {record.payments.length}{" "}
                                      {record.payments.length === 1 ? "payment" : "payments"}
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2 max-w-[150px] break-words align-top">{record.status || "-"}</td>
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
                                  {can("accounts.chart_of_accounts.edit") ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={() => openManual("account", account)}
                                    >
                                      Edit
                                    </Button>
                                  ) : null}
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
                                  {account.receivablePaymentEvents?.length > 0 && (
                                    <div className="mb-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setHistoryModal({
                                            title: "Receivable Payment Events",
                                            reference: account.accountName,
                                            payments: account.receivablePaymentEvents.map((event: any) => ({
                                              ...event,
                                              paymentDate: event.entryDate,
                                              amount: event.credit || event.debit,
                                              reference: event.metadata?.documentReference || event.reference,
                                            })),
                                          })
                                        }
                                        className="font-semibold text-xs text-primary hover:underline cursor-pointer whitespace-nowrap"
                                      >
                                        {account.receivablePaymentEvents.length} receivable payment events
                                      </button>
                                    </div>
                                  )}
                                  {account.payablePaymentEvents?.length > 0 && (
                                    <div className="mb-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setHistoryModal({
                                            title: "Payable Payment Events",
                                            reference: account.accountName,
                                            payments: account.payablePaymentEvents.map((event: any) => ({
                                              ...event,
                                              paymentDate: event.entryDate,
                                              amount: event.debit || event.credit,
                                              reference: event.metadata?.documentReference || event.reference,
                                            })),
                                          })
                                        }
                                        className="font-semibold text-xs text-primary hover:underline cursor-pointer whitespace-nowrap"
                                      >
                                        {account.payablePaymentEvents.length} payable payment events
                                      </button>
                                    </div>
                                  )}
                                  {!historyLines.length ? (
                                    <div className="rounded-md border bg-background p-3 text-center text-xs text-muted-foreground">
                                      No entry history recorded for this account.
                                    </div>
                                  ) : (
                                    <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-md border bg-background">
                                      <table className="w-full text-xs">
                                        <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-muted font-semibold text-muted-foreground shadow-sm">
                                          <tr>
                                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-3 py-2 text-left max-w-[120px] break-words align-top border-b">Date of Payment</th>
                                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-3 py-2 text-left max-w-[100px] break-words align-top border-b">Source</th>
                                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-3 py-2 text-left max-w-[150px] break-words align-top border-b">Customer/Vendor</th>
                                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-3 py-2 text-left max-w-[120px] break-words align-top border-b">Customer/Vendor ID</th>
                                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-3 py-2 text-left max-w-[140px] break-words align-top border-b">Reference ID</th>
                                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-3 py-2 text-left max-w-[140px] break-words align-top border-b">Account Name</th>
                                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-3 py-2 text-left max-w-[120px] break-words align-top border-b">Payment Method</th>
                                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-3 py-2 text-left max-w-[150px] break-words align-top border-b">Notes</th>
                                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-3 py-2 text-left max-w-[150px] break-words align-top border-b">Description</th>
                                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-3 py-2 text-right max-w-[120px] align-top border-b">Debit Amount</th>
                                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-3 py-2 text-right max-w-[120px] align-top border-b">Credit Amount</th>
                                            <th className="sticky top-0 z-20 bg-slate-100 dark:bg-muted px-3 py-2 text-right max-w-[120px] align-top border-b">Running Balance (₹)</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                          {historyLines.map((line: any, idx: number) => (
                                            <tr key={line.id || idx} className="hover:bg-muted/10">
                                              <td className="px-3 py-1.5 font-mono text-muted-foreground max-w-[120px] break-words align-top">
                                                {String(line.paymentDate || line.entryDate || "").slice(0, 10) || "—"}
                                              </td>
                                              <td className="px-3 py-1.5 font-medium max-w-[100px] break-words align-top">
                                                {line.source || line.sourceType || "Manual"}
                                              </td>
                                              <td className="px-3 py-1.5 max-w-[150px] break-words align-top">
                                                {line.partyName || "N/A"}
                                              </td>
                                              <td className="px-3 py-1.5 font-mono text-muted-foreground max-w-[120px] break-words align-top">
                                                {line.partyId || "N/A"}
                                              </td>
                                              <td className="px-3 py-1.5 font-mono max-w-[140px] break-words align-top">
                                                {line.referenceId || line.reference || line.sourceId || "—"}
                                              </td>
                                              <td className="px-3 py-1.5 max-w-[140px] break-words align-top">{line.accountName || account.accountName}</td>
                                              <td className="px-3 py-1.5 max-w-[120px] break-words align-top">{line.paymentMethod || "—"}</td>
                                              <td className="px-3 py-1.5 max-w-[150px] break-words align-top">{line.notes || "—"}</td>
                                              <td className="px-3 py-1.5 text-muted-foreground max-w-[150px] break-words align-top">
                                                {line.description || "—"}
                                              </td>
                                              <td className="px-3 py-1.5 text-right font-mono text-emerald-600 font-semibold max-w-[120px] align-top">
                                                {line.debit ? inr(line.debit) : "—"}
                                              </td>
                                              <td className="px-3 py-1.5 text-right font-mono text-blue-600 font-semibold max-w-[120px] align-top">
                                                {line.credit ? inr(line.credit) : "—"}
                                              </td>
                                              <td className="px-3 py-1.5 text-right font-mono font-bold max-w-[120px] align-top">
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
              <CardContent className="grid gap-4 md:grid-cols-12">
                <div className="space-y-1.5 text-sm md:col-span-4">
                  <Label className="text-xs font-semibold text-slate-700">Transaction Type *</Label>
                  <Select
                    value={bankForm.mode}
                    onValueChange={(val) =>
                      setBankForm({
                        ...bankForm,
                        mode: val,
                        creditContactId: "",
                        debitContactId: "",
                      })
                    }
                  >
                    <SelectTrigger aria-label="Credit/Debit/Transfer" className="h-10 w-full bg-white font-medium shadow-sm">
                      <SelectValue placeholder="Transaction Type *" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Credit">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0 shadow-sm" />
                          <span>Credit</span>
                          <span className="text-xs text-muted-foreground group-data-[highlighted]:text-white/80 font-normal ml-auto pl-2">(Inward / Receipt)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="Debit">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0 shadow-sm" />
                          <span>Debit</span>
                          <span className="text-xs text-muted-foreground group-data-[highlighted]:text-white/80 font-normal ml-auto pl-2">(Outward / Payment)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="Transfer">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="h-2.5 w-2.5 rounded-full bg-cyan-500 shrink-0 shadow-sm" />
                          <span>Transfer</span>
                          <span className="text-xs text-muted-foreground group-data-[highlighted]:text-white/80 font-normal ml-auto pl-2">(Account Transfer)</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {bankForm.mode === "Transfer" ? (
                  <>
                    <div className="space-y-1.5 text-sm md:col-span-4">
                      <Label className="text-xs font-semibold text-slate-700">From Account *</Label>
                      <Select
                        value={bankForm.bankCashAccountId ? String(bankForm.bankCashAccountId) : undefined}
                        onValueChange={(val) => setBankForm({ ...bankForm, bankCashAccountId: val })}
                      >
                        <SelectTrigger aria-label="From Account" className="h-10 w-full bg-white font-medium shadow-sm">
                          <SelectValue placeholder="From Account *" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {coa.filter((a) => a.isActive !== false).map((a: any) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold shrink-0 group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                  {a.accountCode}
                                </span>
                                <span className="truncate">{a.accountName}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 text-sm md:col-span-4">
                      <Label className="text-xs font-semibold text-slate-700">To Account *</Label>
                      <Select
                        value={bankForm.transferToAccountId ? String(bankForm.transferToAccountId) : undefined}
                        onValueChange={(val) => setBankForm({ ...bankForm, transferToAccountId: val })}
                      >
                        <SelectTrigger aria-label="To Account" className="h-10 w-full bg-white font-medium shadow-sm">
                          <SelectValue placeholder="To Account *" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {coa.filter((a) => a.isActive !== false).map((a: any) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold shrink-0 group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                  {a.accountCode}
                                </span>
                                <span className="truncate">{a.accountName}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 text-sm md:col-span-4">
                      <Label className="text-xs font-semibold text-slate-700">Credit Name (optional)</Label>
                      <Select
                        value={bankForm.creditContactId ? String(bankForm.creditContactId) : "__none__"}
                        onValueChange={(val) => setBankForm({ ...bankForm, creditContactId: val === "__none__" ? "" : val })}
                      >
                        <SelectTrigger className="h-10 w-full bg-white font-medium shadow-sm">
                          <SelectValue placeholder="Select CRM client (optional)" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          <SelectItem value="__none__">
                            <span className="text-muted-foreground group-data-[highlighted]:text-white/80 italic font-normal">None / Unassigned</span>
                          </SelectItem>
                          {crmClients.map((client) => (
                            <SelectItem key={client.id} value={String(client.id)}>
                              <div className="flex items-center gap-2">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                  {(client.displayName || client.name || "C").charAt(0).toUpperCase()}
                                </span>
                                <span className="truncate">{client.displayName || client.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 text-sm md:col-span-4">
                      <Label className="text-xs font-semibold text-slate-700">Debit Name (optional)</Label>
                      <Select
                        value={bankForm.debitContactId ? String(bankForm.debitContactId) : "__none__"}
                        onValueChange={(val) => setBankForm({ ...bankForm, debitContactId: val === "__none__" ? "" : val })}
                      >
                        <SelectTrigger className="h-10 w-full bg-white font-medium shadow-sm">
                          <SelectValue placeholder="Select CRM client (optional)" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          <SelectItem value="__none__">
                            <span className="text-muted-foreground group-data-[highlighted]:text-white/80 italic font-normal">None / Unassigned</span>
                          </SelectItem>
                          {crmClients.map((client) => (
                            <SelectItem key={client.id} value={String(client.id)}>
                              <div className="flex items-center gap-2">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                  {(client.displayName || client.name || "C").charAt(0).toUpperCase()}
                                </span>
                                <span className="truncate">{client.displayName || client.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : bankForm.mode === "Credit" ? (
                  <>
                    <div className="space-y-1.5 text-sm md:col-span-4">
                      <Label className="text-xs font-semibold text-slate-700">Account Name *</Label>
                      <Select
                        value={bankForm.bankCashAccountId ? String(bankForm.bankCashAccountId) : undefined}
                        onValueChange={(val) => setBankForm({ ...bankForm, bankCashAccountId: val })}
                      >
                        <SelectTrigger aria-label="Account Name" className="h-10 w-full bg-white font-medium shadow-sm">
                          <SelectValue placeholder="Account Name *" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {coa.filter((a) => a.isActive !== false).map((a: any) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold shrink-0 group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                  {a.accountCode}
                                </span>
                                <span className="truncate">{a.accountName}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 text-sm md:col-span-4">
                      <Label className="text-xs font-semibold text-slate-700">Credit Name *</Label>
                      <Select
                        value={bankForm.creditContactId ? String(bankForm.creditContactId) : undefined}
                        onValueChange={(val) => setBankForm({ ...bankForm, creditContactId: val })}
                      >
                        <SelectTrigger className="h-10 w-full bg-white font-medium shadow-sm">
                          <SelectValue placeholder="Select CRM client *" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {crmClients.map((client) => (
                            <SelectItem key={client.id} value={String(client.id)}>
                              <div className="flex items-center gap-2">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                  {(client.displayName || client.name || "C").charAt(0).toUpperCase()}
                                </span>
                                <span className="truncate">{client.displayName || client.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5 text-sm md:col-span-4">
                      <Label className="text-xs font-semibold text-slate-700">Account Name *</Label>
                      <Select
                        value={bankForm.bankCashAccountId ? String(bankForm.bankCashAccountId) : undefined}
                        onValueChange={(val) => setBankForm({ ...bankForm, bankCashAccountId: val })}
                      >
                        <SelectTrigger aria-label="Account Name" className="h-10 w-full bg-white font-medium shadow-sm">
                          <SelectValue placeholder="Account Name *" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {coa.filter((a) => a.isActive !== false).map((a: any) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold shrink-0 group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                  {a.accountCode}
                                </span>
                                <span className="truncate">{a.accountName}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 text-sm md:col-span-4">
                      <Label className="text-xs font-semibold text-slate-700">Debit Name *</Label>
                      <Select
                        value={bankForm.debitContactId ? String(bankForm.debitContactId) : undefined}
                        onValueChange={(val) => setBankForm({ ...bankForm, debitContactId: val })}
                      >
                        <SelectTrigger className="h-10 w-full bg-white font-medium shadow-sm">
                          <SelectValue placeholder="Select CRM client *" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {crmClients.map((client) => (
                            <SelectItem key={client.id} value={String(client.id)}>
                              <div className="flex items-center gap-2">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                  {(client.displayName || client.name || "C").charAt(0).toUpperCase()}
                                </span>
                                <span className="truncate">{client.displayName || client.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <div className={`space-y-1.5 text-sm block w-full ${bankForm.mode === "Transfer" ? "md:col-span-4" : "md:col-span-3"}`}>
                  <Label className="text-xs font-semibold text-slate-700">Total Payment *</Label>
                  <Input aria-label="Amount" type="number" min="0.01" step="0.01" placeholder="Amount" className="h-10 w-full bg-white shadow-sm" value={bankForm.amount} onChange={(e) => setBankForm({ ...bankForm, amount: e.target.value })} />
                </div>
                <div className={`space-y-1.5 text-sm block w-full ${bankForm.mode === "Transfer" ? "md:col-span-4" : "md:col-span-3"}`}>
                  <Label className="text-xs font-semibold text-slate-700">Payment Date *</Label>
                  <Input type="date" max={today} className="h-10 w-full bg-white shadow-sm" value={bankForm.transactionDate} onChange={(e) => setBankForm({ ...bankForm, transactionDate: e.target.value })} />
                </div>
                <div className={`space-y-1.5 text-sm block w-full ${bankForm.mode === "Transfer" ? "md:col-span-4" : "md:col-span-3"}`}>
                  <Label className="text-xs font-semibold text-slate-700">Payment Method</Label>
                  <Select
                    value={bankForm.paymentMethod || "Bank Transfer"}
                    onValueChange={(val) => setBankForm({ ...bankForm, paymentMethod: val })}
                  >
                    <SelectTrigger className="h-10 w-full bg-white font-medium shadow-sm">
                      <SelectValue placeholder="Payment Method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method) => (
                        <SelectItem key={method} value={method}>
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-3.5 w-3.5 opacity-60 group-data-[highlighted]:text-white shrink-0" />
                            <span>{method}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className={`space-y-1 text-sm block w-full ${bankForm.mode === "Transfer" ? "md:col-span-4" : "md:col-span-3"}`}>Reference ID / Invoice Number<Input className="h-10 w-full" value={bankForm.reference} onChange={(e) => setBankForm({ ...bankForm, reference: e.target.value })} /></label>
                <label className={`space-y-1 text-sm block w-full ${bankForm.mode === "Transfer" ? "md:col-span-4" : "md:col-span-3"}`}>Period (optional)<Input className="h-10 w-full" value={bankForm.period} onChange={(e) => setBankForm({ ...bankForm, period: e.target.value })} /></label>
                <label className={`space-y-1 text-sm block w-full ${bankForm.mode === "Transfer" ? "md:col-span-4" : "md:col-span-3"}`}>Bank Charges (optional)<Input type="number" min="0" step="0.01" className="h-10 w-full" value={bankForm.bankCharges} onChange={(e) => setBankForm({ ...bankForm, bankCharges: e.target.value })} /></label>
                <label className={`space-y-1 text-sm block w-full ${bankForm.mode === "Transfer" ? "md:col-span-4" : "md:col-span-3"}`}>Transaction Fees (optional)<Input type="number" min="0" step="0.01" className="h-10 w-full" value={bankForm.transactionFees} onChange={(e) => setBankForm({ ...bankForm, transactionFees: e.target.value })} /><span className="text-xs text-muted-foreground block">Informational; does not change the posted amount.</span></label>
                <label className={`space-y-1 text-sm block w-full ${bankForm.mode === "Transfer" ? "md:col-span-8" : "md:col-span-9"}`}>Notes<Input className="h-10 w-full" value={bankForm.remarks} onChange={(e) => setBankForm({ ...bankForm, remarks: e.target.value })} /></label>
                <Button className={`h-10 self-end m-0 ${bankForm.mode === "Transfer" ? "md:col-span-4" : "md:col-span-3"}`} disabled={submitting || !can("accounts.bank_cash.create") || !bankForm.bankCashAccountId || !bankForm.amount || !bankForm.transactionDate || (bankForm.mode === "Credit" && !bankForm.creditContactId) || (bankForm.mode === "Debit" && !bankForm.debitContactId) || (bankForm.mode === "Transfer" && !bankForm.transferToAccountId)} onClick={() => void submitBankCash()}>Submit for Approval</Button>
              </CardContent>
            </Card>
            <div className="flex flex-wrap justify-end gap-2">
              {can("accounts.bank_cash.import") && <ExcelIconButton action="import" onClick={() => openAccountImport("bankCash")} />}
              {can("accounts.bank_cash.export") && <ExcelIconButton action="export" onClick={() => void exportAccountXlsx("bankCash")} />}
            </div>
            <Table tableId="bank-cash" rows={f(bankCash.filter((row) => row.transactionTypeName !== "Opening Balance"))} cols={[
              ["Payment Date", "transactionDate"], ["Party / Name", "clientName", (_: any, row: any) => row.mode === "Transfer"
                ? (row.creditContactName || row.debitContactName
                  ? <div>{row.creditContactName && <div>Credit: {row.creditContactName}</div>}{row.debitContactName && <div>Debit: {row.debitContactName}</div>}</div>
                  : row.clientName || "—")
                : row.creditContactName || row.debitContactName || row.clientName || "—"], ["Account Name", "accountName"], ["Payment Method", "paymentMethod", (value: any) => String(value || "").trim() || "—"], ["Reference ID / Invoice Number", "reference", (value: any) => String(value || "").trim() || "—"], ["Type", "transactionTypeName"], ["Credit/Debit", "mode"], ["Amount", "amount", inr], ["Period", "period", (value: any) => String(value || "").trim() || "—"], ["Bank Charges", "bankCharges", inr], ["Transaction Fees (informational)", "transactionFees", inr], ["Status", "approvalStatus", statusBadge],
              ["Actions", "id", (_: any, row: any) => row.approvalStatus === "Pending Approval" && can("accounts.bank_cash.approve") ? <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void bankCashDecision(row, "approve")}>Approve</Button><Button size="sm" variant="outline" onClick={() => {
                const tableEl = document.querySelector('[data-table-scroll="bank-cash"]') as HTMLDivElement | null;
                if (tableEl) {
                  tableScrollPositions.set("bank-cash", { left: tableEl.scrollLeft, top: tableEl.scrollTop });
                }
                setBankDecision({ row, remarks: "" });
              }}>Reject</Button></div> : "—"],
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
            <Tabs value={apSubTab} onValueChange={setApSubTab}>
              <TabsList className="mb-3 bg-slate-100">
                <TabsTrigger value="bills">Pending Bills</TabsTrigger>
                <TabsTrigger value="debit-notes">Debit Notes</TabsTrigger>
              </TabsList>
              <TabsContent value="bills" className="space-y-3">
                <div className="flex justify-end gap-2">
                  {can("accounts.accounts_payable.import") && <ExcelIconButton action="import" onClick={() => openAccountImport("apBill")} />}
                  {can("accounts.accounts_payable.export") && <ExcelIconButton action="export" onClick={() => void exportAccountXlsx("apBill")} />}
                </div>
                <Table
                  tableId="ap-bills"
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
                      "Payment History",
                      "paymentHistory",
                      (_value: any, row: any) =>
                        row.paymentHistory?.length ? (
                          <button
                            type="button"
                            onClick={() =>
                              setHistoryModal({
                                title: "Disbursement History",
                                reference: row.billNumber,
                                contactName: row.vendorName,
                                payments: row.paymentHistory,
                              })
                            }
                            className="font-semibold text-xs text-primary hover:underline cursor-pointer whitespace-nowrap inline-flex items-center gap-1"
                          >
                            {row.paymentHistory.length}{" "}
                            {row.paymentHistory.length === 1
                              ? "disbursement"
                              : "disbursements"}
                          </button>
                        ) : (
                          "—"
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
                          {inr(payableOutstanding(row))}
                        </span>
                      ),
                    ],
                    ["Status", "status", statusBadge],
                    [
                      "Actions",
                      "actions",
                      (_value, row) => {
                        const balance = payableOutstanding(row);
                        return (
                          <div className="flex items-center gap-2">
                            {balance > 0 &&
                              row.approvalStatus === "Approved" && (
                                <Button
                                  size="sm"
                                  onClick={() => openApPayment(row)}
                                  disabled={submitting}
                                >
                                  <CreditCard className="mr-1 h-3.5 w-3.5" /> Pay
                                </Button>
                              )}
                            {row.approvalStatus === "Pending Approval" && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => void reviewAp(row, "approve")}
                                  disabled={submitting}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => void reviewAp(row, "reject")}
                                  disabled={submitting}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            <Button
                              size="icon"
                              className="h-8 w-8 cursor-pointer text-white border-0 shadow-xs hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ color: "#fff", background: "var(--color-red-500, #ef4444)" }}
                              title={
                                row.sourceType === "Manual"
                                  ? "Delete bill"
                                  : "Linked bills cannot be deleted"
                              }
                              aria-label={`Delete ${row.billNumber}`}
                              disabled={
                                submitting || row.sourceType !== "Manual"
                              }
                              onClick={() => confirmDeletePayable(row)}
                            >
                              <Trash2 className="h-4 w-4 text-white" />
                            </Button>
                          </div>
                        );
                      },
                    ],
                    ["Notes", "notes"],
                  ]}
                />
              </TabsContent>
              <TabsContent value="debit-notes" className="space-y-3">
                <div className="flex justify-end gap-2">
                  {can("accounts.accounts_payable.import") && <ExcelIconButton action="import" onClick={() => openAccountImport("apDebitNote")} />}
                  {can("accounts.accounts_payable.export") && <ExcelIconButton action="export" onClick={() => void exportAccountXlsx("apDebitNote")} />}
                </div>
                <Table
                  tableId="ap-debit-notes"
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
            <Tabs value={arSubTab} onValueChange={setArSubTab} className="space-y-3">
              <TabsList>
                <TabsTrigger value="invoices">Pending Invoices</TabsTrigger>
                <TabsTrigger value="credit-notes">Credit Notes</TabsTrigger>
              </TabsList>
              <TabsContent value="invoices" className="space-y-3">
                <div className="flex justify-end gap-2">
                  {can("accounts.accounts_receivable.import") && <ExcelIconButton action="import" onClick={() => openAccountImport("arInvoice")} />}
                  {can("accounts.accounts_receivable.export") && <ExcelIconButton action="export" onClick={() => void exportAccountXlsx("arInvoice")} />}
                </div>
                <Table
                  tableId="ar-invoices"
                  serverKey="ar"
                  rows={f(ar.filter((row) => row.entryType !== "Credit Note"))}
                  cols={[
                    ["Invoice", "invoiceNumber"],
                    ["Customer", "clientName"],
                    ["Due", "dueDate"],
                    ["Amount", "amount", inr],
                    ["Received", "receivedAmount", inr],
                    [
                      "Payment History",
                      "paymentHistory",
                      (_value: any, row: any) =>
                        row.paymentHistory?.length ? (
                          <button
                            type="button"
                            onClick={() =>
                              setHistoryModal({
                                title: "Receipt History",
                                reference: row.invoiceNumber,
                                contactName: row.clientName,
                                payments: row.paymentHistory,
                              })
                            }
                            className="font-semibold text-xs text-primary hover:underline cursor-pointer whitespace-nowrap inline-flex items-center gap-1"
                          >
                            {row.paymentHistory.length}{" "}
                            {row.paymentHistory.length === 1
                              ? "receipt"
                              : "receipts"}
                          </button>
                        ) : (
                          "—"
                        ),
                    ],
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
                            className="h-8 w-8 cursor-pointer text-white border-0 shadow-xs hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ color: "#fff", background: "var(--color-red-500, #ef4444)" }}
                            title="Delete"
                            aria-label={`Delete ${row.invoiceNumber}`}
                            onClick={() => confirmDeleteReceivable(row)}
                            disabled={submitting || row.sourceType !== "Manual"}
                          >
                            <Trash2 className="h-4 w-4 text-white" />
                          </Button>
                        </div>
                      ),
                    ],
                    ["Notes", "notes"],
                  ]}
                />
              </TabsContent>
              <TabsContent value="credit-notes" className="space-y-3">
                <div className="flex justify-end gap-2">
                  {can("accounts.accounts_receivable.import") && <ExcelIconButton action="import" onClick={() => openAccountImport("arCreditNote")} />}
                  {can("accounts.accounts_receivable.export") && <ExcelIconButton action="export" onClick={() => void exportAccountXlsx("arCreditNote")} />}
                </div>
                <Table
                  tableId="ar-credit-notes"
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
            <div className="flex flex-wrap justify-end gap-2">
              {can("accounts.journal_entries.import") && <ExcelIconButton action="import" onClick={() => openAccountImport("journal")} />}
              {can("accounts.journal_entries.export") && <ExcelIconButton action="export" onClick={() => void exportAccountXlsx("journal")} />}
              {can("accounts.journal_entries.create") && (
                <Button onClick={() => openManual("journal")}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Journal
                </Button>
              )}
            </div>
            <Table
              tableId="journals"
              serverKey="j"
              rows={f(journals)}
              cols={[
                ["Date", "entryDate"],
                ["Reference", "reference", (value: any, row: any) => {
                  const docRef = row.metadata?.documentReference;
                  if (docRef && value && !String(value).includes(docRef)) {
                    return `${docRef} (${value})`;
                  }
                  return value || docRef || "—";
                }],
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
        {Boolean(manualType) && (
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
                  ? manual.id
                    ? "Edit Ledger Account"
                    : "Add Ledger Account"
                  : "New Journal Entry"}
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
                      <Select
                        value={manual.accountType || "Asset"}
                        onValueChange={(val) => setManualField("accountType", val)}
                      >
                        <SelectTrigger className="h-10 w-full bg-white font-medium shadow-sm">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            "Asset",
                            "Liability",
                            "Equity",
                            "Revenue",
                            "Expense",
                          ].map((x) => (
                            <SelectItem key={x} value={x}>
                              {x}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Opening Balance *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={manual.openingBalance ?? manual.currentBalance ?? ""}
                        onChange={(e) =>
                          setManualField("openingBalance", e.target.value)
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
                        max={today}
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
                      <Select
                        value={manual.debitAccountId ? String(manual.debitAccountId) : undefined}
                        onValueChange={(val) => setManualField("debitAccountId", val)}
                      >
                        <SelectTrigger className="h-10 w-full bg-white font-medium shadow-sm">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {coa.map((a: any) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold shrink-0 group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                  {a.accountCode}
                                </span>
                                <span className="truncate">{a.accountName}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Credit Account *</Label>
                      <Select
                        value={manual.creditAccountId ? String(manual.creditAccountId) : undefined}
                        onValueChange={(val) => setManualField("creditAccountId", val)}
                      >
                        <SelectTrigger className="h-10 w-full bg-white font-medium shadow-sm">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {coa.map((a: any) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold shrink-0 group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                  {a.accountCode}
                                </span>
                                <span className="truncate">{a.accountName}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Amount *</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={manual.amount || ""}
                        onChange={(e) => setManualField("amount", e.target.value)}
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
              <Button
                onClick={() => void submitManual()}
                disabled={
                  submitting ||
                  (manualType === "account" &&
                    (!manual.accountCode?.trim() || !manual.accountName?.trim())) ||
                  (manualType === "journal" &&
                    (!manual.entryDate ||
                      !manual.reference?.trim() ||
                      !manual.description?.trim() ||
                      !manual.debitAccountId ||
                      !manual.creditAccountId ||
                      !manual.amount))
                }
              >
                {submitting ? "Saving..." : "Save Entry"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}
        {Boolean(accountImport) && (
          <Dialog
            open={Boolean(accountImport)}
            onOpenChange={(open) => {
              if (!open && !submitting) {
                setAccountImport(null);
                setAccountImportRows([]);
                setAccountImportFile("");
              }
            }}
          >
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{accountImport ? `Import ${accountImportConfig[accountImport].title}` : "Import Excel"}</DialogTitle>
              </DialogHeader>
              {accountImport && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Download template</p>
                      <p className="mt-1 text-xs text-muted-foreground">Use the exact headers and YYYY-MM-DD date format.</p>
                    </div>
                    <Button type="button" variant="outline" disabled={submitting} onClick={() => downloadAccountTemplate(accountImport)}>
                      <Download className="mr-2 h-4 w-4" /> Download Template
                    </Button>
                  </div>
                  <div className="rounded-md border p-4">
                    <Label className="text-sm">Upload .xlsx file</Label>
                    <Input className="mt-2" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void parseAccountImportFile(event.target.files?.[0])} />
                    {accountImportFile && <p className="mt-2 text-xs text-muted-foreground">{accountImportFile} - {accountImportRows.length} row(s) ready</p>}
                    {error && <div className="mt-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" disabled={submitting} onClick={() => setAccountImport(null)}>Cancel</Button>
                <Button disabled={submitting || !accountImportRows.length} onClick={() => void submitAccountImport()}>{submitting ? "Importing..." : "Import"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {Boolean(bankDecision) && (
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
        )}
        {settlement?.kind === "ap" && (
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
                    <Select
                      value={apSettlementAccountId || undefined}
                      onValueChange={(val) => setApSettlementAccountId(val)}
                    >
                      <SelectTrigger id="ap-account-name" className="h-10 w-full bg-white font-medium shadow-sm">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {coa.filter((account) => account.isActive !== false).map((account) => (
                          <SelectItem key={account.id} value={String(account.id)}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold shrink-0 group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                {account.accountCode}
                              </span>
                              <span className="truncate">{account.accountName}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
        )}
        {Boolean(paymentAr) && (
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
                    <Label htmlFor="payment-amount">Paid Amount *</Label>
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
                    <Label htmlFor="from-account">From Account *</Label>
                    <Select
                      value={arPayment.fromAccountId || undefined}
                      onValueChange={(val) =>
                        setArPayment((value) => ({
                          ...value,
                          fromAccountId: val,
                        }))
                      }
                    >
                      <SelectTrigger id="from-account" className="h-10 w-full bg-white font-medium shadow-sm">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {coa.filter((account) => account.isActive !== false && account.accountCode === "1100").map((account) => (
                          <SelectItem key={account.id} value={String(account.id)}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold shrink-0 group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                {account.accountCode}
                              </span>
                              <span className="truncate">{account.accountName}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Label htmlFor="settlement-account" className="pt-2 block">To Account *</Label>
                    <Select
                      value={arPayment.settlementAccountId || undefined}
                      onValueChange={(val) =>
                        setArPayment((value) => ({
                          ...value,
                          settlementAccountId: val,
                        }))
                      }
                    >
                      <SelectTrigger id="settlement-account" className="h-10 w-full bg-white font-medium shadow-sm">
                        <SelectValue placeholder="Select settlement account" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {coa.filter((account) => account.isActive !== false && account.accountCode !== "1100").map((account) => (
                          <SelectItem key={account.id} value={String(account.id)}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold shrink-0 group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                {account.accountCode}
                              </span>
                              <span className="truncate">{account.accountName}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 text-sm">
                      <Label>Payment Date *</Label>
                      <Input
                        type="date"
                        required
                        value={arPayment.paymentDate}
                        onChange={(e) =>
                          setArPayment((value) => ({
                            ...value,
                            paymentDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <Label>Payment Method</Label>
                      <Select
                        value={arPayment.paymentMethod || "__none__"}
                        onValueChange={(val) =>
                          setArPayment((value) => ({
                            ...value,
                            paymentMethod: val === "__none__" ? "" : val,
                          }))
                        }
                      >
                        <SelectTrigger className="h-10 w-full bg-white font-medium shadow-sm">
                          <SelectValue placeholder="Not specified" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            <span className="text-muted-foreground group-data-[highlighted]:text-white/80 italic font-normal">Not specified</span>
                          </SelectItem>
                          {paymentMethods.map((method) => (
                            <SelectItem key={method} value={method}>
                              <div className="flex items-center gap-2">
                                <CreditCard className="h-3.5 w-3.5 opacity-60 group-data-[highlighted]:text-white shrink-0" />
                                <span>{method}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
                    {paymentAr.sourceType !== "Sales Invoice" && <>
                      <label className="space-y-1.5 text-sm">Period (optional)<Input value={arPayment.period} onChange={(e) => setArPayment((value) => ({ ...value, period: e.target.value }))} /></label>
                      <label className="space-y-1.5 text-sm">Transaction Fees (optional)<Input type="number" min="0" step="0.01" value={arPayment.transactionFees} onChange={(e) => setArPayment((value) => ({ ...value, transactionFees: e.target.value }))} /><span className="text-xs text-muted-foreground">Informational; does not change the posted amount.</span></label>
                    </>}
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
                      <Label>Reference ID / Invoice Number</Label>
                      <Input
                        placeholder={paymentAr.invoiceNumber || paymentAr.reference || "Reference ID / Invoice Number"}
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
                  disabled={submitting || !paymentAmount || !arPayment.settlementAccountId || !arPayment.fromAccountId || !arPayment.paymentDate}
                >
                  <CreditCard className="mr-2 h-4 w-4" />{" "}
                  {submitting ? "Receiving..." : "Receive Payment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {Boolean(paymentAp) && (
          <Dialog
            open={Boolean(paymentAp)}
            onOpenChange={(open) => {
              if (!open && !submitting) setPaymentAp(null);
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
              </DialogHeader>
              {paymentAp && (
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
                      <p className="font-semibold">{inr(paymentAp.amount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Already Paid
                      </p>
                      <p className="font-semibold text-primary">
                        {inr(paymentAp.paidAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Balance
                      </p>
                      <p className="font-semibold">
                        {inr(payableOutstanding(paymentAp))}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ap-paid-amount">Payment Amount *</Label>
                    <Input
                      id="ap-paid-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={payableOutstanding(paymentAp)}
                      value={paymentApAmount}
                      onChange={(event) => setPaymentApAmount(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ap-from-account">From Account *</Label>
                    <Select
                      value={apPaymentForm.fromAccountId || undefined}
                      onValueChange={(val) =>
                        setApPaymentForm((value) => ({
                          ...value,
                          fromAccountId: val,
                          settlementAccountId: val,
                        }))
                      }
                    >
                      <SelectTrigger id="ap-from-account" className="h-10 w-full bg-white font-medium shadow-sm">
                        <SelectValue placeholder="Select disbursement account" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {coa.filter((account) => account.isActive !== false && account.accountCode !== "2100").map((account) => (
                          <SelectItem key={account.id} value={String(account.id)}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold shrink-0 group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                {account.accountCode}
                              </span>
                              <span className="truncate">{account.accountName}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Label htmlFor="ap-to-account" className="pt-2 block">To Account *</Label>
                    <Select
                      value={apPaymentForm.toAccountId || undefined}
                      onValueChange={(val) =>
                        setApPaymentForm((value) => ({
                          ...value,
                          toAccountId: val,
                        }))
                      }
                    >
                      <SelectTrigger id="ap-to-account" className="h-10 w-full bg-white font-medium shadow-sm">
                        <SelectValue placeholder="Select payable account" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {coa.filter((account) => account.accountCode === "2100" && account.isActive !== false).map((account) => (
                          <SelectItem key={account.id} value={String(account.id)}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold shrink-0 group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
                                {account.accountCode}
                              </span>
                              <span className="truncate">{account.accountName}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 text-sm">
                      <Label>Payment Date *</Label>
                      <Input
                        type="date"
                        required
                        value={apPaymentForm.paymentDate}
                        onChange={(e) =>
                          setApPaymentForm((value) => ({
                            ...value,
                            paymentDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <Label>Payment Method</Label>
                      <Select
                        value={apPaymentForm.paymentMethod || "__none__"}
                        onValueChange={(val) =>
                          setApPaymentForm((value) => ({
                            ...value,
                            paymentMethod: val === "__none__" ? "" : val,
                          }))
                        }
                      >
                        <SelectTrigger className="h-10 w-full bg-white font-medium shadow-sm">
                          <SelectValue placeholder="Not specified" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            <span className="text-muted-foreground group-data-[highlighted]:text-white/80 italic font-normal">Not specified</span>
                          </SelectItem>
                          {paymentMethods.map((method) => (
                            <SelectItem key={method} value={method}>
                              <div className="flex items-center gap-2">
                                <CreditCard className="h-3.5 w-3.5 opacity-60 group-data-[highlighted]:text-white shrink-0" />
                                <span>{method}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="space-y-1.5 text-sm">
                      <Label>Bank Charges</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={apPaymentForm.bankCharges}
                        onChange={(e) =>
                          setApPaymentForm((value) => ({
                            ...value,
                            bankCharges: e.target.value,
                          }))
                        }
                      />
                    </label>
                    {paymentAp.sourceType !== "Purchase Invoice" && <>
                      <label className="space-y-1.5 text-sm">Period (optional)<Input value={apPaymentForm.period} onChange={(e) => setApPaymentForm((value) => ({ ...value, period: e.target.value }))} /></label>
                      <label className="space-y-1.5 text-sm">Transaction Fees (optional)<Input type="number" min="0" step="0.01" value={apPaymentForm.transactionFees} onChange={(e) => setApPaymentForm((value) => ({ ...value, transactionFees: e.target.value }))} /><span className="text-xs text-muted-foreground">Informational; does not change the posted amount.</span></label>
                    </>}
                    <label className="space-y-1.5 text-sm">
                      <Label>TDS Amount</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={apPaymentForm.tdsAmount}
                        onChange={(e) =>
                          setApPaymentForm((value) => ({
                            ...value,
                            tdsAmount: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-1.5 text-sm sm:col-span-2">
                      <Label>Reference ID / Bill Number</Label>
                      <Input
                        placeholder={paymentAp.billNumber || paymentAp.reference || "Reference ID / Bill Number"}
                        value={apPaymentForm.reference}
                        onChange={(e) =>
                          setApPaymentForm((value) => ({
                            ...value,
                            reference: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-1.5 text-sm sm:col-span-2">
                      <Label>Notes</Label>
                      <Input
                        value={apPaymentForm.notes}
                        onChange={(e) =>
                          setApPaymentForm((value) => ({
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
                  onClick={() => setPaymentAp(null)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void recordApPayment()}
                  disabled={submitting || !paymentApAmount || !apPaymentForm.fromAccountId || !apPaymentForm.toAccountId || !apPaymentForm.paymentDate}
                >
                  <CreditCard className="mr-2 h-4 w-4" />{" "}
                  {submitting ? "Recording..." : "Record Payment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {Boolean(historyModal) && (
          <Dialog
            open={Boolean(historyModal)}
            onOpenChange={(open) => {
              if (!open) setHistoryModal(null);
            }}
          >
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
              <DialogHeader className="p-6 pb-4 border-b bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-semibold text-foreground">
                      {historyModal?.title || "Payment History"}
                    </DialogTitle>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {historyModal?.reference && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted font-medium text-foreground">
                          Ref: {historyModal.reference}
                        </span>
                      )}
                      {historyModal?.contactName && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted font-medium text-foreground">
                          Party: {historyModal.contactName}
                        </span>
                      )}
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                        {historyModal?.payments?.length || 0}{" "}
                        {historyModal?.payments?.length === 1 ? "Record" : "Records"}
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {(!historyModal?.payments || historyModal.payments.length === 0) ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No payment records found.
                  </div>
                ) : (
                  historyModal.payments.map((payment: any, index: number) => {
                    const pAmount =
                      payment.amount ??
                      payment.paidAmount ??
                      payment.credit ??
                      payment.debit ??
                      0;
                    const pDate =
                      payment.paymentDate ||
                      payment.entryDate ||
                      payment.date ||
                      payment.paidDate ||
                      "—";
                    const pMethod =
                      payment.paymentMethod ||
                      payment.paymentMode ||
                      payment.mode ||
                      "—";
                    const fromAcc =
                      payment.fromAccountName ||
                      payment.fromAccount ||
                      "—";
                    const toAcc =
                      payment.toAccountName ||
                      payment.toAccount ||
                      payment.accountName ||
                      "—";
                    const ref =
                      payment.reference ||
                      payment.receiptId ||
                      payment.paymentId ||
                      payment.metadata?.documentReference ||
                      "—";

                    return (
                      <div
                        key={payment.id || index}
                        className="rounded-lg border bg-card text-card-foreground shadow-xs p-4 space-y-3 transition-colors hover:border-primary/40"
                      >
                        <div className="flex items-center justify-between border-b pb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">
                              #{index + 1}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {pDate}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-secondary-foreground">
                              {pMethod}
                            </span>
                          </div>
                          <div className="text-base font-bold text-primary">
                            {inr(pAmount)}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">From Account: </span>
                            <span className="font-medium text-foreground">{fromAcc}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">To Account: </span>
                            <span className="font-medium text-foreground">{toAcc}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Reference: </span>
                            <span className="font-medium text-foreground">{ref}</span>
                          </div>
                          {payment.period && (
                            <div>
                              <span className="text-muted-foreground">Period: </span>
                              <span className="font-medium text-foreground">{payment.period}</span>
                            </div>
                          )}
                          {Number(payment.bankCharges || 0) > 0 && (
                            <div>
                              <span className="text-muted-foreground">Bank Charges: </span>
                              <span className="font-medium text-destructive">{inr(payment.bankCharges)}</span>
                            </div>
                          )}
                          {Number(payment.tdsAmount || 0) > 0 && (
                            <div>
                              <span className="text-muted-foreground">TDS: </span>
                              <span className="font-medium text-foreground">{inr(payment.tdsAmount)}</span>
                            </div>
                          )}
                          {Number(payment.transactionFees || 0) > 0 && (
                            <div>
                              <span className="text-muted-foreground">Transaction Fees: </span>
                              <span className="font-medium text-foreground">{inr(payment.transactionFees)}</span>
                            </div>
                          )}
                        </div>

                        {payment.notes && (
                          <div className="text-xs bg-muted/40 rounded p-2 text-muted-foreground italic">
                            <span className="font-medium not-italic text-foreground">Notes: </span>
                            {payment.notes}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <DialogFooter className="p-4 border-t bg-muted/10">
                <Button
                  variant="outline"
                  onClick={() => setHistoryModal(null)}
                >
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {Boolean(deleteConfirmation) && (
          <Dialog
            open={Boolean(deleteConfirmation)}
            onOpenChange={(open) => {
              if (!open && !submitting) setDeleteConfirmation(null);
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ color: "#fff", background: "var(--color-red-500, #ef4444)" }}
                  >
                    <Trash2 className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-semibold text-foreground">
                      {deleteConfirmation?.title || "Confirm Delete"}
                    </DialogTitle>
                  </div>
                </div>
              </DialogHeader>
              <div className="py-2 text-sm text-muted-foreground leading-relaxed">
                {deleteConfirmation?.description}
              </div>
              <DialogFooter className="gap-2 sm:gap-0 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmation(null)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  style={{ color: "#fff", background: "var(--color-red-500, #ef4444)" }}
                  className="text-white hover:opacity-90 cursor-pointer border-0"
                  onClick={() => void handleConfirmDelete()}
                  disabled={submitting}
                >
                  <Trash2 className="mr-2 h-4 w-4 text-white" />
                  {submitting ? "Deleting..." : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </Shell>
    </AccountsTableContext.Provider>
  );
}
