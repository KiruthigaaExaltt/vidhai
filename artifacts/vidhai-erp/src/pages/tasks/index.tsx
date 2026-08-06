import { useState } from "react";
import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useListBatches,
  useListUsers,
  Task,
  TaskStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Trash2, Pencil, CheckSquare } from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS = [
  { value: "todo", label: "To Do", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "done", label: "Done", color: "bg-green-50 text-green-700 border-green-200" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-50 text-red-700 border-red-200" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function StatusBadge({ status }: { status: string }) {
  const opt = STATUS_OPTIONS.find((s) => s.value === status);
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${opt?.color ?? "bg-muted text-muted-foreground"}`}>
      {opt?.label ?? status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    low: "text-slate-500",
    medium: "text-blue-600",
    high: "text-orange-600",
    urgent: "text-red-600 font-bold",
  };
  return <span className={`text-xs ${colors[priority] ?? "text-muted-foreground"}`}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</span>;
}

const EMPTY_FORM = {
  title: "",
  description: "",
  assigneeId: "",
  batchRef: "",
  status: "todo",
  priority: "medium",
  startTime: "",
  estimatedMinutes: "",
  notes: "",
};

export default function Tasks() {
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useListTasks();
  const { data: users } = useListUsers();
  const { data: batches } = useListBatches();

  const createTask = useCreateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
        setOpen(false);
        setForm(EMPTY_FORM);
        toast.success("Task created");
      },
    },
  });

  const updateTask = useUpdateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
        setEditTask(null);
        toast.success("Task updated");
      },
    },
  });

  const deleteTask = useDeleteTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
        toast.success("Task deleted");
      },
    },
  });

  const [open, setOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = (tasks ?? []).filter((t) =>
    filterStatus === "all" ? true : t.status === filterStatus
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.assigneeId) { toast.error("Assignee is required"); return; }
    if (!form.batchRef) { toast.error("Batch Mapping is required"); return; }
    createTask.mutate({
      data: {
        title: form.title,
        description: form.description || null,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
        batchRef: form.batchRef || null,
        status: form.status,
        priority: form.priority,
        startTime: form.startTime || null,
        estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : null,
        notes: form.notes || null,
      },
    });
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTask) return;
    if (!form.assigneeId) { toast.error("Assignee is required"); return; }
    if (!form.batchRef) { toast.error("Batch Mapping is required"); return; }
    updateTask.mutate({
      id: editTask.id,
      data: {
        title: form.title,
        description: form.description || null,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
        batchRef: form.batchRef || null,
        status: form.status,
        priority: form.priority,
        startTime: form.startTime || null,
        estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : null,
        notes: form.notes || null,
      },
    });
  };

  const openEdit = (t: Task) => {
    setEditTask(t);
    setForm({
      title: t.title,
      description: t.description ?? "",
      assigneeId: t.assigneeId ? String(t.assigneeId) : "",
      batchRef: (t as any).batchRef ?? "",
      status: t.status,
      priority: t.priority,
      startTime: t.startTime ? t.startTime.slice(0, 16) : "",
      estimatedMinutes: t.estimatedMinutes ? String(t.estimatedMinutes) : "",
      notes: t.notes ?? "",
    });
  };

  const TaskForm = ({ onSubmit, submitting, isCreate = false }: { onSubmit: (e: React.FormEvent) => void; submitting: boolean; isCreate?: boolean }) => (
    <form onSubmit={onSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Task Name <span className="text-destructive">*</span></Label>
        <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Apply gypsum in Chamber 3" className="rounded-lg h-10 shadow-sm focus-visible:ring-4 focus-visible:ring-primary/10" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Description</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Task details..." className="rounded-lg min-h-[72px] shadow-sm focus-visible:ring-4 focus-visible:ring-primary/10" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Assignee <span className="text-destructive">*</span></Label>
          <Select value={form.assigneeId} onValueChange={(v) => setForm({ ...form, assigneeId: v })}>
            <SelectTrigger className="rounded-lg h-10 shadow-sm">
              <SelectValue placeholder="Select person" />
            </SelectTrigger>
            <SelectContent className="rounded-lg">
              {(users ?? []).map((u: any) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Batch Mapping <span className="text-destructive">*</span></Label>
          <Select value={form.batchRef} onValueChange={(v) => setForm({ ...form, batchRef: v })}>
            <SelectTrigger className="rounded-lg h-10 shadow-sm">
              <SelectValue placeholder="Link to batch" />
            </SelectTrigger>
            <SelectContent className="rounded-lg">
              {(batches ?? []).map((b: any) => (
                <SelectItem key={b.id} value={b.batchCode}>{b.batchCode}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {!isCreate && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger className="rounded-lg h-10 shadow-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-lg">
                {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Priority</Label>
          <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
            <SelectTrigger className="rounded-lg h-10 shadow-sm"><SelectValue /></SelectTrigger>
            <SelectContent className="rounded-lg">
              {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {!isCreate && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Start Time</Label>
            <Input type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="rounded-lg h-10 shadow-sm focus-visible:ring-4 focus-visible:ring-primary/10" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Duration (minutes)</Label>
            <Input type="number" min="0" value={form.estimatedMinutes} onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })} className="rounded-lg h-10 font-mono shadow-sm focus-visible:ring-4 focus-visible:ring-primary/10" placeholder="e.g. 60" />
          </div>
        </div>
      )}
      <DialogFooter className="pt-2">
        <Button type="submit" disabled={submitting} className="w-full rounded-lg h-10 shadow-sm hover:shadow-md transition-all">
          {submitting ? "Saving..." : editTask ? "Update Task" : "Create Task"}
        </Button>
      </DialogFooter>
    </form>
  );

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckSquare className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">Tasks</h1>
            </div>
          </div>
          <Button onClick={() => { setForm(EMPTY_FORM); setOpen(true); }} className="rounded-lg h-10 px-4 shadow-sm hover:shadow-md transition-all">
            <Plus className="w-4 h-4 mr-2" /> New Task
          </Button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mr-2">Filter:</span>
          {[{ value: "all", label: "All" }, ...STATUS_OPTIONS].map((s) => (
            <button
              key={s.value}
              onClick={() => setFilterStatus(s.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all ${
                filterStatus === s.value
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-white border-border text-muted-foreground hover:border-primary/50 hover:shadow-sm"
              }`}
            >
              {s.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground font-mono">{filtered.length} task{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Table */}
        <Card className="rounded-xl border-border/60 shadow-sm ring-1 ring-black/[0.03] overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-20 text-center text-sm text-muted-foreground">Loading tasks...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border/60">
                    <tr>
                      <th className="px-4 py-3.5 font-semibold">Task</th>
                      <th className="px-4 py-3.5 font-semibold">Assignee</th>
                      <th className="px-4 py-3.5 font-semibold">Batch</th>
                      <th className="px-4 py-3.5 font-semibold">Status</th>
                      <th className="px-4 py-3.5 font-semibold">Priority</th>
                      <th className="px-4 py-3.5 font-semibold">Start Time</th>
                      <th className="px-4 py-3.5 font-semibold">Duration</th>
                      <th className="px-4 py-3.5 font-semibold w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filtered.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3.5 max-w-[260px]">
                          <div className="font-medium text-foreground truncate">{t.title}</div>
                          {t.description && (
                            <div className="text-xs text-muted-foreground truncate mt-0.5">{t.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {t.assigneeName ? (
                            <span className="inline-flex items-center gap-2 text-sm">
                              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-semibold text-[10px] flex items-center justify-center uppercase ring-1 ring-primary/15">
                                {t.assigneeName.charAt(0)}
                              </span>
                              {t.assigneeName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {(t as any).batchRef ? (
                            <span className="font-mono text-xs bg-muted border border-border/60 px-2 py-0.5 rounded-md">{(t as any).batchRef}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="px-4 py-3.5">
                          <PriorityBadge priority={t.priority} />
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {t.startTime
                            ? new Date(t.startTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                            : "—"}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
                          {t.estimatedMinutes ? `${t.estimatedMinutes} min` : "—"}
                        </td>
                        <td className="px-4 py-3.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-lg">
                              <DropdownMenuItem onClick={() => openEdit(t)} className="rounded-md">
                                <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive rounded-md"
                                onClick={() => deleteTask.mutate({ id: t.id })}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-16 text-center">
                          <CheckSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
                          <p className="text-sm text-muted-foreground">No tasks found.</p>
                          <p className="text-xs text-muted-foreground mt-1">Create a task using the button above.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(EMPTY_FORM); }}>
          <DialogContent className="rounded-xl shadow-xl max-w-lg">
            <DialogHeader>
              <DialogTitle>New Task</DialogTitle>
            </DialogHeader>
            <TaskForm onSubmit={handleCreate} submitting={createTask.isPending} isCreate={true} />
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editTask} onOpenChange={(v) => { if (!v) setEditTask(null); }}>
          <DialogContent className="rounded-xl shadow-xl max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Task</DialogTitle>
            </DialogHeader>
            <TaskForm onSubmit={handleEdit} submitting={updateTask.isPending} />
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}