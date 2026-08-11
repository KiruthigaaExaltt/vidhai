import { boolean, integer, json, mongoTable, serial, text, timestamp } from "./dsl";

export const notificationsTable = mongoTable("notifications", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().default(1),
  sourceModule: text("source_module").notNull(),
  targetModule: text("target_module").notNull(),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  metadata: json("metadata").notNull().default({}),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
