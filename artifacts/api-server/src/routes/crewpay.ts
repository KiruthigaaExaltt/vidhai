import { calculateStatutorySalary } from "@workspace/db/payroll/salary";
import { buildNonWorkingPaidDateSet, calculatePayableWorkingDays, calculateLeaveWorkingDays, calculateAbsentWorkingDays, calculatePendingApprovalWorkingDays, countScheduledWorkingDaysInRange, calculateLopAmountFromPayableDays, isFinalizedAttendanceLog } from "@workspace/db/payroll/calendar";
import { Router } from "express";
import {
  and,
  db,
  desc,
  eq,
  employeesTable,
  attendanceLogsTable,
  leaveRequestsTable,
  crewClaimsTable,
  crewDeductionsTable,
  salaryTemplatesTable,
  workPatternTemplatesTable,
  holidayTemplatesTable,
  salarySlipsTable,
  payrollTable,
  organizationDetailsTable,
} from "@workspace/db";
import { effectivePermissions, getAuthUser } from "../lib/access";
import { paginateQuery, paginationMetadata } from "../lib/pagination";
import { syncAttendanceDeductions } from "./crew";
const router = Router(),
  round = (n: number) => Math.round(n * 100) / 100,
  json = (v: any, f: any = {}) => {
    try {
      return typeof v === "string" ? JSON.parse(v) : (v ?? f);
    } catch {
      return f;
    }
  },
  isoMonth = (v: any) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || "")),
  daysBetween = (start: string, end: string) => {
    const out: string[] = [];
    for (
      let d = new Date(`${start}T00:00:00Z`),
        last = new Date(`${end}T00:00:00Z`);
      d <= last;
      d.setUTCDate(d.getUTCDate() + 1)
    )
      out.push(d.toISOString().slice(0, 10));
    return out;
  },
  clock = (value: any) => {
    const [h, m] = String(value || "0:0")
      .split(":")
      .map(Number);
    return h * 60 + m;
  };
router.use(async (req: any, res, next) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  req.pay = {
    user,
    org: Number(user.organizationId ?? 1),
    permissions: await effectivePermissions(user),
  };
  return next();
});
const can = (req: any, key: string) =>
    req.pay.permissions.includes("*") || req.pay.permissions.includes(key),
  need = (req: any, res: any, key: string) =>
    can(req, key)
      ? true
      : (res.status(403).json({ error: `Missing permission: ${key}` }), false);
