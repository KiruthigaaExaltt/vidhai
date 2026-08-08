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
  itemMaster: string;
  customSpec: string;
  warehouse: string;
  qty: number;
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
}

async function fetchGoodsReceipts(): Promise<GoodsReceiptItem[]> {
  try {
    const res = await fetch(`${BASE}/api/flex/goods-receipts`, {
      credentials: "include",
    });
    if (res.ok) {
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
      }));
    }
  } catch {}
  return [];
}

async function createGoodsReceipt(payload: any) {
  const res = await fetch(`${BASE}/api/flex/goods-receipts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(FLEX_TEXT.failedToCreateGrn);
  return res.json();
}

export default function GoodsReceipts() {
  const queryClient = useQueryClient();
  const {
    data: grns = [],
    refetch,
    isFetching,
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
  const [rowsPerPage, setRowsPerPage] = useState("10");

  // Form fields for Log Goods Receipt
  const [mappedPo, setMappedPo] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("27");
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
      (acc, l) => acc + (l.recvQty * l.price * (l.cgstPct + l.sgstPct)) / 100,
      0,
    );
  }, [lineItems]);

  const calculatedGrandTotal = useMemo(() => {
    return calculatedSubtotal + calculatedTax;
  }, [calculatedSubtotal, calculatedTax]);

  const createMutation = useMutation({
    mutationFn: createGoodsReceipt,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/goods-receipts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      toast.success(FLEX_TEXT.goodsReceiptLoggedSuccessfully);
      setIsAddOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToLogGrn);
    },
  });

  const resetForm = () => {
    setLineItems([]);
    setMappedPo("");
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
        itemMaster: "",
        customSpec: "",
        warehouse: "",
        qty: 1,
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

  const handleCreateGRN = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedPo = purchaseOrders.find(
      (po: any) => po.poNumber === mappedPo,
    );
    createMutation.mutate({
      poReference: mappedPo,
      vendorName: selectedPo?.vendor || vendorName,
      vendorId: selectedPo?.vendorId || "",
      itemsReceived: lineItems
        .map((line) => line.itemMaster)
        .filter(Boolean)
        .join(", "),
      inspectedByUserId: Number(receivedBy),
      status: "Complete",
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
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.vendorId}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.vendor2}
                    </th>
                    <th className="px-4 py-3 font-semibold">{FLEX_TEXT.grn}</th>
                    <th className="px-4 py-3 font-semibold">{FLEX_TEXT.po}</th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.receivedDate}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.receivedBy}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.receivedOrdered}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.pending}
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
                        colSpan={10}
                        className="px-4 py-8 text-center text-muted-foreground text-sm"
                      >
                        {FLEX_TEXT.noGoodsReceiptNotesFound}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((g) => (
                      <tr
                        key={g.id}
                        className="hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                          {g.vendorId}
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {g.vendor}
                        </td>
                        <td className="px-4 py-3 font-semibold text-muted-foreground font-mono text-[10px]">
                          {g.grnNumber}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                          {g.poNumber}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {g.receivedDate}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {g.receivedBy}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {g.receivedOrdered}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {g.pending}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300">
                            {g.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handlePrintGRN(g)}
                            className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
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
          <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-6">
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
                {/* Row 1: Map Purchase Order(s) | GRN Number * */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
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
                          setVendorName(po.vendor || "");
                          const vendor = vendorsList.find(
                            (option) =>
                              option.id === po.vendorId ||
                              option.name === po.vendor,
                          );
                          setVendorAddress(vendor?.address || "");
                          setVendorPhone(vendor?.phone || "");
                          setLineItems([
                            {
                              id: String(Date.now()),
                              itemMaster: po.items || "",
                              customSpec: "",
                              warehouse: po.warehouse || "",
                              qty: 1,
                              price: Number(po.subtotal || 0),
                              recvQty: 1,
                              cgstPct: 0,
                              sgstPct: 0,
                              igstPct: 0,
                              total: Number(po.grandTotal || 0),
                            },
                          ]);
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 text-xs bg-background">
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

                {/* Row 2: Vendor Name * | Vendor Address * | Vendor Phone * */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      {FLEX_TEXT.vendorName}{" "}
                      <span className="text-primary">*</span>
                    </Label>
                    <Select value={vendorName} onValueChange={setVendorName}>
                      <SelectTrigger className="h-9 text-xs bg-background">
                        <SelectValue
                          placeholder={FLEX_TEXT.selectOrTypeVendor}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {vendorsList.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.name}>
                            {vendor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      {FLEX_TEXT.vendorAddress}{" "}
                      <span className="text-primary">*</span>
                    </Label>
                    <Input
                      placeholder={FLEX_TEXT.vendorAddress2}
                      value={vendorAddress}
                      onChange={(e) => setVendorAddress(e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      {FLEX_TEXT.vendorPhone}{" "}
                      <span className="text-primary">*</span>
                    </Label>
                    <Input
                      placeholder={FLEX_TEXT.vendorPhone2}
                      value={vendorPhone}
                      onChange={(e) => setVendorPhone(e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                </div>

                {/* Row 3: Place of Supply (State Code) */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    {FLEX_TEXT.placeOfSupplyStateCode}
                  </Label>
                  <Input
                    value={placeOfSupply}
                    onChange={(e) => setPlaceOfSupply(e.target.value)}
                    placeholder="27"
                    className="h-9 text-xs bg-background font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {
                      FLEX_TEXT.addLineItemsManuallyOrMapPurchaseOrderSAboveToAutoFillVendorAndItems
                    }
                  </p>
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
                        {userOptions.map((user) => (
                          <SelectItem key={user.id} value={String(user.id)}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Line Items Section */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-foreground">
                      {FLEX_TEXT.lineItems}
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs font-semibold text-foreground border-border hover:bg-muted"
                      onClick={handleAddBlankRow}
                    >
                      {FLEX_TEXT.addBlankRow}
                    </Button>
                  </div>

                  {lineItems.length === 0 ? (
                    <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground bg-muted/20">
                      {
                        FLEX_TEXT.noLineItemsYetAddItemsManuallyOrMapPurchaseOrderS
                      }
                    </div>
                  ) : (
                    <div className="border border-border/80 rounded-lg p-2.5 bg-background space-y-2 shadow-2xs overflow-x-auto">
                      <div className="min-w-[800px]">
                        <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pb-1">
                          <div className="col-span-3">
                            {FLEX_TEXT.itemProductAsset}
                          </div>
                          <div className="col-span-2">
                            {FLEX_TEXT.warehouse}
                          </div>
                          <div className="col-span-1 text-center">
                            {FLEX_TEXT.qty}
                          </div>
                          <div className="col-span-1 text-center">
                            {FLEX_TEXT.price}
                          </div>
                          <div className="col-span-1 text-center">
                            {FLEX_TEXT.recvQty}
                          </div>
                          <div className="col-span-2 text-center">
                            {FLEX_TEXT.tax}
                          </div>
                          <div className="col-span-2 text-right">
                            {FLEX_TEXT.total}
                          </div>
                        </div>

                        {lineItems.map((line) => (
                          <div
                            key={line.id}
                            className="grid grid-cols-12 gap-2 items-start py-1"
                          >
                            {/* Item / Product / Asset + Custom Specification */}
                            <div className="col-span-3 space-y-1">
                              <Select
                                value={line.itemMaster}
                                onValueChange={(val) =>
                                  handleLineChange(line.id, "itemMaster", val)
                                }
                              >
                                <SelectTrigger className="h-8 text-xs bg-background">
                                  <SelectValue
                                    placeholder={FLEX_TEXT.selectMasterItem}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {itemOptions.map((item) => (
                                    <SelectItem key={item.id} value={item.name}>
                                      {item.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                placeholder={FLEX_TEXT.customSpecification}
                                value={line.customSpec}
                                onChange={(e) =>
                                  handleLineChange(
                                    line.id,
                                    "customSpec",
                                    e.target.value,
                                  )
                                }
                                className="h-7 text-[11px] bg-background"
                              />
                            </div>

                            {/* Warehouse */}
                            <div className="col-span-2">
                              <Select
                                value={line.warehouse}
                                onValueChange={(val) =>
                                  handleLineChange(line.id, "warehouse", val)
                                }
                              >
                                <SelectTrigger className="h-8 text-xs bg-background">
                                  <SelectValue
                                    placeholder={FLEX_TEXT.bangalore4}
                                  />
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
                            </div>

                            {/* Qty */}
                            <div className="col-span-1">
                              <Input
                                type="number"
                                value={line.qty}
                                onChange={(e) =>
                                  handleLineChange(
                                    line.id,
                                    "qty",
                                    parseFloat(e.target.value) || 1,
                                  )
                                }
                                className="h-8 text-xs bg-background text-center px-1"
                              />
                            </div>

                            {/* Price */}
                            <div className="col-span-1">
                              <Input
                                type="number"
                                value={line.price}
                                onChange={(e) =>
                                  handleLineChange(
                                    line.id,
                                    "price",
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="h-8 text-xs bg-background text-center px-1"
                              />
                            </div>

                            {/* Recv Qty */}
                            <div className="col-span-1">
                              <Input
                                type="number"
                                value={line.recvQty}
                                onChange={(e) =>
                                  handleLineChange(
                                    line.id,
                                    "recvQty",
                                    parseFloat(e.target.value) || 1,
                                  )
                                }
                                className="h-8 text-xs bg-background text-center px-1 font-bold"
                              />
                            </div>

                            {/* Tax (%) - 3 dropdown selectors for CGST/SGST/IGST */}
                            <div className="col-span-2 grid grid-cols-3 gap-1">
                              <Select
                                value={`${line.cgstPct}%`}
                                onValueChange={(val) =>
                                  handleLineChange(
                                    line.id,
                                    "cgstPct",
                                    parseFloat(val) || 0,
                                  )
                                }
                              >
                                <SelectTrigger className="h-8 text-[10px] bg-background px-1">
                                  <SelectValue placeholder="9%" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0%">0%</SelectItem>
                                  <SelectItem value="9%">9%</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select
                                value={`${line.sgstPct}%`}
                                onValueChange={(val) =>
                                  handleLineChange(
                                    line.id,
                                    "sgstPct",
                                    parseFloat(val) || 0,
                                  )
                                }
                              >
                                <SelectTrigger className="h-8 text-[10px] bg-background px-1">
                                  <SelectValue placeholder="9%" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0%">0%</SelectItem>
                                  <SelectItem value="9%">9%</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select
                                value={`${line.igstPct}%`}
                                onValueChange={(val) =>
                                  handleLineChange(
                                    line.id,
                                    "igstPct",
                                    parseFloat(val) || 0,
                                  )
                                }
                              >
                                <SelectTrigger className="h-8 text-[10px] bg-background px-1">
                                  <SelectValue placeholder="18%" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0%">0%</SelectItem>
                                  <SelectItem value="18%">18%</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Total */}
                            <div className="col-span-2 flex items-center justify-end gap-1.5 text-right font-bold text-foreground font-mono text-xs pt-1">
                              ₹ {line.total.toLocaleString("en-IN")}
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(line.id)}
                                className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Right-aligned Total Amount Box */}
                      <div className="flex justify-end pt-2">
                        <div className="bg-muted/40 px-4 py-2 rounded-lg border border-border/80 text-xs font-semibold text-foreground">
                          {FLEX_TEXT.totalAmount}{" "}
                          {calculatedSubtotal.toLocaleString("en-IN")} + ₹{" "}
                          {calculatedTax.toLocaleString("en-IN")} ={" "}
                          <span className="text-primary font-bold font-mono">
                            ₹ {calculatedGrandTotal.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
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
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 gap-1.5 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" /> {FLEX_TEXT.logReceipt}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
