import { useState } from "react";
import {
  useListSalesOrders,
  getListSalesOrdersQueryKey,
  useCreateSalesOrder,
  useUpdateSalesOrder,
  useDeleteSalesOrder,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShoppingCart, Plus, Pencil, Trash2 } from "lucide-react";

type ProductType = "grow_bag" | "mushroom" | "manure";
type SaleType = "external" | "internal_transfer";

const PRODUCT_LABELS: Record<ProductType, string> = {
  grow_bag: "Grow Bag",
  mushroom: "Mushroom",
  manure: "Manure",
};

const PRODUCT_COLORS: Record<ProductType, string> = {
  grow_bag: "bg-teal-50 text-teal-700 border-teal-200",
  mushroom: "bg-violet-50 text-violet-700 border-violet-200",
  manure: "bg-amber-50 text-amber-700 border-amber-200",
};

const SALE_TYPE_LABELS: Record<SaleType, string> = {
  external: "External Sale",
  internal_transfer: "Internal Transfer",
};

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function isoToday() {
  return new Date().toISOString().split("T")[0];
}

const EMPTY_FORM = {
  productType: "mushroom" as ProductType,
  saleType: "external" as SaleType,
  transactionDate: isoToday(),
  qtyKg: "",
  unit: "kg",
  buyerName: "",
  fromBatchCode: "",
  qualityNote: "",
  unitPrice: "",
  notes: "",
};

