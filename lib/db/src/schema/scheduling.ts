import { mongoTable, serial, integer, text, date, boolean, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const scheduleEventsTable = mongoTable("schedule_events", {
  id: serial("id").primaryKey(),
  locationCode: text("location_code").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  eventType: text("event_type").notNull(),
  startDate: date("start_date", { mode: "string" }),
  plannedDate: date("planned_date", { mode: "string" }).notNull(),
  actualDate: date("actual_date", { mode: "string" }),
  isManualOverride: boolean("is_manual_override").notNull().default(false),
  isSuggestion: boolean("is_suggestion").notNull().default(false),
  parentEventId: integer("parent_event_id"),
  planCode: text("plan_code"),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertScheduleEventSchema = createInsertSchema(scheduleEventsTable).omit({ id: true, createdAt: true });
export type InsertScheduleEvent = z.infer<typeof insertScheduleEventSchema>;
export type ScheduleEvent = typeof scheduleEventsTable.$inferSelect;
