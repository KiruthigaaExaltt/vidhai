import { FLEX_TEXT } from "./flexText";
import { useFlexMasterData } from "./flexData";
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
  itemId?: number;
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

async function fetchPurchaseOrders(): Promise<PurchaseOrderItem[]> {
  try {
    const res = await fetch(`${BASE}/api/flex/purchase-orders`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch {}
  return [];
}

async function createPurchaseOrder(payload: any) {
  const res = await fetch(`${BASE}/api/flex/purchase-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(FLEX_TEXT.failedToCreatePo);
  return res.json();
}

async function updatePurchaseOrder({ id, ...payload }: any) {
  const res = await fetch(`${BASE}/api/flex/purchase-orders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(FLEX_TEXT.failedToUpdatePo);
  return res.json();
}

async function deletePurchaseOrder(id: number) {
  const res = await fetch(`${BASE}/api/flex/purchase-orders/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(FLEX_TEXT.failedToDeletePo);
  return res.json();
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

  const { data: masterData } = useFlexMasterData();
  const vendorsList = masterData?.vendors ?? [];
  const itemOptions = masterData?.items ?? [];
  const warehouseOptions = masterData?.warehouses ?? [];

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [rowsPerPage, setRowsPerPage] = useState("10");

  // Modal Dialog states
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrderItem | null>(null);

  // Purchase Order Builder Form States
  const [prReference, setPrReference] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [vendorGst, setVendorGst] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("27");
  const [poDate, setPoDate] = useState(new Date().toISOString().split("T")[0]);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [destinationWarehouse, setDestinationWarehouse] = useState("");
  const [termsConditions, setTermsConditions] = useState("");

  // Line Items inside PO Builder
  const [lineItems, setLineItems] = useState<POLineItem[]>([
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
          ? FLEX_TEXT.purchaseOrderSavedAsDraft
          : "Purchase Order saved and sent successfully!",
      );
      setIsBuilderOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToCreatePo);
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
      toast.success(FLEX_TEXT.purchaseOrderUpdatedSuccessfully);
      setSelectedPo(null);
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToUpdatePo);
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
      toast.success(FLEX_TEXT.purchaseOrderDeleted);
      setSelectedPo(null);
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToDeletePo);
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
      toast.error(FLEX_TEXT.atLeastOneLineItemIsRequired);
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
    setDestinationWarehouse(
      String(
        warehouseOptions.find((warehouse) => warehouse.name === po.warehouse)
          ?.id || "",
      ),
    );
    setTermsConditions(po.termsConditions || "");
    setIsBuilderOpen(true);
    toast.info(`${FLEX_TEXT.duplicatingDetailsFrom}${po.poNumber}`);
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
          <p><strong>${FLEX_TEXT.printVendor}</strong> ${po.vendor} (${po.vendorId})</p>
          <p><strong>${FLEX_TEXT.printWarehouse}</strong> ${po.warehouse} | <strong>${FLEX_TEXT.printPlaceOfSupply}</strong> ${po.placeOfSupply || ""}</p>
          <p><strong>${FLEX_TEXT.printStatus}</strong> ${po.status}</p>
          <table>
            <thead><tr><th>${FLEX_TEXT.printItemsDescription}</th><th>${FLEX_TEXT.printSubtotal}</th><th>${FLEX_TEXT.printGrandTotal}</th></tr></thead>
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
    const [vendorId, ...vendorParts] = vendorName.split(" - ");
    const vendor = vendorParts.join(" - ");
    const itemSummary = lineItems
      .map((line) => line.description)
      .filter(Boolean)
      .join(", ");
    createMutation.mutate({
      vendorId,
      vendorName: vendor,
      contactPerson,
      vendorGst,
      vendorAddress,
      vendorPhone,
      placeOfSupply,
      poDate,
      deliveryDate,
      warehouseId: Number(destinationWarehouse),
      prReference,
      items: itemSummary,
      itemIds: lineItems.map((line) => line.itemId).filter(Boolean),
      subtotal: calculatedSubtotal,
      taxAmount: calculatedCgst + calculatedSgst,
      grandTotal: calculatedGrandTotal,
      termsConditions,
      status,
    });
  };

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto w-full space-y-5">
        <FlexTabs />

        {/* Title Header Row with Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {FLEX_TEXT.purchaseOrders}
            </h1>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={() => {
                refetch();
                toast.info(FLEX_TEXT.refreshedPurchaseOrders);
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
              onClick={() => setIsBuilderOpen(true)}
            >
              <Plus className="w-4 h-4" /> {FLEX_TEXT.createPo}
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
              placeholder={FLEX_TEXT.searchPosOrVendorIdCon}
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
                    <th className="px-4 py-3 font-semibold">{FLEX_TEXT.po}</th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.poDate}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.deliveryDate}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.subtotal}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {FLEX_TEXT.grandTotal}
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
                        colSpan={9}
                        className="px-4 py-8 text-center text-muted-foreground text-sm"
                      >
                        {FLEX_TEXT.noPurchaseOrdersFound}
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
                            title={FLEX_TEXT.duplicatePo}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handlePrintPO(po)}
                            className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
                            title={FLEX_TEXT.printPo}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setSelectedPo(po)}
                            className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
                            title={FLEX_TEXT.viewEditPo}
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

        {/* ── PURCHASE ORDER BUILDER MODAL DIALOG (EXACT SCREENSHOT SPECIFICATION) ── */}
        <Dialog open={isBuilderOpen} onOpenChange={setIsBuilderOpen}>
          <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-6">
            <DialogHeader className="pb-2 border-b border-border">
              <DialogTitle className="flex items-center gap-2.5 text-xl font-bold text-foreground">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                {FLEX_TEXT.purchaseOrderBuilder}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              {/* Row 1: PO Number | Vendor Name * | Contact Person */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    {FLEX_TEXT.poNumber}
                  </Label>
                  <Input
                    readOnly
                    value={FLEX_TEXT.autoAssignedOnSave}
                    className="h-9 text-xs bg-muted/40 font-mono text-muted-foreground"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-foreground mb-1 block">
                    {FLEX_TEXT.vendorName}{" "}
                    <span className="text-primary">*</span>
                  </Label>
                  <Select
                    value={vendorName}
                    onValueChange={(value) => {
                      setVendorName(value);
                      const id = value.split(" - ")[0];
                      const vendor = vendorsList.find(
                        (option) => option.id === id,
                      );
                      setContactPerson(vendor?.company || "");
                      setVendorAddress(vendor?.address || "");
                      setVendorPhone(vendor?.phone || "");
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder={FLEX_TEXT.selectOrTypeVendor} />
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
                    {FLEX_TEXT.contactPerson}
                  </Label>
                  <Input
                    placeholder={FLEX_TEXT.vendorContactPerson}
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
                    {FLEX_TEXT.vendorGst}
                  </Label>
                  <Input
                    placeholder={FLEX_TEXT.gstNumber}
                    value={vendorGst}
                    onChange={(e) => setVendorGst(e.target.value)}
                    className="h-9 text-xs bg-background font-mono"
                  />
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

              {/* Row 3: Place of Supply (State Code) * | PO Date * | Delivery Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-foreground mb-1 block">
                    {FLEX_TEXT.placeOfSupplyStateCode}{" "}
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
                    {FLEX_TEXT.poDate2} <span className="text-primary">*</span>
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
                    {FLEX_TEXT.deliveryDate2}
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
                  {FLEX_TEXT.destinationWarehouse}
                </Label>
                <Select
                  value={destinationWarehouse}
                  onValueChange={setDestinationWarehouse}
                >
                  <SelectTrigger className="h-9 text-xs bg-background">
                    <SelectValue
                      placeholder={FLEX_TEXT.selectWarehouseForStock}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouseOptions.map((warehouse) => (
                      <SelectItem
                        key={warehouse.id}
                        value={String(warehouse.id)}
                      >
                        {warehouse.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Row 5: Line Items * Table */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground">
                    {FLEX_TEXT.lineItems}{" "}
                    <span className="text-primary">*</span>
                  </Label>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {FLEX_TEXT.addLine}
                  </button>
                </div>

                <div className="border border-border/80 rounded-lg p-2.5 bg-background space-y-2 shadow-2xs">
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    <div className="col-span-4">{FLEX_TEXT.description}</div>
                    <div className="col-span-1">{FLEX_TEXT.hsn}</div>
                    <div className="col-span-1 text-center">
                      {FLEX_TEXT.qty}
                    </div>
                    <div className="col-span-1 text-center">
                      {FLEX_TEXT.rate}
                    </div>
                    <div className="col-span-1 text-center">
                      {FLEX_TEXT.cgst}
                    </div>
                    <div className="col-span-1 text-center">
                      {FLEX_TEXT.sgst}
                    </div>
                    <div className="col-span-1 text-center">
                      {FLEX_TEXT.igst}
                    </div>
                    <div className="col-span-2 text-right">
                      {FLEX_TEXT.total}
                    </div>
                  </div>

                  {lineItems.map((line) => (
                    <div
                      key={line.id}
                      className="grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-4">
                        <Select
                          value={line.description}
                          onValueChange={(value) => {
                            const item = itemOptions.find(
                              (option) => option.name === value,
                            );
                            handleLineChange(line.id, "description", value);
                            if (item)
                              handleLineChange(line.id, "itemId", item.id);
                            if (item) {
                              handleLineChange(
                                line.id,
                                "hsn",
                                item.hsnSac || "",
                              );
                              handleLineChange(
                                line.id,
                                "rate",
                                item.buyPricePerUnit || 0,
                              );
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs bg-background">
                            <SelectValue
                              placeholder={FLEX_TEXT.selectOrTypeItemService}
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
                      </div>
                      <div className="col-span-1">
                        <Input
                          placeholder={FLEX_TEXT.hsn}
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
                      <span>{FLEX_TEXT.subtotal2}</span>
                      <span className="font-semibold text-foreground">
                        ₹ {calculatedSubtotal.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{FLEX_TEXT.cgst2}</span>
                      <span className="font-semibold text-foreground">
                        ₹ {calculatedCgst.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{FLEX_TEXT.sgst2}</span>
                      <span className="font-semibold text-foreground">
                        ₹ {calculatedSgst.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-foreground pt-1.5 border-t border-border">
                      <span>{FLEX_TEXT.grandTotal2}</span>
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
                  {FLEX_TEXT.termsConditions}
                </Label>
                <Textarea
                  placeholder={FLEX_TEXT.paymentTermsDeliveryConditions}
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
                {FLEX_TEXT.cancel}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-border text-foreground hover:bg-muted"
                onClick={() => handleSubmitPO("Draft")}
              >
                {FLEX_TEXT.saveDraft}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 gap-1.5 shadow-2xs"
                onClick={() => handleSubmitPO("Issued")}
              >
                <Send className="w-3.5 h-3.5" /> {FLEX_TEXT.saveSend}
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
                      {selectedPo.poNumber} {FLEX_TEXT.details}
                    </span>
                    <span className="text-xs font-mono bg-muted/60 px-2 py-0.5 rounded text-muted-foreground">
                      {selectedPo.vendorId}
                    </span>
                  </DialogTitle>
                </DialogHeader>

                {/* PO Details Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs bg-muted/40 p-3.5 rounded-lg border border-border/80">
                  <div>
                    <span className="text-muted-foreground">
                      {FLEX_TEXT.vendor3}
                    </span>
                    <p className="font-semibold text-foreground text-sm">
                      {selectedPo.vendor}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {FLEX_TEXT.contactPerson2}
                    </span>
                    <p className="font-medium text-foreground">
                      {selectedPo.contactPerson || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {FLEX_TEXT.vendorPhone3}
                    </span>
                    <p className="font-medium text-foreground">
                      {selectedPo.vendorPhone || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {FLEX_TEXT.vendorGst2}
                    </span>
                    <p className="font-mono text-foreground">
                      {selectedPo.vendorGst || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {FLEX_TEXT.subtotal3}
                    </span>
                    <p className="font-medium text-foreground">
                      ₹ {selectedPo.subtotal.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {FLEX_TEXT.grandTotal3}
                    </span>
                    <p className="font-bold text-primary text-sm">
                      ₹ {selectedPo.grandTotal.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">
                      {FLEX_TEXT.warehouse2}
                    </span>
                    <p className="font-medium text-foreground">
                      {selectedPo.warehouse}
                    </p>
                  </div>
                </div>

                {/* Workflow Actions */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />{" "}
                    {FLEX_TEXT.poApprovalWorkflowActions}
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
                          <CheckCircle2 className="w-3.5 h-3.5" />{" "}
                          {FLEX_TEXT.approvePo}
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
                          <XCircle className="w-3.5 h-3.5" />{" "}
                          {FLEX_TEXT.rejectPo}
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
                          {FLEX_TEXT.markDispatched}
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
                          {FLEX_TEXT.markCompleted}
                        </Button>
                      </>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => handlePrintPO(selectedPo)}
                    >
                      <Printer className="w-3.5 h-3.5" /> {FLEX_TEXT.print}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-destructive hover:bg-destructive/10"
                      onClick={() => deleteMutation.mutate(selectedPo.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {FLEX_TEXT.delete}
                    </Button>
                  </div>
                </div>

                <DialogFooter className="pt-3 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPo(null)}
                  >
                    {FLEX_TEXT.close}
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
