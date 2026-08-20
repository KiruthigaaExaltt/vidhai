import { useEffect, useState } from "react";
import {
  useCreateCoimbatoreBatch,
  getListCoimbatoreBatchesQueryKey,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Leaf, Trash2, Search, Filter, X, Pencil } from "lucide-react";
import { useLocation } from "wouter";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataPagination } from "@/components/ui/data-pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "sonner";

const ALL_STAGES = ["FORMULATION", "PRE_WETTING", "MIXING", "TURNING", "QC_PENDING", "COMPLETED"];

function stageLabel(stage: string, currentTurnNumber?: number | null) {
  if (stage === "TURNING" && currentTurnNumber) {
    return `TURNING ${currentTurnNumber}`;
  }
  return stage.replace(/_/g, " ");
}

const DATE_INPUT_CLASS =
  "h-8 w-full rounded-md text-sm font-mono pl-2 pr-2 cursor-pointer sm:w-[140px] " +
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer " +
  "[&::-webkit-calendar-picker-indicator]:opacity-60 " +
  "[&::-webkit-calendar-picker-indicator]:hover:opacity-100 " +
  "[&::-webkit-calendar-picker-indicator]:mr-0.5";

export default function CoimbatoreBatches() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterStage, setFilterStage] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [batchPage, setBatchPage] = useState(1);
  const [batchPageSize, setBatchPageSize] = useState(10);
  useEffect(() => setBatchPage(1), [filterStage, filterStatus, filterFrom, filterTo, filterSearch]);
  const batchQuery = useQuery({
    queryKey: ["coimbatore-batches-paged", filterStage, filterStatus, filterFrom, filterTo, filterSearch, batchPage, batchPageSize],
    queryFn: async () => {
      const params = new URLSearchParams({ skip: String((batchPage - 1) * batchPageSize), limit: String(batchPageSize) });
      if (filterStage !== "__all__") params.set("stage", filterStage);
      if (filterStatus !== "__all__") params.set("status", filterStatus);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      if (filterSearch) params.set("search", filterSearch);
      const response = await fetch(`/api/coimbatore/batches?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load casing soil batches");
      return response.json() as Promise<{ data: any[]; totalCount: number; totalPages: number }>;
    },
    placeholderData: keepPreviousData,
  });
  const batches = batchQuery.data?.data ?? [];
  const isLoading = batchQuery.isLoading || batchQuery.isFetching;
  const refetch = batchQuery.refetch;

  const clearFilters = () => {
    setFilterStage("__all__");
    setFilterStatus("__all__");
    setFilterFrom("");
    setFilterTo("");
    setFilterSearch("");
  };
  const hasFilters =
    filterStage !== "__all__" ||
    filterStatus !== "__all__" ||
    !!filterFrom ||
    !!filterTo ||
    !!filterSearch;

  const filtered = batches;

  // ── Create ─────────────────────────────────────────────────────────────────
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchNotes, setBatchNotes] = useState("");

  const createBatchMutation = useCreateCoimbatoreBatch({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({
          queryKey: getListCoimbatoreBatchesQueryKey(),
        });
        queryClient.invalidateQueries({ queryKey: ["coimbatore-batches-paged"] });
        setBatchOpen(false);
        setBatchNotes("");
        setLocation(`/coimbatore/batches/${data.id}`);
        toast.success(
          "Casing soil batch created — fill in formulation to initiate",
        );
      },
      onError: (e: any) => {
        toast.error(
          e?.response?.data?.error ?? e?.message ?? "Failed to create batch",
        );
      },
    },
  });

  const handleCreateBatch = (e: React.FormEvent) => {
    e.preventDefault();
    createBatchMutation.mutate({ data: { notes: batchNotes || null } as any });
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const openEdit = (b: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTarget(b);
    setEditNotes(b.notes ?? "");
    setEditStatus(b.status ?? "active");
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/coimbatore/batches/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes: editNotes || null, status: editStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Update failed");
      }
      toast.success("Batch updated");
      queryClient.invalidateQueries({
        queryKey: getListCoimbatoreBatchesQueryKey(),
      });
      refetch();
      setEditTarget(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    code: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/coimbatore/batches/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Delete failed");
      }
      toast.success(`Batch ${deleteTarget.code} deleted`);
      queryClient.invalidateQueries({
        queryKey: getListCoimbatoreBatchesQueryKey(),
      });
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete batch");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-5 p-4 sm:p-6 md:p-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Leaf className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">
                Coimbatore — Casing Soil Batches
              </h1>
            </div>
          </div>

          <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
            <DialogTrigger asChild>
              <Button className="h-9 w-full shrink-0 rounded-md px-4 shadow-md sm:w-auto">
                <Plus className="w-4 h-4 mr-2" /> New Batch
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-md shadow-xl max-w-md">
              <DialogHeader>
                <DialogTitle>Create Casing Soil Batch</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateBatch} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Location
                  </Label>
                  <div className="px-3 py-2 bg-muted rounded-md text-sm border font-medium">
                    Coimbatore (Location C)
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Initial Notes (Optional)
                  </Label>
                  <Input
                    value={batchNotes}
                    onChange={(e) => setBatchNotes(e.target.value)}
                    className="rounded-md h-9"
                    placeholder="Any starting notes…"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  After creating, you will be taken to the batch detail page to
                  enter the formulation and initiate the turn tracker.
                </p>
                <DialogFooter className="pt-2">
                  <Button
                    type="submit"
                    disabled={createBatchMutation.isPending}
                    className="w-full rounded-md h-9"
                  >
                    {createBatchMutation.isPending
                      ? "Creating…"
                      : "Create Batch →"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filter bar */}
        <Card className="rounded-md border-border shadow-md">
          <CardContent className="p-3">
            <div className="grid grid-cols-1 items-end gap-3 sm:flex sm:flex-wrap">
              {/* Filter icon — invisible label spacer keeps it bottom-aligned with the input row */}
              <div className="hidden space-y-1 sm:block">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground opacity-0 select-none">
                  .
                </Label>
                <div className="flex items-center justify-center h-8 w-8 rounded-md border border-border bg-muted/40 shrink-0">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              {/* Search */}
              <div className="w-full space-y-1 sm:min-w-[150px] sm:w-auto">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Batch Code
                </Label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    placeholder="Search…"
                    className="h-8 rounded-md text-sm pl-8"
                  />
                </div>
              </div>

              {/* Stage */}
              <div className="w-full space-y-1 sm:w-auto">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Stage
                </Label>
                <Select value={filterStage} onValueChange={setFilterStage}>
                  <SelectTrigger className="h-8 w-full rounded-md text-sm sm:w-[150px]">
                    <SelectValue placeholder="All stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All stages</SelectItem>
                    {ALL_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {stageLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="w-full space-y-1 sm:w-auto">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Status
                </Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-8 w-full rounded-md text-sm sm:w-[130px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date From */}
              <div className="w-full space-y-1 sm:w-auto">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  From Date
                </Label>
                <Input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                  className={DATE_INPUT_CLASS}
                />
              </div>

              {/* Date To */}
              <div className="w-full space-y-1 sm:w-auto">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  To Date
                </Label>
                <Input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                  className={DATE_INPUT_CLASS}
                />
              </div>

              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 px-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5 mr-1" /> Clear
                </Button>
              )}

              <span className="ml-auto text-xs text-muted-foreground self-end pb-1">
                {Number(batchQuery.data?.totalCount || 0)} batch{Number(batchQuery.data?.totalCount || 0) !== 1 ? "es" : ""}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="rounded-md border-border shadow-md">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Loading production batches…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-medium text-center">
                        Batch Code
                      </th>
                      <th className="px-4 py-3 font-medium text-center">
                        Stage
                      </th>
                      <th className="px-4 py-3 font-medium text-center">
                        Status
                      </th>
                      <th className="px-4 py-3 font-medium text-center">
                        Created
                      </th>
                      <th className="px-4 py-3 font-medium text-center">By</th>
                      <th className="px-4 py-3 font-medium text-center">
                        Notes
                      </th>
                      <th className="px-4 py-3 w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((b: any) => (
                      <tr
                        key={b.id}
                        onClick={() =>
                          setLocation(`/coimbatore/batches/${b.id}`)
                        }
                        className="hover:bg-muted/30 cursor-pointer h-[44px] transition-colors"
                      >
                        <td className="px-4 text-center font-mono font-bold text-primary">
                          {b.batchCode}
                        </td>
                        <td className="px-4 text-center">
                          <StatusBadge
                            status={b.currentStage}
                            label={stageLabel(
                              b.currentStage,
                              b.currentTurnNumber,
                            )}
                          />
                        </td>
                        <td className="px-4 text-center">
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="px-4 text-center font-mono text-xs text-muted-foreground">
                          {new Date(b.createdAt).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-4 text-center text-xs text-muted-foreground">
                          {b.createdByName ?? "—"}
                        </td>
                        <td className="px-4 text-center text-xs text-muted-foreground max-w-[200px] truncate">
                          {b.notes ?? "—"}
                        </td>
                        <td
                          className="px-4 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground/60 hover:text-foreground hover:bg-muted"
                              onClick={(e) => openEdit(b, e)}
                              title="Edit notes / status"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({
                                  id: b.id,
                                  code: b.batchCode,
                                });
                              }}
                              title="Delete batch"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-12 text-center text-muted-foreground"
                        >
                          {hasFilters
                            ? "No batches match the current filters."
                            : "No casing soil batches yet. Create the first one."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
          <DataPagination
            currentPage={batchPage}
            pageSize={batchPageSize}
            totalCount={Number(batchQuery.data?.totalCount || 0)}
            totalPages={Number(batchQuery.data?.totalPages || 0)}
            onPageChange={setBatchPage}
            onPageSizeChange={(size) => { setBatchPageSize(size); setBatchPage(1); }}
            loading={isLoading}
          />
        </Card>
      </div>

      {/* ── Edit dialog ────────────────────────────────────────────────────────── */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent className="rounded-md shadow-xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              Edit Batch — {editTarget?.batchCode}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Status
              </Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="rounded-md h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Notes
              </Label>
              <Input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="rounded-md h-9"
                placeholder="Batch notes…"
              />
            </div>
          </div>
          <DialogFooter className="pt-3">
            <Button
              variant="outline"
              className="rounded-md"
              onClick={() => setEditTarget(null)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-md"
              disabled={saving}
              onClick={handleSaveEdit}
            >
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ────────────────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.code}</strong>{" "}
              along with all its materials, turns, and QC history. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md" disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting…" : "Delete Batch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}
