import {
  and,
  db,
  eq,
  employeesTable,
  attendanceLogsTable,
  workPatternTemplatesTable,
  holidayTemplatesTable,
  leaveRequestsTable,
  payrollTable,
} from "@workspace/db";
import {
  attendanceSettings,
  attendanceVersion,
  dateInZone,
} from "./attendanceWorkflow";
import { calendarStatus, readJson } from "./attendanceRules";
import { logger } from "./logger";

// As in Yugam, the previous organization-local day is the closure deadline.
// Complete pending requests are preserved; an incomplete day becomes absent.
export async function closeMissedAttendance(organizationId?: number) {
  const employees = await db.select().from(employeesTable);
  for (const employee of employees) {
    if (organizationId && Number(employee.organizationId) !== organizationId)
      continue;
    if (employee.isDeleted || employee.status !== "Active") continue;
    const org = Number(employee.organizationId),
      settings = await attendanceSettings(org);
    const today = dateInZone(settings.timezone);
    const [patterns, holidays, leaves, logs, payrolls] = await Promise.all([
      db
        .select()
        .from(workPatternTemplatesTable)
        .where(eq(workPatternTemplatesTable.organizationId, org)),
      db
        .select()
        .from(holidayTemplatesTable)
        .where(eq(holidayTemplatesTable.organizationId, org)),
      db
        .select()
        .from(leaveRequestsTable)
        .where(
          and(
            eq(leaveRequestsTable.organizationId, org),
            eq(leaveRequestsTable.employeeId, employee.id),
          ),
        ),
      db
        .select()
        .from(attendanceLogsTable)
        .where(
          and(
            eq(attendanceLogsTable.organizationId, org),
            eq(attendanceLogsTable.employeeId, employee.id),
          ),
        ),
      db
        .select()
        .from(payrollTable)
        .where(
          and(
            eq(payrollTable.organizationId, org),
            eq(payrollTable.employeeId, employee.id),
            eq(payrollTable.status, "Paid"),
          ),
        ),
    ]);
    const paid = new Set(payrolls.map((p) => p.payPeriod));
    const byDate = new Map(logs.map((log) => [log.attendanceDate, log]));
    const start = String(employee.joinDate || today).slice(0, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      !Number.isFinite(Date.parse(`${start}T00:00:00Z`))
    )
      continue;
    for (
      let date = start;
      date < today;
      date = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000)
        .toISOString()
        .slice(0, 10)
    ) {
      if (
        paid.has(date.slice(0, 7)) ||
        calendarStatus(employee, date, patterns, holidays, leaves) !== "Absent"
      )
        continue;
      const old = byDate.get(date);
      if (
        old &&
        (old.approvalStatus !== "Pending" ||
          (old.checkInTime && old.checkOutTime))
      )
        continue;
      await db.transaction(async (tx) => {
        // Share the per-employee write lock with daily punch creation.
        await tx
          .update(employeesTable)
          .set({ updatedAt: new Date() })
          .where(eq(employeesTable.id, employee.id));
        const [current] = await tx
          .select()
          .from(attendanceLogsTable)
          .where(
            and(
              eq(attendanceLogsTable.organizationId, org),
              eq(attendanceLogsTable.employeeId, employee.id),
              eq(attendanceLogsTable.attendanceDate, date),
            ),
          );
        if (
          current &&
          (current.approvalStatus !== "Pending" ||
            (current.checkInTime && current.checkOutTime))
        )
          return;
        const [locked] = await tx
          .select()
          .from(payrollTable)
          .where(
            and(
              eq(payrollTable.organizationId, org),
              eq(payrollTable.employeeId, employee.id),
              eq(payrollTable.payPeriod, date.slice(0, 7)),
              eq(payrollTable.status, "Paid"),
            ),
          );
        if (locked) return;
        const now = new Date();
        const values = {
          status: "Absent",
          approvalStatus: current ? "Rejected" : "Approved",
          currentLevel: null,
          locked: true,
          revision: Number(current?.revision || 0) + 1,
          rejectedAt: current ? now : null,
          rejectionRemarks: current
            ? "Auto-marked absent after missed punch-out deadline"
            : null,
          updatedAt: now,
          auditLogs: JSON.stringify([
            ...readJson(current?.auditLogs),
            {
              action: "AutoAbsentAfterMissedPunchOut",
              actor: "System",
              at: now,
            },
          ]),
        };
        if (current)
          await tx
            .update(attendanceLogsTable)
            .set(values)
            .where(attendanceVersion(current));
        else
          await tx
            .insert(attendanceLogsTable)
            .values({
              ...values,
              organizationId: org,
              employeeId: employee.id,
              employeeName: employee.name,
              employeeCode: employee.employeeCode,
              department: employee.department,
              designation: employee.designation,
              userId: employee.userId,
              attendanceDate: date,
              timezone: settings.timezone,
            });
      });
    }
  }
}
export function startAttendanceClosureScheduler() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await closeMissedAttendance();
    } catch (error) {
      logger.error({ error }, "Attendance closure failed");
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), 60 * 60 * 1000);
  timer.unref();
}
