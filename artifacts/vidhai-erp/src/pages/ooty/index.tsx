import { useState } from "react";
import {
  useListOotyRooms,
  getListOotyRoomsQueryKey,
  useCreateOotyRoom,
  useUpdateOotyRoom,
  useDeleteOotyRoom,
  useListBatches,
} from "@workspace/api-client-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Plus, Thermometer, Sprout, MoreVertical, FileUp,
  Pencil, Trash2, WrenchIcon, CheckCircle2,
} from "lucide-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { GrowingRoomImportDialog } from "./GrowingRoomImportDialog";

const PHASE_LABEL: Record<string, string> = {
  SPAWN_RUN: "Spawn Run",
  CASING_RUN: "Casing Run",
  DF: "Diff. & Fruiting",
  COOKOUT: "Cookout",
  COMPLETED: "Completed",
};

function needsDecision(phase: string, day: number | null) {
  if (day === null) return false;
  if (phase === "SPAWN_RUN" && day >= 16) return true;
  if (phase === "CASING_RUN" && day >= 8) return true;
  return false;
}

function cardColors(room: any) {
  if (room.status === "maintenance") {
    return {
      border: "border-orange-300",
      bg: "bg-orange-50 dark:bg-orange-950/20",
      text: "text-orange-700 dark:text-orange-400",
      label: "Maintenance",
    };
  }
  const batch = room.currentBatch;
  const level: string = room.alertLevel ?? "gray";
  if (!batch || level === "gray")
    return { border: "border-border", bg: "bg-muted/30", text: "text-muted-foreground", label: "Idle" };
  if (level === "red")
    return { border: "border-red-300", bg: "bg-red-50", text: "text-red-700", label: "Critical" };
  if (needsDecision(batch.currentPhase, batch.dayInPhase))
    return { border: "border-purple-300", bg: "bg-purple-50", text: "text-purple-700", label: "Needs Decision" };
  if (level === "amber")
    return { border: "border-amber-300", bg: "bg-amber-50", text: "text-amber-700", label: "Watch" };
  return { border: "border-primary/40", bg: "bg-primary/5", text: "text-primary", label: "Normal" };
}

const LEGEND = [
  { color: "bg-primary", label: "Normal" },
  { color: "bg-amber-400", label: "Watch" },
  { color: "bg-red-500", label: "Critical" },
  { color: "bg-purple-500", label: "Needs Decision" },
  { color: "bg-gray-300", label: "Idle" },
  { color: "bg-orange-400", label: "Maintenance" },
];

