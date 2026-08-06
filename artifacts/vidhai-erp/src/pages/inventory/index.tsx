import { useState } from "react";
import {
  useListInventory, useListMaterials, useCreateMaterial,
  useCreateInventoryAdjustment, useListInventoryMovements,
  useCreateInventoryMovement, useListLocations,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Package, Layers, Warehouse, ArrowRightLeft, ClipboardList,
  ShoppingBag, Wrench, Plus, IndianRupee, AlertTriangle,
  QrCode, TrendingUp, Upload, Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

// ─── helpers ────────────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, sub, accent = false }: {
  icon: any; label: string; value: string | number; sub?: string; accent?: boolean;
}) {
  return (
    <Card className="rounded-sm border-border shadow-md overflow-hidden relative">
      <div className={`absolute top-0 left-0 w-full h-1 ${accent ? "bg-destructive" : "bg-primary"}`} />
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`p-2 rounded-sm ${accent ? "bg-destructive/10" : "bg-primary/10"}`}>
          <Icon className={`w-5 h-5 ${accent ? "text-destructive" : "text-primary"}`} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
          <p className="text-2xl font-bold font-display text-foreground mt-0.5">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {action}
    </div>
  );
}

const NAV = [
  { id: "dashboard", icon: TrendingUp, label: "Dashboard" },
  { id: "products", icon: Package, label: "Item & Product Master" },
  { id: "warehouses", icon: Warehouse, label: "Warehouses & Stores" },
  { id: "movements", icon: ArrowRightLeft, label: "Stock Movements" },
  { id: "indents", icon: ClipboardList, label: "Material Issue" },
  { id: "store", icon: ShoppingBag, label: "Store Management" },
  { id: "assets", icon: Wrench, label: "Asset Management" },
];

// ─── main component ─────────────────────────────────────────────────────────

