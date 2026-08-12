import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Download,
  Eye,
  FileText,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
const root = String(
  import.meta.env.VITE_API_BASE || import.meta.env.BASE_URL || "",
)
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
const api = async (path: string, options?: RequestInit) => {
  const response = await fetch(`${root}/api/crewpay/${path}`, {
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
    }),
  monthName = (value: string) =>
    new Date(`${value}-01T00:00:00`).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
export default function CrewPay() {
  const now = new Date(),
    { can } = useAuth(),
    { toast } = useToast(),
    [period, setPeriod] = useState(now.toISOString().slice(0, 7)),
    [slips, setSlips] = useState<any[]>([]),
    [payroll, setPayroll] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [department, setDepartment] = useState("All"),
    [status, setStatus] = useState("All"),
    [selected, setSelected] = useState<any>(null);
  const load = async () => {
    setLoading(true);
    try {
      let salaryRows = await api(`salary-slips?payrollMonth=${period}`);
      const payrollRows = await api(`payroll?payrollMonth=${period}`).catch(
        () => [],
      );
      setSlips(salaryRows);
      setPayroll(payrollRows);
    } catch (error: any) {
      toast({
        title: "Unable to load CrewPay",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [period]);
  const generate = async (employeeId?: number) => {
    setBusy(true);
    try {
      const [year, month] = period.split("-").map(Number),
        result = await api("salary-slips/generate", {
          method: "POST",
          body: JSON.stringify({ year, month, employeeId }),
        }),
        failed = result.results?.filter((item: any) => !item.success) || [];
      toast({
        title: !result.results?.length
          ? "No salary slips generated"
          : employeeId
            ? "Salary slip regenerated"
            : "Salary slips generated",
        description:
          result.message ||
          (failed.length
            ? String(failed.length) + " employee(s) could not be generated."
            : monthName(period)),
      });
      await load();
    } catch (error: any) {
      toast({
        title: "Unable to generate salary slips",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const payrollByEmployee = new Map(
      payroll.map((row) => [Number(row.employeeId), row]),
    ),
    departments = [
      "All",
      ...new Set(slips.map((row) => row.department).filter(Boolean)),
    ],
    visible = useMemo(
      () =>
        slips.filter(
          (row) =>
            (department === "All" || row.department === department) &&
            (status === "All" ||
              (payrollByEmployee.get(Number(row.employeeId))?.status ||
                "Generated") === status) &&
            (!search ||
              `${row.employeeName} ${row.employeeCode} ${row.department} ${row.designation}`
                .toLowerCase()
                .includes(search.toLowerCase())),
        ),
      [slips, payroll, department, status, search],
    ),
    totals = {
      gross: visible.reduce((n, r) => n + Number(r.grossPay || 0), 0),
      deductions: visible.reduce(
        (n, r) => n + Number(r.totalDeductions || 0),
        0,
      ),
      net: visible.reduce((n, r) => n + Number(r.netPay || 0), 0),
    };
  return (
    <Shell>
      <div className="min-w-0 flex-1 bg-muted/20">
        <div className="border-b bg-background px-6">
          <nav className="flex gap-2 py-2">
            <Tab active onClick={() => setSelected(null)} icon={FileText}>
              Salary Slips
            </Tab>
          </nav>
        </div>
        <main className="space-y-6 p-6">
          {selected ? (
            <SalaryDetail
              slip={selected}
              busy={busy}
              back={() => setSelected(null)}
              regenerate={() => void generate(selected.employeeId)}
              print={() => window.print()}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold">CrewPay</h1>
                  <p className="text-sm text-muted-foreground">
                    Monthly salary-slip generation, payroll processing, and
                    ledger sync
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    className="w-40 bg-card"
                    type="month"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  />
                  {can("crewpay.salary_slip.create") && (
                    <Button disabled={busy} onClick={() => void generate()}>
                      {busy ? "Generating..." : "Generate Slips"}
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                <Metric
                  icon={CalendarDays}
                  label="Selected period"
                  value={monthName(period)}
                  tone="text-blue-600"
                />
                <Metric
                  icon={FileText}
                  label="Generated slips"
                  value={slips.length}
                  tone="text-emerald-600"
                />
                <Metric
                  icon={Banknote}
                  label="Total net salary"
                  value={money(totals.net)}
                  tone="text-violet-600"
                />
                <Metric
                  icon={ShieldCheck}
                  label="Access"
                  value={
                    can("crewpay.salary_slip.forOthers")
                      ? "Generate and review"
                      : "My salary"
                  }
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Amount label="Gross salary" value={totals.gross} />
                <Amount label="Total deductions" value={totals.deductions} />
                <Amount label="Net salary" value={totals.net} />
              </div>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search employees..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  className="h-10 rounded-md border bg-card px-3 text-sm"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  {departments.map((value) => (
                    <option key={value} value={value}>
                      {value === "All" ? "All Departments" : value}
                    </option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md border bg-card px-3 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {["All", "Generated", "Processing", "Processed", "Paid"].map(
                    (value) => (
                      <option key={value} value={value}>
                        {value === "All" ? "All statuses" : value}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <SlipTable
                loading={loading}
                rows={visible}
                payrollByEmployee={payrollByEmployee}
                open={setSelected}
              />
            </>
          )}
        </main>
      </div>
    </Shell>
  );
}
function Tab({ active, onClick, icon: Icon, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm ${active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted"}`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}
function Metric({ icon: Icon, label, value, tone = "" }: any) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <Icon className={`h-5 w-5 ${tone}`} />
        {label}
      </div>
      <p className="mt-3 text-xl font-bold">{value}</p>
    </div>
  );
}
function Amount({ label, value }: any) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{money(value)}</p>
    </div>
  );
}
function SlipTable({ loading, rows, payrollByEmployee, open }: any) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              {[
                "Employee code",
                "Employee name",
                "Department",
                "Designation",
                "Net salary",
                "Status",
                "Action",
              ].map((v) => (
                <th className="px-4 py-3" key={v}>
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <Empty text="Loading salary slips..." />
            ) : rows.length ? (
              rows.map((r: any) => (
                <tr className="border-t" key={r.id}>
                  <td className="px-4 py-3 font-mono">{r.employeeCode}</td>
                  <td className="px-4 py-3 font-medium">{r.employeeName}</td>
                  <td className="px-4 py-3">{r.department}</td>
                  <td className="px-4 py-3">{r.designation}</td>
                  <td className="px-4 py-3 font-semibold">{money(r.netPay)}</td>
                  <td className="px-4 py-3">
                    <Badge
                      value={
                        payrollByEmployee.get(Number(r.employeeId))?.status ||
                        "Generated"
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Button size="icon" variant="ghost" onClick={() => open(r)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <Empty text="Generate salary slips for this period" />
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t p-4 text-sm text-muted-foreground">
        {rows.length} salary slips
      </div>
    </section>
  );
}
function Empty({ text }: any) {
  return (
    <tr>
      <td colSpan={8} className="p-14 text-center text-muted-foreground">
        {text}
      </td>
    </tr>
  );
}
function Badge({ value }: any) {
  const color =
    value === "Paid"
      ? "bg-emerald-50 text-emerald-700"
      : value === "Processed"
        ? "bg-blue-50 text-blue-700"
        : value === "Processing"
          ? "bg-amber-50 text-amber-700"
          : "bg-slate-100 text-slate-700";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>
      {value}
    </span>
  );
}
function SalaryDetail({ slip, busy, back, regenerate, print }: any) {
  const a = slip.attendanceSummary || {},
    d = slip.deductionSummary || {},
    earnings = [
      ...(slip.salaryComponents || [])
        .filter((c: any) => c.componentType === "Earning")
        .map((c: any) => [c.componentName, c.earnedAmount]),
      ["Overtime", slip.overtimeAmount],
      ["Claims / Reimbursement", slip.claimsAmount],
      ["Bonus", slip.bonusAmount],
    ],
    deductions = [
      ...(slip.salaryComponents || [])
        .filter((c: any) => c.componentType === "Deduction")
        .map((c: any) => [c.componentName, c.earnedAmount]),
      ["Other Deductions", d.otherDeductionsAmount],
    ];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button size="icon" variant="outline" onClick={back}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{slip.employeeName}</h2>
          <p className="text-sm text-muted-foreground">
            {slip.department} | {slip.employeeCode}
          </p>
        </div>
      </div>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5 shadow-sm">
        <div className="rounded-md border px-4 py-2 font-medium">
          {monthName(slip.payrollMonth)}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={regenerate}>
            Regenerate Slip
          </Button>
          <Button onClick={print}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </section>
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-5">
          <Info
            label="Payable Days"
            value={`${a.payableDays || 0} / ${slip.calendarMonthDays}`}
          />
          <Info label="Present" value={a.presentDays || 0} />
          <Info label="Absent and LOP" value={a.absentDays || 0} />
          <Info label="Late Days" value={a.lateDays || 0} />
          <Info label="Leaves" value={a.paidLeaveDays || 0} />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border">
            <div className="flex justify-between border-b p-4 font-semibold">
              <span>Earnings</span>
              <span>Amount</span>
            </div>
            {earnings.map((row: any, index: number) => (
              <div
                className="flex justify-between border-b px-4 py-3 text-sm"
                key={`${row[0]}-${index}`}
              >
                <span>{row[0]}</span>
                <b>{money(row[1])}</b>
              </div>
            ))}
            <div className="flex justify-between bg-muted/30 p-4 font-bold">
              <span>Gross Pay</span>
              <span>{money(slip.grossPay)}</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="flex justify-between border-b p-4 font-semibold">
              <span>Deductions</span>
              <span>Amount</span>
            </div>
            <div className="flex justify-between border-b px-4 py-3 text-sm">
              <span>
                LOP (Loss of Pay)
                <small className="block text-muted-foreground">
                  Already adjusted in earned salary
                </small>
              </span>
              <b>{money(d.lopAmount)}</b>
            </div>
            {deductions.map((row: any, index: number) => (
              <div
                className="flex justify-between border-b px-4 py-3 text-sm"
                key={`${row[0]}-${index}`}
              >
                <span>{row[0]}</span>
                <b>{money(row[1])}</b>
              </div>
            ))}
            <div className="flex justify-between bg-muted/30 p-4 font-bold">
              <span>Total Deductions</span>
              <span className="text-rose-600">
                {money(slip.totalDeductions)}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-6">
          <div>
            <p className="font-medium text-primary">Net Pay</p>
            <p className="text-xs text-muted-foreground">
              Gross Pay ({money(slip.grossPay)}) - Deductions (
              {money(slip.totalDeductions)})
            </p>
          </div>
          <p className="text-3xl font-bold text-primary">
            {money(slip.netPay)}
          </p>
        </div>
      </section>
    </div>
  );
}
function SalaryPreview({ slip }: any) {
  const a = slip.attendanceSummary || {},
    d = slip.deductionSummary || {};
  return (
    <div className="space-y-5 print:p-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold">VIDHAI SYSTEMS</h2>
        <p>Salary Slip — {monthName(slip.payrollMonth)}</p>
      </div>
      <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-3">
        <Info label="Employee" value={slip.employeeName} />
        <Info label="Employee code" value={slip.employeeCode} />
        <Info label="Department" value={slip.department} />
        <Info label="Designation" value={slip.designation} />
        <Info
          label="Payable days"
          value={`${a.payableDays}/${slip.calendarMonthDays}`}
        />
        <Info label="Hours worked" value={a.hoursWorked} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Breakdown
          title="Earnings"
          rows={[
            ...(slip.salaryComponents || [])
              .filter((c: any) => c.componentType === "Earning")
              .map((c: any) => [c.componentName, c.earnedAmount]),
            ["Overtime", slip.overtimeAmount],
            ["Claims / reimbursement", slip.claimsAmount],
            ["Bonus", slip.bonusAmount],
            ["Gross Pay", slip.grossPay],
          ]}
        />
        <Breakdown
          title="Deductions"
          rows={[
            ...(slip.salaryComponents || [])
              .filter((c: any) => c.componentType === "Deduction")
              .map((c: any) => [c.componentName, c.earnedAmount]),
            ["Other deductions", d.otherDeductionsAmount],
            ["LOP (information only)", d.lopAmount],
            ["Total Deductions", slip.totalDeductions],
          ]}
        />
      </div>
      <div className="rounded-lg bg-primary/5 p-5 text-right">
        <p className="text-sm text-muted-foreground">Net Pay</p>
        <p className="text-3xl font-bold text-primary">{money(slip.netPay)}</p>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Computer-generated salary slip
      </p>
    </div>
  );
}
function Info({ label, value }: any) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <b className="block">{value ?? "—"}</b>
    </div>
  );
}
function Breakdown({ title, rows }: any) {
  return (
    <div className="rounded-lg border">
      <h3 className="border-b p-3 font-semibold">{title}</h3>
      {rows.map((r: any, i: number) => (
        <div
          className="flex justify-between border-b px-3 py-2 text-sm last:border-0"
          key={`${r[0]}-${i}`}
        >
          <span>{r[0]}</span>
          <b>{money(r[1])}</b>
        </div>
      ))}
    </div>
  );
}
