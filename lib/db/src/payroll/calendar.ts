export const WORKED_ATTENDANCE_STATUSES = new Set(["Present", "Late", "Remote", "WFH"]);
export const ABSENT_AUTO_SOURCE = "Auto";
export const ATTENDANCE_AUTO_DEDUCTION_SOURCE = "attendance_auto_deduction";
export const AUTO_REASON_ABSENT = "Absent and LOP";
export const LEGACY_AUTO_REASON_ABSENT = "Absent day";

export function attendanceStatusRequiresFinalTimes(status: unknown): boolean {
  return ["Present", "Late", "Half Day", "Remote", "WFH"].includes(String(status || "").trim());
}

export function isFinalizedAttendanceLog(log: { status?: unknown; checkInTime?: unknown; checkOutTime?: unknown; locked?: unknown } | null | undefined): boolean {
  const status = String(log?.status || "").trim();
  if (!status || ["Pending Approval", "Punch In Pending", "Punch Out Pending"].includes(status)) return false;
  if (attendanceStatusRequiresFinalTimes(status)) {
    return Boolean(log?.checkInTime && log?.checkOutTime && log?.locked !== false);
  }
  return ["Absent", "On Leave", "Sick Leave", "Casual Leave", "Holiday", "Week Off"].includes(status);
}
export function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function calculateAbsentDayDeductionAmount(monthlySalary: number, scheduledWorkingDays: number): number {
  if (scheduledWorkingDays <= 0) return 0;
  return roundMoney(Number(monthlySalary || 0) / scheduledWorkingDays);
}

/** Pay reduced by unpaid working days using the month's scheduled-working-day divisor. */
export function calculateLopAmountFromPayableDays(
  monthlySalary: number,
  fullMonthScheduledWorkingDays: number,
  employmentScheduledWorkingDays: number,
  payableWorkingDays: number,
): number {
  if (fullMonthScheduledWorkingDays <= 0) return 0;
  const lopDays = Math.max(0, employmentScheduledWorkingDays - payableWorkingDays);
  const perWorkingDaySalary = calculateAbsentDayDeductionAmount(
    monthlySalary,
    fullMonthScheduledWorkingDays,
  );
  return roundMoney(perWorkingDaySalary * lopDays);
}

export function isHalfDayLeave(leave: {
  startDate?: string;
  endDate?: string;
  fromSession?: string | null;
  toSession?: string | null;
}): boolean {
  return (
    leave.startDate === leave.endDate &&
    Boolean(leave.fromSession && leave.toSession && leave.fromSession === leave.toSession)
  );
}

export function isAbsentLopDeduction(entry: {
  source?: unknown;
  autoReason?: unknown;
}): boolean {
  if (String(entry.source || "") !== ABSENT_AUTO_SOURCE) return false;
  const reason = String(entry.autoReason || "");
  return reason === AUTO_REASON_ABSENT || reason === LEGACY_AUTO_REASON_ABSENT;
}

export function isAttendancePunchDeduction(entry: {
  source?: unknown;
  autoReason?: unknown;
}): boolean {
  if (String(entry.source || "") === ATTENDANCE_AUTO_DEDUCTION_SOURCE) return true;
  if (String(entry.source || "") !== ABSENT_AUTO_SOURCE) return false;
  return !isAbsentLopDeduction(entry);
}

