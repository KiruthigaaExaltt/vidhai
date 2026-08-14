import {
  boolean,
  integer,
  json,
  mongoTable,
  serial,
  text,
  timestamp,
} from "./dsl";

export const notificationsTable = mongoTable("notifications", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().default(1),
  recipientUserId: integer("recipient_user_id").notNull(),
  permissionKey: text("permission_key").notNull(),
  sourceModule: text("source_module").notNull(),
  targetModule: text("target_module").notNull(),
  submodule: text("submodule"),
  eventType: text("event_type").notNull(),
  eventRecipientKey: text("event_recipient_key").notNull().unique(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  sourceEntityType: text("source_entity_type"),
  sourceEntityId: text("source_entity_id"),
  sourceReference: text("source_reference"),
  navigationUrl: text("navigation_url"),
  metadata: json("metadata").notNull().default({}),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pushSubscriptionsTable = mongoTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  userId: integer("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
