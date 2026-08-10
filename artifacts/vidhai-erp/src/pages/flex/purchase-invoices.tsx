import { FLEX_TEXT } from "./flexText";
import {
  useFlexGoodsReceipts,
  useFlexMasterData,
  useFlexPurchaseOrders,
} from "./flexData";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { FlexTabs } from "./FlexTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Printer,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Download,
  RefreshCw,
  Paperclip,
  Trash2,
  Calendar as CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PurchaseInvoiceItem {
  id: number;
  vendorId: string;
  vendor: string;
  invoiceNumber: string;
  poReference?: string;
  grnReference?: string;
  date: string;
  invoiceAmt: number;
  poAmt: number;
  grnAmt: number;
  match: string;
  payment: string;
}

interface InvoiceLineItem {
  id: string;
  itemId?: number;
  item: string;
  qty: number;
  price: number;
  cgstPct: number;
  sgstPct: number;
  igstPct: number;
  total: number;
  source?: string;
}

async function fetchPurchaseInvoices(): Promise<PurchaseInvoiceItem[]> {
  try {
    const res = await fetch(`${BASE}/api/flex/purchase-invoices`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      return (data || []).map((inv: any) => ({
        id: inv.id,
        vendorId: inv.vendorId || "",
        vendor: inv.vendor,
        invoiceNumber: inv.invoiceNumber,
        poReference: inv.poReference,
        grnReference: inv.grnReference,
        date: inv.invoiceDate,
        invoiceAmt: Number(inv.amount || 0),
        poAmt: Number(inv.poAmount || 0),
        grnAmt: Number(inv.grnAmount || 0),
        match: inv.matchStatus || "Mismatch",
        payment: inv.status,
      }));
    }
  } catch {}
  return [];
}

async function markPurchaseInvoiceMatched({
  id,
  matchStatus,
}: {
  id: number;
  matchStatus: "Matched";
}) {
  const res = await fetch(`${BASE}/api/flex/purchase-invoices/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ matchStatus }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || FLEX_TEXT.failedToLogInvoice);
  }
  return res.json();
}

async function createPurchaseInvoice(payload: any) {
  const res = await fetch(`${BASE}/api/flex/purchase-invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || FLEX_TEXT.failedToLogInvoice);
  }
  return res.json();
}

