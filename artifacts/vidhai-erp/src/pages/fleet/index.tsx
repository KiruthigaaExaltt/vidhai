import { useState } from "react";
import {
  getListVehiclesQueryKey,
  useCreateVehicle,
  useUpdateVehicle,
} from "@workspace/api-client-react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { DataPagination } from "@/components/ui/data-pagination";
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
import { Truck, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

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

const MAINTENANCE_LABELS: Record<string, string> = {
  ok: "OK",
  due_soon: "Due Soon",
  overdue: "Overdue",
};
const MAINTENANCE_COLORS: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-0",
  due_soon: "bg-amber-50 text-amber-700 border-0",
  overdue: "bg-red-50 text-red-600 border-0",
};
const fmtValue = (value: any) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") {
    if ("$numberDecimal" in value) return String(value.$numberDecimal);
    if ("value" in value) return String(value.value);
    if (typeof value.toString === "function" && value.toString !== Object.prototype.toString) return value.toString();
    return JSON.stringify(value);
  }
  return String(value);
};
const fmtNumberInput = (value: any, fallback = "7") => {
  const normalized = fmtValue(value);
  return normalized === "-" ? fallback : normalized;
};
const fmtDate = (value: any) => value ? new Date(value).toLocaleDateString("en-IN") : "-";
const fmtDateTime = (value: any) => value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-";
const EMPTY_FORM = {
  name: "",
  regNo: "",
  vehicleType: "truck" as VehicleType,
  homeLocationId: null as number | null,
  notes: "",
  lastMaintenanceDate: "",
  nextMaintenanceDate: "",
};

