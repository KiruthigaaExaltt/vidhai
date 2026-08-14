import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Eye,
  FileText,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { DataPagination } from "@/components/ui/data-pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const base = String(
  import.meta.env.VITE_API_BASE || import.meta.env.BASE_URL || "",
)
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
const request = async (path: string, options?: RequestInit) => {
  const response = await fetch(`${base}/api/crew/${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
};
const allowed = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const empty = (employeeId = "") => ({
  employeeId,
  claimType: "reimbursement",
  amount: "",
  title: "",
  attendanceDate: "",
  requestedHours: "",
  notes: "",
  attachments: [] as any[],
});
const money = (value: any) =>
  Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
const statusTone: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Rejected: "bg-rose-50 text-rose-700",
  Cancelled: "bg-slate-100 text-slate-700",
};
const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export function ClaimsModule({
  employees,
  user,
  can,
}: {
  employees: any[];
  user: any;
  can: (permission: string) => boolean;
}) {
  const { toast } = useToast(),
    own = employees.find(
      (employee) => Number(employee.id) === Number(user?.employeeId),
    ),
    canOthers = can("crew.claims.forOthers"),
    initialEmployee = canOthers
      ? String(own?.id || employees[0]?.id || "")
      : String(own?.id || "");
  const [form, setForm] = useState(() => empty(initialEmployee)),
    [rows, setRows] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<any>(null),
    [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const field = (key: string, value: any) =>
    setForm((current) => ({ ...current, [key]: value }));
  const load = async () => {
    setLoading(true);
    try {
      setRows(await request("claims"));
    } catch (error: any) {
      toast({
        title: "Unable to load claims",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const addFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (form.attachments.length + incoming.length > 10) {
      toast({
        title: "A maximum of 10 files is allowed",
        variant: "destructive",
      });
      return;
    }
    const valid = [];
    for (const file of incoming) {
      if (!allowed.has(file.type)) {
        toast({
          title: `Unsupported file: ${file.name}`,
          variant: "destructive",
        });
        continue;
      }
      if (file.size > 25 * 1024 * 1024) {
        toast({ title: `${file.name} exceeds 25 MB`, variant: "destructive" });
        continue;
      }
      valid.push({
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: await readFile(file),
      });
    }
    field("attachments", [...form.attachments, ...valid]);
  };
  const submit = async () => {
    if (!form.employeeId || !form.title.trim() || Number(form.amount) <= 0) {
      toast({
        title: "Employee, title and an amount greater than zero are required",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      await request("claims", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          requestedHours:
            form.requestedHours === "" ? null : Number(form.requestedHours),
          attendanceDate: form.attendanceDate || null,
        }),
      });
      toast({ title: "Claim submitted for approval" });
      setForm(empty(form.employeeId));
      await load();
    } catch (error: any) {
      toast({
        title: "Unable to create claim",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const decide = async (row: any, status: "Approved" | "Rejected") => {
    const remarks =
      status === "Rejected"
        ? window.prompt("Enter rejection remarks (minimum 10 characters)") || ""
        : "";
    if (status === "Rejected" && remarks.trim().length < 10) {
      toast({
        title: "Rejection remarks must contain at least 10 characters",
        variant: "destructive",
      });
      return;
    }
    try {
      await request(`claims/${row.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, rejectionRemarks: remarks }),
      });
      toast({ title: `Claim ${status.toLowerCase()}` });
      await load();
      setSelected(null);
    } catch (error: any) {
      toast({
        title: "Unable to update claim",
        description: error.message,
        variant: "destructive",
      });
    }
  };
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          !query ||
          `${row.employeeName} ${row.claimType} ${row.amount} ${row.title} ${row.notes || ""} ${row.status}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [rows, query],
  );
  const pagination = useClientPagination(filtered, query);
  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Claims</h2>
          <span className="text-sm text-muted-foreground">
            {rows.length} claims
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Employee *</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.employeeId}
              disabled={!canOthers}
              onChange={(event) => field("employeeId", event.target.value)}
            >
              <option value="">Select employee</option>
              {employees
                .filter((employee) => employee.status !== "Offboarded")
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} ({employee.employeeCode})
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Claim type *</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.claimType}
              onChange={(event) => field("claimType", event.target.value)}
            >
              <option value="reimbursement">Reimbursement</option>
              <option value="allowance">Allowance</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Enter claim amount"
              value={form.amount}
              onChange={(event) => field("amount", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input
              maxLength={160}
              placeholder="Claim reason"
              value={form.title}
              onChange={(event) => field("title", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Date (optional)</Label>
            <Input
              type="date"
              value={form.attendanceDate}
              onChange={(event) => field("attendanceDate", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hours (optional)</Label>
            <Input
              type="number"
              min="0"
              step="0.25"
              placeholder="e.g. 4"
              value={form.requestedHours}
              onChange={(event) => field("requestedHours", event.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            className="min-h-24"
            placeholder="Add details or context for approvers"
            value={form.notes}
            onChange={(event) => field("notes", event.target.value)}
          />
        </div>
        <div className="mt-5 space-y-2">
          <Label>Receipts / supporting files</Label>
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
            onChange={(event) =>
              event.target.files && void addFiles(event.target.files)
            }
          />
          <button
            type="button"
            className={`flex min-h-40 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition ${dragging ? "border-primary bg-primary/5" : "border-border bg-muted/10"}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void addFiles(event.dataTransfer.files);
            }}
          >
            <span className="mb-2 rounded-full border bg-card p-3">
              <UploadCloud className="h-6 w-6 text-primary" />
            </span>
            <b>Click to upload or drag and drop</b>
            <small className="text-muted-foreground">
              PDF, PNG, JPG, WebP, DOC/DOCX, XLS/XLSX � Maximum 25 MB each � Up
              to 10 files
            </small>
          </button>
          {form.attachments.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {form.attachments.map((file: any, index: number) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 rounded-md border p-2 text-sm"
                >
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <small>{(file.size / 1024).toFixed(0)} KB</small>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() =>
                      field(
                        "attachments",
                        form.attachments.filter(
                          (_: any, i: number) => i !== index,
                        ),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            disabled={busy || !can("crew.claims.create") || !form.employeeId}
            onClick={() => void submit()}
          >
            {busy ? "Creating..." : "Create Claim"}
          </Button>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col items-stretch gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-semibold">Recent claims</h3>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="w-full pl-9 sm:w-64"
              placeholder="Search claims..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {[
                  "Employee",
                  "Type",
                  "Title",
                  "Amount",
                  "Status",
                  "Action",
                ].map((title) => (
                  <th key={title} className="px-4 py-3">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-12 text-center text-muted-foreground"
                  >
                    Loading claims...
                  </td>
                </tr>
              ) : filtered.length ? (
                pagination.paginatedRows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-3 font-medium">
                      {row.employeeName}
                    </td>
                    <td className="px-4 py-3 capitalize">{row.claimType}</td>
                    <td className="px-4 py-3">{row.title}</td>
                    <td className="px-4 py-3 font-medium">
                      {money(row.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[row.status] || ""}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() => setSelected(row)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="p-12 text-center text-muted-foreground"
                  >
                    No claims found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataPagination
          currentPage={pagination.currentPage}
          pageSize={pagination.pageSize}
          totalCount={pagination.totalCount}
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
          loading={loading}
        />
      </section>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Claim Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Employee</span>
                  <b className="block">{selected.employeeName}</b>
                </p>
                <p>
                  <span className="text-muted-foreground">Status</span>
                  <b className="block">{selected.status}</b>
                </p>
                <p>
                  <span className="text-muted-foreground">Type</span>
                  <b className="block capitalize">{selected.claimType}</b>
                </p>
                <p>
                  <span className="text-muted-foreground">Amount</span>
                  <b className="block">{money(selected.amount)}</b>
                </p>
                <p>
                  <span className="text-muted-foreground">Title</span>
                  <b className="block">{selected.title}</b>
                </p>
                <p>
                  <span className="text-muted-foreground">Date / hours</span>
                  <b className="block">
                    {selected.attendanceDate || "�"} �{" "}
                    {selected.requestedHours || "�"}
                  </b>
                </p>
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">Notes</span>
                  <b className="block">{selected.notes || "No notes"}</b>
                </p>
                {selected.rejectionRemarks && (
                  <p className="sm:col-span-2 text-destructive">
                    <span>Rejection remarks</span>
                    <b className="block">{selected.rejectionRemarks}</b>
                  </p>
                )}
              </div>
              {selected.attachments?.length > 0 && (
                <div>
                  <Label>Attachments</Label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {selected.attachments.map((file: any, index: number) => (
                      <a
                        key={index}
                        href={`${base}${file.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted"
                      >
                        <FileText className="h-4 w-4" />
                        <span className="truncate">{file.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}{" "}
              {selected.status === "Pending" && (
                <div className="flex justify-end gap-2">
                  {can("crew.claims.reject") && (
                    <Button
                      variant="outline"
                      className="text-destructive"
                      onClick={() => void decide(selected, "Rejected")}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  )}
                  {can("crew.claims.approve") && (
                    <Button onClick={() => void decide(selected, "Approved")}>
                      <Check className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
