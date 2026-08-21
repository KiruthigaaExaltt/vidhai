import { useState, useEffect } from "react";
import {
  useListMaterials,
  useCreateMaterial,
  getListMaterialsQueryKey,
  getListInventoryQueryKey,
  useCreateInventoryAdjustment,
  useCreateInventoryMovement,
  useListLocations,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Package,
  Layers,
  Warehouse,
  ArrowRightLeft,
  ClipboardList,
  Wrench,
  Plus,
  IndianRupee,
  AlertTriangle,
  QrCode,
  TrendingUp,
  Upload,
  Image as ImageIcon,
  Eye,
  Edit2,
  Trash2,
  X,
  FlaskConical,
} from "lucide-react";
import { CategoryDialog } from "./components/CategoryDialog";
import { WarehouseDialog } from "./components/WarehouseDialog";
import { ItemNameDialog } from "./components/ItemNameDialog";
import { AssetManagement } from "./components/AssetManagement";
import { SpawnVaultPanel } from "./spawn";
import { toast } from "sonner";
import { DataPagination } from "@/components/ui/data-pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";

// ─── helpers ────────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = false,
  wide = false,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  wide?: boolean;
}) {
  return (
    <Card
      className={`relative overflow-hidden rounded-sm border-border shadow-md ${wide ? "col-span-2 lg:col-span-1 xl:col-span-2" : ""}`}
    >
      <div
        className={`absolute top-0 left-0 w-full h-1 ${accent ? "bg-destructive" : "bg-primary"}`}
      />
      <CardContent className="flex min-w-0 items-start gap-3 p-4">
        <div
          className={`p-2 rounded-sm ${accent ? "bg-destructive/10" : "bg-primary/10"}`}
        >
          <Icon
            className={`w-5 h-5 ${accent ? "text-destructive" : "text-primary"}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            {label}
          </p>
          <p className="mt-0.5 whitespace-nowrap text-xl font-bold tabular-nums text-foreground">
            {value}
          </p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {action}
    </div>
  );
}

const NAV = [
  { id: "dashboard", icon: TrendingUp, label: "Dashboard" },
  { id: "products", icon: Package, label: "Item & Product Master" },
  { id: "warehouses", icon: Warehouse, label: "Warehouses & Stores" },
  { id: "movements", icon: ArrowRightLeft, label: "Stock Movements" },
  { id: "spawn-vault", icon: FlaskConical, label: "Spawn Vault" },
  { id: "indents", icon: ClipboardList, label: "Material Issue" },
  { id: "assets", icon: Wrench, label: "Asset Management" },
];

// ─── main component ─────────────────────────────────────────────────────────

export default function InventoryModule() {
  const queryClient = useQueryClient();
  const [section, setSection] = useState("dashboard");
  const [masterPaging, setMasterPaging] = useState<
    Record<string, { page: number; size: number }>
  >({
    inventory: { page: 1, size: 10 },
    items: { page: 1, size: 10 },
    category: { page: 1, size: 10 },
    services: { page: 1, size: 10 },
    warehouses: { page: 1, size: 10 },
    movements: { page: 1, size: 10 },
  });
  const setMasterPage = (
    key: string,
    next: Partial<{ page: number; size: number }>,
  ) =>
    setMasterPaging((current) => ({
      ...current,
      [key]: { ...current[key], ...next },
    }));

  const { data: materials } = useListMaterials();
  const { data: locations } = useListLocations();
  const inventoryMasterQuery = useQuery({
    queryKey: [
      "inventory-master-paged",
      masterPaging.inventory.page,
      masterPaging.inventory.size,
    ],
    queryFn: async () => {
      const state = masterPaging.inventory;
      const response = await fetch(
        `/api/inventory?skip=${(state.page - 1) * state.size}&limit=${state.size}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Unable to load inventory items");
      return response.json();
    },
    placeholderData: (previous) => previous,
  });
  const masterInventory: any[] = inventoryMasterQuery.data?.data ?? [];
  const invLoading =
    inventoryMasterQuery.isLoading || inventoryMasterQuery.isFetching;
  const inventoryQuery = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const response = await fetch("/api/inventory", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to load inventory");
      return response.json();
    },
  });
  const inventory: any[] = inventoryQuery.data ?? [];
  const inventoryItemOptions: any[] = Array.from(
    new Map(inventory.map((item) => [Number(item.materialId), item])).values(),
  );
  const warehouseQuery = useQuery({
    queryKey: [
      "vault-locations-paged",
      masterPaging.warehouses.page,
      masterPaging.warehouses.size,
    ],
    queryFn: async () => {
      const state = masterPaging.warehouses;
      const response = await fetch(
        `/api/vault/locations?skip=${(state.page - 1) * state.size}&limit=${state.size}`,
      );
      if (!response.ok) throw new Error("Unable to load warehouses");
      return response.json();
    },
    placeholderData: (previous) => previous,
  });
  const pagedWarehouses: any[] = warehouseQuery.data?.data ?? [];
  const movementQuery = useQuery({
    queryKey: [
      "inventory-movements-paged",
      masterPaging.movements.page,
      masterPaging.movements.size,
    ],
    queryFn: async () => {
      const state = masterPaging.movements;
      const response = await fetch(
        `/api/inventory/movements?skip=${(state.page - 1) * state.size}&limit=${state.size}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Unable to load stock movements");
      return response.json();
    },
    placeholderData: (previous) => previous,
  });
  const movements: any[] = movementQuery.data?.data ?? [];
  const movLoading = movementQuery.isLoading || movementQuery.isFetching;

  const refreshMaterials = () => {
    queryClient.invalidateQueries({ queryKey: getListMaterialsQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
    queryClient.invalidateQueries({
      queryKey: ["get", "/api/flex/master-data"],
    });
    queryClient.invalidateQueries({ queryKey: ["inventory-master-paged"] });
  };

  // ── mutations ──
  const createMaterial = useCreateMaterial({
    mutation: {
      onSuccess: () => {
        refreshMaterials();
        queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
        setAddProductOpen(false);
        setProductForm(EMPTY_PRODUCT);
        toast.success("Item added to catalog");
      },
      onError: (error: any) => {
        toast.error(
          error?.data?.error ||
            error?.message ||
            "Failed to add inventory item",
        );
      },
    },
  });
  const createAdjustment = useCreateInventoryAdjustment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-master-paged"] });
        queryClient.invalidateQueries({
          queryKey: ["inventory-movements-paged"],
        });
        setMovOpen(false);
        setMovForm(EMPTY_MOV);
        toast.success("Stock movement recorded");
      },
    },
  });
  const createMovement = useCreateInventoryMovement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
        queryClient.invalidateQueries({
          queryKey: ["inventory-movements-paged"],
        });
        queryClient.invalidateQueries({ queryKey: ["inventory-master-paged"] });
        setTransferOpen(false);
        setTransferForm(EMPTY_TRANSFER);
        toast.success("Transfer recorded");
      },
    },
  });

  // ── dialogs ──
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [movOpen, setMovOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [addWarehouseOpen, setAddWarehouseOpen] = useState(false);
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [addIndentOpen, setAddIndentOpen] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);

  // ── api ──
  const servicesQuery = useQuery({
    queryKey: [
      "services-paged",
      masterPaging.services.page,
      masterPaging.services.size,
    ],
    queryFn: async () => {
      const state = masterPaging.services;
      const res = await fetch(
        `/api/services?skip=${(state.page - 1) * state.size}&limit=${state.size}`,
      );
      return res.json();
    },
    placeholderData: (previous) => previous,
  });
  const services = servicesQuery.data?.data ?? [];
  const refetchServices = servicesQuery.refetch;

  const { data: allItemNames } = useQuery({
    queryKey: ["item-names-lookup"],
    queryFn: async () => (await fetch("/api/vault/item-names")).json(),
  });
  const itemNamesQuery = useQuery({
    queryKey: [
      "item-names-paged",
      masterPaging.items.page,
      masterPaging.items.size,
    ],
    queryFn: async () => {
      const state = masterPaging.items;
      return (
        await fetch(
          `/api/vault/item-names?skip=${(state.page - 1) * state.size}&limit=${state.size}`,
        )
      ).json();
    },
    placeholderData: (previous) => previous,
  });
  const itemNames = itemNamesQuery.data?.data ?? [];

  const createService = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      refetchServices();
      setAddServiceOpen(false);
      setServiceForm(EMPTY_SERVICE);
    },
  });

  const updateService = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/services/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      refetchServices();
      setAddServiceOpen(false);
      setServiceForm(EMPTY_SERVICE);
      setEditingId(null);
      toast.success("Service updated");
    },
  });

  const deleteService = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/services/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      refetchServices();
      toast.success("Service deleted");
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories-lookup"],
    queryFn: async () => {
      const res = await fetch("/api/categories");
      return res.json();
    },
  });
  const categoriesQuery = useQuery({
    queryKey: [
      "categories-paged",
      masterPaging.category.page,
      masterPaging.category.size,
    ],
    queryFn: async () => {
      const state = masterPaging.category;
      return (
        await fetch(
          `/api/categories?skip=${(state.page - 1) * state.size}&limit=${state.size}`,
        )
      ).json();
    },
    placeholderData: (previous) => previous,
  });
  const pagedCategories = categoriesQuery.data?.data ?? [];
  const refetchCategories = async () => {
    await queryClient.invalidateQueries({ queryKey: ["categories-lookup"] });
    await categoriesQuery.refetch();
  };

  const { data: vaultLocationLookup } = useQuery({
    queryKey: ["vault-locations"],
    queryFn: async () => {
      const res = await fetch("/api/vault/locations?skip=0&limit=200");
      return res.json();
    },
  });
  const vaultLocations: any[] = vaultLocationLookup?.data ?? [];

  const deleteWarehouse = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/vault/locations/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.json().then((e) => e.error));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault-locations"] });
      queryClient.invalidateQueries({ queryKey: ["vault-locations-paged"] });
      toast.success("Warehouse deleted");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createCategory = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      refetchCategories();
      setAddCategoryOpen(false);
      setCategoryForm(EMPTY_CATEGORY);
      toast.success("Category added");
    },
  });

  const updateCategory = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/categories/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      refetchCategories();
      setAddCategoryOpen(false);
      setCategoryForm(EMPTY_CATEGORY);
      setEditingCategoryId(null);
      toast.success("Category updated");
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/categories/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      refetchCategories();
      refreshMaterials();
      toast.success("Category deleted");
    },
  });

  const updateMaterial = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/materials/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(body.error || "Failed to update inventory item");
      return body;
    },
    onSuccess: () => {
      refreshMaterials();
      queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
      setAddProductOpen(false);
      setProductForm(EMPTY_PRODUCT);
      setEditingId(null);
      toast.success("Item updated");
    },
    onError: (error: any) =>
      toast.error(error?.message || "Failed to update inventory item"),
  });

  const deleteMaterial = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/materials/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete inventory item");
      }
    },
    onSuccess: () => {
      refreshMaterials();
      toast.success("Item deleted");
    },
    onError: (error: any) =>
      toast.error(error?.message || "Failed to delete inventory item"),
  });

  const deleteItemName = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/vault/item-names/${id}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to delete item name");
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["item-names-lookup"] });
      queryClient.invalidateQueries({ queryKey: ["item-names-paged"] });
      toast.success("Item name deleted");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to delete item name");
    },
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{
    id: number;
    type: "material" | "service" | "category" | "warehouse" | "item-name";
  } | null>(null);

  const EMPTY_CATEGORY = { name: "", categoryCode: "", divisions: [] };
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState<any>(EMPTY_CATEGORY);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(
    null,
  );

  const [addItemNameOpen, setAddItemNameOpen] = useState(false);
  const [itemNameForm, setItemNameForm] = useState<any>({
    name: "",
    categoryId: "",
  });

  // -- forms --
  const EMPTY_PRODUCT = {
    name: "",
    unit: "kg",
    sku: "",
    categoryId: "",
    attributeValues: {} as Record<string, string>,
    buyPricePerUnit: "",
    sellPricePerUnit: "",
    gstPercent: "",
    criticalLevel: "10",
    itemType: "Raw Material",
    hsnSac: "",
    imageUrl: "",
    warehouseStocks: [{ warehouseId: "", stock: "" }],
  };
  const EMPTY_MOV = {
    materialId: "",
    quantityDelta: "",
    type: "inward",
    reference: "",
    reason: "receipt",
    notes: "",
  };
  const EMPTY_TRANSFER = {
    materialId: "",
    fromLocationId: "",
    toLocationId: "",
    quantityKg: "",
    notes: "",
  };
  const EMPTY_WAREHOUSE = { name: "", type: "general", capacity: "" };
  const EMPTY_ASSET = { sku: "", name: "", purchaseValue: "", notes: "" };
  const EMPTY_INDENT = {
    item: "",
    requestedQty: "",
    requestedBy: "",
    department: "",
  };
  const EMPTY_SERVICE = {
    name: "",
    hsnSac: "",
    unit: "Nos",
    sellingPrice: "",
    gstPercent: "",
  };

  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [movForm, setMovForm] = useState(EMPTY_MOV);
  const [transferForm, setTransferForm] = useState(EMPTY_TRANSFER);
  const [warehouseForm, setWarehouseForm] = useState(EMPTY_WAREHOUSE);
  const [assetForm, setAssetForm] = useState(EMPTY_ASSET);
  const [indentForm, setIndentForm] = useState(EMPTY_INDENT);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE);
  const [productsSubTab, setProductsSubTab] = useState("inventory");

  const [assets, setAssets] = useState<any[]>([]);
  const [indents, setIndents] = useState<any[]>([]);

  // ── computed dashboard stats ──
  const totalItems = materials?.length ?? 0;
  const totalQOH =
    inventory?.reduce((s, i) => s + (i.quantityOnHand ?? 0), 0) ?? 0;
  const totalValue =
    inventory?.reduce(
      (s, i) => s + (i.quantityOnHand ?? 0) * (i.buyPricePerUnit ?? 0),
      0,
    ) ?? 0;
  const criticalItems =
    inventory?.filter((i) => (i.quantityOnHand ?? 0) < 10).length ?? 0;

  // ── handlers ──
  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name) {
      toast.error("Please scroll up and select an Item Name first");
      return;
    }
    if (!productForm.categoryId) {
      toast.error(
        "Please select a valid Item Name that has an associated Category",
      );
      return;
    }
    const data = {
      name: productForm.name,
      unit: productForm.unit,
      sku: productForm.sku || null,
      categoryId: productForm.categoryId
        ? Number(productForm.categoryId)
        : undefined,
      buyPricePerUnit: productForm.buyPricePerUnit
        ? Number(productForm.buyPricePerUnit)
        : null,
      sellPricePerUnit: productForm.sellPricePerUnit
        ? Number(productForm.sellPricePerUnit)
        : null,
      gstPercent: productForm.gstPercent ? Number(productForm.gstPercent) : 0,
      attributeValues: productForm.attributeValues,
      itemType: productForm.itemType,
      hsnSac: productForm.hsnSac,
      criticalLevel: productForm.criticalLevel
        ? Number(productForm.criticalLevel)
        : 10,
      imageUrl: productForm.imageUrl,
      warehouseStocks: productForm.warehouseStocks.filter(
        (ws: any) => ws.warehouseId,
      ),
      active: true,
    };
    if (editingId) {
      updateMaterial.mutate({ ...data, id: editingId });
    } else {
      createMaterial.mutate({ data: data as any });
    }
  };

  const openInventoryItem = (inv: any, readOnly: boolean) => {
    setProductForm({
      name: inv.materialName || "",
      unit: inv.unit || "kg",
      sku: inv.sku || "",
      categoryId: inv.categoryId ? String(inv.categoryId) : "",
      attributeValues: inv.attributeValues || {},
      buyPricePerUnit:
        inv.buyPricePerUnit == null ? "" : String(inv.buyPricePerUnit),
      sellPricePerUnit:
        inv.sellPricePerUnit == null ? "" : String(inv.sellPricePerUnit),
      gstPercent: String(inv.gstPercent ?? ""),
      criticalLevel:
        inv.criticalLevel == null ? "10" : String(inv.criticalLevel),
      itemType: inv.itemType || "Raw Material",
      hsnSac: inv.hsnSac || "",
      imageUrl: inv.imageUrl || "",
      warehouseStocks: (inventory ?? [])
        .filter((row) => row.materialId === inv.materialId)
        .map((row) => ({
          warehouseId: String(row.locationId || ""),
          stock: String(row.quantityOnHand ?? 0),
        })),
    });
    setEditingId(inv.materialId);
    setViewMode(readOnly);
    setAddProductOpen(true);
  };

  const handleServiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateService.mutate({ ...serviceForm, id: editingId });
    } else {
      createService.mutate(serviceForm);
    }
  };

  const handleMovSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAdjustment.mutate({
      data: {
        materialId: Number(movForm.materialId),
        locationId:
          inventoryItemOptions.find(
            (item) => Number(item.materialId) === Number(movForm.materialId),
          )?.locationId ?? null,
        quantityDelta:
          movForm.type === "outward"
            ? -Math.abs(Number(movForm.quantityDelta))
            : Math.abs(Number(movForm.quantityDelta)),
        reason: movForm.reason,
        reference: movForm.reference || null,
        notes: movForm.notes || null,
      },
    });
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMovement.mutate({
      data: {
        materialId: Number(transferForm.materialId),
        fromLocationId: transferForm.fromLocationId
          ? Number(transferForm.fromLocationId)
          : null,
        toLocationId: transferForm.toLocationId
          ? Number(transferForm.toLocationId)
          : null,
        quantityKg: Number(transferForm.quantityKg),
        notes: transferForm.notes || null,
      },
    });
  };

  // Deprecated handlers

  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    setAssets((a) => [
      ...a,
      {
        id: Date.now(),
        sku: assetForm.sku || `AST-${Date.now()}`,
        name: assetForm.name,
        purchaseValue: assetForm.purchaseValue,
        notes: assetForm.notes,
        allocated: false,
      },
    ]);
    setAssetForm(EMPTY_ASSET);
    setAddAssetOpen(false);
    toast.success("Asset registered");
  };

  const handleAddIndent = (e: React.FormEvent) => {
    e.preventDefault();
    setIndents((i) => [
      ...i,
      {
        id: Date.now(),
        item: indentForm.item,
        qty: indentForm.requestedQty,
        by: indentForm.requestedBy,
        dept: indentForm.department,
        status: "pending",
        date: new Date().toLocaleDateString(),
      },
    ]);
    setIndentForm(EMPTY_INDENT);
    setAddIndentOpen(false);
    toast.success("Material indent raised");
  };

  // SKU Generation Effect
  useEffect(() => {
    if (!productForm.categoryId) return;

    // Check if divisions are complete
    const cat = categories.find(
      (c: any) => String(c.id) === String(productForm.categoryId),
    );
    if (!cat) return;

    const divisionsComplete = (cat.divisions || []).every(
      (d: any) =>
        d.optionType === "color" || Boolean(productForm.attributeValues[d.id]),
    );

    if (!divisionsComplete) return;

    const timer = setTimeout(() => {
      fetch("/api/materials/generate-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: Number(productForm.categoryId),
          attributeValues: productForm.attributeValues,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.sku) {
            setProductForm((current) => ({ ...current, sku: data.sku }));
          }
        })
        .catch(console.error);
    }, 250);

    return () => clearTimeout(timer);
  }, [productForm.categoryId, productForm.attributeValues, categories]);

  // ── render ──
  return (
    <Shell>
      <div className="min-h-[calc(100vh-72px)] bg-muted/30 flex flex-col">
        <Tabs
          value={section}
          onValueChange={setSection}
          className="flex-1 flex flex-col"
        >
          {/* Horizontal tab bar */}
          <div className="w-full overflow-x-auto border-b bg-card px-4 sm:px-6">
            <TabsList className="flex h-auto min-w-max justify-start gap-1 rounded-none bg-transparent p-0">
              {NAV.map(({ id, icon: Icon, label }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-none border-b-2 border-transparent px-3 py-4 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary sm:px-4"
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="min-w-0 w-full flex-1 p-4 sm:p-6 md:p-8">
            {/* ── DASHBOARD ── */}
            <TabsContent
              value="dashboard"
              className="outline-none mt-0 space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold tracking-tight font-display">
                  Inventory Overview
                </h1>
              </div>
              <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
                <SummaryCard
                  icon={IndianRupee}
                  label="Total Inventory Value"
                  value={`₹${totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                  sub="based on buy price"
                  wide
                />
                <SummaryCard
                  icon={Package}
                  label="Quantity on Hand"
                  value={totalQOH.toFixed(1)}
                  sub="kg total"
                />
                <SummaryCard
                  icon={Layers}
                  label="Total Items"
                  value={totalItems}
                  sub="in catalog"
                />
                <SummaryCard
                  icon={Warehouse}
                  label="Active Warehouses"
                  value={vaultLocations.length}
                  sub="locations"
                />
                <SummaryCard
                  icon={ClipboardList}
                  label="Pending Indents"
                  value={indents.filter((i) => i.status === "pending").length}
                  sub="awaiting issue"
                />
                <SummaryCard
                  icon={AlertTriangle}
                  label="Critical Items"
                  value={criticalItems}
                  sub="low stock"
                  accent
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-sm border-border shadow-md">
                  <CardHeader className="p-5 border-b">
                    <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                      Low Stock Items
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {(inventory ?? [])
                        .filter((i) => (i.quantityOnHand ?? 0) < 50)
                        .slice(0, 6)
                        .map((i) => (
                          <div
                            key={i.id}
                            className="flex items-center justify-between px-5 py-3"
                          >
                            <div>
                              <p className="text-sm font-medium">
                                {i.materialName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {i.locationName || "Global"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold">
                                {i.quantityOnHand}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {i.unit}
                              </span>
                              {(i.quantityOnHand ?? 0) < 10 && (
                                <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                              )}
                            </div>
                          </div>
                        ))}
                      {(inventory ?? []).filter(
                        (i) => (i.quantityOnHand ?? 0) < 50,
                      ).length === 0 && (
                        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                          All items well-stocked
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-sm border-border shadow-md">
                  <CardHeader className="p-5 border-b">
                    <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                      Recent Movements
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {(movements ?? []).slice(0, 6).map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between px-5 py-3"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {m.materialName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {m.fromLocationName || "—"} →{" "}
                              {m.toLocationName || "—"}
                            </p>
                          </div>
                          <span className="font-mono text-sm font-semibold">
                            {m.quantityKg} {m.unit || "kg"}
                          </span>
                        </div>
                      ))}
                      {(movements ?? []).length === 0 && (
                        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                          No movements yet
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── ITEM & PRODUCT MASTER ── */}
            <TabsContent
              value="products"
              className="outline-none mt-0 space-y-6"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight font-display">
                    Item & Product Master
                  </h1>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <Button
                    variant="outline"
                    className="rounded-sm h-9 px-3 text-sm gap-2"
                  >
                    <Upload className="w-3.5 h-3.5" /> Import
                  </Button>
                  {productsSubTab === "inventory" && (
                    <Button
                      onClick={() => setAddProductOpen(true)}
                      className="rounded-sm h-9 px-3 text-sm gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Product
                    </Button>
                  )}
                  {productsSubTab === "items" && (
                    <Button
                      onClick={() => {
                        setItemNameForm({ name: "", categoryId: "" });
                        setEditingId(null);
                        setAddItemNameOpen(true);
                      }}
                      className="rounded-sm h-9 px-3 text-sm gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Item Name
                    </Button>
                  )}
                  {productsSubTab === "category" && (
                    <Button
                      onClick={() => {
                        setCategoryForm(EMPTY_CATEGORY);
                        setEditingCategoryId(null);
                        setAddCategoryOpen(true);
                      }}
                      className="rounded-sm h-9 px-3 text-sm gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" /> New Category
                    </Button>
                  )}
                  {/* Services are temporarily hidden from Item & Product Master. */}
                  {false && productsSubTab === "services" && (
                    <Button
                      onClick={() => setAddServiceOpen(true)}
                      className="rounded-sm h-9 px-3 text-sm gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" /> New Service
                    </Button>
                  )}
                </div>
              </div>

              <Tabs
                value={productsSubTab}
                onValueChange={setProductsSubTab}
                className="w-full"
              >
                <TabsList className="w-full justify-start rounded-sm border-b border-border bg-transparent p-0 mb-6">
                  {/* Add "services" back here when the Services submodule is needed. */}
                  {["inventory", "items", "category"].map((t) => (
                    <TabsTrigger
                      key={t}
                      value={t}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-5 pb-3 pt-2 capitalize font-medium text-sm"
                    >
                      {t === "inventory"
                        ? "Inventory"
                        : t === "items"
                          ? "Items"
                          : t === "category"
                            ? "Category"
                            : "Services"}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Inventory sub-tab */}
                <TabsContent value="inventory" className="mt-0 outline-none">
                  {false ? (
                    <div className="py-20 text-center text-sm text-muted-foreground">
                      Loading...
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-lg border bg-card">
                        <table className="w-full min-w-[980px] text-sm">
                          <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                            <tr>
                              <th className="px-4 py-3">Item</th>
                              <th className="px-4 py-3">SKU</th>
                              <th className="px-4 py-3">Category</th>
                              <th className="px-4 py-3">Warehouse</th>
                              <th className="px-4 py-3 text-right">Actual</th>
                              <th className="px-4 py-3 text-right">Reserved</th>
                              <th className="px-4 py-3 text-right">
                                Available
                              </th>
                              <th className="px-4 py-3 text-right">
                                Buy Price
                              </th>
                              <th className="px-4 py-3 text-right">
                                Sell Price
                              </th>
                              <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {masterInventory.map((inv: any) => (
                              <tr key={inv.id} className="hover:bg-muted/30">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    {inv.imageUrl ? (
                                      <img
                                        src={inv.imageUrl}
                                        alt=""
                                        className="h-10 w-10 rounded-md border object-cover"
                                      />
                                    ) : (
                                      <div className="grid h-10 w-10 place-items-center rounded-md border bg-muted">
                                        <Package className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                    )}
                                    <div>
                                      <div className="font-semibold">
                                        {inv.materialName}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {(inv as any).itemType || "Material"} ·{" "}
                                        {inv.unit}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-mono text-xs">
                                  {inv.sku || "—"}
                                </td>
                                <td className="px-4 py-3">
                                  {inv.category || "—"}
                                </td>
                                <td className="px-4 py-3 font-medium">
                                  {inv.locationName || "Unassigned"}
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold">
                                  {inv.quantityOnHand} {inv.unit}
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-semibold text-amber-700">
                                  {inv.reservedQuantity ?? 0} {inv.unit}
                                </td>
                                <td
                                  className={`px-4 py-3 text-right font-mono font-bold ${
                                    Number(
                                      inv.availableQuantity ??
                                        inv.quantityOnHand,
                                    ) < 0
                                      ? "text-destructive"
                                      : "text-emerald-700"
                                  }`}
                                >
                                  {inv.availableQuantity ?? inv.quantityOnHand}{" "}
                                  {inv.unit}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  ₹{inv.buyPricePerUnit ?? "—"}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  ₹{inv.sellPricePerUnit ?? "—"}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      title="View"
                                      onClick={() =>
                                        openInventoryItem(inv, true)
                                      }
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      title="Edit"
                                      onClick={() =>
                                        openInventoryItem(inv, false)
                                      }
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                    {!inv.isProtected && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="text-destructive"
                                        title="Delete"
                                        onClick={() => {
                                          setItemToDelete({
                                            id: inv.materialId,
                                            type: "material",
                                          });
                                          setDeleteConfirmOpen(true);
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <DataPagination
                          currentPage={masterPaging.inventory.page}
                          pageSize={masterPaging.inventory.size}
                          totalCount={Number(
                            inventoryMasterQuery.data?.totalCount || 0,
                          )}
                          totalPages={Number(
                            inventoryMasterQuery.data?.totalPages || 0,
                          )}
                          onPageChange={(page) =>
                            setMasterPage("inventory", { page })
                          }
                          onPageSizeChange={(size) =>
                            setMasterPage("inventory", { page: 1, size })
                          }
                          loading={inventoryMasterQuery.isFetching}
                        />
                        {masterInventory.length === 0 && (
                          <div className="p-16 text-center text-sm text-muted-foreground">
                            No items yet. Click "Add Item" to get started.
                          </div>
                        )}
                      </div>
                      <div className="hidden">
                        {masterInventory.map((inv) => (
                          <Card
                            key={inv.id}
                            className="rounded-sm border-border shadow-md hover:shadow-lg transition-all overflow-hidden flex flex-col group"
                          >
                            <div className="aspect-square bg-muted/30 relative flex items-center justify-center overflow-hidden border-b">
                              {inv.imageUrl ? (
                                <img
                                  src={inv.imageUrl}
                                  alt={inv.materialName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="w-10 h-10 text-muted-foreground/20" />
                              )}
                              {inv.sku && (
                                <div className="absolute top-2 right-2">
                                  <Badge className="bg-white/90 text-foreground border shadow-sm text-[10px] font-mono px-1.5 py-0.5 rounded-sm">
                                    {inv.sku}
                                  </Badge>
                                </div>
                              )}
                              {inv.category && (
                                <div className="absolute top-2 left-2">
                                  <Badge className="bg-primary/90 text-primary-foreground border-none text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm">
                                    {inv.category}
                                  </Badge>
                                </div>
                              )}
                            </div>
                            <CardContent className="p-3 flex-1 flex flex-col">
                              <h3 className="font-semibold text-sm leading-tight line-clamp-2">
                                {inv.materialName}
                              </h3>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {inv.locationName || "Global"}
                              </p>
                              <div className="mt-auto pt-3 flex items-end justify-between">
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                    QOH
                                  </p>
                                  <p className="text-lg font-mono font-bold text-foreground leading-tight">
                                    {inv.quantityOnHand}{" "}
                                    <span className="text-xs font-normal text-muted-foreground">
                                      {inv.unit}
                                    </span>
                                  </p>
                                </div>
                                {inv.qrCode && (
                                  <QrCode className="w-5 h-5 text-muted-foreground/40" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 pt-2 border-t border-border/50 mt-2">
                                <div className="flex-1">
                                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                                    Buy
                                  </p>
                                  <p className="text-xs font-mono font-semibold">
                                    ₹{inv.buyPricePerUnit ?? "—"}
                                  </p>
                                </div>
                                <div className="w-px h-5 bg-border/50" />
                                <div className="flex-1">
                                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                                    Sell
                                  </p>
                                  <p className="text-xs font-mono font-semibold">
                                    ₹{inv.sellPricePerUnit ?? "—"}
                                  </p>
                                </div>
                              </div>
                              {/* Action buttons */}
                              <div className="flex items-center gap-1 pt-2 mt-2 border-t border-border/50">
                                <button
                                  onClick={() => {
                                    setProductForm({
                                      name: inv.materialName || "",
                                      unit: inv.unit || "kg",
                                      sku: inv.sku || "",
                                      categoryId: (inv as any).categoryId
                                        ? String((inv as any).categoryId)
                                        : "",
                                      attributeValues:
                                        (inv as any).attributeValues || {},
                                      buyPricePerUnit: inv.buyPricePerUnit
                                        ? String(inv.buyPricePerUnit)
                                        : "",
                                      sellPricePerUnit: inv.sellPricePerUnit
                                        ? String(inv.sellPricePerUnit)
                                        : "",
                                      gstPercent: String(
                                        (inv as any).gstPercent ?? "",
                                      ),
                                      criticalLevel: (inv as any).criticalLevel
                                        ? String((inv as any).criticalLevel)
                                        : "10",
                                      itemType:
                                        (inv as any).itemType || "Raw Material",
                                      hsnSac: (inv as any).hsnSac || "",
                                      imageUrl: inv.imageUrl || "",
                                      warehouseStocks: (inventory ?? [])
                                        .filter(
                                          (row) =>
                                            row.materialId === inv.materialId,
                                        )
                                        .map((row) => ({
                                          warehouseId: String(
                                            row.locationId || "",
                                          ),
                                          stock: String(
                                            row.quantityOnHand ?? 0,
                                          ),
                                        })),
                                    });
                                    setEditingId(inv.materialId);
                                    setViewMode(true);
                                    setAddProductOpen(true);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1 rounded-sm hover:bg-primary/5"
                                  title="View"
                                >
                                  <Eye className="w-3.5 h-3.5" /> View
                                </button>
                                <button
                                  onClick={() => {
                                    setProductForm({
                                      name: inv.materialName || "",
                                      unit: inv.unit || "kg",
                                      sku: inv.sku || "",
                                      categoryId: (inv as any).categoryId
                                        ? String((inv as any).categoryId)
                                        : "",
                                      attributeValues:
                                        (inv as any).attributeValues || {},
                                      buyPricePerUnit: inv.buyPricePerUnit
                                        ? String(inv.buyPricePerUnit)
                                        : "",
                                      sellPricePerUnit: inv.sellPricePerUnit
                                        ? String(inv.sellPricePerUnit)
                                        : "",
                                      gstPercent: String(
                                        (inv as any).gstPercent ?? "",
                                      ),
                                      criticalLevel: (inv as any).criticalLevel
                                        ? String((inv as any).criticalLevel)
                                        : "10",
                                      itemType:
                                        (inv as any).itemType || "Raw Material",
                                      hsnSac: (inv as any).hsnSac || "",
                                      imageUrl: inv.imageUrl || "",
                                      warehouseStocks: (inventory ?? [])
                                        .filter(
                                          (row) =>
                                            row.materialId === inv.materialId,
                                        )
                                        .map((row) => ({
                                          warehouseId: String(
                                            row.locationId || "",
                                          ),
                                          stock: String(
                                            row.quantityOnHand ?? 0,
                                          ),
                                        })),
                                    });
                                    setEditingId(inv.materialId);
                                    setViewMode(false);
                                    setAddProductOpen(true);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors py-1 rounded-sm hover:bg-primary/5"
                                  title="Edit"
                                >
                                  <Edit2 className="w-3.5 h-3.5" /> Edit
                                </button>
                                {!inv.isProtected && (
                                  <button
                                    onClick={() => {
                                      setItemToDelete({
                                        id: inv.materialId,
                                        type: "material",
                                      });
                                      setDeleteConfirmOpen(true);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors py-1 rounded-sm hover:bg-destructive/5"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                  </button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        {masterInventory.length === 0 && !invLoading && (
                          <div className="col-span-full py-16 text-center text-muted-foreground">
                            <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p className="text-sm">
                              No items yet. Click "Add Item" to get started.
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* Items sub-tab */}
                <TabsContent value="items" className="mt-0 outline-none">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-muted-foreground">
                      Create and manage item names and categories
                    </p>
                  </div>
                  <Card className="rounded-sm border-border shadow-md">
                    <CardContent className="p-0">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b">
                          <tr>
                            <th className="px-4 py-3 font-semibold">
                              Item Name
                            </th>
                            <th className="px-4 py-3 font-semibold">
                              Category
                            </th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                            <th className="px-4 py-3 font-semibold text-right">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(itemNames ?? []).map((m: any) => (
                            <tr
                              key={m.id}
                              className="hover:bg-muted/30 transition-colors h-[44px]"
                            >
                              <td className="px-4 font-medium">{m.name}</td>
                              <td className="px-4 text-muted-foreground">
                                {m.category || "—"}
                              </td>
                              <td className="px-4">
                                <Badge
                                  variant={
                                    m.isActive !== false
                                      ? "default"
                                      : "secondary"
                                  }
                                  className="text-[10px]"
                                >
                                  {m.isActive !== false ? "Active" : "Inactive"}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2 text-muted-foreground">
                                  <button
                                    onClick={() => {
                                      setItemNameForm({
                                        id: m.id,
                                        name: m.name,
                                        categoryId: String(m.categoryId || ""),
                                      });
                                      setEditingId(m.id);
                                      setViewMode(false);
                                      setAddItemNameOpen(true);
                                    }}
                                    className="hover:text-primary transition-colors p-1"
                                    title="Edit Item"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setItemToDelete({
                                        id: m.id,
                                        type: "item-name" as any,
                                      });
                                      setDeleteConfirmOpen(true);
                                    }}
                                    className="hover:text-destructive transition-colors p-1"
                                    title="Delete Item"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {itemNames.length === 0 && (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-4 py-10 text-center text-muted-foreground text-sm"
                              >
                                No items found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </CardContent>
                    <DataPagination
                      currentPage={masterPaging.items.page}
                      pageSize={masterPaging.items.size}
                      totalCount={Number(itemNamesQuery.data?.totalCount || 0)}
                      totalPages={Number(itemNamesQuery.data?.totalPages || 0)}
                      onPageChange={(page) => setMasterPage("items", { page })}
                      onPageSizeChange={(size) =>
                        setMasterPage("items", { page: 1, size })
                      }
                      loading={itemNamesQuery.isFetching}
                    />
                  </Card>
                </TabsContent>

                {/* Category sub-tab */}
                <TabsContent value="category" className="mt-0 outline-none">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-muted-foreground">
                      Manage product categories
                    </p>
                  </div>
                  <Card className="rounded-sm border-border shadow-md overflow-hidden">
                    {pagedCategories.length === 0 ? (
                      <CardContent className="p-10 text-center text-sm text-muted-foreground">
                        No categories defined yet.
                      </CardContent>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                            <tr>
                              <th className="px-4 py-3 font-semibold">
                                Category Name
                              </th>
                              <th className="px-4 py-3 font-semibold">Code</th>
                              <th className="px-4 py-3 font-semibold text-center">
                                Divisions
                              </th>
                              <th className="px-4 py-3 font-semibold text-right">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {pagedCategories.map((c: any) => (
                              <tr
                                key={c.id}
                                className="hover:bg-muted/30 transition-colors"
                              >
                                <td className="px-4 py-3 font-medium">
                                  {c.name}
                                </td>
                                <td className="px-4 py-3 font-mono text-muted-foreground">
                                  {c.categoryCode || "—"}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <Badge variant="outline">
                                    {c.divisions?.length || 0}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2 text-muted-foreground">
                                    <button
                                      onClick={() => {
                                        setCategoryForm(c);
                                        setEditingCategoryId(c.id);
                                        setAddCategoryOpen(true);
                                      }}
                                      className="hover:text-primary transition-colors"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setItemToDelete({
                                          id: c.id,
                                          type: "category",
                                        });
                                        setDeleteConfirmOpen(true);
                                      }}
                                      className="hover:text-destructive transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <DataPagination
                      currentPage={masterPaging.category.page}
                      pageSize={masterPaging.category.size}
                      totalCount={Number(categoriesQuery.data?.totalCount || 0)}
                      totalPages={Number(categoriesQuery.data?.totalPages || 0)}
                      onPageChange={(page) =>
                        setMasterPage("category", { page })
                      }
                      onPageSizeChange={(size) =>
                        setMasterPage("category", { page: 1, size })
                      }
                      loading={categoriesQuery.isFetching}
                    />
                  </Card>
                </TabsContent>

                {/* Services sub-tab */}
                <TabsContent value="services" className="mt-0 outline-none">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-muted-foreground">
                      Manage billable services
                    </p>
                  </div>
                  <Card className="rounded-sm border-border shadow-md">
                    <CardContent className="p-0">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b">
                          <tr>
                            <th className="px-4 py-3 font-semibold">
                              Service Name
                            </th>
                            <th className="px-4 py-3 font-semibold">HSN/SAC</th>
                            <th className="px-4 py-3 font-semibold">GST %</th>
                            <th className="px-4 py-3 font-semibold text-right">
                              Price
                            </th>
                            <th className="px-4 py-3 font-semibold text-right">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {services.length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-4 py-10 text-center text-sm text-muted-foreground"
                              >
                                No services defined yet.
                              </td>
                            </tr>
                          ) : (
                            services.map((s: any) => (
                              <tr
                                key={s.id}
                                className="border-b last:border-0 hover:bg-muted/30"
                              >
                                <td className="px-4 py-3 font-medium text-foreground">
                                  {s.name}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {s.hsnSac || "-"}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {s.gstPercent}%
                                </td>
                                <td className="px-4 py-3 text-right">
                                  ₹{s.sellingPrice}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2 text-muted-foreground">
                                    <button
                                      onClick={() => {
                                        setServiceForm({
                                          name: s.name,
                                          hsnSac: s.hsnSac || "",
                                          unit: s.unit || "Nos",
                                          sellingPrice: s.sellingPrice || "",
                                          gstPercent: s.gstPercent || "",
                                        });
                                        setEditingId(s.id);
                                        setViewMode(true);
                                        setAddServiceOpen(true);
                                      }}
                                      className="hover:text-primary transition-colors"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setServiceForm({
                                          name: s.name,
                                          hsnSac: s.hsnSac || "",
                                          unit: s.unit || "Nos",
                                          sellingPrice: s.sellingPrice || "",
                                          gstPercent: s.gstPercent || "",
                                        });
                                        setEditingId(s.id);
                                        setViewMode(false);
                                        setAddServiceOpen(true);
                                      }}
                                      className="hover:text-primary transition-colors"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setItemToDelete({
                                          id: s.id,
                                          type: "service",
                                        });
                                        setDeleteConfirmOpen(true);
                                      }}
                                      className="hover:text-destructive transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </CardContent>
                    <DataPagination
                      currentPage={masterPaging.services.page}
                      pageSize={masterPaging.services.size}
                      totalCount={Number(servicesQuery.data?.totalCount || 0)}
                      totalPages={Number(servicesQuery.data?.totalPages || 0)}
                      onPageChange={(page) =>
                        setMasterPage("services", { page })
                      }
                      onPageSizeChange={(size) =>
                        setMasterPage("services", { page: 1, size })
                      }
                      loading={servicesQuery.isFetching}
                    />
                  </Card>
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* ── WAREHOUSES & STORES ── */}
            <TabsContent
              value="warehouses"
              className="outline-none mt-0 space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight font-display">
                    Warehouses & Stores
                  </h1>
                </div>
                <Button
                  onClick={() => setAddWarehouseOpen(true)}
                  className="rounded-sm h-9 px-3 text-sm gap-2"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Warehouse
                </Button>
              </div>
              <div className="overflow-hidden rounded-lg border bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] text-sm">
                    <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Warehouse</th>
                        <th className="px-4 py-3">Code</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Capacity</th>
                        <th className="px-4 py-3">Manager</th>
                        <th className="px-4 py-3">Flags</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pagedWarehouses.length ? (
                        pagedWarehouses.map((w: any) => (
                          <tr key={w.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 font-semibold">
                              {w.locationName}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">
                              {w.warehouseCode}
                            </td>
                            <td className="px-4 py-3 capitalize">
                              {w.locationType}
                            </td>
                            <td className="px-4 py-3">
                              {w.capacity?.$numberDecimal ?? w.capacity}{" "}
                              {w.capacityUnit}
                            </td>
                            <td className="px-4 py-3">{w.manager || "—"}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                {w.isReservedWarehouse && (
                                  <Badge variant="outline">Reserved</Badge>
                                )}
                                {w.isDefault && (
                                  <Badge variant="secondary">Default</Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    setWarehouseForm(w);
                                    setAddWarehouseOpen(true);
                                  }}
                                  aria-label={`Edit ${w.locationName}`}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                {!w.isSystem && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-destructive"
                                    onClick={() => {
                                      setItemToDelete({
                                        id: w.id,
                                        type: "warehouse",
                                      });
                                      setDeleteConfirmOpen(true);
                                    }}
                                    aria-label={`Delete ${w.locationName}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={7}
                            className="p-16 text-center text-muted-foreground"
                          >
                            No warehouses found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <DataPagination
                  currentPage={masterPaging.warehouses.page}
                  pageSize={masterPaging.warehouses.size}
                  totalCount={Number(warehouseQuery.data?.totalCount || 0)}
                  totalPages={Number(warehouseQuery.data?.totalPages || 0)}
                  onPageChange={(page) => setMasterPage("warehouses", { page })}
                  onPageSizeChange={(size) =>
                    setMasterPage("warehouses", { page: 1, size })
                  }
                  loading={warehouseQuery.isFetching}
                />
              </div>
              <div className="hidden">
                {vaultLocations.map((w: any) => (
                  <Card
                    key={w.id}
                    className="rounded-sm border-border shadow-sm"
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-base">
                            {w.locationName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                            {w.locationType}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {w.isReservedWarehouse && (
                            <Badge className="text-[10px] rounded-sm bg-purple-500/10 text-purple-600 border-purple-500/20 hover:bg-purple-500/10 hover:text-purple-600 font-medium">
                              Reserved
                            </Badge>
                          )}
                          {w.isDefault && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] rounded-sm font-medium"
                            >
                              Default
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Capacity
                          </p>
                          <p className="font-mono text-sm font-semibold mt-0.5">
                            {w.capacity?.$numberDecimal ?? w.capacity}{" "}
                            <span className="text-xs font-sans font-normal text-muted-foreground">
                              {w.capacityUnit}
                            </span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Manager
                          </p>
                          <p className="text-sm mt-0.5">{w.manager}</p>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                        <p className="text-xs text-muted-foreground font-mono">
                          {w.warehouseCode}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setWarehouseForm(w);
                              setAddWarehouseOpen(true);
                            }}
                            className="text-muted-foreground hover:text-primary transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {!w.isSystem && (
                            <button
                              onClick={() => {
                                setItemToDelete({
                                  id: w.id,
                                  type: "warehouse",
                                });
                                setDeleteConfirmOpen(true);
                              }}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* ── STOCK MOVEMENTS ── */}
            <TabsContent
              value="movements"
              className="outline-none mt-0 space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight font-display">
                    Stock Movements
                  </h1>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setTransferOpen(true)}
                    className="rounded-sm h-9 px-3 text-sm gap-2"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer
                  </Button>
                  <Button
                    onClick={() => setMovOpen(true)}
                    className="rounded-sm h-9 px-3 text-sm gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" /> New Movement
                  </Button>
                </div>
              </div>
              <Card className="rounded-sm border-border shadow-md">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Date</th>
                          <th className="px-4 py-3 font-semibold">Type</th>
                          <th className="px-4 py-3 font-semibold">Material</th>
                          <th className="px-4 py-3 font-semibold">From</th>
                          <th className="px-4 py-3 font-semibold">To</th>
                          <th className="px-4 py-3 font-semibold text-right">
                            Qty
                          </th>
                          <th className="px-4 py-3 font-semibold">Reference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {movLoading ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-4 py-12 text-center text-muted-foreground"
                            >
                              Loading...
                            </td>
                          </tr>
                        ) : (movements ?? []).length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-4 py-12 text-center text-muted-foreground"
                            >
                              No movements recorded yet.
                            </td>
                          </tr>
                        ) : (
                          movements.map((m) => (
                            <tr
                              key={m.id}
                              className="hover:bg-muted/30 transition-colors h-[44px]"
                            >
                              <td className="px-4 font-mono text-xs text-muted-foreground">
                                {new Date(m.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-4">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                                    m.fromLocationName && m.toLocationName
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : m.fromLocationName
                                        ? "bg-red-50 text-red-700 border-red-200"
                                        : "bg-green-50 text-green-700 border-green-200"
                                  }`}
                                >
                                  {m.type === "transfer"
                                    ? "Transfer"
                                    : m.type === "outward"
                                      ? "Outward"
                                      : "Inward"}
                                </span>
                              </td>
                              <td className="px-4 font-medium">
                                {m.materialName}
                              </td>
                              <td className="px-4 text-muted-foreground text-xs">
                                {m.fromLocationName || "—"}
                              </td>
                              <td className="px-4 text-muted-foreground text-xs">
                                {m.toLocationName || "—"}
                              </td>
                              <td className="px-4 text-right font-mono font-semibold">
                                {m.quantityKg} {m.unit || "kg"}
                              </td>
                              <td className="px-4 text-muted-foreground text-xs">
                                {m.reference || m.reason || "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
                <DataPagination
                  currentPage={masterPaging.movements.page}
                  pageSize={masterPaging.movements.size}
                  totalCount={Number(movementQuery.data?.totalCount || 0)}
                  totalPages={Number(movementQuery.data?.totalPages || 0)}
                  onPageChange={(page) => setMasterPage("movements", { page })}
                  onPageSizeChange={(size) =>
                    setMasterPage("movements", { page: 1, size })
                  }
                  loading={movLoading}
                />
              </Card>
            </TabsContent>

            {/* ── MATERIAL ISSUE ── */}
            <TabsContent
              value="indents"
              className="outline-none mt-0 space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight font-display">
                    Material Issue
                  </h1>
                </div>
                <Button
                  onClick={() => setAddIndentOpen(true)}
                  className="rounded-sm h-9 px-3 text-sm gap-2"
                >
                  <Plus className="w-3.5 h-3.5" /> Raise Indent
                </Button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <SectionHeading title="Pending Indents" />
                  <Card className="rounded-sm border-border shadow-md">
                    <CardContent className="p-0">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Item</th>
                            <th className="px-4 py-3 font-semibold">Qty</th>
                            <th className="px-4 py-3 font-semibold">
                              Department
                            </th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {indents
                            .filter((i) => i.status === "pending")
                            .map((i) => (
                              <tr
                                key={i.id}
                                className="hover:bg-muted/30 h-[44px]"
                              >
                                <td className="px-4 font-medium">{i.item}</td>
                                <td className="px-4 font-mono">{i.qty}</td>
                                <td className="px-4 text-muted-foreground text-xs">
                                  {i.dept}
                                </td>
                                <td className="px-4">
                                  <button
                                    onClick={() =>
                                      setIndents((prev) =>
                                        prev.map((x) =>
                                          x.id === i.id
                                            ? { ...x, status: "issued" }
                                            : x,
                                        ),
                                      )
                                    }
                                    className="text-xs text-primary hover:underline font-medium"
                                  >
                                    Issue
                                  </button>
                                </td>
                              </tr>
                            ))}
                          {indents.filter((i) => i.status === "pending")
                            .length === 0 && (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-4 py-8 text-center text-muted-foreground text-sm"
                              >
                                No pending indents
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </div>
                <div>
                  <SectionHeading title="Issued Log" />
                  <Card className="rounded-sm border-border shadow-md">
                    <CardContent className="p-0">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Item</th>
                            <th className="px-4 py-3 font-semibold">Qty</th>
                            <th className="px-4 py-3 font-semibold">
                              Requested By
                            </th>
                            <th className="px-4 py-3 font-semibold">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {indents
                            .filter((i) => i.status === "issued")
                            .map((i) => (
                              <tr
                                key={i.id}
                                className="hover:bg-muted/30 h-[44px]"
                              >
                                <td className="px-4 font-medium">{i.item}</td>
                                <td className="px-4 font-mono">{i.qty}</td>
                                <td className="px-4 text-muted-foreground text-xs">
                                  {i.by}
                                </td>
                                <td className="px-4 text-muted-foreground text-xs">
                                  {i.date}
                                </td>
                              </tr>
                            ))}
                          {indents.filter((i) => i.status === "issued")
                            .length === 0 && (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-4 py-8 text-center text-muted-foreground text-sm"
                              >
                                No issued indents yet
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="spawn-vault"
              className="outline-none mt-0 space-y-6"
            >
              <SpawnVaultPanel />
            </TabsContent>

            {/* ── ASSET MANAGEMENT ── */}
            <AssetManagement />
            <TabsContent
              value="assets-legacy"
              className="outline-none mt-0 space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight font-display">
                    Asset Management
                  </h1>
                </div>
                <Button
                  onClick={() => setAddAssetOpen(true)}
                  className="rounded-sm h-9 px-3 text-sm gap-2"
                >
                  <Plus className="w-3.5 h-3.5" /> Register Asset
                </Button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <SectionHeading title="Asset Registry" />
                  <Card className="rounded-sm border-border shadow-md">
                    <CardContent className="p-0">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b">
                          <tr>
                            <th className="px-4 py-3 font-semibold">SKU</th>
                            <th className="px-4 py-3 font-semibold">
                              Asset Name
                            </th>
                            <th className="px-4 py-3 font-semibold text-right">
                              Value
                            </th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {assets.map((a) => (
                            <tr
                              key={a.id}
                              className="hover:bg-muted/30 h-[44px]"
                            >
                              <td className="px-4 font-mono text-xs text-muted-foreground">
                                {a.sku}
                              </td>
                              <td className="px-4 font-medium">{a.name}</td>
                              <td className="px-4 text-right font-mono text-sm">
                                ₹{Number(a.purchaseValue).toLocaleString()}
                              </td>
                              <td className="px-4">
                                <Badge
                                  variant={
                                    a.allocated ? "default" : "secondary"
                                  }
                                  className="text-[10px]"
                                >
                                  {a.allocated ? "Allocated" : "Available"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                          {assets.length === 0 && (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-4 py-10 text-center text-sm text-muted-foreground"
                              >
                                No assets registered yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </div>
                <div>
                  <SectionHeading title="Allocated Assets" />
                  <Card className="rounded-sm border-border shadow-md">
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">
                      <Wrench className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p>No allocations recorded yet.</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* ── DIALOGS ── */}

      {/* Add Product */}
      <Dialog
        open={addProductOpen}
        onOpenChange={(val) => {
          setAddProductOpen(val);
          if (!val) {
            setProductForm(EMPTY_PRODUCT);
            setEditingId(null);
            setViewMode(false);
          }
        }}
      >
        <DialogContent className="max-h-[calc(100svh-1rem)] max-w-xl overflow-x-hidden overflow-y-auto rounded-sm shadow-xl sm:max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>
              {viewMode
                ? "View Item"
                : editingId
                  ? "Edit Item"
                  : "Add Inventory Item"}
            </DialogTitle>
            <DialogDescription>
              {viewMode
                ? "Item details"
                : "Fill in item details to add it to the product catalog."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddProduct} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 col-span-2">
                <Label className="text-sm font-medium text-foreground">
                  Item Name <span className="text-destructive">*</span>
                </Label>
                <Select
                  disabled={viewMode}
                  value={productForm.name}
                  onValueChange={(v) => {
                    const selectedItem = allItemNames?.find(
                      (i: any) => i.name === v,
                    );
                    setProductForm({
                      ...productForm,
                      name: v,
                      categoryId: selectedItem
                        ? String(selectedItem.categoryId)
                        : productForm.categoryId,
                      attributeValues: {},
                      sku: "",
                    });
                  }}
                >
                  <SelectTrigger className="rounded-sm h-10">
                    <SelectValue placeholder="Select an Item Name" />
                  </SelectTrigger>
                  <SelectContent>
                    {editingId &&
                      productForm.name &&
                      !(allItemNames ?? []).some(
                        (item: any) => item.name === productForm.name,
                      ) && (
                        <SelectItem
                          key={`current-${editingId}`}
                          value={productForm.name}
                        >
                          {productForm.name}
                        </SelectItem>
                      )}
                    {(allItemNames ?? []).map((item: any) => (
                      <SelectItem key={item.id} value={item.name}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  Category <span className="text-destructive">*</span>
                </Label>
                <Select
                  disabled={true}
                  value={
                    productForm.categoryId ? String(productForm.categoryId) : ""
                  }
                  onValueChange={(v) =>
                    setProductForm({
                      ...productForm,
                      categoryId: v,
                      attributeValues: {},
                      sku: "",
                    })
                  }
                >
                  <SelectTrigger className="rounded-sm h-10">
                    <SelectValue placeholder="Search or select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  Type
                </Label>
                <Select
                  disabled={viewMode}
                  value={productForm.itemType}
                  onValueChange={(v) =>
                    setProductForm({ ...productForm, itemType: v })
                  }
                >
                  <SelectTrigger className="rounded-sm h-10">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Raw Material">Raw Material</SelectItem>
                    <SelectItem value="Finished Product">
                      Finished Product
                    </SelectItem>
                    <SelectItem value="Consumable">Consumable</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {categories
                .find(
                  (c: any) => String(c.id) === String(productForm.categoryId),
                )
                ?.divisions?.map((division: any) => (
                  <div key={division.id} className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      {division.name}
                      {division.optionType !== "color" ? " *" : ""}
                    </Label>
                    <Select
                      disabled={viewMode}
                      value={productForm.attributeValues?.[division.id] || ""}
                      onValueChange={(val) =>
                        setProductForm({
                          ...productForm,
                          attributeValues: {
                            ...(productForm.attributeValues || {}),
                            [division.id]: val,
                          },
                        })
                      }
                    >
                      <SelectTrigger className="rounded-sm h-10">
                        <SelectValue placeholder={`Select ${division.name}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {division.options?.map((opt: any, idx: number) => (
                          <SelectItem key={idx} value={opt.value}>
                            <div className="flex items-center gap-2">
                              {division.optionType === "color" && opt.hex && (
                                <div
                                  className="w-3 h-3 rounded-full border border-border"
                                  style={{ backgroundColor: opt.hex }}
                                />
                              )}
                              {opt.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  Generated SKU <span className="text-destructive">*</span>
                </Label>
                <Input
                  readOnly
                  disabled={viewMode}
                  value={productForm.sku}
                  className="rounded-sm h-10 font-mono bg-muted/20"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  HSN/SAC <span className="text-destructive">*</span>
                </Label>
                <Input
                  disabled={viewMode}
                  value={productForm.hsnSac}
                  onChange={(e) =>
                    setProductForm({ ...productForm, hsnSac: e.target.value })
                  }
                  className="rounded-sm h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  Buying Price (₹) <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  disabled={viewMode}
                  step="0.01"
                  min="0"
                  value={productForm.buyPricePerUnit}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      buyPricePerUnit: e.target.value,
                    })
                  }
                  className="rounded-sm h-10 font-mono"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  Selling Price (₹) <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  disabled={viewMode}
                  step="0.01"
                  min="0"
                  value={productForm.sellPricePerUnit}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      sellPricePerUnit: e.target.value,
                    })
                  }
                  className="rounded-sm h-10 font-mono"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  GST %
                </Label>
                <Input
                  type="number"
                  disabled={viewMode}
                  step="0.1"
                  min="0"
                  max="100"
                  value={productForm.gstPercent}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      gstPercent: e.target.value,
                    })
                  }
                  className="rounded-sm h-10 font-mono"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  UOM <span className="text-destructive">*</span>
                </Label>
                <Select
                  disabled={viewMode}
                  value={productForm.unit}
                  onValueChange={(v) =>
                    setProductForm({ ...productForm, unit: v })
                  }
                >
                  <SelectTrigger className="rounded-sm h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "Nos",
                      "kg",
                      "g",
                      "L",
                      "mL",
                      "bags",
                      "units",
                      "pcs",
                      "Meter",
                      "Sheet",
                    ].map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  Critical Level
                </Label>
                <Input
                  type="number"
                  disabled={viewMode}
                  min="0"
                  value={productForm.criticalLevel}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      criticalLevel: e.target.value,
                    })
                  }
                  className="rounded-sm h-10"
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label className="text-sm font-medium text-foreground">
                  Product Image
                </Label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 border rounded-sm flex items-center justify-center bg-muted/20 text-muted-foreground overflow-hidden">
                    {productForm.imageUrl ? (
                      <img
                        src={productForm.imageUrl}
                        alt="Product"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 opacity-30" />
                    )}
                  </div>
                  <Label className="cursor-pointer border rounded-sm px-3 py-1.5 text-sm font-medium hover:bg-muted/50 inline-flex items-center justify-center h-9">
                    Upload image
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) =>
                            setProductForm({
                              ...productForm,
                              imageUrl: ev.target?.result as string,
                            });
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </Label>
                </div>
              </div>

              <div className="space-y-4 col-span-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-foreground">
                    Stock by Warehouse
                  </Label>
                  <button
                    type="button"
                    className="text-xs font-medium text-destructive hover:underline"
                    onClick={() =>
                      setProductForm({
                        ...productForm,
                        warehouseStocks: [
                          ...productForm.warehouseStocks,
                          { warehouseId: "", stock: "" },
                        ],
                      })
                    }
                  >
                    + Add Warehouse
                  </button>
                </div>
                {productForm.warehouseStocks.map((ws: any, idx: number) => (
                  <div key={idx} className="flex gap-4 items-center">
                    <Select
                      value={ws.warehouseId}
                      onValueChange={(v) => {
                        const newStocks = [...productForm.warehouseStocks];
                        newStocks[idx].warehouseId = v;
                        setProductForm({
                          ...productForm,
                          warehouseStocks: newStocks,
                        });
                      }}
                    >
                      <SelectTrigger className="w-48 rounded-sm h-10">
                        <SelectValue placeholder="Location" />
                      </SelectTrigger>
                      <SelectContent>
                        {(vaultLocations ?? []).map((l: any) => (
                          <SelectItem key={l.id} value={l.id.toString()}>
                            {l.locationName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      className="flex-1 rounded-sm h-10"
                      value={ws.stock}
                      onChange={(e) => {
                        const newStocks = [...productForm.warehouseStocks];
                        newStocks[idx].stock = e.target.value;
                        setProductForm({
                          ...productForm,
                          warehouseStocks: newStocks,
                        });
                      }}
                      placeholder="0"
                    />
                    {productForm.warehouseStocks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newStocks = productForm.warehouseStocks.filter(
                            (_: any, i: number) => i !== idx,
                          );
                          setProductForm({
                            ...productForm,
                            warehouseStocks: newStocks,
                          });
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                Product QR Code
              </Label>
              <div className="p-3 bg-muted/20 rounded border text-xs text-muted-foreground font-medium">
                {productForm.sku
                  ? `Will generate QR for ${productForm.sku}`
                  : "Complete category selections to generate the QR code."}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={createMaterial.isPending}
                className="rounded-sm px-6"
              >
                {createMaterial.isPending ? "Adding..." : "Add Inventory"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stock Movement */}
      <Dialog open={movOpen} onOpenChange={setMovOpen}>
        <DialogContent className="rounded-sm shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle>Record Stock Movement</DialogTitle>
            <DialogDescription>
              Log an inward (GRN), outward (DC), or adjustment
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMovSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Movement Type
              </Label>
              <Select
                value={movForm.type}
                onValueChange={(v) => setMovForm({ ...movForm, type: v })}
              >
                <SelectTrigger className="rounded-sm h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inward">
                    Inward (GRN — Goods Received)
                  </SelectItem>
                  <SelectItem value="outward">
                    Outward (DC — Delivery Challan)
                  </SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Item
              </Label>
              <Select
                value={movForm.materialId}
                onValueChange={(v) => setMovForm({ ...movForm, materialId: v })}
              >
                <SelectTrigger className="rounded-sm h-10">
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {inventoryItemOptions.map((item) => (
                    <SelectItem
                      key={item.materialId}
                      value={String(item.materialId)}
                    >
                      {item.materialName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Quantity
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={movForm.quantityDelta}
                  onChange={(e) =>
                    setMovForm({ ...movForm, quantityDelta: e.target.value })
                  }
                  className="rounded-sm h-10 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Reference No.
                </Label>
                <Input
                  value={movForm.reference}
                  onChange={(e) =>
                    setMovForm({ ...movForm, reference: e.target.value })
                  }
                  placeholder={
                    movForm.type === "inward"
                      ? "GRN-001"
                      : movForm.type === "outward"
                        ? "DC-001"
                        : "ADJ-001"
                  }
                  className="rounded-sm h-10 font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Notes
              </Label>
              <Input
                value={movForm.notes}
                onChange={(e) =>
                  setMovForm({ ...movForm, notes: e.target.value })
                }
                className="rounded-sm h-10"
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={createAdjustment.isPending || !movForm.materialId}
                className="w-full rounded-sm h-10"
              >
                Record Movement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="rounded-sm shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle>Stock Transfer</DialogTitle>
            <DialogDescription>
              Move inventory between warehouses
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTransferSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Item
              </Label>
              <Select
                value={transferForm.materialId}
                onValueChange={(v) =>
                  setTransferForm({ ...transferForm, materialId: v })
                }
              >
                <SelectTrigger className="rounded-sm h-10">
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {inventoryItemOptions.map((item) => (
                    <SelectItem
                      key={item.materialId}
                      value={String(item.materialId)}
                    >
                      {item.materialName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  From
                </Label>
                <Select
                  value={transferForm.fromLocationId}
                  onValueChange={(v) =>
                    setTransferForm({ ...transferForm, fromLocationId: v })
                  }
                >
                  <SelectTrigger className="rounded-sm h-10">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    {(locations ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id.toString()}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  To
                </Label>
                <Select
                  value={transferForm.toLocationId}
                  onValueChange={(v) =>
                    setTransferForm({ ...transferForm, toLocationId: v })
                  }
                >
                  <SelectTrigger className="rounded-sm h-10">
                    <SelectValue placeholder="Destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {(locations ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id.toString()}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Quantity (kg)
              </Label>
              <Input
                type="number"
                step="0.01"
                required
                value={transferForm.quantityKg}
                onChange={(e) =>
                  setTransferForm({
                    ...transferForm,
                    quantityKg: e.target.value,
                  })
                }
                className="rounded-sm h-10 font-mono"
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={createMovement.isPending || !transferForm.materialId}
                className="w-full rounded-sm h-10"
              >
                Execute Transfer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Warehouse Dialog */}
      <WarehouseDialog
        open={addWarehouseOpen}
        onOpenChange={(val) => {
          setAddWarehouseOpen(val);
          if (!val) setWarehouseForm(EMPTY_WAREHOUSE);
        }}
        formState={warehouseForm}
      />

      {/* Raise Indent */}
      <Dialog open={addIndentOpen} onOpenChange={setAddIndentOpen}>
        <DialogContent className="rounded-sm shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle>Raise Material Indent</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddIndent} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Item <span className="text-destructive">*</span>
              </Label>
              <Select
                value={indentForm.item}
                onValueChange={(v) => setIndentForm({ ...indentForm, item: v })}
              >
                <SelectTrigger className="rounded-sm h-10">
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {inventoryItemOptions.map((item) => (
                    <SelectItem key={item.materialId} value={item.materialName}>
                      {item.materialName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Requested Qty
                </Label>
                <Input
                  required
                  type="number"
                  min="0"
                  value={indentForm.requestedQty}
                  onChange={(e) =>
                    setIndentForm({
                      ...indentForm,
                      requestedQty: e.target.value,
                    })
                  }
                  className="rounded-sm h-10 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Department
                </Label>
                <Input
                  value={indentForm.department}
                  onChange={(e) =>
                    setIndentForm({ ...indentForm, department: e.target.value })
                  }
                  placeholder="e.g. Production"
                  className="rounded-sm h-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Requested By
              </Label>
              <Input
                required
                value={indentForm.requestedBy}
                onChange={(e) =>
                  setIndentForm({ ...indentForm, requestedBy: e.target.value })
                }
                placeholder="e.g. Ravi Kumar"
                className="rounded-sm h-10"
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full rounded-sm h-10">
                Submit Indent
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Asset */}
      <Dialog open={addAssetOpen} onOpenChange={setAddAssetOpen}>
        <DialogContent className="rounded-sm shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle>Register Asset</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddAsset} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Asset Name <span className="text-destructive">*</span>
              </Label>
              <Input
                required
                value={assetForm.name}
                onChange={(e) =>
                  setAssetForm({ ...assetForm, name: e.target.value })
                }
                placeholder="e.g. Autoclave Machine"
                className="rounded-sm h-10"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  SKU (auto if blank)
                </Label>
                <Input
                  value={assetForm.sku}
                  onChange={(e) =>
                    setAssetForm({ ...assetForm, sku: e.target.value })
                  }
                  placeholder="AST-001"
                  className="rounded-sm h-10 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Purchase Value (₹)
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={assetForm.purchaseValue}
                  onChange={(e) =>
                    setAssetForm({
                      ...assetForm,
                      purchaseValue: e.target.value,
                    })
                  }
                  className="rounded-sm h-10 font-mono"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded border border-border text-xs text-muted-foreground">
              <QrCode className="w-4 h-4 flex-shrink-0" />A unique QR code will
              be auto-generated for this asset.
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full rounded-sm h-10">
                Register Asset
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── ADD SERVICE DIALOG ── */}
      <Dialog
        open={addServiceOpen}
        onOpenChange={(val) => {
          setAddServiceOpen(val);
          if (!val) {
            setServiceForm(EMPTY_SERVICE);
            setEditingId(null);
            setViewMode(false);
          }
        }}
      >
        <DialogContent className="max-w-md p-0 overflow-hidden border-0 shadow-lg rounded-xl">
          <DialogHeader className="px-6 py-4 border-b border-border/50">
            <DialogTitle className="text-xl font-semibold text-slate-800">
              {viewMode
                ? "View Service"
                : editingId
                  ? "Edit Service"
                  : "Add Service"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleServiceSubmit}>
            <div className="p-6 space-y-5 bg-slate-50/50">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Service name <span className="text-destructive">*</span>
                </Label>
                <Input
                  disabled={viewMode}
                  required
                  value={serviceForm.name}
                  onChange={(e) =>
                    setServiceForm({ ...serviceForm, name: e.target.value })
                  }
                  className="h-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    HSN/SAC
                  </Label>
                  <Input
                    disabled={viewMode}
                    value={serviceForm.hsnSac}
                    onChange={(e) =>
                      setServiceForm({ ...serviceForm, hsnSac: e.target.value })
                    }
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Unit
                  </Label>
                  <Select
                    disabled={viewMode}
                    value={serviceForm.unit}
                    onValueChange={(val) =>
                      setServiceForm({ ...serviceForm, unit: val })
                    }
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Nos">Nos</SelectItem>
                      <SelectItem value="Hour">Hour</SelectItem>
                      <SelectItem value="Day">Day</SelectItem>
                      <SelectItem value="Lumpsum">Lumpsum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Enter selling price (₹)
                  </Label>
                  <Input
                    disabled={viewMode}
                    type="number"
                    step="0.01"
                    value={serviceForm.sellingPrice}
                    onChange={(e) =>
                      setServiceForm({
                        ...serviceForm,
                        sellingPrice: e.target.value,
                      })
                    }
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Enter GST %
                  </Label>
                  <Input
                    disabled={viewMode}
                    type="number"
                    step="0.1"
                    value={serviceForm.gstPercent}
                    onChange={(e) =>
                      setServiceForm({
                        ...serviceForm,
                        gstPercent: e.target.value,
                      })
                    }
                    className="h-10"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="px-6 py-4 border-t border-border/50 bg-background flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddServiceOpen(false)}
                className="px-6 rounded-md"
              >
                Close
              </Button>
              {!viewMode && (
                <Button
                  type="submit"
                  disabled={createService.isPending || updateService.isPending}
                  className="px-6 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {editingId ? "Update" : "Save"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the{" "}
              {itemToDelete?.type === "item-name"
                ? "item name"
                : (itemToDelete?.type ?? "item")}{" "}
              from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm h-10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (itemToDelete?.type === "material") {
                  deleteMaterial.mutate(itemToDelete.id);
                } else if (itemToDelete?.type === "service") {
                  deleteService.mutate(itemToDelete.id);
                } else if (itemToDelete?.type === "category") {
                  deleteCategoryMutation.mutate(itemToDelete.id);
                } else if (itemToDelete?.type === "warehouse") {
                  deleteWarehouse.mutate(itemToDelete.id);
                } else if (itemToDelete?.type === "item-name") {
                  deleteItemName.mutate(itemToDelete.id);
                }
                setDeleteConfirmOpen(false);
                setItemToDelete(null);
              }}
              className="rounded-sm h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CategoryDialog
        open={addCategoryOpen}
        onOpenChange={(val) => {
          setAddCategoryOpen(val);
          if (!val) {
            setCategoryForm(EMPTY_CATEGORY);
            setEditingCategoryId(null);
          }
        }}
        initialData={categoryForm}
        onSave={(data) => {
          if (editingCategoryId) {
            updateCategory.mutate({ ...data, id: editingCategoryId });
          } else {
            createCategory.mutate(data);
          }
        }}
        isPending={createCategory.isPending || updateCategory.isPending}
      />

      <ItemNameDialog
        open={addItemNameOpen}
        onOpenChange={setAddItemNameOpen}
        formState={itemNameForm}
        categories={categories || []}
      />
    </Shell>
  );
}
