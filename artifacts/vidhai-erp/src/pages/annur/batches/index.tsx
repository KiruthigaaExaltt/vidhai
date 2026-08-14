import { useEffect, useState } from "react";
import { useListLocations } from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Trash2, Search, Filter, X, CalendarDays } from "lucide-react";
import { Link, useLocation } from "wouter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataPagination } from "@/components/ui/data-pagination";
import { toast } from "sonner";

const ALL_STAGES = [
  "PRE_WETTING",
  "T1",
  "T2",
  "T3",
  "T4",
  "BULK_CHAMBER",
  "QUALITY_CHECK",
  "SPAWN_MIXING",
  "DISPATCH",
  "COMPLETED",
];

const FILTER_INPUT =
  "h-9 rounded-md text-sm border border-border bg-background transition-all duration-200 hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20";

const DATE_INPUT = [
  FILTER_INPUT,
  "font-mono w-[160px] pl-3 pr-9",
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
  "[&::-webkit-calendar-picker-indicator]:absolute",
  "[&::-webkit-calendar-picker-indicator]:inset-0",
  "[&::-webkit-calendar-picker-indicator]:h-full",
  "[&::-webkit-calendar-picker-indicator]:w-full",
  "[&::-webkit-calendar-picker-indicator]:opacity-0",
].join(" ");

export default function Batches() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: locations } = useListLocations();
  const annurLoc = locations?.find(
    (l) => l.code === "A" || l.name.toLowerCase().includes("annur"),
  );

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
    queryKey: ["annur-batches", annurLoc?.id, filterStage, filterStatus, filterFrom, filterTo, filterSearch, batchPage, batchPageSize],
    enabled: Boolean(annurLoc?.id),
    queryFn: async () => {
      const params = new URLSearchParams({
        locationId: String(annurLoc!.id),
        skip: String((batchPage - 1) * batchPageSize),
        limit: String(batchPageSize),
      });
      if (filterStage !== "__all__") params.set("stage", filterStage);
      if (filterStatus !== "__all__") params.set("status", filterStatus);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      if (filterSearch) params.set("search", filterSearch);
      const response = await fetch(`/api/batches?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load batches");
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
    setBatchPage(1);
  };
  const hasFilters =
    filterStage !== "__all__" ||
    filterStatus !== "__all__" ||
    filterFrom ||
    filterTo ||
    filterSearch;

  const filtered = batches;

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
      const res = await fetch(`/api/batches/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Delete failed");
      }
      toast.success(`Batch ${deleteTarget.code} deleted`);
      queryClient.invalidateQueries({ queryKey: ["listBatches"] });
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
      <div className="min-w-0 w-full space-y-6 p-4 sm:p-6 md:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">
              Annur Location A — Batches
            </h1>
          </div>
          <Link href="/annur/batches/new" className="w-full sm:w-auto">
            <Button className="h-9 w-full rounded-md font-medium sm:w-auto">
              <Plus className="w-4 h-4 mr-2" /> New Batch
            </Button>
          </Link>
        </div>

        {/* Filter bar */}
        <Card className="rounded-md border-border shadow-md">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 items-end gap-3 sm:flex sm:flex-wrap">
              <Filter className="hidden w-4 h-4 text-muted-foreground mt-6 shrink-0 sm:block" />

              {/* Search */}
              <div className="space-y-1.5 min-w-[180px] flex-1 sm:max-w-[220px]">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Batch Code
                </Label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    placeholder="Search..."
                    className={`${FILTER_INPUT} pl-9`}
                  />
                </div>
              </div>

              {/* Stage */}
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Stage
                </Label>
                <Select value={filterStage} onValueChange={setFilterStage}>
                  <SelectTrigger className={`${FILTER_INPUT} w-[160px]`}>
                    <SelectValue placeholder="All stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All stages</SelectItem>
                    {ALL_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Status
                </Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className={`${FILTER_INPUT} w-[140px]`}>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="dispatched">Dispatched</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date From */}
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  From Date
                </Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute right-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-primary" />
                  <Input
                    type="date"
                    value={filterFrom}
                    onChange={(e) => setFilterFrom(e.target.value)}
                    onClick={(e) =>
                      (e.target as HTMLInputElement).showPicker?.()
                    }
                    className={`${DATE_INPUT} cursor-pointer`}
                  />
                </div>
              </div>

              {/* Date To */}
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  To Date
                </Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute right-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-primary" />
                  <Input
                    type="date"
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                    onClick={(e) =>
                      (e.target as HTMLInputElement).showPicker?.()
                    }
                    className={`${DATE_INPUT} cursor-pointer`}
                  />
                </div>
              </div>

              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-9 px-2 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5 mr-1" /> Clear
                </Button>
              )}

              <span className="ml-auto text-xs text-muted-foreground self-end pb-2">
                {Number(batchQuery.data?.totalCount || 0)} batch{Number(batchQuery.data?.totalCount || 0) !== 1 ? "es" : ""}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="rounded-md border-border shadow-md">
          <CardContent className="p-0">
            {isLoading && !filtered.length ? (
              <div className="py-20 text-center text-sm text-muted-foreground">
                Loading batches...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-center">
                        Batch Code
                      </th>
                      <th className="px-4 py-3 font-semibold text-center">
                        Stage
                      </th>
                      <th className="px-4 py-3 font-semibold text-center">
                        Status
                      </th>
                      <th className="px-4 py-3 font-semibold text-center">
                        N %
                      </th>
                      <th className="px-4 py-3 font-semibold text-center">
                        Target Bags
                      </th>
                      <th className="px-4 py-3 font-semibold text-center">
                        Created
                      </th>
                      <th className="px-4 py-3 font-semibold text-center">
                        By
                      </th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((b) => (
                      <tr
                        key={b.id}
                        onClick={() => setLocation(`/annur/batches/${b.id}`)}
                        className="hover:bg-muted/30 cursor-pointer h-[38px] transition-colors"
                      >
                        <td className="px-4 font-mono font-bold text-primary">
                          {b.batchCode}
                        </td>
                        <td className="px-4">
                          <StatusBadge status={b.currentStage} />
                        </td>
                        <td className="px-4">
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="px-4 font-mono text-right">
                          {b.nitrogenContent?.toFixed(2) ?? "—"}
                        </td>
                        <td className="px-4 font-mono text-right">
                          {b.targetBags ?? "—"}
                        </td>
                        <td className="px-4 font-mono text-xs text-muted-foreground">
                          {new Date(b.createdAt).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-4 text-xs text-muted-foreground">
                          {b.createdByName}
                        </td>
                        <td
                          className="px-4 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                            onClick={() =>
                              setDeleteTarget({ id: b.id, code: b.batchCode })
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-20 text-center text-sm text-muted-foreground"
                        >
                          {hasFilters
                            ? "No batches match the current filters."
                            : "No batches found for this location."}
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

        {/* Delete confirmation */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent className="rounded-md shadow-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Batch?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete{" "}
                <strong>{deleteTarget?.code}</strong> along with all its
                materials and stage history. This action cannot be undone.
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
      </div>
    </Shell>
  );
}
