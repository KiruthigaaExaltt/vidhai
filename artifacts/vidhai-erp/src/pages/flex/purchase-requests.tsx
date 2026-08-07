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
} from "lucide-react";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface LineItem {
  id: string;
  item: string;
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
  prNumber: string;
  version: string;
  date: string;
  status: string;
  vendorCount: number;
  vendors: { name: string; quote: string; status: string }[];
}

export interface PurchaseRequestItem {
  id: number;
  vendorId: string;
  vendor: string;
  prNumber: string;
  version: string;
  reqDate: string;
  requiredDate: string;
  priority: string;
  department: string;
  requestedBy: string;
  status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Closed" | "PO Created";
  itemName?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
  approvalNotes?: string;
  project?: string;
  attachmentName?: string;
  versionLogs?: VersionLog[];
}

const DEFAULT_PRS: PurchaseRequestItem[] = [
  {
    id: 23,
    vendorId: "CON00006",
    vendor: "Jagadeep",
    prNumber: "PR-26-27-0023",
    version: "Submitted V1 - 12:37:14 pm",
    reqDate: "07 Aug 2026",
    requiredDate: "07 Aug 2026",
    priority: "Normal",
    department: "Admin",
    requestedBy: "Aakash T",
    status: "Submitted",
    itemName: "Trapezoidal Roofing Sheet",
    quantity: 100,
    unit: "sheets",
    project: "Vidhai Factory Phase 1",
    attachmentName: "Roofing_Spec_v1.pdf",
    versionLogs: [
      { version: "Draft V1", updatedBy: "Aakash T", timestamp: "07 Aug 2026 12:30 pm", status: "Draft" },
      { version: "Submitted V1", updatedBy: "Aakash T", timestamp: "07 Aug 2026 12:37 pm", status: "Submitted" },
    ],
  },
  {
    id: 17,
    vendorId: "CON00006",
    vendor: "Jagadeep",
    prNumber: "PR-26-27-0017",
    version: "Submitted V1 - 12:37:14 pm",
    reqDate: "07 Aug 2026",
    requiredDate: "07 Aug 2026",
    priority: "Normal",
    department: "Admin",
    requestedBy: "Aakash T",
    status: "Submitted",
    itemName: "Trapezoidal Roofing Sheet",
    quantity: 100,
    unit: "sheets",
    project: "Vidhai Factory Phase 1",
  },
  {
    id: 12,
    vendorId: "CON00005",
    vendor: "Nish",
    prNumber: "PR-26-27-0012",
    version: "Version V1 - 10:06:41 am",
    reqDate: "21 Jul 2026",
    requiredDate: "21 Jul 2026",
    priority: "Normal",
    department: "Development",
    requestedBy: "Kavin",
    status: "Closed",
    itemName: "Steel Rod 12mm",
    quantity: 50,
    unit: "kg",
  },
  {
    id: 11,
    vendorId: "CON00006",
    vendor: "Jagadeep",
    prNumber: "PR-26-27-0011",
    version: "Version V1 - 12:35:28 pm",
    reqDate: "20 Jul 2026",
    requiredDate: "20 Jul 2026",
    priority: "Normal",
    department: "Admin",
    requestedBy: "Kavin",
    status: "Closed",
    itemName: "Cement Bags",
    quantity: 200,
    unit: "bags",
  },
  {
    id: 10,
    vendorId: "CON00006",
    vendor: "Jagadeep",
    prNumber: "PR-26-27-0010",
    version: "Version V1 - 12:33:18 pm",
    reqDate: "20 Jul 2026",
    requiredDate: "20 Jul 2026",
    priority: "Normal",
    department: "Admin",
    requestedBy: "Kavin",
    status: "Closed",
    itemName: "Structural Beams",
    quantity: 15,
    unit: "units",
  },
  {
    id: 9,
    vendorId: "CON00006",
    vendor: "Jagadeep",
    prNumber: "PR-26-27-0009",
    version: "Version V1 - 04:58:34 pm",
    reqDate: "17 Jul 2026",
    requiredDate: "17 Jul 2026",
    priority: "Normal",
    department: "Admin",
    requestedBy: "Kavin",
    status: "Closed",
    itemName: "Fastener Screws",
    quantity: 500,
    unit: "pcs",
  },
  {
    id: 7,
    vendorId: "CON00006",
    vendor: "Jagadeep",
    prNumber: "PR-26-27-0007",
    version: "Submitted V1 - 04:52:07 pm",
    reqDate: "17 Jul 2026",
    requiredDate: "17 Jul 2026",
    priority: "Normal",
    department: "Engineering",
    requestedBy: "Kavin",
    status: "Submitted",
    itemName: "Safety Helmets",
    quantity: 30,
    unit: "pcs",
  },
  {
    id: 6,
    vendorId: "CON00006",
    vendor: "Jagadeep",
    prNumber: "PR-26-27-0006",
    version: "Version V1 - 01:33:53 pm",
    reqDate: "17 Jul 2026",
    requiredDate: "17 Jul 2026",
    priority: "Normal",
    department: "Admin",
    requestedBy: "Kavin",
    status: "Closed",
    itemName: "Office Supplies",
    quantity: 1,
    unit: "set",
  },
];

const DEFAULT_VENDOR_AVAILABILITY: VendorAvailabilityItem[] = [
  {
    prNumber: "PR-26-27-0017",
    version: "Submitted V1",
    date: "07 Aug 2026",
    status: "Submitted",
    vendorCount: 1,
    vendors: [{ name: "Jagadeep", quote: "₹ 55,000", status: "Available" }],
  },
  {
    prNumber: "PR-26-27-0007",
    version: "Submitted V1",
    date: "17 Jul 2026",
    status: "Submitted",
    vendorCount: 2,
    vendors: [
      { name: "Jagadeep", quote: "₹ 15,000", status: "Available" },
      { name: "Nish", quote: "₹ 14,500", status: "Quoted" },
    ],
  },
];

import { mergeVendors, addStoredVendor, mergePRs, addStoredPR } from "@/lib/flexStore";

