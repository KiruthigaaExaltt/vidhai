import { FLEX_TEXT } from "./flexText";
import { useFlexMasterData, useFlexPurchaseRequests } from "./flexData";
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
  Pencil,
  Printer,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Download,
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
  unit?: string;
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
  vendorWhatsapp?: string;
  placeOfSupply?: string;
  poDate: string;
  poDateValue: string;
  deliveryDate: string;
  warehouse: string;
  subtotal: number;
  tax: number;
  cgstAmount: number;
  sgstAmount: number;
  grandTotal: number;
  termsConditions?: string;
  items: string;
  lineItems?: POLineItem[];
  status: string;
  createdBy?: string;
}

async function fetchPurchaseOrders(skip: number, limit: number, search: string): Promise<{ data: PurchaseOrderItem[]; totalCount: number; totalPages: number }> {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit), search });
  const res = await fetch(`${BASE}/api/flex/purchase-orders?${params}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Unable to load purchase orders");
  return res.json();
}

async function createPurchaseOrder({ openSend, sendPreview, ...payload }: any) {
  const res = await fetch(`${BASE}/api/flex/purchase-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || FLEX_TEXT.failedToCreatePo);
  }
  return res.json();
}

async function updatePurchaseOrder({
  id,
  openSend,
  sendPreview,
  ...payload
}: any) {
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
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = Number(rowsPerPage);
  const {
    data: poPage,
    refetch,
    isFetching,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["get", "/api/flex/purchase-orders", currentPage, pageSize, search],
    queryFn: () => fetchPurchaseOrders((currentPage - 1) * pageSize, pageSize, search),
    placeholderData: (previous) => previous,
  });
  const pos = poPage?.data ?? [];

  const { data: masterData } = useFlexMasterData();
  const { data: purchaseRequests = [] } = useFlexPurchaseRequests();
  const vendorsList = masterData?.vendors ?? [];
  const itemOptions = masterData?.items ?? [];
  const warehouseOptions = masterData?.warehouses ?? [];


  // Modal Dialog states
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrderItem | null>(null);
  const [editingPo, setEditingPo] = useState<PurchaseOrderItem | null>(null);
  const [sendPo, setSendPo] = useState<PurchaseOrderItem | null>(null);
  const [sendMessage, setSendMessage] = useState("");
  const [sendCountryCode, setSendCountryCode] = useState("");
  const [sendMobileNumber, setSendMobileNumber] = useState("");

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

  function openSendDialog(po: PurchaseOrderItem) {
    const whatsappDigits = (po.vendorWhatsapp || po.vendorPhone || "").replace(
      /\D/g,
      "",
    );
    const mobileDigits = whatsappDigits.slice(-10);
    const countryDigits = whatsappDigits.slice(
      0,
      Math.max(0, whatsappDigits.length - mobileDigits.length),
    );
    const itemDetails = (po.lineItems || [])
      .map(
        (line, index) =>
          `${index + 1}. ${line.description}\nQuantity: ${line.qty} ${line.unit || ""}\nRate: \u20B9 ${Number(line.rate).toLocaleString("en-IN")}\nAmount: \u20B9 ${Number(line.total).toLocaleString("en-IN")}`,
      )
      .join("\n\n");
    setSendCountryCode(countryDigits);
    setSendMobileNumber(mobileDigits);
    setSendPo(po);
    setSendMessage(
      `Dear ${po.vendor},\n\nPlease find our Purchase Order details below.\n\nPO Number: ${po.poNumber}\n${itemDetails ? `\nLine Items:\n${itemDetails}\n` : ""}\nGrand Total: \u20B9 ${po.grandTotal.toLocaleString("en-IN")}\n\nPlease confirm receipt and availability.\n\nThank you.`,
    );
  }
  const createMutation = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-orders"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      const savedPreview = {
        ...variables.sendPreview,
        id: data.id,
        poNumber: data.poNumber,
        status: data.status,
      } as PurchaseOrderItem;
      setIsBuilderOpen(false);
      if (variables.openSend) {
        openSendDialog(savedPreview);
      } else {
        toast.success(FLEX_TEXT.purchaseOrderSavedAsDraft);
      }
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToCreatePo);
    },
  });

  const updateMutation = useMutation({
    mutationFn: updatePurchaseOrder,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-orders"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      if (variables.openSend && variables.sendPreview) {
        setIsBuilderOpen(false);
        openSendDialog({
          ...variables.sendPreview,
          id: data.id,
          status: data.status,
        });
      } else if (editingPo) {
        setIsBuilderOpen(false);
        toast.success(FLEX_TEXT.purchaseOrderUpdatedSuccessfully);
        resetForm();
      } else {
        toast.success(FLEX_TEXT.purchaseOrderUpdatedSuccessfully);
        setSelectedPo(null);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToUpdatePo);
    },
  });

  const markSentMutation = useMutation({
    mutationFn: (po: PurchaseOrderItem) =>
      updatePurchaseOrder({ id: po.id, status: "Draft" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["get", "/api/flex/purchase-orders"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["get", "/api/flex/dashboard"],
        }),
      ]);
      setSendPo(null);
      setEditingPo(null);
      toast.success("Purchase Order saved as Draft successfully.");
    },
    onError: (err: any) =>
      toast.error(err.message || "Unable to mark Purchase Order as Sent"),
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
    setEditingPo(null);
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

  const populateVendorLineItems = (selectedVendorId: string) => {
    const matchingRequests = purchaseRequests.filter((request: any) => {
      const vendorIds = Array.isArray(request.vendorIds)
        ? request.vendorIds.map(String)
        : [String(request.vendorId || "")];
      return (
        vendorIds.includes(selectedVendorId) &&
        request.status !== "Closed" &&
        request.status !== "PO Created"
      );
    });

    const populatedLines = matchingRequests.flatMap(
      (request: any, requestIndex: number) => {
        const requestLines =
          Array.isArray(request.lineItems) && request.lineItems.length
            ? request.lineItems
            : [
                {
                  itemName: request.itemName,
                  quantity: request.quantity,
                  unit: request.unit,
                },
              ];

        return requestLines
          .filter((requestLine: any) => requestLine.itemName)
          .map((requestLine: any, lineIndex: number) => {
            const item = itemOptions.find(
              (option) =>
                option.id === Number(requestLine.itemId) ||
                option.name.toLowerCase() ===
                  String(requestLine.itemName).toLowerCase(),
            );
            const qty = Number(
              requestLine.quantity ?? requestLine.qty ?? request.quantity ?? 1,
            );
            const rate = Number(item?.buyPricePerUnit || 0);
            return {
              id: `${request.id}-${requestIndex}-${lineIndex}`,
              itemId: item?.id ?? requestLine.itemId,
              description: item?.name || requestLine.itemName,
              hsn: item?.hsnSac || "",
              unit: item?.unit || requestLine.unit || "",
              qty,
              rate,
              cgstPct: 9,
              sgstPct: 9,
              igstPct: 18,
              total: qty * rate * 1.18,
            } satisfies POLineItem;
          });
      },
    );

    setPrReference(
      matchingRequests
        .map((request: any) => request.prNumber)
        .filter(Boolean)
        .join(", "),
    );
    setLineItems(
      populatedLines.length
        ? populatedLines
        : [
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
          ],
    );
  };

  const handleEditPO = (po: PurchaseOrderItem) => {
    const savedLines = po.lineItems?.length
      ? po.lineItems
      : (po.items || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value, index, values) => {
            const match = value.match(/^(.*?)\s*\((\d+(?:\.\d+)?)\s+(.+)\)$/);
            const description = (match?.[1] || value).trim();
            const item = itemOptions.find(
              (option) =>
                option.name.toLowerCase() === description.toLowerCase(),
            );
            const qty = Number(match?.[2] || 1);
            const rate = Number(
              item?.buyPricePerUnit ??
                (values.length === 1 && qty ? po.subtotal / qty : 0),
            );
            const combinedTaxPct = po.subtotal
              ? (Number(po.tax || 0) / po.subtotal) * 100
              : 0;
            return {
              id: String(index + 1),
              itemId: item?.id,
              description: item?.name || description,
              hsn: item?.hsnSac || "",
              qty,
              unit: item?.unit || match?.[3] || "",
              rate,
              cgstPct: combinedTaxPct / 2,
              sgstPct: combinedTaxPct / 2,
              igstPct: 0,
              total: qty * rate * (1 + combinedTaxPct / 100),
            };
          });

    setEditingPo(po);
    setPrReference(po.prReference || "");
    setVendorName(`${po.vendorId} - ${po.vendor}`);
    setContactPerson(po.contactPerson || "");
    setVendorGst(po.vendorGst || "");
    setVendorAddress(po.vendorAddress || "");
    setVendorPhone(po.vendorPhone || "");
    setPlaceOfSupply(po.placeOfSupply || "");
    setPoDate(po.poDateValue ? po.poDateValue.slice(0, 10) : "");
    setDeliveryDate(po.deliveryDate || "");
    setDestinationWarehouse(
      String(
        warehouseOptions.find((warehouse) => warehouse.name === po.warehouse)
          ?.id || "",
      ),
    );
    setTermsConditions(po.termsConditions || "");
    setLineItems(
      savedLines.length
        ? savedLines.map((line, index) => {
            const item = itemOptions.find(
              (option) => option.id === Number(line.itemId),
            );
            const qty = Number(line.qty || 0);
            const rate = Number(line.rate || 0);
            const cgstPct = Number(line.cgstPct || 0);
            const sgstPct = Number(line.sgstPct || 0);
            return {
              ...line,
              id: String(line.id || index + 1),
              description: line.description || item?.name || "",
              hsn: line.hsn || item?.hsnSac || "",
              unit: line.unit || item?.unit || "",
              qty,
              rate,
              cgstPct,
              sgstPct,
              igstPct: Number(line.igstPct || 0),
              total: Number(
                line.total || qty * rate * (1 + (cgstPct + sgstPct) / 100),
              ),
            };
          })
        : [
            {
              id: "1",
              description: "",
              hsn: "",
              qty: 1,
              unit: "",
              rate: 0,
              cgstPct: 0,
              sgstPct: 0,
              igstPct: 0,
              total: 0,
            },
          ],
    );
    setIsBuilderOpen(true);
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
        selectedVendor === "All" || po.vendorId === selectedVendor;
      const matchesSearch =
        !search.trim() ||
        po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        po.vendor.toLowerCase().includes(search.toLowerCase()) ||
        po.vendorId.toLowerCase().includes(search.toLowerCase());

      const poTime = new Date(po.poDateValue).getTime();
      const matchesFromDate =
        !fromDate || isNaN(poTime) || poTime >= new Date(fromDate).getTime();
      const matchesToDate =
        !toDate || isNaN(poTime) || poTime <= new Date(toDate).getTime();

      return matchesVendor && matchesSearch && matchesFromDate && matchesToDate;
    });
  }, [pos, search, selectedVendor, fromDate, toDate]);

  const totalPages = Number(poPage?.totalPages || 0);
  const paginatedPurchaseOrders = filtered;

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedVendor, fromDate, toDate, rowsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);
  const handleSubmitPO = (openSend: boolean) => {
    const [vendorId, ...vendorParts] = vendorName.split(" - ");
    const vendor = vendorParts.join(" - ");
    if (!vendorId || !vendor || lineItems.some((line) => !line.description)) {
      toast.error("Vendor and line items are required");
      return;
    }
    const itemSummary = lineItems
      .map((line) => line.description)
      .filter(Boolean)
      .join(", ");
    const preview: PurchaseOrderItem = {
      ...(editingPo || ({} as PurchaseOrderItem)),
      id: editingPo?.id || 0,
      vendorId,
      vendor,
      poNumber: editingPo?.poNumber || "",
      prReference,
      contactPerson,
      vendorGst,
      vendorAddress,
      vendorPhone,
      vendorWhatsapp:
        vendorsList.find((option) => String(option.id) === vendorId)
          ?.whatsapp || vendorPhone,
      placeOfSupply,
      poDate,
      poDateValue: poDate,
      deliveryDate,
      warehouse:
        warehouseOptions.find(
          (warehouse) => String(warehouse.id) === destinationWarehouse,
        )?.name || "",
      subtotal: calculatedSubtotal,
      tax: calculatedCgst + calculatedSgst,
      cgstAmount: calculatedCgst,
      sgstAmount: calculatedSgst,
      grandTotal: calculatedGrandTotal,
      termsConditions,
      items: itemSummary,
      lineItems,
      status: "Draft",
    };
    const payload = {
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
      lineItems,
      itemIds: lineItems.map((line) => line.itemId).filter(Boolean),
      subtotal: calculatedSubtotal,
      taxAmount: calculatedCgst + calculatedSgst,
      grandTotal: calculatedGrandTotal,
      termsConditions,
      status: "Draft",
      openSend,
      sendPreview: preview,
    };
    if (editingPo) updateMutation.mutate({ id: editingPo.id, ...payload });
    else createMutation.mutate(payload);
  };
  return (
    <Shell>
      <div className="w-full space-y-5 p-6">
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
                  <SelectItem key={vendor.id} value={String(vendor.id)}>
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
                    <th className="px-4 py-3 font-semibold">Tax</th>
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
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-8 text-center text-muted-foreground text-sm"
                      >
                        Loading purchase orders...
                      </td>
                    </tr>
                  ) : isError ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-8 text-center text-destructive text-sm"
                      >
                        Unable to load purchase orders
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-8 text-center text-muted-foreground text-sm"
                      >
                        {FLEX_TEXT.noPurchaseOrdersFound}
                      </td>
                    </tr>
                  ) : (
                    paginatedPurchaseOrders.map((po) => (
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
                          {"\u20B9"} {po.subtotal.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {"\u20B9"} {po.tax.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 font-bold text-foreground">
                          {"\u20B9"} {po.grandTotal.toLocaleString("en-IN")}
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
                            onClick={() => handlePrintPO(po)}
                            className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
                            title={FLEX_TEXT.printPo}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleEditPO(po)}
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

            <DataPagination
              currentPage={currentPage}
              pageSize={pageSize}
              totalCount={Number(poPage?.totalCount || 0)}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => {
                setRowsPerPage(String(size));
                setCurrentPage(1);
              }}
              loading={isFetching}
            />
          </CardContent>
        </Card>

        {/* ── PURCHASE ORDER BUILDER MODAL DIALOG (EXACT SCREENSHOT SPECIFICATION) ── */}
        <Dialog open={isBuilderOpen} onOpenChange={setIsBuilderOpen}>
          <DialogContent className="max-h-[calc(100svh-1rem)] max-w-4xl overflow-x-hidden overflow-y-auto p-4 sm:max-h-[92vh] sm:p-6">
            <DialogHeader className="pb-2 border-b border-border">
              <DialogTitle className="flex items-center gap-2.5 text-xl font-bold text-foreground">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                {editingPo
                  ? "Edit Purchase Order"
                  : FLEX_TEXT.purchaseOrderBuilder}
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
                    value={editingPo?.poNumber || FLEX_TEXT.autoAssignedOnSave}
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
                      if (!editingPo) populateVendorLineItems(id);
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

                <div className="space-y-2 overflow-x-auto rounded-lg border border-border/80 bg-background p-2.5 pb-3 shadow-2xs [&>.grid]:min-w-[700px]">
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
                disabled={createMutation.isPending || updateMutation.isPending}
                onClick={() => handleSubmitPO(false)}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : FLEX_TEXT.saveDraft}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 gap-1.5 shadow-2xs"
                disabled={createMutation.isPending || updateMutation.isPending}
                onClick={() => handleSubmitPO(true)}
              >
                <Send className="w-3.5 h-3.5" />{" "}
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : FLEX_TEXT.saveSend}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!sendPo}
          onOpenChange={(open) => {
            if (!open && !markSentMutation.isPending) setSendPo(null);
          }}
        >
          <DialogContent className="max-w-2xl p-6">
            {sendPo && (
              <div className="space-y-4">
                <DialogHeader className="border-b border-border pb-2">
                  <DialogTitle>Send Purchase Order</DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    The PO PDF has been downloaded. Share the order via WhatsApp
                    and attach the PDF manually.
                  </p>
                </DialogHeader>
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Recipient Details
                  </h3>
                  <div>
                    <Label className="text-xs">Vendor Name</Label>
                    <Input
                      value={sendPo.vendor}
                      readOnly
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">WhatsApp Number</Label>
                    <div className="mt-1 grid grid-cols-[110px_1fr] gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">
                          Country Code
                        </Label>
                        <Input
                          value={sendCountryCode}
                          onChange={(event) =>
                            setSendCountryCode(
                              event.target.value.replace(/\D/g, ""),
                            )
                          }
                          className="mt-1 h-9 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">
                          Mobile Number
                        </Label>
                        <Input
                          value={sendMobileNumber}
                          onChange={(event) =>
                            setSendMobileNumber(
                              event.target.value.replace(/\D/g, ""),
                            )
                          }
                          className="mt-1 h-9 text-xs"
                        />
                      </div>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Pre-filled from CRM contact details. You can edit before
                      sending.
                    </p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">UOM</th>
                        <th className="px-3 py-2">Rate</th>
                        <th className="px-3 py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(sendPo.lineItems || []).map((line, index) => (
                        <tr key={`${line.id}-${index}`}>
                          <td className="px-3 py-2">{index + 1}</td>
                          <td className="px-3 py-2">{line.description}</td>
                          <td className="px-3 py-2">{line.qty}</td>
                          <td className="px-3 py-2">{line.unit || "-"}</td>
                          <td className="px-3 py-2">
                            {"\u20B9"}{" "}
                            {Number(line.rate).toLocaleString("en-IN")}
                          </td>
                          <td className="px-3 py-2">
                            {"\u20B9"}{" "}
                            {Number(line.total).toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="border-t border-border bg-muted/30 px-3 py-2 text-right text-sm font-bold">
                    Grand Total: {"\u20B9"}{" "}
                    {sendPo.grandTotal.toLocaleString("en-IN")}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Message</Label>
                  <Textarea
                    value={sendMessage}
                    onChange={(event) => setSendMessage(event.target.value)}
                    rows={8}
                    className="mt-1 text-xs"
                  />
                </div>
                <DialogFooter className="border-t border-border pt-3">
                  <Button
                    variant="outline"
                    disabled={markSentMutation.isPending}
                    onClick={() => setSendPo(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    disabled={markSentMutation.isPending}
                    onClick={() => markSentMutation.mutate(sendPo)}
                  >
                    {markSentMutation.isPending ? "Saving..." : "Save as Sent"}
                  </Button>
                  <Button
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => {
                      const digits =
                        `${sendCountryCode}${sendMobileNumber}`.replace(
                          /\D/g,
                          "",
                        );

                      if (digits.length < 8) {
                        toast.error(
                          "WhatsApp number is not available for this vendor",
                        );
                        return;
                      }
                      window.open(
                        `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(sendMessage)}`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                  >
                    Open WhatsApp
                  </Button>
                </DialogFooter>
              </div>
            )}
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
