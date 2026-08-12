import { Router } from "express";
import {
  db,
  eq,
  and,
  desc,
  tasksTable,
  taskAssignmentsTable,
  taskActiveTimersTable,
  taskTimeLogsTable,
  usersTable,
  employeesTable,
  locationsTable,
} from "@workspace/db";
import { effectivePermissions, getAuthUser } from "../lib/access";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId)
    return res.status(401).json({ error: "Not authenticated" });
  next();
}

const minutesBetween = (start: Date | string, end: Date) =>
  Math.max(
    0,
    Math.round(((end.getTime() - new Date(start).getTime()) / 60000) * 100) /
      100,
  );
const dateKey = (value: Date) => value.toISOString().slice(0, 10);

async function context(req: any) {
  const user = await getAuthUser(req);
  if (!user) return null;
  const permissions = await effectivePermissions(user);
  const [employee] = (
    await db
      .select()
      .from(employeesTable)
      .where(
        and(
          eq(employeesTable.organizationId, Number(user.organizationId ?? 1)),
          eq(employeesTable.userId, Number(user.id)),
        ),
      )
  ).filter((row: any) => !row.isDeleted);
  return {
    user,
    employee: employee ?? null,
    permissions,
    elevated:
      permissions.includes("*") ||
      permissions.includes("task.task_board.update"),
  };
}

async function taskAssignments(taskId: number) {
  const assignments = await db
    .select()
    .from(taskAssignmentsTable)
    .where(eq(taskAssignmentsTable.taskId, taskId));
  const employees = await db.select().from(employeesTable);
  return assignments.map((assignment: any) => {
    const employee = employees.find(
      (item: any) => Number(item.id) === Number(assignment.employeeId),
    );
    return {
      ...assignment,
      employeeName: employee?.name ?? "Unknown crew member",
      employeeCode: employee?.employeeCode ?? null,
      userId: employee?.userId ?? null,
    };
  });
}

async function canAccessTask(req: any, taskId: number, operate = false) {
  const ctx = await context(req);
  if (!ctx) return { allowed: false, status: 401, ctx };
  if (ctx.elevated && !operate) return { allowed: true, status: 200, ctx };
  if (!ctx.employee) return { allowed: false, status: 403, ctx };
  const assignments = await db
    .select()
    .from(taskAssignmentsTable)
    .where(
      and(
        eq(taskAssignmentsTable.taskId, taskId),
        eq(taskAssignmentsTable.employeeId, Number(ctx.employee.id)),
      ),
    );
  return {
    allowed: assignments.length > 0 || (ctx.elevated && !operate),
    status: 403,
    ctx,
  };
}

async function serializeTask(task: any) {
  const assignments = await taskAssignments(Number(task.id));
  const activeTimers = await db
    .select()
    .from(taskActiveTimersTable)
    .where(eq(taskActiveTimersTable.taskId, Number(task.id)));
  const logs = await db
    .select()
    .from(taskTimeLogsTable)
    .where(eq(taskTimeLogsTable.taskId, Number(task.id)));
  const closedMinutes = logs
    .filter((log: any) => log.source !== "manual")
    .reduce(
      (sum: number, log: any) => sum + Number(log.durationMinutes ?? 0),
      0,
    );
  const legacyName = task.assigneeId
    ? (
        await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, task.assigneeId))
          .limit(1)
      )[0]?.displayName
    : null;
  return {
    ...task,
    assignments,
    assigneeName:
      assignments.map((item: any) => item.employeeName).join(", ") ||
      legacyName ||
      null,
    activeTimers,
    actualMinutes: Math.round(closedMinutes * 100) / 100,
  };
}

router.get("/crew", requireAuth, async (req, res) => {
  const ctx = await context(req);
  if (!ctx) return res.status(401).json({ error: "Not authenticated" });
  const rows = (
    await db
      .select()
      .from(employeesTable)
      .where(
        eq(employeesTable.organizationId, Number(ctx.user.organizationId ?? 1)),
      )
  )
    .filter((row: any) => !row.isDeleted && row.status === "Active")
    .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  return res.json(
    rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      employeeCode: row.employeeCode,
      designation: row.designation,
      userId: row.userId ?? null,
    })),
  );
});

