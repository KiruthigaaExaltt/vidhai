import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, taskTimeLogsTable, usersTable, locationsTable } from "@workspace/db";
import { eq, desc, and } from "@workspace/db";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

// List tasks
router.get("/", requireAuth, async (req, res) => {
  const { status, assigneeId, locationId } = req.query as Record<string, string | undefined>;

  const rows = await db
    .select({
      task: tasksTable,
      assigneeName: usersTable.displayName,
      locationName: locationsTable.name,
    })
    .from(tasksTable)
    .leftJoin(usersTable, eq(tasksTable.assigneeId, usersTable.id))
    .leftJoin(locationsTable, eq(tasksTable.locationId, locationsTable.id))
    .orderBy(desc(tasksTable.createdAt));

  let filtered = rows;
  if (status) filtered = filtered.filter((r) => r.task.status === status);
  if (assigneeId) filtered = filtered.filter((r) => String(r.task.assigneeId) === assigneeId);
  if (locationId) filtered = filtered.filter((r) => String(r.task.locationId) === locationId);

  return res.json(
    filtered.map((r) => ({
      ...r.task,
      assigneeName: r.assigneeName ?? null,
      locationName: r.locationName ?? null,
    }))
  );
});

// Create task
router.post("/", requireAuth, async (req, res) => {
  const userId = (req.session as any).userId;
  const { title, description, assigneeId, locationId, status, priority, startTime, estimatedMinutes, notes, batchRef } = req.body;

  const [task] = await db
    .insert(tasksTable)
    .values({
      title,
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

  return res.status(201).json(task);
});

// Get task detail
router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);

  const [row] = await db
    .select({
      task: tasksTable,
      assigneeName: usersTable.displayName,
      locationName: locationsTable.name,
    })
    .from(tasksTable)
    .leftJoin(usersTable, eq(tasksTable.assigneeId, usersTable.id))
    .leftJoin(locationsTable, eq(tasksTable.locationId, locationsTable.id))
    .where(eq(tasksTable.id, id))
    .limit(1);

  if (!row) return res.status(404).json({ error: "Task not found" });

  const timeLogs = await db
    .select({
      log: taskTimeLogsTable,
      userName: usersTable.displayName,
    })
    .from(taskTimeLogsTable)
    .leftJoin(usersTable, eq(taskTimeLogsTable.userId, usersTable.id))
    .where(eq(taskTimeLogsTable.taskId, id))
    .orderBy(taskTimeLogsTable.startTime);

  return res.json({
    ...row.task,
    assigneeName: row.assigneeName ?? null,
    locationName: row.locationName ?? null,
    timeLogs: timeLogs.map((t) => ({ ...t.log, userName: t.userName ?? null })),
  });
});

// Update task
router.patch("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { title, description, assigneeId, locationId, status, priority, startTime, estimatedMinutes, actualMinutes, notes, batchRef } = req.body;

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (assigneeId !== undefined) updates.assigneeId = assigneeId;
  if (locationId !== undefined) updates.locationId = locationId;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (startTime !== undefined) updates.startTime = startTime ? new Date(startTime) : null;
  if (estimatedMinutes !== undefined) updates.estimatedMinutes = estimatedMinutes;
  if (actualMinutes !== undefined) updates.actualMinutes = actualMinutes;
  if (notes !== undefined) updates.notes = notes;
  if (batchRef !== undefined) updates.batchRef = batchRef;

  const [updated] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Task not found" });

  return res.json(updated);
});

// Delete task
router.delete("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  return res.status(204).send();
});

// Log time on a task
router.post("/:id/time-logs", requireAuth, async (req, res) => {
  const taskId = Number(req.params.id);
  const userId = (req.session as any).userId;
  const { startTime, endTime, durationMinutes, notes } = req.body;

  const [log] = await db
    .insert(taskTimeLogsTable)
    .values({
      taskId,
      userId,
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : null,
      durationMinutes: durationMinutes ?? null,
      notes: notes ?? null,
    })
    .returning();

  return res.status(201).json(log);
});

export default router;