export default function FleetList() {
  const queryClient = useQueryClient();
  const [deleteVehicle, setDeleteVehicle] = useState<any | null>(null);

  const refetch = () =>
    queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
  const createMut = useCreateVehicle({ mutation: { onSuccess: refetch } });
  const updateMut = useUpdateVehicle({ mutation: { onSuccess: refetch } });
  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/fleet/vehicles/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Unable to delete vehicle");
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: getListVehiclesQueryKey(),
      });
      const previous = queryClient.getQueriesData({
        queryKey: getListVehiclesQueryKey(),
      });
      queryClient.setQueriesData(
        { queryKey: getListVehiclesQueryKey() },
        (current: any) => {
          if (!current?.data) return current;
          const data = current.data.filter((vehicle: any) => vehicle.id !== id);
          if (data.length === current.data.length) return current;
          const totalCount = Math.max(0, Number(current.totalCount || 0) - 1);
          return {
            ...current,
            data,
            totalCount,
            totalPages: Math.ceil(totalCount / pageSize),
          };
        },
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success("Vehicle deleted");
    },
    onError: (error: Error, _id, context) => {
      for (const [queryKey, data] of context?.previous ?? [])
        queryClient.setQueryData(queryKey, data);
      toast.error(error.message);
    },
    onSettled: () => {
      void refetch();
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<any | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [completedPage, setCompletedPage] = useState(1);
  const [completedPageSize, setCompletedPageSize] = useState(10);
  const [statusFilters, setStatusFilters] = useState({ dateFrom: "", dateTo: "", search: "" });
  const [statusQueryParams, setStatusQueryParams] = useState({ dateFrom: "", dateTo: "", search: "" });
  const [maintenanceFilters, setMaintenanceFilters] = useState({ dateFrom: "", dateTo: "", vehicleSearch: "" });
  const [maintenanceQueryParams, setMaintenanceQueryParams] = useState({ dateFrom: "", dateTo: "", vehicleSearch: "" });
  const [maintenanceForm, setMaintenanceForm] = useState({
    vehicleId: "",
    maintenanceStartedDate: new Date().toISOString().slice(0, 10),
    maintenanceFinishedDate: "",
    nextMaintenanceDate: "",
    status: "In maintenance",
    description: "",
    cost: "",
    notes: "",
  });
  const vehiclesQuery = useQuery({
    queryKey: [...getListVehiclesQueryKey(), filterStatus, currentPage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({ status: filterStatus, skip: String((currentPage - 1) * pageSize), limit: String(pageSize) });
      const response = await fetch(`/api/fleet/vehicles?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load vehicles");
      return response.json();
    },
    placeholderData: keepPreviousData,
  });
  const list: any[] = vehiclesQuery.data?.data ?? [];
  const { isLoading, isFetching } = vehiclesQuery;
  const statusHistoryQuery = useQuery({
    queryKey: ["fleet-status-history", filterStatus, statusQueryParams],
    queryFn: async () => {
      const params = new URLSearchParams({ status: filterStatus });
      if (statusQueryParams.dateFrom) params.set("dateFrom", statusQueryParams.dateFrom);
      if (statusQueryParams.dateTo) params.set("dateTo", statusQueryParams.dateTo);
      if (statusQueryParams.search) params.set("search", statusQueryParams.search);
      const response = await fetch(`/api/fleet/status-history?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load vehicle status history");
      return response.json();
    },
  });
  const statusHistory = statusHistoryQuery.data ?? { current: [], completed: [] };
  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: VehicleStatus }) => {
      const response = await fetch(`/api/fleet/vehicles/${id}/status`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Unable to update vehicle status");
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success("Vehicle status updated");
      void refetch();
      queryClient.invalidateQueries({ queryKey: ["fleet-status-history"] });
      queryClient.invalidateQueries({ queryKey: ["fleet-maintenance-logs"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const maintenanceLogsQuery = useQuery({
    queryKey: ["fleet-maintenance-logs", maintenanceQueryParams],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (maintenanceQueryParams.dateFrom) params.set("dateFrom", maintenanceQueryParams.dateFrom);
      if (maintenanceQueryParams.dateTo) params.set("dateTo", maintenanceQueryParams.dateTo);
      if (maintenanceQueryParams.vehicleSearch) params.set("vehicleSearch", maintenanceQueryParams.vehicleSearch);
      const response = await fetch(`/api/fleet/maintenance-logs?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load maintenance history");
      return response.json();
    },
  });
  const maintenanceLogs: any[] = maintenanceLogsQuery.data ?? [];
  const maintenanceMut = useMutation({
    mutationFn: async (payload: any) => {
      const response = await fetch("/api/fleet/maintenance-logs", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Unable to save maintenance log");
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success("Maintenance log saved");
      queryClient.invalidateQueries({ queryKey: ["fleet-maintenance-logs"] });
      void refetch();
      setMaintenanceForm({ vehicleId: "", maintenanceStartedDate: new Date().toISOString().slice(0, 10), maintenanceFinishedDate: "", nextMaintenanceDate: "", status: "In maintenance", description: "", cost: "", notes: "" });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const settingsQuery = useQuery({
    queryKey: ["fleet-settings"],
    queryFn: async () => {
      const response = await fetch("/api/fleet/settings", { credentials: "include" });
      if (!response.ok) return { serviceReminderDays: 7 };
      return response.json();
    },
  });
  const settingsMut = useMutation({
    mutationFn: async (serviceReminderDays: number) => {
      const response = await fetch("/api/fleet/settings", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceReminderDays }) });
      if (!response.ok) throw new Error("Unable to update fleet settings");
      return response.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["fleet-settings"] }); refetch(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const fleetLoadError = vehiclesQuery.error || statusHistoryQuery.error || maintenanceLogsQuery.error;
  const fleetLoadErrorMessage = fleetLoadError instanceof Error ? fleetLoadError.message : null;

  const openNew = () => {
    setEditVehicle(null);
    setForm({ ...EMPTY_FORM });
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
      lastMaintenanceDate: v.lastMaintenanceDate ?? "",
      nextMaintenanceDate: v.nextMaintenanceDate ?? "",
    });
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
        {
          id: editVehicle.id,
          data: {
            name: form.name,
            regNo: form.regNo,
            vehicleType: form.vehicleType,
            homeLocationId: form.homeLocationId,
            notes: form.notes || null,
            lastMaintenanceDate: form.lastMaintenanceDate || null,
            nextMaintenanceDate: form.nextMaintenanceDate || null,
          } as any,
        },
        {
          onSuccess: () => setDialogOpen(false),
          onError: (e: any) => setFormError(e?.message ?? "Update failed."),
        },
      );
    } else {
      createMut.mutate(
        {
          data: {
            name: form.name,
            regNo: form.regNo,
            vehicleType: form.vehicleType,
            homeLocationId: form.homeLocationId,
            notes: form.notes || null,
            lastMaintenanceDate: form.lastMaintenanceDate || null,
            nextMaintenanceDate: form.nextMaintenanceDate || null,
          } as any,
        },
        {
          onSuccess: () => setDialogOpen(false),
          onError: (e: any) => setFormError(e?.message ?? "Create failed."),
        },
      );
    }
  };

  const handleDelete = (vehicle: any) => {
    setDeleteVehicle(vehicle);
  };

  const handleMaintenanceSave = () => {
    if (!maintenanceForm.vehicleId || !maintenanceForm.maintenanceStartedDate || !maintenanceForm.description.trim()) {
      toast.error("Vehicle, started date and description are required");
      return;
    }
    maintenanceMut.mutate({
      vehicleId: Number(maintenanceForm.vehicleId),
      maintenanceStartedDate: maintenanceForm.maintenanceStartedDate,
      maintenanceFinishedDate: maintenanceForm.status === "Maintenance completed" ? maintenanceForm.maintenanceFinishedDate || maintenanceForm.maintenanceStartedDate : null,
      nextMaintenanceDate: maintenanceForm.nextMaintenanceDate || null,
      status: maintenanceForm.status,
      description: maintenanceForm.description,
      cost: maintenanceForm.cost || null,
      notes: maintenanceForm.notes || null,
    });
  };
  const completedHistory = Array.isArray(statusHistory.completed) ? statusHistory.completed : [];
  const completedTotalPages = Math.max(1, Math.ceil(completedHistory.length / completedPageSize));
  const safeCompletedPage = Math.min(completedPage, completedTotalPages);
  const pagedCompletedHistory = completedHistory.slice((safeCompletedPage - 1) * completedPageSize, safeCompletedPage * completedPageSize);

  const filtered = list.filter((vehicle: any) => {
    const search = statusQueryParams.search.trim().toLowerCase();
    if (!search) return true;
    return `${vehicle.name || ""} ${vehicle.regNo || ""} ${vehicle.vehicleType || ""}`.toLowerCase().includes(search);
  });

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-4 sm:p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Truck className="w-6 h-6 text-primary" /> Vehicle Fleet
            </h1>
          </div>
          <Button size="sm" className="h-9 w-full rounded-sm md:h-8 md:w-auto" onClick={openNew}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Vehicle
          </Button>
        </div>

        {fleetLoadErrorMessage && (
          <Card className="rounded-sm border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-destructive">Vehicle Fleet could not load completely</p>
                <p className="mt-1 text-xs text-muted-foreground">{fleetLoadErrorMessage}</p>
              </div>
              <Button variant="outline" className="h-9 rounded-sm" onClick={() => { void refetch(); queryClient.invalidateQueries({ queryKey: ["fleet-status-history"] }); queryClient.invalidateQueries({ queryKey: ["fleet-maintenance-logs"] }); }}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-sm border-border shadow-none">
          <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Maintenance reminders</p>
              <p className="text-xs text-muted-foreground">Global alert window for upcoming vehicle maintenance dates.</p>
            </div>
            <div className="flex items-center gap-2">
              <Input type="number" min="0" max="365" className="h-9 w-24 rounded-sm" defaultValue={fmtNumberInput(settingsQuery.data?.serviceReminderDays)} onBlur={(e) => settingsMut.mutate(Number(e.target.value || 7))} />
              <span className="text-xs text-muted-foreground">days before due</span>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-sm border-border shadow-none">
          <CardContent className="grid gap-3 p-3 md:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">From</Label>
              <Input type="date" className="h-10 w-full min-w-0 rounded-sm pr-2 text-sm" value={statusFilters.dateFrom} onChange={(e) => setStatusFilters({ ...statusFilters, dateFrom: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">To</Label>
              <Input type="date" className="h-10 w-full min-w-0 rounded-sm pr-2 text-sm" value={statusFilters.dateTo} onChange={(e) => setStatusFilters({ ...statusFilters, dateTo: e.target.value })} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Vehicle</Label>
              <Input className="h-9 rounded-sm" placeholder="Vehicle name, number, type" value={statusFilters.search} onChange={(e) => setStatusFilters({ ...statusFilters, search: e.target.value })} />
            </div>
            <div className="flex items-end">
              <Button className="h-9 w-full rounded-sm" onClick={() => { setStatusQueryParams({ ...statusFilters }); }}>Search</Button>
            </div>
          </CardContent>
        </Card>
        {/* Status filter */}
        <div className="flex w-full gap-1 overflow-x-auto pb-1">
          {["ALL", "available", "in_use", "maintenance", "retired"].map((s) => (
            <button
              key={s}
              onClick={() => {
                setFilterStatus(s);
                setCurrentPage(1);
                setCompletedPage(1);
              }}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-sm text-xs font-medium border transition-colors ${
                filterStatus === s
                  ? "bg-primary text-white border-primary"
                  : "bg-background border-border text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {s === "ALL" ? "All" : STATUS_LABELS[s as VehicleStatus]}
            </button>
          ))}
        </div>

        <Card className="rounded-sm border-border shadow-none"><CardContent className="border-b p-3"><p className="text-sm font-semibold">Current {filterStatus === "ALL" ? "Vehicles" : STATUS_LABELS[filterStatus as VehicleStatus]}</p></CardContent></Card>
        {/* Vehicle table */}
        <Card className="rounded-sm border-border shadow-none">
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-sm text-muted-foreground">
                Loading vehicles…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No vehicles.{" "}
                <button
                  className="text-primary underline underline-offset-2"
                  onClick={openNew}
                >
                  Add the first one.
                </button>
              </div>
            ) : (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Reg No.</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Home Location</th>
                    <th className="px-4 py-2 font-medium">Last Maintenance</th>
                    <th className="px-4 py-2 font-medium">Next Maintenance</th>
                    <th className="px-4 py-2 font-medium">Maintenance Alert</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Notes</th>
                    <th className="px-4 py-2 font-medium">Change Status</th><th className="sticky right-0 z-10 bg-muted/50 px-4 py-2 text-right font-medium w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((v: any) => (
                    <tr
                      key={v.id}
                      className="h-[36px] hover:bg-muted/20"
                    >
                      <td className="px-4 font-semibold">{v.name}</td>
                      <td className="px-4 font-mono text-muted-foreground">
                        {v.regNo}
                      </td>
                      <td className="px-4">
                        {TYPE_LABELS[v.vehicleType as VehicleType] ??
                          v.vehicleType}
                      </td>
                      <td className="px-4 text-muted-foreground">
                        {v.homeLocationName ??
                          v.homeLocationCode ??
                          "Cross-site"}
                      </td>
                      <td className="px-4 font-mono text-xs text-muted-foreground">{fmtDate(v.lastMaintenanceDate)}</td>
                      <td className="px-4 font-mono text-xs text-muted-foreground">{fmtDate(v.nextMaintenanceDate)}</td>
                      <td className="px-4"><Badge variant="outline" className={`rounded-sm text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 ${MAINTENANCE_COLORS[v.maintenanceAlertStatus] ?? MAINTENANCE_COLORS.ok}`}>{MAINTENANCE_LABELS[v.maintenanceAlertStatus] ?? "OK"}</Badge></td>
                      <td className="px-4">
                        <Badge
                          variant="outline"
                          className={`rounded-sm text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 ${STATUS_COLORS[v.status as VehicleStatus] ?? ""}`}
                        >
                          {STATUS_LABELS[v.status as VehicleStatus] ?? v.status}
                        </Badge>
                      </td>
                      <td className="px-4 text-xs text-muted-foreground max-w-[180px] truncate">
                        {v.notes ?? "—"}
                      </td>
                      <td className="px-4">
                        <select className="h-8 rounded-sm border border-border bg-background px-2 text-xs" value={v.status} disabled={statusMut.isPending} onClick={(e) => e.stopPropagation()} onChange={(e) => { e.stopPropagation(); const nextStatus = e.target.value as VehicleStatus; if (nextStatus === v.status) return; statusMut.mutate({ id: v.id, status: nextStatus }); }}>
                          {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                        </select>
                      </td>
                      <td className="sticky right-0 z-10 bg-background px-4 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.35)]">
                        <div
                          className="flex justify-end gap-1 items-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => openEdit(v)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(v)}
                            disabled={deleteMut.isPending}
                            className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50"
                            title="Delete vehicle"
                          >
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
          <DataPagination
            currentPage={currentPage}
            pageSize={pageSize}
            totalCount={Number(vehiclesQuery.data?.totalCount || 0)}
            totalPages={Number(vehiclesQuery.data?.totalPages || 0)}
            loading={isFetching}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        </Card>
        {filterStatus !== "available" && (
        <Card className="rounded-sm border-border shadow-none">
          <CardContent className="border-b p-3"><p className="text-sm font-semibold">Completed {filterStatus === "ALL" ? "Status History" : STATUS_LABELS[filterStatus as VehicleStatus]}</p></CardContent>
          <CardContent className="p-0 overflow-x-auto">
            {statusHistoryQuery.isLoading ? <div className="p-8 text-sm text-muted-foreground">Loading status history...</div> : (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr><th className="px-4 py-2 font-medium">Vehicle</th><th className="px-4 py-2 font-medium">Type</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 font-medium">Date + Time In</th><th className="px-4 py-2 font-medium">Date + Time Out</th><th className="px-4 py-2 font-medium">Hours</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {completedHistory.length === 0 ? <tr><td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>No completed history.</td></tr> : pagedCompletedHistory.map((row: any) => (
                    <tr key={row.id} className="h-[36px] hover:bg-muted/20">
                      <td className="px-4"><span className="font-semibold">{row.vehicleName}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{row.vehicleRegNo}</span></td>
                      <td className="px-4">{TYPE_LABELS[row.vehicleType as VehicleType] ?? row.vehicleType}</td>
                      <td className="px-4"><Badge variant="outline" className={`rounded-sm text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 ${STATUS_COLORS[row.status as VehicleStatus] ?? ""}`}>{STATUS_LABELS[row.status as VehicleStatus] ?? row.status}</Badge></td>
                      <td className="px-4 font-mono text-xs text-muted-foreground">{fmtDateTime(row.startedAt)}</td>
                      <td className="px-4 font-mono text-xs text-muted-foreground">{fmtDateTime(row.endedAt)}</td>
                      <td className="px-4 font-mono text-xs text-muted-foreground">{fmtValue(row.durationHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
          <DataPagination
            currentPage={safeCompletedPage}
            pageSize={completedPageSize}
            totalCount={completedHistory.length}
            totalPages={completedTotalPages}
            loading={statusHistoryQuery.isFetching}
            onPageChange={setCompletedPage}
            onPageSizeChange={(size) => {
              setCompletedPageSize(size);
              setCompletedPage(1);
            }}
          />
        </Card>
        )}
        {/* Add / Edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="rounded-sm border-border shadow-none max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editVehicle ? `Edit — ${editVehicle.name}` : "Add Vehicle"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Vehicle Name
                  </Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="rounded-sm h-9"
                    placeholder="e.g. KA-01 Tempo"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Registration No.
                  </Label>
                  <Input
                    value={form.regNo}
                    onChange={(e) =>
                      setForm({ ...form, regNo: e.target.value })
                    }
                    className="rounded-sm font-mono h-9"
                    placeholder="TN-XX-XXXX"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Type
                  </Label>
                  <select
                    className="w-full h-9 rounded-sm border border-border bg-background px-3 text-sm"
                    value={form.vehicleType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        vehicleType: e.target.value as VehicleType,
                      })
                    }
                  >
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Home Location
                  </Label>
                  <select
                    className="w-full h-9 rounded-sm border border-border bg-background px-3 text-sm"
                    value={form.homeLocationId ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        homeLocationId: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  >
                    {HOME_LOCS.map((l) => (
                      <option key={l.id ?? "none"} value={l.id ?? ""}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Last maintenance date
                  </Label>
                  <Input
                    type="date"
                    value={form.lastMaintenanceDate}
                    onChange={(e) => setForm({ ...form, lastMaintenanceDate: e.target.value })}
                    className="rounded-sm h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Next maintenance date
                  </Label>
                  <Input
                    type="date"
                    value={form.nextMaintenanceDate}
                    onChange={(e) => setForm({ ...form, nextMaintenanceDate: e.target.value })}
                    className="rounded-sm h-9"
                  />
                </div>
              </div>              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="rounded-sm h-9"
                  placeholder="Optional"
                />
              </div>
              {formError && (
                <p className="text-xs text-destructive font-medium">
                  {formError}
                </p>
              )}
            </div>
            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                className="rounded-sm"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="rounded-sm"
                disabled={createMut.isPending || updateMut.isPending}
                onClick={handleSave}
              >
                {createMut.isPending || updateMut.isPending
                  ? "Saving…"
                  : editVehicle
                    ? "Update"
                    : "Add Vehicle"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={Boolean(deleteVehicle)}
          onOpenChange={(open) => {
            if (!open && !deleteMut.isPending) setDeleteVehicle(null);
          }}
        >
          <AlertDialogContent className="rounded-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete vehicle?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete {deleteVehicle?.name} and its
                related fuel, maintenance, and usage logs.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="rounded-sm"
                disabled={deleteMut.isPending}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="rounded-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMut.isPending}
                onClick={() => {
                  if (!deleteVehicle) return;
                  const id = deleteVehicle.id;
                  if (list.length === 1 && currentPage > 1)
                    setCurrentPage(currentPage - 1);
                  setDeleteVehicle(null);
                  deleteMut.mutate(id);
                }}
              >
                {deleteMut.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Shell>
  );
}
