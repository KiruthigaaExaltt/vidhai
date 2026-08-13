import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DataPagination } from "@/components/ui/data-pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
const root = String(
  import.meta.env.VITE_API_BASE || import.meta.env.BASE_URL || "",
)
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
const api = async (path: string, options?: RequestInit) => {
  const response = await fetch(`${root}/api/crew/${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
};
const money = (value: any) =>
  Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export function DeductionsModule({
  employees,
  user,
  can,
}: {
  employees: any[];
  user: any;
  can: (permission: string) => boolean;
}) {
  const now = new Date(),
    { toast } = useToast(),
    own = employees.find((e) => Number(e.id) === Number(user?.employeeId)),
    canOthers = can("crew.deductions.forOthers");
  const [month, setMonth] = useState(now.getMonth()),
    [year, setYear] = useState(now.getFullYear()),
    [employeeId, setEmployeeId] = useState(
      String((canOthers ? own || employees[0] : own)?.id || ""),
    ),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [notes, setNotes] = useState(""),
    [rows, setRows] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [filterEmployee, setFilterEmployee] = useState("All"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [query, setQuery] = useState("");
  const load = async () => {
    setLoading(true);
    try {
      setRows(await api(`deductions?month=${month}&year=${year}`));
    } catch (error: any) {
      toast({
        title: "Unable to load deductions",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [month, year]);
  const create = async () => {
    const value = Number(amount);
    if (!employeeId || !date || !Number.isFinite(value) || value <= 0) {
      toast({
        title: "Employee, date and an amount greater than zero are required",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      await api("deductions", {
        method: "POST",
        body: JSON.stringify({
          employeeId: Number(employeeId),
          date,
          amount: value,
          notes,
        }),
      });
      toast({ title: "Deduction added to salary" });
      setAmount("");
      setNotes("");
      await load();
    } catch (error: any) {
      toast({
        title: "Unable to add deduction",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const visible = useMemo(
      () =>
        rows.filter(
          (row) =>
            (filterEmployee === "All" ||
              String(row.employeeId) === filterEmployee) &&
            (!from || row.date >= from) &&
            (!to || row.date <= to) &&
            (!query ||
              `${row.employeeName} ${row.notes || ""} ${row.autoReason || ""}`
                .toLowerCase()
                .includes(query.toLowerCase())),
        ),
      [rows, filterEmployee, from, to, query],
    ),
    approved = visible.filter((row) => row.status === "Approved"),
    manual = approved.filter(
      (row) => String(row.source).toLowerCase() === "manual",
    ),
    automatic = approved.filter(
      (row) => String(row.source).toLowerCase() !== "manual",
    ),
    sum = (list: any[]) =>
      list.reduce((total, row) => total + Number(row.amount || 0), 0),
    employeeTotals = new Map<
      number,
      { auto: number; manual: number; dates: Set<string> }
    >();
  for (const employee of employees)
    employeeTotals.set(Number(employee.id), {
      auto: 0,
      manual: 0,
      dates: new Set(),
    });
  for (const row of approved) {
    const item = employeeTotals.get(Number(row.employeeId));
    if (item) {
      if (String(row.source).toLowerCase() === "manual")
        item.manual += Number(row.amount || 0);
      else item.auto += Number(row.amount || 0);
      if (String(row.source).toLowerCase() !== "manual")
        item.dates.add(row.date);
    }
  }
  const pagination = useClientPagination(
    visible,
    `${filterEmployee}|${from}|${to}|${query}|${month}|${year}`,
  );
  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <select
          className="h-11 min-w-40 rounded-xl border bg-card px-4 shadow-sm"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {months.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="h-11 min-w-28 rounded-xl border bg-card px-4 shadow-sm"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {Array.from({ length: 9 }, (_, i) => now.getFullYear() - 4 + i).map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Metric
          label="Attendance deductions"
          value={money(sum(automatic))}
          tone="text-amber-600"
        />
        <Metric label="Manual deductions" value={money(sum(manual))} />
        <Metric
          label="Total deductions"
          value={money(sum(approved))}
          tone="text-rose-600"
        />
        <Metric
          label="Crew with deductions"
          value={
            [...employeeTotals.values()].filter(
              (item) => item.auto + item.manual > 0,
            ).length
          }
        />
      </div>
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-5 text-xl font-bold">Add Manual Deduction</h2>
        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_2fr_auto]">
          <Field label="Employee *">
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={employeeId}
              disabled={!canOthers}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Select employee</option>
              {employees
                .filter((e) => e.status !== "Offboarded")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.employeeCode})
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Deduction date *">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Amount *">
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Notes">
            <Input
              placeholder="Salary advance, recovery, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <Button
              disabled={busy || !can("crew.deductions.create")}
              onClick={() => void create()}
            >
              {busy ? "Adding..." : "Add"}
            </Button>
          </div>
        </div>
      </section>
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h3 className="mb-4 font-semibold">Record filters</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Employee">
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
            >
              <option value="All">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Field label="Search">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search records"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </Field>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              {[
                "Name",
                "Department",
                "Late days",
                "Attendance",
                "Manual",
                "Total",
              ].map((v) => (
                <th className="px-4 py-3" key={v}>
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees
              .filter((e) => e.status !== "Offboarded")
              .map((e) => {
                const item = employeeTotals.get(Number(e.id))!;
                return (
                  <tr className="border-t" key={e.id}>
                    <td className="px-4 py-3 font-medium">{e.name}</td>
                    <td className="px-4 py-3">{e.department}</td>
                    <td className="px-4 py-3">{item.dates.size}</td>
                    <td className="px-4 py-3">{money(item.auto)}</td>
                    <td className="px-4 py-3">{money(item.manual)}</td>
                    <td className="px-4 py-3 font-semibold">
                      {money(item.auto + item.manual)}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b p-4">
          <h3 className="font-semibold">
            Deduction records ({months[month]} {year})
          </h3>
          <p className="text-xs text-muted-foreground">
            Approved records considered for salary: {approved.length}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {[
                  "Employee",
                  "Applied date",
                  "Type",
                  "Amount",
                  "Notes",
                  "Status",
                ].map((v) => (
                  <th className="px-4 py-3" key={v}>
                    {v}
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
                    Loading deductions...
                  </td>
                </tr>
              ) : visible.length ? (
                pagination.paginatedRows.map((row) => (
                  <tr className="border-t" key={row.id}>
                    <td className="px-4 py-3 font-medium">
                      {row.employeeName}
                    </td>
                    <td className="px-4 py-3">{row.date}</td>
                    <td className="px-4 py-3">
                      <span>
                        {String(row.source).toLowerCase() === "manual"
                          ? "Manual"
                          : "Auto"}
                      </span>
                      <small className="block text-muted-foreground">
                        {row.autoReason?.replaceAll("_", " ")}
                      </small>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {money(row.amount)}
                    </td>
                    <td className="max-w-md px-4 py-3">{row.notes || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        Applied to Salary
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="p-12 text-center text-muted-foreground"
                  >
                    No deductions found
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
    </div>
  );
}
function Metric({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: any;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
function Field({ label, children }: { label: string; children: any }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
