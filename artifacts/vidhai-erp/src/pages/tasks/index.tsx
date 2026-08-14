import { useEffect, useState } from "react";
import { DataPagination } from "@/components/ui/data-pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import {
  useCreateTask,
  useDeleteTask,
  useListBatches,
  useUpdateTask,
} from "@workspace/api-client-react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CheckSquare,
  ClipboardList,
  Clock3,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  SquareCheckBig,
  Trash2,
  UserRoundPlus,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS = [
  {
    value: "todo",
    label: "To Do",
    color: "bg-slate-100 text-slate-700 border-slate-200",
  },
  {
    value: "in_progress",
    label: "Start",
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    value: "paused",
    label: "Pause",
    color: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    value: "done",
    label: "Complete",
    color: "bg-green-50 text-green-700 border-green-200",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    color: "bg-red-50 text-red-700 border-red-200",
  },
];
const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "start", label: "Start" },
  { value: "pause", label: "Pause" },
  { value: "complete", label: "Complete" },
];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const emptyForm = {
  title: "",
  description: "",
  batchRef: "",
  priority: "medium",
  estimatedMinutes: "",
  notes: "",
};

type Crew = {
  id: number;
  name: string;
  employeeCode: string;
  designation?: string;
  userId?: number | null;
};
type Assignment = {
  employeeId: number;
  employeeName: string;
  employeeCode?: string;
  userId?: number | null;
};
type TaskRow = Record<string, any> & {
  assignments?: Assignment[];
  activeTimers?: any[];
  actualMinutes?: number;
};
type Timesheet = {
  entries: any[];
  totals: {
    employeeMinutes: number;
    daily: Record<string, number>;
    tasks: Record<string, number>;
  };
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || "Request failed");
  return data as T;
}
const formatMinutes = (value: number) => {
  const total = Math.max(0, Math.round(Number(value || 0)));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
function StatusBadge({ status }: { status: string }) {
  const option = STATUS_OPTIONS.find((item) => item.value === status);
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${option?.color || "bg-muted"}`}
    >
      {option?.label || status}
    </span>
  );
}
function Assignees({
  assignments,
  fallback,
}: {
  assignments?: Assignment[];
  fallback?: string | null;
}) {
  const names = assignments?.map((item) => item.employeeName) || [];
  if (!names.length && fallback) names.push(fallback);
  if (!names.length)
    return (
      <span className="text-xs italic text-muted-foreground">Unassigned</span>
    );
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
        {names[0].charAt(0)}
      </span>
      <div>
        <div className="text-sm">{names[0]}</div>
        {names.length > 1 && (
          <div className="text-[11px] text-muted-foreground">
            +{names.length - 1} more
          </div>
        )}
      </div>
    </div>
  );
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const { user, can } = useAuth();
  const { data: batches = [] } = useListBatches();
  const [filter, setFilter] = useState("all");
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(10);
  const statusFilter =
    filter === "start"
      ? "in_progress"
      : filter === "pause"
        ? "paused"
        : filter === "complete"
          ? "done"
          : "";
  const taskQuery = useQuery({
    queryKey: ["tasks", "paged", filter, taskPage, taskPageSize],
    queryFn: () => {
      const params = new URLSearchParams({
        skip: String((taskPage - 1) * taskPageSize),
        limit: String(taskPageSize),
      });
      if (statusFilter) params.set("status", statusFilter);
      return api<{ data: TaskRow[]; totalCount: number; totalPages: number }>(
        `/tasks?${params}`,
      );
    },
    placeholderData: keepPreviousData,
  });
  const tasks = taskQuery.data?.data ?? [];
  const isLoading = taskQuery.isLoading || taskQuery.isFetching;
  const { data: crew = [] } = useQuery({
    queryKey: ["task-crew"],
    queryFn: () => api<Crew[]>("/tasks/crew"),
  });
  const { data: timesheet, refetch: refetchTimesheet } = useQuery({
    queryKey: ["task-timesheet"],
    queryFn: () => api<Timesheet>("/tasks/timesheet"),
  });
  const [tab, setTab] = useState<"tasks" | "timesheet">("tasks");
  const [form, setForm] = useState(emptyForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [assignTask, setAssignTask] = useState<TaskRow | null>(null);
  const [selectedCrew, setSelectedCrew] = useState<number[]>([]);
  const [assignBatchRef, setAssignBatchRef] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({
    taskId: "",
    date: new Date().toISOString().slice(0, 10),
    hours: "",
    minutes: "",
    notes: "",
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [, setClockTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(
      () => setClockTick((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(interval);
  }, []);
  const refresh = async () => {
    await queryClient.invalidateQueries({
      predicate: (query) => JSON.stringify(query.queryKey).includes("tasks"),
    });
    await refetchTimesheet();
  };
  const createTask = useCreateTask({
    mutation: {
      onSuccess: async () => {
        setCreateOpen(false);
        setForm(emptyForm);
        toast.success("Task created");
        await refresh();
      },
      onError: (error: any) => toast.error(error.message),
    },
  });
  const updateTask = useUpdateTask({
    mutation: {
      onSuccess: async () => {
        setEditTask(null);
        setForm(emptyForm);
        toast.success("Task updated");
        await refresh();
      },
      onError: (error: any) => toast.error(error.message),
    },
  });
  const deleteTask = useDeleteTask({
    mutation: {
      onSuccess: async () => {
        toast.success("Task deleted");
        await refresh();
      },
      onError: (error: any) => toast.error(error.message),
    },
  });

  const filtered = tasks;
  const myTasks = tasks.filter(
    (task) =>
      task.assignments?.some(
        (item) => Number(item.userId) === Number(user?.id),
      ) && task.status !== "cancelled",
  );
  const elapsedMinutes = (task: TaskRow) =>
    Number(task.actualMinutes || 0) +
    (task.activeTimers || []).reduce(
      (sum: number, timer: any) =>
        sum +
        Math.max(0, (Date.now() - new Date(timer.startedAt).getTime()) / 60000),
      0,
    );
  const isMine = (task: TaskRow) =>
    task.assignments?.some((item) => Number(item.userId) === Number(user?.id));

  const isRunning = (task: TaskRow) =>
    task.activeTimers?.some(
      (timer: any) => Number(timer.userId) === Number(user?.id),
    );

  async function operate(
    task: TaskRow,
    action: "start" | "pause" | "complete",
  ) {
    setBusyAction(`${task.id}:${action}`);
    try {
      await api(`/tasks/${task.id}/time-logs/${action}`, { method: "POST" });
      toast.success(
        action === "start"
          ? "Task started"
          : action === "pause"
            ? "Task paused"
            : "Task completed",
      );
      await refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function saveAssignments() {
    if (!assignTask) return;
    setBusyAction(`assign:${assignTask.id}`);
    try {
      await api(`/tasks/${assignTask.id}/assignments`, {
        method: "PATCH",
        body: JSON.stringify({ employeeIds: selectedCrew }),
      });
      toast.success("Crew assignment updated");
      setAssignTask(null);
      await refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusyAction(null);
    }
  }
  async function saveManual(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const durationMinutes =
      Number(manual.hours || 0) * 60 + Number(manual.minutes || 0);
    if (!manual.taskId || durationMinutes <= 0) {
      toast.error("Select a task and enter time");
      return;
    }
    setBusyAction("manual");
    try {
      await api(`/tasks/${manual.taskId}/time-logs`, {
        method: "POST",
        body: JSON.stringify({
          workDate: manual.date,
          durationMinutes,
          notes: manual.notes,
        }),
      });
      toast.success("Manual time saved");
      setManualOpen(false);
      setManual({
        taskId: "",
        date: new Date().toISOString().slice(0, 10),
        hours: "",
        minutes: "",
        notes: "",
      });
      await refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusyAction(null);
    }
  }
  function submitTask(event: React.FormEvent, editing = false) {
    event.preventDefault();
    const data = {
      title: form.title,
      description: form.description || null,
      batchRef: form.batchRef || null,
      priority: form.priority,
      estimatedMinutes: form.estimatedMinutes
        ? Number(form.estimatedMinutes)
        : null,
      notes: form.notes || null,
    };
    if (editing && editTask) updateTask.mutate({ id: editTask.id, data });
    else createTask.mutate({ data });
  }
  function openEdit(task: TaskRow) {
    setEditTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      batchRef: task.batchRef || "",
      priority: task.priority,
      estimatedMinutes: task.estimatedMinutes
        ? String(task.estimatedMinutes)
        : "",
      notes: task.notes || "",
    });
  }
  function openAssign(task: TaskRow) {
    setAssignTask(task);
    setSelectedCrew(
      task.assignments?.map((item) => Number(item.employeeId)) || [],
    );
  }

  const renderTaskForm = (editing = false) => (
    <form
      onSubmit={(event) => submitTask(event, editing)}
      className="space-y-4 pt-2"
    >
      <div className="space-y-2">
        <Label>Task name</Label>
        <Input
          required
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={form.description}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Work order / batch</Label>
          <Select
            value={form.batchRef}
            onValueChange={(batchRef) => setForm({ ...form, batchRef })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Link to batch" />
            </SelectTrigger>
            <SelectContent>
              {(batches as any[]).map((batch: any) => (
                <SelectItem key={batch.id} value={batch.batchCode}>
                  {batch.batchCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select
            value={form.priority}
            onValueChange={(priority) => setForm({ ...form, priority })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {priority[0].toUpperCase() + priority.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Estimated minutes</Label>
        <Input
          type="number"
          min="0"
          value={form.estimatedMinutes}
          onChange={(event) =>
            setForm({ ...form, estimatedMinutes: event.target.value })
          }
        />
      </div>
      <DialogFooter>
        <Button
          type="submit"
          disabled={createTask.isPending || updateTask.isPending}
        >
          {editing ? "Save changes" : "Create task"}
        </Button>
      </DialogFooter>
    </form>
  );

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CheckSquare className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">
                Task management
              </h1>
            </div>
          </div>
          <div className="flex gap-2">
            {tab === "tasks" ? (
              <Button
                disabled={!can("task.task_board.create")}
                onClick={() => {
                  setForm(emptyForm);
                  setCreateOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                New task
              </Button>
            ) : (
              <Button
                onClick={() => setManualOpen(true)}
                disabled={!myTasks.length}
              >
                <Plus className="mr-2 h-4 w-4" />
                Log time
              </Button>
            )}
          </div>
        </div>
        <div className="inline-flex rounded-lg border bg-muted/40 p-1">
          <Button
            size="sm"
            variant={tab === "tasks" ? "default" : "ghost"}
            onClick={() => setTab("tasks")}
          >
            <CheckSquare className="mr-2 h-4 w-4" />
            Tasks
          </Button>
          <Button
            size="sm"
            variant={tab === "timesheet" ? "default" : "ghost"}
            onClick={() => setTab("timesheet")}
          >
            <ClipboardList className="mr-2 h-4 w-4" />
            Timesheet
          </Button>
        </div>

        {tab === "tasks" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Filter
              </span>
              {FILTER_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => {
                    setFilter(item.value);
                    setTaskPage(1);
                  }}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium ${filter === item.value ? "border-primary bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:border-primary/50"}`}
                >
                  {item.label}
                </button>
              ))}
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {Number(taskQuery.data?.totalCount || 0)} task
                {Number(taskQuery.data?.totalCount || 0) === 1 ? "" : "s"}
              </span>
            </div>
            <Card className="overflow-hidden rounded-xl border-border/60 shadow-sm">
              <CardContent className="p-0">
                {false ? (
                  <div className="py-20 text-center text-sm text-muted-foreground">
                    Loading tasks�
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3.5">Task</th>
                          <th className="px-4 py-3.5">Assigned crew</th>
                          <th className="px-4 py-3.5">Work order</th>
                          <th className="px-4 py-3.5">Status</th>
                          <th className="px-4 py-3.5">Priority</th>
                          <th className="px-4 py-3.5">Time</th>
                          <th className="w-10 px-4 py-3.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {isLoading && !filtered.length ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="py-16 text-center text-muted-foreground"
                            >
                              Loading tasks...
                            </td>
                          </tr>
                        ) : filtered.length ? (
                          filtered.map((task) => (
                            <tr key={task.id} className="hover:bg-muted/30">
                              <td className="max-w-[280px] px-4 py-3.5">
                                <div className="truncate font-medium">
                                  {task.title}
                                </div>
                                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {task.description || "No description"}
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                <Assignees
                                  assignments={task.assignments}
                                  fallback={task.assigneeName}
                                />
                              </td>
                              <td className="px-4 py-3.5">
                                <span className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs">
                                  {task.batchRef || "�"}
                                </span>
                              </td>
                              <td className="px-4 py-3.5">
                                <StatusBadge status={task.status} />
                              </td>
                              <td className="px-4 py-3.5 capitalize text-muted-foreground">
                                {task.priority}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-2">
                                  <Clock3 className="h-3.5 w-3.5" />
                                  {formatMinutes(elapsedMinutes(task))}
                                </span>
                              </td>
                              <td className="px-4 py-3.5">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      disabled={!can("task.task_board.update")}
                                      onClick={() => openEdit(task)}
                                    >
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Edit details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={!can("task.task_board.update")}
                                      onClick={() => openAssign(task)}
                                    >
                                      <UserRoundPlus className="mr-2 h-4 w-4" />
                                      Assign crew
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {isMine(task) &&
                                      !isRunning(task) &&
                                      ["todo", "paused"].includes(
                                        task.status,
                                      ) && (
                                        <DropdownMenuItem
                                          disabled={!!busyAction}
                                          onClick={() => operate(task, "start")}
                                        >
                                          <Play className="mr-2 h-4 w-4" />{" "}
                                          Start
                                        </DropdownMenuItem>
                                      )}
                                    {isMine(task) && isRunning(task) && (
                                      <DropdownMenuItem
                                        disabled={!!busyAction}
                                        onClick={() => operate(task, "pause")}
                                      >
                                        <Pause className="mr-2 h-4 w-4" /> Pause
                                      </DropdownMenuItem>
                                    )}
                                    {isMine(task) &&
                                      !["done", "cancelled"].includes(
                                        task.status,
                                      ) && (
                                        <DropdownMenuItem
                                          disabled={!!busyAction}
                                          onClick={() =>
                                            operate(task, "complete")
                                          }
                                        >
                                          <SquareCheckBig className="mr-2 h-4 w-4" />
                                          Complete
                                        </DropdownMenuItem>
                                      )}
                                    <DropdownMenuItem
                                      onClick={() => setTab("timesheet")}
                                    >
                                      <ClipboardList className="mr-2 h-4 w-4" />
                                      View timesheet
                                    </DropdownMenuItem>
                                    {can("task.task_board.delete") && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-destructive"
                                          onClick={() => {
                                            if (confirm("Delete this task?"))
                                              deleteTask.mutate({
                                                id: task.id,
                                              });
                                          }}
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          Delete
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={7}
                              className="py-16 text-center text-muted-foreground"
                            >
                              No tasks match the current filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
              <DataPagination
                currentPage={taskPage}
                pageSize={taskPageSize}
                totalCount={Number(taskQuery.data?.totalCount || 0)}
                totalPages={Number(taskQuery.data?.totalPages || 0)}
                onPageChange={setTaskPage}
                onPageSizeChange={(size) => {
                  setTaskPageSize(size);
                  setTaskPage(1);
                }}
                loading={isLoading}
              />
            </Card>
          </>
        ) : (
          <TimesheetPanel data={timesheet} />
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New task</DialogTitle>
            </DialogHeader>
            {renderTaskForm()}
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!editTask}
          onOpenChange={(open) => !open && setEditTask(null)}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit task</DialogTitle>
            </DialogHeader>
            {renderTaskForm(true)}
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!assignTask}
          onOpenChange={(open) => !open && setAssignTask(null)}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assign crew & batch</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label>Batch mapping</Label>
              <Select value={assignBatchRef} onValueChange={setAssignBatchRef}>
                <SelectTrigger>
                  <SelectValue placeholder="Link to batch" />
                </SelectTrigger>
                <SelectContent>
                  {(batches as any[]).map((batch: any) => (
                    <SelectItem key={batch.id} value={batch.batchCode}>
                      {batch.batchCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Crew members</Label>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {crew.map((member) => (
                  <label
                    key={member.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={selectedCrew.includes(member.id)}
                      onCheckedChange={(checked) =>
                        setSelectedCrew(
                          checked
                            ? [...selectedCrew, member.id]
                            : selectedCrew.filter((id) => id !== member.id),
                        )
                      }
                    />
                    <div>
                      <div className="font-medium">{member.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {member.employeeCode}
                        {member.designation ? ` � ${member.designation}` : ""}
                        {!member.userId ? " � No app login" : ""}
                      </div>
                    </div>
                  </label>
                ))}
                {!crew.length && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No active crew members found.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={saveAssignments}
                disabled={busyAction?.startsWith("assign")}
              >
                Save assignment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={manualOpen} onOpenChange={setManualOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Log time</DialogTitle>
            </DialogHeader>
            <form onSubmit={saveManual} className="space-y-4">
              <div className="space-y-2">
                <Label>Assigned task</Label>
                <Select
                  value={manual.taskId}
                  onValueChange={(taskId) => setManual({ ...manual, taskId })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a task" />
                  </SelectTrigger>
                  <SelectContent>
                    {myTasks.map((task) => (
                      <SelectItem key={task.id} value={String(task.id)}>
                        {task.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  required
                  value={manual.date}
                  onChange={(event) =>
                    setManual({ ...manual, date: event.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Hours</Label>
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    value={manual.hours}
                    onChange={(event) =>
                      setManual({ ...manual, hours: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Minutes</Label>
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={manual.minutes}
                    onChange={(event) =>
                      setManual({ ...manual, minutes: event.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={manual.notes}
                  onChange={(event) =>
                    setManual({ ...manual, notes: event.target.value })
                  }
                  placeholder="What did you work on?"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Manual entries are stored separately from automatic timer
                sessions to prevent hidden double-counting.
              </p>
              <DialogFooter>
                <Button type="submit" disabled={busyAction === "manual"}>
                  Save time
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}

function TimesheetPanel({ data }: { data?: Timesheet }) {
  const entries = data?.entries || [];
  const pagination = useClientPagination(entries);
  const today = new Date().toISOString().slice(0, 10);
  const taskCount = Object.keys(data?.totals.tasks || {}).length;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary
          label="Today"
          value={formatMinutes(data?.totals.daily?.[today] || 0)}
        />
        <Summary
          label="Employee total"
          value={formatMinutes(data?.totals.employeeMinutes || 0)}
        />
        <Summary label="Tasks logged" value={String(taskCount)} />
      </div>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Work order</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pagination.paginatedRows.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 font-mono text-xs">
                      {entry.workDate ||
                        new Date(entry.startTime).toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 font-medium">{entry.taskTitle}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {entry.workOrder || "�"}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {formatMinutes(entry.durationMinutes)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {entry.notes || "�"}
                    </td>
                  </tr>
                ))}
                {!entries.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-16 text-center text-muted-foreground"
                    >
                      No time has been logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
        <DataPagination
          currentPage={pagination.currentPage}
          pageSize={pagination.pageSize}
          totalCount={pagination.totalCount}
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
        />
      </Card>
    </div>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
