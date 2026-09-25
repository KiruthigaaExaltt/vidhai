import { pdf } from "@react-pdf/renderer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SalarySlipPdf from "./SalarySlipPdf";
import { useEffect, useMemo, useState } from "react";
import { DataPagination } from "@/components/ui/data-pagination";
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
    [tab, setTab] = useState(can("crewpay.salary_slip.view") ? "slips" : "payroll"),
    [slips, setSlips] = useState<any[]>([]),
    [payroll, setPayroll] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [department, setDepartment] = useState("All"),
    [status, setStatus] = useState("All"),
    [currentPage, setCurrentPage] = useState(1),
    [pageSize, setPageSize] = useState(15),
    [pagination, setPagination] = useState({ totalCount: 0, totalPages: 0 }),
    [serverTotals, setServerTotals] = useState({ gross: 0, deductions: 0, net: 0 }),
    [departmentOptions, setDepartmentOptions] = useState<string[]>([]),
    [selected, setSelected] = useState<any>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);
  useEffect(() => () => { if (pdfPreview) URL.revokeObjectURL(pdfPreview.url); }, [pdfPreview]);
  const load = async () => {
    if (tab !== "slips" || !can("crewpay.salary_slip.view")) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ payrollMonth: period, search, department, status, skip: String((currentPage - 1) * pageSize), limit: String(pageSize) });
      const result = await api(`salary-slips?${params}`);
      setSlips(result.data || []);
      setPayroll((result.data || []).map((row: any) => ({ employeeId: row.employeeId, status: row.payrollStatus })));
      setPagination({ totalCount: Number(result.totalCount || 0), totalPages: Number(result.totalPages || 0) });
      setServerTotals(result.totals || { gross: 0, deductions: 0, net: 0 });
      setDepartmentOptions(result.departments || []);
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
  }, [tab, period, search, department, status, currentPage, pageSize]);
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
            ? failed.map((item: any) => `${item.employeeName}: ${item.error}`).join("; ")
            : monthName(period)),
      });
      await load();
      if (employeeId) {
        const regenerated = result.results?.find((item: any) => item.success && Number(item.employeeId) === Number(employeeId));
        if (regenerated?.slip) setSelected(regenerated.slip);
      }
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
  const showPdf = async (download = true) => {
                try {
                  const org = await api("organization");
                  const blob = await pdf(<SalarySlipPdf slip={selected} organization={org} />).toBlob();
                  const url = URL.createObjectURL(blob);
                  if (!download) { setPdfPreview({ url, name: `${String(selected.employeeName).replace(/[^a-z0-9]/gi, "-")}-${selected.payrollMonth}.pdf` }); return; }
                  const link = document.createElement("a"); link.href = url; link.download = `${String(selected.employeeName).replace(/[^a-z0-9]/gi, "-")}-${selected.payrollMonth}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch (error: any) { toast({ title: "Unable to download PDF", description: error.message, variant: "destructive" }); }
  };
  const payrollByEmployee = new Map(
      payroll.map((row) => [Number(row.employeeId), row]),
    ),
    departments = ["All", ...departmentOptions],
    totals = serverTotals;
  return (
    <Shell>
      <Dialog open={!!pdfPreview} onOpenChange={open => { if (!open) setPdfPreview(null); }}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>Salary slip preview</DialogTitle></DialogHeader>{pdfPreview && <><iframe title="Salary slip PDF" src={pdfPreview.url} className="h-[70vh] w-full" /><a href={pdfPreview.url} download={pdfPreview.name} className="text-primary underline">Download PDF</a></>}</DialogContent></Dialog>
      <div className="min-w-0 flex-1 bg-muted/20">
        <div className="border-b bg-background px-4 sm:px-6">
          <nav className="flex gap-2 overflow-x-auto py-2">
            {can("crewpay.salary_slip.view") && <Tab active={tab === "slips"} onClick={() => { setSelected(null); setTab("slips"); }} icon={FileText}>Salary Slips</Tab>}
            {can("crewpay.payroll.view") && <Tab active={tab === "payroll"} onClick={() => { setSelected(null); setTab("payroll"); }} icon={Banknote}>Payroll</Tab>}
          </nav>
        </div>
        <main className="space-y-6 p-4 sm:p-6">
          {tab === "payroll" ? <PayrollPanel period={period} setPeriod={setPeriod} /> : selected ? (
            <SalaryDetail
              slip={selected}
              busy={busy}
              back={() => setSelected(null)}
              regenerate={() => void generate(selected.employeeId)}
              print={() => void showPdf()}
              preview={() => void showPdf(false)}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold">CrewPay</h1>
                </div>
                <div className="grid w-full grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:flex sm:w-auto">
                  <Input
                    className="w-full bg-card sm:w-40"
                    type="month"
                    value={period}
                    onChange={(e) => { setPeriod(e.target.value); setCurrentPage(1); }}
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
                  value={pagination.totalCount}
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
                    can("crewpay.salary_slip.for_others")
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
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search employees..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                  />
                </div>
                <select
                  className="h-10 rounded-md border bg-card px-3 text-sm"
                  value={department}
                  onChange={(e) => { setDepartment(e.target.value); setCurrentPage(1); }}
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
                  onChange={(e) => { setStatus(e.target.value); setCurrentPage(1); }}
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
                rows={slips}
                payrollByEmployee={payrollByEmployee}
                open={setSelected}
                pagination={
                  <DataPagination
                    currentPage={currentPage}
                    pageSize={pageSize}
                    totalCount={pagination.totalCount}
                    totalPages={pagination.totalPages}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
                    loading={loading}
                  />
                }
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
function SlipTable({
  loading,
  rows,
  payrollByEmployee,
  open,
  pagination,
}: any) {
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
            {loading && !rows.length ? (
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
      {pagination}
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
function SalaryDetail({ slip, busy, back, regenerate, print, preview }: any) {
  const { can } = useAuth();
  const a = slip.attendanceSummary || {},
    d = slip.deductionSummary || {},
    earnings = [
      ...(slip.salaryComponents || [])
        .filter((c: any) => c.componentType === "Earning")
        .map((c: any) => [c.componentName, c.earnedAmount]),
      ["Overtime", slip.overtimeAmount],
      ["Claims / Reimbursement", slip.claimsAmount],

    ],
    deductions = [
      ...(slip.salaryComponents || [])
        .filter((c: any) => c.componentType === "Deduction")
        .map((c: any) => [c.componentName, c.earnedAmount]),
      ["Employee PF", slip.statutoryContributions?.employeePf],
      ["Employee VPF", slip.statutoryContributions?.employeeVpf],
      ["Employee ESI", slip.statutoryContributions?.employeeEsi],
      ["Late fines", slip.lateFines],
      ...(slip.otherDeductionItems?.length ? slip.otherDeductionItems.map((item: any) => [item.name, item.amount]) : [["Other Deductions", d.otherDeductionsAmount]]),
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
          {can("crewpay.salary_slip.create") && <Button variant="outline" disabled={busy || slip.payrollStatus === "Paid"} onClick={regenerate}>
            Regenerate Slip
          </Button>}
          <Button variant="outline" onClick={preview}><Eye className="mr-2 h-4 w-4" />Preview</Button>
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
            value={`${a.payableDays || 0} / ${a.scheduledWorkingDays ?? slip.calendarMonthDays}`}
          />
          <Info label="Present" value={a.presentDays || 0} />
          <Info label="Absent and LOP" value={a.absentDays || 0} />
          <Info label="Late Days" value={a.lateDays || 0} />
          <Info label="Leaves" value={a.paidLeaveDays || 0} />
          <Info label="Pending approval" value={a.pendingApprovalDays || 0} />
          <Info label="Half days" value={a.halfDays || 0} />
          <Info label="Week offs" value={a.weekOffDays || 0} />
          <Info label="Holidays" value={a.holidayDays || 0} />
          <Info label="Hours worked" value={a.hoursWorked || 0} />
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
        {Number(slip.statutoryContributions?.employerContributionTotal || 0) > 0 && <div className="mt-6 rounded-lg border p-4"><h3 className="mb-3 font-semibold">Employer contributions (included in CTC)</h3><div className="grid gap-3 sm:grid-cols-4"><Info label="Employer PF" value={money(slip.statutoryContributions.employerPf)} /><Info label="Employer VPF" value={money(slip.statutoryContributions.employerVpf)} /><Info label="Employer ESI" value={money(slip.statutoryContributions.employerEsi)} /><Info label="Total employer cost" value={money(slip.statutoryContributions.totalEmployerCost)} /></div></div>}
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

function PayrollPanel({ period, setPeriod }: { period: string; setPeriod: (value: string) => void }) {
  const { can } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async () => { try { setRows(await api('payroll?payrollMonth=' + period)); } catch (error: any) { toast({ title: 'Unable to load payroll', description: error.message, variant: 'destructive' }); } };
  useEffect(() => { void load(); }, [period]);
  const advance = async (targetStatus: string, employeeId?: number) => {
    setBusy(true);
    try { await api('payroll/sync-to-ledger', { method: 'POST', body: JSON.stringify({ payrollMonth: period, targetStatus, employeeId }) }); await load(); toast({ title: 'Payroll updated' }); }
    catch (error: any) { toast({ title: 'Unable to update payroll', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Payroll</h1><div className="flex gap-2"><Input type="month" value={period} onChange={e => setPeriod(e.target.value)} />{can('crewpay.payroll.create') && <Button disabled={busy} onClick={() => void advance('Processing')}>Sync salary slips</Button>}</div></div><div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead><tr>{['Employee', 'Gross pay', 'Deductions', 'Net pay', 'Status', 'Action'].map(label => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t"><td className="p-3">{row.employeeName}</td><td className="p-3">{money(row.grossPay)}</td><td className="p-3">{money(row.deductions)}</td><td className="p-3">{money(row.netPay)}</td><td className="p-3"><Badge value={row.status} /></td><td className="p-3">{row.status !== 'Paid' && can('crewpay.payroll.update') && <Button size="sm" disabled={busy} onClick={() => void advance(row.status === 'Processing' ? 'Processed' : 'Paid', row.employeeId)}>{row.status === 'Processing' ? 'Mark processed' : 'Mark paid'}</Button>}</td></tr>)}{!rows.length && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">Generate salary slips, then sync them to payroll.</td></tr>}</tbody></table></div></div>;
}
