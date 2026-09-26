import {
  and,
  db,
  eq,
  isNull,
  or,
  employeesTable,
  attendanceLogsTable,
  attendanceTemplatesTable,
  workPatternTemplatesTable,
  holidayTemplatesTable,
  leaveRequestsTable,
  payrollTable,
  crewDeductionsTable,
  organizationDetailsTable,
  rolesTable,
} from "@workspace/db";
import { applyApprovalDecision } from "./crewApprovalEngine";
import {
  attendanceMetrics,
  attendanceFine,
  calendarStatus,
  readJson,
  scheduledDays,
  timeMinutes,
  workDurationHours,
} from "./attendanceRules";
import { publishNotification } from "./notificationService";

const fail = (status: number, message: string) =>
  Object.assign(new Error(message), { status });
export async function attendanceSettings(org: number) {
  const [settings] = await db
    .select()
    .from(organizationDetailsTable)
    .where(eq(organizationDetailsTable.organizationId, org));
  return {
    timezone: settings?.timezone || "Asia/Kolkata",
  };
}
export function dateInZone(timezone: string, instant = new Date()) {
  return instant.toLocaleDateString("en-CA", { timeZone: timezone });
}
export async function buildAttendanceChain(employee: any, org: number) {
  // Legacy chains no longer govern attendance approval.
  return [];
}
export async function activeAttendanceChain(row: any, org: number) {
  return [];
}
export async function attendanceActor(req: any, own: any) {
  const roles = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.organizationId, req.crew.org));
  const role = roles.find(
    (r) => r.slug === req.crew.user.role || r.name === req.crew.user.role,
  );
  const name = String(req.crew.user.role || "")
    .toLowerCase()
    .replace(/[ _-]/g, "");
  return {
    userId: Number(req.crew.user.id),
    employeeId: Number(own?.id || 0),
    name: req.crew.user.displayName || "User",
    role: req.crew.user.role,
    isSuperAdmin: name === "superadmin" || role?.isSuperAdmin === true,
    isAdminRole: name === "admin" || role?.systemKey === "ADMIN",
  };
}
export async function assertAttendanceMonthOpen(
  org: number,
  employeeId: number,
  date: string,
  database = db,
) {
  const [paid] = await database
    .select()
    .from(payrollTable)
    .where(
      and(
        eq(payrollTable.organizationId, org),
        eq(payrollTable.employeeId, employeeId),
        eq(payrollTable.payPeriod, date.slice(0, 7)),
        eq(payrollTable.status, "Paid"),
      ),
    );
  if (paid)
    throw fail(
      409,
      "Paid payroll is locked; attendance cannot be changed for this month",
    );
}
export async function attendanceCalendar(
  employee: any,
  date: string,
  org: number,
) {
  const [patterns, holidays, leaves] = await Promise.all([
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
      .where(eq(leaveRequestsTable.organizationId, org)),
  ]);
  return calendarStatus(employee, date, patterns, holidays, leaves);
}
export async function attendanceFinePreview(
  row: any,
  org: number,
  database = db,
) {
  const [employee] = await database
    .select()
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, row.employeeId),
        eq(employeesTable.organizationId, org),
      ),
    );
  if (!employee) throw fail(404, "Employee not found");
  const [template] = await database
    .select()
    .from(attendanceTemplatesTable)
    .where(
      and(
        eq(attendanceTemplatesTable.id, employee.attendanceRulesTemplate),
        eq(attendanceTemplatesTable.organizationId, org),
      ),
    );
  if (!template || template.isActive === false)
    throw fail(
      400,
      "The employee's assigned attendance template is unavailable",
    );
  const metrics = attendanceMetrics(row, template);
  if (!metrics) return null;
  const patterns = await database
    .select()
    .from(workPatternTemplatesTable)
    .where(eq(workPatternTemplatesTable.organizationId, org));
  const holidays = await database
    .select()
    .from(holidayTemplatesTable)
    .where(eq(holidayTemplatesTable.organizationId, org));
  const days = scheduledDays(
    employee,
    row.attendanceDate.slice(0, 7),
    patterns,
    holidays,
  );
  const hourly =
    Number(employee.baseSalary || 0) /
    Math.max(1, days * Math.max(1, workDurationHours(template)));
  const amount = attendanceFine(template, hourly, metrics.deductionHours);
  return {
    ...metrics,
    amount,
    calculatedAmount: amount,
    scheduledWorkingDays: days,
    fineType: template.fineType,
    finePerHour: template.finePerHour,
  };
}
export function attendanceVersion(row: any) {
  return and(
    eq(attendanceLogsTable.id, row.id),
    eq(attendanceLogsTable.organizationId, row.organizationId),
    Number(row.revision || 0) === 0
      ? or(
          isNull(attendanceLogsTable.revision),
          eq(attendanceLogsTable.revision, 0),
        )
      : eq(attendanceLogsTable.revision, row.revision),
  );
}
export async function notifyAttendance(
  row: any,
  actorId: number,
  database = db,
) {
  const targetIds = row.approvalStatus === "Pending" ? [] : [row.employeeId];
  const employees = await database
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, row.organizationId));
  const recipients = employees
    .filter((e) => targetIds.includes(Number(e.id)) && e.userId)
    .map((e) => Number(e.userId));
  await publishNotification(
    {
      organizationId: row.organizationId,
      actorId: actorId || undefined,
      permissionKey: "crew.attendance.approve",
      recipientUserIds: row.approvalStatus === "Pending" ? undefined : [],
      directRecipientUserIds: recipients,
      eventType: "ATTENDANCE_APPROVAL",
      eventKey: `attendance:${row.id}:${row.revision || 0}:${row.approvalStatus}`,
      sourceModule: "crew",
      submodule: "attendance",
      title:
        row.approvalStatus === "Pending"
          ? "Attendance needs approval"
          : `Attendance ${row.approvalStatus}`,
      message: `${row.employeeName}: ${row.attendanceDate}. ${row.rejectionRemarks || ""}`,
      sourceEntityType: "attendance",
      sourceEntityId: row.id,
      navigationUrl: "/crew?tab=attendance",
      metadata: {
        attendanceId: row.id,
        status: row.approvalStatus,
      },
    },
    database,
  );
}
export async function reviewAttendance(
  row: any,
  decision: "Approved" | "Rejected",
  remarks: string,
  overrides: any,
  actor: any,
  hasPermission: boolean,
) {
  if (!hasPermission)
    throw fail(403, "Forbidden: attendance approval permission required");
  if (row.approvalStatus !== "Pending")
    throw fail(409, "Only pending requests can be approved or rejected");
  if (decision === "Approved" && (!row.checkInTime || !row.checkOutTime))
    throw fail(
      400,
      "Cannot approve: Punch Out has not been submitted yet. The attendance record is incomplete.",
    );
  const chain = await activeAttendanceChain(row, row.organizationId);
  const result = applyApprovalDecision({
    status: row.approvalStatus,
    currentLevel: 1,
    approvalChain: chain,
    approvalHistory: readJson(row.approvalHistory),
    decision,
    remarks,
    actor,
    hasActionPermission: hasPermission,
    allowApprovalOverride: false,
    isAdminRole: actor.isAdminRole,
  });
  const now = new Date();
  return db.transaction(async (tx) => {
    await assertAttendanceMonthOpen(
      row.organizationId,
      row.employeeId,
      row.attendanceDate,
      tx,
    );
    const values: any = {
      approvalStatus: result.status,
      currentLevel: result.currentLevel,
      approvalChain: JSON.stringify(chain),
      approvalHistory: JSON.stringify(result.approvalHistory),
      revision: Number(row.revision || 0) + 1,
      approvedBy: result.status === "Approved" ? actor.userId : null,
      approvedAt: result.status === "Approved" ? now : null,
      rejectedBy: result.status === "Rejected" ? actor.userId : null,
      rejectedAt: result.status === "Rejected" ? now : null,
      rejectionRemarks: result.status === "Rejected" ? remarks : null,
      updatedAt: now,
      auditLogs: JSON.stringify([
        ...readJson(row.auditLogs),
        {
          action: decision,
          actor: actor.name,
          at: now,
          remarks,
          overrides,
          isOverride: result.wasOverride,
        },
      ]),
    };
    let preview: any = null;
    if (result.status === "Approved") {
      for (const key of ["checkInTime", "checkOutTime"])
        if (overrides?.[key] !== undefined) {
          if (timeMinutes(overrides[key]) === null)
            throw fail(400, "Approval times must use HH:mm format");
          values[key] = overrides[key];
        }
      if (overrides?.lateFineAmount !== undefined) {
        if (
          overrides.lateFineAmount === null ||
          overrides.lateFineAmount === "" ||
          !Number.isFinite(Number(overrides.lateFineAmount)) ||
          Number(overrides.lateFineAmount) < 0
        )
          throw fail(400, "Late fine must be a non-negative number");
        values.lateFineAmount = String(Number(overrides.lateFineAmount));
      }
      values.originalPunchValues =
        row.originalPunchValues ||
        JSON.stringify({
          checkInTime: row.checkInTime,
          checkOutTime: row.checkOutTime,
        });
      preview = await attendanceFinePreview(
        { ...row, ...values },
        row.organizationId,
        tx,
      );
      values.status = preview ? "Late" : "Present";
      values.locked = true;
    } else
      values.status =
        result.status === "Rejected" ? "Absent" : "Pending Approval";
    const [updated] = await tx
      .update(attendanceLogsTable)
      .set(values)
      .where(
        and(
          attendanceVersion(row),
          eq(attendanceLogsTable.approvalStatus, "Pending"),
        ),
      )
      .returning();
    if (!updated)
      throw fail(
        409,
        "Attendance changed during review. Refresh and try again.",
      );
    if (result.status === "Approved") {
      const filter = and(
        eq(crewDeductionsTable.organizationId, row.organizationId),
        eq(crewDeductionsTable.attendanceId, row.id),
        eq(crewDeductionsTable.source, "attendance_auto_deduction"),
      );
      const [existing] = await tx
        .select()
        .from(crewDeductionsTable)
        .where(filter);
      if (preview) {
        const payload = {
          organizationId: row.organizationId,
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          attendanceId: row.id,
          date: row.attendanceDate,
          month: Number(row.attendanceDate.slice(5, 7)) - 1,
          year: Number(row.attendanceDate.slice(0, 4)),
          source: "attendance_auto_deduction",
          status: "Approved",
          autoApproved: true,
          approvedBy: actor.userId,
          approvedAt: now,
          updatedAt: now,
          amount: values.lateFineAmount ?? String(preview.amount),
          calculatedAmount: String(preview.calculatedAmount),
          lateMinutes: preview.lateMinutes,
          earlyExitMinutes: preview.earlyExitMinutes,
          totalDeductionMinutes: preview.totalDeductionMinutes,
          autoReason: preview.autoReason,
          notes: `Approved Attendance #${row.id}${values.lateFineAmount !== undefined ? " (late fine edited)" : ""}`,
        };
        if (existing)
          await tx
            .update(crewDeductionsTable)
            .set(payload)
            .where(eq(crewDeductionsTable.id, existing.id));
        else await tx.insert(crewDeductionsTable).values(payload);
      } else if (existing) await tx.delete(crewDeductionsTable).where(filter);
    }
    await notifyAttendance(updated, actor.userId, tx);
    return updated;
  });
}
