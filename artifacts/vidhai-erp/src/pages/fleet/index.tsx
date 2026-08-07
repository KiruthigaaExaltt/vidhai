import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListVehicles,
  getListVehiclesQueryKey,
  useCreateVehicle,
  useUpdateVehicle,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Truck, Plus, Pencil, ChevronRight } from "lucide-react";

type VehicleType = "truck" | "van" | "motorcycle" | "tractor" | "other";
type VehicleStatus = "available" | "in_use" | "maintenance" | "retired";

const TYPE_LABELS: Record<VehicleType, string> = {
  truck: "Truck",
  van: "Van",
  motorcycle: "Motorcycle",
  tractor: "Tractor",
  other: "Other",
};

const STATUS_COLORS: Record<VehicleStatus, string> = {
  available: "bg-primary/10 text-primary border-0",
  in_use: "bg-amber-50 text-amber-700 border-0",
  maintenance: "bg-red-50 text-red-600 border-0",
  retired: "bg-muted text-muted-foreground border-0",
};

const STATUS_LABELS: Record<VehicleStatus, string> = {
  available: "Available",
  in_use: "In Use",
  maintenance: "Maintenance",
  retired: "Retired",
};

const HOME_LOCS = [
  { id: null, label: "None / Cross-site" },
  { id: 1, label: "Annur (A)" },
  { id: 2, label: "Ooty (B)" },
  { id: 3, label: "Coimbatore (C)" },
  { id: 4, label: "Lab (D)" },
];

const EMPTY_FORM = {
  name: "",
  regNo: "",
  vehicleType: "truck" as VehicleType,
  homeLocationId: null as number | null,
  notes: "",
};

export default function FleetList() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: vehicles, isLoading } = useListVehicles({
    query: { queryKey: getListVehiclesQueryKey() },
  });
  const list: any[] = (vehicles as any) ?? [];

  const refetch = () => queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
  const createMut = useCreateVehicle({ mutation: { onSuccess: refetch } });
  const updateMut = useUpdateVehicle({ mutation: { onSuccess: refetch } });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<any | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editStatus, setEditStatus] = useState<VehicleStatus>("available");
  const [formError, setFormError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("ALL");

  const openNew = () => {
    setEditVehicle(null);
    setForm({ ...EMPTY_FORM });
    setEditStatus("available");
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (v: any) => {
    setEditVehicle(v);
    setForm({
      name: v.name,
      regNo: v.regNo,
      vehicleType: v.vehicleType,
      homeLocationId: v.homeLocationId ?? null,
      notes: v.notes ?? "",
    });
    setEditStatus(v.status);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = () => {
    setFormError(null);
    if (!form.name.trim() || !form.regNo.trim()) {
      setFormError("Name and Registration No. are required.");
      return;
    }
    if (editVehicle) {
      updateMut.mutate(
        { id: editVehicle.id, data: { name: form.name, regNo: form.regNo, vehicleType: form.vehicleType, homeLocationId: form.homeLocationId, notes: form.notes || null, status: editStatus } as any },
        { onSuccess: () => setDialogOpen(false), onError: (e: any) => setFormError(e?.message ?? "Update failed.") }
      );
    } else {
      createMut.mutate(
        { data: { name: form.name, regNo: form.regNo, vehicleType: form.vehicleType, homeLocationId: form.homeLocationId, notes: form.notes || null } as any },
        { onSuccess: () => setDialogOpen(false), onError: (e: any) => setFormError(e?.message ?? "Create failed.") }
      );
    }
  };

  const filtered = filterStatus === "ALL" ? list : list.filter((v: any) => v.status === filterStatus);

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Truck className="w-6 h-6 text-primary" /> Vehicle Fleet
            </h1>
            
          </div>
          <Button size="sm" className="rounded-sm h-8" onClick={openNew}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Vehicle
          </Button>
        </div>

        {/* Status filter */}
        <div className="flex gap-1">
          {["ALL", "available", "in_use", "maintenance", "retired"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-sm text-xs font-medium border transition-colors ${
                filterStatus === s
                  ? "bg-primary text-white border-primary"
                  : "bg-background border-border text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {s === "ALL" ? "All" : STATUS_LABELS[s as VehicleStatus]}
            </button>
          ))}
        </div>

        {/* Vehicle table */}
        <Card className="rounded-sm border-border shadow-none">
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-sm text-muted-foreground">Loading vehicles…</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No vehicles.{" "}
                <button className="text-primary underline underline-offset-2" onClick={openNew}>Add the first one.</button>
              </div>
            ) : (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Reg No.</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Home Location</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Notes</th>
                    <th className="px-4 py-2 font-medium w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((v: any) => (
                    <tr
                      key={v.id}
                      className="h-[36px] hover:bg-muted/20 cursor-pointer"
                      onClick={() => setLocation(`/fleet/${v.id}`)}
                    >
                      <td className="px-4 font-semibold">{v.name}</td>
                      <td className="px-4 font-mono text-muted-foreground">{v.regNo}</td>
                      <td className="px-4">{TYPE_LABELS[v.vehicleType as VehicleType] ?? v.vehicleType}</td>
                      <td className="px-4 text-muted-foreground">{v.homeLocationName ?? v.homeLocationCode ?? "Cross-site"}</td>
                      <td className="px-4">
                        <Badge variant="outline" className={`rounded-sm text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 ${STATUS_COLORS[v.status as VehicleStatus] ?? ""}`}>
                          {STATUS_LABELS[v.status as VehicleStatus] ?? v.status}
                        </Badge>
                      </td>
                      <td className="px-4 text-xs text-muted-foreground max-w-[180px] truncate">{v.notes ?? "—"}</td>
                      <td className="px-4">
                        <div className="flex gap-1 items-center" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => openEdit(v)} className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setLocation(`/fleet/${v.id}`)} className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground">
                            <ChevronRight className="w-3.5 h-3.5" />
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

        {/* Add / Edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="rounded-sm border-border shadow-none max-w-md">
            <DialogHeader>
              <DialogTitle>{editVehicle ? `Edit — ${editVehicle.name}` : "Add Vehicle"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Vehicle Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-sm h-9" placeholder="e.g. KA-01 Tempo" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Registration No.</Label>
                  <Input value={form.regNo} onChange={(e) => setForm({ ...form, regNo: e.target.value })} className="rounded-sm font-mono h-9" placeholder="TN-XX-XXXX" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
                  <select
                    className="w-full h-9 rounded-sm border border-border bg-background px-3 text-sm"
                    value={form.vehicleType}
                    onChange={(e) => setForm({ ...form, vehicleType: e.target.value as VehicleType })}
                  >
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Home Location</Label>
                  <select
                    className="w-full h-9 rounded-sm border border-border bg-background px-3 text-sm"
                    value={form.homeLocationId ?? ""}
                    onChange={(e) => setForm({ ...form, homeLocationId: e.target.value ? Number(e.target.value) : null })}
                  >
                    {HOME_LOCS.map((l) => <option key={l.id ?? "none"} value={l.id ?? ""}>{l.label}</option>)}
                  </select>
                </div>
              </div>
              {editVehicle && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
                  <select
                    className="w-full h-9 rounded-sm border border-border bg-background px-3 text-sm"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as VehicleStatus)}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-sm h-9" placeholder="Optional" />
              </div>
              {formError && <p className="text-xs text-destructive font-medium">{formError}</p>}
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" className="rounded-sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button className="rounded-sm" disabled={createMut.isPending || updateMut.isPending} onClick={handleSave}>
                {createMut.isPending || updateMut.isPending ? "Saving…" : editVehicle ? "Update" : "Add Vehicle"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