export function toIsoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function normalizeIsoDay(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw.slice(0, 10) : raw;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

export function startOfMonthIso(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
}

export function endOfMonthIso(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function effectivePayrollEndIso(year: number, month: number): string {
  const fullMonthEndIso = endOfMonthIso(year, month);
  const today = new Date();
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;

  if (year === currentYear && month === currentMonth) {
    return todayIso();
  }

  return fullMonthEndIso;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function overlapDaysInclusive(
  rangeStartIso: string,
  rangeEndIso: string,
  monthStartIso: string,
  monthEndIso: string,
): number {
  const start = new Date(`${rangeStartIso}T00:00:00.000Z`).getTime();
  const end = new Date(`${rangeEndIso}T00:00:00.000Z`).getTime();
  const monthStart = new Date(`${monthStartIso}T00:00:00.000Z`).getTime();
  const monthEnd = new Date(`${monthEndIso}T00:00:00.000Z`).getTime();

  const overlapStart = Math.max(start, monthStart);
  const overlapEnd = Math.min(end, monthEnd);

  if (overlapStart > overlapEnd) return 0;

  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((overlapEnd - overlapStart) / dayMs) + 1;
}

export function overlapLeaveDays(
  leave: { startDate: string; endDate: string; fromSession?: string | null; toSession?: string | null },
  monthStartIso: string,
  monthEndIso: string,
): number {
  const days = overlapDaysInclusive(leave.startDate, leave.endDate, monthStartIso, monthEndIso);
  if (days <= 0) return 0;

  if (!isHalfDayLeave(leave)) return days;

  return days - 0.5;
}

function normalizeWeekOffDays(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const unique = new Set<number>();
  for (const value of input) {
    const day = Number(value);
    if (Number.isInteger(day) && day >= 0 && day <= 6) {
      unique.add(day);
    }
  }
  return Array.from(unique.values());
}

export function getWeekOffDaysForWeek(
  template: {
    week1OffDays?: unknown;
    week2OffDays?: unknown;
    week3OffDays?: unknown;
    week4OffDays?: unknown;
    week5OffDays?: unknown;
  },
  weekNumber: number,
): number[] {
  if (weekNumber <= 1) return normalizeWeekOffDays(template.week1OffDays);
  if (weekNumber === 2) return normalizeWeekOffDays(template.week2OffDays);
  if (weekNumber === 3) return normalizeWeekOffDays(template.week3OffDays);
  if (weekNumber === 4) return normalizeWeekOffDays(template.week4OffDays);
  return normalizeWeekOffDays(template.week5OffDays);
}

export function isWeekOffAttendanceStatus(status: unknown): boolean {
  return String(status || "").trim().toLowerCase() === "week off";
}

export function isTemplateWeekOffDay(
  isoDate: string,
  workPattern: {
    week1OffDays?: unknown;
    week2OffDays?: unknown;
    week3OffDays?: unknown;
    week4OffDays?: unknown;
    week5OffDays?: unknown;
  },
  holidayDates?: Set<string>,
): boolean {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const weekNumber = Math.min(5, Math.ceil(date.getUTCDate() / 7));
  const weekOffDayList = getWeekOffDaysForWeek(workPattern, weekNumber);
  const holidays = holidayDates || new Set<string>();
  return weekOffDayList.includes(date.getUTCDay()) && !holidays.has(isoDate);
}

export function buildTemplateWeekOffDateSet(input: {
  rangeStartIso: string;
  rangeEndIso: string;
  workPattern: {
    week1OffDays?: unknown;
    week2OffDays?: unknown;
    week3OffDays?: unknown;
    week4OffDays?: unknown;
    week5OffDays?: unknown;
  };
}): Set<string> {
  const dates = new Set<string>();
  let current = new Date(`${input.rangeStartIso}T00:00:00.000Z`);
  const end = new Date(`${input.rangeEndIso}T00:00:00.000Z`);

  while (current <= end) {
    const isoDate = current.toISOString().slice(0, 10);
    const weekNumber = Math.min(5, Math.ceil(current.getUTCDate() / 7));
    if (getWeekOffDaysForWeek(input.workPattern, weekNumber).includes(current.getUTCDay())) {
      dates.add(isoDate);
    }
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }

  return dates;
}

export function buildNonWorkingPaidDateSet(input: {
  monthStartIso: string;
  monthEndIso: string;
  workPattern: {
    week1OffDays?: unknown;
    week2OffDays?: unknown;
    week3OffDays?: unknown;
    week4OffDays?: unknown;
    week5OffDays?: unknown;
  };
  holidayDates: Set<string>;
}): Set<string> {
  const dates = buildTemplateWeekOffDateSet({
    rangeStartIso: input.monthStartIso,
    rangeEndIso: input.monthEndIso,
    workPattern: input.workPattern,
  });

  for (const holidayDate of input.holidayDates) {
    if (holidayDate >= input.monthStartIso && holidayDate <= input.monthEndIso) {
      dates.add(holidayDate);
    }
  }

  return dates;
}

export function countScheduledWorkingDaysInRange(input: {
  rangeStartIso: string;
  rangeEndIso: string;
  nonWorkingPaidDates: Set<string>;
}): number {
  if (input.rangeStartIso > input.rangeEndIso) return 0;

  let count = 0;
  let current = new Date(`${input.rangeStartIso}T00:00:00.000Z`);
  const end = new Date(`${input.rangeEndIso}T00:00:00.000Z`);
  while (current <= end) {
    const isoDate = current.toISOString().slice(0, 10);
    if (!input.nonWorkingPaidDates.has(isoDate)) count += 1;
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }
  return count;
}

function paidLeaveFractionOnDate(
  isoDate: string,
  leave: {
    startDate?: string;
    endDate?: string;
    fromSession?: string | null;
    toSession?: string | null;
  },
): number {
  if (
    typeof leave.startDate !== "string" ||
    typeof leave.endDate !== "string" ||
    isoDate < leave.startDate ||
    isoDate > leave.endDate
  ) {
    return 0;
  }

  const fromSession = leave.fromSession === "2" ? "2" : "1";
  const toSession = leave.toSession === "1" ? "1" : "2";
  if (leave.startDate === leave.endDate) {
    return fromSession === toSession ? 0.5 : 1;
  }
  if (isoDate === leave.startDate) return fromSession === "2" ? 0.5 : 1;
  if (isoDate === leave.endDate) return toSession === "1" ? 0.5 : 1;
  return 1;
}

export function calculatePayableWorkingDays(input: {
  employmentStartIso: string;
  employmentEndIso: string;
  nonWorkingPaidDates: Set<string>;
  approvedLeaves: Array<{
    startDate?: string;
    endDate?: string;
    fromSession?: string | null;
    toSession?: string | null;
  }>;
  attendanceLogs: Array<{ date?: unknown; attendanceDate?: unknown; status?: unknown }>;
}): number {
  if (input.employmentStartIso > input.employmentEndIso) return 0;

  const logsByDate = new Map<string, { status?: unknown }>();
  for (const log of input.attendanceLogs) {
    const isoDate = normalizeIsoDay(log.date || log.attendanceDate);
    if (isoDate) logsByDate.set(isoDate, log);
  }

  let payableWorkingDays = 0;
  let current = new Date(`${input.employmentStartIso}T00:00:00.000Z`);
  const end = new Date(`${input.employmentEndIso}T00:00:00.000Z`);

  while (current <= end) {
    const isoDate = current.toISOString().slice(0, 10);
    if (!input.nonWorkingPaidDates.has(isoDate)) {
      const status = String(logsByDate.get(isoDate)?.status || "").trim();
      // A working day earns salary only after attendance reaches a finalized,
      // salary-eligible status. Missing/unknown/pending days remain unpaid and
      // uncategorized until approval.
      const attendanceFraction = status === "Half Day"
        ? 0.5
        : ["Present", "Late", "Remote", "WFH", "On Leave", "Sick Leave", "Casual Leave", "Holiday", "Week Off"].includes(status)
          ? 1
          : 0;

      let paidLeaveFraction = 0;
      for (const leave of input.approvedLeaves) {
        paidLeaveFraction = Math.max(paidLeaveFraction, paidLeaveFractionOnDate(isoDate, leave));
        if (paidLeaveFraction >= 1) break;
      }
      payableWorkingDays += Math.min(1, attendanceFraction + paidLeaveFraction);
    }
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }

  return payableWorkingDays;
}

/** Counts approved leave in scheduled working-day units, preserving half days as 0.5. */
export function calculateLeaveWorkingDays(input: {
  employmentStartIso: string;
  employmentEndIso: string;
  nonWorkingPaidDates: Set<string>;
  approvedLeaves: Array<{
    startDate?: string;
    endDate?: string;
    fromSession?: string | null;
    toSession?: string | null;
  }>;
}): number {
  if (input.employmentStartIso > input.employmentEndIso) return 0;
  let leaveDays = 0;
  let current = new Date(`${input.employmentStartIso}T00:00:00.000Z`);
  const end = new Date(`${input.employmentEndIso}T00:00:00.000Z`);
  while (current <= end) {
    const isoDate = current.toISOString().slice(0, 10);
    if (!input.nonWorkingPaidDates.has(isoDate)) {
      let fraction = 0;
      for (const leave of input.approvedLeaves) {
        fraction = Math.max(fraction, paidLeaveFractionOnDate(isoDate, leave));
      }
      leaveDays += Math.min(1, fraction);
    }
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }
  return leaveDays;
}

/** Counts unpaid scheduled working-day units; Half Day contributes 0.5. */
export function calculateAbsentWorkingDays(input: {
  employmentStartIso: string;
  employmentEndIso: string;
  nonWorkingPaidDates: Set<string>;
  approvedLeaves: Array<{ startDate?: string; endDate?: string; fromSession?: string | null; toSession?: string | null }>;
  attendanceLogs: Array<{ date?: unknown; attendanceDate?: unknown; status?: unknown }>;
  pendingAttendanceDates?: Set<string>;
}): number {
  const logsByDate = new Map<string, { status?: unknown }>();
  for (const log of input.attendanceLogs) {
    const isoDate = normalizeIsoDay(log.date || log.attendanceDate);
    if (isoDate) logsByDate.set(isoDate, log);
  }

  const pendingDates = input.pendingAttendanceDates || new Set<string>();
  let absentDays = 0;
  let current = new Date(`${input.employmentStartIso}T00:00:00.000Z`);
  const end = new Date(`${input.employmentEndIso}T00:00:00.000Z`);
  while (current <= end) {
    const isoDate = current.toISOString().slice(0, 10);
    if (!input.nonWorkingPaidDates.has(isoDate)) {
      const status = String(logsByDate.get(isoDate)?.status || "").trim();
      let approvedLeaveFraction = 0;
      for (const leave of input.approvedLeaves) {
        approvedLeaveFraction = Math.max(approvedLeaveFraction, paidLeaveFractionOnDate(isoDate, leave));
      }
      const absentFraction = status === "Absent"
        ? 1
        : status === "Half Day"
          ? 0.5
          : status || pendingDates.has(isoDate)
            ? 0
            : 1;
      absentDays += Math.max(0, absentFraction - approvedLeaveFraction);
    }
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }
  return absentDays;
}

/** Counts scheduled working-day units still awaiting a final attendance decision. */
export function calculatePendingApprovalWorkingDays(input: {
  employmentStartIso: string;
  employmentEndIso: string;
  nonWorkingPaidDates: Set<string>;
  approvedLeaves: Array<{ startDate?: string; endDate?: string; fromSession?: string | null; toSession?: string | null }>;
  attendanceLogs: Array<{ date?: unknown; attendanceDate?: unknown; status?: unknown }>;
  pendingAttendanceDates?: Set<string>;
}): number {
  const finalizedDates = new Set(
    input.attendanceLogs
      .map((log) => normalizeIsoDay(log.date || log.attendanceDate))
      .filter((date): date is string => Boolean(date)),
  );
  const pendingDates = input.pendingAttendanceDates || new Set<string>();
  let pendingDays = 0;
  let current = new Date(`${input.employmentStartIso}T00:00:00.000Z`);
  const end = new Date(`${input.employmentEndIso}T00:00:00.000Z`);
  while (current <= end) {
    const isoDate = current.toISOString().slice(0, 10);
    if (!input.nonWorkingPaidDates.has(isoDate) && !finalizedDates.has(isoDate) && pendingDates.has(isoDate)) {
      let approvedLeaveFraction = 0;
      for (const leave of input.approvedLeaves) {
        approvedLeaveFraction = Math.max(approvedLeaveFraction, paidLeaveFractionOnDate(isoDate, leave));
      }
      pendingDays += Math.max(0, 1 - approvedLeaveFraction);
    }
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }
  return pendingDays;
}

export function countManualWeekOffDays(input: {
  employmentStartIso: string;
  employmentEndIso: string;
  workPattern: {
    week1OffDays?: unknown;
    week2OffDays?: unknown;
    week3OffDays?: unknown;
    week4OffDays?: unknown;
    week5OffDays?: unknown;
  };
  holidayDates: Set<string>;
  approvedLeaves: Array<{ startDate?: string; endDate?: string }>;
  attendanceLogs: Array<{ date?: unknown; attendanceDate?: unknown; status?: unknown }>;
}): number {
  let count = 0;
  for (const log of input.attendanceLogs) {
    if (!isWeekOffAttendanceStatus(log.status)) continue;
    const isoDate = normalizeIsoDay(log.date || log.attendanceDate);
    if (!isoDate || isoDate < input.employmentStartIso || isoDate > input.employmentEndIso) continue;
    if (input.holidayDates.has(isoDate)) continue;
    if (isDateOnApprovedLeave(isoDate, input.approvedLeaves)) continue;
    if (isTemplateWeekOffDay(isoDate, input.workPattern, input.holidayDates)) continue;
    count += 1;
  }
  return count;
}

export function isDateOnApprovedLeave(isoDate: string, leaves: Array<{ startDate?: string; endDate?: string }>): boolean {
  return leaves.some((leave) => {
    if (typeof leave.startDate !== "string" || typeof leave.endDate !== "string") return false;
    return isoDate >= leave.startDate && isoDate <= leave.endDate;
  });
}

export function buildHolidayDateSet(holidayTemplate: { holidays?: Array<{ date?: string }> } | null | undefined): Set<string> {
  return new Set(
    (Array.isArray(holidayTemplate?.holidays) ? holidayTemplate.holidays : [])
      .map((line) => String(line.date || ""))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)),
  );
}

export function resolveEmploymentWindow(
  employee: { joinDate?: unknown; exitDate?: unknown },
  monthStartIso: string,
  monthEndIso: string,
): { employmentStartIso: string; employmentEndIso: string } {
  const joinDateIso = toIsoDate(employee.joinDate as string | Date | null | undefined);
  const exitDateIso = toIsoDate(employee.exitDate as string | Date | null | undefined);
  const employmentStartIso = joinDateIso && joinDateIso > monthStartIso ? joinDateIso : monthStartIso;
  const employmentEndIso = exitDateIso && exitDateIso < monthEndIso ? exitDateIso : monthEndIso;
  return { employmentStartIso, employmentEndIso };
}

export function computeEmployeeAbsentDates(input: {
  employee: { joinDate?: unknown; exitDate?: unknown };
  monthStartIso: string;
  monthEndIso: string;
  workPattern: {
    week1OffDays?: unknown;
    week2OffDays?: unknown;
    week3OffDays?: unknown;
    week4OffDays?: unknown;
    week5OffDays?: unknown;
  };
  holidayDates: Set<string>;
  approvedLeaves: Array<{ startDate?: string; endDate?: string }>;
  attendanceLogs: Array<{ date?: unknown; attendanceDate?: unknown; status?: unknown }>;
}): string[] {
  const { employmentStartIso, employmentEndIso } = resolveEmploymentWindow(
    input.employee,
    input.monthStartIso,
    input.monthEndIso,
  );

  if (employmentStartIso > employmentEndIso) return [];

  const logsByDate = new Map<string, { status?: unknown }>();
  for (const log of input.attendanceLogs) {
    const isoDate = normalizeIsoDay(log.date || log.attendanceDate);
    if (isoDate) logsByDate.set(isoDate, log);
  }

  const absentDates: string[] = [];
  let current = new Date(`${employmentStartIso}T00:00:00.000Z`);
  const employmentEndDate = new Date(`${employmentEndIso}T00:00:00.000Z`);

  while (current <= employmentEndDate) {
    const isoDate = current.toISOString().slice(0, 10);
    const isHoliday = input.holidayDates.has(isoDate);
    const onLeave = isDateOnApprovedLeave(isoDate, input.approvedLeaves);
    const log = logsByDate.get(isoDate);
    const isWeekOff =
      isWeekOffAttendanceStatus(log?.status) ||
      (isTemplateWeekOffDay(isoDate, input.workPattern, input.holidayDates) && !onLeave);

    if (!isWeekOff && !isHoliday && !onLeave) {
      if (String(log?.status || "").trim() === "Absent") {
        absentDates.push(isoDate);
      }
    }

    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }

  return absentDates;
}

export type PayrollTemplateMaps = {
  workPatternByName: Map<string, any>;
  workPatternDefaultByOrg: Map<number, any>;
  holidayTemplateById: Map<string, any>;
  holidayTemplateByName: Map<string, any>;
  holidayDefaultByOrg: Map<number, any>;
};

export function resolveWorkPatternForEmployee(
  employee: { workPatternTemplate?: unknown; organizationId?: unknown },
  maps: PayrollTemplateMaps,
  fallbackWorkPattern: any,
): any {
  const orgId = Number(employee.organizationId || 1);
  const ref = String(employee.workPatternTemplate || "").trim();
  if (ref) {
    const byName = maps.workPatternByName.get(`${orgId}:${ref.toLowerCase()}`);
    if (byName) return byName;
  }
  return null;
}

export function resolveHolidayTemplateForEmployee(
  employee: { holidayTemplate?: unknown; organizationId?: unknown },
  maps: PayrollTemplateMaps,
  fallbackHoliday: any,
): any {
  const orgId = Number(employee.organizationId || 1);
  const ref = String(employee.holidayTemplate || "").trim();
  if (ref) {
    const byId = maps.holidayTemplateById.get(ref);
    if (byId) return byId;
    const byName = maps.holidayTemplateByName.get(`${orgId}:${ref.toLowerCase()}`);
    if (byName) return byName;
  }
  return null;
}

export function buildPayrollTemplateMaps(input: {
  workPatterns: any[];
  holidayTemplates: any[];
}): PayrollTemplateMaps {
  const workPatternByName = new Map<string, any>();
  const workPatternDefaultByOrg = new Map<number, any>();
  const holidayTemplateById = new Map<string, any>();
  const holidayTemplateByName = new Map<string, any>();
  const holidayDefaultByOrg = new Map<number, any>();

  for (const template of input.workPatterns) {
    const orgId = Number(template.organizationId || 1);
    workPatternByName.set(`${orgId}:${String(template.templateName || "").trim().toLowerCase()}`, template);
    if (template.isDefault && !workPatternDefaultByOrg.has(orgId)) {
      workPatternDefaultByOrg.set(orgId, template);
    }
  }

  for (const template of input.holidayTemplates) {
    holidayTemplateById.set(String(template.id), template);
    const orgId = Number(template.organizationId || 1);
    holidayTemplateByName.set(`${orgId}:${String(template.templateName || "").trim().toLowerCase()}`, template);
    if (template.isDefault && !holidayDefaultByOrg.has(orgId)) {
      holidayDefaultByOrg.set(orgId, template);
    }
  }

  return {
    workPatternByName,
    workPatternDefaultByOrg,
    holidayTemplateById,
    holidayTemplateByName,
    holidayDefaultByOrg,
  };
}



