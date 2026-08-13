import { useEffect, useMemo, useState } from "react";
import { Eye, Search } from "lucide-react";
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
const currency = (value: any) =>
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

export function BonusModule({
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
    own = employees.find(
      (employee) => Number(employee.id) === Number(user?.employeeId),
    ),
    canOthers = can("crew.bonus.forOthers");
  const [month, setMonth] = useState(now.getMonth() + 1),
    [year, setYear] = useState(now.getFullYear()),
    [employeeId, setEmployeeId] = useState(
      String((canOthers ? own || employees[0] : own)?.id || ""),
    ),
    [amount, setAmount] = useState(""),
    [notes, setNotes] = useState(""),
    [rows, setRows] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<any>(null),
    [salarySummaries, setSalarySummaries] = useState<any[]>([]);
  const payrollMonth = `${year}-${String(month).padStart(2, "0")}`;
  const load = async () => {
    setLoading(true);
    try {
      const [bonusRows, salary] = await Promise.all([
        api("bonus"),
        api(`bonus/salary-summary?payrollMonth=${payrollMonth}`),
      ]);
      setRows(bonusRows);
      setSalarySummaries(salary.summaries || []);
    } catch (error: any) {
      toast({
        title: "Unable to load bonuses",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [payrollMonth]);
  const create = async () => {
    const numeric = Number(amount);
    if (!employeeId || !Number.isFinite(numeric) || numeric <= 0) {
      toast({
        title: "Employee and a bonus amount greater than zero are required",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      await api("bonus", {
        method: "POST",
        body: JSON.stringify({
          employeeId: Number(employeeId),
          amount: numeric,
          notes,
          payrollMonth,
        }),
      });
      toast({
        title: "Bonus added to salary",
        description: `Included in ${months[month - 1]} ${year} salary.`,
      });
      setAmount("");
      setNotes("");
      await load();
    } catch (error: any) {
      toast({
        title: "Unable to create bonus",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const monthly = useMemo(
      () =>
        rows.filter(
          (row) =>
            row.status === "Approved" &&
            String(
              row.payrollMonth || row.attendanceDate || row.createdAt,
            ).slice(0, 7) === payrollMonth,
        ),
      [rows, payrollMonth],
    ),
    totals = useMemo(
      () =>
        monthly.reduce(
          (map, row) =>
            map.set(
              Number(row.employeeId),
              (map.get(Number(row.employeeId)) || 0) + Number(row.amount || 0),
            ),
          new Map<number, number>(),
        ),
      [monthly],
    ),
    payrollTotal = monthly.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    ),
    recent = monthly.filter(
      (row) =>
        !query ||
        `${row.employeeName} ${row.notes || ""} ${row.amount}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  const pagination = useClientPagination(
    recent,
    `${payrollMonth}|${query}`,
    10,
    "bonus-entries",
  );
  const summaryEmployees = useMemo(
    () => employees.filter((employee) => employee.status !== "Offboarded"),
    [employees],
  );
  const summaryPagination = useClientPagination(
    summaryEmployees,
    payrollMonth,
    10,
    "bonus-summary",
  );
  const years = Array.from(
    { length: 9 },
    (_, index) => now.getFullYear() - 4 + index,
  );
  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <select
          className="h-11 min-w-40 rounded-xl border bg-card px-4 text-sm shadow-sm"
          value={month}
          onChange={(event) => setMonth(Number(event.target.value))}
        >
          {months.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="h-11 min-w-28 rounded-xl border bg-card px-4 text-sm shadow-sm"
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
        >
          {years.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold">Bonus</h2>
          <p className="text-sm text-muted-foreground">
            Payroll total:{" "}
            <b className="text-foreground">{currency(payrollTotal)}</b>
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.2fr_1.2fr_2.4fr_auto]">
          <Field label="Select employee *">
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={employeeId}
              disabled={!canOthers}
              onChange={(event) => setEmployeeId(event.target.value)}
            >
              <option value="">Select employee</option>
              {summaryEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} ({employee.employeeCode})
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Bonus amount *">
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Bonus amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Notes">
            <Input
              maxLength={500}
              placeholder="Notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <Button
              disabled={busy || !can("crew.bonus.create")}
              onClick={() => void create()}
            >
              {busy ? "Creating..." : "Create Bonus"}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The bonus is added directly to the employee salary for the selected
          month.
        </p>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Employee bonus summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Current bonus</th>
                <th className="px-4 py-3">Monthly salary</th>
              </tr>
            </thead>
            <tbody>
              {summaryPagination.paginatedRows.map((employee) => (
                  <tr key={employee.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{employee.name}</td>
                    <td className="px-4 py-3">{employee.department}</td>
                    <td className="px-4 py-3 font-medium">
                      {currency(totals.get(Number(employee.id)) || 0)}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {currency(
                        salarySummaries.find(
                          (item) =>
                            Number(item.employeeId) === Number(employee.id),
                        )?.grossSalary ??
                          Number(employee.baseSalary || 0) +
                            (totals.get(Number(employee.id)) || 0),
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <DataPagination
          currentPage={summaryPagination.currentPage}
          pageSize={summaryPagination.pageSize}
          totalCount={summaryPagination.totalCount}
          totalPages={summaryPagination.totalPages}
          onPageChange={summaryPagination.setCurrentPage}
          onPageSizeChange={summaryPagination.setPageSize}
          loading={loading}
        />
      </section>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <h3 className="font-semibold">Recent bonus entries</h3>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="w-64 pl-9"
              placeholder="Search bonuses..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {[
                  "Employee",
                  "Amount",
                  "Notes",
                  "Status",
                  "Created",
                  "Action",
                ].map((value) => (
                  <th key={value} className="px-4 py-3">
                    {value}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-10 text-center text-muted-foreground"
                  >
                    Loading bonuses...
                  </td>
                </tr>
              ) : recent.length ? (
                pagination.paginatedRows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-3 font-medium">
                      {row.employeeName}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {currency(row.amount)}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3">
                      {row.notes || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        Added to Salary
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {new Date(row.createdAt).toLocaleDateString()}
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
                    className="p-10 text-center text-muted-foreground"
                  >
                    No bonus entries for this month
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
            <DialogTitle>Bonus Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Employee" value={selected.employeeName} />
              <Detail label="Amount" value={currency(selected.amount)} />
              <Detail label="Payroll month" value={selected.payrollMonth} />
              <Detail label="Salary status" value="Added to Salary" />
              <div className="sm:col-span-2">
                <Detail label="Notes" value={selected.notes || "No notes"} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
function Detail({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <b className="block">{value ?? "—"}</b>
    </div>
  );
}
