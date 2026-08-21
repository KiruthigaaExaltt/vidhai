import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useListVehicles,
  getListVehiclesQueryKey,
  useUpdateVehicle,
  useListFuelLogs,
  getListFuelLogsQueryKey,
  useCreateFuelLog,
  useListMaintenanceLogs,
  getListMaintenanceLogsQueryKey,
  useCreateMaintenanceLog,
  useListVehicleUsageLogs,
  getListVehicleUsageLogsQueryKey,
  useCreateVehicleUsageLog,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Fuel, Wrench, Navigation, Plus } from "lucide-react";

type Tab = "fuel" | "maintenance" | "usage";

const STATUS_COLORS: Record<string, string> = {
  available: "bg-primary/10 text-primary",
  in_use: "bg-amber-50 text-amber-700",
  maintenance: "bg-red-50 text-red-600",
  retired: "bg-muted text-muted-foreground",
};

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function isoToday() {
  return new Date().toISOString().split("T")[0];
}

export default function FleetDetail() {
  const params = useParams();
  const vehicleId = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("fuel");
  const [showFuelForm, setShowFuelForm] = useState(false);
  const [showMaintForm, setShowMaintForm] = useState(false);
  const [showUsageForm, setShowUsageForm] = useState(false);

  // Fuel form state
  const [fuelForm, setFuelForm] = useState({ fuelDate: isoToday(), litres: "", costTotal: "", driverName: "", notes: "" });
  // Maintenance form state
  const [maintForm, setMaintForm] = useState({ serviceDate: isoToday(), description: "", cost: "", nextServiceDue: "", notes: "" });
  // Usage form state — driverName is stored in notes as "Driver: <name> | <extra notes>"
  const [usageForm, setUsageForm] = useState({ usageDate: isoToday(), hoursWorked: "", workType: "", driverName: "", extraNotes: "" });

  const { data: vehicles } = useListVehicles({ query: { queryKey: getListVehiclesQueryKey() } });
  const vehicleList = Array.isArray(vehicles) ? vehicles : Array.isArray((vehicles as any)?.data) ? (vehicles as any).data : [];
  const vehicle = vehicleList.find((v: any) => v.id === vehicleId);

  const { data: fuelLogs } = useListFuelLogs({ query: { queryKey: getListFuelLogsQueryKey() } });
  const fuel: any[] = ((fuelLogs as any) ?? []).filter((l: any) => l.vehicleId === vehicleId);

  const { data: maintLogs } = useListMaintenanceLogs({ query: { queryKey: getListMaintenanceLogsQueryKey() } });
  const maint: any[] = ((maintLogs as any) ?? []).filter((l: any) => l.vehicleId === vehicleId);

  const { data: usageLogs } = useListVehicleUsageLogs({ query: { queryKey: getListVehicleUsageLogsQueryKey() } });
  const usage: any[] = ((usageLogs as any) ?? []).filter((l: any) => l.vehicleId === vehicleId);

  const updateMut = useUpdateVehicle({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() }) },
  });

  const fuelMut = useCreateFuelLog({
    mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListFuelLogsQueryKey() }); setShowFuelForm(false); setFuelForm({ fuelDate: isoToday(), litres: "", costTotal: "", driverName: "", notes: "" }); } },
  });
  const maintMut = useCreateMaintenanceLog({
    mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListMaintenanceLogsQueryKey() }); setShowMaintForm(false); setMaintForm({ serviceDate: isoToday(), description: "", cost: "", nextServiceDue: "", notes: "" }); } },
  });
  const usageMut = useCreateVehicleUsageLog({
    mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListVehicleUsageLogsQueryKey() }); setShowUsageForm(false); setUsageForm({ usageDate: isoToday(), hoursWorked: "", workType: "", driverName: "", extraNotes: "" }); } },
  });

  const handleFuelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const litresNum = Number(fuelForm.litres);
    const costTotalNum = fuelForm.costTotal ? Number(fuelForm.costTotal) : null;
    fuelMut.mutate({
      data: {
        vehicleId,
        fuelDate: fuelForm.fuelDate,
        litres: litresNum,
        costPerLitre: costTotalNum && litresNum ? costTotalNum / litresNum : null,
        notes: fuelForm.driverName ? `Driver: ${fuelForm.driverName}${fuelForm.notes ? ` | ${fuelForm.notes}` : ""}` : (fuelForm.notes || null),
      } as any,
    });
  };

  const handleMaintSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    maintMut.mutate({
      data: {
        vehicleId,
        serviceDate: maintForm.serviceDate,
        description: maintForm.description,
        cost: maintForm.cost ? Number(maintForm.cost) : null,
        nextServiceDue: maintForm.nextServiceDue || null,
        notes: maintForm.notes || null,
      } as any,
    });
  };

  const handleUsageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const noteParts = [
      usageForm.driverName ? `Driver: ${usageForm.driverName}` : null,
      usageForm.extraNotes || null,
    ].filter(Boolean);
    usageMut.mutate({
      data: {
        vehicleId,
        usageDate: usageForm.usageDate,
        hoursWorked: usageForm.hoursWorked ? Number(usageForm.hoursWorked) : null,
        workType: usageForm.workType || "general",
        notes: noteParts.length > 0 ? noteParts.join(" | ") : null,
      } as any,
    });
  };

  if (!Number.isFinite(vehicleId)) {
    return (
      <Shell>
        <div className="p-8 text-sm text-muted-foreground">
          Vehicle page not found. <Button variant="link" className="px-1" onClick={() => setLocation("/fleet")}>Back to Fleet</Button>
        </div>
      </Shell>
    );
  }
  if (!vehicle) {
    return (
      <Shell>
        <div className="p-8 text-sm text-muted-foreground">
          {vehicles ? "Vehicle not found." : "Loading…"}
        </div>
      </Shell>
    );
  }

  const totalFuelCost = fuel.reduce((s, l) => s + Number(l.cost ?? 0), 0);
  const totalFuelLitres = fuel.reduce((s, l) => s + Number(l.liters ?? 0), 0);
  const totalMaintCost = maint.reduce((s, l) => s + Number(l.cost ?? 0), 0);
  const totalHours = usage.reduce((s, l) => s + Number(l.hoursWorked ?? 0), 0);
  const totalRuns = fuel.length;

  const TABS: Array<{ key: Tab; label: string; icon: any; count: number }> = [
    { key: "fuel", label: "Fuel Logs", icon: Fuel, count: fuel.length },
    { key: "maintenance", label: "Maintenance", icon: Wrench, count: maint.length },
    { key: "usage", label: "Usage Logs", icon: Navigation, count: usage.length },
  ];

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-6 md:p-8">
        <Button variant="ghost" onClick={() => setLocation("/fleet")} className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Fleet
        </Button>

        {/* Vehicle header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold tracking-tight">{vehicle.name}</h1>
              <Badge variant="outline" className={`rounded-sm border-0 text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 ${STATUS_COLORS[vehicle.status] ?? "bg-muted text-muted-foreground"}`}>
                {vehicle.status?.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground font-mono">{vehicle.regNo} · {vehicle.vehicleType} · {vehicle.homeLocationName ?? vehicle.homeLocationCode ?? "Cross-site"}</p>
          </div>
          {/* Quick status toggle */}
          <div className="flex gap-2">
            {(["available", "in_use", "maintenance"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={vehicle.status === s ? "default" : "outline"}
                className="rounded-sm h-8 text-xs"
                onClick={() => updateMut.mutate({ id: vehicleId, data: { status: s } as any })}
              >
                {s === "in_use" ? "In Use" : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Fuel", value: `${totalFuelLitres.toFixed(1)} L`, sub: totalFuelCost > 0 ? `₹${totalFuelCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "" },
            { label: "Maintenance Cost", value: totalMaintCost > 0 ? `₹${totalMaintCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—", sub: `${maint.length} service(s)` },
            { label: "Hours Logged", value: `${totalHours.toFixed(1)} h`, sub: `${usage.length} run(s)` },
            { label: "Fuel Entries", value: totalRuns, sub: "total logs" },
          ].map((s) => (
            <Card key={s.label} className="rounded-sm border-border shadow-none">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{s.label}</p>
                <p className="text-lg font-bold font-mono">{s.value}</p>
                {s.sub && <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border pb-0">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                <span className="ml-1 text-[11px] font-mono bg-muted rounded-sm px-1.5 py-0.5">{t.count}</span>
              </button>
            );
          })}
        </div>

        {/* Fuel Logs tab */}
        {activeTab === "fuel" && (
          <Card className="rounded-sm border-border shadow-none">
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Fuel Logs · {totalFuelLitres.toFixed(1)} L total
              </CardTitle>
              <Button size="sm" className="rounded-sm h-8" onClick={() => setShowFuelForm(!showFuelForm)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Log Fuel
              </Button>
            </CardHeader>
            {showFuelForm && (
              <form onSubmit={handleFuelSubmit} className="flex flex-wrap items-end gap-3 p-4 border-b border-border bg-muted/20">
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</Label>
                  <Input type="date" required value={fuelForm.fuelDate} onChange={(e) => setFuelForm({ ...fuelForm, fuelDate: e.target.value })} className="rounded-sm font-mono h-9 w-[130px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Litres Filled</Label>
                  <Input type="number" step="0.01" required value={fuelForm.litres} onChange={(e) => setFuelForm({ ...fuelForm, litres: e.target.value })} className="rounded-sm font-mono h-9 w-[90px]" placeholder="0.00" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Cost (₹)</Label>
                  <Input type="number" step="0.01" value={fuelForm.costTotal} onChange={(e) => setFuelForm({ ...fuelForm, costTotal: e.target.value })} className="rounded-sm font-mono h-9 w-[110px]" placeholder="0.00" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Driver</Label>
                  <Input value={fuelForm.driverName} onChange={(e) => setFuelForm({ ...fuelForm, driverName: e.target.value })} className="rounded-sm h-9 w-[130px]" placeholder="Name" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Notes</Label>
                  <Input value={fuelForm.notes} onChange={(e) => setFuelForm({ ...fuelForm, notes: e.target.value })} className="rounded-sm h-9 w-[140px]" placeholder="Optional" />
                </div>
                <Button type="submit" size="sm" className="rounded-sm h-9" disabled={fuelMut.isPending}>
                  {fuelMut.isPending ? "Saving…" : "Save"}
                </Button>
              </form>
            )}
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium text-right">Litres</th>
                    <th className="px-4 py-2 font-medium text-right">Total Cost (₹)</th>
                    <th className="px-4 py-2 font-medium text-right">₹/L</th>
                    <th className="px-4 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {fuel.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">No fuel logs yet.</td></tr>
                  ) : fuel.slice().sort((a, b) => b.fuelDate.localeCompare(a.fuelDate)).map((l: any) => {
                    const litresVal = Number(l.litres ?? 0);
                    const totalCostVal = Number(l.totalCost ?? 0);
                    const costPerL = litresVal > 0 && totalCostVal > 0 ? totalCostVal / litresVal : null;
                    return (
                      <tr key={l.id} className="h-[36px] hover:bg-muted/20">
                        <td className="px-4 font-mono text-muted-foreground">{fmt(l.fuelDate)}</td>
                        <td className="px-4 font-mono text-right font-semibold">{litresVal.toFixed(2)}</td>
                        <td className="px-4 font-mono text-right">{totalCostVal > 0 ? `₹${totalCostVal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}</td>
                        <td className="px-4 font-mono text-right text-muted-foreground">{costPerL ? `₹${costPerL.toFixed(2)}` : "—"}</td>
                        <td className="px-4 text-xs text-muted-foreground">{l.notes ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Maintenance tab */}
        {activeTab === "maintenance" && (
          <Card className="rounded-sm border-border shadow-none">
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Maintenance Logs{totalMaintCost > 0 ? ` · ₹${totalMaintCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })} total` : ""}
              </CardTitle>
              <Button size="sm" className="rounded-sm h-8" onClick={() => setShowMaintForm(!showMaintForm)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Log Service
              </Button>
            </CardHeader>
            {showMaintForm && (
              <form onSubmit={handleMaintSubmit} className="flex flex-wrap items-end gap-3 p-4 border-b border-border bg-muted/20">
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Service Date</Label>
                  <Input type="date" required value={maintForm.serviceDate} onChange={(e) => setMaintForm({ ...maintForm, serviceDate: e.target.value })} className="rounded-sm font-mono h-9 w-[150px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Description</Label>
                  <Input required value={maintForm.description} onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })} className="rounded-sm h-9 w-[220px]" placeholder="e.g. Oil change + filter" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Cost (₹)</Label>
                  <Input type="number" step="0.01" value={maintForm.cost} onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })} className="rounded-sm font-mono h-9 w-[110px]" placeholder="Optional" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Next Due</Label>
                  <Input type="date" value={maintForm.nextServiceDue} onChange={(e) => setMaintForm({ ...maintForm, nextServiceDue: e.target.value })} className="rounded-sm font-mono h-9 w-[150px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Notes</Label>
                  <Input value={maintForm.notes} onChange={(e) => setMaintForm({ ...maintForm, notes: e.target.value })} className="rounded-sm h-9 w-[160px]" placeholder="Optional" />
                </div>
                <Button type="submit" size="sm" className="rounded-sm h-9" disabled={maintMut.isPending}>
                  {maintMut.isPending ? "Saving…" : "Save"}
                </Button>
              </form>
            )}
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 font-medium text-right">Cost (₹)</th>
                    <th className="px-4 py-2 font-medium">Next Due</th>
                    <th className="px-4 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {maint.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">No maintenance logs yet.</td></tr>
                  ) : maint.slice().sort((a, b) => b.serviceDate.localeCompare(a.serviceDate)).map((l: any) => (
                    <tr key={l.id} className="h-[36px] hover:bg-muted/20">
                      <td className="px-4 font-mono text-muted-foreground">{fmt(l.serviceDate)}</td>
                      <td className="px-4 font-medium">{l.description}</td>
                      <td className="px-4 font-mono text-right">{l.cost ? `₹${Number(l.cost).toLocaleString("en-IN")}` : "—"}</td>
                      <td className="px-4 font-mono text-muted-foreground">
                        {l.nextServiceDue ? (
                          <span className={new Date(l.nextServiceDue) < new Date() ? "text-red-600 font-semibold" : ""}>
                            {fmt(l.nextServiceDue)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 text-xs text-muted-foreground">{l.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Usage Logs tab */}
        {activeTab === "usage" && (
          <Card className="rounded-sm border-border shadow-none">
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Usage Logs · {totalHours.toFixed(1)} h total
              </CardTitle>
              <Button size="sm" className="rounded-sm h-8" onClick={() => setShowUsageForm(!showUsageForm)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Log Run
              </Button>
            </CardHeader>
            {showUsageForm && (
              <form onSubmit={handleUsageSubmit} className="flex flex-wrap items-end gap-3 p-4 border-b border-border bg-muted/20">
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</Label>
                  <Input type="date" required value={usageForm.usageDate} onChange={(e) => setUsageForm({ ...usageForm, usageDate: e.target.value })} className="rounded-sm font-mono h-9 w-[150px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Work Type</Label>
                  <Input required value={usageForm.workType} onChange={(e) => setUsageForm({ ...usageForm, workType: e.target.value })} className="rounded-sm h-9 w-[180px]" placeholder="e.g. Dispatch to market" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Driver / Operator</Label>
                  <Input value={usageForm.driverName} onChange={(e) => setUsageForm({ ...usageForm, driverName: e.target.value })} className="rounded-sm h-9 w-[160px]" placeholder="Name" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Hours</Label>
                  <Input type="number" step="0.25" value={usageForm.hoursWorked} onChange={(e) => setUsageForm({ ...usageForm, hoursWorked: e.target.value })} className="rounded-sm font-mono h-9 w-[90px]" placeholder="0.0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Notes</Label>
                  <Input value={usageForm.extraNotes} onChange={(e) => setUsageForm({ ...usageForm, extraNotes: e.target.value })} className="rounded-sm h-9 w-[180px]" placeholder="Optional" />
                </div>
                <Button type="submit" size="sm" className="rounded-sm h-9" disabled={usageMut.isPending}>
                  {usageMut.isPending ? "Saving…" : "Save"}
                </Button>
              </form>
            )}
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Work Type</th>
                    <th className="px-4 py-2 font-medium">Driver / Operator</th>
                    <th className="px-4 py-2 font-medium text-right">Hours</th>
                    <th className="px-4 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {usage.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">No usage logs yet.</td></tr>
                  ) : usage.slice().sort((a, b) => b.usageDate.localeCompare(a.usageDate)).map((l: any) => (
                    <tr key={l.id} className="h-[36px] hover:bg-muted/20">
                      <td className="px-4 font-mono text-muted-foreground">{fmt(l.usageDate)}</td>
                      <td className="px-4 font-medium">{l.workType}</td>
                      <td className="px-4 text-muted-foreground">
                        {l.driverName ?? (l.notes?.startsWith("Driver:") ? l.notes.split("|")[0].replace("Driver:", "").trim() : null) ?? "—"}
                      </td>
                      <td className="px-4 font-mono text-right">{l.hoursWorked != null ? Number(l.hoursWorked).toFixed(1) : "—"}</td>
                      <td className="px-4 text-xs text-muted-foreground">{l.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </Shell>
  );
}