router.get("/timesheet", requireAuth, async (req, res) => {
  const ctx = await context(req);
  if (!ctx) return res.status(401).json({ error: "Not authenticated" });
  let employeeId = Number(req.query.employeeId || ctx.employee?.id);
  if (!employeeId)
    return res.json({
      entries: [],
      totals: { employeeMinutes: 0, daily: {}, tasks: {} },
    });
  if (!ctx.elevated && employeeId !== Number(ctx.employee?.id))
    return res
      .status(403)
      .json({ error: "You can only view your own timesheet" });
  const logs = await db
    .select()
    .from(taskTimeLogsTable)
    .where(eq(taskTimeLogsTable.employeeId, employeeId))
    .orderBy(desc(taskTimeLogsTable.startTime));
  const tasks = await db.select().from(tasksTable);
  const entries = logs
    .filter(
      (log: any) =>
        log.source === "manual" && log.endTime && log.status !== "active",
    )
    .map((log: any) => {
      const task = tasks.find(
        (item: any) => Number(item.id) === Number(log.taskId),
      );
      return {
        ...log,
        taskTitle: task?.title ?? `Task #${log.taskId}`,
        workOrder: task?.batchRef ?? null,
      };
    });
  const totals = entries.reduce(
    (result: any, entry: any) => {
      const value = Number(entry.durationMinutes ?? 0);
      const day = entry.workDate || dateKey(new Date(entry.startTime));
      result.employeeMinutes += value;
      result.daily[day] = (result.daily[day] || 0) + value;
      result.tasks[String(entry.taskId)] =
        (result.tasks[String(entry.taskId)] || 0) + value;
      return result;
    },
    { employeeMinutes: 0, daily: {}, tasks: {} },
  );
  return res.json({ entries, totals });
});

router.get("/", requireAuth, async (req, res) => {
  const { status, assigneeId, locationId } = req.query as Record<
    string,
    string | undefined
  >;
  const ctx = await context(req);
  if (!ctx) return res.status(401).json({ error: "Not authenticated" });
  let rows = await db
    .select()
    .from(tasksTable)
    .orderBy(desc(tasksTable.createdAt));
  if (!ctx.elevated) {
    if (!ctx.employee) rows = [];
    else {
      const mine = await db
        .select()
        .from(taskAssignmentsTable)
        .where(eq(taskAssignmentsTable.employeeId, Number(ctx.employee.id)));
      const ids = new Set(mine.map((item: any) => Number(item.taskId)));
      rows = rows.filter(
        (task: any) =>
          ids.has(Number(task.id)) ||
          Number(task.assigneeId) === Number(ctx.user.id),
      );
    }
  }
  if (status) rows = rows.filter((task: any) => task.status === status);
  if (assigneeId) {
    const assigned = await db
      .select()
      .from(taskAssignmentsTable)
      .where(eq(taskAssignmentsTable.employeeId, Number(assigneeId)));
    const ids = new Set(assigned.map((item: any) => Number(item.taskId)));
    rows = rows.filter((task: any) => ids.has(Number(task.id)));
  }
  if (locationId)
    rows = rows.filter((task: any) => String(task.locationId) === locationId);
  return res.json(await Promise.all(rows.map(serializeTask)));
});

router.post("/", requireAuth, async (req, res) => {
  const userId = Number((req.session as any).userId);
  const {
    title,
    description,
    assigneeId,
    locationId,
    status,
    priority,
    startTime,
    estimatedMinutes,
    notes,
    batchRef,
  } = req.body;
  if (!String(title || "").trim())
    return res.status(400).json({ error: "Task title is required" });
  const [task] = await db
    .insert(tasksTable)
    .values({
      title: String(title).trim(),
      description: description ?? null,
      assigneeId: assigneeId ?? null,
      locationId: locationId ?? null,
      status: status ?? "todo",
      priority: priority ?? "medium",
      startTime: startTime ? new Date(startTime) : null,
      estimatedMinutes: estimatedMinutes ?? null,
      notes: notes ?? null,
      batchRef: batchRef ?? null,
      createdByUserId: userId,
    })
    .returning();
  return res.status(201).json(await serializeTask(task));
});

