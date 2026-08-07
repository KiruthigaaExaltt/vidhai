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
} from "@workspace/db";
import { effectivePermissions, getAuthUser } from "../lib/access";
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
  if (can(req, `crewpay.${sub}.forOthers`))
    return requested
      ? rows.filter((e: any) => Number(e.id) === requested)
      : rows;
  const own = await ownEmployee(req);
  if (!can(req, `crewpay.${sub}.forOwn`) || !own) return [];
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
      ) || templates.find((r: any) => r.isDefault && active(r)),
    pattern =
      patterns.find(
        (r: any) =>
          Number(r.id) === Number(employee.workPatternTemplate) && active(r),
      ) || patterns.find((r: any) => r.isDefault && active(r)),
    holidayTemplate =
      holidays.find(
        (r: any) =>
          Number(r.id) === Number(employee.holidayTemplate) &&
          active(r) &&
          Number(r.effectiveYear) === year,
      ) ||
      holidays.find(
        (r: any) =>
          r.isDefault && active(r) && Number(r.effectiveYear) === year,
      ),
    holidayDates = new Set<string>(
      (json(holidayTemplate?.holidays, []) as any[]).map((h) => h.date),
    ),
    attendanceByDate = new Map(
      attendance
        .filter(
          (r: any) => r.attendanceDate >= start && r.attendanceDate <= end,
        )
        .map((r: any) => [r.attendanceDate, r]),
    ),
    approvedLeaves = leaves.filter(
      (r: any) =>
        r.status === "Approved" && r.startDate <= end && r.endDate >= start,
    );
  let presentDays = 0,
    lateDays = 0,
    absentDays = 0,
    halfDays = 0,
    paidLeaveDays = 0,
    weekOffDays = 0,
    holidayDays = 0,
    payableDays = 0,
    hoursWorked = 0;
  for (const date of daysBetween(start, end)) {
    const d = new Date(`${date}T00:00:00Z`),
      week = Math.min(5, Math.floor((d.getUTCDate() - 1) / 7) + 1),
      off = (json(pattern?.[`week${week}OffDays`], []) as any[])
        .map(Number)
        .includes(d.getUTCDay()),
      holiday = holidayDates.has(date),
      att: any = attendanceByDate.get(date),
      leave = approvedLeaves.find(
        (r: any) => r.startDate <= date && r.endDate >= date,
      );
    let payable = 0;
    if (holiday) {
      holidayDays++;
      payable = 1;
    } else if (off) {
      weekOffDays++;
      payable = 1;
    } else if (
      att &&
      ["Present", "Late", "Remote", "Work From Home", "WFH"].includes(
        att.status,
      )
    ) {
      presentDays++;
      if (att.status === "Late") lateDays++;
      payable = 1;
    } else if (att?.status === "Half Day") {
      halfDays++;
      payable = 0.5;
    } else if (leave) {
      const half =
        leave.startDate === leave.endDate &&
        String(leave.fromSession) === String(leave.toSession);
      paidLeaveDays += half ? 0.5 : 1;
      payable = half ? 0.5 : 1;
    } else absentDays++;
    payableDays += payable;
    if (att?.checkInTime && att?.checkOutTime) {
      const a = clock(att.checkInTime),
        b = clock(att.checkOutTime) + (clock(att.checkOutTime) < a ? 1440 : 0);
      hoursWorked += (b - a) / 60;
    }
  }
  payableDays = Math.min(payableDays, daysBetween(start, end).length);
  const fixedComponentValues = json(employee.fixedComponentValues, {}),
    monthlyCtc = Math.max(
      0,
      Number(employee.baseSalary || 0) || Number(employee.annualCtc || 0) / 12,
    ),
    configured = json(salaryTemplate?.components, []),
    input = configured.length
      ? configured
      : [
          {
            id: "basic",
            name: "Basic",
            calculationType: "percentage_of_ctc",
            value: 50,
            order: 1,
          },
          {
            id: "hra",
            name: "HRA",
            calculationType: "percentage_of_ctc",
            value: 20,
            order: 2,
          },
          {
            id: "special_allowance",
            name: "Special Allowance",
            calculationType: "residual",
            order: 3,
          },
        ],
    amounts: Record<string, number> = {},
    earningIds = new Set([
      "basic",
      "hra",
      "special_allowance",
      "conveyance",
      "medical",
      "bonus",
      "incentive",
    ]),
    ratio = Math.max(0, Math.min(1, payableDays / calendarMonthDays));
  let used = 0;
  const components = input.map((c: any, index: number) => {
    let monthly = 0;
    if (c.calculationType === "fixed") {
      const employeeValue = Number(
        fixedComponentValues[c.id] ?? fixedComponentValues[c.name],
      );
      monthly = Number.isFinite(employeeValue)
        ? employeeValue
        : Number(c.value || 0);
    }
    else if (c.calculationType === "percentage_of_ctc")
      monthly = (monthlyCtc * Number(c.value || 0)) / 100;
    else if (c.calculationType === "percentage_of_component")
      monthly =
        (Number(amounts[c.referenceComponentId] || 0) * Number(c.value || 0)) /
        100;
    else if (c.calculationType === "residual")
      monthly = Math.max(0, monthlyCtc - used);
    amounts[c.id] = monthly;
    if (earningIds.has(c.id)) used += monthly;
    return {
      componentId: c.id,
      componentName: c.name,
      componentType: earningIds.has(c.id) ? "Earning" : "Deduction",
      calculationType: c.calculationType,
      configuredValue: c.value ?? null,
      monthlyAmount: round(monthly),
      yearlyAmount: round(monthly * 12),
      earnedAmount: round(monthly * ratio),
      displayOrder: c.order || index + 1,
    };
  });
  if (used > monthlyCtc + 0.01)
    throw new Error("Salary template earnings exceed monthly salary");
  if (
    used < monthlyCtc - 0.01 &&
    !components.some((c: any) => c.componentType === "Deduction")
  ) {
    components.push({
      componentId: "balance_allowance",
      componentName: "Balance Allowance",
      componentType: "Earning",
      calculationType: "residual",
      configuredValue: null,
      monthlyAmount: round(monthlyCtc - used),
      yearlyAmount: round((monthlyCtc - used) * 12),
      earnedAmount: round((monthlyCtc - used) * ratio),
      displayOrder: components.length + 1,
    });
  }
  const monthClaims = claims.filter(
      (r: any) =>
        r.status === "Approved" &&
        String(
          r.payrollMonth || r.attendanceDate || r.approvedAt || r.createdAt,
        ).slice(0, 7) === payrollMonth,
    ),
    sumClaims = (types: string[]) =>
      round(
        monthClaims
          .filter((r: any) => types.includes(r.claimType))
          .reduce((n: number, r: any) => n + Number(r.amount || 0), 0),
      ),
    overtimeAmount = sumClaims(["overtime"]),
    claimsAmount = sumClaims(["reimbursement", "allowance"]),
    bonusAmount = sumClaims(["bonus"]),
    monthDeductions = deductions.filter(
      (r: any) =>
        r.status === "Approved" && r.year === year && r.month === month,
    ),
    lopRows = monthDeductions.filter(
      (r: any) =>
        String(r.autoReason || "")
          .toLowerCase()
          .includes("absent") ||
        String(r.autoReason || "")
          .toLowerCase()
          .includes("half day"),
    ),
    lopAmount = round(
      lopRows.reduce((n: number, r: any) => n + Number(r.amount || 0), 0),
    ),
    otherDeductionsAmount = round(
      monthDeductions
        .filter((r: any) => !lopRows.includes(r))
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
    totalDeductions = round(salaryTemplateDeductions + otherDeductionsAmount),
    netPay = round(Math.max(0, grossPay - totalDeductions)),
    attendanceSummary = {
      presentDays,
      lateDays,
      absentDays,
      halfDays,
      workedDays: presentDays,
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
      salaryTemplateName: salaryTemplate?.templateName || "System fallback",
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
      employmentWindowEnd: end,
      calendarMonthDays,
      monthDays: calendarMonthDays,
      employmentDays: daysBetween(start, end).length,
      presentDays: String(presentDays),
      lateDays: String(lateDays),
      lateDaysDeductionApplied: "0",
      lateDaysDeductionRejected: "0",
      absentDays: String(absentDays),
      halfDays: String(halfDays),
      workedDays: String(presentDays),
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
const decode = (r: any) => ({
  ...r,
  salaryComponents: json(r.salaryComponents, []),
  salaryTemplateComponents: json(r.salaryTemplateComponents, []),
  employeeDetails: json(r.employeeDetails, {}),
  attendanceSummary: json(r.attendanceSummary, {}),
  deductionSummary: json(r.deductionSummary, {}),
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
    rows = (
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
  return res.json(rows.map(decode));
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
    for (const employee of employees) {
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
    if (!results.some((r) => r.success))
      return res
        .status(400)
        .json({
          error: results[0]?.error || "No permitted employees found",
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
