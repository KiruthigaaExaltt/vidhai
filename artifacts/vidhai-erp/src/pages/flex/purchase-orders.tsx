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
  Pencil,
  Printer,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Download,
  Copy,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface POLineItem {
  id: string;
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  cgstPct: number;
  sgstPct: number;
  igstPct: number;
  total: number;
}

export interface PurchaseOrderItem {
  id: number;
  vendorId: string;
  vendor: string;
  poNumber: string;
  prReference: string;
  contactPerson?: string;
  vendorGst?: string;
  vendorAddress?: string;
  vendorPhone?: string;
  placeOfSupply?: string;
  poDate: string;
  deliveryDate: string;
  warehouse: string;
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  grandTotal: number;
  termsConditions?: string;
  items: string;
  status: string;
  createdBy?: string;
}

import {
  mergeVendors,
  addStoredVendor,
  mergePOs,
  addStoredPO,
} from "@/lib/flexStore";

async function fetchPurchaseOrders(): Promise<PurchaseOrderItem[]> {
  try {
    const res = await fetch(`${BASE}/api/flex/purchase-orders`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      return mergePOs(data);
    }
  } catch {}
  return mergePOs([]);
}

async function createPurchaseOrder(payload: any) {
  const res = await fetch(`${BASE}/api/flex/purchase-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create PO");
  return res.json();
}

async function updatePurchaseOrder({ id, ...payload }: any) {
  const res = await fetch(`${BASE}/api/flex/purchase-orders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update PO");
  return res.json();
}

async function deletePurchaseOrder(id: number) {
  const res = await fetch(`${BASE}/api/flex/purchase-orders/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete PO");
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

export default function PurchaseOrdersPage() {
  const queryClient = useQueryClient();
  const {
    data: pos = [],
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["get", "/api/flex/purchase-orders"],
    queryFn: fetchPurchaseOrders,
  });

  const { data: vendorsList = [] } = useQuery({
    queryKey: ["get", "/api/flex/vendors"],
    queryFn: fetchVendorsList,
  });

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [rowsPerPage, setRowsPerPage] = useState("10");

  // Modal Dialog states
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrderItem | null>(null);

  // Purchase Order Builder Form States
  const [prReference, setPrReference] = useState("PR-26-27-0010");
  const [vendorName, setVendorName] = useState("CON00006 - Jagadeep");
  const [contactPerson, setContactPerson] = useState("");
  const [vendorGst, setVendorGst] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("27");
  const [poDate, setPoDate] = useState(new Date().toISOString().split("T")[0]);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [destinationWarehouse, setDestinationWarehouse] = useState(
    "Bangalore Central Warehouse",
  );
  const [termsConditions, setTermsConditions] = useState("");

  // Line Items inside PO Builder
  const [lineItems, setLineItems] = useState<POLineItem[]>([
    {
      id: "1",
      description: "Trapezoidal Roofing Sheet",
      hsn: "7210",
      qty: 1,
      rate: 0,
      cgstPct: 9,
      sgstPct: 9,
      igstPct: 18,
      total: 0,
    },
  ]);

  // Dynamic Financial Calculations
  const calculatedSubtotal = useMemo(() => {
    return lineItems.reduce((acc, item) => acc + item.qty * item.rate, 0);
  }, [lineItems]);

  const calculatedCgst = useMemo(() => {
    return lineItems.reduce(
      (acc, item) => acc + (item.qty * item.rate * item.cgstPct) / 100,
      0,
    );
  }, [lineItems]);

  const calculatedSgst = useMemo(() => {
    return lineItems.reduce(
      (acc, item) => acc + (item.qty * item.rate * item.sgstPct) / 100,
      0,
    );
  }, [lineItems]);

  const calculatedGrandTotal = useMemo(() => {
    return calculatedSubtotal + calculatedCgst + calculatedSgst;
  }, [calculatedSubtotal, calculatedCgst, calculatedSgst]);

  const createMutation = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-orders"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      const isDraft = variables.status === "Draft";
      toast.success(
        isDraft
          ? "Purchase Order saved as Draft"
          : "Purchase Order saved and sent successfully!",
      );
      setIsBuilderOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create PO");
    },
  });

  const updateMutation = useMutation({
    mutationFn: updatePurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-orders"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      toast.success("Purchase Order updated successfully");
      setSelectedPo(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update PO");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-orders"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      toast.success("Purchase Order deleted");
      setSelectedPo(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete PO");
    },
  });

  const resetForm = () => {
    setLineItems([
      {
        id: "1",
        description: "",
        hsn: "",
        qty: 1,
        rate: 0,
        cgstPct: 9,
        sgstPct: 9,
        igstPct: 18,
        total: 0,
      },
    ]);
    setContactPerson("");
    setVendorGst("");
    setVendorAddress("");
    setVendorPhone("");
    setDeliveryDate("");
    setTermsConditions("");
  };

  const handleAddLine = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        description: "",
        hsn: "",
        qty: 1,
        rate: 0,
        cgstPct: 9,
        sgstPct: 9,
        igstPct: 18,
        total: 0,
      },
    ]);
  };

  const handleRemoveLine = (id: string) => {
    if (lineItems.length <= 1) {
      toast.error("At least one line item is required.");
      return;
    }
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleLineChange = (
    id: string,
    field: keyof POLineItem,
    value: any,
  ) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        const sub = updated.qty * updated.rate;
        const taxVal = (sub * (updated.cgstPct + updated.sgstPct)) / 100;
        updated.total = sub + taxVal;
        return updated;
      }),
    );
  };

  const handleDuplicatePO = (po: PurchaseOrderItem) => {
    setVendorName(`${po.vendorId} - ${po.vendor}`);
    setContactPerson(po.contactPerson || "");
    setVendorGst(po.vendorGst || "");
    setVendorAddress(po.vendorAddress || "");
    setVendorPhone(po.vendorPhone || "");
    setDestinationWarehouse(po.warehouse || "Bangalore Central Warehouse");
    setTermsConditions(po.termsConditions || "");
    setIsBuilderOpen(true);
    toast.info(`Duplicating details from ${po.poNumber}`);
  };

  const handlePrintPO = (po: PurchaseOrderItem) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Print ${po.poNumber}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 30px; color: #111; }
            h2 { color: #0d9488; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h2>VIDHAI ERP - PURCHASE ORDER ${po.poNumber}</h2>
          <p><strong>Vendor:</strong> ${po.vendor} (${po.vendorId})</p>
          <p><strong>Warehouse:</strong> ${po.warehouse} | <strong>Place of Supply:</strong> ${po.placeOfSupply || "27"}</p>
          <p><strong>Status:</strong> ${po.status}</p>
          <table>
            <thead><tr><th>Items Description</th><th>Subtotal</th><th>Grand Total</th></tr></thead>
            <tbody><tr><td>${po.items}</td><td>₹ ${po.subtotal.toLocaleString("en-IN")}</td><td>₹ ${po.grandTotal.toLocaleString("en-IN")}</td></tr></tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const filtered = useMemo(() => {
    return pos.filter((po) => {
      const matchesVendor =
        selectedVendor === "All" || po.vendor === selectedVendor;
      const matchesSearch =
        !search.trim() ||
        po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        po.vendor.toLowerCase().includes(search.toLowerCase()) ||
        po.vendorId.toLowerCase().includes(search.toLowerCase());

      const poTime = new Date(po.poDate).getTime();
      const matchesFromDate =
        !fromDate || isNaN(poTime) || poTime >= new Date(fromDate).getTime();
      const matchesToDate =
        !toDate || isNaN(poTime) || poTime <= new Date(toDate).getTime();

      return matchesVendor && matchesSearch && matchesFromDate && matchesToDate;
    });
  }, [pos, search, selectedVendor, fromDate, toDate]);

  const handleSubmitPO = (status: "Issued" | "Draft") => {
    const vParts = vendorName.split(" - ");
    const vId = vParts[0] || "CON00006";
    const vName = vParts[1] || vParts[0] || "Jagadeep";
    const itemSummary =
      lineItems
        .map((l) => l.description)
        .filter(Boolean)
        .join(", ") || "Order Line Items";

    const newPOItem = {
      id: Date.now(),
      vendorId: vId,
      vendor: vName,
      poNumber: `PO-26-27-000${pos.length + 1} ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
      prReference: prReference || "PR-26-27-0010",
      contactPerson,
      vendorGst,
      vendorAddress,
      vendorPhone,
      placeOfSupply,
      poDate: poDate || new Date().toISOString().split("T")[0],
      deliveryDate: deliveryDate || new Date().toISOString().split("T")[0],
      warehouse: destinationWarehouse,
      subtotal: calculatedSubtotal,
      cgstAmount: calculatedCgst,
      sgstAmount: calculatedSgst,
      grandTotal: calculatedGrandTotal,
      termsConditions,
      items: itemSummary,
      status,
    };

    // Persist locally & optimistically update table
    addStoredPO(newPOItem);
    addStoredVendor({
      id: vId,
      name: vName,
      phone: vendorPhone,
      address: vendorAddress,
    });
    queryClient.setQueryData(
      ["get", "/api/flex/purchase-orders"],
      (old: any) => [newPOItem, ...(Array.isArray(old) ? old : [])],
    );

    // Close modal & show toast immediately
    const isDraft = status === "Draft";
    toast.success(
      isDraft
        ? "Purchase Order saved as Draft"
        : "Purchase Order saved and sent successfully!",
    );
    setIsBuilderOpen(false);
    resetForm();

    // Fire API call in background (non-blocking)
    createPurchaseOrder({
      vendorId: vId,
      vendorName: vName,
      contactPerson,
      vendorGst,
      vendorAddress,
      vendorPhone,
      placeOfSupply,
      poDate,
      deliveryDate,
      warehouse: destinationWarehouse,
      items: itemSummary,
      subtotal: calculatedSubtotal,
      cgstAmount: calculatedCgst,
      sgstAmount: calculatedSgst,
      grandTotal: calculatedGrandTotal,
      termsConditions,
      status,
    }).catch(() => {});
  };

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto w-full space-y-5">
        <FlexTabs />

        {/* Title Header Row with Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Purchase Orders
            </h1>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={() => {
                refetch();
                toast.info("Refreshed Purchase Orders");
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
              onClick={() => setIsBuilderOpen(true)}
            >
              <Plus className="w-4 h-4" /> Create PO
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
              placeholder="Search POs or Vendor ID (CON...)..."
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
                <SelectItem value="Nish">Nish</SelectItem>
                <SelectItem value="Jagadeep">Jagadeep</SelectItem>
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
                    <th className="px-4 py-3 font-semibold">PO #</th>
                    <th className="px-4 py-3 font-semibold">PO DATE</th>
                    <th className="px-4 py-3 font-semibold">DELIVERY DATE</th>
                    <th className="px-4 py-3 font-semibold">SUBTOTAL</th>
                    <th className="px-4 py-3 font-semibold">GRAND TOTAL</th>
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
                        colSpan={9}
                        className="px-4 py-8 text-center text-muted-foreground text-sm"
                      >
                        No purchase orders found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((po) => (
                      <tr
                        key={po.id}
                        className="hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                          {po.vendorId}
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {po.vendor}
                        </td>
                        <td className="px-4 py-3 font-semibold text-muted-foreground font-mono text-[10px]">
                          {po.poNumber}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {po.poDate}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {po.deliveryDate || "-"}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          ₹ {po.subtotal.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 font-bold text-foreground">
                          ₹ {po.grandTotal.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                              po.status === "Completed" ||
                              po.status === "Approved"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : po.status === "Product Dispatched" ||
                                    po.status === "Issued"
                                  ? "bg-purple-50 text-purple-600 border-purple-200"
                                  : "bg-muted/70 text-muted-foreground border-border"
                            }`}
                          >
                            {po.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <button
                            onClick={() => handleDuplicatePO(po)}
                            className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
                            title="Duplicate PO"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handlePrintPO(po)}
                            className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
                            title="Print PO"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setSelectedPo(po)}
                            className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
                            title="View / Edit PO"
                          >
                            <Pencil className="w-3.5 h-3.5" />
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

        {/* ── PURCHASE ORDER BUILDER MODAL DIALOG (EXACT SCREENSHOT SPECIFICATION) ── */}
        <Dialog open={isBuilderOpen} onOpenChange={setIsBuilderOpen}>
          <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-6">
            <DialogHeader className="pb-2 border-b border-border">
              <DialogTitle className="flex items-center gap-2.5 text-xl font-bold text-foreground">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                Purchase Order Builder
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              {/* Row 1: PO Number | Vendor Name * | Contact Person */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    PO Number
                  </Label>
                  <Input
                    readOnly
                    value="Auto-assigned on save"
                    className="h-9 text-xs bg-muted/40 font-mono text-muted-foreground"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-foreground mb-1 block">
                    Vendor Name <span className="text-primary">*</span>
                  </Label>
                  <Select value={vendorName} onValueChange={setVendorName}>
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder="Select or type vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendorsList.map((v: any) => (
                        <SelectItem key={v.id} value={`${v.id} - ${v.name}`}>
                          {v.id} - {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Contact Person
                  </Label>
                  <Input
                    placeholder="Vendor contact person"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="h-9 text-xs bg-background"
                  />
                </div>
              </div>

              {/* Row 2: Vendor GST | Vendor Address * | Vendor Phone * */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Vendor GST
                  </Label>
                  <Input
                    placeholder="GST number"
                    value={vendorGst}
                    onChange={(e) => setVendorGst(e.target.value)}
                    className="h-9 text-xs bg-background font-mono"
                  />
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

              {/* Row 3: Place of Supply (State Code) * | PO Date * | Delivery Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-foreground mb-1 block">
                    Place of Supply (State Code){" "}
                    <span className="text-primary">*</span>
                  </Label>
                  <Input
                    value={placeOfSupply}
                    onChange={(e) => setPlaceOfSupply(e.target.value)}
                    placeholder="27"
                    className="h-9 text-xs bg-background font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-foreground mb-1 block">
                    PO Date <span className="text-primary">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={poDate}
                    onChange={(e) => setPoDate(e.target.value)}
                    className="h-9 text-xs bg-background cursor-pointer"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Delivery Date
                  </Label>
                  <Input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="h-9 text-xs bg-background cursor-pointer"
                  />
                </div>
              </div>

              {/* Row 4: Destination Warehouse */}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                  Destination Warehouse
                </Label>
                <Select
                  value={destinationWarehouse}
                  onValueChange={setDestinationWarehouse}
                >
                  <SelectTrigger className="h-9 text-xs bg-background">
                    <SelectValue placeholder="Select warehouse for stock..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bangalore Central Warehouse">
                      Bangalore Central Warehouse
                    </SelectItem>
                    <SelectItem value="Chennai Hub">Chennai Hub</SelectItem>
                    <SelectItem value="Coimbatore Plant">
                      Coimbatore Plant
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Row 5: Line Items * Table */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground">
                    Line Items <span className="text-primary">*</span>
                  </Label>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    + Add Line
                  </button>
                </div>

                <div className="border border-border/80 rounded-lg p-2.5 bg-background space-y-2 shadow-2xs">
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    <div className="col-span-4">DESCRIPTION</div>
                    <div className="col-span-1">HSN</div>
                    <div className="col-span-1 text-center">QTY</div>
                    <div className="col-span-1 text-center">RATE</div>
                    <div className="col-span-1 text-center">CGST%</div>
                    <div className="col-span-1 text-center">SGST%</div>
                    <div className="col-span-1 text-center">IGST%</div>
                    <div className="col-span-2 text-right">TOTAL</div>
                  </div>

                  {lineItems.map((line) => (
                    <div
                      key={line.id}
                      className="grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-4">
                        <Input
                          placeholder="Select or type item/service"
                          value={line.description}
                          onChange={(e) =>
                            handleLineChange(
                              line.id,
                              "description",
                              e.target.value,
                            )
                          }
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                      <div className="col-span-1">
                        <Input
                          placeholder="HSN"
                          value={line.hsn}
                          onChange={(e) =>
                            handleLineChange(line.id, "hsn", e.target.value)
                          }
                          className="h-8 text-xs bg-background font-mono px-1"
                        />
                      </div>
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
                      <div className="col-span-1">
                        <Input
                          type="number"
                          value={line.rate}
                          onChange={(e) =>
                            handleLineChange(
                              line.id,
                              "rate",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="h-8 text-xs bg-background text-center px-1"
                        />
                      </div>
                      <div className="col-span-1">
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
                          <SelectTrigger className="h-8 text-[11px] bg-background px-1">
                            <SelectValue placeholder="9%" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0%">0%</SelectItem>
                            <SelectItem value="2.5%">2.5%</SelectItem>
                            <SelectItem value="6%">6%</SelectItem>
                            <SelectItem value="9%">9%</SelectItem>
                            <SelectItem value="14%">14%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1">
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
                          <SelectTrigger className="h-8 text-[11px] bg-background px-1">
                            <SelectValue placeholder="9%" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0%">0%</SelectItem>
                            <SelectItem value="2.5%">2.5%</SelectItem>
                            <SelectItem value="6%">6%</SelectItem>
                            <SelectItem value="9%">9%</SelectItem>
                            <SelectItem value="14%">14%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1">
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
                          <SelectTrigger className="h-8 text-[11px] bg-background px-1">
                            <SelectValue placeholder="18%" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0%">0%</SelectItem>
                            <SelectItem value="5%">5%</SelectItem>
                            <SelectItem value="12%">12%</SelectItem>
                            <SelectItem value="18%">18%</SelectItem>
                            <SelectItem value="28%">28%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1.5 text-right font-bold text-foreground font-mono text-xs">
                        ₹ {line.total.toLocaleString("en-IN")}
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.id)}
                          className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right-aligned Financial Breakdown */}
                <div className="flex justify-end pt-1">
                  <div className="w-64 bg-muted/40 p-3 rounded-lg border border-border/80 space-y-1.5 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-semibold text-foreground">
                        ₹ {calculatedSubtotal.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>CGST</span>
                      <span className="font-semibold text-foreground">
                        ₹ {calculatedCgst.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>SGST</span>
                      <span className="font-semibold text-foreground">
                        ₹ {calculatedSgst.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-foreground pt-1.5 border-t border-border">
                      <span>Grand Total</span>
                      <span className="text-primary font-mono">
                        ₹ {calculatedGrandTotal.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 6: Terms & Conditions */}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                  Terms & Conditions
                </Label>
                <Textarea
                  placeholder="Payment terms, delivery conditions..."
                  value={termsConditions}
                  onChange={(e) => setTermsConditions(e.target.value)}
                  rows={2}
                  className="text-xs bg-background"
                />
              </div>
            </div>

            {/* Footer Actions */}
            <DialogFooter className="pt-3 border-t border-border flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsBuilderOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-border text-foreground hover:bg-muted"
                onClick={() => handleSubmitPO("Draft")}
              >
                Save Draft
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 gap-1.5 shadow-2xs"
                onClick={() => handleSubmitPO("Issued")}
              >
                <Send className="w-3.5 h-3.5" /> Save & Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── VIEW / PROCESS / APPROVE PO MODAL DIALOG ────────────────────────── */}
        <Dialog open={!!selectedPo} onOpenChange={() => setSelectedPo(null)}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-6">
            {selectedPo && (
              <div className="space-y-4">
                <DialogHeader className="pb-2 border-b border-border">
                  <DialogTitle className="flex items-center justify-between">
                    <span className="text-lg font-bold text-foreground">
                      {selectedPo.poNumber} Details
                    </span>
                    <span className="text-xs font-mono bg-muted/60 px-2 py-0.5 rounded text-muted-foreground">
                      {selectedPo.vendorId}
                    </span>
                  </DialogTitle>
                </DialogHeader>

                {/* PO Details Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs bg-muted/40 p-3.5 rounded-lg border border-border/80">
                  <div>
                    <span className="text-muted-foreground">Vendor:</span>
                    <p className="font-semibold text-foreground text-sm">
                      {selectedPo.vendor}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Contact Person:
                    </span>
                    <p className="font-medium text-foreground">
                      {selectedPo.contactPerson || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vendor Phone:</span>
                    <p className="font-medium text-foreground">
                      {selectedPo.vendorPhone || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vendor GST:</span>
                    <p className="font-mono text-foreground">
                      {selectedPo.vendorGst || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Subtotal:</span>
                    <p className="font-medium text-foreground">
                      ₹ {selectedPo.subtotal.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Grand Total:</span>
                    <p className="font-bold text-primary text-sm">
                      ₹ {selectedPo.grandTotal.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Warehouse:</span>
                    <p className="font-medium text-foreground">
                      {selectedPo.warehouse}
                    </p>
                  </div>
                </div>

                {/* Workflow Actions */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" /> PO
                    Approval & Workflow Actions
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedPo.status !== "Completed" && (
                      <>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                          onClick={() =>
                            updateMutation.mutate({
                              id: selectedPo.id,
                              status: "Approved",
                            })
                          }
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve PO
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1.5"
                          onClick={() =>
                            updateMutation.mutate({
                              id: selectedPo.id,
                              status: "Rejected",
                            })
                          }
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject PO
                        </Button>
                        <Button
                          size="sm"
                          className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                          onClick={() =>
                            updateMutation.mutate({
                              id: selectedPo.id,
                              status: "Product Dispatched",
                            })
                          }
                        >
                          Mark Dispatched
                        </Button>
                        <Button
                          size="sm"
                          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                          onClick={() =>
                            updateMutation.mutate({
                              id: selectedPo.id,
                              status: "Completed",
                            })
                          }
                        >
                          Mark Completed
                        </Button>
                      </>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => handlePrintPO(selectedPo)}
                    >
                      <Printer className="w-3.5 h-3.5" /> Print
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-destructive hover:bg-destructive/10"
                      onClick={() => deleteMutation.mutate(selectedPo.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </Button>
                  </div>
                </div>

                <DialogFooter className="pt-3 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPo(null)}
                  >
                    Close
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