export default function InventoryModule() {
  const queryClient = useQueryClient();
  const [section, setSection] = useState("dashboard");

  const { data: inventory, isLoading: invLoading } = useListInventory();
  const { data: materials } = useListMaterials();
  const { data: movements, isLoading: movLoading } = useListInventoryMovements();
  const { data: locations } = useListLocations();

  // ── mutations ──
  const createMaterial = useCreateMaterial({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["materials"] });
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        setAddProductOpen(false);
        setProductForm(EMPTY_PRODUCT);
        toast.success("Item added to catalog");
      },
    },
  });
  const createAdjustment = useCreateInventoryAdjustment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
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
  const [addStoreIssueOpen, setAddStoreIssueOpen] = useState(false);

  // ── forms ──
  const EMPTY_PRODUCT = { name: "", unit: "kg", sku: "", category: "", buyPricePerUnit: "", sellPricePerUnit: "", criticalLevel: "", locationId: "" };
  const EMPTY_MOV = { materialId: "", quantityDelta: "", type: "inward", reference: "", reason: "receipt", notes: "" };
  const EMPTY_TRANSFER = { materialId: "", fromLocationId: "", toLocationId: "", quantityKg: "", notes: "" };
  const EMPTY_WAREHOUSE = { name: "", type: "general", capacity: "" };
  const EMPTY_ASSET = { sku: "", name: "", purchaseValue: "", notes: "" };
  const EMPTY_INDENT = { item: "", requestedQty: "", requestedBy: "", department: "" };
  const EMPTY_STORE_ISSUE = { product: "", quantity: "", fromStore: "", soldBy: "" };

  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [movForm, setMovForm] = useState(EMPTY_MOV);
  const [transferForm, setTransferForm] = useState(EMPTY_TRANSFER);
  const [warehouseForm, setWarehouseForm] = useState(EMPTY_WAREHOUSE);
  const [assetForm, setAssetForm] = useState(EMPTY_ASSET);
  const [indentForm, setIndentForm] = useState(EMPTY_INDENT);
  const [storeIssueForm, setStoreIssueForm] = useState(EMPTY_STORE_ISSUE);

  // local state for sections without dedicated backend endpoints yet
  const [warehouses, setWarehouses] = useState([
    { id: 1, name: "Annur Main Store", type: "general", capacity: "500 kg", reserved: false },
    { id: 2, name: "Ooty Cold Store", type: "cold", capacity: "200 kg", reserved: false },
    { id: 3, name: "Sales Reserved", type: "reserved", capacity: "—", reserved: true },
  ]);
  const [assets, setAssets] = useState<any[]>([]);
  const [indents, setIndents] = useState<any[]>([]);
  const [storeIssues, setStoreIssues] = useState<any[]>([]);

  // ── computed dashboard stats ──
  const totalItems = materials?.length ?? 0;
  const totalQOH = inventory?.reduce((s, i) => s + (i.quantityOnHand ?? 0), 0) ?? 0;
  const totalValue = inventory?.reduce((s, i) => s + (i.quantityOnHand ?? 0) * (i.buyPricePerUnit ?? 0), 0) ?? 0;
  const criticalItems = inventory?.filter((i) => (i.quantityOnHand ?? 0) < 10).length ?? 0;

  // ── handlers ──
  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    createMaterial.mutate({
      data: {
        name: productForm.name,
        unit: productForm.unit,
        sku: productForm.sku || null,
        category: productForm.category || undefined,
        buyPricePerUnit: productForm.buyPricePerUnit ? Number(productForm.buyPricePerUnit) : null,
        sellPricePerUnit: productForm.sellPricePerUnit ? Number(productForm.sellPricePerUnit) : null,
        active: true,
      } as any,
    });
  };

  const handleMovSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAdjustment.mutate({
      data: {
        materialId: Number(movForm.materialId),
        quantityDelta: movForm.type === "outward" ? -Math.abs(Number(movForm.quantityDelta)) : Math.abs(Number(movForm.quantityDelta)),
        reason: movForm.reason,
        notes: movForm.notes || null,
      },
    });
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMovement.mutate({
      data: {
        materialId: Number(transferForm.materialId),
        fromLocationId: transferForm.fromLocationId ? Number(transferForm.fromLocationId) : null,
        toLocationId: transferForm.toLocationId ? Number(transferForm.toLocationId) : null,
        quantityKg: Number(transferForm.quantityKg),
        notes: transferForm.notes || null,
      },
    });
  };

  const handleAddWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    setWarehouses((w) => [...w, { id: Date.now(), name: warehouseForm.name, type: warehouseForm.type, capacity: warehouseForm.capacity || "—", reserved: warehouseForm.type === "reserved" }]);
    setWarehouseForm(EMPTY_WAREHOUSE);
    setAddWarehouseOpen(false);
    toast.success("Warehouse added");
  };

  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    setAssets((a) => [...a, { id: Date.now(), sku: assetForm.sku || `AST-${Date.now()}`, name: assetForm.name, purchaseValue: assetForm.purchaseValue, notes: assetForm.notes, allocated: false }]);
    setAssetForm(EMPTY_ASSET);
    setAddAssetOpen(false);
    toast.success("Asset registered");
  };

  const handleAddIndent = (e: React.FormEvent) => {
    e.preventDefault();
    setIndents((i) => [...i, { id: Date.now(), item: indentForm.item, qty: indentForm.requestedQty, by: indentForm.requestedBy, dept: indentForm.department, status: "pending", date: new Date().toLocaleDateString() }]);
    setIndentForm(EMPTY_INDENT);
    setAddIndentOpen(false);
    toast.success("Material indent raised");
  };

  const handleAddStoreIssue = (e: React.FormEvent) => {
    e.preventDefault();
    setStoreIssues((s) => [...s, { id: Date.now(), product: storeIssueForm.product, qty: storeIssueForm.quantity, from: storeIssueForm.fromStore, by: storeIssueForm.soldBy, date: new Date().toLocaleDateString() }]);
    setStoreIssueForm(EMPTY_STORE_ISSUE);
    setAddStoreIssueOpen(false);
    toast.success("Store issue recorded");
  };

  // ── render ──
  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-[1600px] mx-auto w-full">

        <Tabs value={section} onValueChange={setSection} className="space-y-6">
          {/* Horizontal tab bar */}
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 h-auto flex-wrap gap-0 -mb-px">
            {NAV.map(({ id, icon: Icon, label }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-4 pb-3 pt-2 font-medium text-sm text-muted-foreground flex items-center gap-2 shrink-0"
              >
                <Icon className="w-4 h-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── DASHBOARD ── */}
          <TabsContent value="dashboard" className="outline-none mt-0 space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight font-display">Inventory Overview</h1>
                
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <SummaryCard icon={IndianRupee} label="Total Inventory Value" value={`₹${totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} sub="based on buy price" />
                <SummaryCard icon={Package} label="Quantity on Hand" value={totalQOH.toFixed(1)} sub="kg total" />
                <SummaryCard icon={Layers} label="Total Items" value={totalItems} sub="in catalog" />
                <SummaryCard icon={Warehouse} label="Active Warehouses" value={warehouses.length} sub="locations" />
                <SummaryCard icon={ClipboardList} label="Pending Indents" value={indents.filter((i) => i.status === "pending").length} sub="awaiting issue" />
                <SummaryCard icon={AlertTriangle} label="Critical Items" value={criticalItems} sub="low stock" accent />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-sm border-border shadow-md">
                  <CardHeader className="p-5 border-b">
                    <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Low Stock Items</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {(inventory ?? []).filter((i) => (i.quantityOnHand ?? 0) < 50).slice(0, 6).map((i) => (
                        <div key={i.id} className="flex items-center justify-between px-5 py-3">
                          <div>
                            <p className="text-sm font-medium">{i.materialName}</p>
                            <p className="text-xs text-muted-foreground">{i.locationName || "Global"}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold">{i.quantityOnHand}</span>
                            <span className="text-xs text-muted-foreground">{i.unit}</span>
                            {(i.quantityOnHand ?? 0) < 10 && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                          </div>
                        </div>
                      ))}
                      {(inventory ?? []).filter((i) => (i.quantityOnHand ?? 0) < 50).length === 0 && (
                        <div className="px-5 py-8 text-center text-sm text-muted-foreground">All items well-stocked</div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-sm border-border shadow-md">
                  <CardHeader className="p-5 border-b">
                    <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Recent Movements</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {(movements ?? []).slice(0, 6).map((m) => (
                        <div key={m.id} className="flex items-center justify-between px-5 py-3">
                          <div>
                            <p className="text-sm font-medium">{m.materialName}</p>
                            <p className="text-xs text-muted-foreground">{m.fromLocationName || "—"} → {m.toLocationName || "—"}</p>
                          </div>
                          <span className="font-mono text-sm font-semibold">{m.quantityKg} kg</span>
                        </div>
                      ))}
                      {(movements ?? []).length === 0 && (
                        <div className="px-5 py-8 text-center text-sm text-muted-foreground">No movements yet</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
          </TabsContent>

          {/* ── ITEM & PRODUCT MASTER ── */}
          <TabsContent value="products" className="outline-none mt-0 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight font-display">Item & Product Master</h1>
                  <p className="text-sm text-muted-foreground mt-1">Manage all inventory items, categories, and services</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="rounded-sm h-9 px-3 text-sm gap-2">
                    <Upload className="w-3.5 h-3.5" /> Import XLSX
                  </Button>
                  <Button onClick={() => setAddProductOpen(true)} className="rounded-sm h-9 px-3 text-sm gap-2">
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </Button>
                </div>
              </div>

              <Tabs defaultValue="inventory" className="w-full">
                <TabsList className="w-full justify-start rounded-sm border-b border-border bg-transparent p-0 mb-6">
                  {["inventory", "items", "category", "services"].map((t) => (
                    <TabsTrigger key={t} value={t} className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 pb-3 pt-2 capitalize font-medium text-sm">
                      {t === "inventory" ? "Inventory" : t === "items" ? "Items" : t === "category" ? "Category" : "Services"}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Inventory sub-tab */}
                <TabsContent value="inventory" className="mt-0 outline-none">
                  {invLoading ? (
                    <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                      {/* Add Product Card */}
                      <button
                        onClick={() => setAddProductOpen(true)}
                        className="rounded-sm border-2 border-dashed border-primary/30 hover:border-primary/60 bg-primary/5 hover:bg-primary/10 transition-colors flex flex-col items-center justify-center gap-2 aspect-[4/5] text-primary"
                      >
                        <Plus className="w-8 h-8" />
                        <span className="text-sm font-medium">Add Item</span>
                      </button>

                      {(inventory ?? []).map((inv) => (
                        <Card key={inv.id} className="rounded-sm border-border shadow-md hover:shadow-lg transition-all overflow-hidden flex flex-col group">
                          <div className="aspect-square bg-muted/30 relative flex items-center justify-center overflow-hidden border-b">
                            {inv.imageUrl ? (
                              <img src={inv.imageUrl} alt={inv.materialName} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-10 h-10 text-muted-foreground/20" />
                            )}
                            {inv.sku && (
                              <div className="absolute top-2 right-2">
                                <Badge className="bg-white/90 text-foreground border shadow-sm text-[10px] font-mono px-1.5 py-0.5 rounded-sm">{inv.sku}</Badge>
                              </div>
                            )}
                            {inv.category && (
                              <div className="absolute top-2 left-2">
                                <Badge className="bg-primary/90 text-primary-foreground border-none text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm">{inv.category}</Badge>
                              </div>
                            )}
                          </div>
                          <CardContent className="p-3 flex-1 flex flex-col">
                            <h3 className="font-semibold text-sm leading-tight line-clamp-2">{inv.materialName}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{inv.locationName || "Global"}</p>
                            <div className="mt-auto pt-3 flex items-end justify-between">
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">QOH</p>
                                <p className="text-lg font-mono font-bold text-foreground leading-tight">{inv.quantityOnHand} <span className="text-xs font-normal text-muted-foreground">{inv.unit}</span></p>
                              </div>
                              {inv.qrCode && <QrCode className="w-5 h-5 text-muted-foreground/40" />}
                            </div>
                            <div className="flex items-center gap-2 pt-2 border-t border-border/50 mt-2">
                              <div className="flex-1">
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Buy</p>
                                <p className="text-xs font-mono font-semibold">₹{inv.buyPricePerUnit ?? "—"}</p>
                              </div>
                              <div className="w-px h-5 bg-border/50" />
                              <div className="flex-1">
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Sell</p>
                                <p className="text-xs font-mono font-semibold">₹{inv.sellPricePerUnit ?? "—"}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {(inventory ?? []).length === 0 && !invLoading && (
                        <div className="col-span-full py-16 text-center text-muted-foreground">
                          <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                          <p className="text-sm">No items yet. Click "Add Item" to get started.</p>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* Items sub-tab */}
                <TabsContent value="items" className="mt-0 outline-none">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-muted-foreground">Create and manage item names and categories</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="rounded-sm gap-1.5 text-xs"><Upload className="w-3 h-3" /> Import Categories</Button>
                      <Button size="sm" onClick={() => setAddProductOpen(true)} className="rounded-sm gap-1.5 text-xs"><Plus className="w-3 h-3" /> New Item</Button>
                    </div>
                  </div>
                  <Card className="rounded-sm border-border shadow-md">
                    <CardContent className="p-0">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Item Name</th>
                            <th className="px-4 py-3 font-semibold">Category</th>
                            <th className="px-4 py-3 font-semibold">Unit</th>
                            <th className="px-4 py-3 font-semibold">SKU</th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(materials ?? []).map((m) => (
                            <tr key={m.id} className="hover:bg-muted/30 transition-colors h-[44px]">
                              <td className="px-4 font-medium">{m.name}</td>
                              <td className="px-4 text-muted-foreground">{(m as any).category || "—"}</td>
                              <td className="px-4 font-mono text-xs">{m.unit}</td>
                              <td className="px-4 font-mono text-xs text-muted-foreground">{(m as any).sku || "—"}</td>
                              <td className="px-4">
                                <Badge variant={(m as any).active !== false ? "default" : "secondary"} className="text-[10px]">
                                  {(m as any).active !== false ? "Active" : "Inactive"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                          {(!materials || materials.length === 0) && (
                            <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">No items found.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Category sub-tab */}
                <TabsContent value="category" className="mt-0 outline-none">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-muted-foreground">Manage product categories and divisions</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="rounded-sm gap-1.5 text-xs"><Upload className="w-3 h-3" /> Import</Button>
                      <Button size="sm" className="rounded-sm gap-1.5 text-xs"><Plus className="w-3 h-3" /> New Category</Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {["Raw Materials", "Substrates", "Amendments", "Spawn", "Packaging", "Chemicals"].map((cat) => {
                      const count = (materials ?? []).filter((m) => (m as any).category === cat).length;
                      return (
                        <Card key={cat} className="rounded-sm border-border shadow-sm hover:shadow-md transition-all cursor-pointer">
                          <CardContent className="p-4 flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-sm">{cat}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{count} item{count !== 1 ? "s" : ""}</p>
                            </div>
                            <Badge variant="secondary" className="font-mono text-sm">{count}</Badge>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  <div className="mt-6">
                    <SectionHeading title="Divisions" action={<Button size="sm" className="rounded-sm gap-1.5 text-xs h-8"><Plus className="w-3 h-3" /> Add Division</Button>} />
                    <div className="flex flex-wrap gap-2">
                      {["Production", "Sales", "Packaging", "Maintenance"].map((div) => (
                        <span key={div} className="inline-flex items-center px-3 py-1.5 rounded border border-border bg-muted/30 text-sm font-medium text-muted-foreground">{div}</span>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* Services sub-tab */}
                <TabsContent value="services" className="mt-0 outline-none">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-muted-foreground">Manage billable services</p>
                    <Button size="sm" className="rounded-sm gap-1.5 text-xs"><Plus className="w-3 h-3" /> New Service</Button>
                  </div>
                  <Card className="rounded-sm border-border shadow-md">
                    <CardContent className="p-0">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Service Name</th>
                            <th className="px-4 py-3 font-semibold">Service Code</th>
                            <th className="px-4 py-3 font-semibold text-right">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-muted-foreground">No services defined yet.</td></tr>
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
          </TabsContent>

          {/* ── WAREHOUSES & STORES ── */}
          <TabsContent value="warehouses" className="outline-none mt-0 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight font-display">Warehouses & Stores</h1>
                  <p className="text-sm text-muted-foreground mt-1">Manage storage locations and reserved stock</p>
                </div>
                <Button onClick={() => setAddWarehouseOpen(true)} className="rounded-sm h-9 px-3 text-sm gap-2"><Plus className="w-3.5 h-3.5" /> Add Warehouse</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {warehouses.map((w) => (
                  <Card key={w.id} className={`rounded-sm border-border shadow-md overflow-hidden ${w.reserved ? "border-primary/40" : ""}`}>
                    <div className={`h-1 w-full ${w.reserved ? "bg-primary" : "bg-muted"}`} />
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-base">{w.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 capitalize">{w.type} warehouse</p>
                        </div>
                        {w.reserved && <Badge className="text-[10px] rounded-sm">Reserved</Badge>}
                      </div>
                      <div className="mt-4 flex items-center gap-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Capacity</p>
                          <p className="font-mono text-sm font-semibold mt-0.5">{w.capacity}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</p>
                          <p className="text-sm mt-0.5 capitalize">{w.type}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
          </TabsContent>

          {/* ── STOCK MOVEMENTS ── */}
          <TabsContent value="movements" className="outline-none mt-0 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight font-display">Stock Movements</h1>
                  <p className="text-sm text-muted-foreground mt-1">Record inward, outward, transfer, and adjustment movements</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setTransferOpen(true)} className="rounded-sm h-9 px-3 text-sm gap-2"><ArrowRightLeft className="w-3.5 h-3.5" /> Transfer</Button>
                  <Button onClick={() => setMovOpen(true)} className="rounded-sm h-9 px-3 text-sm gap-2"><Plus className="w-3.5 h-3.5" /> New Movement</Button>
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
                          <th className="px-4 py-3 font-semibold text-right">Qty</th>
                          <th className="px-4 py-3 font-semibold">Reference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {movLoading ? (
                          <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Loading...</td></tr>
                        ) : (movements ?? []).length === 0 ? (
                          <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No movements recorded yet.</td></tr>
                        ) : (
                          (movements ?? []).map((m) => (
                            <tr key={m.id} className="hover:bg-muted/30 transition-colors h-[44px]">
                              <td className="px-4 font-mono text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleDateString()}</td>
                              <td className="px-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                                  m.fromLocationName && m.toLocationName ? "bg-blue-50 text-blue-700 border-blue-200" : m.fromLocationName ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"
                                }`}>
                                  {m.fromLocationName && m.toLocationName ? "Transfer" : m.fromLocationName ? "Outward" : "Inward"}
                                </span>
                              </td>
                              <td className="px-4 font-medium">{m.materialName}</td>
                              <td className="px-4 text-muted-foreground text-xs">{m.fromLocationName || "—"}</td>
                              <td className="px-4 text-muted-foreground text-xs">{m.toLocationName || "—"}</td>
                              <td className="px-4 text-right font-mono font-semibold">{m.quantityKg} kg</td>
                              <td className="px-4 text-muted-foreground text-xs">{m.reason || "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
          </TabsContent>

          {/* ── MATERIAL ISSUE ── */}
          <TabsContent value="indents" className="outline-none mt-0 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight font-display">Material Issue</h1>
                  <p className="text-sm text-muted-foreground mt-1">Manage material indents and issuance from store</p>
                </div>
                <Button onClick={() => setAddIndentOpen(true)} className="rounded-sm h-9 px-3 text-sm gap-2"><Plus className="w-3.5 h-3.5" /> Raise Indent</Button>
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
                            <th className="px-4 py-3 font-semibold">Department</th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {indents.filter((i) => i.status === "pending").map((i) => (
                            <tr key={i.id} className="hover:bg-muted/30 h-[44px]">
                              <td className="px-4 font-medium">{i.item}</td>
                              <td className="px-4 font-mono">{i.qty}</td>
                              <td className="px-4 text-muted-foreground text-xs">{i.dept}</td>
                              <td className="px-4">
                                <button onClick={() => setIndents((prev) => prev.map((x) => x.id === i.id ? { ...x, status: "issued" } : x))} className="text-xs text-primary hover:underline font-medium">Issue</button>
                              </td>
                            </tr>
                          ))}
                          {indents.filter((i) => i.status === "pending").length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">No pending indents</td></tr>
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
                            <th className="px-4 py-3 font-semibold">Requested By</th>
                            <th className="px-4 py-3 font-semibold">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {indents.filter((i) => i.status === "issued").map((i) => (
                            <tr key={i.id} className="hover:bg-muted/30 h-[44px]">
                              <td className="px-4 font-medium">{i.item}</td>
                              <td className="px-4 font-mono">{i.qty}</td>
                              <td className="px-4 text-muted-foreground text-xs">{i.by}</td>
                              <td className="px-4 text-muted-foreground text-xs">{i.date}</td>
                            </tr>
                          ))}
                          {indents.filter((i) => i.status === "issued").length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">No issued indents yet</td></tr>
                          )}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </div>
              </div>
          </TabsContent>

          {/* ── STORE MANAGEMENT ── */}
          <TabsContent value="store" className="outline-none mt-0 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight font-display">Store Management</h1>
                  <p className="text-sm text-muted-foreground mt-1">Record product sales and store issues</p>
                </div>
                <Button onClick={() => setAddStoreIssueOpen(true)} className="rounded-sm h-9 px-3 text-sm gap-2"><Plus className="w-3.5 h-3.5" /> Record Issue</Button>
              </div>
              <Card className="rounded-sm border-border shadow-md">
                <CardContent className="p-0">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Product</th>
                        <th className="px-4 py-3 font-semibold">Quantity</th>
                        <th className="px-4 py-3 font-semibold">From Store</th>
                        <th className="px-4 py-3 font-semibold">Sold By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {storeIssues.map((s) => (
                        <tr key={s.id} className="hover:bg-muted/30 h-[44px]">
                          <td className="px-4 font-mono text-xs text-muted-foreground">{s.date}</td>
                          <td className="px-4 font-medium">{s.product}</td>
                          <td className="px-4 font-mono">{s.qty}</td>
                          <td className="px-4 text-muted-foreground text-xs">{s.from}</td>
                          <td className="px-4 text-muted-foreground text-xs">{s.by}</td>
                        </tr>
                      ))}
                      {storeIssues.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">No store issues recorded yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
          </TabsContent>

          {/* ── ASSET MANAGEMENT ── */}
          <TabsContent value="assets" className="outline-none mt-0 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight font-display">Asset Management</h1>
                  <p className="text-sm text-muted-foreground mt-1">Track assets, their value, and allocation</p>
                </div>
                <Button onClick={() => setAddAssetOpen(true)} className="rounded-sm h-9 px-3 text-sm gap-2"><Plus className="w-3.5 h-3.5" /> Register Asset</Button>
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
                            <th className="px-4 py-3 font-semibold">Asset Name</th>
                            <th className="px-4 py-3 font-semibold text-right">Value</th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {assets.map((a) => (
                            <tr key={a.id} className="hover:bg-muted/30 h-[44px]">
                              <td className="px-4 font-mono text-xs text-muted-foreground">{a.sku}</td>
                              <td className="px-4 font-medium">{a.name}</td>
                              <td className="px-4 text-right font-mono text-sm">₹{Number(a.purchaseValue).toLocaleString()}</td>
                              <td className="px-4">
                                <Badge variant={a.allocated ? "default" : "secondary"} className="text-[10px]">
                                  {a.allocated ? "Allocated" : "Available"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                          {assets.length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">No assets registered yet.</td></tr>
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
        </Tabs>
      </div>

      {/* ── DIALOGS ── */}

      {/* Add Product */}
      <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
        <DialogContent className="rounded-sm shadow-xl max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Inventory Item</DialogTitle>
            <DialogDescription>Fill in item details to add it to the product catalog.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddProduct} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Item Name <span className="text-destructive">*</span></Label>
                <Input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="e.g. Paddy Straw" className="rounded-sm h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Item Grade / Category</Label>
                <Select value={productForm.category} onValueChange={(v) => setProductForm({ ...productForm, category: v })}>
                  <SelectTrigger className="rounded-sm h-10"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    {["Raw Materials", "Substrates", "Amendments", "Spawn", "Packaging", "Chemicals"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Material Type / Unit</Label>
                <Select value={productForm.unit} onValueChange={(v) => setProductForm({ ...productForm, unit: v })}>
                  <SelectTrigger className="rounded-sm h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["kg", "g", "L", "mL", "bags", "units", "pcs"].map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Buying Price (₹/unit)</Label>
                <Input type="number" step="0.01" min="0" value={productForm.buyPricePerUnit} onChange={(e) => setProductForm({ ...productForm, buyPricePerUnit: e.target.value })} className="rounded-sm h-10 font-mono" placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Selling Price (₹/unit)</Label>
                <Input type="number" step="0.01" min="0" value={productForm.sellPricePerUnit} onChange={(e) => setProductForm({ ...productForm, sellPricePerUnit: e.target.value })} className="rounded-sm h-10 font-mono" placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">SKU</Label>
                <Input value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} placeholder="e.g. STRW-001" className="rounded-sm h-10 font-mono" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Warehouse</Label>
                <Select value={productForm.locationId} onValueChange={(v) => setProductForm({ ...productForm, locationId: v })}>
                  <SelectTrigger className="rounded-sm h-10"><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>
                    {(locations ?? []).map((l) => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded border border-border text-xs text-muted-foreground">
              <QrCode className="w-4 h-4 flex-shrink-0" />
              A QR code will be auto-generated for this item after creation.
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createMaterial.isPending} className="w-full rounded-sm h-10">
                {createMaterial.isPending ? "Adding..." : "Add Item to Catalog"}
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
            <DialogDescription>Log an inward (GRN), outward (DC), or adjustment</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMovSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Movement Type</Label>
              <Select value={movForm.type} onValueChange={(v) => setMovForm({ ...movForm, type: v })}>
                <SelectTrigger className="rounded-sm h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inward">Inward (GRN — Goods Received)</SelectItem>
                  <SelectItem value="outward">Outward (DC — Delivery Challan)</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Item</Label>
              <Select value={movForm.materialId} onValueChange={(v) => setMovForm({ ...movForm, materialId: v })}>
                <SelectTrigger className="rounded-sm h-10"><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {(materials ?? []).map((m) => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity</Label>
                <Input type="number" step="0.01" min="0" required value={movForm.quantityDelta} onChange={(e) => setMovForm({ ...movForm, quantityDelta: e.target.value })} className="rounded-sm h-10 font-mono" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reference No.</Label>
                <Input value={movForm.reference} onChange={(e) => setMovForm({ ...movForm, reference: e.target.value })} placeholder={movForm.type === "inward" ? "GRN-001" : movForm.type === "outward" ? "DC-001" : "ADJ-001"} className="rounded-sm h-10 font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
              <Input value={movForm.notes} onChange={(e) => setMovForm({ ...movForm, notes: e.target.value })} className="rounded-sm h-10" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createAdjustment.isPending || !movForm.materialId} className="w-full rounded-sm h-10">Record Movement</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="rounded-sm shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle>Stock Transfer</DialogTitle>
            <DialogDescription>Move inventory between warehouses</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTransferSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Item</Label>
              <Select value={transferForm.materialId} onValueChange={(v) => setTransferForm({ ...transferForm, materialId: v })}>
                <SelectTrigger className="rounded-sm h-10"><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {(materials ?? []).map((m) => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">From</Label>
                <Select value={transferForm.fromLocationId} onValueChange={(v) => setTransferForm({ ...transferForm, fromLocationId: v })}>
                  <SelectTrigger className="rounded-sm h-10"><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    {(locations ?? []).map((l) => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">To</Label>
                <Select value={transferForm.toLocationId} onValueChange={(v) => setTransferForm({ ...transferForm, toLocationId: v })}>
                  <SelectTrigger className="rounded-sm h-10"><SelectValue placeholder="Destination" /></SelectTrigger>
                  <SelectContent>
                    {(locations ?? []).map((l) => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity (kg)</Label>
              <Input type="number" step="0.01" required value={transferForm.quantityKg} onChange={(e) => setTransferForm({ ...transferForm, quantityKg: e.target.value })} className="rounded-sm h-10 font-mono" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createMovement.isPending || !transferForm.materialId} className="w-full rounded-sm h-10">Execute Transfer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Warehouse */}
      <Dialog open={addWarehouseOpen} onOpenChange={setAddWarehouseOpen}>
        <DialogContent className="rounded-sm shadow-xl max-w-md">
          <DialogHeader><DialogTitle>Add Warehouse / Store</DialogTitle></DialogHeader>
          <form onSubmit={handleAddWarehouse} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Location Name <span className="text-destructive">*</span></Label>
              <Input required value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} placeholder="e.g. Annur Cold Room" className="rounded-sm h-10" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
                <Select value={warehouseForm.type} onValueChange={(v) => setWarehouseForm({ ...warehouseForm, type: v })}>
                  <SelectTrigger className="rounded-sm h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="cold">Cold Storage</SelectItem>
                    <SelectItem value="reserved">Reserved (Sales Orders)</SelectItem>
                    <SelectItem value="transit">Transit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Capacity</Label>
                <Input value={warehouseForm.capacity} onChange={(e) => setWarehouseForm({ ...warehouseForm, capacity: e.target.value })} placeholder="e.g. 500 kg" className="rounded-sm h-10" />
              </div>
            </div>
            <DialogFooter><Button type="submit" className="w-full rounded-sm h-10">Add Warehouse</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Raise Indent */}
      <Dialog open={addIndentOpen} onOpenChange={setAddIndentOpen}>
        <DialogContent className="rounded-sm shadow-xl max-w-md">
          <DialogHeader><DialogTitle>Raise Material Indent</DialogTitle></DialogHeader>
          <form onSubmit={handleAddIndent} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Item <span className="text-destructive">*</span></Label>
              <Select value={indentForm.item} onValueChange={(v) => setIndentForm({ ...indentForm, item: v })}>
                <SelectTrigger className="rounded-sm h-10"><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {(materials ?? []).map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Requested Qty</Label>
                <Input required type="number" min="0" value={indentForm.requestedQty} onChange={(e) => setIndentForm({ ...indentForm, requestedQty: e.target.value })} className="rounded-sm h-10 font-mono" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Department</Label>
                <Input value={indentForm.department} onChange={(e) => setIndentForm({ ...indentForm, department: e.target.value })} placeholder="e.g. Production" className="rounded-sm h-10" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Requested By</Label>
              <Input required value={indentForm.requestedBy} onChange={(e) => setIndentForm({ ...indentForm, requestedBy: e.target.value })} placeholder="e.g. Ravi Kumar" className="rounded-sm h-10" />
            </div>
            <DialogFooter><Button type="submit" className="w-full rounded-sm h-10">Submit Indent</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Store Issue */}
      <Dialog open={addStoreIssueOpen} onOpenChange={setAddStoreIssueOpen}>
        <DialogContent className="rounded-sm shadow-xl max-w-md">
          <DialogHeader><DialogTitle>Record Store Issue / Sale</DialogTitle></DialogHeader>
          <form onSubmit={handleAddStoreIssue} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Product <span className="text-destructive">*</span></Label>
              <Select value={storeIssueForm.product} onValueChange={(v) => setStoreIssueForm({ ...storeIssueForm, product: v })}>
                <SelectTrigger className="rounded-sm h-10"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {(materials ?? []).map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity</Label>
                <Input required type="number" min="0" value={storeIssueForm.quantity} onChange={(e) => setStoreIssueForm({ ...storeIssueForm, quantity: e.target.value })} className="rounded-sm h-10 font-mono" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">From Store</Label>
                <Select value={storeIssueForm.fromStore} onValueChange={(v) => setStoreIssueForm({ ...storeIssueForm, fromStore: v })}>
                  <SelectTrigger className="rounded-sm h-10"><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => <SelectItem key={w.id} value={w.name}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sold By</Label>
              <Input value={storeIssueForm.soldBy} onChange={(e) => setStoreIssueForm({ ...storeIssueForm, soldBy: e.target.value })} placeholder="e.g. Murugan" className="rounded-sm h-10" />
            </div>
            <DialogFooter><Button type="submit" className="w-full rounded-sm h-10">Record Issue</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Asset */}
      <Dialog open={addAssetOpen} onOpenChange={setAddAssetOpen}>
        <DialogContent className="rounded-sm shadow-xl max-w-md">
          <DialogHeader><DialogTitle>Register Asset</DialogTitle></DialogHeader>
          <form onSubmit={handleAddAsset} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Asset Name <span className="text-destructive">*</span></Label>
              <Input required value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} placeholder="e.g. Autoclave Machine" className="rounded-sm h-10" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">SKU (auto if blank)</Label>
                <Input value={assetForm.sku} onChange={(e) => setAssetForm({ ...assetForm, sku: e.target.value })} placeholder="AST-001" className="rounded-sm h-10 font-mono" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Purchase Value (₹)</Label>
                <Input type="number" min="0" value={assetForm.purchaseValue} onChange={(e) => setAssetForm({ ...assetForm, purchaseValue: e.target.value })} className="rounded-sm h-10 font-mono" placeholder="0" />
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded border border-border text-xs text-muted-foreground">
              <QrCode className="w-4 h-4 flex-shrink-0" />
              A unique QR code will be auto-generated for this asset.
            </div>
            <DialogFooter><Button type="submit" className="w-full rounded-sm h-10">Register Asset</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
