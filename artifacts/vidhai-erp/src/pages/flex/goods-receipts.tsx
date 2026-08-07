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

import {
  mergeVendors,
  addStoredVendor,
  mergeGRNs,
  addStoredGRN,
} from "@/lib/flexStore";

async function fetchGoodsReceipts(): Promise<GoodsReceiptItem[]> {
  try {
    const res = await fetch(`${BASE}/api/flex/goods-receipts`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      const serverMapped = (data || []).map((g: any, i: number) => ({
        id: g.id,
        vendorId: `CON0000${(i % 3) + 5}`,
        vendor: g.vendor || "Nish",
        grnNumber:
          g.grnNumber ||
          `GRN-${Math.floor(100000 + Math.random() * 900000)} 10:00:00 am`,
        poNumber: g.poReference || "PO-26-27-0006",
        receivedDate: g.receivedDate || "2026-07-21",
        receivedBy: g.inspectedBy || "Kavin",
        receivedOrdered: "100 / 100",
        pending: "-",
        status: g.status || "Complete",
      }));
      return mergeGRNs(serverMapped);
    }
  } catch {}
  return mergeGRNs([]);
}

async function createGoodsReceipt(payload: any) {
  const res = await fetch(`${BASE}/api/flex/goods-receipts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create GRN");
  return res.json();
}

async function fetchVendorsList() {
  try {
    const res = await fetch(`${BASE}/api/flex/vendors`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      return mergeVendors(data);
    }
  } catch {}
  return mergeVendors([]);
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

  const { data: vendorsList = [] } = useQuery({
    queryKey: ["get", "/api/flex/vendors"],
    queryFn: fetchVendorsList,
  });

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState("10");

  // Form fields for Log Goods Receipt
  const [mappedPo, setMappedPo] = useState("");
  const autoGrnNumber = `GRN-${Math.floor(100000 + Math.random() * 900000)}`;
  const [vendorName, setVendorName] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("27");
  const [receivedDate, setReceivedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [receivedBy, setReceivedBy] = useState("Kavin");
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
      toast.success("Goods Receipt logged successfully");
      setIsAddOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to log GRN");
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
        itemMaster: "Trapezoidal Roofing Sheet",
        customSpec: "",
        warehouse: "Bangalore (4)",
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
          <p><strong>Vendor:</strong> ${g.vendor} (${g.vendorId})</p>
          <p><strong>PO Reference:</strong> ${g.poNumber} | <strong>Received By:</strong> ${g.receivedBy}</p>
          <p><strong>Received Date:</strong> ${g.receivedDate} | <strong>Status:</strong> ${g.status}</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleCreateGRN = (e: React.FormEvent) => {
    e.preventDefault();
    const vName = vendorName.trim() || "Nish";

    const newGRNItem: GoodsReceiptItem = {
      id: Date.now(),
      vendorId: "CON00005",
      vendor: vName,
      grnNumber: `${autoGrnNumber} ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
      poNumber: mappedPo || "PO-26-27-0006",
      receivedDate: new Date().toISOString().split("T")[0],
      receivedBy: receivedBy.trim() || "Kavin",
      receivedOrdered: "100 / 100",
      pending: "-",
      status: "Complete",
    };

    addStoredGRN(newGRNItem);
    addStoredVendor({ id: "CON00005", name: vName });

    toast.success("Goods Receipt logged successfully!");
    setIsAddOpen(false);
    resetForm();

    createMutation.mutate({
      grnNumber: autoGrnNumber,
      poReference: mappedPo || "PO-26-27-0006",
      vendorName: vName,
      itemsReceived:
        lineItems.map((l) => l.itemMaster).join(", ") || "Steel rod (600 kg)",
      inspectedByName: receivedBy.trim() || "Kavin",
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
              Goods Receipts (GRN)
            </h1>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={() => {
                refetch();
                toast.info("Refreshed Goods Receipts");
              }}
              title="Refresh Records"
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
              <Plus className="w-4 h-4" /> Log Receipt
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
              placeholder="Search goods receipts or Vendor ID (CON...)..."
              className="pl-9 bg-background border-border text-sm rounded-md h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] text-muted-foreground mb-1 font-medium">
                From Date
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
                To Date
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
              Vendor
            </div>
            <Select value={selectedVendor} onValueChange={setSelectedVendor}>
              <SelectTrigger className="bg-background text-xs h-9 rounded-md">
                <SelectValue placeholder="All vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All vendors</SelectItem>
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
                    <th className="px-4 py-3 font-semibold">VENDOR ID</th>
                    <th className="px-4 py-3 font-semibold">VENDOR</th>
                    <th className="px-4 py-3 font-semibold">GRN #</th>
                    <th className="px-4 py-3 font-semibold">PO #</th>
                    <th className="px-4 py-3 font-semibold">RECEIVED DATE</th>
                    <th className="px-4 py-3 font-semibold">RECEIVED BY</th>
                    <th className="px-4 py-3 font-semibold">
                      RECEIVED / ORDERED
                    </th>
                    <th className="px-4 py-3 font-semibold">PENDING</th>
                    <th className="px-4 py-3 font-semibold">STATUS</th>
                    <th className="px-4 py-3 font-semibold text-right">
                      ACTION
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
                        No goods receipt notes found.
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
                            title="Print GRN"
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
                Showing{" "}
                <span className="font-semibold text-foreground">
                  {filtered.length > 0 ? 1 : 0}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-foreground">
                  {filtered.length}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-foreground">
                  {filtered.length}
                </span>{" "}
                records
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
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
                  Log Goods Receipt
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-3 text-xs">
                {/* Row 1: Map Purchase Order(s) | GRN Number * */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                      Map Purchase Order(s)
                    </Label>
                    <Select value={mappedPo} onValueChange={setMappedPo}>
                      <SelectTrigger className="h-9 text-xs bg-background">
                        <SelectValue placeholder="Type to filter and select purchase order(s)..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PO-26-27-0006">
                          PO-26-27-0006 (Steel Rod)
                        </SelectItem>
                        <SelectItem value="PO-26-27-0005">
                          PO-26-27-0005 (Cement Bags)
                        </SelectItem>
                        <SelectItem value="PO-26-27-0004">
                          PO-26-27-0004 (Structural Beams)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      GRN Number <span className="text-primary">*</span>
                    </Label>
                    <Input
                      readOnly
                      value={autoGrnNumber}
                      className="h-9 text-xs bg-muted/40 font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Row 2: Vendor Name * | Vendor Address * | Vendor Phone * */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      Vendor Name <span className="text-primary">*</span>
                    </Label>
                    <Select value={vendorName} onValueChange={setVendorName}>
                      <SelectTrigger className="h-9 text-xs bg-background">
                        <SelectValue placeholder="Select or type vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Nish">CON00005 - Nish</SelectItem>
                        <SelectItem value="Jagadeep">
                          CON00006 - Jagadeep
                        </SelectItem>
                        <SelectItem value="Elakiya Shri">
                          CON00007 - Elakiya Shri
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      Vendor Address <span className="text-primary">*</span>
                    </Label>
                    <Input
                      placeholder="Vendor address"
                      value={vendorAddress}
                      onChange={(e) => setVendorAddress(e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      Vendor Phone <span className="text-primary">*</span>
                    </Label>
                    <Input
                      placeholder="Vendor phone"
                      value={vendorPhone}
                      onChange={(e) => setVendorPhone(e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                </div>

                {/* Row 3: Place of Supply (State Code) */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Place of Supply (State Code)
                  </Label>
                  <Input
                    value={placeOfSupply}
                    onChange={(e) => setPlaceOfSupply(e.target.value)}
                    placeholder="27"
                    className="h-9 text-xs bg-background font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Add line items manually or map purchase order(s) above to
                    auto-fill vendor and items.
                  </p>
                </div>

                {/* Row 4: Received Date * | Received By * */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1 block">
                      Received Date <span className="text-primary">*</span>
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
                      Received By <span className="text-primary">*</span>
                    </Label>
                    <Select value={receivedBy} onValueChange={setReceivedBy}>
                      <SelectTrigger className="h-9 text-xs bg-background">
                        <SelectValue placeholder="Select employee..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Kavin">Kavin</SelectItem>
                        <SelectItem value="Nishanth">Nishanth</SelectItem>
                        <SelectItem value="Aakash T">Aakash T</SelectItem>
                        <SelectItem value="SuperAdmin">SuperAdmin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Line Items Section */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-foreground">
                      Line Items
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs font-semibold text-foreground border-border hover:bg-muted"
                      onClick={handleAddBlankRow}
                    >
                      + Add blank row
                    </Button>
                  </div>

                  {lineItems.length === 0 ? (
                    <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground bg-muted/20">
                      No line items yet. Add items manually or map purchase
                      order(s).
                    </div>
                  ) : (
                    <div className="border border-border/80 rounded-lg p-2.5 bg-background space-y-2 shadow-2xs overflow-x-auto">
                      <div className="min-w-[800px]">
                        <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pb-1">
                          <div className="col-span-3">
                            ITEM / PRODUCT / ASSET
                          </div>
                          <div className="col-span-2">WAREHOUSE</div>
                          <div className="col-span-1 text-center">QTY</div>
                          <div className="col-span-1 text-center">PRICE</div>
                          <div className="col-span-1 text-center">RECV QTY</div>
                          <div className="col-span-2 text-center">TAX (%)</div>
                          <div className="col-span-2 text-right">TOTAL</div>
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
                                  <SelectValue placeholder="Select master item..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Trapezoidal Roofing Sheet">
                                    Trapezoidal Roofing Sheet
                                  </SelectItem>
                                  <SelectItem value="Steel Rod 12mm">
                                    Steel Rod 12mm
                                  </SelectItem>
                                  <SelectItem value="Cement Bags">
                                    Cement Bags
                                  </SelectItem>
                                  <SelectItem value="Structural Beams">
                                    Structural Beams
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                placeholder="Custom specification"
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
                                  <SelectValue placeholder="Bangalore (4)" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Bangalore (4)">
                                    Bangalore (4)
                                  </SelectItem>
                                  <SelectItem value="Chennai (2)">
                                    Chennai (2)
                                  </SelectItem>
                                  <SelectItem value="Coimbatore (1)">
                                    Coimbatore (1)
                                  </SelectItem>
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
                          Total Amount: ₹{" "}
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
                    Notes
                  </Label>
                  <Textarea
                    placeholder="Additional notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="text-xs bg-background"
                  />
                </div>

                {/* Supporting Document (optional) */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Attach Goods Delivery Slip / Photo (optional)
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
                          Click to attach file
                        </Label>
                        <span className="text-[10px] text-slate-400">
                          PDF, JPG, PNG, WebP - Max 250 KB
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
                        Choose File
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
                          toast.success(`Attached ${file.name}`);
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
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 gap-1.5 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Log Receipt
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