export default function PurchaseInvoices() {
  const queryClient = useQueryClient();
  const {
    data: invoices = [],
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["get", "/api/flex/purchase-invoices"],
    queryFn: fetchPurchaseInvoices,
  });

  const { data: masterData } = useFlexMasterData();
  const { data: purchaseOrders = [] } = useFlexPurchaseOrders();
  const { data: goodsReceipts = [] } = useFlexGoodsReceipts();
  const vendorsList = masterData?.vendors ?? [];
  const itemOptions = masterData?.items ?? [];

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState("10");

  // Form State
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [mappedPo, setMappedPo] = useState("");
  const [mappedGrn, setMappedGrn] = useState("");
  const [vendor, setVendor] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [invoiceTotalAmount, setInvoiceTotalAmount] = useState("");
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [attachmentName, setAttachmentName] = useState("");

  const markMatchedMutation = useMutation({
    mutationFn: markPurchaseInvoiceMatched,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-invoices"],
      });
      toast.success(FLEX_TEXT.invoiceMarkedAsMatched);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createMutation = useMutation({
    mutationFn: createPurchaseInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-invoices"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      toast.success(FLEX_TEXT.purchaseInvoiceLoggedSuccessfully);
      setIsAddOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToLogInvoice);
    },
  });

  const resetForm = () => {
    setInvoiceNumber("");
    setMappedPo("");
    setMappedGrn("");
    setVendor("");
    setVendorAddress("");
    setVendorPhone("");
    setInvoiceTotalAmount("");
    setLineItems([]);
    setAttachmentName("");
  };

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesVendor =
        selectedVendor === "All" || inv.vendor === selectedVendor;
      const matchesSearch =
        !search.trim() ||
        inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        inv.vendor.toLowerCase().includes(search.toLowerCase()) ||
        inv.vendorId.toLowerCase().includes(search.toLowerCase());

      const invTime = new Date(inv.date).getTime();
      const matchesFromDate =
        !fromDate || isNaN(invTime) || invTime >= new Date(fromDate).getTime();
      const matchesToDate =
        !toDate || isNaN(invTime) || invTime <= new Date(toDate).getTime();

      return matchesVendor && matchesSearch && matchesFromDate && matchesToDate;
    });
  }, [invoices, search, selectedVendor, fromDate, toDate]);

  const handleAddItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        item: "",
        qty: 1,
        price: 0,
        cgstPct: 9,
        sgstPct: 9,
        igstPct: 0,
        total: 0,
      },
    ]);
  };

  const updateLineItem = (
    id: string,
    field: keyof InvoiceLineItem,
    value: string | number,
  ) => {
    setLineItems((current) =>
      current.map((line) => {
        if (line.id !== id) return line;
        const updated = { ...line, [field]: value } as InvoiceLineItem;
        const base = Number(updated.qty || 0) * Number(updated.price || 0);
        updated.total =
          base *
          (1 +
            (Number(updated.cgstPct || 0) +
              Number(updated.sgstPct || 0) +
              Number(updated.igstPct || 0)) /
              100);
        return updated;
      }),
    );
  };

  const selectInvoiceItem = (lineId: string, itemId: string) => {
    const selectedItem = itemOptions.find(
      (option) => Number(option.id) === Number(itemId),
    );
    if (!selectedItem) return;
    setLineItems((current) =>
      current.map((line) => {
        if (line.id !== lineId) return line;
        const updated = {
          ...line,
          itemId: selectedItem.id,
          item: selectedItem.name,
          price: Number(selectedItem.buyPricePerUnit || 0),
        };
        const base = Number(updated.qty || 0) * updated.price;
        return {
          ...updated,
          total:
            base *
            (1 +
              (Number(updated.cgstPct || 0) +
                Number(updated.sgstPct || 0) +
                Number(updated.igstPct || 0)) /
                100),
        };
      }),
    );
  };

  const calculatedInvoiceAmount = useMemo(
    () => lineItems.reduce((sum, line) => sum + Number(line.total || 0), 0),
    [lineItems],
  );

  const duplicateInvoice = useMemo(() => {
    const normalizedNumber = invoiceNumber.trim().toLowerCase();
    const normalizedVendor = vendor.trim().toLowerCase();
    if (!normalizedNumber || !normalizedVendor) return false;
    return invoices.some(
      (invoice) =>
        invoice.invoiceNumber.trim().toLowerCase() === normalizedNumber &&
        invoice.vendor.trim().toLowerCase() === normalizedVendor,
    );
  }, [invoiceNumber, vendor, invoices]);

  const mappedGrnAmount = useMemo(() => {
    const receipt = goodsReceipts.find(
      (grn: any) => grn.grnNumber === mappedGrn,
    );
    if (!receipt) return 0;
    const lines = Array.isArray(receipt.lineItems) ? receipt.lineItems : [];
    const lineAmount = lines.reduce((sum: number, line: any) => {
      const quantity = Number(
        line.acceptedQty ?? line.receivedQty ?? line.qty ?? 0,
      );
      const rate = Number(line.rate ?? line.unitPrice ?? line.price ?? 0);
      const taxPercent =
        Number(line.cgstPct ?? line.cgstPercent ?? 0) +
        Number(line.sgstPct ?? line.sgstPercent ?? 0) +
        Number(line.igstPct ?? line.igstPercent ?? 0);
      return (
        sum +
        Number(
          line.lineTotal ??
            line.total ??
            quantity * rate * (1 + taxPercent / 100),
        )
      );
    }, 0);
    const storedAmount = Number(receipt.totalAmount || 0);
    if (storedAmount > 0) return storedAmount;
    if (lineAmount > 0) return lineAmount;

    // Older GRNs can have a zero stored amount even though their mapped
    // invoice lines now contain a valid rate and tax calculation.
    return calculatedInvoiceAmount;
  }, [goodsReceipts, mappedGrn, calculatedInvoiceAmount]);

  useEffect(() => {
    if (lineItems.length) {
      setInvoiceTotalAmount(calculatedInvoiceAmount.toFixed(2));
    }
  }, [calculatedInvoiceAmount, lineItems.length]);

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !invoiceNumber.trim() ||
      !vendor ||
      !vendorAddress.trim() ||
      !vendorPhone.trim() ||
      duplicateInvoice ||
      lineItems.length === 0 ||
      lineItems.some(
        (line) => !line.item.trim() || line.qty <= 0 || line.price < 0,
      )
    ) {
      toast.error(
        duplicateInvoice
          ? `Invoice number "${invoiceNumber.trim()}" already exists for this vendor.`
          : "Invoice number, vendor details and valid line items are required",
      );
      return;
    }
    const amount =
      parseFloat(invoiceTotalAmount) ||
      lineItems.reduce((sum, line) => sum + line.total, 0);
    const vendorRecord = vendorsList.find((option) => option.name === vendor);
    createMutation.mutate({
      invoiceNumber: invoiceNumber.trim(),
      vendorName: vendor,
      vendorId: vendorRecord?.id || "",
      vendorAddress: vendorAddress.trim(),
      vendorPhone: vendorPhone.trim(),
      poReference: mappedPo,
      grnReference: mappedGrn,
      amount,
      lineItems: lineItems.map(({ id, ...line }) => line),
      invoiceDate,
      dueDate: invoiceDate,
      status: "Unpaid",
      attachmentName,
    });
  };

  const handlePrintInvoice = (inv: PurchaseInvoiceItem) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Purchase Invoice - ${inv.invoiceNumber}</title>
          <style>
            body { font-family: sans-serif; padding: 24px; color: #111; }
            h1 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 8px; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 20px; font-size: 13px; line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>PURCHASE INVOICE - ${inv.invoiceNumber}</h1>
          <div class="meta">
            <div>
              <strong>${FLEX_TEXT.printVendor}</strong> ${inv.vendor} (${inv.vendorId})<br/>
              <strong>${FLEX_TEXT.printDate}</strong> ${inv.date}<br/>
            </div>
            <div>
              <strong>${FLEX_TEXT.printPoRef}</strong> ${inv.poReference || "N/A"}<br/>
              <strong>${FLEX_TEXT.printStatus}</strong> ${inv.payment}<br/>
            </div>
          </div>
          <table>
            <thead>
              <tr><th>${FLEX_TEXT.printDescription}</th><th>${FLEX_TEXT.invoiceAmount}</th><th>${FLEX_TEXT.printPoAmount}</th><th>${FLEX_TEXT.grnAmount}</th><th>${FLEX_TEXT.printMatch}</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>${FLEX_TEXT.printGoodsDeliveryBilling}</td>
                <td>₹ ${Number(inv.invoiceAmt || 0).toLocaleString("en-IN")}</td>
                <td>₹ ${Number(inv.poAmt || 0).toLocaleString("en-IN")}</td>
                <td>₹ ${Number(inv.grnAmt || 0).toLocaleString("en-IN")}</td>
                <td>${inv.match}</td>
              </tr>
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto w-full space-y-5">
        <FlexTabs />

        {/* Title Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {FLEX_TEXT.purchaseInvoices}
            </h1>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={() => {
                refetch();
                toast.info(FLEX_TEXT.refreshedPurchaseInvoices);
              }}
              title={FLEX_TEXT.refreshRecords}
            >
              <RefreshCw
                className={`w-4 h-4 ${isFetching ? "animate-spin text-primary" : ""}`}
              />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 py-2 rounded-md gap-2 shadow-xs"
              onClick={() => setIsAddOpen(true)}
            >
              <Plus className="w-4 h-4" /> {FLEX_TEXT.logInvoice}
            </Button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={FLEX_TEXT.searchPurchaseInvoicesOrVendorIdCon}
              className="pl-9 bg-background border-border text-sm rounded-md h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] text-muted-foreground mb-1 font-medium">
                {FLEX_TEXT.fromDate}
              </div>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="text-xs bg-background h-9 rounded-md cursor-pointer"
              />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-1 font-medium">
                {FLEX_TEXT.toDate}
              </div>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="text-xs bg-background h-9 rounded-md cursor-pointer"
              />
            </div>
          </div>

          <div>
            <div className="text-[11px] text-muted-foreground mb-1 font-medium">
              {FLEX_TEXT.vendor}
            </div>
            <Select value={selectedVendor} onValueChange={setSelectedVendor}>
              <SelectTrigger className="bg-background text-xs h-9 rounded-md">
                <SelectValue placeholder={FLEX_TEXT.allVendors} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{FLEX_TEXT.allVendors}</SelectItem>
                {vendorsList.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.name}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Data Table */}
        <Card className="rounded-md border-border shadow-2xs">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.vendorId}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.vendor2}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.invoice}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.date}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.invoiceAmt}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.poAmt}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.grnAmt}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.match}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.payment}
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      {FLEX_TEXT.action}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-8 text-center text-muted-foreground text-sm"
                      >
                        {FLEX_TEXT.noPurchaseInvoicesFound}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((inv) => (
                      <tr
                        key={inv.id}
                        className="hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                          {inv.vendorId}
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {inv.vendor}
                        </td>
                        <td className="px-4 py-3 font-semibold text-muted-foreground font-mono text-[10px]">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {inv.date}
                        </td>
                        <td className="px-4 py-3 font-bold text-foreground">
                          ₹{" "}
                          {Number(inv.invoiceAmt || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          ₹ {Number(inv.poAmt || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          ₹ {Number(inv.grnAmt || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${inv.match === "Mismatch" ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/60 dark:text-red-300" : "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300"}`}
                          >
                            {inv.match}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300">
                            {inv.payment}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {inv.match !== "Matched" && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  markMatchedMutation.mutate({
                                    id: inv.id,
                                    matchStatus: "Matched",
                                  })
                                }
                                disabled={markMatchedMutation.isPending}
                                className="h-7 px-2.5 text-[10px] font-semibold text-primary border-primary/30 hover:bg-primary/10 mr-1.5"
                                title={FLEX_TEXT.markMatched}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                {FLEX_TEXT.match}
                              </Button>
                            )}
                          <button
                            onClick={() => handlePrintInvoice(inv)}
                            className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
                            title={FLEX_TEXT.printInvoice}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
              <div>
                {FLEX_TEXT.showing}{" "}
                <span className="font-semibold text-foreground">
                  {filtered.length > 0 ? 1 : 0}
                </span>{" "}
                {FLEX_TEXT.to}{" "}
                <span className="font-semibold text-foreground">
                  {filtered.length}
                </span>{" "}
                {FLEX_TEXT.of}{" "}
                <span className="font-semibold text-foreground">
                  {filtered.length}
                </span>{" "}
                {FLEX_TEXT.records}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span>{FLEX_TEXT.rowsPerPage}</span>
                  <Select value={rowsPerPage} onValueChange={setRowsPerPage}>
                    <SelectTrigger className="h-7 w-16 text-xs bg-background">
                      <SelectValue placeholder="10" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-1 rounded border border-border hover:bg-muted disabled:opacity-40">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button className="w-6 h-6 rounded bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">
                    1
                  </button>
                  <button className="p-1 rounded border border-border hover:bg-muted disabled:opacity-40">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Log Purchase Invoice Dialog (Vidhai Teal Green Theme) */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[92vh] overflow-x-hidden overflow-y-auto p-4 sm:p-6 bg-white rounded-2xl border-none shadow-2xl">
            <form onSubmit={handleCreateInvoice}>
              <DialogHeader className="pb-3 border-b border-slate-100">
                <DialogTitle className="flex items-center gap-3 text-lg font-bold text-slate-900">
                  <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-primary" />
                  </div>
                  {FLEX_TEXT.logPurchaseInvoice}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-4 text-xs">
                {/* Row 1: Invoice Number * | Invoice Date * */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-bold text-slate-600 mb-1.5 block">
                      {FLEX_TEXT.invoiceNumber}{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder=""
                      className={`h-10 text-xs rounded-lg focus-visible:ring-primary ${duplicateInvoice ? "border-red-400" : "border-slate-200"}`}
                    />
                    {duplicateInvoice && (
                      <p className="mt-1 text-[11px] text-red-600">
                        Invoice number &quot;{invoiceNumber.trim()}&quot; already
                        exists for this vendor.
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-slate-600 mb-1.5 block">
                      {FLEX_TEXT.invoiceDate}{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="h-10 text-xs border-slate-200 rounded-lg cursor-pointer focus-visible:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* Source Mapping Box */}
                <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-4 space-y-3.5">
                  <p className="text-[11px] text-slate-500 leading-normal">
                    {
                      FLEX_TEXT.mapEitherPurchaseOrderSOrGoodsReceiptSSelectOneSourceTypeOnlyMultiSelectIsAllowedWithinTheSameType
                    }
                  </p>

                  {/* Map Purchase Order(s) */}
                  <div>
                    <Label className="text-xs font-bold text-slate-700 mb-1 block">
                      {FLEX_TEXT.mapPurchaseOrderS}
                    </Label>
                    <Select
                      value={mappedPo}
                      onValueChange={(value) => {
                        setMappedPo(value);
                        const po = purchaseOrders.find(
                          (order: any) => order.poNumber === value,
                        );
                        if (po) {
                          setVendor(po.vendor || "");
                          setInvoiceTotalAmount(String(po.grandTotal || 0));
                          const poLines = Array.isArray(po.lineItems)
                            ? po.lineItems
                            : [];
                          setLineItems(
                            poLines.map((line: any, index: number) => {
                              const qty = Number(
                                line.qty ?? line.quantity ?? 0,
                              );
                              const price = Number(
                                line.rate ?? line.price ?? 0,
                              );
                              const cgstPct = Number(
                                line.cgstPct ?? line.cgstPercent ?? 0,
                              );
                              const sgstPct = Number(
                                line.sgstPct ?? line.sgstPercent ?? 0,
                              );
                              const igstPct = Number(
                                line.igstPct ?? line.igstPercent ?? 0,
                              );
                              const base = qty * price;
                              return {
                                id: `${po.id}-${line.id ?? index}`,
                                itemId: Number(line.itemId) || undefined,
                                item: String(
                                  line.description ?? line.item ?? "",
                                ),
                                qty,
                                price,
                                cgstPct,
                                sgstPct,
                                igstPct,
                                total: Number(
                                  line.total ??
                                    base *
                                      (1 + (cgstPct + sgstPct + igstPct) / 100),
                                ),
                                source: po.poNumber,
                              };
                            }),
                          );
                          const vendorRecord = vendorsList.find(
                            (option) =>
                              String(option.id) === String(po.vendorId) ||
                              option.name === po.vendor,
                          );
                          setVendorAddress(vendorRecord?.address || "");
                          setVendorPhone(vendorRecord?.phone || "");
                        }
                      }}
                    >
                      <SelectTrigger className="h-10 text-xs bg-white border-slate-200 rounded-lg">
                        <SelectValue
                          placeholder={
                            FLEX_TEXT.typeToFilterAndSelectPurchaseOrderS
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {purchaseOrders.map((po: any) => (
                          <SelectItem key={po.id} value={po.poNumber}>
                            {po.poNumber} ({po.vendor})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {FLEX_TEXT.sameVendorOnlyPoAmountsAreSummedForMatching}
                    </p>
                  </div>

                  {/* Map Goods Receipt(s) */}
                  <div>
                    <Label className="text-xs font-bold text-slate-700 mb-1 block">
                      {FLEX_TEXT.mapGoodsReceiptS}
                    </Label>
                    <Select
                      value={mappedGrn}
                      onValueChange={(value) => {
                        setMappedGrn(value);
                        const grn = goodsReceipts.find(
                          (receipt: any) => receipt.grnNumber === value,
                        );
                        if (grn) {
                          setVendor(grn.vendor || "");
                          const vendorRecord = vendorsList.find(
                            (option) =>
                              String(option.id) === String(grn.vendorId) ||
                              option.name === grn.vendor,
                          );
                          setVendorAddress(vendorRecord?.address || "");
                          setVendorPhone(vendorRecord?.phone || "");
                          const grnLines = Array.isArray(grn.lineItems)
                            ? grn.lineItems
                            : [];
                          setLineItems(
                            grnLines.map((line: any, index: number) => {
                              const qty = Number(
                                line.acceptedQty ?? line.receivedQty ?? 0,
                              );
                              const price = Number(
                                line.rate ?? line.unitPrice ?? 0,
                              );
                              const cgstPct = Number(
                                line.cgstPct ?? line.cgstPercent ?? 0,
                              );
                              const sgstPct = Number(
                                line.sgstPct ?? line.sgstPercent ?? 0,
                              );
                              const igstPct = Number(
                                line.igstPct ?? line.igstPercent ?? 0,
                              );
                              const base = qty * price;
                              return {
                                id: `${grn.id}-${line.id ?? index}`,
                                itemId: Number(line.itemId) || undefined,
                                item: String(
                                  line.description ?? line.itemName ?? "",
                                ),
                                qty,
                                price,
                                cgstPct,
                                sgstPct,
                                igstPct,
                                total: Number(
                                  line.lineTotal ??
                                    base *
                                      (1 + (cgstPct + sgstPct + igstPct) / 100),
                                ),
                                source: grn.grnNumber,
                              };
                            }),
                          );
                          setInvoiceTotalAmount(
                            String(Number(grn.totalAmount || 0)),
                          );
                        }
                      }}
                    >
                      <SelectTrigger className="h-10 text-xs bg-white border-slate-200 rounded-lg">
                        <SelectValue
                          placeholder={
                            FLEX_TEXT.typeToFilterAndSelectGoodsReceiptS
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {goodsReceipts.map((grn: any) => (
                          <SelectItem key={grn.id} value={grn.grnNumber}>
                            {grn.grnNumber} ({grn.vendor})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {FLEX_TEXT.sameVendorOnlyGrnAmountsAreSummedForMatching}
                    </p>
                  </div>
                </div>

                {/* Vendor Name * | Vendor Address * | Vendor Phone * */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-bold text-slate-600 mb-1.5 block">
                      {FLEX_TEXT.vendorName}{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={vendor}
                      onValueChange={(value) => {
                        setVendor(value);
                        const selectedVendor = vendorsList.find(
                          (option) => option.name === value,
                        );
                        setVendorAddress(selectedVendor?.address || "");
                        setVendorPhone(selectedVendor?.phone || "");
                      }}
                    >
                      <SelectTrigger className="h-10 text-xs bg-white border-slate-200 rounded-lg">
                        <SelectValue
                          placeholder={FLEX_TEXT.selectOrTypeVendor}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {vendorsList.map((v: any) => (
                          <SelectItem key={v.id} value={v.name}>
                            {v.id} - {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-slate-600 mb-1.5 block">
                      {FLEX_TEXT.vendorAddress}{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      placeholder=""
                      value={vendorAddress}
                      onChange={(e) => setVendorAddress(e.target.value)}
                      className="h-10 text-xs border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-slate-600 mb-1.5 block">
                      {FLEX_TEXT.vendorPhone}{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      placeholder=""
                      value={vendorPhone}
                      onChange={(e) => setVendorPhone(e.target.value)}
                      className="h-10 text-xs border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                {/* Invoice Total Amount (Rs) * */}
                <div>
                  <Label className="text-xs font-bold text-slate-600 mb-1.5 block">
                    {FLEX_TEXT.invoiceTotalAmountRs}{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    value={invoiceTotalAmount}
                    onChange={(e) => setInvoiceTotalAmount(e.target.value)}
                    className="h-10 text-xs border-slate-200 rounded-lg font-bold"
                  />
                </div>

                {/* LINE ITEMS */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">
                      {FLEX_TEXT.lineItems2}
                    </span>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> {FLEX_TEXT.addItem}
                    </button>
                  </div>

                  {lineItems.length === 0 ? (
                    <div className="border border-dashed border-slate-200 rounded-xl p-5 text-center text-xs text-slate-400 bg-white">
                      {FLEX_TEXT.noLineItemsYetMapPoGrOrAddItemsManually}
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl bg-white overflow-x-auto">
                      <table className="w-full min-w-[760px] text-xs">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-2 py-2 text-left min-w-[210px]">
                              Item
                            </th>
                            <th className="px-2 py-2 text-right w-20">Qty</th>
                            <th className="px-2 py-2 text-right w-24">Rate</th>
                            <th className="px-2 py-2 text-center w-20">
                              CGST %
                            </th>
                            <th className="px-2 py-2 text-center w-20">
                              SGST %
                            </th>
                            <th className="px-2 py-2 text-center w-20">
                              IGST %
                            </th>
                            <th className="px-2 py-2 text-right w-28">
                              Line Total
                            </th>
                            <th className="px-2 py-2 w-9" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {lineItems.map((line) => (
                            <tr key={line.id}>
                              <td className="p-2">
                                <Input
                                  list="purchase-invoice-item-options"
                                  value={line.item}
                                  placeholder="Enter or select an item"
                                  className="h-9 text-xs bg-white"
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    const masterItem = itemOptions.find(
                                      (item) =>
                                        item.name.trim().toLowerCase() ===
                                        value.trim().toLowerCase(),
                                    );
                                    setLineItems((current) =>
                                      current.map((currentLine) =>
                                        currentLine.id === line.id
                                          ? {
                                              ...currentLine,
                                              item: value,
                                              itemId: masterItem?.id,
                                            }
                                          : currentLine,
                                      ),
                                    );
                                  }}
                                />
                              </td>
                              <td className="p-2">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={line.qty}
                                  onChange={(event) =>
                                    updateLineItem(
                                      line.id,
                                      "qty",
                                      Number(event.target.value),
                                    )
                                  }
                                  className="h-9 text-xs text-right"
                                />
                              </td>
                              <td className="p-2">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={line.price}
                                  onChange={(event) =>
                                    updateLineItem(
                                      line.id,
                                      "price",
                                      Number(event.target.value),
                                    )
                                  }
                                  className="h-9 text-xs text-right"
                                />
                              </td>
                              {(["cgstPct", "sgstPct", "igstPct"] as const).map(
                                (field) => (
                                  <td key={field} className="p-2">
                                    <Select
                                      value={String(line[field])}
                                      onValueChange={(value) =>
                                        updateLineItem(
                                          line.id,
                                          field,
                                          Number(value),
                                        )
                                      }
                                    >
                                      <SelectTrigger className="h-9 text-xs bg-white">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {[0, 5, 9, 12, 18, 28].map((tax) => (
                                          <SelectItem
                                            key={tax}
                                            value={String(tax)}
                                          >
                                            {tax}%
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </td>
                                ),
                              )}
                              <td className="p-2 text-right font-bold text-slate-800 whitespace-nowrap">
                                {"\u20B9"}{" "}
                                {Number(line.total || 0).toLocaleString(
                                  "en-IN",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  },
                                )}
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLineItems((current) =>
                                      current.filter(
                                        (item) => item.id !== line.id,
                                      ),
                                    )
                                  }
                                  className="text-slate-400 hover:text-red-500"
                                  aria-label="Remove line item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <datalist id="purchase-invoice-item-options">
                        {itemOptions.map((item) => (
                          <option key={item.id} value={item.name} />
                        ))}
                      </datalist>
                    </div>
                  )}
                </div>

                {/* MATCH PREVIEW Card */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-bold tracking-wider text-slate-500 uppercase block">
                    {FLEX_TEXT.matchPreview}
                  </span>
                  <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-4 grid grid-cols-3 gap-3 text-center">
                    <div className="text-left">
                      <div className="text-[11px] font-semibold text-slate-400">
                        {FLEX_TEXT.printPoAmount}
                      </div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">
                        {"\u20B9"}{" "}
                        {Number(
                          purchaseOrders.find(
                            (po: any) => po.poNumber === mappedPo,
                          )?.grandTotal || 0,
                        ).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400">
                        {FLEX_TEXT.grnAmount}
                      </div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">
                        {"\u20B9"}{" "}
                        {mappedGrnAmount.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-semibold text-slate-400">
                        {FLEX_TEXT.invoiceAmount}
                      </div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">
                        {"\u20B9"}{" "}
                        {Number(invoiceTotalAmount || 0).toLocaleString(
                          "en-IN",
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Supporting Document (optional) */}
                <div className="pt-1">
                  <Label className="text-xs font-medium text-slate-500 mb-1.5 block">
                    {FLEX_TEXT.supportingDocumentOptional}
                  </Label>
                  <div
                    onClick={() =>
                      document.getElementById("pi-file-input")?.click()
                    }
                    className="border border-slate-200 rounded-xl p-3.5 bg-white flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                        <Paperclip className="w-4 h-4" />
                      </div>
                      <div>
                        <Label className="text-xs font-bold text-slate-800 cursor-pointer block">
                          {FLEX_TEXT.clickToAttachFile}
                        </Label>
                        <span className="text-[10px] text-slate-400">
                          {FLEX_TEXT.pdfJpgPngWebpMax250Kb}
                        </span>
                      </div>
                    </div>
                    {attachmentName ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-primary font-semibold">
                          {attachmentName}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAttachmentName("");
                          }}
                          className="text-slate-400 hover:text-slate-600 font-bold text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-md border border-slate-200">
                        {FLEX_TEXT.chooseFile}
                      </span>
                    )}
                    <Input
                      type="file"
                      id="pi-file-input"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setAttachmentName(file.name);
                          toast.success(`${FLEX_TEXT.attached}${file.name}`);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 px-5 text-xs font-semibold text-slate-700 bg-white border-slate-200 rounded-xl hover:bg-slate-50"
                  onClick={() => setIsAddOpen(false)}
                >
                  {FLEX_TEXT.cancel}
                </Button>
                <Button
                  type="submit"
                  className="h-10 px-5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-xs gap-1.5"
                >
                  <Plus className="w-4 h-4" /> {FLEX_TEXT.logInvoice}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
