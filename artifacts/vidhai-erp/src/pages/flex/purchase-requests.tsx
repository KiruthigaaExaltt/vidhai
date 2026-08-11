import { FLEX_TEXT } from "./flexText";
import { useFlexMasterData } from "./flexData";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getListContactsQueryKey,
  getListMaterialsQueryKey,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { FlexTabs } from "./FlexTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  FileText,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  RefreshCw,
  Download,
  Printer,
  Copy,
  Paperclip,
  History,
  ShieldCheck,
  Image as ImageIcon,
  Users,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface LineItem {
  id: string;
  item: string;
  itemId?: number;
  description: string;
  qty: number;
  unit: string;
}

export interface VersionLog {
  version: string;
  updatedBy: string;
  timestamp: string;
  status: string;
  notes?: string;
}

export interface VendorAvailabilityItem {
  id: number;
  purchaseRequestId: number;
  vendorId: string;
  vendorName: string;
  phone: string;
  whatsapp: string;
  status: "Pending" | "Sent" | "Confirmed" | "Rejected";
  sentAt?: string | null;
  confirmedAt?: string | null;
  purchaseOrderId?: number | null;
  prNumber: string;
  version: string;
  lineItems: Array<{
    itemId?: number;
    itemName: string;
    description?: string;
    quantity: number;
    unit: string;
  }>;
}

export interface PurchaseRequestItem {
  id: number;
  vendorId: string;
  vendorIds?: string[];
  vendorNames?: string[];
  vendor: string;
  prNumber: string;
  version: string;
  reqDate: string;
  requiredDate: string;
  priority: string;
  departmentId?: number;
  department: string;
  requestedBy: string;
  requestedByUserId?: number;
  status:
    | "Draft"
    | "Submitted"
    | "Approved"
    | "Rejected"
    | "Closed"
    | "PO Created";
  itemName?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
  approvalNotes?: string;
  project?: string;
  attachmentName?: string;
  versionLogs?: VersionLog[];
}

