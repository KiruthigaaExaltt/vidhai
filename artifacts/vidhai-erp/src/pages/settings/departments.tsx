import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataPagination } from "@/components/ui/data-pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const DEPARTMENTS_QUERY_KEY = ["get", "/api/departments"] as const;
type DepartmentStatus = "Active" | "Inactive";

interface Department {
  id: number;
  name: string;
  description: string;
  status: DepartmentStatus;
}

interface DepartmentForm {
  name: string;
  description: string;
  status: DepartmentStatus;
}

const EMPTY_FORM: DepartmentForm = {
  name: "",
  description: "",
  status: "Active",
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body as T;
}

export default function Departments() {
  const queryClient = useQueryClient();
  const {
    data: departments = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: DEPARTMENTS_QUERY_KEY,
    queryFn: () => request<Department[]>("/api/departments"),
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState<DepartmentForm>({ ...EMPTY_FORM });
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const departmentPagination = useClientPagination(departments);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: DEPARTMENTS_QUERY_KEY }),
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/master-data"],
      }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      request<Department>(
        editing ? `/api/departments/${editing.id}` : "/api/departments",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim(),
            status: form.status,
          }),
        },
      ),
    onSuccess: async () => {
      const wasEditing = editing != null;
      await refresh();
      setDialogOpen(false);
      setEditing(null);
      setForm({ ...EMPTY_FORM });
      toast.success(wasEditing ? "Department updated" : "Department added");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (department: Department) =>
      request<{ department: Department; deactivated: boolean }>(
        `/api/departments/${department.id}`,
        { method: "DELETE" },
      ),
    onSuccess: async (result) => {
      await refresh();
      setDeleteTarget(null);
      toast.success(
        result.deactivated
          ? "Department is in use and was marked Inactive"
          : "Department deleted",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (department: Department) => {
    setEditing(department);
    setForm({
      name: department.name,
      description: department.description || "",
      status: department.status,
    });
    setDialogOpen(true);
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Department name is required");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="w-full space-y-5">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-xl font-semibold text-foreground">Departments</h2>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add Department
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Loading departments...
          </div>
        ) : isError ? (
          <div className="py-16 text-center text-sm text-destructive">
            Failed to load departments.
          </div>
        ) : departments.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No departments found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Department ID</th>
                  <th className="px-4 py-3 font-semibold">Department Name</th>
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {departmentPagination.paginatedRows.map((department) => (
                  <tr key={department.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {department.id}
                    </td>
                    <td className="px-4 py-3 font-medium">{department.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {department.description || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          department.status === "Active"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {department.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Edit department"
                          onClick={() => openEdit(department)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Delete or deactivate department"
                          onClick={() => setDeleteTarget(department)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <DataPagination
              currentPage={departmentPagination.currentPage}
              pageSize={departmentPagination.pageSize}
              totalCount={departmentPagination.totalCount}
              onPageChange={departmentPagination.setCurrentPage}
              onPageSizeChange={departmentPagination.setPageSize}
            />
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={save}>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit Department" : "Add Department"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-5">
              <div className="space-y-1.5">
                <Label htmlFor="department-name">Department Name *</Label>
                <Input
                  id="department-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department-description">Description</Label>
                <Textarea
                  id="department-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      status: value as DepartmentStatus,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete department?</AlertDialogTitle>
            <AlertDialogDescription>
              Departments used by Purchase Requests will be marked Inactive to
              preserve historical records. Unused departments will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget);
              }}
            >
              {deleteMutation.isPending ? "Processing..." : "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
