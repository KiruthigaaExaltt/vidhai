// Attendance rules shared by approval previews, finalization and payroll.
// Ported from Yugam's payCalculationService.
export const readJson = (value: any, fallback: any = []) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : (value ?? fallback);
  } catch {
    return fallback;
  }
};
export function timeMinutes(value: unknown): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""))) return null;
  const [h, m] = String(value).split(":").map(Number);
  return h * 60 + m;
}
export function attendanceMetrics(log: any, template: any) {
  const start = timeMinutes(log.checkInTime),
    end = timeMinutes(log.checkOutTime);
  const shiftStart = timeMinutes(template.workStartTime),
    shiftEnd = timeMinutes(template.workEndTime);
  if (start === null || end === null) return null;
  let lateMinutes = 0,
    earlyExitMinutes = 0,
    totalDeductionMinutes = 0,
    autoReason = "";
  if (template.flexibleHours) {
    const configured = Number(template.workHours);
    const required =
      Number.isFinite(configured) && configured > 0
        ? configured * 60
        : shiftStart !== null && shiftEnd !== null
          ? Math.max(0, shiftEnd - shiftStart)
          : 480;
    const worked = end - start + (end < start ? 1440 : 0);
    totalDeductionMinutes = Math.max(0, required - worked);
    autoReason = worked < required / 2 ? "half_day" : "flexible_hours_shortage";
  } else {
    if (shiftStart === null || shiftEnd === null) return null;
    const buffer = template.bufferTime
      ? Number(template.bufferMinutes) > 0
        ? Number(template.bufferMinutes)
        : 15
      : 0;
    lateMinutes = Math.max(0, start - shiftStart - buffer);
    earlyExitMinutes = Math.max(0, shiftEnd - end);
    totalDeductionMinutes = lateMinutes + earlyExitMinutes;
    autoReason =
      lateMinutes && earlyExitMinutes
        ? "both"
        : lateMinutes
          ? "late_punch_in"
          : "early_punch_out";
  }
  return totalDeductionMinutes > 0
    ? {
        lateMinutes,
        earlyExitMinutes,
        totalDeductionMinutes,
        deductionHours: totalDeductionMinutes / 60,
        autoReason,
      }
    : null;
}
export function workDurationHours(template: any) {
  if (template.flexibleHours && Number(template.workHours) > 0)
    return Number(template.workHours);
  const start = timeMinutes(template.workStartTime),
    end = timeMinutes(template.workEndTime);
  return start !== null && end !== null ? Math.max(1, (end - start) / 60) : 8;
}
export function attendanceFine(
  template: any,
  hourlySalary: number,
  deductionHours: number,
) {
  const fine = Math.max(0, Number(template.finePerHour) || 0);
  const type =
    template.fineType === "fixed_per_hour" && fine <= 0
      ? "based_on_salary"
      : template.fineType;
  const rate =
    type === "based_on_salary"
      ? hourlySalary
      : type === "percent_hourly_basis"
        ? (hourlySalary * fine) / 100
        : fine;
  return Number((rate * Math.max(0, deductionHours)).toFixed(2));
}
// Employment dates are stored as text. Older writers stored full timestamps
// (e.g. "2026-10-05T10:15:00.000+05:30"), which break plain string comparison
// against a YYYY-MM-DD attendance date, so normalise before comparing.
export function employmentDate(value: unknown) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
export function calendarStatus(
  employee: any,
  date: string,
  patterns: any[],
  holidays: any[],
  leaves: any[] = [],
) {
  const joinDate = employmentDate(employee.joinDate);
  // An Active employee is currently employed; a leftover exit date from an
  // earlier offboarding/deactivation must not lock them out of attendance.
  const exitDate =
    String(employee.status || "").toLowerCase() === "active"
      ? null
      : employmentDate(employee.exitDate);
  if ((joinDate && date < joinDate) || (exitDate && date > exitDate))
    return "Not Employed";
  const holiday = holidays.find(
    (t) =>
      t.isActive !== false && Number(t.id) === Number(employee.holidayTemplate),
  );
  if (readJson(holiday?.holidays).some((h: any) => h.date === date))
    return "Holiday";
  const pattern = patterns.find(
    (t) =>
      t.isActive !== false &&
      Number(t.id) === Number(employee.workPatternTemplate),
  );
  const day = new Date(`${date}T00:00:00Z`);
  const week = Math.min(5, Math.ceil(day.getUTCDate() / 7));
  if (
    readJson(pattern?.[`week${week}OffDays`])
      .map(Number)
      .includes(day.getUTCDay())
  )
    return "Week Off";
  if (
    leaves.some(
      (l) =>
        Number(l.employeeId) === Number(employee.id) &&
        l.status === "Approved" &&
        l.leaveType !== "Permission" &&
        l.startDate <= date &&
        l.endDate >= date,
    )
  )
    return "On Leave";
  return "Absent";
}
export function scheduledDays(
  employee: any,
  month: string,
  patterns: any[],
  holidays: any[],
) {
  const [year, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  let days = 0;
  for (let day = 1; day <= count; day++) {
    const status = calendarStatus(
      { ...employee, joinDate: null, exitDate: null },
      `${month}-${String(day).padStart(2, "0")}`,
      patterns,
      holidays,
    );
    if (status === "Absent") days++;
  }
  return days;
}
export function attendanceDisplayStatus(row: any) {
  if (row.approvalStatus === "Rejected") return "Absent";
  if (row.approvalStatus === "Pending")
    return row.checkOutTime ? "Pending Approval" : "Punch Out Pending";
  return row.status;
}
