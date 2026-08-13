import { FLEX_TEXT } from "./flexText";
import {
  useFlexGoodsReceipts,
  useFlexMasterData,
  useFlexPurchaseInvoices,
} from "./flexData";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { FlexTabs } from "./FlexTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataPagination } from "@/components/ui/data-pagination";
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
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Printer,
  Paperclip,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PurchaseReturnItem {
  id: number;
  vendorId: string;
  vendor: string;
  returnNumber: string;
  grnNumber: string;
  reason: string;
  refundAmount: number;
  date: string;
  status: string;
  lineItems: ReturnLine[];
}

interface ReturnLine {
  id: string;
  item: string;
  itemId?: number;
  invoiceReference?: string;
  poReference?: string;
  grnReference?: string;
  warehouse: string;
  receivedQty: number;
  returnQty: number;
  rate: number;
  cgstPct: number;
  sgstPct: number;
  igstPct: number;
}

async function fetchPurchaseReturns(): Promise<PurchaseReturnItem[]> {
  const res = await fetch(`${BASE}/api/flex/purchase-returns`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(FLEX_TEXT.failedToInitiateReturn);
  const data = await res.json();
  if (!data || !Array.isArray(data)) return [];
  return data.map((r: any) => ({
    id: r.id,
    vendorId: r.vendorId || "",
    vendor: r.vendor,
    returnNumber: r.returnNumber,
    grnNumber: r.grnReference || "",
    reason: r.reason,
    refundAmount: Number(r.refundAmount || 0),
    date: r.returnDate,
    status: r.status,
    lineItems: Array.isArray(r.lineItems) ? r.lineItems : [],
  }));
}

async function createPurchaseReturn(payload: any) {
  const res = await fetch(`${BASE}/api/flex/purchase-returns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || FLEX_TEXT.failedToInitiateReturn);
  }
  return res.json();
}

async function updatePurchaseReturnStatus(id: number, status: string) {
  const res = await fetch(`${BASE}/api/flex/purchase-returns/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(body.error || "Failed to update purchase return");
  return body;
}

export default function PurchaseReturns() {
  const queryClient = useQueryClient();
  const { data: returnsList = [] } = useQuery({
    queryKey: ["get", "/api/flex/purchase-returns"],
    queryFn: fetchPurchaseReturns,
  });

  const { data: masterData } = useFlexMasterData();
  const { data: goodsReceipts = [] } = useFlexGoodsReceipts();
  const { data: purchaseInvoices = [] } = useFlexPurchaseInvoices();
  const vendorsList = masterData?.vendors ?? [];
  const warehouseOptions = masterData?.warehouses ?? [];
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);

  // Form
  const [vendor, setVendor] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [invoiceReference, setInvoiceReference] = useState("");
  const [grnReference, setGrnReference] = useState("");
  const [reason, setReason] = useState("");
  const [returnDate, setReturnDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [lineItems, setLineItems] = useState<ReturnLine[]>([]);
  const [notes, setNotes] = useState("");
  const [attachmentName, setAttachmentName] = useState("");

  const refundAmount = useMemo(
    () =>
      lineItems.reduce((sum, line) => {
        const base = line.returnQty * line.rate;
        return (
          sum + base * (1 + (line.cgstPct + line.sgstPct + line.igstPct) / 100)
        );
      }, 0),
    [lineItems],
  );
  const totalReturnQty = useMemo(
    () => lineItems.reduce((sum, line) => sum + line.returnQty, 0),
    [lineItems],
  );
  const selectedInvoiceAmount = useMemo(() => {
    const invoice = purchaseInvoices.find(
      (item: any) => item.invoiceNumber === invoiceReference,
    );
    return Number(invoice?.amount || 0);
  }, [invoiceReference, purchaseInvoices]);
  const nonReturnedAmount = Math.max(0, selectedInvoiceAmount - refundAmount);

  const createMutation = useMutation({
    mutationFn: createPurchaseReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-returns"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      toast.success(FLEX_TEXT.purchaseReturnInitiatedSuccessfully);
      setIsAddOpen(false);
      setVendor("");
      setVendorAddress("");
      setVendorPhone("");
      setInvoiceReference("");
      setGrnReference("");
      setReason("");
      setLineItems([]);
      setNotes("");
      setAttachmentName("");
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToInitiateReturn);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      updatePurchaseReturnStatus(id, status),
    onSuccess: (updated: PurchaseReturnItem) => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-returns"],
      });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
      toast.success(
        updated.status === "Product Dispatched"
          ? "Return confirmed and product dispatched"
          : "Purchase return rejected",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    return returnsList.filter((ret) => {
      const matchesVendor =
        selectedVendor === "All" || ret.vendor === selectedVendor;
      const matchesSearch =
        !search.trim() ||
        ret.returnNumber.toLowerCase().includes(search.toLowerCase()) ||
        ret.vendor.toLowerCase().includes(search.toLowerCase()) ||
        ret.reason.toLowerCase().includes(search.toLowerCase());

      const rTime = new Date(ret.date).getTime();
      const matchesFromDate =
        !fromDate || isNaN(rTime) || rTime >= new Date(fromDate).getTime();
      const matchesToDate =
        !toDate || isNaN(rTime) || rTime <= new Date(toDate).getTime();

      return matchesVendor && matchesSearch && matchesFromDate && matchesToDate;
    });
  }, [returnsList, search, selectedVendor, fromDate, toDate]);
  const pageSize = Number(rowsPerPage);
  const paginatedReturns = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  useEffect(
    () => setCurrentPage(1),
    [search, selectedVendor, fromDate, toDate, rowsPerPage],
  );
  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (currentPage > lastPage) setCurrentPage(lastPage);
  }, [currentPage, filtered.length, pageSize]);

  const handleInitiateReturn = (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lineItems.filter((line) => line.returnQty > 0);
    if (
      !vendor.trim() ||
      !vendorAddress.trim() ||
      !vendorPhone.trim() ||
      !reason.trim() ||
      !validLines.length ||
      validLines.some(
        (line) => !line.warehouse || line.returnQty > Number(line.receivedQty),
      )
    ) {
      toast.error(
        "Vendor details, reason, warehouse and valid return quantities are required",
      );
      return;
    }
    const vendorRecord = vendorsList.find((option) => option.name === vendor);

    createMutation.mutate({
      vendorName: vendor.trim(),
      vendorId: vendorRecord?.id || "",
      vendorAddress: vendorAddress.trim(),
      vendorPhone: vendorPhone.trim(),
      invoiceReference,
      grnReference,
      reason: reason.trim(),
      returnDate,
      refundAmount,
      lineItems: validLines,
      notes: notes.trim(),
      attachmentName,
      status: "Draft",
    });
  };

  const populateVendor = (name: string, id?: string | number) => {
    setVendor(name);
    const contact = vendorsList.find(
      (option) =>
        option.name === name || String(option.id) === String(id || ""),
    );
    setVendorAddress(contact?.address || "");
    setVendorPhone(contact?.phone || "");
  };

  const mapReceiptLines = (receipt: any, invoiceRef = "") => {
    populateVendor(
      receipt.vendor || receipt.vendorName || "",
      receipt.vendorId,
    );
    setGrnReference(receipt.grnNumber || "");
    const invoice = purchaseInvoices.find(
      (item: any) => item.invoiceNumber === invoiceRef,
    );
    const invoiceLines = Array.isArray(invoice?.lineItems)
      ? invoice.lineItems
      : [];
    setLineItems(
      (Array.isArray(receipt.lineItems) ? receipt.lineItems : []).map(
        (line: any, index: number) => {
          const description = String(
            line.description || line.itemName || "Item",
          );
          const invoiceLine = invoiceLines.find((candidate: any) => {
            const sameItemId =
              Number(line.itemId) > 0 &&
              Number(candidate.itemId) === Number(line.itemId);
            const candidateDescription = String(
              candidate.item || candidate.description || "",
            )
              .trim()
              .toLowerCase();
            return (
              sameItemId ||
              candidateDescription === description.trim().toLowerCase()
            );
          });
          return {
            id: `${receipt.id}-${line.id ?? index}`,
            item: description,
            itemId: Number(line.itemId) || undefined,
            invoiceReference: invoiceRef,
            poReference: String(line.poNumber || receipt.poReference || ""),
            grnReference: receipt.grnNumber,
            warehouse: String(line.warehouse || ""),
            receivedQty: Number(line.acceptedQty ?? line.receivedQty ?? 0),
            returnQty: 0,
            rate: Number(
              invoiceLine?.price ??
                invoiceLine?.rate ??
                line.rate ??
                line.unitPrice ??
                0,
            ),
            cgstPct: Number(
              invoiceLine?.cgstPct ??
                invoiceLine?.cgstPercent ??
                line.cgstPct ??
                line.cgstPercent ??
                0,
            ),
            sgstPct: Number(
              invoiceLine?.sgstPct ??
                invoiceLine?.sgstPercent ??
                line.sgstPct ??
                line.sgstPercent ??
                0,
            ),
            igstPct: Number(
              invoiceLine?.igstPct ??
                invoiceLine?.igstPercent ??
                line.igstPct ??
                line.igstPercent ??
                0,
            ),
          };
        },
      ),
    );
  };

  const handlePrintReturn = (ret: PurchaseReturnItem) => {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      toast.error("Allow pop-ups to print the purchase return.");
      return;
    }
    const rows = ret.lineItems
      .map(
        (line) =>
          `<tr><td>${line.item}</td><td>${line.returnQty}</td><td>${line.warehouse || "-"}</td><td>₹ ${(line.returnQty * line.rate).toLocaleString("en-IN")}</td></tr>`,
      )
      .join("");
    printWindow.document.write(
      `<!doctype html><html><head><title>${ret.returnNumber}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#17211f}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #ddd;padding:10px;text-align:left}.summary{margin-top:18px;font-weight:700}</style></head><body><h1>Purchase Return ${ret.returnNumber}</h1><p><strong>Vendor:</strong> ${ret.vendor}</p><p><strong>Date:</strong> ${ret.date}</p><p><strong>Reason:</strong> ${ret.reason}</p><table><thead><tr><th>Item</th><th>Returned Qty</th><th>Warehouse</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table><p class="summary">Return Amount: ₹ ${ret.refundAmount.toLocaleString("en-IN")}</p><script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`,
    );
    printWindow.document.close();
  };

  return (
    <Shell>
      <div className="w-full space-y-5 p-6">
        <FlexTabs />

        {/* Title Header Row */}
        <div className="flex items-center justify-between pt-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {FLEX_TEXT.purchaseReturns}
          </h1>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 py-2 rounded-md gap-2"
            onClick={() => setIsAddOpen(true)}
          >
            <Plus className="w-4 h-4" /> {FLEX_TEXT.initiateReturn}
          </Button>
        </div>

        {/* Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={FLEX_TEXT.searchPurchaseReturnsOrVendorIdCon}
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
                {vendorsList.map((option) => (
                  <SelectItem key={option.id} value={option.name}>
                    {option.name}
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
                      {FLEX_TEXT.return}
                    </th>
                    <th className="px-4 py-3 font-semibold">Item</th>
                    <th className="px-4 py-3 font-semibold">Returned Qty</th>
                    <th className="px-4 py-3 font-semibold">PO/GRN Ref</th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.reason}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.refundAmt}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.date}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.status}
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
                        colSpan={11}
                        className="px-4 py-12 text-center text-muted-foreground text-sm"
                      >
                        <RotateCcw className="w-7 h-7 mx-auto mb-2 text-muted-foreground/40" />
                        {FLEX_TEXT.noPurchaseReturnsRecordedYet}
                      </td>
                    </tr>
                  ) : (
                    paginatedReturns.map((ret) => (
                      <tr
                        key={ret.id}
                        className="hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                          {ret.vendorId}
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {ret.vendor}
                        </td>
                        <td className="px-4 py-3 font-semibold text-muted-foreground font-mono text-[11px]">
                          {ret.returnNumber}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {ret.lineItems
                            .map((line) => line.item)
                            .filter(Boolean)
                            .join(", ") || "-"}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {ret.lineItems.reduce(
                            (sum, line) => sum + Number(line.returnQty || 0),
                            0,
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                          {ret.lineItems[0]?.poReference || ""}
                          {ret.lineItems[0]?.poReference && ret.grnNumber
                            ? " / "
                            : ""}
                          {ret.grnNumber || "-"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {ret.reason}
                        </td>
                        <td className="px-4 py-3 font-bold text-foreground">
                          ₹ {ret.refundAmount.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {ret.date}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                            {ret.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {(ret.status === "Draft" ||
                            ret.status === "Requested") && (
                            <div className="inline-flex items-center gap-1 mr-1">
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={statusMutation.isPending}
                                onClick={() =>
                                  statusMutation.mutate({
                                    id: ret.id,
                                    status: "Product Dispatched",
                                  })
                                }
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Confirm
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 border-red-300 text-red-600 hover:bg-red-50"
                                disabled={statusMutation.isPending}
                                onClick={() =>
                                  statusMutation.mutate({
                                    id: ret.id,
                                    status: "Rejected",
                                  })
                                }
                              >
                                <XCircle className="w-3.5 h-3.5" /> Reject
                              </Button>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handlePrintReturn(ret)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                            title="Print purchase return"
                            aria-label={`Print purchase return ${ret.returnNumber}`}
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <DataPagination
              currentPage={currentPage}
              pageSize={pageSize}
              totalCount={filtered.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => {
                setRowsPerPage(String(size));
                setCurrentPage(1);
              }}
            />
          </CardContent>
        </Card>

        {/* Initiate Return Dialog */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-6xl max-h-[92vh] overflow-x-hidden overflow-y-auto p-4 sm:p-6">
            <form onSubmit={handleInitiateReturn}>
              <DialogHeader className="border-b pb-4">
                <DialogTitle className="flex items-center gap-3 text-xl">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500">
                    <RotateCcw className="h-5 w-5" />
                  </span>
                  Log Purchase Return
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-5 py-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Return Date *</Label>
                    <Input
                      type="date"
                      value={returnDate}
                      onChange={(event) => setReturnDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reason *</Label>
                    <Select value={reason} onValueChange={setReason}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          "Damage",
                          "Quality Issue",
                          "Wrong Item",
                          "Excess Quantity",
                          "Other",
                        ].map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
                  <div className="space-y-2">
                    <Label>Map Purchase Invoice</Label>
                    <Select
                      value={invoiceReference}
                      onValueChange={(value) => {
                        setInvoiceReference(value);
                        const invoice = purchaseInvoices.find(
                          (item: any) => item.invoiceNumber === value,
                        );
                        if (!invoice) return;
                        populateVendor(
                          invoice.vendor || invoice.vendorName || "",
                          invoice.vendorId,
                        );
                        const receipt = goodsReceipts.find(
                          (item: any) =>
                            item.grnNumber === invoice.grnReference,
                        );
                        if (receipt) mapReceiptLines(receipt, value);
                        else {
                          setGrnReference("");
                          setLineItems(
                            (Array.isArray(invoice.lineItems)
                              ? invoice.lineItems
                              : []
                            ).map((line: any, index: number) => ({
                              id: `invoice-${invoice.id}-${index}`,
                              item: String(
                                line.item || line.description || "Item",
                              ),
                              itemId: Number(line.itemId) || undefined,
                              invoiceReference: value,
                              poReference: String(invoice.poReference || ""),
                              grnReference: String(invoice.grnReference || ""),
                              warehouse: "",
                              receivedQty: Number(
                                line.qty ?? line.quantity ?? 0,
                              ),
                              returnQty: 0,
                              rate: Number(line.price ?? line.rate ?? 0),
                              cgstPct: Number(
                                line.cgstPct ?? line.cgstPercent ?? 0,
                              ),
                              sgstPct: Number(
                                line.sgstPct ?? line.sgstPercent ?? 0,
                              ),
                              igstPct: Number(
                                line.igstPct ?? line.igstPercent ?? 0,
                              ),
                            })),
                          );
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select purchase invoice" />
                      </SelectTrigger>
                      <SelectContent>
                        {purchaseInvoices.map((invoice: any) => (
                          <SelectItem
                            key={invoice.id}
                            value={invoice.invoiceNumber}
                          >
                            {invoice.invoiceNumber} ({invoice.vendor})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Map Goods Receipt</Label>
                    <Select
                      value={grnReference}
                      onValueChange={(value) => {
                        const receipt = goodsReceipts.find(
                          (item: any) => item.grnNumber === value,
                        );
                        if (receipt) mapReceiptLines(receipt, invoiceReference);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select goods receipt" />
                      </SelectTrigger>
                      <SelectContent>
                        {goodsReceipts.map((receipt: any) => (
                          <SelectItem
                            key={receipt.id}
                            value={receipt.grnNumber}
                          >
                            {receipt.grnNumber} ({receipt.vendor})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Map an invoice or GRN to load returnable received lines
                      automatically.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Vendor Name *</Label>
                    <Select
                      value={vendor}
                      onValueChange={(value) => populateVendor(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendorsList.map((option) => (
                          <SelectItem key={option.id} value={option.name}>
                            {option.id} - {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Vendor Address *</Label>
                    <Input
                      value={vendorAddress}
                      onChange={(e) => setVendorAddress(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Vendor Phone *</Label>
                    <Input
                      value={vendorPhone}
                      onChange={(e) => setVendorPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <span className="text-blue-600">Selected Vendor</span>
                    <strong className="float-right">{vendor || "-"}</strong>
                  </div>
                  <div>
                    <span className="text-blue-600">Total Return Qty</span>
                    <strong className="float-right">{totalReturnQty}</strong>
                  </div>
                  <div>
                    <span className="text-blue-600">Invoice Amount</span>
                    <strong className="float-right">
                      ₹{" "}
                      {selectedInvoiceAmount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </strong>
                  </div>
                  <div>
                    <span className="text-blue-600">Non-returned Amount</span>
                    <strong className="float-right">
                      ₹{" "}
                      {nonReturnedAmount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </strong>
                  </div>
                  <div>
                    <span className="text-blue-600">Refund Amount</span>
                    <strong className="float-right">
                      ₹{" "}
                      {refundAmount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </strong>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[900px] text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="p-3 text-left">INVOICE</th>
                        <th className="p-3 text-left">PO</th>
                        <th className="p-3 text-left">GRN</th>
                        <th className="p-3 text-left">ITEM</th>
                        <th className="p-3 text-left">WAREHOUSE</th>
                        <th className="p-3 text-right">RECEIVED</th>
                        <th className="p-3 text-right">RETURN QTY</th>
                        <th className="p-3 text-right">AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((line) => (
                        <tr key={line.id} className="border-t">
                          <td className="p-3">
                            {line.invoiceReference || "-"}
                          </td>
                          <td className="p-3">{line.poReference || "-"}</td>
                          <td className="p-3">{line.grnReference || "-"}</td>
                          <td className="p-3 font-medium">{line.item}</td>
                          <td className="p-2">
                            <Select
                              value={line.warehouse}
                              onValueChange={(value) =>
                                setLineItems((current) =>
                                  current.map((item) =>
                                    item.id === line.id
                                      ? { ...item, warehouse: value }
                                      : item,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select warehouse" />
                              </SelectTrigger>
                              <SelectContent>
                                {warehouseOptions.map((warehouse) => (
                                  <SelectItem
                                    key={warehouse.id}
                                    value={warehouse.name}
                                  >
                                    {warehouse.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-3 text-right">{line.receivedQty}</td>
                          <td className="p-2">
                            <Input
                              className="h-9 text-right"
                              type="number"
                              min="0"
                              max={line.receivedQty}
                              step="any"
                              value={line.returnQty || ""}
                              onChange={(event) =>
                                setLineItems((current) =>
                                  current.map((item) =>
                                    item.id === line.id
                                      ? {
                                          ...item,
                                          returnQty: Math.min(
                                            line.receivedQty,
                                            Math.max(
                                              0,
                                              Number(event.target.value),
                                            ),
                                          ),
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="p-3 text-right font-semibold">
                            ₹{" "}
                            {(
                              line.returnQty *
                              line.rate *
                              (1 +
                                (line.cgstPct + line.sgstPct + line.igstPct) /
                                  100)
                            ).toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!lineItems.length && (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      Select an invoice or GRN to load returnable lines.
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Supporting Document (optional)</Label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-4">
                    <Paperclip className="h-4 w-4" />
                    <span>{attachmentName || "Click to attach file"}</span>
                    <Input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (file.size > 250 * 1024) {
                          toast.error("File must be 250 KB or smaller");
                          return;
                        }
                        setAttachmentName(file.name);
                      }}
                    />
                  </label>
                </div>
              </div>
              <DialogFooter className="border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddOpen(false)}
                >
                  {FLEX_TEXT.cancel}
                </Button>
                <Button
                  type="submit"
                  className="bg-primary text-primary-foreground"
                >
                  <Plus className="mr-1 h-4 w-4" /> Log Return
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
