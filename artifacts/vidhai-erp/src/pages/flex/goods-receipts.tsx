import { FLEX_TEXT } from "./flexText";
import { useFlexMasterData, useFlexPurchaseOrders } from "./flexData";
import { useMemo, useState } from "react";
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
  Eye,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  Paperclip,
  Trash2,
  Download,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface GRNLineItem {
  id: string;
  purchaseOrderId: number;
  poLineId: string;
  poNumber: string;
  itemId?: number;
  itemMaster: string;
  customSpec: string;
  warehouse: string;
  qty: number;
  alreadyReceived: number;
  price: number;
  recvQty: number;
  cgstPct: number;
  sgstPct: number;
  igstPct: number;
  total: number;
}

export interface GoodsReceiptItem {
  id: number;
  vendorId: string;
  vendor: string;
  grnNumber: string;
  poNumber: string;
  receivedDate: string;
  receivedBy: string;
  receivedOrdered: string;
  pending: string;
  status: string;
  purchaseOrderId?: number;
  purchaseOrderIds?: number[];
  lineItems?: any[];
  totalAmount: number;
  receivedQuantity: number;
  orderedQuantity: number;
  remainingQuantity: number;
  notes?: string;
  attachmentName?: string;
}

async function fetchGoodsReceipts(): Promise<GoodsReceiptItem[]> {
  const res = await fetch(`${BASE}/api/flex/goods-receipts`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load Goods Receipts");
  const data = await res.json();
  return (data || []).map((g: any) => ({
    id: g.id,
    vendorId: g.vendorId || "",
    vendor: g.vendor,
    grnNumber: g.grnNumber,
    poNumber: g.poReference,
    receivedDate: g.receivedDate,
    receivedBy: g.inspectedBy || "",
    receivedOrdered: g.itemsReceived || "",
    pending: "",
    status: g.status,
    purchaseOrderId: g.purchaseOrderId,
    purchaseOrderIds:
      g.purchaseOrderIds || (g.purchaseOrderId ? [g.purchaseOrderId] : []),
    lineItems: g.lineItems || [],
    totalAmount: Number(g.totalAmount || 0),
    receivedQuantity: Number(g.receivedQuantity || 0),
    orderedQuantity: Number(g.orderedQuantity || 0),
    remainingQuantity: Number(g.remainingQuantity || 0),
    notes: g.notes || "",
    attachmentName: g.attachmentName || "",
  }));
}
async function createGoodsReceipt(payload: any) {
  const res = await fetch(`${BASE}/api/flex/goods-receipts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || FLEX_TEXT.failedToCreateGrn);
  }
  return res.json();
}

export default function GoodsReceipts() {
  const queryClient = useQueryClient();
  const {
    data: grns = [],
    refetch,
    isFetching,
    isError: receiptsLoadFailed,
  } = useQuery({
    queryKey: ["get", "/api/flex/goods-receipts"],
    queryFn: fetchGoodsReceipts,
  });

  const { data: masterData } = useFlexMasterData();
  const { data: purchaseOrders = [] } = useFlexPurchaseOrders();
  const vendorsList = masterData?.vendors ?? [];
  const itemOptions = masterData?.items ?? [];
  const userOptions = masterData?.users ?? [];
  const warehouseOptions = masterData?.warehouses ?? [];

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [viewReceipt, setViewReceipt] = useState<GoodsReceiptItem | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState("10");

  // Form fields for Log Goods Receipt
  const [mappedPoIds, setMappedPoIds] = useState<string[]>([]);
  const [poSearch, setPoSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [receivedDate, setReceivedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [attachmentName, setAttachmentName] = useState("");

  // Line items state
  const [lineItems, setLineItems] = useState<GRNLineItem[]>([]);

  const calculatedSubtotal = useMemo(() => {
    return lineItems.reduce((acc, l) => acc + l.recvQty * l.price, 0);
  }, [lineItems]);

  const calculatedTax = useMemo(() => {
    return lineItems.reduce(
      (acc, l) =>
        acc + (l.recvQty * l.price * (l.cgstPct + l.sgstPct + l.igstPct)) / 100,
      0,
    );
  }, [lineItems]);

  const calculatedGrandTotal = useMemo(() => {
    return calculatedSubtotal + calculatedTax;
  }, [calculatedSubtotal, calculatedTax]);

  const createMutation = useMutation({
    mutationFn: createGoodsReceipt,
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/goods-receipts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
      toast.success(`${created.grnNumber} saved successfully`);
      setIsAddOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToLogGrn);
    },
  });

  const markCompleteMutation = useMutation({
    mutationFn: async (receipt: GoodsReceiptItem) => {
      const response = await fetch(
        `${BASE}/api/flex/goods-receipts/${receipt.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "Complete" }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to complete Goods Receipt");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/goods-receipts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-orders"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      toast.success("Goods Receipt marked Complete");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const resetForm = () => {
    setLineItems([]);
    setMappedPoIds([]);
    setPoSearch("");
    setUserSearch("");
    setReceivedBy("");
    setVendorName("");
    setVendorAddress("");
    setVendorPhone("");
    setNotes("");
    setAttachmentName("");
  };

  const handleAddBlankRow = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        purchaseOrderId: 0,
        poLineId: "",
        poNumber: "",
        itemMaster: "",
        customSpec: "",
        warehouse: "",
        qty: 1,
        alreadyReceived: 0,
        price: 0,
        recvQty: 1,
        cgstPct: 9,
        sgstPct: 9,
        igstPct: 18,
        total: 0,
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    setLineItems((prev) => prev.filter((l) => l.id !== id));
  };

  const handleLineChange = (
    id: string,
    field: keyof GRNLineItem,
    value: any,
  ) => {
    setLineItems((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, [field]: value };
        const sub = updated.recvQty * updated.price;
        const tx = (sub * (updated.cgstPct + updated.sgstPct)) / 100;
        updated.total = sub + tx;
        return updated;
      }),
    );
  };

  const updateMappedPurchaseOrders = (nextIds: string[]) => {
    setMappedPoIds(nextIds);
    const selected = purchaseOrders.filter((po: any) =>
      nextIds.includes(String(po.id)),
    );
    const selectedVendors = selected.map((po: any) =>
      vendorsList.find((vendor) => String(vendor.id) === String(po.vendorId)),
    );
    setVendorName(
      [...new Set(selected.map((po: any) => po.vendor).filter(Boolean))].join(
        ", ",
      ),
    );
    setVendorAddress(
      [
        ...new Set(
          selected
            .map(
              (po: any, index: number) =>
                po.vendorAddress || selectedVendors[index]?.address,
            )
            .filter(Boolean),
        ),
      ].join(" | "),
    );
    setVendorPhone(
      [
        ...new Set(
          selected
            .map(
              (po: any, index: number) =>
                po.vendorPhone || selectedVendors[index]?.phone,
            )
            .filter(Boolean),
        ),
      ].join(", "),
    );
    setPlaceOfSupply(
      [
        ...new Set(selected.map((po: any) => po.placeOfSupply).filter(Boolean)),
      ].join(", "),
    );
    const mappedLines = selected.flatMap((po: any) => {
      const poLines = Array.isArray(po.lineItems) ? po.lineItems : [];
      return poLines.map((line: any) => {
        const lineKey = String(line.itemId || line.id || line.description || "")
          .trim()
          .toLowerCase();
        const alreadyReceived = grns
          .filter((receipt) =>
            (receipt.purchaseOrderIds || [receipt.purchaseOrderId])
              .map(Number)
              .includes(Number(po.id)),
          )
          .flatMap((receipt) => receipt.lineItems || [])
          .filter(
            (received: any) =>
              Number(
                received.purchaseOrderId ||
                  receiptPurchaseOrderId(received, po.id),
              ) === Number(po.id) &&
              String(
                received.itemId ||
                  received.poLineId ||
                  received.description ||
                  "",
              )
                .trim()
                .toLowerCase() === lineKey,
          )
          .reduce(
            (sum: number, received: any) =>
              sum + Number(received.receivedQty || 0),
            0,
          );
        const qty = Number(line.qty ?? line.quantity ?? 0);
        const price = Number(line.rate ?? line.price ?? 0);
        return {
          id: `${po.id}:${String(line.id || line.itemId || line.description)}`,
          purchaseOrderId: Number(po.id),
          poLineId: String(line.id || line.itemId || line.description),
          poNumber: String(po.poNumber),
          itemId: line.itemId ? Number(line.itemId) : undefined,
          itemMaster: String(line.description || ""),
          customSpec: String(line.unit || ""),
          warehouse: String(po.warehouse || ""),
          qty,
          alreadyReceived,
          price,
          recvQty: 0,
          cgstPct: Number(line.cgstPct || 0),
          sgstPct: Number(line.sgstPct || 0),
          igstPct: Number(line.igstPct || 0),
          total: 0,
        };
      });
    });
    setLineItems(mappedLines);
  };

  const receiptPurchaseOrderId = (line: any, fallback: number) =>
    line.purchaseOrderId || fallback;
  const togglePurchaseOrder = (value: string) =>
    updateMappedPurchaseOrders(
      mappedPoIds.includes(value)
        ? mappedPoIds.filter((id) => id !== value)
        : [...mappedPoIds, value],
    );
  const filteredPurchaseOrders = useMemo(() => {
    const term = poSearch.trim().toLowerCase();
    return purchaseOrders.filter(
      (po: any) =>
        po.status !== "Completed" &&
        (!term ||
          `${po.poNumber} ${po.vendorId} ${po.vendor}`
            .toLowerCase()
            .includes(term)),
    );
  }, [purchaseOrders, poSearch]);
  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    return userOptions.filter(
      (user) => !term || `${user.name} ${user.id}`.toLowerCase().includes(term),
    );
  }, [userOptions, userSearch]);

  const filtered = useMemo(() => {
    return grns.filter((g) => {
      const matchesVendor =
        selectedVendor === "All" || g.vendor === selectedVendor;
      const matchesSearch =
        !search.trim() ||
        g.grnNumber.toLowerCase().includes(search.toLowerCase()) ||
        g.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        g.vendor.toLowerCase().includes(search.toLowerCase()) ||
        g.vendorId.toLowerCase().includes(search.toLowerCase());

      const gTime = new Date(g.receivedDate).getTime();
      const matchesFromDate =
        !fromDate || isNaN(gTime) || gTime >= new Date(fromDate).getTime();
      const matchesToDate =
        !toDate || isNaN(gTime) || gTime <= new Date(toDate).getTime();

      return matchesVendor && matchesSearch && matchesFromDate && matchesToDate;
    });
  }, [grns, search, selectedVendor, fromDate, toDate]);

  const handlePrintGRN = (g: GoodsReceiptItem) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Print ${g.grnNumber}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 30px; color: #111; }
            h2 { color: #0d9488; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h2>VIDHAI ERP - GOODS RECEIPT NOTE ${g.grnNumber}</h2>
          <p><strong>${FLEX_TEXT.printVendor}</strong> ${g.vendor} (${g.vendorId})</p>
          <p><strong>${FLEX_TEXT.printPoReference}</strong> ${g.poNumber} | <strong>${FLEX_TEXT.printReceivedBy}</strong> ${g.receivedBy}</p>
          <p><strong>${FLEX_TEXT.printReceivedDate}</strong> ${g.receivedDate} | <strong>${FLEX_TEXT.printStatus}</strong> ${g.status}</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleCreateGRN = (event: React.FormEvent) => {
    event.preventDefault();
    if (!mappedPoIds.length) {
      toast.error("Select at least one Purchase Order");
      return;
    }
    if (!receivedBy) {
      toast.error("Select who received the goods");
      return;
    }
    const negativeLine = lineItems.find((line) => line.recvQty < 0);
    if (negativeLine) {
      toast.error("Received quantity cannot be negative.");
      return;
    }
    const overReceivedLine = lineItems.find(
      (line) => line.recvQty > Math.max(0, line.qty - line.alreadyReceived),
    );
    if (overReceivedLine) {
      const remaining = Math.max(
        0,
        overReceivedLine.qty - overReceivedLine.alreadyReceived,
      );
      toast.error(
        `Cannot receive ${overReceivedLine.recvQty}. Only ${remaining} units remain for this purchase order item.`,
      );
      return;
    }
    const receiptLines = lineItems.filter((line) => line.recvQty > 0);
    if (!receiptLines.length) {
      toast.error("Enter This GRN Qty for at least one item.");
      return;
    }
    if (receiptLines.some((line) => !line.warehouse)) {
      toast.error("Select a warehouse for every received item");
      return;
    }
    createMutation.mutate({
      purchaseOrderIds: mappedPoIds.map(Number),
      receivedDate,
      inspectedByUserId: Number(receivedBy),
      notes,
      attachmentName,
      lineItems: receiptLines.map((line) => ({
        purchaseOrderId: line.purchaseOrderId,
        itemId: line.itemId,
        poLineId: line.poLineId,
        description: line.itemMaster,
        receivedQty: line.recvQty,
        unit: line.customSpec,
        unitPrice: line.price,
        warehouse: line.warehouse,
      })),
    });
  };
  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto w-full space-y-5">
        <FlexTabs />

        {/* Title Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {FLEX_TEXT.goodsReceiptsGrn}
            </h1>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={() => {
                refetch();
                toast.info(FLEX_TEXT.refreshedGoodsReceipts);
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
              <Plus className="w-4 h-4" /> {FLEX_TEXT.logReceipt}
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
              placeholder={FLEX_TEXT.searchGoodsReceiptsOrVendorIdCon}
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
                {vendorsList.map((v: any) => (
                  <SelectItem key={v.id} value={v.name}>
                    {v.name}
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
                    <th className="px-4 py-3 font-semibold">S.No</th>
                    <th className="px-4 py-3 font-semibold">{FLEX_TEXT.grn}</th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.vendor2}
                    </th>
                    <th className="px-4 py-3 font-semibold">{FLEX_TEXT.po}</th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.receivedDate}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.receivedBy}
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      Received Qty
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      Remaining
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      Amount
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
                        className="px-4 py-8 text-center text-muted-foreground text-sm"
                      >
                        {receiptsLoadFailed
                          ? "Failed to load Goods Receipts"
                          : FLEX_TEXT.noGoodsReceiptNotesFound}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((receipt, index) => (
                      <tr
                        key={receipt.id}
                        className="hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-4 py-3 text-muted-foreground">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3 font-semibold font-mono text-[11px]">
                          {receipt.grnNumber}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{receipt.vendor}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {receipt.vendorId}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                          {receipt.poNumber}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {receipt.receivedDate}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {receipt.receivedBy}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {receipt.receivedQuantity} / {receipt.orderedQuantity}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {receipt.remainingQuantity}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {"\u20B9"}{" "}
                          {receipt.totalAmount.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${receipt.status === "Partial" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300" : "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300"}`}
                          >
                            {receipt.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {receipt.status === "Partial" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={markCompleteMutation.isPending}
                              onClick={() =>
                                markCompleteMutation.mutate(receipt)
                              }
                              className="mr-1 h-7 px-2 text-[10px]"
                            >
                              Mark Complete
                            </Button>
                          )}
                          <button
                            onClick={() => setViewReceipt(receipt)}
                            className="text-muted-foreground hover:text-primary p-1 rounded-md"
                            title="View Goods Receipt"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handlePrintGRN(receipt)}
                            className="text-muted-foreground hover:text-primary p-1 rounded-md"
                            title={FLEX_TEXT.printGrn}
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

        {/* ── LOG GOODS RECEIPT MODAL DIALOG (EXACT SCREENSHOT SPECIFICATION) ── */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-[940px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <form onSubmit={handleCreateGRN}>
              <DialogHeader className="pb-2 border-b border-border">
                <DialogTitle className="flex items-center gap-2.5 text-xl font-bold text-foreground">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <PackageCheck className="w-5 h-5" />
                  </div>
                  {FLEX_TEXT.logGoodsReceipt}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground block">
                      {FLEX_TEXT.mapPurchaseOrderS}
                    </Label>
                    <Input
                      value={poSearch}
                      onChange={(event) => setPoSearch(event.target.value)}
                      placeholder="Search by PO number, vendor ID, or vendor name..."
                      className="h-8 text-xs bg-background"
                    />
                    <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-background p-1">
                      {filteredPurchaseOrders.length ? (
                        filteredPurchaseOrders.map((po: any) => {
                          const checked = mappedPoIds.includes(String(po.id));
                          return (
                            <label
                              key={po.id}
                              className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs hover:bg-muted/50"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  togglePurchaseOrder(String(po.id))
                                }
                                className="h-4 w-4 accent-primary"
                              />
                              <span className="font-mono font-semibold">
                                {po.poNumber}
                              </span>
                              <span className="text-muted-foreground">
                                ({po.vendorId}) - {po.vendor}
                              </span>
                            </label>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No Purchase Orders available
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      {FLEX_TEXT.grnNumber}{" "}
                      <span className="text-primary">*</span>
                    </Label>
                    <Input
                      readOnly
                      value={FLEX_TEXT.autoAssignedOnSave}
                      className="h-9 text-xs bg-muted/40 font-mono font-bold"
                    />
                  </div>
                </div>

                {mappedPoIds.length > 0 && (
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="text-[10px] font-bold tracking-wider text-muted-foreground mb-2">
                      MAPPED
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {purchaseOrders
                        .filter((po: any) =>
                          mappedPoIds.includes(String(po.id)),
                        )
                        .map((po: any) => (
                          <div
                            key={po.id}
                            className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs"
                          >
                            <span className="font-mono font-semibold">
                              {po.poNumber}
                            </span>
                            <span>{po.vendor}</span>
                            <button
                              type="button"
                              aria-label={`Remove ${po.poNumber}`}
                              onClick={() => togglePurchaseOrder(String(po.id))}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              �
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      {FLEX_TEXT.vendorName} *
                    </Label>
                    <Input
                      readOnly
                      value={vendorName}
                      className="h-9 text-xs bg-muted/30"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      {FLEX_TEXT.vendorAddress} *
                    </Label>
                    <Input
                      readOnly
                      value={vendorAddress}
                      className="h-9 text-xs bg-muted/30"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      {FLEX_TEXT.vendorPhone} *
                    </Label>
                    <Input
                      readOnly
                      value={vendorPhone}
                      className="h-9 text-xs bg-muted/30"
                    />
                  </div>
                </div>
                {/* Row 4: Received Date * | Received By * */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      {FLEX_TEXT.receivedDate2}{" "}
                      <span className="text-primary">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={receivedDate}
                      onChange={(e) => setReceivedDate(e.target.value)}
                      className="h-9 text-xs bg-background cursor-pointer"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      {FLEX_TEXT.receivedBy2}{" "}
                      <span className="text-primary">*</span>
                    </Label>
                    <Select value={receivedBy} onValueChange={setReceivedBy}>
                      <SelectTrigger className="h-9 text-xs bg-background">
                        <SelectValue placeholder={FLEX_TEXT.selectEmployee} />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2">
                          <Input
                            value={userSearch}
                            onChange={(event) =>
                              setUserSearch(event.target.value)
                            }
                            onKeyDown={(event) => event.stopPropagation()}
                            placeholder="Search employees..."
                            className="h-8 text-xs"
                          />
                        </div>
                        {filteredUsers.map((user) => (
                          <SelectItem key={user.id} value={String(user.id)}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <Label className="text-xs font-bold text-foreground">
                    Line Items - Ordered vs Received
                  </Label>
                  {lineItems.length === 0 ? (
                    <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground bg-muted/20">
                      {mappedPoIds.length
                        ? "All items on the selected Purchase Orders have already been received."
                        : "Map one or more Purchase Orders to load line items."}
                    </div>
                  ) : (
                    <div className="border border-border/80 rounded-lg overflow-x-auto bg-background">
                      <table className="w-full table-fixed text-[10px] lg:text-[11px]">
                        <colgroup>
                          <col className="w-[22%]" />
                          <col className="w-[8%]" />
                          <col className="w-[10%]" />
                          <col className="w-[8%]" />
                          <col className="w-[10%]" />
                          <col className="w-[15%]" />
                          <col className="w-[10%]" />
                          <col className="w-[7%]" />
                          <col className="w-[10%]" />
                        </colgroup>
                        <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left">Description</th>
                            <th className="px-3 py-2 text-right">
                              Ordered Qty
                            </th>
                            <th className="px-3 py-2 text-right">
                              Already Received
                            </th>
                            <th className="px-3 py-2 text-right">Remaining</th>
                            <th className="px-3 py-2 text-right">Unit Price</th>
                            <th className="px-3 py-2 text-left">Warehouse</th>
                            <th className="px-3 py-2 text-right">
                              This GRN Qty
                            </th>
                            <th className="px-3 py-2 text-right">Tax</th>
                            <th className="px-3 py-2 text-right">GRN Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {lineItems.map((line) => {
                            const remaining = Math.max(
                              0,
                              line.qty - line.alreadyReceived,
                            );
                            const taxPct =
                              line.cgstPct + line.sgstPct + line.igstPct;
                            const base = line.recvQty * line.price;
                            const lineTotal = base + (base * taxPct) / 100;
                            return (
                              <tr key={`${line.purchaseOrderId}-${line.id}`}>
                                <td className="px-3 py-2">
                                  <div className="font-medium">
                                    {line.itemMaster}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {line.poNumber} - {line.customSpec || "-"}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {line.qty}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {line.alreadyReceived}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold">
                                  {remaining}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {"\u20B9"}{" "}
                                  {line.price.toLocaleString("en-IN")}
                                </td>
                                <td className="px-3 py-2">
                                  <Select
                                    value={line.warehouse}
                                    onValueChange={(value) =>
                                      handleLineChange(
                                        line.id,
                                        "warehouse",
                                        value,
                                      )
                                    }
                                  >
                                    <SelectTrigger className="h-8 w-full min-w-0 px-2 text-[10px]">
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
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={remaining}
                                    step="any"
                                    value={line.recvQty || ""}
                                    onChange={(event) =>
                                      handleLineChange(
                                        line.id,
                                        "recvQty",
                                        Number(event.target.value),
                                      )
                                    }
                                    disabled={remaining === 0}
                                    placeholder={
                                      remaining === 0 ? "Fully received" : "0"
                                    }
                                    className="h-8 w-full min-w-16 text-right px-2"
                                  />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {taxPct}%
                                </td>
                                <td className="px-3 py-2 text-right font-semibold">
                                  {"\u20B9"}{" "}
                                  {lineTotal.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                  })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="flex justify-end rounded-md bg-muted/30 px-4 py-2 text-sm font-semibold">
                    GRN Total: {"\u20B9"}{" "}
                    {calculatedGrandTotal.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                </div>
                {/* Notes */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    {FLEX_TEXT.notes}
                  </Label>
                  <Textarea
                    placeholder={FLEX_TEXT.additionalNotes}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="text-xs bg-background"
                  />
                </div>

                {/* Supporting Document (optional) */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    {FLEX_TEXT.attachGoodsDeliverySlipPhotoOptional}
                  </Label>
                  <div
                    onClick={() =>
                      document.getElementById("grn-file-input")?.click()
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
                      id="grn-file-input"
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
              <DialogFooter className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddOpen(false)}
                >
                  {FLEX_TEXT.cancel}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={createMutation.isPending}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 gap-1.5 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />{" "}
                  {createMutation.isPending
                    ? "Saving..."
                    : FLEX_TEXT.logReceipt}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(viewReceipt)}
          onOpenChange={(open) => !open && setViewReceipt(null)}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Goods Receipt {viewReceipt?.grnNumber}</DialogTitle>
            </DialogHeader>
            {viewReceipt && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-lg border border-border p-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Vendor</div>
                    <div className="font-semibold">{viewReceipt.vendor}</div>
                    <div className="text-xs text-muted-foreground">
                      {viewReceipt.vendorId}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Purchase Order
                    </div>
                    <div className="font-mono font-semibold">
                      {viewReceipt.poNumber}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Received Date
                    </div>
                    <div className="font-semibold">
                      {viewReceipt.receivedDate}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Received By
                    </div>
                    <div className="font-semibold">
                      {viewReceipt.receivedBy}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[760px] text-xs">
                    <thead className="bg-muted/30 text-muted-foreground uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2 text-left">Item</th>
                        <th className="px-3 py-2 text-right">Ordered</th>
                        <th className="px-3 py-2 text-right">
                          Previously Received
                        </th>
                        <th className="px-3 py-2 text-right">Received</th>
                        <th className="px-3 py-2 text-right">Remaining</th>
                        <th className="px-3 py-2 text-right">Unit Price</th>
                        <th className="px-3 py-2 text-left">Warehouse</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(viewReceipt.lineItems || []).map(
                        (line: any, index: number) => (
                          <tr key={`${line.itemId || line.poLineId}-${index}`}>
                            <td className="px-3 py-2">
                              <div className="font-medium">
                                {line.description}
                              </div>
                              <div className="text-muted-foreground">
                                {line.unit || "-"}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              {line.orderedQty}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {line.alreadyReceived}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">
                              {line.receivedQty}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {Math.max(
                                0,
                                Number(line.orderedQty) -
                                  Number(line.alreadyReceived) -
                                  Number(line.receivedQty),
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {"\u20B9"}{" "}
                              {Number(line.unitPrice || 0).toLocaleString(
                                "en-IN",
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {line.warehouse || "-"}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end text-base font-bold">
                  Total: {"\u20B9"}{" "}
                  {viewReceipt.totalAmount.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                {viewReceipt.notes && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">
                      Notes
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">
                      {viewReceipt.notes}
                    </p>
                  </div>
                )}
                {viewReceipt.attachmentName && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">
                      Supporting Document
                    </div>
                    <div className="mt-1">{viewReceipt.attachmentName}</div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setViewReceipt(null)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