router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const access = await canAccessTask(req, id);
  if (!access.allowed)
    return res
      .status(access.status)
      .json({ error: "Task is outside your access" });
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, id))
    .limit(1);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const timeLogs = await db
    .select()
    .from(taskTimeLogsTable)
    .where(eq(taskTimeLogsTable.taskId, id))
    .orderBy(taskTimeLogsTable.startTime);
  return res.json({ ...(await serializeTask(task)), timeLogs });
});

router.patch("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const {
    title,
    description,
    locationId,
    priority,
    estimatedMinutes,
    notes,
    batchRef,
  } = req.body;
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (locationId !== undefined) updates.locationId = locationId;
  if (priority !== undefined) updates.priority = priority;
  if (estimatedMinutes !== undefined)
    updates.estimatedMinutes = estimatedMinutes;
  if (notes !== undefined) updates.notes = notes;
  if (batchRef !== undefined) updates.batchRef = batchRef;
  const [updated] = await db
    .update(tasksTable)
    .set(updates)
    .where(eq(tasksTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Task not found" });
  return res.json(await serializeTask(updated));
});

router.patch("/:id/assignments", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const employeeIds = [
    ...new Set(
      (Array.isArray(req.body.employeeIds) ? req.body.employeeIds : [])
        .map(Number)
        .filter(Number.isInteger),
    ),
  ] as number[];
  const ctx = await context(req);
  if (!ctx?.elevated)
    return res
      .status(403)
      .json({ error: "Task update permission is required" });
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, id))
    .limit(1);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const employees = (await db.select().from(employeesTable)).filter(
    (row: any) =>
      employeeIds.includes(Number(row.id)) &&
      !row.isDeleted &&
      Number(row.organizationId) === Number(ctx.user.organizationId ?? 1),
  );
  if (employees.length !== employeeIds.length)
    return res
      .status(400)
      .json({ error: "One or more crew members are invalid" });
  await db.transaction(async (tx) => {
    await tx
      .delete(taskAssignmentsTable)
      .where(eq(taskAssignmentsTable.taskId, id));
    if (employeeIds.length)
      await tx.insert(taskAssignmentsTable).values(
        employeeIds.map((employeeId) => ({
          taskId: id,
          employeeId,
          assignedByUserId: Number(ctx.user.id),
        })),
      );
    await tx
      .update(tasksTable)
      .set({ assigneeId: employees[0]?.userId ?? null, updatedAt: new Date() })
      .where(eq(tasksTable.id, id));
  });
  const [updated] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, id))
    .limit(1);
  return res.json(await serializeTask(updated));
});

router.post("/:id/time-logs/start", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const access = await canAccessTask(req, id, true);
  if (!access.allowed || !access.ctx?.employee)
    return res
      .status(403)
      .json({ error: "Only assigned crew can start this task" });
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, id))
    .limit(1);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (["done", "cancelled"].includes(task.status))
    return res
      .status(409)
      .json({ error: "Completed or cancelled tasks cannot be started" });
  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(taskActiveTimersTable).values({
        activeKey: `${id}:${access.ctx!.employee.id}`,
        taskId: id,
        employeeId: Number(access.ctx!.employee.id),
        userId: Number(access.ctx!.user.id),
        startedAt: now,
      });
      await tx
        .update(tasksTable)
        .set({
          status: "in_progress",
          startTime: task.startTime ?? now,
          updatedAt: now,
        })
        .where(eq(tasksTable.id, id));
    });
  } catch (error: any) {
    if (error?.code === 11000)
      return res
        .status(409)
        .json({ error: "This task timer is already running" });
    throw error;
  }
  const [updated] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, id))
    .limit(1);
  return res.status(201).json(await serializeTask(updated));
});

