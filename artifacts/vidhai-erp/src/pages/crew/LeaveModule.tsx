import { useEffect, useMemo, useState } from "react";
import { Check, Eye, Search, X } from "lucide-react";
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
const today = () => new Date().toLocaleDateString("en-CA");
const empty = (employeeId = "") => ({
  employeeId,
  startDate: today(),
  endDate: today(),
  leaveType: "Sick",
  session: "full",
  reason: "",
});
const statusTone: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Rejected: "bg-rose-50 text-rose-700",
};

export function LeaveModule({
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
    canOthers = can("crew.leave.forOthers"),
    initialEmployee = canOthers
      ? String(own?.id || employees[0]?.id || "")
      : String(own?.id || "");
  const [form, setForm] = useState(() => empty(initialEmployee)),
    [rows, setRows] = useState<any[]>([]),
    [balance, setBalance] = useState<any>(null),
    [workingDays, setWorkingDays] = useState<number | null>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<any>(null),
    [loading, setLoading] = useState(true);
  const field = (key: string, value: any) =>
    setForm((current) => ({ ...current, [key]: value }));
  const load = async () => {
    setLoading(true);
    try {
      setRows(await request("leaves"));
    } catch (error: any) {
      toast({
        title: "Unable to load leave requests",
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
  useEffect(() => {
    if (!form.employeeId) return;
    const date = new Date(`${form.startDate}T00:00:00`);
    request(
      `employees/${form.employeeId}/leave-balance?year=${date.getFullYear()}&month=${date.getMonth() + 1}`,
    )
      .then(setBalance)
      .catch(() => setBalance(null));
    const sessions =
      form.session === "first"
        ? [1, 1]
        : form.session === "second"
          ? [2, 2]
          : [1, 2];
    request(
      `employees/${form.employeeId}/working-days?startDate=${form.startDate}&endDate=${form.endDate}&fromSession=${sessions[0]}&toSession=${sessions[1]}`,
    )
      .then((data) => setWorkingDays(data.workingDays))
      .catch(() => setWorkingDays(null));
  }, [
    form.employeeId,
    form.startDate,
    form.endDate,
    form.session,
    rows.length,
  ]);
  const submit = async () => {
    if (!form.employeeId || !form.startDate || !form.endDate) {
      toast({
        title: "Employee and leave dates are required",
        variant: "destructive",
      });
      return;
    }
    const sessions =
      form.session === "first"
        ? [1, 1]
        : form.session === "second"
          ? [2, 2]
          : [1, 2];
    setBusy(true);
    try {
      await request("leaves", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          fromSession: String(sessions[0]),
          toSession: String(sessions[1]),
        }),
      });
      toast({ title: "Leave request submitted" });
      setForm(empty(form.employeeId));
      await load();
    } catch (error: any) {
      toast({
        title: "Unable to request leave",
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
      await request(`leaves/${row.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, rejectionRemarks: remarks }),
      });
      toast({ title: `Leave request ${status.toLowerCase()}` });
      await load();
    } catch (error: any) {
      toast({
        title: "Unable to update leave request",
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
          `${row.employeeName} ${row.startDate} ${row.endDate} ${row.leaveType} ${row.status} ${row.reason || ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [rows, query],
  );
  const pagination = useClientPagination(filtered, query);
  const BalanceCard = ({
    title,
    data,
    tone,
  }: {
    title: string;
    data: any;
    tone: string;
  }) => (
    <div className={`rounded-xl border p-5 text-center ${tone}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="my-1 text-3xl font-bold">{data?.remaining ?? "�"}</p>
      <p className="text-xs text-muted-foreground">
        {data?.used ?? 0} used / {data?.total ?? 0} total
      </p>
      <p className="text-xs text-muted-foreground">
        This month: {data?.monthlyUsed ?? 0} used / {data?.monthlyMax ?? 0} max
      </p>
      <p className="mt-1 text-xs">
        Month balance: {data?.monthlyRemaining ?? 0}
      </p>
    </div>
  );
  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Leave Requests</h2>
          <span className="text-sm text-muted-foreground">
            {rows.length} requests
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
            <Label>From *</Label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(event) => {
                field("startDate", event.target.value);
                if (event.target.value > form.endDate)
                  field("endDate", event.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>To *</Label>
            <Input
              type="date"
              min={form.startDate}
              value={form.endDate}
              onChange={(event) => field("endDate", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Session</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.session}
              onChange={(event) => field("session", event.target.value)}
            >
              <option value="full">Full day</option>
              <option value="first">First session (half day)</option>
              <option value="second">Second session (half day)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Leave type *</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.leaveType}
              onChange={(event) => field("leaveType", event.target.value)}
            >
              <option>Sick</option>
              <option>Casual</option>
              <option>Other</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="w-full rounded-md border bg-muted/30 px-3 py-2 text-sm">
              Chargeable days: <b>{workingDays ?? "�"}</b>
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label>Reason</Label>
          <Textarea
            placeholder="Optional note"
            value={form.reason}
            onChange={(event) => field("reason", event.target.value)}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <BalanceCard
            title="Casual Leaves"
            data={balance?.casual}
            tone="border-sky-200 bg-sky-50/60 text-sky-700"
          />
          <BalanceCard
            title="Sick Leaves"
            data={balance?.sick}
            tone="border-amber-200 bg-amber-50/60 text-amber-700"
          />
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            disabled={busy || !can("crew.leave.create") || !form.employeeId}
            onClick={() => void submit()}
          >
            {busy ? "Submitting..." : "Request Leave"}
          </Button>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <h3 className="font-semibold">Recent leave requests</h3>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="w-64 pl-9"
              placeholder="Search leave requests..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {["Employee", "Range", "Days", "Type", "Status", "Action"].map(
                  (title) => (
                    <th key={title} className="px-4 py-3">
                      {title}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-12 text-center text-muted-foreground"
                  >
                    Loading leave requests...
                  </td>
                </tr>
              ) : filtered.length ? (
                pagination.paginatedRows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-3 font-medium">
                      {row.employeeName}
                    </td>
                    <td className="px-4 py-3">
                      {row.startDate} ? {row.endDate}
                    </td>
                    <td className="px-4 py-3">{row.requestedDays ?? "�"}</td>
                    <td className="px-4 py-3">{row.leaveType}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[row.status] || ""}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => setSelected(row)}
                          aria-label="View leave"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {row.status === "Pending" &&
                          can("crew.leave.approve") && (
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 text-emerald-600"
                              onClick={() => void decide(row, "Approved")}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                        {row.status === "Pending" &&
                          can("crew.leave.reject") && (
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 text-destructive"
                              onClick={() => void decide(row, "Rejected")}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="p-12 text-center text-muted-foreground"
                  >
                    No leave requests found
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
          </DialogHeader>
          {selected && (
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
                <span className="text-muted-foreground">Dates</span>
                <b className="block">
                  {selected.startDate} ? {selected.endDate}
                </b>
              </p>
              <p>
                <span className="text-muted-foreground">Type / days</span>
                <b className="block">
                  {selected.leaveType} � {selected.requestedDays ?? "�"}
                </b>
              </p>
              <p className="sm:col-span-2">
                <span className="text-muted-foreground">Reason</span>
                <b className="block">
                  {selected.reason || "No reason provided"}
                </b>
              </p>
              {selected.rejectionRemarks && (
                <p className="sm:col-span-2 text-destructive">
                  <span>Rejection remarks</span>
                  <b className="block">{selected.rejectionRemarks}</b>
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
