import {
  useCreateLabBatch,
  getListLabBatchesQueryKey,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, FlaskConical, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DataPagination } from "@/components/ui/data-pagination";
import { toast } from "sonner";

function stageLabel(stage: string) {
  if (stage === "MS") return "Mother Spawn";
  if (stage === "PLATE_PREP") return "Plate Prep";
  if (stage === "SPAWN") return "Spawn";
  if (stage === "COMPLETED") return "Completed";
  return stage;
}

export default function LabBatches() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [batchPage, setBatchPage] = useState(1);
  const [batchPageSize, setBatchPageSize] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const batchQuery = useQuery({
    queryKey: ["lab-batches-paged", batchPage, batchPageSize],
    queryFn: async () => {
      const response = await fetch(`/api/lab/batches?skip=${(batchPage - 1) * batchPageSize}&limit=${batchPageSize}`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load spawn batches");
      return response.json() as Promise<{ data: any[]; totalCount: number; totalPages: number }>;
    },
    placeholderData: keepPreviousData,
  });
  const batches = batchQuery.data?.data ?? [];
  const isLoading = batchQuery.isLoading || batchQuery.isFetching;

  const createMutation = useCreateLabBatch({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({
          queryKey: getListLabBatchesQueryKey(),
        });
        queryClient.invalidateQueries({ queryKey: ["lab-batches-paged"] });
        setOpen(false);
        setNotes("");
        setLocation(`/lab/batches/${data.id}`);
      },
      onError: (error: any) => {
        toast.error(
          error?.response?.data?.error ??
            error?.message ??
            "Unable to create spawn batch",
        );
      },
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: { notes: notes || null } });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/lab/batches/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to delete spawn batch");
      }
      toast.success(`Spawn batch ${deleteTarget.batchCode} deleted`);
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["lab-batches-paged"] });
      await queryClient.invalidateQueries({ queryKey: getListLabBatchesQueryKey() });
    } catch (error: any) {
      toast.error(error.message ?? "Unable to delete spawn batch");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-4 sm:p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">
                Lab Location D — Spawn Preparation
              </h1>
            </div>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="h-9 w-full rounded-sm font-medium sm:w-auto">
                <Plus className="w-4 h-4 mr-2" /> New Spawn Batch
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-sm border-border shadow-none max-w-md">
              <DialogHeader>
                <DialogTitle>Initiate Spawn Batch</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Location
                  </Label>
                  <div className="px-3 py-2 bg-muted rounded-sm text-sm border font-medium">
                    Lab (Location D)
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Initial Notes (Optional)
                  </Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="rounded-sm"
                    placeholder="Strain, media notes..."
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="w-full rounded-sm"
                  >
                    {createMutation.isPending ? "Creating..." : "Create Batch"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="rounded-sm border-border shadow-none">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="px-4 py-2 font-medium">Batch Code</th>
                      <th className="px-4 py-2 font-medium">Stage</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Created</th>
                      <th className="px-4 py-2 font-medium">By</th>
                      <th className="px-4 py-2 font-medium">Notes</th>
                      <th className="px-4 py-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {batches.map((b: any) => (
                      <tr
                        key={b.id}
                        onClick={() => setLocation(`/lab/batches/${b.id}`)}
                        className="hover:bg-muted/30 cursor-pointer h-[36px] transition-colors"
                      >
                        <td className="px-4 font-mono font-bold text-primary">
                          {b.batchCode}
                        </td>
                        <td className="px-4">
                          <StatusBadge
                            status={b.currentStage}
                            label={stageLabel(b.currentStage)}
                          />
                        </td>
                        <td className="px-4">
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="px-4 font-mono text-muted-foreground">
                          {new Date(b.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 text-muted-foreground">
                          {b.createdByName ?? "—"}
                        </td>
                        <td className="px-4 text-muted-foreground truncate max-w-[200px]">
                          {b.notes ?? "—"}
                        </td>
                        <td
                          className="px-4 text-right"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Delete spawn batch ${b.batchCode}`}
                            onClick={() => setDeleteTarget(b)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {batches?.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-8 text-center text-muted-foreground"
                        >
                          No spawn batches yet. Create the first one.
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

        <AlertDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
        >
          <AlertDialogContent className="rounded-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete spawn batch?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete spawn batch{" "}
                <strong>{deleteTarget?.batchCode}</strong>. This action cannot
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-sm" disabled={deleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="rounded-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? "Deleting..." : "Delete Batch"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Shell>
  );
}