async function closeOwnTimer(req: any, res: any, complete: boolean) {
  const id = Number(req.params.id);
  const access = await canAccessTask(req, id, true);
  if (!access.allowed || !access.ctx?.employee)
    return res
      .status(403)
      .json({ error: "Only assigned crew can operate this task" });
  const employeeId = Number(access.ctx.employee.id);
  const [timer] = await db
    .select()
    .from(taskActiveTimersTable)
    .where(eq(taskActiveTimersTable.activeKey, `${id}:${employeeId}`))
    .limit(1);
  if (!timer && !complete)
    return res.status(409).json({ error: "There is no active timer to pause" });
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, id))
    .limit(1);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.status === "done")
    return res.status(409).json({ error: "Task is already completed" });
  const now = new Date();
  await db.transaction(async (tx) => {
    const timersToClose = complete
      ? await tx
          .select()
          .from(taskActiveTimersTable)
          .where(eq(taskActiveTimersTable.taskId, id))
      : timer
        ? [timer]
        : [];
    for (const active of timersToClose) {
      await tx.insert(taskTimeLogsTable).values({
        taskId: id,
        userId: Number(active.userId),
        employeeId: Number(active.employeeId),
        startTime: new Date(active.startedAt),
        endTime: now,
        durationMinutes: String(minutesBetween(active.startedAt, now)),
        workDate: dateKey(new Date(active.startedAt)),
        source: "automatic",
        status: "completed",
        notes: null,
      });
      await tx
        .delete(taskActiveTimersTable)
        .where(eq(taskActiveTimersTable.id, active.id));
    }
    const remaining = complete
      ? []
      : (
          await tx
            .select()
            .from(taskActiveTimersTable)
            .where(eq(taskActiveTimersTable.taskId, id))
        ).filter((item: any) => Number(item.id) !== Number(timer?.id));
    await tx
      .update(tasksTable)
      .set({
        status: complete ? "done" : remaining.length ? "in_progress" : "paused",
        completedAt: complete ? now : null,
        updatedAt: now,
      })
      .where(eq(tasksTable.id, id));
  });
  const [updated] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, id))
    .limit(1);
  return res.json(await serializeTask(updated));
}

router.post("/:id/time-logs/pause", requireAuth, (req, res) =>
  closeOwnTimer(req, res, false),
);
router.post("/:id/time-logs/complete", requireAuth, (req, res) =>
  closeOwnTimer(req, res, true),
);

router.post("/:id/time-logs", requireAuth, async (req, res) => {
  const taskId = Number(req.params.id);
  const access = await canAccessTask(req, taskId, true);
  if (!access.allowed || !access.ctx?.employee)
    return res
      .status(403)
      .json({ error: "You can only log time against an assigned task" });
  const durationMinutes = Number(req.body.durationMinutes);
  const workDate = String(req.body.workDate || "");
  const notes = String(req.body.notes || "").trim() || null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(workDate) ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0 ||
    durationMinutes > 1440
  )
    return res.status(400).json({
      error:
        "A valid date and duration between 1 and 1440 minutes are required",
    });
  const employeeId = Number(access.ctx.employee.id);
  const existing = (
    await db
      .select()
      .from(taskTimeLogsTable)
      .where(
        and(
          eq(taskTimeLogsTable.taskId, taskId),
          eq(taskTimeLogsTable.employeeId, employeeId),
        ),
      )
  ).find(
    (log: any) =>
      log.source === "manual" &&
      log.workDate === workDate &&
      Number(log.durationMinutes) === durationMinutes &&
      (log.notes ?? null) === notes,
  );
  if (existing)
    return res
      .status(409)
      .json({ error: "This manual timesheet entry already exists" });
  const startTime = new Date(`${workDate}T00:00:00`);
  const [log] = await db
    .insert(taskTimeLogsTable)
    .values({
      taskId,
      userId: Number(access.ctx.user.id),
      employeeId,
      startTime,
      endTime: startTime,
      durationMinutes: String(durationMinutes),
      workDate,
      source: "manual",
      status: "completed",
      notes,
    })
    .returning();
  return res.status(201).json(log);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  return res.status(204).send();
});

export default router;
