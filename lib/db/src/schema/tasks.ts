import {
  mongoTable,
  serial,
  integer,
  text,
  timestamp,
  numeric,
  json,
  createInsertSchema,
} from "./dsl";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { locationsTable } from "./locations";
import { employeesTable } from "./crew";

export const tasksTable = mongoTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  assigneeId: integer("assignee_id").references(() => usersTable.id),
  locationId: integer("location_id").references(() => locationsTable.id),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  startTime: timestamp("start_time", { withTimezone: true }),
  estimatedMinutes: integer("estimated_minutes"),
  actualMinutes: integer("actual_minutes"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
  batchRef: text("batch_ref"),
  sourceWorkOrderId: integer("source_work_order_id"),
  sequenceNumber: integer("sequence_number"),
  checklist: json("checklist").notNull().default([]),
  createdByUserId: integer("created_by_user_id").references(
    () => usersTable.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const taskAssignmentsTable = mongoTable("task_assignments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id),
  assignedByUserId: integer("assigned_by_user_id").references(
    () => usersTable.id,
  ),
  assignedAt: timestamp("assigned_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const taskActiveTimersTable = mongoTable("task_active_timers", {
  id: serial("id").primaryKey(),
  activeKey: text("active_key").notNull().unique(),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const taskTimeLogsTable = mongoTable("task_time_logs", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id),
  employeeId: integer("employee_id").references(() => employeesTable.id),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  durationMinutes: numeric("duration_minutes", { precision: 8, scale: 2 }),
  workDate: text("work_date"),
  source: text("source").notNull().default("automatic"),
  status: text("status").notNull().default("completed"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;

export const insertTaskAssignmentSchema = createInsertSchema(
  taskAssignmentsTable,
).omit({ id: true, assignedAt: true });
export type TaskAssignment = typeof taskAssignmentsTable.$inferSelect;

export const insertTaskTimeLogSchema = createInsertSchema(
  taskTimeLogsTable,
).omit({ id: true, createdAt: true });
export type InsertTaskTimeLog = z.infer<typeof insertTaskTimeLogSchema>;
export type TaskTimeLog = typeof taskTimeLogsTable.$inferSelect;