async function fetchPurchaseRequests(): Promise<PurchaseRequestItem[]> {
  try {
    const res = await fetch(`${BASE}/api/flex/purchase-requests`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      return mergePRs(data, DEFAULT_PRS);
    }
  } catch {}
  return mergePRs([], DEFAULT_PRS);
}

async function createPurchaseRequest(payload: any) {
  const res = await fetch(`${BASE}/api/flex/purchase-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create PR");
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
  if (!res.ok) throw new Error("Failed to save vendor contact");
  return res.json();
}

async function updatePurchaseRequest({ id, ...payload }: any) {
  const res = await fetch(`${BASE}/api/flex/purchase-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update PR");
  return res.json();
}

async function deletePurchaseRequest(id: number) {
  const res = await fetch(`${BASE}/api/flex/purchase-requests/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete PR");
  return res.json();
}

async function convertPrToPo(id: number) {
  const res = await fetch(`${BASE}/api/flex/purchase-requests/${id}/convert-to-po`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to convert PR to Purchase Order");
  return res.json();
}


async function fetchVendorsList() {
  try {
    const res = await fetch(`${BASE}/api/flex/vendors`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      return mergeVendors(data);
    }
  } catch {}
  return mergeVendors([]);
}

export default function PurchaseRequestsPage() {
  const queryClient = useQueryClient();
  const { data: prs = DEFAULT_PRS, refetch, isFetching } = useQuery({
    queryKey: ["get", "/api/flex/purchase-requests"],
    queryFn: fetchPurchaseRequests,
  });

  const { data: dbVendors = [] } = useQuery({
    queryKey: ["get", "/api/flex/vendors"],
    queryFn: fetchVendorsList,
  });

  const [activeSubTab, setActiveSubTab] = useState<"requests" | "availability">("requests");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [rowsPerPage, setRowsPerPage] = useState("25");

  // Modal Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
  const [isAddInventoryOpen, setIsAddInventoryOpen] = useState(false);
  const [selectedPr, setSelectedPr] = useState<PurchaseRequestItem | null>(null);
  const [editingPr, setEditingPr] = useState<PurchaseRequestItem | null>(null);
  const [selectedVendorAvailability, setSelectedVendorAvailability] = useState<VendorAvailabilityItem | null>(null);

  // Edit PR State Fields
  const [editVendorName, setEditVendorName] = useState("Jagadeep");
  const [editVendorsTable, setEditVendorsTable] = useState<any[]>([
    { name: "Jagadeep", whatsapp: "9753124680", phone: "9753124680", email: "j@gmail.com" }
  ]);
  const [editLineItems, setEditLineItems] = useState<any[]>([
    { id: "1", product: "HP LED 1080p (MONI-HP-LED-0001) (245", description: "HP LED 1080p", qty: 1, unit: "Nos" }
  ]);
  const [editReqDate, setEditReqDate] = useState("2026-08-07");
  const [editRequiredDate, setEditRequiredDate] = useState("2026-08-07");
  const [editPriority, setEditPriority] = useState("Normal");
  const [editDepartment, setEditDepartment] = useState("Admin");
  const [editRequestedBy, setEditRequestedBy] = useState("Aakash T (UI/UX Designer) (13)");
  const [editProject, setEditProject] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Auto-generated preview PR code & Vendor Contact ID
  const nextPrNumber = `PR-26-27-00${prs.length + 1}`;
  const [nextContactId] = useState(`CON00011`);

  // Vendor list state
  const [localVendors, setLocalVendors] = useState<any[]>([]);

  const vendorsList = useMemo(() => {
    const map = new Map();
    dbVendors.forEach((v: any) => map.set(v.name.toLowerCase(), v));
    localVendors.forEach((v: any) => map.set(v.name.toLowerCase(), v));
    return Array.from(map.values());
  }, [dbVendors, localVendors]);

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
  const [invSku, setInvSku] = useState("SKU-RM-102");
  const [invHsn, setInvHsn] = useState("7210");
  const [invBuyingPrice, setInvBuyingPrice] = useState("450");
  const [invSellingPrice, setInvSellingPrice] = useState("550");
  const [invUom, setInvUom] = useState("Nos");
  const [invCriticalLevel, setInvCriticalLevel] = useState("10");

  // Form states for Create PR
  const [vendorName, setVendorName] = useState("CON00006 - Jagadeep");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", item: "Trapezoidal Roofing Sheet", description: "", qty: 1, unit: "Nos" },
  ]);
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [requiredDate, setRequiredDate] = useState(new Date().toISOString().split("T")[0]);
  const [priority, setPriority] = useState("Normal");
  const [department, setDepartment] = useState("Admin");
  const [requestedBy, setRequestedBy] = useState("Aakash T");
  const [project, setProject] = useState("Vidhai Factory Phase 1");
  const [notes, setNotes] = useState("");
  const [attachmentName, setAttachmentName] = useState<string>("");

  const createMutation = useMutation({
    mutationFn: createPurchaseRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/purchase-requests"] });
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/dashboard"] });
    },
    onError: (err: any) => {
      console.error("PR backend save log:", err);
    },
  });

  const updateMutation = useMutation({
    mutationFn: updatePurchaseRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/purchase-requests"] });
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/dashboard"] });
      toast.success("Purchase Request updated successfully");
      setSelectedPr(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update PR");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePurchaseRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/purchase-requests"] });
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/dashboard"] });
      toast.success("Purchase Request deleted");
      setSelectedPr(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete PR");
    },
  });

  const convertPoMutation = useMutation({
    mutationFn: convertPrToPo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/purchase-requests"] });
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/dashboard"] });
      toast.success("Purchase Order generated from approved PR!");
      setSelectedPr(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to generate PO");
    },
  });

  const resetForm = () => {
    setLineItems([{ id: "1", item: "Trapezoidal Roofing Sheet", description: "", qty: 1, unit: "Nos" }]);
    setNotes("");
    setVendorName("CON00006 - Jagadeep");
    setPriority("Normal");
    setDepartment("Admin");
    setRequestedBy("Aakash T");
    setProject("Vidhai Factory Phase 1");
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

  const isFormValid = useMemo(() => {
    return vendorName.trim().length > 0;
  }, [vendorName]);

  const handleAddVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vName.trim()) {
      toast.error("Please enter vendor name");
      return;
    }
    try {
      await saveVendorContact({
        name: vName.trim(),
        phone: vPhone.trim(),
        email: vEmail.trim(),
        address: vAddress.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["get", "/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/vendors"] });
    } catch {
      // Local fallback
    }
    const newVendorObj = { id: nextContactId, name: vName.trim(), phone: vPhone.trim(), address: vAddress.trim() };
    addStoredVendor(newVendorObj);
    setLocalVendors((prev) => [...prev, newVendorObj]);
    setVendorName(`${nextContactId} - ${vName.trim()}`);
    toast.success(`Saved vendor to Vendor Directory: ${vName.trim()}`);
    setIsAddVendorOpen(false);
    setIsCreateOpen(true);
    setVName("");
    setVPhone("");
    setVAddress("");
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

  const handleAddInventorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invItemName.trim()) {
      toast.error("Please enter item name");
      return;
    }
    setLineItems((prev) => [
      ...prev.filter((i) => i.item !== ""),
      { id: String(Date.now()), item: invItemName.trim(), description: `${invCategory} - SKU ${invSku}`, qty: 1, unit: invUom },
    ]);
    toast.success(`Inventory Item added: ${invItemName.trim()}`);
    setIsAddInventoryOpen(false);
    setIsCreateOpen(true);
    setInvItemName("");
  };

  const handleAddLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: String(Date.now()), item: "", description: "", qty: 1, unit: "Nos" },
    ]);
  };

  const handleRemoveLineItem = (id: string) => {
    if (lineItems.length <= 1) {
      toast.error("At least one line item is required.");
      return;
    }
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleLineItemChange = (id: string, field: keyof LineItem, value: any) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleDuplicatePR = (pr: PurchaseRequestItem) => {
    setVendorName(`${pr.vendorId} - ${pr.vendor}`);
    setLineItems([{ id: "1", item: pr.itemName || "", description: "", qty: pr.quantity || 1, unit: pr.unit || "Nos" }]);
    setPriority(pr.priority || "Normal");
    setDepartment(pr.department || "Admin");
    setRequestedBy(pr.requestedBy || "Aakash T");
    setProject(pr.project || "Vidhai Factory Phase 1");
    setNotes(pr.notes || "");
    setIsCreateOpen(true);
    toast.info(`Duplicating details from ${pr.prNumber}`);
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
          <p><strong>Vendor:</strong> ${pr.vendor} (${pr.vendorId})</p>
          <p><strong>Requested By:</strong> ${pr.requestedBy} | <strong>Department:</strong> ${pr.department}</p>
          <p><strong>Required Date:</strong> ${pr.requiredDate} | <strong>Priority:</strong> ${pr.priority}</p>
          <p><strong>Status:</strong> ${pr.status}</p>
          <table>
            <thead><tr><th>Item Name</th><th>Qty</th><th>Unit</th></tr></thead>
            <tbody><tr><td>${pr.itemName || "Roofing Sheet"}</td><td>${pr.quantity || 100}</td><td>${pr.unit || "sheets"}</td></tr></tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const filtered = useMemo(() => {
    return prs.filter((pr) => {
      const matchesVendor = selectedVendor === "All" || pr.vendor === selectedVendor;
      const matchesSearch =
        !search.trim() ||
        pr.prNumber.toLowerCase().includes(search.toLowerCase()) ||
        pr.vendor.toLowerCase().includes(search.toLowerCase()) ||
        pr.vendorId.toLowerCase().includes(search.toLowerCase()) ||
        pr.requestedBy.toLowerCase().includes(search.toLowerCase());

      const prDate = new Date(pr.reqDate).getTime();
      const matchesFromDate = !fromDate || isNaN(prDate) || prDate >= new Date(fromDate).getTime();
      const matchesToDate = !toDate || isNaN(prDate) || prDate <= new Date(toDate).getTime();

      return matchesVendor && matchesSearch && matchesFromDate && matchesToDate;
    });
  }, [prs, search, selectedVendor, fromDate, toDate]);

  const handleSubmitPR = (status: "Submitted" | "Draft") => {
    const firstItem = lineItems[0];
    const itemName = (firstItem?.item && firstItem.item.trim()) || "Trapezoidal Roofing Sheet";
    const quantity = Number(firstItem?.qty) || 100;
    const unit = firstItem?.unit || "sheets";

    const vParts = vendorName.split(" - ");
    const vId = vParts[0] || "CON00006";
    const vName = vParts[1] || vParts[0] || "Jagadeep";

    const now = new Date();
    const formattedTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    const formattedDate = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    const newPRItem: PurchaseRequestItem = {
      id: Date.now(),
      vendorId: vId,
      vendor: vName,
      prNumber: nextPrNumber,
      version: `${status} V1 - ${formattedTime}`,
      reqDate: formattedDate,
      requiredDate: requiredDate || formattedDate,
      priority: priority || "Normal",
      department: department || "Admin",
      requestedBy: requestedBy || "Aakash T",
      status: status,
      itemName,
      quantity,
      unit,
      project: project || "Vidhai Factory Phase 1",
      notes,
    };
    addStoredPR(newPRItem);
    addStoredVendor({ id: vId, name: vName });

    // Optimistically update query cache immediately
    queryClient.setQueryData(["get", "/api/flex/purchase-requests"], (oldData: any) => {
      const currentList = Array.isArray(oldData) ? oldData : DEFAULT_PRS;
      return [newPRItem, ...currentList];
    });

    const isDraft = status === "Draft";
    toast.success(isDraft ? "Purchase Request saved as Draft" : "Purchase Request submitted successfully!");
    setIsCreateOpen(false);
    resetForm();

    createMutation.mutate({
      itemName,
      quantity,
      unit,
      vendorName: vName,
      vendorId: vId,
      priority: priority || "Normal",
      department: department || "Admin",
      requestedByName: requestedBy || "Aakash T",
      project: project || "Vidhai Factory Phase 1",
      requiredDate: requiredDate || formattedDate,
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
            Purchase Requests
          </button>
          <button
            onClick={() => setActiveSubTab("availability")}
            className={`pb-2.5 transition-colors relative cursor-pointer ${
              activeSubTab === "availability"
                ? "text-primary font-bold border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Vendor Availability
          </button>
        </div>

        {activeSubTab === "requests" ? (
          <>
            {/* Title Header Row with Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Purchase Requests</h1>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => {
                    refetch();
                    toast.info("Refreshed Purchase Requests");
                  }}
                  title="Refresh Records"
                >
                  <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin text-primary" : ""}`} />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 py-2 rounded-md gap-2 shadow-xs"
                  onClick={() => setIsCreateOpen(true)}
                >
                  <Plus className="w-4 h-4" /> Create PR
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
                  placeholder="Search by Item, SKU, requester or Vendor ID (CON...)..."
                  className="pl-9 bg-background border-border text-sm rounded-md h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1 font-medium">From Date</div>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="text-xs bg-background h-9 rounded-md cursor-pointer"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1 font-medium">To Date</div>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="text-xs bg-background h-9 rounded-md cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <div className="text-[11px] text-muted-foreground mb-1 font-medium">Vendor</div>
                <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                  <SelectTrigger className="bg-background text-xs h-9 rounded-md">
                    <SelectValue placeholder="All vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All vendors</SelectItem>
                    <SelectItem value="Jagadeep">Jagadeep</SelectItem>
                    <SelectItem value="Nish">Nish</SelectItem>
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
                        <th className="px-4 py-3 font-semibold">PR NUMBER</th>
                        <th className="px-4 py-3 font-semibold">VERSION</th>
                        <th className="px-4 py-3 font-semibold">REQ DATE</th>
                        <th className="px-4 py-3 font-semibold">REQUIRED DATE</th>
                        <th className="px-4 py-3 font-semibold">PRIORITY</th>
                        <th className="px-4 py-3 font-semibold">DEPARTMENT</th>
                        <th className="px-4 py-3 font-semibold">REQUESTED BY</th>
                        <th className="px-4 py-3 font-semibold">STATUS</th>
                        <th className="px-4 py-3 font-semibold text-right">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground text-sm">
                            No purchase requests found.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((pr) => (
                          <tr key={pr.id} className="hover:bg-muted/40 transition-colors">
                            <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{pr.vendorId}</td>
                            <td className="px-4 py-3 font-semibold text-foreground">{pr.vendor}</td>
                            <td className="px-4 py-3 font-bold text-foreground">{pr.prNumber}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] ${
                                pr.version.startsWith("Submitted")
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                                  : "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"
                              }`}>
                                {pr.version}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{pr.reqDate}</td>
                            <td className="px-4 py-3 text-muted-foreground">{pr.requiredDate}</td>
                            <td className="px-4 py-3 text-muted-foreground">{pr.priority}</td>
                            <td className="px-4 py-3 text-muted-foreground">{pr.department}</td>
                            <td className="px-4 py-3 font-medium text-foreground">{pr.requestedBy}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                                pr.status === "Submitted"
                                  ? "bg-amber-50 text-amber-600 border-amber-200"
                                  : pr.status === "Approved"
                                  ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                  : pr.status === "Rejected"
                                  ? "bg-red-50 text-red-600 border-red-200"
                                  : "bg-muted/70 text-muted-foreground border-border"
                              }`}>
                                {pr.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right space-x-1">
                              <button
                                onClick={() => handleDuplicatePR(pr)}
                                className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
                                title="Duplicate PR"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handlePrintPR(pr)}
                                className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
                                title="Print PR"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingPr(pr);
                                  setEditVendorName(pr.vendor || "Jagadeep");
                                  setEditVendorsTable([
                                    { name: pr.vendor || "Jagadeep", whatsapp: "9753124680", phone: "9753124680", email: "j@gmail.com" }
                                  ]);
                                  setEditLineItems([
                                    { id: "1", product: pr.itemName || "HP LED 1080p (MONI-HP-LED-0001) (245", description: pr.itemName || "HP LED 1080p", qty: pr.quantity || 1, unit: pr.unit || "Nos" }
                                  ]);
                                  setEditReqDate(pr.reqDate || "2026-08-07");
                                  setEditRequiredDate(pr.requiredDate || "2026-08-07");
                                  setEditPriority(pr.priority || "Normal");
                                  setEditDepartment(pr.department || "Admin");
                                  setEditRequestedBy(pr.requestedBy || "Aakash T (UI/UX Designer) (13)");
                                  setEditProject(pr.project || "");
                                  setEditNotes(pr.notes || "");
                                }}
                                className="text-muted-foreground hover:text-primary p-1 rounded-md transition-colors"
                                title="Edit Purchase Request"
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
                    Showing <span className="font-semibold text-foreground">1</span> to{" "}
                    <span className="font-semibold text-foreground">{filtered.length}</span> of{" "}
                    <span className="font-semibold text-foreground">{filtered.length}</span> records
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span>Rows per page:</span>
                      <Select value={rowsPerPage} onValueChange={setRowsPerPage}>
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
                      <th className="px-4 py-3.5 font-semibold">PR NUMBER</th>
                      <th className="px-4 py-3.5 font-semibold">VERSION</th>
                      <th className="px-4 py-3.5 font-semibold">DATE</th>
                      <th className="px-4 py-3.5 font-semibold">STATUS</th>
                      <th className="px-4 py-3.5 font-semibold text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {DEFAULT_VENDOR_AVAILABILITY.map((item, i) => (
                      <tr key={i} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3.5 font-bold text-foreground">{item.prNumber}</td>
                        <td className="px-4 py-3.5 text-muted-foreground font-medium">{item.version}</td>
                        <td className="px-4 py-3.5 text-muted-foreground">{item.date}</td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300">
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right space-x-2">
                          <button className="text-muted-foreground hover:text-primary p-1 rounded transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button className="text-muted-foreground hover:text-primary p-1 rounded transition-colors">
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10 rounded-md"
                            onClick={() => setSelectedVendorAvailability(item)}
                          >
                            Vendors ({item.vendorCount})
                          </Button>
                        </td>
                      </tr>
                    ))}
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
                Create Purchase Request
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 py-3">
              {/* 1. PURCHASE REQUEST NUMBER PREVIEW BOX */}
              <div className="bg-muted/40 p-3.5 rounded-lg border border-border/80">
                <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  PURCHASE REQUEST NUMBER
                </div>
                <div className="text-base font-bold text-foreground mt-0.5 font-mono">{nextPrNumber}</div>
              </div>

              {/* 2. VENDOR SELECTION */}
              <div className="border border-border/80 rounded-lg p-3.5 space-y-2.5 bg-background shadow-2xs">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground">
                    Vendor Selection <span className="text-primary">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10 font-semibold"
                    onClick={handleOpenAddVendor}
                  >
                    <UserPlus className="w-3.5 h-3.5" /> + Add Vendor
                  </Button>
                </div>
                <Select value={vendorName} onValueChange={setVendorName}>
                  <SelectTrigger className="bg-background text-xs h-9">
                    <SelectValue placeholder="Search vendors..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorsList.map((v) => (
                      <SelectItem key={v.id} value={`${v.id} - ${v.name}`}>
                        {v.id} - {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 3. LINE ITEMS SECTION */}
              <div className="border border-border/80 rounded-lg p-3.5 space-y-3 bg-background shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Line Items</span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1 font-semibold"
                      onClick={handleOpenAddInventory}
                    >
                      + Add to Item Master
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-primary border-primary/30 hover:bg-primary/10 font-semibold"
                      onClick={handleAddLineItem}
                    >
                      + Add Item
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-muted-foreground px-1">
                    <div className="col-span-4">Item / Product</div>
                    <div className="col-span-4">Description</div>
                    <div className="col-span-2">Qty</div>
                    <div className="col-span-1">Unit</div>
                    <div className="col-span-1 text-center"></div>
                  </div>

                  {lineItems.map((itemRow) => (
                    <div key={itemRow.id} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <Select
                          value={itemRow.item}
                          onValueChange={(val) => handleLineItemChange(itemRow.id, "item", val)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-background">
                            <SelectValue placeholder="Select or type product/service" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Trapezoidal Roofing Sheet">Trapezoidal Roofing Sheet</SelectItem>
                            <SelectItem value="Steel Rod 12mm">Steel Rod 12mm</SelectItem>
                            <SelectItem value="Cement Bags">Cement Bags</SelectItem>
                            <SelectItem value="Structural Beams">Structural Beams</SelectItem>
                            <SelectItem value="Fastener Screws">Fastener Screws</SelectItem>
                            <SelectItem value="Safety Helmets">Safety Helmets</SelectItem>
                            <SelectItem value="Office Supplies">Office Supplies</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-4">
                        <Input
                          placeholder="Description"
                          value={itemRow.description}
                          onChange={(e) => handleLineItemChange(itemRow.id, "description", e.target.value)}
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          value={itemRow.qty}
                          onChange={(e) => handleLineItemChange(itemRow.id, "qty", parseFloat(e.target.value) || 1)}
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                      <div className="col-span-1">
                        <Select
                          value={itemRow.unit}
                          onValueChange={(val) => handleLineItemChange(itemRow.id, "unit", val)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-background px-2">
                            <SelectValue placeholder="Nos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Nos">Nos</SelectItem>
                            <SelectItem value="kg">kg</SelectItem>
                            <SelectItem value="units">units</SelectItem>
                            <SelectItem value="sheets">sheets</SelectItem>
                            <SelectItem value="pcs">pcs</SelectItem>
                            <SelectItem value="bags">bags</SelectItem>
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
                    Request Date
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
                    Required Date <span className="text-primary">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={requiredDate}
                    onChange={(e) => setRequiredDate(e.target.value)}
                    className="h-9 text-xs bg-background cursor-pointer"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder="Normal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Normal">Normal</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 5. DEPARTMENT, REQUESTED BY & PROJECT ROW */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-foreground mb-1 block">
                    Department / Team <span className="text-primary">*</span>
                  </Label>
                  <Select value={department} onValueChange={setDepartment}>
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder="Select department..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Development">Development</SelectItem>
                      <SelectItem value="Engineering">Engineering</SelectItem>
                      <SelectItem value="Production">Production</SelectItem>
                      <SelectItem value="Sales">Sales</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-foreground mb-1 block">
                    Requested By <span className="text-primary">*</span>
                  </Label>
                  <Select value={requestedBy} onValueChange={setRequestedBy}>
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder="Select employee..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Aakash T">Aakash T</SelectItem>
                      <SelectItem value="Kavin">Kavin</SelectItem>
                      <SelectItem value="SuperAdmin">SuperAdmin</SelectItem>
                      <SelectItem value="Nishanth">Nishanth</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Project</Label>
                  <Select value={project} onValueChange={setProject}>
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder="Optional..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vidhai Factory Phase 1">Vidhai Factory Phase 1</SelectItem>
                      <SelectItem value="ERP Upgrade">ERP Upgrade</SelectItem>
                      <SelectItem value="General Procurement">General Procurement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 6. ATTACHMENT UPLOAD */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">Supporting Attachments</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    className="text-xs bg-background h-9 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setAttachmentName(file.name);
                        toast.success(`Attached ${file.name}`);
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
                <Label className="text-xs font-semibold text-muted-foreground">Notes</Label>
                <Textarea
                  placeholder="Additional notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="text-xs bg-background"
                />
              </div>
            </div>

            {/* 8. FOOTER BUTTONS */}
            <DialogFooter className="pt-3 border-t border-border flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isFormValid}
                className="border-border text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => handleSubmitPR("Draft")}
              >
                Save Draft
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!isFormValid}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 gap-1.5 shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => handleSubmitPR("Submitted")}
              >
                <Send className="w-3.5 h-3.5" /> Submit Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── 1. ADD CONTACT (ADD VENDOR) MODAL DIALOG ─────────────────────── */}
        <Dialog open={isAddVendorOpen} onOpenChange={(open) => !open && handleCloseAddVendor()}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto p-6">
            <form onSubmit={handleAddVendorSubmit}>
              <DialogHeader className="pb-2 border-b border-border">
                <DialogTitle className="text-lg font-bold text-foreground">Add Contact</DialogTitle>
                <p className="text-xs text-muted-foreground">Creates a new entry in Orbit Contact Directory.</p>
              </DialogHeader>

              <div className="space-y-3.5 py-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Contact ID</Label>
                  <Input value={nextContactId} readOnly className="h-9 text-xs bg-muted/40 font-mono" />
                </div>

                <div>
                  <Label className="text-xs text-foreground font-medium">Vendor Name *</Label>
                  <Input
                    placeholder="Enter vendor name"
                    value={vName}
                    onChange={(e) => setVName(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-foreground font-medium">Phone *</Label>
                    <Input
                      placeholder="Phone number"
                      value={vPhone}
                      onChange={(e) => setVPhone(e.target.value)}
                      className="h-9 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">WhatsApp</Label>
                    <Input
                      placeholder="WhatsApp number"
                      value={vWhatsapp}
                      onChange={(e) => setVWhatsapp(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input
                    type="email"
                    placeholder="Email address"
                    value={vEmail}
                    onChange={(e) => setVEmail(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs text-foreground font-medium">Address *</Label>
                  <Textarea
                    placeholder="Vendor address"
                    value={vAddress}
                    onChange={(e) => setVAddress(e.target.value)}
                    rows={2}
                    className="text-xs"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">GST Number</Label>
                    <Input
                      placeholder="GSTIN"
                      value={vGst}
                      onChange={(e) => setVGst(e.target.value)}
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Contact Person</Label>
                    <Input
                      placeholder="Contact person name"
                      value={vPerson}
                      onChange={(e) => setVPerson(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Contact Type</Label>
                  <Select value="Vendor" disabled>
                    <SelectTrigger className="h-9 text-xs bg-muted/30">
                      <SelectValue placeholder="Vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vendor">Vendor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCloseAddVendor}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4">
                  Add Contact
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── 2. ADD INVENTORY (ADD TO ITEM MASTER) MODAL DIALOG ───────────── */}
        <Dialog open={isAddInventoryOpen} onOpenChange={(open) => !open && handleCloseAddInventory()}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <form onSubmit={handleAddInventorySubmit}>
              <DialogHeader className="pb-2 border-b border-border">
                <DialogTitle className="text-lg font-bold text-foreground">Add Inventory</DialogTitle>
              </DialogHeader>

              <div className="space-y-3.5 py-3">
                <div>
                  <Label className="text-xs text-foreground font-medium">Item Name *</Label>
                  <Input
                    placeholder="Search or select item"
                    value={invItemName}
                    onChange={(e) => setInvItemName(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-foreground font-medium">Category *</Label>
                    <Select value={invCategory} onValueChange={setInvCategory}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Search or select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Raw Material">Raw Material</SelectItem>
                        <SelectItem value="Finished Goods">Finished Goods</SelectItem>
                        <SelectItem value="Packaging">Packaging</SelectItem>
                        <SelectItem value="Hardware">Hardware</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Type</Label>
                    <Select value={invType} onValueChange={setInvType}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Raw Material" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Raw Material">Raw Material</SelectItem>
                        <SelectItem value="Consumable">Consumable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-foreground font-medium">Generated SKU *</Label>
                    <Input
                      value={invSku}
                      onChange={(e) => setInvSku(e.target.value)}
                      className="h-9 text-xs font-mono"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-foreground font-medium">HSN/SAC *</Label>
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
                    <Label className="text-xs text-foreground font-medium">Buying Price (₹) *</Label>
                    <Input
                      type="number"
                      value={invBuyingPrice}
                      onChange={(e) => setInvBuyingPrice(e.target.value)}
                      className="h-9 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-foreground font-medium">Selling Price (₹) *</Label>
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
                    <Label className="text-xs text-foreground font-medium">UOM *</Label>
                    <Select value={invUom} onValueChange={setInvUom}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Nos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Nos">Nos</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="units">units</SelectItem>
                        <SelectItem value="sheets">sheets</SelectItem>
                        <SelectItem value="pcs">pcs</SelectItem>
                        <SelectItem value="bags">bags</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Critical Level</Label>
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
                  <Label className="text-xs text-muted-foreground">Product Image</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="w-16 h-16 rounded-lg border border-dashed border-border flex items-center justify-center bg-muted/30 text-muted-foreground">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    <Button type="button" variant="outline" size="sm" className="text-xs h-8">
                      Upload image
                    </Button>
                  </div>
                </div>

                {/* Warehouse Stock */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Stock by Warehouse</span>
                    <button type="button" className="text-primary hover:underline text-[11px] font-semibold">
                      + Add Warehouse
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select defaultValue="Bangalore">
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Bangalore (4)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bangalore">Bangalore (4)</SelectItem>
                        <SelectItem value="Chennai">Chennai (2)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" defaultValue={0} className="h-9 text-xs" />
                  </div>
                </div>

                {/* QR Code section */}
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border/60 text-[11px] text-muted-foreground">
                  Product QR Code: Complete category selections to generate the QR code.
                </div>
              </div>

              <DialogFooter className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCloseAddInventory}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4">
                  Add Inventory
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── 3. VENDOR AVAILABILITY DETAILS DIALOG MODAL ────────────────── */}
        <Dialog open={!!selectedVendorAvailability} onOpenChange={() => setSelectedVendorAvailability(null)}>
          <DialogContent className="sm:max-w-md p-6">
            {selectedVendorAvailability && (
              <div className="space-y-4">
                <DialogHeader className="pb-2 border-b border-border">
                  <DialogTitle className="text-lg font-bold text-foreground">
                    Vendor Quotes for {selectedVendorAvailability.prNumber}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-2 py-2 text-xs">
                  {selectedVendorAvailability.vendors.map((v, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        <div>
                          <p className="font-bold text-foreground">{v.name}</p>
                          <p className="text-[11px] text-muted-foreground">Quote: <span className="font-semibold text-foreground">{v.quote}</span></p>
                        </div>
                      </div>
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">
                        {v.status}
                      </span>
                    </div>
                  ))}
                </div>

                <DialogFooter className="pt-3 border-t border-border">
                  <Button variant="outline" size="sm" onClick={() => setSelectedVendorAvailability(null)}>
                    Close
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
                    <span className="text-lg font-bold text-foreground">{selectedPr.prNumber} Details</span>
                    <span className="text-xs font-mono bg-muted/60 px-2 py-0.5 rounded text-muted-foreground">
                      {selectedPr.vendorId}
                    </span>
                  </DialogTitle>
                </DialogHeader>

                {/* PR Details Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs bg-muted/40 p-3.5 rounded-lg border border-border/80">
                  <div>
                    <span className="text-muted-foreground">Item Name:</span>
                    <p className="font-semibold text-foreground text-sm">{selectedPr.itemName || "Trapezoidal Roofing Sheet"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Quantity:</span>
                    <p className="font-semibold text-foreground text-sm">{selectedPr.quantity || 100} {selectedPr.unit || "sheets"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vendor:</span>
                    <p className="font-medium text-foreground">{selectedPr.vendor}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Requested By:</span>
                    <p className="font-medium text-foreground">{selectedPr.requestedBy}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Department:</span>
                    <p className="font-medium text-foreground">{selectedPr.department}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Current Status:</span>
                    <p className="font-semibold text-primary">{selectedPr.status}</p>
                  </div>
                  {selectedPr.project && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Project:</span>
                      <p className="font-medium text-foreground">{selectedPr.project}</p>
                    </div>
                  )}
                  {selectedPr.attachmentName && (
                    <div className="col-span-2 flex items-center gap-1.5 text-primary font-medium">
                      <Paperclip className="w-3.5 h-3.5" /> Attachment: {selectedPr.attachmentName}
                    </div>
                  )}
                </div>

                {/* Audit & Version History */}
                <div className="space-y-2 pt-1 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <History className="w-3.5 h-3.5 text-primary" /> Version Audit History
                  </div>
                  <div className="bg-background border border-border rounded-lg p-2.5 space-y-1.5 text-[11px]">
                    {(selectedPr.versionLogs || [
                      { version: selectedPr.version, updatedBy: selectedPr.requestedBy, timestamp: selectedPr.reqDate, status: selectedPr.status }
                    ]).map((log, idx) => (
                      <div key={idx} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                        <span className="font-medium text-foreground">{log.version}</span>
                        <span className="text-muted-foreground">{log.updatedBy}</span>
                        <span className="text-muted-foreground">{log.timestamp}</span>
                        <span className="font-semibold text-primary">{log.status}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Workflow Actions */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Approval & Workflow Actions
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedPr.status === "Submitted" && (
                      <>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                          onClick={() => updateMutation.mutate({ id: selectedPr.id, status: "Approved" })}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve Request
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1.5"
                          onClick={() => updateMutation.mutate({ id: selectedPr.id, status: "Rejected" })}
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject Request
                        </Button>
                      </>
                    )}

                    {selectedPr.status === "Rejected" && (
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                        onClick={() => updateMutation.mutate({ id: selectedPr.id, status: "Submitted" })}
                      >
                        Re-submit Request
                      </Button>
                    )}

                    {(selectedPr.status === "Approved" || selectedPr.status === "Submitted") && (
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 font-semibold"
                        onClick={() => convertPoMutation.mutate(selectedPr.id)}
                      >
                        <ShoppingCart className="w-3.5 h-3.5" /> Generate Purchase Order
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => handlePrintPR(selectedPr)}
                    >
                      <Printer className="w-3.5 h-3.5" /> Print
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-destructive hover:bg-destructive/10"
                      onClick={() => deleteMutation.mutate(selectedPr.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </Button>
                  </div>
                </div>

                <DialogFooter className="pt-3 border-t border-border">
                  <Button variant="outline" size="sm" onClick={() => setSelectedPr(null)}>
                    Close
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── EDIT PURCHASE REQUEST MODAL DIALOG ─────────────────────────────── */}
        <Dialog open={!!editingPr} onOpenChange={(open) => !open && setEditingPr(null)}>
          <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-6 bg-background rounded-2xl border border-border shadow-2xl">
            {editingPr && (
              <div className="space-y-4 text-xs">
                {/* HEADER */}
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-950/50 text-pink-600 dark:text-pink-400 flex items-center justify-center">
                      <FileText className="w-4 h-4" />
                    </div>
                    <h2 className="text-lg font-bold text-foreground">Edit Purchase Request</h2>
                  </div>
                </div>

                {/* REQUEST SUMMARY BOX */}
                <div className="bg-muted/40 p-4 rounded-xl border border-border/80 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                      REQUEST NUMBER
                    </div>
                    <div className="text-base font-bold text-foreground font-mono">{editingPr.prNumber}</div>
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
                  Saving will create a new submitted version from this locked request.
                </div>

                {/* VENDOR SELECTION CARD */}
                <div className="border border-border rounded-xl p-4 space-y-3 bg-card shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground text-sm">
                      Vendor Selection <span className="text-red-500">*</span>
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
                      + Add Vendor
                    </Button>
                  </div>

                  <div>
                    <div className="text-muted-foreground font-medium mb-1 text-[11px]">Select Vendor</div>
                    <Select
                      value={editVendorName}
                      onValueChange={(val) => {
                        setEditVendorName(val);
                        if (!editVendorsTable.some((v) => v.name === val)) {
                          setEditVendorsTable((prev) => [
                            ...prev,
                            { name: val, whatsapp: "9753124680", phone: "9753124680", email: "j@gmail.com" },
                          ]);
                        }
                      }}
                    >
                      <SelectTrigger className="h-10 text-xs bg-background rounded-lg border-border">
                        <SelectValue placeholder="Search vendors..." />
                      </SelectTrigger>
                      <SelectContent>
                        {vendorsList.map((v: any) => (
                          <SelectItem key={v.id} value={v.name}>{v.id} - {v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* SELECTED VENDORS TABLE */}
                  <div className="border border-border/80 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-[10px] uppercase font-bold tracking-wider text-muted-foreground text-left">
                          <th className="px-3 py-2">VENDOR NAME</th>
                          <th className="px-3 py-2">WHATSAPP</th>
                          <th className="px-3 py-2">PHONE</th>
                          <th className="px-3 py-2">EMAIL</th>
                          <th className="px-3 py-2 text-right">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {editVendorsTable.map((v, i) => (
                          <tr key={i} className="hover:bg-muted/40">
                            <td className="px-3 py-2.5 font-bold text-foreground">{v.name}</td>
                            <td className="px-3 py-2.5 text-muted-foreground font-mono">{v.whatsapp}</td>
                            <td className="px-3 py-2.5 text-muted-foreground font-mono">{v.phone}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{v.email}</td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                className="text-red-500 hover:text-red-700 p-1 font-bold text-xs"
                                onClick={() => setEditVendorsTable((prev) => prev.filter((_, idx) => idx !== i))}
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
                    <span className="font-bold text-foreground text-sm">Line Items</span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg shadow-2xs"
                        onClick={() => {
                          setEditingPr(null);
                          setIsAddInventoryOpen(true);
                        }}
                      >
                        + Add to Item Master
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:bg-primary/10 text-xs font-semibold px-2 py-1.5 rounded-lg"
                        onClick={() => {
                          setEditLineItems((prev) => [
                            ...prev,
                            { id: String(Date.now()), product: "Trapezoidal Roofing Sheet", description: "Standard Sheet", qty: 1, unit: "sheets" }
                          ]);
                        }}
                      >
                        + Add Item
                      </Button>
                    </div>
                  </div>

                  <div className="border border-border/80 rounded-xl p-3 bg-muted/20 space-y-3">
                    <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-muted-foreground px-1">
                      <div className="col-span-5">Item / Product</div>
                      <div className="col-span-4">Description</div>
                      <div className="col-span-1 text-center">Qty</div>
                      <div className="col-span-1">Unit</div>
                      <div className="col-span-1 text-right"></div>
                    </div>

                    {editLineItems.map((item, idx) => (
                      <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5">
                          <Select
                            value={item.product}
                            onValueChange={(val) => {
                              const updated = [...editLineItems];
                              updated[idx].product = val;
                              updated[idx].description = val;
                              setEditLineItems(updated);
                            }}
                          >
                            <SelectTrigger className="h-9 text-xs bg-background rounded-lg border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="HP LED 1080p (MONI-HP-LED-0001) (245">
                                HP LED 1080p (MONI-HP-LED-0001) (245
                              </SelectItem>
                              <SelectItem value="Trapezoidal Roofing Sheet">Trapezoidal Roofing Sheet</SelectItem>
                              <SelectItem value="Steel Rod 12mm">Steel Rod 12mm</SelectItem>
                              <SelectItem value="Cement Bags">Cement Bags</SelectItem>
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
                            onClick={() => setEditLineItems((prev) => prev.filter((_, i) => i !== idx))}
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
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">Request Date</Label>
                    <Input
                      type="date"
                      value={editReqDate}
                      onChange={(e) => setEditReqDate(e.target.value)}
                      className="h-9 text-xs bg-background rounded-lg border-border"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Required Date <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={editRequiredDate}
                      onChange={(e) => setEditRequiredDate(e.target.value)}
                      className="h-9 text-xs bg-background rounded-lg border-border"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</Label>
                    <Select value={editPriority} onValueChange={setEditPriority}>
                      <SelectTrigger className="h-9 text-xs bg-background rounded-lg border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Normal">Normal</SelectItem>
                        <SelectItem value="Urgent">Urgent</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 3-COLUMN FORM FIELDS ROW 2 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Department <span className="text-red-500">*</span>
                    </Label>
                    <Select value={editDepartment} onValueChange={setEditDepartment}>
                      <SelectTrigger className="h-9 text-xs bg-background rounded-lg border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="Production">Production</SelectItem>
                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                        <SelectItem value="Logistics">Logistics</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Requested By <span className="text-red-500">*</span>
                    </Label>
                    <Select value={editRequestedBy} onValueChange={setEditRequestedBy}>
                      <SelectTrigger className="h-9 text-xs bg-background rounded-lg border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Aakash T (UI/UX Designer) (13)">Aakash T (UI/UX Designer) (13)</SelectItem>
                        <SelectItem value="Kavin">Kavin</SelectItem>
                        <SelectItem value="Jagadeep S">Jagadeep S</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1 block">Project</Label>
                    <Select value={editProject} onValueChange={setEditProject}>
                      <SelectTrigger className="h-9 text-xs bg-background rounded-lg border-border">
                        <SelectValue placeholder="Optional..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Vidhai Factory Phase 1">Vidhai Factory Phase 1</SelectItem>
                        <SelectItem value="Ooty Solar Panel Installation">Ooty Solar Panel Installation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* NOTES */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</Label>
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
                    Close
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-4 text-xs font-semibold rounded-lg border-border text-foreground hover:bg-muted"
                    onClick={() => {
                      const updatedVersion = `Submitted V2 · ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}`;
                      const updatedPR = {
                        ...editingPr,
                        vendor: editVendorName,
                        version: updatedVersion,
                        itemName: editLineItems[0]?.product || editingPr.itemName,
                        quantity: editLineItems[0]?.qty || editingPr.quantity,
                        unit: editLineItems[0]?.unit || editingPr.unit,
                        department: editDepartment,
                        requestedBy: editRequestedBy,
                        project: editProject,
                        notes: editNotes,
                        requiredDate: editRequiredDate,
                      };
                      addStoredPR(updatedPR);
                      queryClient.setQueryData(["get", "/api/flex/purchase-requests"], (old: any) =>
                        (Array.isArray(old) ? old : []).map((p: any) => (p.id === editingPr.id ? updatedPR : p))
                      );
                      toast.success("Purchase Request updated successfully!");
                      setEditingPr(null);
                    }}
                  >
                    Save
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