async function fetchPurchaseRequests(): Promise<PurchaseRequestItem[]> {
  try {
    const res = await fetch(`${BASE}/api/flex/purchase-requests`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch {}
  return [];
}

async function createPurchaseRequest(payload: any) {
  const res = await fetch(`${BASE}/api/flex/purchase-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || FLEX_TEXT.failedToCreatePr);
  }
  return res.json();
}

async function saveVendorContact(payload: any) {
  const res = await fetch(`${BASE}/api/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      type: "vendor",
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      address: payload.address,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || FLEX_TEXT.failedToSaveVendorContact);
  }
  return res.json();
}

async function updatePurchaseRequest({ id, ...payload }: any) {
  const res = await fetch(`${BASE}/api/flex/purchase-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || FLEX_TEXT.failedToUpdatePr);
  }
  return res.json();
}

async function deletePurchaseRequest(id: number) {
  const res = await fetch(`${BASE}/api/flex/purchase-requests/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(FLEX_TEXT.failedToDeletePr);
  return res.json();
}

async function convertPrToPo(id: number) {
  const res = await fetch(
    `${BASE}/api/flex/purchase-requests/${id}/convert-to-po`,
    {
      method: "POST",
      credentials: "include",
    },
  );
  if (!res.ok) throw new Error(FLEX_TEXT.failedToConvertPrToPurchaseOrder);
  return res.json();
}

async function fetchVendorAvailability(): Promise<VendorAvailabilityItem[]> {
  const response = await fetch(`${BASE}/api/flex/vendor-availability`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to load vendor availability");
  return response.json();
}

async function updateVendorAvailability(
  id: number,
  action: "send" | "confirm",
) {
  const response = await fetch(
    `${BASE}/api/flex/vendor-availability/${id}/${action}`,
    {
      method: action === "send" ? "PATCH" : "POST",
      credentials: "include",
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Failed to ${action} vendor`);
  return body;
}

export default function PurchaseRequestsPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const {
    data: prs = [],
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["get", "/api/flex/purchase-requests"],
    queryFn: fetchPurchaseRequests,
  });

  const nextPrNumber = useMemo(() => {
    const highestSequence = prs.reduce((highest, pr) => {
      const match = pr.prNumber.match(/^PR-26-27-(\d+)$/);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    return `PR-26-27-${String(highestSequence + 1).padStart(4, "0")}`;
  }, [prs]);

  const {
    data: masterData,
    isLoading: isMasterDataLoading,
    isError: isMasterDataError,
  } = useFlexMasterData();
  const vendorsList = masterData?.vendors ?? [];
  const itemOptions = masterData?.items ?? [];
  const userOptions = masterData?.users ?? [];
  const departmentOptions = masterData?.departments ?? [];
  const projectOptions = masterData?.projects ?? [];

  const { data: vendorAvailability = [], isLoading: isAvailabilityLoading } =
    useQuery({
      queryKey: ["get", "/api/flex/vendor-availability"],
      queryFn: fetchVendorAvailability,
      select: (rows) =>
        rows.filter((row) => row.status === "Pending" || row.status === "Sent"),
    });

  const [activeSubTab, setActiveSubTab] = useState<"requests" | "availability">(
    "requests",
  );
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [rowsPerPage, setRowsPerPage] = useState("25");

  // Modal Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
  const [isAddInventoryOpen, setIsAddInventoryOpen] = useState(false);
  const [selectedPr, setSelectedPr] = useState<PurchaseRequestItem | null>(
    null,
  );
  const [editingPr, setEditingPr] = useState<PurchaseRequestItem | null>(null);
  const [selectedVendorAvailability, setSelectedVendorAvailability] =
    useState<VendorAvailabilityItem | null>(null);
  const [vendorToConfirm, setVendorToConfirm] =
    useState<VendorAvailabilityItem | null>(null);

  // Edit PR State Fields
  const [editVendorName, setEditVendorName] = useState("");
  const [editVendorsTable, setEditVendorsTable] = useState<any[]>([]);
  const [editLineItems, setEditLineItems] = useState<any[]>([]);
  const [editReqDate, setEditReqDate] = useState("");
  const [editRequiredDate, setEditRequiredDate] = useState("");
  const [editPriority, setEditPriority] = useState("Normal");
  const [editDepartmentId, setEditDepartmentId] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editRequestedBy, setEditRequestedBy] = useState("");
  const [editProject, setEditProject] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Add Vendor Form
  const [vName, setVName] = useState("");
  const [vPhone, setVPhone] = useState("");
  const [vWhatsapp, setVWhatsapp] = useState("");
  const [vEmail, setVEmail] = useState("");
  const [vAddress, setVAddress] = useState("");
  const [vGst, setVGst] = useState("");
  const [vPerson, setVPerson] = useState("");

  // Add Inventory Form
  const [invItemName, setInvItemName] = useState("");
  const [invCategory, setInvCategory] = useState("Raw Material");
  const [invType, setInvType] = useState("Raw Material");
  const [invSku, setInvSku] = useState("");
  const [invHsn, setInvHsn] = useState("");
  const [invBuyingPrice, setInvBuyingPrice] = useState("");
  const [invSellingPrice, setInvSellingPrice] = useState("");
  const [invUom, setInvUom] = useState("Nos");
  const [invCriticalLevel, setInvCriticalLevel] = useState("10");

  // Form states for Create PR
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [isVendorSelectorOpen, setIsVendorSelectorOpen] = useState(false);
  const selectedVendorRecords = useMemo(
    () =>
      selectedVendorIds
        .map((vendorId) => vendorsList.find((vendor) => vendor.id === vendorId))
        .filter(Boolean),
    [selectedVendorIds, vendorsList],
  );
  const selectedVendorDisplay = useMemo(() => {
    const names = selectedVendorRecords.map((vendor) => vendor!.name);
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
  }, [selectedVendorRecords]);

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", item: "", description: "", qty: 1, unit: "" },
  ]);
  const [requestDate, setRequestDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [requiredDate, setRequiredDate] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [departmentId, setDepartmentId] = useState("");
  const [department, setDepartment] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [project, setProject] = useState("");
  const [notes, setNotes] = useState("");
  const [attachmentName, setAttachmentName] = useState<string>("");

  const createMutation = useMutation({
    mutationFn: createPurchaseRequest,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-requests"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/vendor-availability"],
      });
      toast.success(
        variables.status === "Draft"
          ? FLEX_TEXT.purchaseRequestSavedAsDraft
          : FLEX_TEXT.purchaseRequestCreatedSuccessfully,
      );
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToCreatePr);
    },
  });

  const updateMutation = useMutation({
    mutationFn: updatePurchaseRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-requests"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      toast.success(FLEX_TEXT.purchaseRequestUpdatedSuccessfully);
      setSelectedPr(null);
      setEditingPr(null);
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToUpdatePr);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePurchaseRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-requests"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      toast.success(FLEX_TEXT.purchaseRequestDeleted);
      setSelectedPr(null);
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToDeletePr);
    },
  });

  const convertPoMutation = useMutation({
    mutationFn: convertPrToPo,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-requests"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-orders"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      toast.success(FLEX_TEXT.purchaseOrderGeneratedFromApprovedPr);
      setSelectedPr(null);
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToGeneratePo);
    },
  });

  const availabilityQueryKey = [
    "get",
    "/api/flex/vendor-availability",
  ] as const;
  const sendAvailabilityMutation = useMutation({
    mutationFn: (id: number) => updateVendorAvailability(id, "send"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: availabilityQueryKey });
      setSelectedVendorAvailability(null);
      toast.success("Purchase request marked as sent");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const confirmAvailabilityMutation = useMutation({
    mutationFn: (id: number) => updateVendorAvailability(id, "confirm"),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: availabilityQueryKey });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-orders"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/purchase-requests"],
      });
      setVendorToConfirm(null);
      toast.success("Vendor confirmed and Purchase Order draft created.");
      setLocation(data.navigationPath || "/flex/purchase-orders");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const resetForm = () => {
    setLineItems([{ id: "1", item: "", description: "", qty: 1, unit: "" }]);
    setNotes("");
    setSelectedVendorIds([]);
    setIsVendorSelectorOpen(false);
    setPriority("Normal");
    setRequiredDate("");
    setDepartmentId("");
    setDepartment("");
    setRequestedBy("");
    setProject("");
    setAttachmentName("");
  };

  // Open Add Vendor modal while cleanly hiding Create PR modal
  const handleOpenAddVendor = () => {
    setIsCreateOpen(false);
    setIsAddVendorOpen(true);
  };

  const handleCloseAddVendor = () => {
    setIsAddVendorOpen(false);
    setIsCreateOpen(true);
  };

  const isFormValid = useMemo(
    () => selectedVendorIds.length > 0 && requestedBy.length > 0,
    [selectedVendorIds, requestedBy],
  );

  const handleAddVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vName.trim()) {
      toast.error(FLEX_TEXT.pleaseEnterVendorName);
      return;
    }
    try {
      const vendor = await saveVendorContact({
        name: vName.trim(),
        phone: vPhone.trim(),
        email: vEmail.trim(),
        address: vAddress.trim(),
      });
      await queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/master-data"],
      });
      await queryClient.invalidateQueries({
        queryKey: getListContactsQueryKey(),
      });
      setSelectedVendorIds((current) =>
        current.includes(String(vendor.id))
          ? current
          : [...current, String(vendor.id)],
      );
      toast.success(`${FLEX_TEXT.savedVendorToVendorDirectory}${vendor.name}`);
      setIsAddVendorOpen(false);
      setIsCreateOpen(true);
      setVName("");
      setVPhone("");
      setVAddress("");
    } catch (error: any) {
      toast.error(error.message || FLEX_TEXT.failedToSaveVendorContact);
    }
  };

  // Open Add Inventory modal while cleanly hiding Create PR modal
  const handleOpenAddInventory = () => {
    setIsCreateOpen(false);
    setIsAddInventoryOpen(true);
  };

  const handleCloseAddInventory = () => {
    setIsAddInventoryOpen(false);
    setIsCreateOpen(true);
  };

  const handleAddInventorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invItemName.trim()) {
      toast.error(FLEX_TEXT.pleaseEnterItemName);
      return;
    }
    const response = await fetch(`${BASE}/api/materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: invItemName.trim(),
        sku: invSku || null,
        unit: invUom,
        itemType: invType,
        hsnSac: invHsn || null,
        buyPricePerUnit: invBuyingPrice || null,
        sellPricePerUnit: invSellingPrice || null,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.error(body.error || FLEX_TEXT.failedToCreatePr);
      return;
    }
    const item = await response.json();
    await queryClient.invalidateQueries({
      queryKey: ["get", "/api/flex/master-data"],
    });
    await queryClient.invalidateQueries({
      queryKey: getListMaterialsQueryKey(),
    });
    setLineItems((prev) => [
      ...prev.filter((row) => row.item),
      {
        id: String(Date.now()),
        itemId: item.id,
        item: item.name,
        description: item.sku || "",
        qty: 1,
        unit: item.unit || "",
      },
    ]);
    toast.success(`${FLEX_TEXT.inventoryItemAdded}${item.name}`);
    setIsAddInventoryOpen(false);
    setIsCreateOpen(true);
    setInvItemName("");
  };

  const handleAddLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        item: "",
        description: "",
        qty: 1,
        unit: "Nos",
      },
    ]);
  };

  const handleRemoveLineItem = (id: string) => {
    if (lineItems.length <= 1) {
      toast.error(FLEX_TEXT.atLeastOneLineItemIsRequired);
      return;
    }
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleLineItemChange = (
    id: string,
    field: keyof LineItem,
    value: any,
  ) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const handleDuplicatePR = (pr: PurchaseRequestItem) => {
    setSelectedVendorIds(
      pr.vendorIds?.length ? pr.vendorIds : [pr.vendorId].filter(Boolean),
    );
    setLineItems([
      {
        id: "1",
        item: pr.itemName || "",
        description: "",
        qty: pr.quantity || 1,
        unit: pr.unit || "",
      },
    ]);
    setPriority(pr.priority || "Normal");
    setDepartmentId(
      String(
        pr.departmentId ??
          departmentOptions.find((option) => option.name === pr.department)
            ?.id ??
          "",
      ),
    );
    setDepartment(pr.department || "");
    setRequestedBy(String(pr.requestedByUserId || ""));
    setProject(pr.project || "");
    setNotes(pr.notes || "");
    setIsCreateOpen(true);
    toast.info(`${FLEX_TEXT.duplicatingDetailsFrom}${pr.prNumber}`);
  };

  const handlePrintPR = (pr: PurchaseRequestItem) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Print ${pr.prNumber}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 30px; color: #111; }
            h2 { color: #0d9488; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h2>VIDHAI ERP - PURCHASE REQUEST ${pr.prNumber}</h2>
          <p><strong>${FLEX_TEXT.printVendor}</strong> ${pr.vendor} (${pr.vendorId})</p>
          <p><strong>${FLEX_TEXT.printRequestedBy}</strong> ${pr.requestedBy} | <strong>${FLEX_TEXT.printDepartment}</strong> ${pr.department}</p>
          <p><strong>${FLEX_TEXT.printRequiredDate}</strong> ${pr.requiredDate} | <strong>${FLEX_TEXT.printPriority}</strong> ${pr.priority}</p>
          <p><strong>${FLEX_TEXT.printStatus}</strong> ${pr.status}</p>
          <table>
            <thead><tr><th>${FLEX_TEXT.printItemName}</th><th>${FLEX_TEXT.printQty}</th><th>${FLEX_TEXT.printUnit}</th></tr></thead>
            <tbody><tr><td>${pr.itemName || ""}</td><td>${pr.quantity ?? ""}</td><td>${pr.unit || ""}</td></tr></tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const filtered = useMemo(() => {
    return prs.filter((pr) => {
      const matchesVendor =
        selectedVendor === "All" ||
        pr.vendorNames?.includes(selectedVendor) ||
        pr.vendor === selectedVendor;
      const matchesSearch =
        !search.trim() ||
        pr.prNumber.toLowerCase().includes(search.toLowerCase()) ||
        pr.vendor.toLowerCase().includes(search.toLowerCase()) ||
        pr.vendorId.toLowerCase().includes(search.toLowerCase()) ||
        pr.requestedBy.toLowerCase().includes(search.toLowerCase());

      const prDate = new Date(pr.reqDate).getTime();
      const matchesFromDate =
        !fromDate || isNaN(prDate) || prDate >= new Date(fromDate).getTime();
      const matchesToDate =
        !toDate || isNaN(prDate) || prDate <= new Date(toDate).getTime();

      return matchesVendor && matchesSearch && matchesFromDate && matchesToDate;
    });
  }, [prs, search, selectedVendor, fromDate, toDate]);

  const handleSubmitPR = (status: "Submitted" | "Draft") => {
    const firstItem = lineItems[0];
    const itemName = firstItem?.item?.trim() || "";
    const quantity = Number(firstItem?.qty) || 0;
    const unit = firstItem?.unit || "";
    const vendorIds = selectedVendorRecords.map((vendor) => vendor!.id);
    const vendorNames = selectedVendorRecords.map((vendor) => vendor!.name);
    const vendorId = vendorIds[0];
    const vendor = vendorNames[0];
    createMutation.mutate({
      lineItems: lineItems
        .filter((line) => line.item.trim())
        .map((line) => ({
          itemId: line.itemId,
          itemName: line.item.trim(),
          description: line.description.trim(),
          quantity: Number(line.qty) || 0,
          unit: line.unit,
        })),
      itemId: firstItem?.itemId,
      itemName,
      quantity,
      unit,
      vendorName: vendor,
      vendorId,
      vendorIds,
      vendorNames,
      priority,
      departmentId: departmentId ? Number(departmentId) : undefined,
      department,
      requestedByUserId: Number(requestedBy),
      project,
      requiredDate,
      status,
      notes,
      attachmentName,
    });
  };

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto w-full space-y-5">
        <FlexTabs />

        {/* Sub-nav Sub-Module Tabs */}
        <div className="flex items-center gap-6 border-b border-border/80 text-sm font-medium">
          <button
            onClick={() => setActiveSubTab("requests")}
            className={`pb-2.5 transition-colors relative cursor-pointer ${
              activeSubTab === "requests"
                ? "text-primary font-bold border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {FLEX_TEXT.purchaseRequests}
          </button>
          <button
            onClick={() => setActiveSubTab("availability")}
            className={`pb-2.5 transition-colors relative cursor-pointer ${
              activeSubTab === "availability"
                ? "text-primary font-bold border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {FLEX_TEXT.vendorAvailability}
          </button>
        </div>

        {activeSubTab === "requests" ? (
          <>
            {/* Title Header Row with Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {FLEX_TEXT.purchaseRequests}
                </h1>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => {
                    refetch();
                    toast.info(FLEX_TEXT.refreshedPurchaseRequests);
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
                  onClick={() => setIsCreateOpen(true)}
                >
                  <Plus className="w-4 h-4" /> {FLEX_TEXT.createPr}
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
                  placeholder={FLEX_TEXT.searchByItemSkuRequesterOrVendorIdCon}
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
                <Select
                  value={selectedVendor}
                  onValueChange={setSelectedVendor}
                >
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
                          {FLEX_TEXT.prNumber}
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          {FLEX_TEXT.version}
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          {FLEX_TEXT.reqDate}
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          {FLEX_TEXT.requiredDate}
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          {FLEX_TEXT.priority}
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          {FLEX_TEXT.department}
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          {FLEX_TEXT.requestedBy}
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
                            {FLEX_TEXT.noPurchaseRequestsFound}
                          </td>
                        </tr>
                      ) : (
                        filtered.map((pr) => (
                          <tr
                            key={pr.id}
                            className="hover:bg-muted/40 transition-colors"
                          >
                            <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                              {pr.vendorId}
                            </td>
                            <td className="px-4 py-3 font-semibold text-foreground">
                              {pr.vendor}
                            </td>
                            <td className="px-4 py-3 font-bold text-foreground">
                              {pr.prNumber}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] ${
                                  pr.version.startsWith("Submitted")
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                                    : "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"
                                }`}
                              >
                                {pr.version}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {pr.reqDate}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {pr.requiredDate}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {pr.priority}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {pr.department}
                            </td>
                            <td className="px-4 py-3 font-medium text-foreground">
                              {pr.requestedBy}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  pr.status === "Submitted"
                                    ? "bg-amber-50 text-amber-600 border-amber-200"
                                    : pr.status === "Approved"
                                      ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                      : pr.status === "Rejected"
                                        ? "bg-red-50 text-red-600 border-red-200"
                                        : "bg-muted/70 text-muted-foreground border-border"
                                }`}
                              >
                                {pr.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right space-x-1">
                              <button
                                onClick={() => handleDuplicatePR(pr)}
                                className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
                                title={FLEX_TEXT.duplicatePr}
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handlePrintPR(pr)}
                                className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
                                title={FLEX_TEXT.printPr}
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingPr(pr);
                                  setEditVendorName(pr.vendor || "");
                                  const vendor = vendorsList.find(
                                    (option) => option.id === pr.vendorId,
                                  );
                                  setEditVendorsTable(
                                    vendor
                                      ? [
                                          {
                                            name: vendor.name,
                                            whatsapp: "",
                                            phone: vendor.phone || "",
                                            email: vendor.email || "",
                                          },
                                        ]
                                      : [],
                                  );
                                  setEditLineItems([
                                    {
                                      id: "1",
                                      itemId: itemOptions.find(
                                        (item) => item.name === pr.itemName,
                                      )?.id,
                                      product: pr.itemName || "",
                                      description: pr.itemName || "",
                                      qty: pr.quantity || 1,
                                      unit: pr.unit || "",
                                    },
                                  ]);
                                  setEditReqDate(pr.reqDate || "");
                                  setEditRequiredDate(pr.requiredDate || "");
                                  setEditPriority(pr.priority || "Normal");
                                  setEditDepartmentId(
                                    String(
                                      pr.departmentId ??
                                        departmentOptions.find(
                                          (option) =>
                                            option.name === pr.department,
                                        )?.id ??
                                        "",
                                    ),
                                  );
                                  setEditDepartment(pr.department || "");
                                  setEditRequestedBy(
                                    String(pr.requestedByUserId || ""),
                                  );
                                  setEditProject(pr.project || "");
                                  setEditNotes(pr.notes || "");
                                }}
                                className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
                                title={FLEX_TEXT.editPurchaseRequest}
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
                    <span className="font-semibold text-foreground">1</span>{" "}
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
                      <Select
                        value={rowsPerPage}
                        onValueChange={setRowsPerPage}
                      >
                        <SelectTrigger className="h-7 w-16 text-xs bg-background">
                          <SelectValue placeholder="25" />
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
          </>
        ) : (
          /* ── VENDOR AVAILABILITY MODULE TAB ────────────────────────────── */
          <Card className="rounded-md border-border shadow-2xs">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3.5 font-semibold">S.No</th>
                      <th className="px-4 py-3.5 font-semibold">Vendor Name</th>
                      <th className="px-4 py-3.5 font-semibold">Phone</th>
                      <th className="px-4 py-3.5 font-semibold">WhatsApp</th>
                      <th className="px-4 py-3.5 font-semibold">Status</th>
                      <th className="px-4 py-3.5 text-right font-semibold">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {isAvailabilityLoading ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-muted-foreground"
                        >
                          Loading vendor availability...
                        </td>
                      </tr>
                    ) : vendorAvailability.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-muted-foreground"
                        >
                          No vendor availability records found
                        </td>
                      </tr>
                    ) : (
                      vendorAvailability.map((item, index) => (
                        <tr
                          key={item.id}
                          className="transition-colors hover:bg-muted/40"
                        >
                          <td className="px-4 py-3.5 text-muted-foreground">
                            {index + 1}
                          </td>
                          <td className="px-4 py-3.5 font-bold text-foreground">
                            <div>{item.vendorName}</div>
                            <div className="text-[10px] font-normal text-muted-foreground">
                              {item.prNumber}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-muted-foreground">
                            {item.phone || FLEX_TEXT.notAvailable}
                          </td>
                          <td className="px-4 py-3.5 text-muted-foreground">
                            {item.whatsapp || FLEX_TEXT.notAvailable}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                              {item.status}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {item.status === "Pending" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10 rounded-md"
                                onClick={() =>
                                  setSelectedVendorAvailability(item)
                                }
                              >
                                Send PR
                              </Button>
                            ) : item.status === "Sent" ? (
                              <Button
                                size="sm"
                                className="h-7 text-xs font-semibold"
                                onClick={() => setVendorToConfirm(item)}
                              >
                                Confirm
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">�</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── CREATE PURCHASE REQUEST MODAL DIALOG ──────────────────────────── */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <DialogHeader className="pb-2 border-b border-border">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                {FLEX_TEXT.createPurchaseRequest}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 py-3">
              {/* 1. PURCHASE REQUEST NUMBER PREVIEW BOX */}
              <div className="bg-muted/40 p-3.5 rounded-lg border border-border/80">
                <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  {FLEX_TEXT.purchaseRequestNumber}
                </div>
                <div className="text-base font-bold text-foreground mt-0.5 font-mono">
                  {nextPrNumber}
                </div>
              </div>

              {isMasterDataError && (
                <div className="text-xs text-destructive">
                  {FLEX_TEXT.failedToLoadVendorAndItemMasterData}
                </div>
              )}

              {/* 2. VENDOR SELECTION */}
              <div className="border border-border/80 rounded-lg p-3.5 space-y-2.5 bg-background shadow-2xs">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground">
                    {FLEX_TEXT.vendorSelection}{" "}
                    <span className="text-primary">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10 font-semibold"
                    onClick={handleOpenAddVendor}
                  >
                    <UserPlus className="w-3.5 h-3.5" /> {FLEX_TEXT.addVendor}
                  </Button>
                </div>
                <Popover
                  open={isVendorSelectorOpen}
                  onOpenChange={setIsVendorSelectorOpen}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      aria-expanded={isVendorSelectorOpen}
                      aria-label={FLEX_TEXT.vendorSelection}
                      disabled={isMasterDataLoading || isMasterDataError}
                      className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span
                        className={`truncate ${selectedVendorDisplay ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {isMasterDataLoading
                          ? FLEX_TEXT.loadingVendors
                          : selectedVendorDisplay || FLEX_TEXT.searchVendors}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 opacity-50 transition-transform ${isVendorSelectorOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[var(--radix-popover-trigger-width)] p-0"
                  >
                    <Command>
                      <CommandInput placeholder={FLEX_TEXT.typeToFilter} />
                      <CommandList>
                        <CommandEmpty>{FLEX_TEXT.noVendorsFound}</CommandEmpty>
                        <CommandGroup>
                          {vendorsList.map((vendor) => {
                            const isSelected = selectedVendorIds.includes(
                              vendor.id,
                            );
                            return (
                              <CommandItem
                                key={vendor.id}
                                value={`${vendor.name} ${vendor.company || ""}`}
                                onSelect={() => {
                                  setSelectedVendorIds((current) =>
                                    current.includes(vendor.id)
                                      ? current.filter(
                                          (vendorId) => vendorId !== vendor.id,
                                        )
                                      : [...current, vendor.id],
                                  );
                                }}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  tabIndex={-1}
                                  aria-hidden="true"
                                  className="pointer-events-none"
                                />
                                <span className="truncate">{vendor.name}</span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {selectedVendorRecords.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-border/80">
                    <table className="w-full min-w-[620px] text-xs">
                      <thead className="bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">
                            {FLEX_TEXT.vendorName3}
                          </th>
                          <th className="px-3 py-2 text-left">
                            {FLEX_TEXT.whatsapp2}
                          </th>
                          <th className="px-3 py-2 text-left">
                            {FLEX_TEXT.phone2}
                          </th>
                          <th className="px-3 py-2 text-left">
                            {FLEX_TEXT.email2}
                          </th>
                          <th className="px-3 py-2 text-right">
                            {FLEX_TEXT.action}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {selectedVendorRecords.map((vendor) => (
                          <tr key={vendor!.id} className="bg-background">
                            <td className="px-3 py-2 font-medium text-foreground">
                              {vendor!.name}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {vendor!.whatsapp || FLEX_TEXT.notAvailable}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {vendor!.phone || FLEX_TEXT.notAvailable}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {vendor!.email || FLEX_TEXT.notAvailable}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                aria-label={`${FLEX_TEXT.removeVendorFromRequest} ${vendor!.name}`}
                                title={FLEX_TEXT.removeVendorFromRequest}
                                onClick={() =>
                                  setSelectedVendorIds((current) =>
                                    current.filter(
                                      (vendorId) => vendorId !== vendor!.id,
                                    ),
                                  )
                                }
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 3. LINE ITEMS SECTION */}
              <div className="border border-border/80 rounded-lg p-3.5 space-y-3 bg-background shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">
                    {FLEX_TEXT.lineItems}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1 font-semibold"
                      onClick={handleOpenAddInventory}
                    >
                      {FLEX_TEXT.addToItemMaster}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-primary border-primary/30 hover:bg-primary/10 font-semibold"
                      onClick={handleAddLineItem}
                    >
                      {FLEX_TEXT.addItem}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-muted-foreground px-1">
                    <div className="col-span-4">{FLEX_TEXT.itemProduct}</div>
                    <div className="col-span-4">{FLEX_TEXT.description2}</div>
                    <div className="col-span-2">{FLEX_TEXT.qty2}</div>
                    <div className="col-span-1">{FLEX_TEXT.unit}</div>
                    <div className="col-span-1 text-center"></div>
                  </div>

                  {lineItems.map((itemRow) => (
                    <div
                      key={itemRow.id}
                      className="grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-4">
                        <Select
                          value={String(itemRow.itemId || "")}
                          onValueChange={(val) => {
                            const selectedItem = itemOptions.find(
                              (option) => String(option.id) === val,
                            );
                            handleLineItemChange(
                              itemRow.id,
                              "itemId",
                              Number(val),
                            );
                            handleLineItemChange(
                              itemRow.id,
                              "item",
                              selectedItem?.name || "",
                            );
                            handleLineItemChange(
                              itemRow.id,
                              "description",
                              selectedItem?.name || "",
                            );
                            handleLineItemChange(
                              itemRow.id,
                              "unit",
                              selectedItem?.unit || "",
                            );
                          }}
                          disabled={isMasterDataLoading || isMasterDataError}
                        >
                          <SelectTrigger className="h-8 text-xs bg-background">
                            <SelectValue
                              placeholder={
                                isMasterDataLoading
                                  ? FLEX_TEXT.loadingItems
                                  : FLEX_TEXT.selectOrTypeProductService
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {itemOptions.map((option) => (
                              <SelectItem
                                key={option.id}
                                value={String(option.id)}
                              >
                                {option.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-4">
                        <Input
                          placeholder={FLEX_TEXT.description2}
                          value={itemRow.description}
                          onChange={(e) =>
                            handleLineItemChange(
                              itemRow.id,
                              "description",
                              e.target.value,
                            )
                          }
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          value={itemRow.qty}
                          onChange={(e) =>
                            handleLineItemChange(
                              itemRow.id,
                              "qty",
                              parseFloat(e.target.value) || 1,
                            )
                          }
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                      <div className="col-span-1">
                        <Select
                          value={itemRow.unit}
                          onValueChange={(val) =>
                            handleLineItemChange(itemRow.id, "unit", val)
                          }
                        >
                          <SelectTrigger className="h-8 text-xs bg-background px-2">
                            <SelectValue placeholder={FLEX_TEXT.nos} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Nos">{FLEX_TEXT.nos}</SelectItem>
                            <SelectItem value="kg">{FLEX_TEXT.kg}</SelectItem>
                            <SelectItem value="units">
                              {FLEX_TEXT.units}
                            </SelectItem>
                            <SelectItem value="sheets">
                              {FLEX_TEXT.sheets}
                            </SelectItem>
                            <SelectItem value="pcs">{FLEX_TEXT.pcs}</SelectItem>
                            <SelectItem value="bags">
                              {FLEX_TEXT.bags}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(itemRow.id)}
                          className="text-muted-foreground hover:text-destructive p-1 rounded-md transition-colors"
                        >
                          <Trash2 className="w-4 h-4 mx-auto" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. DATES & PRIORITY ROW */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    {FLEX_TEXT.requestDate}
                  </Label>
                  <Input
                    type="date"
                    value={requestDate}
                    onChange={(e) => setRequestDate(e.target.value)}
                    className="h-9 text-xs bg-background cursor-pointer"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-foreground mb-1 block">
                    {FLEX_TEXT.requiredDate2}
                  </Label>
                  <Input
                    type="date"
                    value={requiredDate}
                    onChange={(e) => setRequiredDate(e.target.value)}
                    className="h-9 text-xs bg-background cursor-pointer"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    {FLEX_TEXT.priority2}
                  </Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder={FLEX_TEXT.normal} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">{FLEX_TEXT.low}</SelectItem>
                      <SelectItem value="Normal">{FLEX_TEXT.normal}</SelectItem>
                      <SelectItem value="High">{FLEX_TEXT.high}</SelectItem>
                      <SelectItem value="Critical">
                        {FLEX_TEXT.critical}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 5. DEPARTMENT, REQUESTED BY & PROJECT ROW */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-foreground mb-1 block">
                    {FLEX_TEXT.departmentTeam}
                  </Label>
                  <Select
                    value={departmentId}
                    onValueChange={(value) => {
                      const selectedDepartment = departmentOptions.find(
                        (option) => String(option.id) === value,
                      );
                      setDepartmentId(value);
                      setDepartment(selectedDepartment?.name || "");
                    }}
                    disabled={isMasterDataLoading || isMasterDataError}
                  >
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue
                        placeholder={
                          isMasterDataLoading
                            ? FLEX_TEXT.loadingDepartments
                            : isMasterDataError
                              ? FLEX_TEXT.failedToLoadDepartments
                              : FLEX_TEXT.selectDepartment
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {departmentOptions.length === 0 ? (
                        <SelectItem value="__no_departments__" disabled>
                          {FLEX_TEXT.noDepartmentsAvailable}
                        </SelectItem>
                      ) : (
                        departmentOptions.map((option) => (
                          <SelectItem key={option.id} value={String(option.id)}>
                            {option.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-foreground mb-1 block">
                    {FLEX_TEXT.requestedBy2}{" "}
                    <span className="text-primary">*</span>
                  </Label>
                  <Select value={requestedBy} onValueChange={setRequestedBy}>
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder={FLEX_TEXT.selectEmployee} />
                    </SelectTrigger>
                    <SelectContent>
                      {userOptions.map((option) => (
                        <SelectItem key={option.id} value={String(option.id)}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    {FLEX_TEXT.project}
                  </Label>
                  <Select value={project} onValueChange={setProject}>
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder={FLEX_TEXT.optional} />
                    </SelectTrigger>
                    <SelectContent>
                      {projectOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 6. ATTACHMENT UPLOAD */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">
                  {FLEX_TEXT.supportingAttachments}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    className="text-xs bg-background h-9 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setAttachmentName(file.name);
                        toast.success(`${FLEX_TEXT.attached}${file.name}`);
                      }
                    }}
                  />
                  {attachmentName && (
                    <span className="text-xs text-primary font-medium flex items-center gap-1">
                      <Paperclip className="w-3.5 h-3.5" /> {attachmentName}
                    </span>
                  )}
                </div>
              </div>

              {/* 7. NOTES */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">
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
            </div>

            {/* 8. FOOTER BUTTONS */}
            <DialogFooter className="pt-3 border-t border-border flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
              >
                {FLEX_TEXT.cancel}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isFormValid}
                className="border-border text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => handleSubmitPR("Draft")}
              >
                {FLEX_TEXT.saveDraft}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!isFormValid}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 gap-1.5 shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => handleSubmitPR("Submitted")}
              >
                <Send className="w-3.5 h-3.5" /> {FLEX_TEXT.submitRequest}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── 1. ADD CONTACT (ADD VENDOR) MODAL DIALOG ─────────────────────── */}
        <Dialog
          open={isAddVendorOpen}
          onOpenChange={(open) => !open && handleCloseAddVendor()}
        >
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto p-6">
            <form onSubmit={handleAddVendorSubmit}>
              <DialogHeader className="pb-2 border-b border-border">
                <DialogTitle className="text-lg font-bold text-foreground">
                  {FLEX_TEXT.addContact}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {FLEX_TEXT.createsANewEntryInOrbitContactDirectory}
                </p>
              </DialogHeader>

              <div className="space-y-3.5 py-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {FLEX_TEXT.contactId}
                  </Label>
                  <Input
                    value={FLEX_TEXT.autoAssignedOnSave}
                    readOnly
                    className="h-9 text-xs bg-muted/40 font-mono"
                  />
                </div>

                <div>
                  <Label className="text-xs text-foreground font-medium">
                    {FLEX_TEXT.vendorName2}
                  </Label>
                  <Input
                    placeholder={FLEX_TEXT.enterVendorName}
                    value={vName}
                    onChange={(e) => setVName(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-foreground font-medium">
                      {FLEX_TEXT.phone}
                    </Label>
                    <Input
                      placeholder={FLEX_TEXT.phoneNumber}
                      value={vPhone}
                      onChange={(e) => setVPhone(e.target.value)}
                      className="h-9 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {FLEX_TEXT.whatsapp}
                    </Label>
                    <Input
                      placeholder={FLEX_TEXT.whatsappNumber}
                      value={vWhatsapp}
                      onChange={(e) => setVWhatsapp(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">
                    {FLEX_TEXT.email}
                  </Label>
                  <Input
                    type="email"
                    placeholder={FLEX_TEXT.emailAddress}
                    value={vEmail}
                    onChange={(e) => setVEmail(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs text-foreground font-medium">
                    {FLEX_TEXT.address}
                  </Label>
                  <Textarea
                    placeholder={FLEX_TEXT.vendorAddress2}
                    value={vAddress}
                    onChange={(e) => setVAddress(e.target.value)}
                    rows={2}
                    className="text-xs"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {FLEX_TEXT.gstNumber2}
                    </Label>
                    <Input
                      placeholder={FLEX_TEXT.gstin}
                      value={vGst}
                      onChange={(e) => setVGst(e.target.value)}
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {FLEX_TEXT.contactPerson}
                    </Label>
                    <Input
                      placeholder={FLEX_TEXT.contactPersonName}
                      value={vPerson}
                      onChange={(e) => setVPerson(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">
                    {FLEX_TEXT.contactType}
                  </Label>
                  <Select value="Vendor" disabled>
                    <SelectTrigger className="h-9 text-xs bg-muted/30">
                      <SelectValue placeholder={FLEX_TEXT.vendor} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vendor">{FLEX_TEXT.vendor}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCloseAddVendor}
                >
                  {FLEX_TEXT.cancel}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4"
                >
                  {FLEX_TEXT.addContact}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── 2. ADD INVENTORY (ADD TO ITEM MASTER) MODAL DIALOG ───────────── */}
        <Dialog
          open={isAddInventoryOpen}
          onOpenChange={(open) => !open && handleCloseAddInventory()}
        >
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <form onSubmit={handleAddInventorySubmit}>
              <DialogHeader className="pb-2 border-b border-border">
                <DialogTitle className="text-lg font-bold text-foreground">
                  {FLEX_TEXT.addInventory}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3.5 py-3">
                <div>
                  <Label className="text-xs text-foreground font-medium">
                    {FLEX_TEXT.itemName}
                  </Label>
                  <Input
                    placeholder={FLEX_TEXT.searchOrSelectItem}
                    value={invItemName}
                    onChange={(e) => setInvItemName(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-foreground font-medium">
                      {FLEX_TEXT.category}
                    </Label>
                    <Select value={invCategory} onValueChange={setInvCategory}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue
                          placeholder={FLEX_TEXT.searchOrSelectCategory}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Raw Material">
                          {FLEX_TEXT.rawMaterial}
                        </SelectItem>
                        <SelectItem value="Finished Goods">
                          {FLEX_TEXT.finishedGoods}
                        </SelectItem>
                        <SelectItem value="Packaging">
                          {FLEX_TEXT.packaging}
                        </SelectItem>
                        <SelectItem value="Hardware">
                          {FLEX_TEXT.hardware}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {FLEX_TEXT.type}
                    </Label>
                    <Select value={invType} onValueChange={setInvType}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder={FLEX_TEXT.rawMaterial} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Raw Material">
                          {FLEX_TEXT.rawMaterial}
                        </SelectItem>
                        <SelectItem value="Consumable">
                          {FLEX_TEXT.consumable}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-foreground font-medium">
                      {FLEX_TEXT.generatedSku}
                    </Label>
                    <Input
                      value={invSku}
                      onChange={(e) => setInvSku(e.target.value)}
                      className="h-9 text-xs font-mono"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-foreground font-medium">
                      {FLEX_TEXT.hsnSac}
                    </Label>
                    <Input
                      value={invHsn}
                      onChange={(e) => setInvHsn(e.target.value)}
                      className="h-9 text-xs font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-foreground font-medium">
                      {FLEX_TEXT.buyingPrice}
                    </Label>
                    <Input
                      type="number"
                      value={invBuyingPrice}
                      onChange={(e) => setInvBuyingPrice(e.target.value)}
                      className="h-9 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-foreground font-medium">
                      {FLEX_TEXT.sellingPrice}
                    </Label>
                    <Input
                      type="number"
                      value={invSellingPrice}
                      onChange={(e) => setInvSellingPrice(e.target.value)}
                      className="h-9 text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-foreground font-medium">
                      {FLEX_TEXT.uom}
                    </Label>
                    <Select value={invUom} onValueChange={setInvUom}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder={FLEX_TEXT.nos} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Nos">{FLEX_TEXT.nos}</SelectItem>
                        <SelectItem value="kg">{FLEX_TEXT.kg}</SelectItem>
                        <SelectItem value="units">{FLEX_TEXT.units}</SelectItem>
                        <SelectItem value="sheets">
                          {FLEX_TEXT.sheets}
                        </SelectItem>
                        <SelectItem value="pcs">{FLEX_TEXT.pcs}</SelectItem>
                        <SelectItem value="bags">{FLEX_TEXT.bags}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {FLEX_TEXT.criticalLevel}
                    </Label>
                    <Input
                      type="number"
                      value={invCriticalLevel}
                      onChange={(e) => setInvCriticalLevel(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                {/* Image Upload box */}
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {FLEX_TEXT.productImage}
                  </Label>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="w-16 h-16 rounded-lg border border-dashed border-border flex items-center justify-center bg-muted/30 text-muted-foreground">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                    >
                      {FLEX_TEXT.uploadImage}
                    </Button>
                  </div>
                </div>

                {/* Warehouse Stock */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">
                      {FLEX_TEXT.stockByWarehouse}
                    </span>
                    <button
                      type="button"
                      className="text-primary hover:underline text-[11px] font-semibold"
                    >
                      {FLEX_TEXT.addWarehouse}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select defaultValue="Bangalore">
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder={FLEX_TEXT.bangalore4} />
                      </SelectTrigger>
                      <SelectContent>
                        {(masterData?.warehouses ?? []).map((option) => (
                          <SelectItem key={option.id} value={String(option.id)}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      defaultValue={0}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                {/* QR Code section */}
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border/60 text-[11px] text-muted-foreground">
                  {
                    FLEX_TEXT.productQrCodeCompleteCategorySelectionsToGenerateTheQrCode
                  }
                </div>
              </div>

              <DialogFooter className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCloseAddInventory}
                >
                  {FLEX_TEXT.cancel}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4"
                >
                  {FLEX_TEXT.addInventory}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!vendorToConfirm}
          onOpenChange={(open) => {
            if (!open && !confirmAvailabilityMutation.isPending) {
              setVendorToConfirm(null);
            }
          }}
        >
          <DialogContent className="max-w-md rounded-lg p-6">
            {vendorToConfirm && (
              <>
                <DialogHeader>
                  <DialogTitle>Confirm Vendor</DialogTitle>
                </DialogHeader>
                <p className="py-3 text-sm leading-6 text-muted-foreground">
                  Confirm {vendorToConfirm.vendorName} for{" "}
                  {vendorToConfirm.prNumber}? All other vendors will be rejected
                  and a purchase order draft will be created.
                </p>
                <DialogFooter>
                  <Button
                    variant="outline"
                    disabled={confirmAvailabilityMutation.isPending}
                    onClick={() => setVendorToConfirm(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={confirmAvailabilityMutation.isPending}
                    onClick={() =>
                      confirmAvailabilityMutation.mutate(vendorToConfirm.id)
                    }
                  >
                    {confirmAvailabilityMutation.isPending
                      ? "Confirming..."
                      : "Confirm Vendor"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
        {/* Send Purchase Request modal */}
        <Dialog
          open={!!selectedVendorAvailability}
          onOpenChange={(open) => !open && setSelectedVendorAvailability(null)}
        >
          <DialogContent className="sm:max-w-2xl p-6">
            {selectedVendorAvailability && (
              <div className="space-y-4">
                <DialogHeader className="border-b border-border pb-2">
                  <DialogTitle className="text-lg font-bold text-foreground">
                    Send Purchase Request
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Recipient Details
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Vendor Name</Label>
                      <Input
                        value={selectedVendorAvailability.vendorName}
                        readOnly
                        className="mt-1 h-9 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">WhatsApp Number</Label>
                      <Input
                        value={selectedVendorAvailability.whatsapp}
                        readOnly
                        className="mt-1 h-9 text-xs"
                      />
                    </div>
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedVendorAvailability.lineItems.map(
                        (line, index) => (
                          <tr key={`${line.itemId || line.itemName}-${index}`}>
                            <td className="px-3 py-2">{index + 1}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{line.itemName}</div>
                              {line.description && (
                                <div className="text-muted-foreground">
                                  {line.description}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">{line.quantity}</td>
                            <td className="px-3 py-2">{line.unit}</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
                <div>
                  <Label className="text-xs">Message</Label>
                  <Textarea
                    readOnly
                    rows={7}
                    className="mt-1 text-xs"
                    value={`Hello ${selectedVendorAvailability.vendorName},\n\nPlease review our purchase request and share availability.\n\nRef: ${selectedVendorAvailability.prNumber} - ${selectedVendorAvailability.version}\n\n${selectedVendorAvailability.lineItems.map((line, index) => `${index + 1}. ${line.itemName}\nQuantity: ${line.quantity} ${line.unit}`).join("\n\n")}`}
                  />
                </div>
                <DialogFooter className="border-t border-border pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedVendorAvailability(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sendAvailabilityMutation.isPending}
                    onClick={() =>
                      sendAvailabilityMutation.mutate(
                        selectedVendorAvailability.id,
                      )
                    }
                  >
                    {sendAvailabilityMutation.isPending
                      ? "Sending..."
                      : "Save as Sent"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const digits =
                        selectedVendorAvailability.whatsapp.replace(/\D/g, "");
                      if (!digits) {
                        toast.error(
                          "WhatsApp number is not available for this vendor",
                        );
                        return;
                      }
                      const message = `Hello ${selectedVendorAvailability.vendorName},\n\nPlease review our purchase request and share availability.\n\nRef: ${selectedVendorAvailability.prNumber} - ${selectedVendorAvailability.version}\n\n${selectedVendorAvailability.lineItems.map((line, index) => `${index + 1}. ${line.itemName}\nQuantity: ${line.quantity} ${line.unit}`).join("\n\n")}`;
                      window.open(
                        `https://wa.me/${digits}?text=${encodeURIComponent(message)}`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                  >
                    Send via WhatsApp
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── VIEW / PROCESS / AUDIT LOG MODAL DIALOG ──────────────────────────── */}
        <Dialog open={!!selectedPr} onOpenChange={() => setSelectedPr(null)}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-6">
            {selectedPr && (
              <div className="space-y-4">
                <DialogHeader className="pb-2 border-b border-border">
                  <DialogTitle className="flex items-center justify-between">
                    <span className="text-lg font-bold text-foreground">
                      {selectedPr.prNumber} {FLEX_TEXT.details}
                    </span>
                    <span className="text-xs font-mono bg-muted/60 px-2 py-0.5 rounded text-muted-foreground">
                      {selectedPr.vendorId}
                    </span>
                  </DialogTitle>
                </DialogHeader>

                {/* PR Details Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs bg-muted/40 p-3.5 rounded-lg border border-border/80">
                  <div>
                    <span className="text-muted-foreground">
                      {FLEX_TEXT.itemName2}
                    </span>
                    <p className="font-semibold text-foreground text-sm">
                      {selectedPr.itemName || ""}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {FLEX_TEXT.quantity}
                    </span>
                    <p className="font-semibold text-foreground text-sm">
                      {selectedPr.quantity || 100} {selectedPr.unit || "sheets"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {FLEX_TEXT.vendor3}
                    </span>
                    <p className="font-medium text-foreground">
                      {selectedPr.vendor}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {FLEX_TEXT.requestedBy3}
                    </span>
                    <p className="font-medium text-foreground">
                      {selectedPr.requestedBy}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {FLEX_TEXT.department2}
                    </span>
                    <p className="font-medium text-foreground">
                      {selectedPr.department}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {FLEX_TEXT.currentStatus}
                    </span>
                    <p className="font-semibold text-primary">
                      {selectedPr.status}
                    </p>
                  </div>
                  {selectedPr.project && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">
                        {FLEX_TEXT.project2}
                      </span>
                      <p className="font-medium text-foreground">
                        {selectedPr.project}
                      </p>
                    </div>
                  )}
                  {selectedPr.attachmentName && (
                    <div className="col-span-2 flex items-center gap-1.5 text-primary font-medium">
                      <Paperclip className="w-3.5 h-3.5" />{" "}
                      {FLEX_TEXT.attachment} {selectedPr.attachmentName}
                    </div>
                  )}
                </div>

                {/* Audit & Version History */}
                <div className="space-y-2 pt-1 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <History className="w-3.5 h-3.5 text-primary" />{" "}
                    {FLEX_TEXT.versionAuditHistory}
                  </div>
                  <div className="bg-background border border-border rounded-lg p-2.5 space-y-1.5 text-[11px]">
                    {!selectedPr.versionLogs?.length && (
                      <div className="text-muted-foreground">
                        {FLEX_TEXT.noAuditHistoryAvailable}
                      </div>
                    )}
                    {(selectedPr.versionLogs ?? []).map((log, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between py-1 border-b border-border/40 last:border-0"
                      >
                        <span className="font-medium text-foreground">
                          {log.version}
                        </span>
                        <span className="text-muted-foreground">
                          {log.updatedBy}
                        </span>
                        <span className="text-muted-foreground">
                          {log.timestamp}
                        </span>
                        <span className="font-semibold text-primary">
                          {log.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Workflow Actions */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />{" "}
                    {FLEX_TEXT.approvalWorkflowActions}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedPr.status === "Submitted" && (
                      <>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                          onClick={() =>
                            updateMutation.mutate({
                              id: selectedPr.id,
                              status: "Approved",
                            })
                          }
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />{" "}
                          {FLEX_TEXT.approveRequest}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1.5"
                          onClick={() =>
                            updateMutation.mutate({
                              id: selectedPr.id,
                              status: "Rejected",
                            })
                          }
                        >
                          <XCircle className="w-3.5 h-3.5" />{" "}
                          {FLEX_TEXT.rejectRequest}
                        </Button>
                      </>
                    )}

                    {selectedPr.status === "Rejected" && (
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                        onClick={() =>
                          updateMutation.mutate({
                            id: selectedPr.id,
                            status: "Submitted",
                          })
                        }
                      >
                        {FLEX_TEXT.reSubmitRequest}
                      </Button>
                    )}

                    {(selectedPr.status === "Approved" ||
                      selectedPr.status === "Submitted") && (
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 font-semibold"
                        onClick={() => convertPoMutation.mutate(selectedPr.id)}
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />{" "}
                        {FLEX_TEXT.generatePurchaseOrder}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => handlePrintPR(selectedPr)}
                    >
                      <Printer className="w-3.5 h-3.5" /> {FLEX_TEXT.print}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-destructive hover:bg-destructive/10"
                      onClick={() => deleteMutation.mutate(selectedPr.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {FLEX_TEXT.delete}
                    </Button>
                  </div>
                </div>

                <DialogFooter className="pt-3 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPr(null)}
                  >
                    {FLEX_TEXT.close}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── EDIT PURCHASE REQUEST MODAL DIALOG ─────────────────────────────── */}
        <Dialog
          open={!!editingPr}
          onOpenChange={(open) => !open && setEditingPr(null)}
        >
          <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-6 bg-background rounded-2xl border border-border shadow-2xl">
            {editingPr && (
              <div className="space-y-4 text-xs">
                {/* HEADER */}
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-950/50 text-pink-600 dark:text-pink-400 flex items-center justify-center">
                      <FileText className="w-4 h-4" />
                    </div>
                    <h2 className="text-lg font-bold text-foreground">
                      {FLEX_TEXT.editPurchaseRequest}
                    </h2>
                  </div>
                </div>

                {/* REQUEST SUMMARY BOX */}
                <div className="bg-muted/40 p-4 rounded-xl border border-border/80 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                      {FLEX_TEXT.requestNumber}
                    </div>
                    <div className="text-base font-bold text-foreground font-mono">
                      {editingPr.prNumber}
                    </div>
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800">
                      {editingPr.version || "Submitted V1 · 12:37:14 pm"}
                    </div>
                  </div>
                  <div>
                    <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-300 dark:bg-amber-950/50 dark:text-amber-300">
                      {editingPr.status}
                    </span>
                  </div>
                </div>

                {/* NOTICE BANNER */}
                <div className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs px-4 py-2.5 rounded-lg border border-blue-200 dark:border-blue-900 font-medium">
                  {
                    FLEX_TEXT.savingWillCreateANewSubmittedVersionFromThisLockedRequest
                  }
                </div>

                {/* VENDOR SELECTION CARD */}
                <div className="border border-border rounded-xl p-4 space-y-3 bg-card shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground text-sm">
                      {FLEX_TEXT.vendorSelection}{" "}
                      <span className="text-red-500">*</span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold rounded-lg shadow-2xs gap-1"
                      onClick={() => {
                        setEditingPr(null);
                        setIsAddVendorOpen(true);
                      }}
                    >
                      {FLEX_TEXT.addVendor}
                    </Button>
                  </div>

                  <div>
                    <div className="text-muted-foreground font-medium mb-1 text-[11px]">
                      {FLEX_TEXT.selectVendor}
                    </div>
                    <Select
                      value={editVendorName}
                      onValueChange={(val) => {
                        setEditVendorName(val);
                        const vendor = vendorsList.find(
                          (option) => option.name === val,
                        );
                        setEditVendorsTable(
                          vendor
                            ? [
                                {
                                  name: vendor.name,
                                  whatsapp: "",
                                  phone: vendor.phone || "",
                                  email: vendor.email || "",
                                },
                              ]
                            : [],
                        );
                      }}
                    >
                      <SelectTrigger className="h-10 text-xs bg-background rounded-lg border-border">
                        <SelectValue
                          placeholder={
                            isMasterDataLoading
                              ? FLEX_TEXT.loadingVendors
                              : FLEX_TEXT.searchVendors
                          }
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

                  {/* SELECTED VENDORS TABLE */}
                  <div className="border border-border/80 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-[10px] uppercase font-bold tracking-wider text-muted-foreground text-left">
                          <th className="px-3 py-2">{FLEX_TEXT.vendorName3}</th>
                          <th className="px-3 py-2">{FLEX_TEXT.whatsapp2}</th>
                          <th className="px-3 py-2">{FLEX_TEXT.phone2}</th>
                          <th className="px-3 py-2">{FLEX_TEXT.email2}</th>
                          <th className="px-3 py-2 text-right">
                            {FLEX_TEXT.action}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {editVendorsTable.map((v, i) => (
                          <tr key={i} className="hover:bg-muted/40">
                            <td className="px-3 py-2.5 font-bold text-foreground">
                              {v.name}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground font-mono">
                              {v.whatsapp}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground font-mono">
                              {v.phone}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {v.email}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                className="text-red-500 hover:text-red-700 p-1 font-bold text-xs"
                                onClick={() =>
                                  setEditVendorsTable((prev) =>
                                    prev.filter((_, idx) => idx !== i),
                                  )
                                }
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* LINE ITEMS SECTION */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground text-sm">
                      {FLEX_TEXT.lineItems}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg shadow-2xs"
                        onClick={() => {
                          setEditingPr(null);
                          setIsAddInventoryOpen(true);
                        }}
                      >
                        {FLEX_TEXT.addToItemMaster}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:bg-primary/10 text-xs font-semibold px-2 py-1.5 rounded-lg"
                        onClick={() => {
                          setEditLineItems((prev) => [
                            ...prev,
                            {
                              id: String(Date.now()),
                              product: "",
                              description: "",
                              qty: 1,
                              unit: "",
                            },
                          ]);
                        }}
                      >
                        {FLEX_TEXT.addItem}
                      </Button>
                    </div>
                  </div>

                  <div className="border border-border/80 rounded-xl p-3 bg-muted/20 space-y-3">
                    <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-muted-foreground px-1">
                      <div className="col-span-5">{FLEX_TEXT.itemProduct}</div>
                      <div className="col-span-4">{FLEX_TEXT.description2}</div>
                      <div className="col-span-1 text-center">
                        {FLEX_TEXT.qty2}
                      </div>
                      <div className="col-span-1">{FLEX_TEXT.unit}</div>
                      <div className="col-span-1 text-right"></div>
                    </div>

                    {editLineItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-12 gap-2 items-center"
                      >
                        <div className="col-span-5">
                          <Select
                            value={String(item.itemId || "")}
                            onValueChange={(val) => {
                              const selectedItem = itemOptions.find(
                                (option) => String(option.id) === val,
                              );
                              const updated = [...editLineItems];
                              updated[idx].itemId = Number(val);
                              updated[idx].product = selectedItem?.name || "";
                              updated[idx].description =
                                selectedItem?.name || "";
                              updated[idx].unit = selectedItem?.unit || "";
                              setEditLineItems(updated);
                            }}
                          >
                            <SelectTrigger className="h-9 text-xs bg-background rounded-lg border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {itemOptions.map((option) => (
                                <SelectItem
                                  key={option.id}
                                  value={String(option.id)}
                                >
                                  {option.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-4">
                          <Input
                            value={item.description}
                            onChange={(e) => {
                              const updated = [...editLineItems];
                              updated[idx].description = e.target.value;
                              setEditLineItems(updated);
                            }}
                            className="h-9 text-xs bg-background rounded-lg border-border"
                          />
                        </div>
                        <div className="col-span-1">
                          <Input
                            type="number"
                            value={item.qty}
                            onChange={(e) => {
                              const updated = [...editLineItems];
                              updated[idx].qty = Number(e.target.value) || 1;
                              setEditLineItems(updated);
                            }}
                            className="h-9 text-xs bg-background rounded-lg border-border text-center"
                          />
                        </div>
                        <div className="col-span-1 text-muted-foreground font-medium">
                          {item.unit}
                        </div>
                        <div className="col-span-1 text-right">
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-red-500 p-1"
                            onClick={() =>
                              setEditLineItems((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3-COLUMN FORM FIELDS ROW 1 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                      {FLEX_TEXT.requestDate}
                    </Label>
                    <Input
                      type="date"
                      value={editReqDate}
                      onChange={(e) => setEditReqDate(e.target.value)}
                      className="h-9 text-xs bg-background rounded-lg border-border"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                      {FLEX_TEXT.requiredDate2}{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={editRequiredDate}
                      onChange={(e) => setEditRequiredDate(e.target.value)}
                      className="h-9 text-xs bg-background rounded-lg border-border"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                      {FLEX_TEXT.priority2}
                    </Label>
                    <Select
                      value={editPriority}
                      onValueChange={setEditPriority}
                    >
                      <SelectTrigger className="h-9 text-xs bg-background rounded-lg border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Normal">
                          {FLEX_TEXT.normal}
                        </SelectItem>
                        <SelectItem value="Urgent">
                          {FLEX_TEXT.urgent}
                        </SelectItem>
                        <SelectItem value="High">{FLEX_TEXT.high}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 3-COLUMN FORM FIELDS ROW 2 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                      {FLEX_TEXT.department3}{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={editDepartmentId}
                      onValueChange={(value) => {
                        const selectedDepartment = departmentOptions.find(
                          (option) => String(option.id) === value,
                        );
                        setEditDepartmentId(value);
                        setEditDepartment(selectedDepartment?.name || "");
                      }}
                    >
                      <SelectTrigger className="h-9 text-xs bg-background rounded-lg border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {departmentOptions.length === 0 ? (
                          <SelectItem value="__no_departments__" disabled>
                            {FLEX_TEXT.noDepartmentsAvailable}
                          </SelectItem>
                        ) : (
                          departmentOptions.map((option) => (
                            <SelectItem
                              key={option.id}
                              value={String(option.id)}
                            >
                              {option.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                      {FLEX_TEXT.requestedBy2}{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={editRequestedBy}
                      onValueChange={setEditRequestedBy}
                    >
                      <SelectTrigger className="h-9 text-xs bg-background rounded-lg border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {userOptions.map((option) => (
                          <SelectItem key={option.id} value={String(option.id)}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                      {FLEX_TEXT.project}
                    </Label>
                    <Select value={editProject} onValueChange={setEditProject}>
                      <SelectTrigger className="h-9 text-xs bg-background rounded-lg border-border">
                        <SelectValue placeholder={FLEX_TEXT.optional} />
                      </SelectTrigger>
                      <SelectContent>
                        {projectOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* NOTES */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                    {FLEX_TEXT.notes}
                  </Label>
                  <Textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={3}
                    className="text-xs bg-background rounded-lg border-border"
                  />
                </div>

                {/* FOOTER BUTTONS */}
                <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-4 text-xs font-medium rounded-lg border-border"
                    onClick={() => setEditingPr(null)}
                  >
                    {FLEX_TEXT.close}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-4 text-xs font-semibold rounded-lg border-border text-foreground hover:bg-muted"
                    onClick={() => {
                      const selectedUser = userOptions.find(
                        (user) => String(user.id) === editRequestedBy,
                      );
                      const selectedVendorRecord = vendorsList.find(
                        (vendor) => vendor.name === editVendorName,
                      );
                      updateMutation.mutate({
                        id: editingPr.id,
                        vendorName: editVendorName,
                        vendorId:
                          selectedVendorRecord?.id || editingPr.vendorId,
                        itemName:
                          editLineItems[0]?.product || editingPr.itemName,
                        quantity: editLineItems[0]?.qty || editingPr.quantity,
                        unit: editLineItems[0]?.unit || editingPr.unit,
                        departmentId: editDepartmentId ? Number(editDepartmentId) : undefined,
                        department: editDepartmentId ? editDepartment : undefined,
                        requestedByUserId: editRequestedBy ? Number(editRequestedBy) : undefined,
                        requestedByName: editRequestedBy ? selectedUser?.name || editingPr.requestedBy : undefined,
                        notes: editNotes,
                        requiredDate: editRequiredDate,
                      });
                    }}
                  >
                    {FLEX_TEXT.save}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