export default function OotyRooms() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { can } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const { data: rooms, isLoading } = useListOotyRooms();
  const { data: annurBatches } = useListBatches();
  const completedAnnurBatches =
    (annurBatches as any[] | undefined)?.filter(
      (batch: any) =>
        batch.currentStage === "COMPLETED" &&
        batch.status === "dispatched" &&
        Number(batch.actualBags) > 0,
    ) ?? [];

  const refetch = () =>
    queryClient.invalidateQueries({ queryKey: getListOotyRoomsQueryKey() });

  // ── Create room ──
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomForm, setRoomForm] = useState({ name: "", capacity: "", notes: "" });
  const createRoom = useCreateOotyRoom({
    mutation: {
      onSuccess: () => {
        refetch();
        setRoomOpen(false);
        setRoomForm({ name: "", capacity: "", notes: "" });
      },
    },
  });

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    createRoom.mutate({
      data: {
        name: roomForm.name,
        capacity: roomForm.capacity ? Number(roomForm.capacity) : null,
        notes: roomForm.notes || null,
      } as any,
    });
  };

  // ── Edit room ──
  const [editRoom, setEditRoom] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: "", capacity: "", notes: "" });
  const updateRoom = useUpdateOotyRoom({
    mutation: {
      onSuccess: () => {
        refetch();
        setEditRoom(null);
        toast({ title: "Room updated" });
      },
      onError: () => toast({ title: "Update failed", variant: "destructive" }),
    },
  });

  const openEdit = (room: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditRoom(room);
    setEditForm({
      name: room.name ?? "",
      capacity: room.capacity != null ? String(room.capacity) : "",
      notes: room.notes ?? "",
    });
  };

  const handleEditRoom = (e: React.FormEvent) => {
    e.preventDefault();
    updateRoom.mutate({
      id: editRoom.id,
      data: {
        name: editForm.name,
        capacity: editForm.capacity ? Number(editForm.capacity) : null,
        notes: editForm.notes || null,
      } as any,
    });
  };

  // ── Delete room ──
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const deleteRoom = useDeleteOotyRoom({
    mutation: {
      onSuccess: () => {
        refetch();
        setDeleteTarget(null);
        toast({ title: "Room deleted" });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Cannot delete room";
        toast({ title: "Delete failed", description: msg, variant: "destructive" });
        setDeleteTarget(null);
      },
    },
  });

  const openDelete = (room: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(room);
  };

  // ── Maintenance toggle ──
  const toggleMaintenance = useUpdateOotyRoom({
    mutation: {
      onSuccess: () => {
        refetch();
        toast({ title: "Room status updated" });
      },
      onError: () => toast({ title: "Status update failed", variant: "destructive" }),
    },
  });

  const handleToggleMaintenance = (room: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = room.status === "maintenance" ? "idle" : "maintenance";
    toggleMaintenance.mutate({
      id: room.id,
      data: { status: newStatus } as any,
    });
  };

  // ── Assign batch ──
  const [assignRoom, setAssignRoom] = useState<any>(null);
  const [assignForm, setAssignForm] = useState({
    annurBatchId: "",
    bagCount: "",
    startDate: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [assignPending, setAssignPending] = useState(false);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignRoom) return;
    setAssignPending(true);
    try {
      const res = await fetch("/api/ooty/growing-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          roomId: assignRoom.id,
          annurBatchId: assignForm.annurBatchId ? Number(assignForm.annurBatchId) : null,
          bagCount: assignForm.bagCount ? Number(assignForm.bagCount) : null,
          spawnRunStartDate: assignForm.startDate,
          notes: assignForm.notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed to start batch", description: err.error ?? "Unknown error", variant: "destructive" });
        return;
      }
      refetch();
      setAssignRoom(null);
      setAssignForm({ annurBatchId: "", bagCount: "", startDate: new Date().toISOString().split("T")[0], notes: "" });
    } finally {
      setAssignPending(false);
    }
  };

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-6 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Thermometer className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">Ooty Location B — Growing Rooms</h1>
            </div>
            
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {can("production.growing_rooms.import") && can("production.growing_rooms.create") && (
              <Button variant="outline" className="rounded-md font-medium h-9" onClick={() => setImportOpen(true)}>
                <FileUp className="w-4 h-4 mr-2" /> Import Excel
              </Button>
            )}
            {can("production.growing_rooms.create") && (
              <Button className="rounded-md font-medium h-9" onClick={() => setRoomOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> New Room
              </Button>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-5 text-xs text-muted-foreground">
          {LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
              {l.label}
            </span>
          ))}
        </div>

        {/* Room heatmap grid */}
        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {(rooms as any[])?.map((room: any) => {
              const c = cardColors(room);
              const batch = room.currentBatch;
              const isMaintenance = room.status === "maintenance";
              return (
                <Card
                  key={room.id}
                  onClick={() => !isMaintenance && setLocation(`/ooty/rooms/${room.id}`)}
                  className={`rounded-md shadow-none transition-colors ${c.border} ${c.bg} ${!isMaintenance ? "cursor-pointer hover:opacity-90" : "cursor-default opacity-80"}`}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{room.name}</p>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
                          {room.capacity ? `${room.capacity} bags` : "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Badge
                          variant="outline"
                          className={`border-0 rounded-md text-[10px] uppercase tracking-wider font-semibold ${c.bg} ${c.text}`}
                        >
                          {c.label}
                        </Badge>
                        {/* Actions menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={(e) => openEdit(room, e)}
                              className="gap-2 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit Room
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => handleToggleMaintenance(room, e)}
                              className="gap-2 cursor-pointer"
                            >
                              {isMaintenance ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-emerald-700">Mark as Available</span>
                                </>
                              ) : (
                                <>
                                  <WrenchIcon className="w-3.5 h-3.5 text-orange-500" />
                                  <span className="text-orange-700">Mark as Maintenance</span>
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => openDelete(room, e)}
                              className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                              disabled={!!batch}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete Room
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {isMaintenance ? (
                      <div className="pt-1">
                        <p className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
                          <WrenchIcon className="w-3 h-3" />
                          Under maintenance
                        </p>
                        {room.notes && (
                          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{room.notes}</p>
                        )}
                      </div>
                    ) : batch ? (
                      <div className="space-y-1.5">
                        <p className="font-mono text-sm font-bold text-foreground">{batch.batchCode}</p>
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-semibold uppercase tracking-wider ${c.text}`}>
                            {PHASE_LABEL[batch.currentPhase] ?? batch.currentPhase}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            Day {batch.dayInPhase ?? 0}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Thermometer className="w-3.5 h-3.5" />
                          {batch.lastTemperature !== null && batch.lastTemperature !== undefined
                            ? <span className="font-mono">{Number(batch.lastTemperature).toFixed(1)}°C</span>
                            : <span>No readings</span>}
                        </div>
                      </div>
                    ) : (
                      <div className="pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-md w-full h-8 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssignRoom(room);
                          }}
                        >
                          <Sprout className="w-3.5 h-3.5 mr-1.5" /> Assign Batch
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {rooms?.length === 0 && (
              <div className="col-span-full p-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-md">
                No growing rooms yet. Add the first room to begin.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create Room Dialog ── */}
      <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
        <DialogContent className="rounded-md border-border shadow-none max-w-md">
          <DialogHeader>
            <DialogTitle>Add Growing Room</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateRoom} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Room Name</Label>
              <Input
                required
                value={roomForm.name}
                onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                className="rounded-md"
                placeholder="e.g. Room 43"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Capacity (bags, optional)</Label>
              <Input
                type="number"
                value={roomForm.capacity}
                onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })}
                className="rounded-md font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes (optional)</Label>
              <Input
                value={roomForm.notes}
                onChange={(e) => setRoomForm({ ...roomForm, notes: e.target.value })}
                className="rounded-md"
                placeholder="Any notes about this room"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createRoom.isPending || !roomForm.name} className="w-full rounded-md">
                {createRoom.isPending ? "Creating..." : "Create Room"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Room Dialog ── */}
      <Dialog open={!!editRoom} onOpenChange={(o) => !o && setEditRoom(null)}>
        <DialogContent className="rounded-md border-border shadow-none max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Room — {editRoom?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditRoom} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Room Name</Label>
              <Input
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="rounded-md"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Capacity (bags)</Label>
              <Input
                type="number"
                value={editForm.capacity}
                onChange={(e) => setEditForm({ ...editForm, capacity: e.target.value })}
                className="rounded-md font-mono"
                placeholder="Leave blank to unset"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
              <Input
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="rounded-md"
                placeholder="Optional notes"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-md"
                onClick={() => setEditRoom(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateRoom.isPending || !editForm.name}
                className="rounded-md"
              >
                {updateRoom.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the room from the system. All historical batch records linked to this room
              will remain intact but the room itself cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRoom.mutate({ id: deleteTarget.id })}
              disabled={deleteRoom.isPending}
            >
              {deleteRoom.isPending ? "Deleting..." : "Delete Room"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Assign Batch Dialog ── */}
      <Dialog open={!!assignRoom} onOpenChange={(o) => !o && setAssignRoom(null)}>
        <DialogContent className="rounded-md border-border shadow-none max-w-md">
          <DialogHeader>
            <DialogTitle>Start Growing Batch — {assignRoom?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssign} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Annur Bag Batch</Label>
              <select
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                value={assignForm.annurBatchId}
                onChange={(e) => setAssignForm({ ...assignForm, annurBatchId: e.target.value })}
              >
                <option value="">— Select Annur batch —</option>
                {completedAnnurBatches.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.batchCode} — {b.actualBags} produced bags
                  </option>
                ))}
                {completedAnnurBatches.length === 0 && (
                  <option value="" disabled>No completed Annur batches available</option>
                )}
              </select>
              <p className="text-[11px] text-muted-foreground">Only completed Annur batches with produced bags are shown. One Annur batch can supply multiple rooms.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bags Allocated to this Room</Label>
              <Input
                type="number"
                min="1"
                placeholder="e.g. 500 bags"
                value={assignForm.bagCount}
                onChange={(e) => setAssignForm({ ...assignForm, bagCount: e.target.value })}
                className="rounded-md font-mono"
              />
              <p className="text-[11px] text-muted-foreground">How many bags from this Annur batch are going into {assignRoom?.name}?</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Spawn Run Start Date</Label>
              <Input
                type="date"
                required
                value={assignForm.startDate}
                onChange={(e) => setAssignForm({ ...assignForm, startDate: e.target.value })}
                className="rounded-md font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes (Optional)</Label>
              <Input
                value={assignForm.notes}
                onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                className="rounded-md"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={assignPending} className="w-full rounded-md">
                {assignPending ? "Starting..." : "Start Spawn Run"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <GrowingRoomImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existingRooms={(rooms as any[]) ?? []}
        completedAnnurBatches={completedAnnurBatches}
        onImported={refetch}
      />
    </Shell>
  );
}