export default function Sales() {
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useListSalesOrders({
    query: { queryKey: getListSalesOrdersQueryKey() },
  });
  const orderList: any[] = (orders as any) ?? [];

  const refetch = () => queryClient.invalidateQueries({ queryKey: getListSalesOrdersQueryKey() });

  const createMut = useCreateSalesOrder({ mutation: { onSuccess: refetch } });
  const updateMut = useUpdateSalesOrder({ mutation: { onSuccess: refetch } });
  const deleteMut = useDeleteSalesOrder({ mutation: { onSuccess: refetch } });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<any | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [filterType, setFilterType] = useState<string>("ALL");

  const openNew = () => {
    setEditOrder(null);
    setForm({ ...EMPTY_FORM, transactionDate: isoToday() });
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (o: any) => {
    setEditOrder(o);
    setForm({
      productType: o.productType,
      saleType: o.saleType ?? "external",
      transactionDate: o.transactionDate,
      qtyKg: o.qtyKg != null ? String(o.qtyKg) : "",
      unit: o.unit ?? "kg",
      buyerName: o.buyerName ?? "",
      fromBatchCode: o.fromBatchCode ?? "",
      qualityNote: o.qualityNote ?? "",
      unitPrice: o.unitPrice != null ? String(o.unitPrice) : "",
      notes: o.notes ?? "",
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = () => {
    setFormError(null);
    if (!form.qtyKg || Number(form.qtyKg) <= 0) {
      setFormError("Quantity (kg) is required and must be positive.");
      return;
    }

    const payload = {
      productType: form.productType,
      saleType: form.saleType,
      transactionDate: form.transactionDate,
      qtyKg: Number(form.qtyKg),
      unit: form.unit || "kg",
      buyerName: form.buyerName || null,
      fromBatchCode: form.fromBatchCode || null,
      qualityNote: form.qualityNote || null,
      unitPrice: form.unitPrice ? Number(form.unitPrice) : null,
      totalValue: form.unitPrice && form.qtyKg ? Math.round(Number(form.unitPrice) * Number(form.qtyKg) * 100) / 100 : null,
      notes: form.notes || null,
    };

    if (editOrder) {
      updateMut.mutate(
        { id: editOrder.id, data: { qtyKg: payload.qtyKg, unitPrice: payload.unitPrice ?? null } as any },
        { onSuccess: () => setDialogOpen(false), onError: (e: any) => setFormError(e?.message ?? "Update failed.") }
      );
    } else {
      createMut.mutate(
        { data: payload as any },
        { onSuccess: () => setDialogOpen(false), onError: (e: any) => setFormError(e?.message ?? "Create failed.") }
      );
    }
  };

  const handleDelete = () => {
    if (deleteId == null) return;
    deleteMut.mutate({ id: deleteId }, { onSuccess: () => setDeleteId(null) });
  };

  const filtered = filterType === "ALL" ? orderList : orderList.filter((o: any) => o.productType === filterType);
  const totalKg = filtered.reduce((s: number, o: any) => s + Number(o.qtyKg ?? 0), 0);
  const totalValue = filtered.reduce((s: number, o: any) => s + Number(o.totalValue ?? 0), 0);

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ShoppingCart className="w-6 h-6 text-primary" /> Sales & Dispatch
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              All outbound transactions — external sales and internal transfers across Grow Bags, Mushroom, and Manure.
            </p>
          </div>
          <Button size="sm" className="rounded-sm h-8" onClick={openNew}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Order
          </Button>
        </div>

        {/* Filter + summary */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {[
              { key: "ALL", label: "All" },
              { key: "mushroom", label: "Mushroom" },
              { key: "grow_bag", label: "Grow Bag" },
              { key: "manure", label: "Manure" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilterType(f.key)}
                className={`px-3 py-1.5 rounded-sm text-xs font-medium border transition-colors ${
                  filterType === f.key
                    ? "bg-primary text-white border-primary"
                    : "bg-background border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-4 text-xs text-muted-foreground font-mono">
            <span>Total qty: <strong className="text-foreground">{totalKg.toFixed(1)} kg</strong></span>
            {totalValue > 0 && <span>Total value: <strong className="text-foreground">₹{totalValue.toLocaleString("en-IN")}</strong></span>}
          </div>
        </div>

        {/* Orders table */}
        <Card className="rounded-sm border-border shadow-none">
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-sm text-muted-foreground">Loading orders…</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No orders yet.{" "}
                <button className="text-primary underline underline-offset-2" onClick={openNew}>
                  Create the first one.
                </button>
              </div>
            ) : (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Order Code</th>
                    <th className="px-4 py-2 font-medium">Product</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Buyer / Destination</th>
                    <th className="px-4 py-2 font-medium text-right">Qty (kg)</th>
                    <th className="px-4 py-2 font-medium text-right">Unit Price</th>
                    <th className="px-4 py-2 font-medium text-right">Total (₹)</th>
                    <th className="px-4 py-2 font-medium">Batch</th>
                    <th className="px-4 py-2 font-medium">Quality</th>
                    <th className="px-4 py-2 font-medium w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered
                    .slice()
                    .sort((a: any, b: any) => b.transactionDate.localeCompare(a.transactionDate))
                    .map((o: any) => (
                      <tr key={o.id} className="h-[36px] hover:bg-muted/20">
                        <td className="px-4 font-mono text-muted-foreground">{fmt(o.transactionDate)}</td>
                        <td className="px-4 font-mono text-xs">{o.orderCode}</td>
                        <td className="px-4">
                          <span className={`inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase tracking-wider border ${PRODUCT_COLORS[o.productType as ProductType] ?? "bg-muted text-muted-foreground border-border"}`}>
                            {PRODUCT_LABELS[o.productType as ProductType] ?? o.productType}
                          </span>
                        </td>
                        <td className="px-4">
                          <StatusBadge status={o.saleType} label={SALE_TYPE_LABELS[o.saleType as SaleType] ?? o.saleType} />
                        </td>
                        <td className="px-4 text-muted-foreground">{o.buyerName ?? "—"}</td>
                        <td className="px-4 font-mono text-right font-semibold">{Number(o.qtyKg).toFixed(1)}</td>
                        <td className="px-4 font-mono text-right text-muted-foreground">{o.unitPrice != null ? `₹${Number(o.unitPrice).toFixed(2)}` : "—"}</td>
                        <td className="px-4 font-mono text-right">{o.totalValue != null ? `₹${Number(o.totalValue).toLocaleString("en-IN")}` : "—"}</td>
                        <td className="px-4 font-mono text-xs text-muted-foreground">{o.fromBatchCode ?? "—"}</td>
                        <td className="px-4 text-xs text-muted-foreground max-w-[160px] truncate">{o.qualityNote ?? "—"}</td>
                        <td className="px-4">
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(o)} className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteId(o.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* New / Edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="rounded-sm border-border shadow-none max-w-lg">
            <DialogHeader>
              <DialogTitle>{editOrder ? "Edit Order" : "New Sales Order"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {/* Product type */}
              {!editOrder && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Product Type</Label>
                  <div className="flex gap-2">
                    {(["mushroom", "grow_bag", "manure"] as ProductType[]).map((pt) => (
                      <button
                        key={pt}
                        onClick={() => setForm({ ...form, productType: pt })}
                        className={`flex-1 py-2 rounded-sm text-xs font-semibold border transition-colors ${
                          form.productType === pt
                            ? "bg-primary text-white border-primary"
                            : "border-border text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {PRODUCT_LABELS[pt]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sale type */}
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sale Type</Label>
                <div className="flex gap-2">
                  {(["external", "internal_transfer"] as SaleType[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => setForm({ ...form, saleType: st })}
                      className={`flex-1 py-2 rounded-sm text-xs font-semibold border transition-colors ${
                        form.saleType === st
                          ? "bg-primary text-white border-primary"
                          : "border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      {SALE_TYPE_LABELS[st]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Common: date + qty */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Transaction Date</Label>
                  <Input
                    type="date"
                    required
                    value={form.transactionDate}
                    onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
                    className="rounded-sm font-mono h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Quantity (kg){form.productType === "grow_bag" ? " — total bag weight" : ""}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={form.qtyKg}
                    onChange={(e) => setForm({ ...form, qtyKg: e.target.value })}
                    className="rounded-sm font-mono h-9"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Buyer / destination — all types */}
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  {form.saleType === "internal_transfer" ? "Destination Location" : "Buyer / Farm Name"}
                </Label>
                <Input
                  value={form.buyerName}
                  onChange={(e) => setForm({ ...form, buyerName: e.target.value })}
                  className="rounded-sm h-9"
                  placeholder={form.saleType === "internal_transfer" ? "e.g. Ooty Location B" : "e.g. Krishna Farms"}
                />
              </div>

              {/* Mushroom-specific: quality note */}
              {form.productType === "mushroom" && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quality Note</Label>
                  <Input
                    value={form.qualityNote}
                    onChange={(e) => setForm({ ...form, qualityNote: e.target.value })}
                    className="rounded-sm h-9"
                    placeholder="e.g. Grade A, white cap, ~22 g avg"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Benchmark: ~20 g per mushroom, firm white cap. Note any deviation.
                  </p>
                </div>
              )}

              {/* Source batch code — mushroom + grow_bag */}
              {(form.productType === "mushroom" || form.productType === "grow_bag") && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {form.productType === "mushroom" ? "Source Ooty Batch Code" : "Annur Batch Code"}
                  </Label>
                  <Input
                    value={form.fromBatchCode}
                    onChange={(e) => setForm({ ...form, fromBatchCode: e.target.value })}
                    className="rounded-sm font-mono h-9"
                    placeholder="e.g. B-260708-001"
                  />
                </div>
              )}

              {/* Pricing */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Unit Price (₹/kg)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.unitPrice}
                    onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                    className="rounded-sm font-mono h-9"
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Computed Total</Label>
                  <div className="h-9 flex items-center px-3 rounded-sm border border-border bg-muted/40 font-mono text-sm text-muted-foreground">
                    {form.unitPrice && form.qtyKg
                      ? `₹${(Number(form.unitPrice) * Number(form.qtyKg)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "—"}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes (optional)</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="rounded-sm h-9"
                  placeholder="Dispatch notes, vehicle, etc."
                />
              </div>

              {formError && <p className="text-xs text-destructive font-medium">{formError}</p>}
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" className="rounded-sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                className="rounded-sm"
                disabled={createMut.isPending || updateMut.isPending}
                onClick={handleSave}
              >
                {createMut.isPending || updateMut.isPending
                  ? "Saving…"
                  : editOrder ? "Update Order" : "Create Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <Dialog open={deleteId != null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
          <DialogContent className="rounded-sm border-border shadow-none max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete order?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground pt-1">This will permanently remove the sales order record.</p>
            <DialogFooter className="pt-4">
              <Button variant="outline" className="rounded-sm" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" className="rounded-sm" disabled={deleteMut.isPending} onClick={handleDelete}>
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
