import {
  attendanceLogsTable,
  attendanceTemplatesTable,
  crewDeductionsTable,
  db,
  employeesTable,
  eq,
  holidayTemplatesTable,
  leaveRequestsTable,
  leaveTemplatesTable,
  salaryTemplatesTable,
  workPatternTemplatesTable,
} from "@workspace/db";
import { syncAttendanceDeductions } from "../../artifacts/api-server/src/routes/crew";

const ORG = 1;
const MARKER = "VIDHAI_QA_AAKASH_AUG_2026";
const named = async (table: any, templateName: string) =>
  (await db.select().from(table).where(eq(table.organizationId, ORG))).find(
    (row: any) => row.templateName === templateName,
  );
const ensure = async (table: any, templateName: string, values: any) =>
  (await named(table, templateName)) ||
  (await db
    .insert(table)
    .values({ organizationId: ORG, templateName, isActive: true, ...values })
    .returning())[0];
const dates = (start: string, end: string) => {
  const output: string[] = [];
  for (let cursor = new Date(`${start}T00:00:00Z`); cursor <= new Date(`${end}T00:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1))
    output.push(cursor.toISOString().slice(0, 10));
  return output;
};

async function indianGoogleHolidays() {
  const url = "https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Calendar returned ${response.status}`);
  return (await response.text())
    .replace(/\r?\n[ \t]/g, "")
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((block) => {
      const date = block.match(/(?:^|\r?\n)DTSTART(?:;[^:]*)?:(\d{4})(\d{2})(\d{2})/)?.slice(1, 4).join("-");
      const name = block.match(/(?:^|\r?\n)SUMMARY(?:;[^:]*)?:(.*?)(?:\r?\n|$)/)?.[1]?.trim();
      return date && name && date.startsWith("2026-") ? { date, name } : null;
    })
    .filter(Boolean);
}

async function main() {
  const holidays = await indianGoogleHolidays();
  const attendance = await ensure(attendanceTemplatesTable, "QA August 2026 Attendance", {
    flexibleHours: false, bufferTime: true, bufferMinutes: 15,
    totalWorkingHours: "9", breakHours: "0", workHours: "9",
    lateThresholdMinutes: 15, workStartTime: "09:30", workEndTime: "18:30",
    fineType: "based_on_salary", finePerHour: "0",
  });
  const workPattern = await ensure(workPatternTemplatesTable, "QA August 2026 Sundays Off", {
    week1OffDays: "[0]", week2OffDays: "[0]", week3OffDays: "[0]", week4OffDays: "[0]", week5OffDays: "[0]",
  });
  const leave = await ensure(leaveTemplatesTable, "QA August 2026 Leave", {
    totalSickLeaves: 6, totalCasualLeaves: 6, earnedLeave: 0,
    maxSickLeavesPerMonth: 1, maxCasualLeavesPerMonth: 1,
    maxEarnedLeavesPerMonth: 0, totalPermissionHours: 0,
    maxPermissionHoursPerMonth: 0, carryForwardEnabled: false,
  });
  const salary = await ensure(salaryTemplatesTable, "QA August 2026 Salary", {
    description: "QA salary of INR 20,000 per month",
    components: JSON.stringify([{ id: "basic", name: "Basic", calculationType: "fixed", value: "20000", referenceComponentId: null, order: 1, includeInPfWage: false, includeInEsiWage: false }]),
  });
  const holiday = await ensure(holidayTemplatesTable, "QA August 2026 Indian Google Holidays", {
    effectiveYear: 2026, effectiveFrom: "2026-01-01", holidays: JSON.stringify(holidays),
  });
  const employees = await db.select().from(employeesTable).where(eq(employeesTable.organizationId, ORG));
  let aakash = employees.find((row: any) => row.systemKey === MARKER);
  if (!aakash)
    aakash = (await db.insert(employeesTable).values({
      organizationId: ORG, systemKey: MARKER, employeeCode: "QA-AAKASH-2026", name: "Aakash QA",
      role: "QA Crew", designation: "QA Crew", department: "Quality Assurance", employmentType: "Full Time",
      annualCtc: "240000", baseSalary: "20000", status: "Active", workMode: "On-site",
      location: "QA Test Location", joinDate: "2026-01-01", email: "aakash.qa.aug2026@vidhai.local",
      attendanceRulesTemplate: attendance.id, workPatternTemplate: workPattern.id, holidayTemplate: holiday.id,
      leaveTemplate: leave.id, salaryTemplateId: salary.id, fixedComponentValues: "{}", skills: "[]", certifications: "[]",
      isSystemGenerated: false, isDeleted: false,
    }).returning())[0];
  const allLogs = await db.select().from(attendanceLogsTable).where(eq(attendanceLogsTable.organizationId, ORG));
  const existingLogs = allLogs.filter((row: any) => row.employeeId === aakash.id && String(row.notes || "").includes(MARKER));
  for (const row of existingLogs) await db.delete(attendanceLogsTable).where(eq(attendanceLogsTable.id, row.id));
  const allLeaves = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.organizationId, ORG));
  for (const row of allLeaves.filter((item: any) => item.employeeId === aakash.id && String(item.reason || "").includes(MARKER)))
    await db.delete(leaveRequestsTable).where(eq(leaveRequestsTable.id, row.id));
  const holidayDates = new Set((holidays as any[]).map((item) => item.date));
  const leaveDates = new Set(["2026-08-03", "2026-08-04", "2026-08-05"]);
  const exceptions: Record<string, [string, string, string]> = {
    "2026-08-06": ["10:15", "18:30", "Late punch-in: 30 deduction minutes after buffer"],
    "2026-08-07": ["09:30", "17:30", "Early punch-out: 60 deduction minutes"],
    "2026-08-10": ["10:00", "17:30", "Late + early: 15 late and 60 early deduction minutes"],
  };
  for (const date of dates("2026-08-01", "2026-08-31")) {
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0 || holidayDates.has(date) || leaveDates.has(date)) continue;
    const [checkInTime, checkOutTime, note] = exceptions[date] || ["09:30", "18:30", "Normal approved attendance"];
    await db.insert(attendanceLogsTable).values({
      organizationId: ORG, employeeId: aakash.id, employeeName: aakash.name, employeeCode: aakash.employeeCode,
      department: aakash.department, designation: aakash.designation, attendanceDate: date, status: checkInTime > "09:45" ? "Late" : "Present",
      approvalStatus: "Approved", checkInTime, checkOutTime, timezone: "Asia/Kolkata", locked: true,
      notes: `${MARKER}: ${note}`, auditLogs: "[]",
    });
  }
  for (const [date, leaveType, label] of [["2026-08-03", "Casual", "Paid casual leave"], ["2026-08-04", "Sick", "Paid sick leave"], ["2026-08-05", "Other", "Other leave (LOP)"]] as const)
    await db.insert(leaveRequestsTable).values({
      organizationId: ORG, employeeId: aakash.id, employeeName: aakash.name, startDate: date, endDate: date,
      leaveType, fromSession: 1, toSession: 2, reason: `${MARKER}: ${label}`, status: "Approved", requestedDays: "1", approvedAt: new Date(),
    });
  await syncAttendanceDeductions(ORG, 7, 2026);
  const deductions = (await db.select().from(crewDeductionsTable).where(eq(crewDeductionsTable.organizationId, ORG)))
    .filter((row: any) => row.employeeId === aakash.id && row.month === 7 && row.year === 2026)
    .map((row: any) => ({ date: row.date, reason: row.autoReason, amount: row.amount, lateMinutes: row.lateMinutes, earlyExitMinutes: row.earlyExitMinutes }));
  console.log(JSON.stringify({ employee: { id: aakash.id, name: aakash.name, code: aakash.employeeCode }, templates: { attendance: attendance.id, workPattern: workPattern.id, leave: leave.id, salary: salary.id, holiday: holiday.id }, holidays: holidays.length, deductions }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
