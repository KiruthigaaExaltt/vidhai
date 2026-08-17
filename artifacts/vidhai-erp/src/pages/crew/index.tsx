import { useEffect, useMemo, useState } from "react";
import { DataPagination } from "@/components/ui/data-pagination";
import { Shell } from "@/components/layout/Shell";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays,
  Clock3,
  Gift,
  HandCoins,
  MinusCircle,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserRoundX,
  Users,
  WalletCards,
} from "lucide-react";
import { AddMemberDialog } from "./AddMemberDialog";
import { AttendanceModule } from "./AttendanceModule";
import { ClaimsModule } from "./ClaimsModule";
import { BonusModule } from "./BonusModule";
import { DeductionsModule } from "./DeductionsModule";
import { LeaveModule } from "./LeaveModule";
import { OvertimeModule } from "./OvertimeModule";

type Tab =
  | "employees"
  | "attendance"
  | "leave"
  | "claims"
  | "overtime"
  | "bonus"
  | "deductions";
const tabs: [Tab, string, any][] = [
  ["employees", "Employees", Users],
  ["attendance", "Attendance", Clock3],
  ["leave", "Leave", CalendarDays],
  ["claims", "Claims", WalletCards],
  ["overtime", "Overtime", Clock3],
  ["bonus", "Bonus", Gift],
  ["deductions", "Deductions", MinusCircle],
];
const base = String(
  import.meta.env.VITE_API_BASE || import.meta.env.BASE_URL || "",
)
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
async function api(path: string, options?: RequestInit) {
  const r = await fetch(`${base}/api/crew/${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });
  if (!r.ok) {
    let message = `HTTP ${r.status}`;
    try {
      message = (await r.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  return r.status === 204 ? null : r.json();
}
const date = () => new Date().toLocaleDateString("en-CA");
const emptyEmployee = {
  name: "",
  employeeCode: "",
  designation: "",
  department: "",
  employmentType: "Full-time",
  annualCtc: "",
  baseSalary: "",
  status: "Active",
  workMode: "On-site",
  location: "",
  joinDate: date(),
  email: "",
  phone: "",
  bankName: "",
  accountHolderName: "",
  accountNumber: "",
  ifscCode: "",
};
const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export default function Crew() {
  const { can, hasScopedPermission, user } = useAuth(),
    { toast } = useToast();
  const allowed = tabs.filter(([k]) => can(`crew.${k}.view`));
  const [tab, setTab] = useState<Tab>((allowed[0]?.[0] || "employees") as Tab);
  const [employees, setEmployees] = useState<any[]>([]),
    [rows, setRows] = useState<any[]>([]),
    [loading, setLoading] = useState(false),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("All"),
    [employeePage, setEmployeePage] = useState(1),
    [employeePageSize, setEmployeePageSize] = useState(10),
    [employeeMeta, setEmployeeMeta] = useState<any>({
      totalCount: 0,
      totalPages: 0,
      counts: {},
    }),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<any>(null),
    [form, setForm] = useState<any>(emptyEmployee),
    [busy, setBusy] = useState(false);
  const loadEmployees = async () => {
    const params = new URLSearchParams(
      tab === "employees"
        ? {
            scope: tab,
            skip: String((employeePage - 1) * employeePageSize),
            limit: String(employeePageSize),
            search,
            status,
          }
        : { scope: tab, skip: "0", limit: "200" },
    );
    const r = await api(`employees?${params}`);
    setEmployees(r.data || []);
    setEmployeeMeta(r);
  };
  const load = async () => {
    setLoading(true);
    try {
      await loadEmployees();
      if (
        tab !== "employees" &&
        tab !== "leave" &&
        tab !== "claims" &&
        tab !== "overtime" &&
        tab !== "bonus" &&
        tab !== "deductions"
      )
        setRows(await api(tab));
    } catch (e: any) {
      toast({
        title: "Unable to load Crew",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [tab, employeePage, employeePageSize, search, status]);
  const visible = useMemo(() => {
    const source = tab === "employees" ? employees : rows,
      q = search.toLowerCase();
    return source.filter(
      (r: any) =>
        (!q ||
          `${r.name || r.employeeName} ${r.department || ""} ${r.title || ""} ${r.status || ""}`
            .toLowerCase()
            .includes(q)) &&
        (status === "All" || r.status === status),
    );
  }, [tab, employees, rows, search, status]);
  const metrics = {
    total: Number(
      employeeMeta.counts?.total ?? employeeMeta.totalCount ?? employees.length,
    ),
    active: Number(employeeMeta.counts?.active ?? 0),
    leave: Number(employeeMeta.counts?.leave ?? 0),
    off: Number(employeeMeta.counts?.off ?? 0),
  };
  const begin = (row?: any) => {
    setEditing(row || null);
    if (tab === "employees") setForm(row ? { ...row } : emptyEmployee);
    else setForm(defaultForm(tab, row, employees));
    setOpen(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      if (tab === "employees")
        await api(editing ? `employees/${editing.id}` : "employees", {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(form),
        });
      else await api(tab, { method: "POST", body: JSON.stringify(form) });
      setOpen(false);
      await load();
      toast({ title: editing ? "Record updated" : "Crew record created" });
    } catch (e: any) {
      toast({
        title: "Unable to save",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const decide = async (row: any, next: "Approved" | "Rejected") => {
    const remarks =
      next === "Rejected" ? window.prompt("Rejection remarks") || "" : "";
    try {
      await api(`${tab}/${row.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next, rejectionRemarks: remarks }),
      });
      await load();
    } catch (e: any) {
      toast({
        title: "Unable to update status",
        description: e.message,
        variant: "destructive",
      });
    }
  };
  const remove = async (row: any) => {
    try {
      await api(`${tab}/${row.id}`, { method: "DELETE" });
      await load();
      toast({ title: "Member deleted successfully." });
      return true;
    } catch (e: any) {
      toast({
        title: "Unable to remove",
        description: e.message,
        variant: "destructive",
      });
      return false;
    }
  };
  const punch = async () => {
    const own = employees.find(
      (e) => Number(e.id) === Number((user as any)?.employeeId),
    );
    if (!own) {
      toast({
        title: "No linked employee",
        description: "Link your user account to an employee before punching.",
        variant: "destructive",
      });
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "user";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const photoDataUrl = await readFile(file);
        const location: any = await new Promise((resolve) =>
          navigator.geolocation
            ? navigator.geolocation.getCurrentPosition(
                (p) =>
                  resolve({
                    latitude: p.coords.latitude,
                    longitude: p.coords.longitude,
                  }),
                () => resolve(null),
              )
            : resolve(null),
        );
        const existing = rows.find(
          (r) => r.employeeId === own.id && r.attendanceDate === date(),
        );
        if (existing && !existing.checkOutTime)
          await api(`attendance/${existing.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              punchAction: "punchOut",
              photoDataUrl,
              location,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          });
        else
          await api("attendance", {
            method: "POST",
            body: JSON.stringify({
              employeeId: own.id,
              punchAction: "punchIn",
              photoDataUrl,
              location,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          });
        await load();
        toast({ title: existing ? "Punched out" : "Punched in" });
      } catch (e: any) {
        toast({
          title: "Punch failed",
          description: e.message,
          variant: "destructive",
        });
      }
    };
    input.click();
  };
  const canCreate =
      can(`crew.${tab}.create`) &&
      (hasScopedPermission("crew", tab, "for_own") ||
        hasScopedPermission("crew", tab, "for_others")),
    canApprove = can(`crew.${tab}.approve`),
    canReject = can(`crew.${tab}.reject`);
  return (
    <Shell>
      <div className="min-h-[calc(100vh-72px)] bg-muted/30">
        <div className="border-b bg-card px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto overscroll-x-contain pb-px">
            {allowed.map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-4 text-sm font-medium sm:px-4 ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-6 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Crew Management</h1>
            </div>
            <div className="flex gap-2">
              {canCreate &&
                tab !== "attendance" &&
                tab !== "leave" &&
                tab !== "claims" &&
                tab !== "overtime" &&
                tab !== "bonus" &&
                tab !== "deductions" && (
                  <Button onClick={() => begin()}>
                    <Plus className="mr-2 h-4 w-4" />
                    {tab === "employees" ? "Add Member" : `New ${label(tab)}`}
                  </Button>
                )}
            </div>
          </div>
          {[
            "employees",
            "attendance",
            "leave",
            "claims",
            "overtime",
            "bonus",
            "deductions",
          ].includes(tab) && (
            <div className="grid gap-4 md:grid-cols-4">
              <Metric
                icon={Users}
                label="Total headcount"
                value={metrics.total}
              />
              <Metric
                icon={UserCheck}
                label="Active"
                value={metrics.active}
                tone="text-emerald-600"
              />
              <Metric
                icon={CalendarDays}
                label="On leave"
                value={metrics.leave}
                tone="text-amber-600"
              />
              <Metric
                icon={UserRoundX}
                label="Offboarded"
                value={metrics.off}
                tone="text-rose-600"
              />
            </div>
          )}
          {tab === "attendance" ? (
            <AttendanceModule
              employees={employees}
              logs={rows}
              user={user}
              can={can}
              refresh={load}
              edit={begin}
            />
          ) : tab === "leave" ? (
            <LeaveModule employees={employees} user={user} can={can} />
          ) : tab === "claims" ? (
            <ClaimsModule employees={employees} user={user} can={can} />
          ) : tab === "overtime" ? (
            <OvertimeModule employees={employees} user={user} can={can} />
          ) : tab === "bonus" ? (
            <BonusModule employees={employees} user={user} can={can} />
          ) : tab === "deductions" ? (
            <DeductionsModule employees={employees} user={user} can={can} />
          ) : (
            <>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder={`Search ${tab}...`}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setEmployeePage(1);
                    }}
                  />
                </div>
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setEmployeePage(1);
                  }}
                >
                  <option>All</option>
                  {[
                    "Active",
                    "On Leave",
                    "Offboarded",
                    "Pending",
                    "Approved",
                    "Rejected",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                {loading ? (
                  <div className="p-14 text-center text-muted-foreground">
                    Loading Crew recordsâ€¦
                  </div>
                ) : !visible.length ? (
                  <div className="p-20 text-center text-muted-foreground">
                    No {tab} found
                  </div>
                ) : tab === "employees" ? (
                  <EmployeeTable
                    rows={employees}
                    edit={begin}
                    remove={remove}
                    canEdit={can("crew.employees.update")}
                    canDelete={can("crew.employees.delete")}
                  />
                ) : (
                  <RecordTable
                    tab={tab}
                    rows={visible}
                    canApprove={canApprove}
                    canReject={canReject}
                    decide={decide}
                  />
                )}
                <DataPagination
                  currentPage={employeePage}
                  pageSize={employeePageSize}
                  totalCount={Number(employeeMeta.totalCount || 0)}
                  totalPages={Number(employeeMeta.totalPages || 0)}
                  onPageChange={setEmployeePage}
                  onPageSizeChange={(size) => {
                    setEmployeePageSize(size);
                    setEmployeePage(1);
                  }}
                  loading={loading}
                />
              </div>
            </>
          )}
        </div>
      </div>
      {tab === "employees" ? (
        <AddMemberDialog
          open={open}
          onOpenChange={setOpen}
          employees={employees}
          editingEmployee={editing}
          onCreated={load}
        />
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit" : "New"} {label(tab)}
              </DialogTitle>
            </DialogHeader>
            <CrewForm
              tab={tab}
              form={form}
              setForm={setForm}
              employees={employees}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={save}>
                {busy ? "Savingâ€¦" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Shell>
  );
}

function Metric({ icon: Icon, label, value, tone = "text-primary" }: any) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm">
      <span className={`rounded-full border p-3 ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}
function EmployeeTable({ rows, edit, remove, canEdit, canDelete }: any) {
  const [employeeToDelete, setEmployeeToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!employeeToDelete) return;
    setIsDeleting(true);
    const success = await remove(employeeToDelete);
    setIsDeleting(false);
    if (success) {
      setEmployeeToDelete(null);
    }
  };
  const formatDate = (value: any) => {
    if (!value) return "â€”";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  };
  const initials = (name: string) =>
    String(name || "E")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  const statusTone = (status: string) =>
    status === "Active"
      ? "bg-emerald-50 text-emerald-700"
      : status === "On Leave"
        ? "bg-amber-50 text-amber-700"
        : "bg-rose-50 text-rose-700";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Employee code</th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Department</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Joining date</th>
            <th className="px-4 py-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((employee: any) => (
            <tr
              key={employee.id}
              className="border-t transition-colors hover:bg-muted/20"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary">
                    {employee.photoUrl ? (
                      <img
                        src={`${base}${employee.photoUrl}`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      initials(employee.name)
                    )}
                  </span>
                  <span className="font-medium text-muted-foreground">
                    {employee.employeeCode}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-semibold">{employee.name}</div>
                <div className="text-xs text-muted-foreground">
                  {employee.designation || "â€”"}
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {employee.department || "â€”"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(employee.status)}`}
                >
                  {employee.status}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(employee.joinDate)}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-center">
                  {(canEdit || (canDelete && !employee.isSystemGenerated)) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          aria-label="Member actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEdit && (
                          <DropdownMenuItem onClick={() => edit(employee)}>
                            Edit
                          </DropdownMenuItem>
                        )}
                        {canDelete && !employee.isSystemGenerated && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            onClick={() => setEmployeeToDelete(employee)}
                          >
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Dialog
        open={!!employeeToDelete}
        onOpenChange={(isOpen) => !isOpen && setEmployeeToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Member?</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            Are you sure you want to remove "{employeeToDelete?.name}" from this
            member list?
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEmployeeToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function RecordTable({ tab, rows, canApprove, canReject, decide }: any) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-3">Employee</th>
            <th className="p-3">Details</th>
            <th className="p-3">Date</th>
            <th className="p-3">Status</th>
            <th className="p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} className="border-t">
              <td className="p-3 font-medium">{r.employeeName}</td>
              <td className="p-3">
                {tab === "attendance"
                  ? `${r.checkInTime || "â€”"} â€“ ${r.checkOutTime || "â€”"}`
                  : tab === "leave"
                    ? `${r.leaveType}: ${r.reason}`
                    : `${r.title || r.notes || label(tab)}${r.amount ? ` Â· â‚¹${Number(r.amount).toLocaleString("en-IN")}` : ""}`}
              </td>
              <td className="p-3 text-muted-foreground">
                {r.attendanceDate ||
                  r.startDate ||
                  r.date ||
                  String(r.createdAt || "").slice(0, 10)}
              </td>
              <td className="p-3">
                <Badge variant="outline">{r.status}</Badge>
              </td>
              <td className="p-3">
                {r.status === "Pending" && (
                  <div className="flex gap-1">
                    {canApprove && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide(r, "Approved")}
                      >
                        Approve
                      </Button>
                    )}
                    {canReject && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => decide(r, "Rejected")}
                      >
                        Reject
                      </Button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function CrewForm({ tab, form: f, setForm: set, employees }: any) {
  const field = (k: string, v: any) => set({ ...f, [k]: v });
  if (tab === "employees")
    return (
      <div className="grid gap-4 py-3 sm:grid-cols-2">
        {[
          ["name", "Full name"],
          ["employeeCode", "Employee code"],
          ["designation", "Designation"],
          ["department", "Department"],
          ["location", "Location"],
          ["email", "Email"],
          ["phone", "Phone"],
          ["annualCtc", "Annual CTC"],
          ["baseSalary", "Base salary"],
          ["bankName", "Bank name"],
          ["accountHolderName", "Account holder"],
          ["accountNumber", "Account number"],
          ["ifscCode", "IFSC code"],
        ].map(([k, l]) => (
          <Field key={k} label={l}>
            <Input
              type={["annualCtc", "baseSalary"].includes(k) ? "number" : "text"}
              value={f[k] || ""}
              onChange={(e) => field(k, e.target.value)}
            />
          </Field>
        ))}
        <Field label="Employment type">
          <Select
            value={f.employmentType}
            change={(v: string) => field("employmentType", v)}
            items={[
              "Full-time",
              "Part-time",
              "Contract",
              "Intern",
              "Consultant",
              "Trainee",
            ]}
          />
        </Field>
        <Field label="Work mode">
          <Select
            value={f.workMode}
            change={(v: string) => field("workMode", v)}
            items={["Remote", "Hybrid", "On-site", "Contract"]}
          />
        </Field>
        <Field label="Status">
          <Select
            value={f.status}
            change={(v: string) => field("status", v)}
            items={["Active", "On Leave", "Offboarded"]}
          />
        </Field>
        <Field label="Joining date">
          <Input
            type="date"
            value={f.joinDate || ""}
            onChange={(e) => field("joinDate", e.target.value)}
          />
        </Field>
        <Field label="Employee photo">
          <Input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) field("photoDataUrl", await readFile(file));
            }}
          />
        </Field>
      </div>
    );
  return (
    <div className="grid gap-4 py-3 sm:grid-cols-2">
      <Field label="Employee">
        <Select
          value={String(f.employeeId || "")}
          change={(v: string) => field("employeeId", Number(v))}
          items={employees.map((e: any) => ({
            value: String(e.id),
            label: `${e.name} (${e.employeeCode})`,
          }))}
        />
      </Field>
      {tab === "leave" ? (
        <>
          <Field label="Leave type">
            <Select
              value={f.leaveType}
              change={(v: string) => field("leaveType", v)}
              items={["Sick", "Casual", "Other"]}
            />
          </Field>
          <Field label="Start date">
            <Input
              type="date"
              value={f.startDate}
              onChange={(e) => field("startDate", e.target.value)}
            />
          </Field>
          <Field label="End date">
            <Input
              type="date"
              value={f.endDate}
              onChange={(e) => field("endDate", e.target.value)}
            />
          </Field>
          <Field label="Reason">
            <Textarea
              value={f.reason}
              onChange={(e) => field("reason", e.target.value)}
            />
          </Field>
        </>
      ) : tab === "attendance" ? (
        <>
          <Field label="Date">
            <Input
              type="date"
              value={f.attendanceDate}
              onChange={(e) => field("attendanceDate", e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select
              value={f.status}
              change={(v: string) => field("status", v)}
              items={[
                "Present",
                "Absent",
                "Late",
                "Half Day",
                "On Leave",
                "Week Off",
                "Holiday",
                "Remote",
                "WFH",
              ]}
            />
          </Field>
          <Field label="Check-in">
            <Input
              type="time"
              value={f.checkInTime || ""}
              onChange={(e) => field("checkInTime", e.target.value)}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={f.notes || ""}
              onChange={(e) => field("notes", e.target.value)}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label={tab === "deductions" ? "Amount" : "Title"}>
            <Input
              value={tab === "deductions" ? f.amount : f.title}
              onChange={(e) =>
                field(tab === "deductions" ? "amount" : "title", e.target.value)
              }
            />
          </Field>
          {tab !== "deductions" && (
            <Field label="Amount">
              <Input
                type="number"
                value={f.amount}
                onChange={(e) => field("amount", e.target.value)}
              />
            </Field>
          )}
          {tab === "claims" && (
            <Field label="Claim type">
              <Select
                value={f.claimType}
                change={(v: string) => field("claimType", v)}
                items={["reimbursement", "allowance"]}
              />
            </Field>
          )}
          {tab === "overtime" && (
            <>
              <Field label="Attendance date">
                <Input
                  type="date"
                  value={f.attendanceDate}
                  onChange={(e) => field("attendanceDate", e.target.value)}
                />
              </Field>
              <Field label="Requested hours">
                <Input
                  type="number"
                  value={f.requestedHours}
                  onChange={(e) => field("requestedHours", e.target.value)}
                />
              </Field>
            </>
          )}
          {tab === "bonus" && (
            <Field label="Payroll month">
              <Input
                type="month"
                value={f.payrollMonth}
                onChange={(e) => field("payrollMonth", e.target.value)}
              />
            </Field>
          )}
          {tab === "deductions" && (
            <Field label="Date">
              <Input
                type="date"
                value={f.date}
                onChange={(e) => field("date", e.target.value)}
              />
            </Field>
          )}
          <Field label="Notes">
            <Textarea
              value={f.notes || ""}
              onChange={(e) => field("notes", e.target.value)}
            />
          </Field>
          {tab === "claims" && (
            <Field label="Receipts">
              <Input
                type="file"
                multiple
                onChange={async (e) =>
                  field(
                    "attachments",
                    await Promise.all(
                      Array.from(e.target.files || [])
                        .slice(0, 10)
                        .map(async (file: any) => ({
                          name: file.name,
                          type: file.type,
                          size: file.size,
                          dataUrl: await readFile(file),
                        })),
                    ),
                  )
                }
              />
            </Field>
          )}
        </>
      )}
    </div>
  );
}
function Field({ label, children }: any) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
function Select({ value, change, items }: any) {
  return (
    <select
      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      value={value || ""}
      onChange={(e) => change(e.target.value)}
    >
      <option value="">Selectâ€¦</option>
      {items.map((x: any) => (
        <option
          key={typeof x === "string" ? x : x.value}
          value={typeof x === "string" ? x : x.value}
        >
          {typeof x === "string" ? x : x.label}
        </option>
      ))}
    </select>
  );
}
function label(tab: Tab) {
  return {
    employees: "Employee",
    attendance: "Attendance",
    leave: "Leave",
    claims: "Claim",
    overtime: "Overtime",
    bonus: "Bonus",
    deductions: "Deduction",
  }[tab];
}
function defaultForm(tab: Tab, row: any, employees: any[]) {
  if (row) return { ...row };
  const employeeId = employees[0]?.id || "";
  if (tab === "attendance")
    return {
      employeeId,
      attendanceDate: date(),
      status: "Present",
      checkInTime: "",
      notes: "",
    };
  if (tab === "leave")
    return {
      employeeId,
      leaveType: "Sick",
      startDate: date(),
      endDate: date(),
      reason: "",
      fromSession: 1,
      toSession: 2,
    };
  if (tab === "deductions")
    return { employeeId, amount: "", date: date(), notes: "" };
  return {
    employeeId,
    title: "",
    amount: "",
    notes: "",
    claimType: "reimbursement",
    attendanceDate: date(),
    requestedHours: "",
    payrollMonth: date().slice(0, 7),
    attachments: [],
  };
}
