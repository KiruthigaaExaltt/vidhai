import { FLEX_TEXT } from "./flexText";
import { useFlexMasterData, useFlexPurchaseOrders } from "./flexData";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  manualItem?: boolean;
  externalVaultType?: "spawn" | "casing_soil";
  externalReference?: string;
  markComplete?: boolean;
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

function receiptPurchaseOrderKeys(receipt: GoodsReceiptItem): string[] {
  const ids = receipt.purchaseOrderIds?.length
    ? receipt.purchaseOrderIds
    : receipt.purchaseOrderId
      ? [receipt.purchaseOrderId]
      : [];
  if (ids.length) return ids.map((id) => `id:${id}`);
  return String(receipt.poNumber || "")
    .split(",")
    .map((poNumber) => `number:${poNumber.trim().toLowerCase()}`)
    .filter((key) => key !== "number:");
}

function sharesPurchaseOrder(
  left: GoodsReceiptItem,
  right: GoodsReceiptItem,
): boolean {
  const leftKeys = new Set(receiptPurchaseOrderKeys(left));
  return receiptPurchaseOrderKeys(right).some((key) => leftKeys.has(key));
}

async function fetchGoodsReceipts(skip: number, limit: number, search: string): Promise<{ data: GoodsReceiptItem[]; totalCount: number; totalPages: number }> {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit), search });
  const res = await fetch(`${BASE}/api/flex/goods-receipts?${params}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load Goods Receipts");
  const data = await res.json();
  return { ...data, data: (data.data || []).map((g: any) => ({
    id: g.id,
    vendorId: String(g.vendorId || ""),
    vendor: String(g.vendor || ""),
    grnNumber: String(g.grnNumber || ""),
    poNumber: String(g.poReference || g.poNumber || ""),
    receivedDate: String(g.receivedDate || ""),
    receivedBy: String(g.inspectedBy || g.receivedBy || ""),
    receivedOrdered: String(g.itemsReceived || ""),
    pending: "",
    status: String(g.status || "Pending"),
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
  })) };
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
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = Number(rowsPerPage);
  const {
    data: grnPage,
    refetch,
    isFetching,
    isError: receiptsLoadFailed,
  } = useQuery({
    queryKey: ["get", "/api/flex/goods-receipts", currentPage, pageSize, search],
    queryFn: () => fetchGoodsReceipts((currentPage - 1) * pageSize, pageSize, search),
    placeholderData: (previous) => previous,
  });
  const grns = grnPage?.data ?? [];

  const { data: masterData } = useFlexMasterData();
  const { data: purchaseOrders = [] } = useFlexPurchaseOrders();
  const vendorsList = masterData?.vendors ?? [];
  const itemOptions = masterData?.items ?? [];
  const userOptions = masterData?.users ?? [];
  const warehouseOptions = masterData?.warehouses ?? [];

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [viewReceipt, setViewReceipt] = useState<GoodsReceiptItem | null>(null);
  const [receiptMode, setReceiptMode] = useState<"manual" | "po">("manual");

  // Form fields for Log Goods Receipt
  const [mappedPoIds, setMappedPoIds] = useState<string[]>([]);
  const [poSearch, setPoSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [formVendorId, setFormVendorId] = useState("");
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
  const [externalItemType, setExternalItemType] = useState<
    "spawn" | "casing_soil" | null
  >(null);
  const [externalIdNumber, setExternalIdNumber] = useState("");
  const [externalOrderedKg, setExternalOrderedKg] = useState("");
  const [externalReceivedKg, setExternalReceivedKg] = useState("");
  const [externalAlreadyReceivedKg, setExternalAlreadyReceivedKg] = useState(0);
  const [externalMarkComplete, setExternalMarkComplete] = useState(false);
  const [externalLookupLoading, setExternalLookupLoading] = useState(false);

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
  const isManualReceipt = receiptMode === "manual";
  const regularItemOptions = useMemo(
    () =>
      itemOptions.filter((item) => {
        const name = String(item.name || "").trim().toLowerCase();
        return name !== "spawn" && name !== "casing soil";
      }),
    [itemOptions],
  );

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
    onSuccess: (_data, completedReceipt) => {
      queryClient.setQueryData<GoodsReceiptItem[]>(
        ["get", "/api/flex/goods-receipts"],
        (current = []) =>
          current.map((receipt) =>
            sharesPurchaseOrder(receipt, completedReceipt)
              ? { ...receipt, status: "Complete" }
              : receipt,
          ),
      );
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
    setFormVendorId("");
    setVendorName("");
    setVendorAddress("");
    setVendorPhone("");
    setNotes("");
    setAttachmentName("");
    setReceiptMode("manual");
  };

  const changeReceiptMode = (mode: "manual" | "po") => {
    setReceiptMode(mode);
    setMappedPoIds([]);
    setLineItems([]);
    setPoSearch("");
  };

  const handleVendorSelect = (vendorId: string) => {
    const vendor = vendorsList.find((item) => String(item.id) === vendorId);
    setFormVendorId(vendorId);
    setVendorName(vendor?.name || "");
    setVendorAddress(vendor?.address || "");
    setVendorPhone(vendor?.phone || vendor?.whatsapp || "");
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

  const addInventoryItem = (
    item: any,
    externalVaultType?: "spawn" | "casing_soil",
    externalReference?: string,
    orderedQty = 1,
    receivedQty = 1,
    alreadyReceived = 0,
    markComplete = false,
  ) => {
    const primaryPo = purchaseOrders.find((po: any) =>
      mappedPoIds.includes(String(po.id)),
    );
    setLineItems((previous) => [
      ...previous,
      {
        id: `manual:${item.id}:${Date.now()}`,
        purchaseOrderId: Number(primaryPo?.id || 0),
        poLineId: `manual:${item.id}:${Date.now()}`,
        poNumber: String(primaryPo?.poNumber || externalReference || "MANUAL"),
        itemId: Number(item.id),
        itemMaster: String(item.name),
        customSpec: String(item.unit || "kg"),
        warehouse: String(primaryPo?.warehouse || warehouseOptions[0]?.name || ""),
        qty: orderedQty,
        alreadyReceived,
        price: Number(item.buyPricePerUnit || 0),
        recvQty: receivedQty,
        cgstPct: 0,
        sgstPct: 0,
        igstPct: 0,
        total: receivedQty * Number(item.buyPricePerUnit || 0),
        manualItem: true,
        externalVaultType,
        externalReference,
        markComplete,
      },
    ]);
  };

  const loadExternalReceiptBalance = async () => {
    if (!externalItemType || !/^\d+$/.test(externalIdNumber)) return;
    setExternalLookupLoading(true);
    try {
      const reference = `EXT-${externalIdNumber}`;
      const response = await fetch(
        `${BASE}/api/flex/goods-receipts/external/${encodeURIComponent(reference)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Unable to load external receipt balance");
      const balance = await response.json();
      if (!balance.found) {
        setExternalAlreadyReceivedKg(0);
        return;
      }
      if (balance.externalVaultType !== externalItemType) {
        toast.error(`${reference} belongs to a different item type`);
        return;
      }
      if (balance.complete) {
        toast.error(`${reference} is already complete`);
        setExternalReceivedKg("");
        return;
      }
      setExternalOrderedKg(String(balance.orderedQuantity));
      setExternalAlreadyReceivedKg(Number(balance.receivedQuantity || 0));
      setExternalReceivedKg(String(balance.remainingQuantity));
      toast.info(`${balance.remainingQuantity} kg remains for ${reference}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load balance");
    } finally {
      setExternalLookupLoading(false);
    }
  };

  const saveExternalItem = () => {
    if (!externalItemType || !/^\d+$/.test(externalIdNumber)) {
      toast.error("Enter the numeric external ID");
      return;
    }
    const orderedKg = Number(externalOrderedKg);
    const receivedKg = Number(externalReceivedKg);
    if (!(orderedKg > 0) || !(receivedKg > 0)) {
      toast.error("Enter ordered and received quantities in kg");
      return;
    }
    const remainingKg = Math.max(0, orderedKg - externalAlreadyReceivedKg);
    if (receivedKg > remainingKg) {
      toast.error(`Received quantity cannot exceed the remaining ${remainingKg} kg`);
      return;
    }
    const externalReference = `EXT-${externalIdNumber}`;
    if (
      lineItems.some(
        (line) =>
          line.externalVaultType === externalItemType &&
          line.externalReference === externalReference,
      )
    ) {
      toast.error(`${externalReference} is already added to Line Items`);
      return;
    }
    const displayName = externalItemType === "spawn" ? "Spawn" : "Casing Soil";
    const expectedName = displayName.toLowerCase();
    const item = itemOptions.find((candidate) =>
      candidate.name.toLowerCase().includes(expectedName),
    ) ?? {
      id: 0,
      name: displayName,
      unit: "kg",
      buyPricePerUnit: 0,
    };
    addInventoryItem(
      item,
      externalItemType,
      externalReference,
      orderedKg,
      receivedKg,
      externalAlreadyReceivedKg,
      externalMarkComplete,
    );
    toast.success(`${displayName} ${externalReference} added to Line Items`);
    setIsAddOpen(true);
    setExternalItemType(null);
    setExternalIdNumber("");
    setExternalOrderedKg("");
    setExternalReceivedKg("");
    setExternalAlreadyReceivedKg(0);
    setExternalMarkComplete(false);
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
    const selectedVendorIds = [
      ...new Set(selected.map((po: any) => String(po.vendorId)).filter(Boolean)),
    ];
    setFormVendorId(selectedVendorIds.length === 1 ? selectedVendorIds[0] : "");
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
    setLineItems((currentLines) => [
      ...mappedLines,
      ...currentLines.filter((line) => line.manualItem),
    ]);
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

  const synchronizedGrns = useMemo(() => {
    const completedPurchaseOrders = new Set(
      grns
        .filter((receipt) => receipt.status === "Complete")
        .flatMap(receiptPurchaseOrderKeys),
    );
    return grns.map((receipt) =>
      receiptPurchaseOrderKeys(receipt).some((key) =>
        completedPurchaseOrders.has(key),
      )
        ? { ...receipt, status: "Complete" }
        : receipt,
    );
  }, [grns]);

  const filtered = useMemo(() => {
    return synchronizedGrns.filter((g) => {
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
  }, [synchronizedGrns, search, selectedVendor, fromDate, toDate]);
  const paginatedReceipts = filtered;
  useEffect(
    () => setCurrentPage(1),
    [search, selectedVendor, fromDate, toDate, rowsPerPage],
  );

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
    if (!mappedPoIds.length && lineItems.some((line) => !line.manualItem)) {
      toast.error("Select at least one Purchase Order");
      return;
    }
    if (!formVendorId) {
      toast.error("Select a vendor from CRM");
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
      (line) =>
        !line.manualItem &&
        line.recvQty > Math.max(0, line.qty - line.alreadyReceived),
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
      vendorId: formVendorId,
      receivedDate,
      inspectedByUserId: Number(receivedBy),
      notes,
      attachmentName,
      lineItems: receiptLines.map((line) => ({
        purchaseOrderId: line.purchaseOrderId,
        itemId: line.itemId,
        poLineId: line.poLineId,
        description: line.itemMaster,
        orderedQty: line.qty,
        receivedQty: line.recvQty,
        unit: line.customSpec,
        unitPrice: line.price,
        warehouse: line.warehouse,
        manualItem: line.manualItem,
        externalVaultType: line.externalVaultType,
        externalReference: line.externalReference,
        markComplete: line.markComplete,
      })),
    });
  };
  return (
    <Shell>
      <div className="w-full space-y-5 p-6">
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
                    paginatedReceipts.map((receipt, index) => (
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

            <DataPagination
              currentPage={currentPage}
              pageSize={pageSize}
              totalCount={Number(grnPage?.totalCount || 0)}
              totalPages={Number(grnPage?.totalPages || 0)}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => {
                setRowsPerPage(String(size));
                setCurrentPage(1);
              }}
              loading={isFetching}
            />
          </CardContent>
        </Card>

        {/* ── LOG GOODS RECEIPT MODAL DIALOG (EXACT SCREENSHOT SPECIFICATION) ── */}
        <Dialog
          open={isAddOpen}
          onOpenChange={(open) => {
            if (!open && externalItemType) return;
            setIsAddOpen(open);
          }}
        >
          <DialogContent className="w-[calc(100vw-1rem)] max-w-[940px] max-h-[calc(100svh-1rem)] overflow-x-hidden overflow-y-auto p-4 sm:w-[calc(100vw-2rem)] sm:max-h-[90vh] sm:p-6">
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
                <div className="inline-flex rounded-md border border-border bg-muted/30 p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={receiptMode === "manual" ? "default" : "ghost"}
                    className="h-7 rounded-sm text-xs"
                    onClick={() => changeReceiptMode("manual")}
                  >
                    Manual Entry
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={receiptMode === "po" ? "default" : "ghost"}
                    className="h-7 rounded-sm text-xs"
                    onClick={() => changeReceiptMode("po")}
                  >
                    Purchase Order
                  </Button>
                </div>

                <div
                  className={`grid grid-cols-1 gap-3 ${isManualReceipt ? "" : "sm:grid-cols-2"}`}
                >
                  {!isManualReceipt && (
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
                )}
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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="mb-1 block text-xs font-semibold text-foreground">
                      {FLEX_TEXT.vendorName} *
                    </Label>
                    <Select
                      value={formVendorId}
                      onValueChange={handleVendorSelect}
                    >
                      <SelectTrigger className="h-9 bg-background text-xs">
                        <SelectValue placeholder="Select CRM vendor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {vendorsList.map((vendor) => (
                          <SelectItem key={vendor.id} value={String(vendor.id)}>
                            {vendor.name}
                            {vendor.company ? ` - ${vendor.company}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs font-semibold text-foreground">
                      {FLEX_TEXT.vendorAddress} *
                    </Label>
                    <Input
                      readOnly
                      value={vendorAddress}
                      className="h-9 bg-muted/30 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs font-semibold text-foreground">
                      {FLEX_TEXT.vendorPhone} *
                    </Label>
                    <Input
                      readOnly
                      value={vendorPhone}
                      className="h-9 bg-muted/30 text-xs"
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
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-bold text-foreground">
                      Line Items - Ordered vs Received
                    </Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
                          <Plus className="h-3.5 w-3.5" /> Item list
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-72 w-64 overflow-y-auto">
                        {regularItemOptions.map((item) => (
                          <DropdownMenuItem key={item.id} onClick={() => addInventoryItem(item)}>
                            <span className="truncate">{item.name}</span>
                            {item.sku && <span className="ml-auto text-[10px] text-muted-foreground">{item.sku}</span>}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setExternalItemType("spawn")}>
                          Spawn
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setExternalItemType("casing_soil")}>
                          Casing Soil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {lineItems.length === 0 ? (
                    <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground bg-muted/20">
                      {mappedPoIds.length
                        ? "All items on the selected Purchase Orders have already been received."
                        : "Choose an item from Item list. Spawn and Casing Soil require external details."}
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
                                  {line.externalReference && (
                                    <div className="mt-0.5 font-mono text-[10px] font-semibold text-primary">
                                      External ID: {line.externalReference}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {line.qty}{line.manualItem ? " kg" : ""}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {line.alreadyReceived}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold">
                                  {remaining}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {line.manualItem ? (
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={line.price || ""}
                                      onChange={(event) =>
                                        handleLineChange(
                                          line.id,
                                          "price",
                                          Number(event.target.value),
                                        )
                                      }
                                      placeholder="Enter amount"
                                      className="h-8 min-w-20 text-right px-2"
                                    />
                                  ) : (
                                    <>{"\u20B9"} {line.price.toLocaleString("en-IN")}</>
                                  )}
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
                                  {line.manualItem && (
                                    <div className="mt-0.5 text-right text-[9px] text-muted-foreground">
                                      kg received
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {taxPct}%
                                </td>
                                <td className="px-3 py-2 text-right font-semibold">
                                  {line.price > 0
                                    ? `${"\u20B9"} ${lineTotal.toLocaleString("en-IN", {
                                        minimumFractionDigits: 2,
                                      })}`
                                    : "—"}
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
            {externalItemType !== null && (
              <div className="absolute inset-0 z-[100] flex items-center justify-center rounded-lg bg-black/55 p-4">
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="external-item-title"
                  className="w-full max-w-sm space-y-4 rounded-md border border-border bg-background p-6 shadow-2xl"
                >
                  <h2 id="external-item-title" className="text-lg font-semibold">
                    Add External {externalItemType === "spawn" ? "Spawn" : "Casing Soil"}
                  </h2>
                  <div className="space-y-1.5">
                    <Label>External ID *</Label>
                    <div className="flex h-9 overflow-hidden rounded-md border border-input bg-background">
                      <span className="flex items-center border-r bg-muted px-3 font-mono text-sm font-semibold">EXT-</span>
                      <Input
                        value={externalIdNumber}
                        onChange={(event) => {
                          setExternalIdNumber(event.target.value.replace(/\D/g, ""));
                          setExternalAlreadyReceivedKg(0);
                          setExternalOrderedKg("");
                          setExternalReceivedKg("");
                          setExternalMarkComplete(false);
                        }}
                        onBlur={loadExternalReceiptBalance}
                        inputMode="numeric"
                        className="h-full rounded-none border-0 font-mono focus-visible:ring-0"
                        placeholder="Enter ID number"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Ordered (kg) *</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={externalOrderedKg}
                        onChange={(event) => setExternalOrderedKg(event.target.value)}
                        placeholder="0.00"
                        disabled={externalAlreadyReceivedKg > 0}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Received (kg) *</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={externalReceivedKg}
                        onChange={(event) => setExternalReceivedKg(event.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  {externalAlreadyReceivedKg > 0 && (
                    <div className="rounded-md bg-muted px-3 py-2 text-xs">
                      Already received: <strong>{externalAlreadyReceivedKg} kg</strong>
                      {" · "}Remaining: <strong>{Math.max(0, Number(externalOrderedKg || 0) - externalAlreadyReceivedKg)} kg</strong>
                    </div>
                  )}
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={externalMarkComplete}
                      onChange={(event) => setExternalMarkComplete(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <strong>Mark as complete</strong>
                      <span className="block text-xs text-muted-foreground">
                        Use this when no more quantity is required for this external ID.
                      </span>
                    </span>
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setExternalItemType(null);
                        setExternalIdNumber("");
                        setExternalOrderedKg("");
                        setExternalReceivedKg("");
                        setExternalAlreadyReceivedKg(0);
                        setExternalMarkComplete(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="button" onClick={saveExternalItem} disabled={externalLookupLoading}>
                      {externalLookupLoading ? "Checking..." : "Save to Line Items"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