async function ownEmployee(req: any) {
  return (
    await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.organizationId, req.pay.org),
          eq(employeesTable.userId, Number(req.pay.user.id)),
        ),
      )
  ).find((e: any) => !e.isDeleted);
}
async function allowedEmployees(req: any, sub: string, requested?: number) {
  let rows = (
    await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.organizationId, req.pay.org))
  ).filter((e: any) => !e.isDeleted);
  if (can(req, `crewpay.${sub}.for_others`))
    return requested
      ? rows.filter((e: any) => Number(e.id) === requested)
      : rows;
  const own = await ownEmployee(req);
  if (!can(req, `crewpay.${sub}.for_own`) || !own) return [];
  return requested && Number(own.id) !== requested ? [] : [own];
}
async function buildSlip(req: any, employee: any, payrollMonth: string) {
  const [year, monthNumber] = payrollMonth.split("-").map(Number),
    month = monthNumber - 1,
    monthStart = `${payrollMonth}-01`,
    calendarMonthDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
    calendarEnd = `${payrollMonth}-${String(calendarMonthDays).padStart(2, "0")}`,
    today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    }),
    periodEnd =
      payrollMonth === today.slice(0, 7) && today < calendarEnd
        ? today
        : calendarEnd,
    start =
      employee.joinDate && employee.joinDate > monthStart
        ? employee.joinDate
        : monthStart,
    end =
      employee.exitDate && employee.exitDate < periodEnd
        ? employee.exitDate
        : periodEnd;
  if (start > end)
    throw new Error("Employee is outside the selected payroll period");
  const [previousSlip] = await db.select().from(salarySlipsTable).where(and(eq(salarySlipsTable.organizationId, req.pay.org), eq(salarySlipsTable.employeeId, employee.id), eq(salarySlipsTable.payrollMonth, payrollMonth)));
  const [previousPayroll] = await db.select().from(payrollTable).where(and(eq(payrollTable.organizationId, req.pay.org), eq(payrollTable.employeeId, employee.id), eq(payrollTable.payPeriod, payrollMonth)));
  if (previousPayroll?.status === "Paid") throw new Error("Paid payroll is locked and cannot be regenerated");
  const [organization] = await db.select().from(organizationDetailsTable).where(eq(organizationDetailsTable.organizationId, req.pay.org));
  await syncAttendanceDeductions(req.pay.org, month, year);
  const [
      templates,
      patterns,
      holidays,
      attendance,
      leaves,
      claims,
      deductions,
    ] = await Promise.all([
      db
        .select()
        .from(salaryTemplatesTable)
        .where(eq(salaryTemplatesTable.organizationId, req.pay.org)),
      db
        .select()
        .from(workPatternTemplatesTable)
        .where(eq(workPatternTemplatesTable.organizationId, req.pay.org)),
      db
        .select()
        .from(holidayTemplatesTable)
        .where(eq(holidayTemplatesTable.organizationId, req.pay.org)),
      db
        .select()
        .from(attendanceLogsTable)
        .where(
          and(
            eq(attendanceLogsTable.organizationId, req.pay.org),
            eq(attendanceLogsTable.employeeId, employee.id),
          ),
        ),
      db
        .select()
        .from(leaveRequestsTable)
        .where(
          and(
            eq(leaveRequestsTable.organizationId, req.pay.org),
            eq(leaveRequestsTable.employeeId, employee.id),
          ),
        ),
      db
        .select()
        .from(crewClaimsTable)
        .where(
          and(
            eq(crewClaimsTable.organizationId, req.pay.org),
            eq(crewClaimsTable.employeeId, employee.id),
          ),
        ),
      db
        .select()
        .from(crewDeductionsTable)
        .where(
          and(
            eq(crewDeductionsTable.organizationId, req.pay.org),
            eq(crewDeductionsTable.employeeId, employee.id),
          ),
        ),
    ]),
    active = (r: any) => r && r.isActive !== false,
    salaryTemplate =
      templates.find(
        (r: any) =>
          Number(r.id) === Number(employee.salaryTemplateId) && active(r),
      ),
    pattern =
      patterns.find(
        (r: any) =>
          Number(r.id) === Number(employee.workPatternTemplate) && active(r),
      ),
    holidayTemplate =
      holidays.find(
        (r: any) =>
          Number(r.id) === Number(employee.holidayTemplate) &&
          active(r) &&
          Number(r.effectiveYear) === year,
      ),
    holidayDates = new Set<string>(
      (json(holidayTemplate?.holidays, []) as any[]).map((h) => h.date),
    ),
    attendanceByDate = new Map(
      attendance
        .filter(
          (r: any) =>
            r.attendanceDate >= start &&
            r.attendanceDate <= end &&
            (!r.approvalStatus || r.approvalStatus === "Approved"),
        )
        .map((r: any) => [r.attendanceDate, r]),
    ),
    approvedLeaves = leaves.filter(
      (r: any) =>
        r.status === "Approved" && r.startDate <= end && r.endDate >= start,
    );
  if (!salaryTemplate)
    throw new Error(
      `Assign an active salary template to ${employee.name} before generating payroll.`,
    );
  const snapshot = Number(previousSlip?.salaryTemplateId) === Number(salaryTemplate.id) ? json(previousSlip?.templateSnapshot, {}) : {};
  const configured = snapshot.components || json(salaryTemplate.components, []);
  if (!Array.isArray(configured) || configured.length === 0)
    throw new Error(
      `The salary template assigned to ${employee.name} has no components.`,
    );
  if (!pattern || !holidayTemplate) throw new Error('Assign available work pattern and holiday templates to ' + employee.name);
  const workPattern = Object.fromEntries([1, 2, 3, 4, 5].map(week => ['week' + week + 'OffDays', json(pattern['week' + week + 'OffDays'], [])]));
  const nonWorkingPaidDates = buildNonWorkingPaidDateSet({ monthStartIso: monthStart, monthEndIso: calendarEnd, workPattern, holidayDates });
  const scheduledWorkingDays = calendarMonthDays - nonWorkingPaidDates.size;
  const finalized = [...attendanceByDate.values()].filter(isFinalizedAttendanceLog).map((log: any) => ({ ...log, status: log.status === "Work From Home" ? "WFH" : log.status }));
  const paidLeaves = approvedLeaves.filter((leave: any) => !["other", "permission"].includes(String(leave.leaveType).toLowerCase())).map((leave: any) => ({ ...leave, fromSession: String(leave.fromSession), toSession: String(leave.toSession) }));
  const pendingAttendanceDates = new Set<string>(attendance.filter((log: any) => log.approvalStatus === "Pending" || (!isFinalizedAttendanceLog(log) && log.approvalStatus !== "Rejected")).map((log: any) => log.attendanceDate));
  const calendarInput = { employmentStartIso: start, employmentEndIso: end, nonWorkingPaidDates, approvedLeaves: paidLeaves, attendanceLogs: finalized, pendingAttendanceDates };
  const payableDays = calculatePayableWorkingDays(calendarInput);
  const paidLeaveDays = calculateLeaveWorkingDays(calendarInput);
  const absentDays = calculateAbsentWorkingDays(calendarInput);
  const pendingApprovalDays = calculatePendingApprovalWorkingDays(calendarInput);
  const presentDays = finalized.filter((log: any) => log.status === "Present").length;
  const lateDays = finalized.filter((log: any) => log.status === "Late").length;
  const halfDays = finalized.filter((log: any) => log.status === "Half Day").length * 0.5;
  const workedDays = finalized.reduce((sum: number, log: any) => sum + (["Present", "Late", "Remote", "WFH"].includes(log.status) ? 1 : 0), 0);
  const employmentEnd = employee.exitDate && employee.exitDate < calendarEnd ? employee.exitDate : calendarEnd;
  const holidayDays = daysBetween(start, employmentEnd).filter(date => holidayDates.has(date)).length;
  const weekOffDays = daysBetween(start, employmentEnd).filter(date => nonWorkingPaidDates.has(date) && !holidayDates.has(date)).length;
  const hoursWorked = finalized.reduce((sum: number, log: any) => sum + (log.checkInTime && log.checkOutTime ? Math.max(0, clock(log.checkOutTime) - clock(log.checkInTime)) / 60 : 0), 0);
  const elapsedScheduledWorkingDays = countScheduledWorkingDaysInRange({ rangeStartIso: start, rangeEndIso: end, nonWorkingPaidDates });
  const fixedComponentValues = json(employee.fixedComponentValues, {});
  const monthlyCtc = Math.max(0, Number(employee.baseSalary || 0) || Number(employee.annualCtc || 0) / 12);
  const ratio = scheduledWorkingDays <= 0 ? 1 : Math.max(0, Math.min(1, payableDays / scheduledWorkingDays));
  const history = json(employee.statutoryContributionHistory, []).filter((entry: any) => entry.effectiveFromMonth <= payrollMonth).sort((a: any, b: any) => a.effectiveFromMonth.localeCompare(b.effectiveFromMonth));
  const statutoryConfig = history.length ? history[history.length - 1].settings : json(employee.statutoryContributions, {});
  const statutoryResult = calculateStatutorySalary({ templateComponents: configured, baseSalary: monthlyCtc, fixedComponentValues, earnedRatio: ratio, payableDays, year, month: monthNumber, employee: { ...employee, esiEligibilityPeriods: json(employee.esiEligibilityPeriods, {}) }, statutoryConfig, rates: json(organization?.statutoryPayroll, {}) });
  const statutoryContributions = statutoryResult.statutoryContributions;
  if (statutoryConfig.esiEnabled) await db.update(employeesTable).set({ esiEligibilityPeriods: JSON.stringify({ ...json(employee.esiEligibilityPeriods, {}), [statutoryContributions.esiContributionPeriod]: statutoryContributions.esiEligibleForPeriod }) }).where(and(eq(employeesTable.id, employee.id), eq(employeesTable.organizationId, req.pay.org)));
  const components = statutoryResult.components.map((component, index) => ({ ...component, componentName: component.name, componentType: ["pf", "esi", "pt", "tds"].includes(component.componentId.toLowerCase()) ? "Deduction" : "Earning", displayOrder: index + 1 }));
  const monthClaims = claims.filter(
      (r: any) =>
        r.status === "Approved" &&
        String(r.attendanceDate || (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "")) >= monthStart &&
        String(r.attendanceDate || (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "")) <= periodEnd,
    ),
    sumClaims = (types: string[]) =>
      round(
        monthClaims
          .filter((r: any) => types.includes(r.claimType))
          .reduce((n: number, r: any) => n + Number(r.amount || 0), 0),
      ),
    overtimeAmount = sumClaims(["overtime"]),
    claimsAmount = sumClaims(["reimbursement", "allowance"]),
    bonusAmount = 0,
    monthDeductions = deductions.filter(
      (r: any) =>
        r.status === "Approved" && r.year === year && r.month === month,
    ),
    lopRows = monthDeductions.filter(
      (r: any) =>
        String(r.source || "").toLowerCase() !== "manual" && (String(r.autoReason || "")
          .toLowerCase()
          .includes("absent") ||
        String(r.autoReason || "")
          .toLowerCase()
          .includes("half day") ||
        String(r.autoReason || "")
          .toLowerCase()
          .includes("other leave")),
    ),
    // LOP is already reflected by prorating earnings. Derive the displayed
    // amount from that same calculation, including absences without a log.
    lopAmount = calculateLopAmountFromPayableDays(monthlyCtc, scheduledWorkingDays, elapsedScheduledWorkingDays, payableDays),
    lateRows = monthDeductions.filter((r: any) => !lopRows.includes(r) && (r.source === "attendance_auto_deduction" || r.source === "Auto")),
    lateFines = round(lateRows.reduce((n: number, r: any) => n + Number(r.amount || 0), 0)),
    otherDeductionItems = monthDeductions.filter((r: any) => !lopRows.includes(r) && !lateRows.includes(r)).map((r: any) => ({ deductionId: r.id, name: r.deductionName || r.notes || "Other Deduction", amount: Number(r.amount), isRecurring: Boolean(r.isRecurring), installmentNumber: r.installmentNumber || null, numberOfInstallments: r.numberOfInstallments || null })),
    otherDeductionsAmount = round(
      monthDeductions
        .filter((r: any) => !lopRows.includes(r) && !lateRows.includes(r))
        .reduce((n: number, r: any) => n + Number(r.amount || 0), 0),
    ),
    salaryTemplateDeductions = round(
      components
        .filter((c: any) => c.componentType === "Deduction")
        .reduce((n: number, c: any) => n + c.earnedAmount, 0),
    ),
    earnedBaseSalary = round(
      components
        .filter((c: any) => c.componentType === "Earning")
        .reduce((n: number, c: any) => n + c.earnedAmount, 0),
    ),
    grossPay = round(
      earnedBaseSalary + overtimeAmount + claimsAmount + bonusAmount,
    ),
    totalDeductions = round(salaryTemplateDeductions + statutoryContributions.employeeContributionTotal + otherDeductionsAmount + lateFines),
    netPay = round(grossPay - totalDeductions),
    attendanceSummary = {
      presentDays,
      lateDays,
      absentDays,
      halfDays,
      workedDays,
      scheduledWorkingDays,
      pendingApprovalDays,
      payableDays,
      paidLeaveDays,
      weekOffDays,
      holidayDays,
      hoursWorked: round(hoursWorked),
    },
    deductionSummary = {
      lopAmount,
      otherDeductionsAmount,
      salaryTemplateDeductions,
      lateFines,
      statutoryContributions,
      totalDeductions,
    };
  const values = {
      payrollMonth,
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.employeeCode,
      department: employee.department,
      designation: employee.designation,
      workLocation: employee.location,
      location: employee.location,
      salaryTemplateId: salaryTemplate?.id || null,
      salaryTemplateName: snapshot.templateName || salaryTemplate.templateName,
      templateSnapshot: JSON.stringify({ templateName: snapshot.templateName || salaryTemplate.templateName, components: configured }),
      statutoryContributions: JSON.stringify({ ...statutoryContributions, totalEmployerCost: round(statutoryContributions.totalEmployerCost + overtimeAmount + claimsAmount) }),
      lateFines: String(lateFines),
      otherDeductionItems: JSON.stringify(otherDeductionItems),
      salaryComponents: JSON.stringify(components),
      salaryTemplateComponents: JSON.stringify(
        components.map((component: any) => ({
          componentId: component.componentId,
          name: component.componentName,
          calculationType: component.calculationType,
          monthlyAmount: component.monthlyAmount,
          yearlyAmount: component.yearlyAmount,
          earnedAmount: component.earnedAmount,
        })),
      ),
      employeeDetails: JSON.stringify({
        pan: employee.panNumber,
        uan: employee.uan,
        pfNumber: employee.pfNumber,
        esiNumber: employee.esiNumber,
        bankName: employee.bankName,
        accountNumber: employee.accountNumber,
        joinDate: employee.joinDate,
        exitDate: employee.exitDate,
      }),
      panNumber: employee.panNumber,
      uan: employee.uan,
      pfNumber: employee.pfNumber,
      esiNumber: employee.esiNumber,
      bankName: employee.bankName,
      accountNumber: employee.accountNumber,
      joinDate: employee.joinDate,
      employmentWindowStart: start,
      employmentWindowEnd: employmentEnd,
      calendarMonthDays,
      monthDays: calendarMonthDays,
      employmentDays: daysBetween(start, end).length,
      presentDays: String(presentDays),
      lateDays: String(lateDays),
      lateDaysDeductionApplied: String(monthDeductions.filter((r: any) => r.source === "attendance_auto_deduction" && !lopRows.includes(r)).length),
      lateDaysDeductionRejected: String(deductions.filter((r: any) => r.status === "Rejected" && r.year === year && r.month === month && r.source === "attendance_auto_deduction").length),
      absentDays: String(absentDays),
      halfDays: String(halfDays),
      workedDays: String(workedDays),
      payableDays: String(payableDays),
      leaveDays: String(paidLeaveDays),
      weekOffDays: String(weekOffDays),
      holidayDays: String(holidayDays),
      hoursWorked: String(round(hoursWorked)),
      attendanceSummary: JSON.stringify(attendanceSummary),
      deductionSummary: JSON.stringify(deductionSummary),
      baseSalary: String(monthlyCtc),
      earnedBaseSalary: String(earnedBaseSalary),
      overtimeAmount: String(overtimeAmount),
      claimsAmount: String(claimsAmount),
      bonusAmount: String(bonusAmount),
      deductionsAmount: String(totalDeductions),
      lopAmount: String(lopAmount),
      otherDeductionsAmount: String(otherDeductionsAmount),
      grossPay: String(grossPay),
      totalDeductions: String(totalDeductions),
      netPay: String(netPay),
      status: "Generated",
      generatedBy: req.pay.user.id,
      generatedAt: new Date(),
      updatedAt: new Date(),
    },
    existing = (
      await db
        .select()
        .from(salarySlipsTable)
        .where(
          and(
            eq(salarySlipsTable.organizationId, req.pay.org),
            eq(salarySlipsTable.employeeId, employee.id),
            eq(salarySlipsTable.payrollMonth, payrollMonth),
          ),
        )
    )[0];
  let row;
  if (existing) {
    const payroll = (
      await db
        .select()
        .from(payrollTable)
        .where(
          and(
            eq(payrollTable.organizationId, req.pay.org),
            eq(payrollTable.employeeId, employee.id),
            eq(payrollTable.payPeriod, payrollMonth),
          ),
        )
    )[0];
    if (payroll?.status === "Paid")
      throw new Error("Paid payroll is locked and cannot be regenerated");
    [row] = await db
      .update(salarySlipsTable)
      .set(values)
      .where(eq(salarySlipsTable.id, existing.id))
      .returning();
  } else
    [row] = await db
      .insert(salarySlipsTable)
      .values({ ...values, organizationId: req.pay.org })
      .returning();
  return row;
}
export async function refreshAttendancePayroll(org: number, employeeId: number, month: string, user: any) {
  const [employee] = await db.select().from(employeesTable).where(and(eq(employeesTable.id, employeeId), eq(employeesTable.organizationId, org)));
  if (!employee) throw new Error("Employee not found");
  const slip = await buildSlip({ pay: { org, user } }, employee, month);
  const [payroll] = await db.select().from(payrollTable).where(and(eq(payrollTable.organizationId, org), eq(payrollTable.employeeId, employeeId), eq(payrollTable.payPeriod, month)));
  const values = { employeeId, employeeName: employee.name, payPeriod: month, salarySlipId: slip.id, grossPay: slip.grossPay, deductions: slip.totalDeductions, netPay: slip.netPay, updatedAt: new Date() };
  if (payroll && payroll.status !== "Paid") await db.update(payrollTable).set(values).where(and(eq(payrollTable.id, payroll.id), eq(payrollTable.status, payroll.status)));
  else if (!payroll) await db.insert(payrollTable).values({ ...values, organizationId: org, status: "Processing" });
}
const decode = (r: any) => ({
  ...r,
  statutoryContributions: json(r.statutoryContributions, {}),
  otherDeductionItems: json(r.otherDeductionItems, []),
  salaryComponents: json(r.salaryComponents, []),
  salaryTemplateComponents: json(r.salaryTemplateComponents, []),
  employeeDetails: json(r.employeeDetails, {}),
  attendanceSummary: json(r.attendanceSummary, {}),
  deductionSummary: json(r.deductionSummary, {}),
});
router.get("/organization", async (req: any, res: any) => {
  if (!need(req, res, "crewpay.salary_slip.view")) return;
  const [org] = await db.select().from(organizationDetailsTable).where(eq(organizationDetailsTable.organizationId, req.pay.org));
  return res.json({ companyName: org?.companyName || "VIDHAI SYSTEMS", address: org?.companyAddress || "", logoUrl: org?.logoUrl || "", gstin: org?.gstin || "" });
});
router.get("/salary-slips", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crewpay.salary_slip.view")) return;
  const month = String(req.query.payrollMonth || "");
  if (!isoMonth(month))
    return res.status(400).json({ error: "Valid payrollMonth is required" });
  const allowed = await allowedEmployees(
      req,
      "salary_slip",
      Number(req.query.employeeId || 0) || undefined,
    ),
    ids = new Set(allowed.map((e: any) => e.id)),
    allRows = (
      await db
        .select()
        .from(salarySlipsTable)
        .where(
          and(
            eq(salarySlipsTable.organizationId, req.pay.org),
            eq(salarySlipsTable.payrollMonth, month),
          ),
        )
        .orderBy(desc(salarySlipsTable.createdAt))
    ).filter((r: any) => ids.has(r.employeeId));
  const payrollRows = await db.select().from(payrollTable).where(and(eq(payrollTable.organizationId, req.pay.org), eq(payrollTable.payPeriod, month)));
  const payrollByEmployee = new Map(payrollRows.map((row: any) => [Number(row.employeeId), row]));
  const search = String(req.query.search || "").trim().toLowerCase();
  const department = String(req.query.department || "All");
  const status = String(req.query.status || "All");
  const rows = allRows.filter((row: any) =>
    (department === "All" || row.department === department) &&
    (status === "All" || String((payrollByEmployee.get(Number(row.employeeId)) as any)?.status || "Generated") === status) &&
    (!search || `${row.employeeName} ${row.employeeCode} ${row.department} ${row.designation}`.toLowerCase().includes(search)),
  );
  const pagination = paginateQuery(req.query);
  const data = rows.slice(pagination.skip, pagination.skip + pagination.limit).map((row: any) => ({
    ...decode(row),
    payrollStatus: (payrollByEmployee.get(Number(row.employeeId)) as any)?.status || "Generated",
  }));
  const totals = rows.reduce((sum: any, row: any) => ({ gross: sum.gross + Number(row.grossPay || 0), deductions: sum.deductions + Number(row.totalDeductions || 0), net: sum.net + Number(row.netPay || 0) }), { gross: 0, deductions: 0, net: 0 });
  return res.json({ data, totals, departments: [...new Set(allRows.map((row: any) => row.department).filter(Boolean))], ...paginationMetadata(rows.length, pagination) });
});
router.get("/salary-slips/:id", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crewpay.salary_slip.view")) return;
  const row = (
    await db
      .select()
      .from(salarySlipsTable)
      .where(
        and(
          eq(salarySlipsTable.id, Number(req.params.id)),
          eq(salarySlipsTable.organizationId, req.pay.org),
        ),
      )
  )[0];
  if (!row) return res.status(404).json({ error: "Salary slip not found" });
  const allowed = await allowedEmployees(req, "salary_slip", row.employeeId);
  return allowed.length
    ? res.json(decode(row))
    : res.status(403).json({ error: "Salary slip is outside your scope" });
});
router.post(
  "/salary-slips/generate",
  async (req: any, res: any): Promise<any> => {
    if (!need(req, res, "crewpay.salary_slip.create")) return;
    const payrollMonth = `${req.body.year}-${String(req.body.month).padStart(2, "0")}`;
    if (!isoMonth(payrollMonth))
      return res
        .status(400)
        .json({ error: "Valid year and month are required" });
    const employees = await allowedEmployees(
        req,
        "salary_slip",
        Number(req.body.employeeId || 0) || undefined,
      ),
      results: any[] = [];
    for (const employee of employees.filter((e: any) => !e.isSystemGenerated && !e.systemKey && ["Active", "On Leave"].includes(e.status))) {
      try {
        results.push({
          employeeId: employee.id,
          employeeName: employee.name,
          success: true,
          slip: decode(await buildSlip(req, employee, payrollMonth)),
        });
      } catch (error: any) {
        results.push({
          employeeId: employee.id,
          employeeName: employee.name,
          success: false,
          error: error.message,
        });
      }
    }
    if (!results.length)
      return res.json({
        results: [],
        message: "No eligible Crew employees are available for this period",
      });
    if (!results.some((r) => r.success))
      return res.status(400).json({
        error: results[0]?.error || "Unable to generate salary slips",
        results,
      });
    return res.json({ results });
  },
);
router.get("/payroll", async (req: any, res: any): Promise<any> => {
  if (!need(req, res, "crewpay.payroll.view")) return;
  const month = String(req.query.payrollMonth || "");
  if (!isoMonth(month))
    return res.status(400).json({ error: "Valid payrollMonth is required" });
  const allowed = await allowedEmployees(req, "payroll"),
    ids = new Set(allowed.map((e: any) => e.id)),
    rows = (
      await db
        .select()
        .from(payrollTable)
        .where(
          and(
            eq(payrollTable.organizationId, req.pay.org),
            eq(payrollTable.payPeriod, month),
          ),
        )
    ).filter((r: any) => ids.has(r.employeeId));
  return res.json(rows);
});
router.post(
  "/payroll/sync-to-ledger",
  async (req: any, res: any): Promise<any> => {
    const target = String(req.body.targetStatus || "Processing"),
      permission = target === "Processing" ? "create" : "update";
    if (!need(req, res, `crewpay.payroll.${permission}`)) return;
    if (
      !isoMonth(req.body.payrollMonth) ||
      !["Processing", "Processed", "Paid"].includes(target)
    )
      return res
        .status(400)
        .json({ error: "Valid payroll month and status are required" });
    const allowed = await allowedEmployees(
        req,
        "payroll",
        Number(req.body.employeeId || 0) || undefined,
      ),
      ids = new Set(allowed.map((e: any) => e.id)),
      slips = (
        await db
          .select()
          .from(salarySlipsTable)
          .where(
            and(
              eq(salarySlipsTable.organizationId, req.pay.org),
              eq(salarySlipsTable.payrollMonth, req.body.payrollMonth),
            ),
          )
      ).filter((r: any) => ids.has(r.employeeId)),
      rank: any = { Processing: 0, Processed: 1, Paid: 2 },
      rows = [];
    for (const slip of slips) {
      const old = (
          await db
            .select()
            .from(payrollTable)
            .where(
              and(
                eq(payrollTable.organizationId, req.pay.org),
                eq(payrollTable.employeeId, slip.employeeId),
                eq(payrollTable.payPeriod, req.body.payrollMonth),
              ),
            )
        )[0],
        status = old && rank[old.status] > rank[target] ? old.status : target,
        values = {
          employeeId: slip.employeeId,
          employeeName: slip.employeeName,
          salarySlipId: slip.id,
          grossPay: slip.grossPay,
          deductions: slip.totalDeductions,
          netPay: slip.netPay,
          status,
          processedBy: rank[status] >= 1 ? req.pay.user.id : old?.processedBy,
          processedAt: rank[status] >= 1 ? new Date() : old?.processedAt,
          paidBy: status === "Paid" ? req.pay.user.id : old?.paidBy,
          paidAt: status === "Paid" ? new Date() : old?.paidAt,
          updatedAt: new Date(),
        };
      let row;
      if (old)
        [row] = await db
          .update(payrollTable)
          .set(values)
          .where(eq(payrollTable.id, old.id))
          .returning();
      else
        [row] = await db
          .insert(payrollTable)
          .values({
            ...values,
            organizationId: req.pay.org,
            payPeriod: req.body.payrollMonth,
          })
          .returning();
      rows.push(row);
    }
    return res.json({ rows });
  },
);
export default router;
