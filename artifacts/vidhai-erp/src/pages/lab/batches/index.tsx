import {
  useListLabBatches,
  useCreateLabBatch,
  getListLabBatchesQueryKey,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, FlaskConical } from "lucide-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";


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
  const { data: batches, isLoading } = useListLabBatches();

  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const createMutation = useCreateLabBatch({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: getListLabBatchesQueryKey() });
        setOpen(false);
        setNotes("");
        setLocation(`/lab/batches/${data.id}`);
      },
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: { notes: notes || null } });
  };

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-6 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">Lab Location D — Spawn Preparation</h1>
            </div>
            
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-sm font-medium h-9">
                <Plus className="w-4 h-4 mr-2" /> New Spawn Batch
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-sm border-border shadow-none max-w-md">
              <DialogHeader>
                <DialogTitle>Initiate Spawn Batch</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Location</Label>
                  <div className="px-3 py-2 bg-muted rounded-sm text-sm border font-medium">Lab (Location D)</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Initial Notes (Optional)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-sm" placeholder="Strain, media notes..." />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} className="w-full rounded-sm">
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
              <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {batches?.map((b: any) => (
                      <tr
                        key={b.id}
                        onClick={() => setLocation(`/lab/batches/${b.id}`)}
                        className="hover:bg-muted/30 cursor-pointer h-[36px] transition-colors"
                      >
                        <td className="px-4 font-mono font-bold text-primary">{b.batchCode}</td>
                        <td className="px-4">
                          <StatusBadge status={b.currentStage} label={stageLabel(b.currentStage)} />
                        </td>
                        <td className="px-4">
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="px-4 font-mono text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 text-muted-foreground">{b.createdByName ?? "—"}</td>
                        <td className="px-4 text-muted-foreground truncate max-w-[200px]">{b.notes ?? "—"}</td>
                      </tr>
                    ))}
                    {batches?.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          No spawn batches yet. Create the first one.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
