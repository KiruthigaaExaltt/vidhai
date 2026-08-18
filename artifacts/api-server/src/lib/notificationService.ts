import { db, eq, notificationOutboxTable, rolesTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { normalizeOverrides, normalizePermissions } from "./permissionCatalog";
import { logger } from "./logger";

const slug = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export const notificationPrioritySchema = z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]);
export const notificationEventSchema = z.object({
  organizationId: z.number().int().positive(),
  permissionKey: z.string().min(1), eventType: z.string().min(1), eventKey: z.string().min(1),
  sourceModule: z.string().min(1), targetModule: z.string().optional(), submodule: z.string().optional(),
  title: z.string().min(1).max(240), message: z.string().min(1).max(2000),
  sourceEntityType: z.string().optional(), sourceEntityId: z.union([z.string(), z.number()]).optional(),
  sourceReference: z.string().optional(), navigationUrl: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(), recipientUserIds: z.array(z.number().int().positive()).optional(),
  directRecipientUserIds: z.array(z.number().int().positive()).optional(),
  actorId: z.number().int().positive().optional(), priority: notificationPrioritySchema.optional(),
});
export type NotificationEvent = z.infer<typeof notificationEventSchema>;

export async function resolveNotificationRecipients(organizationId: number, permissionKey: string, restrictedUserIds?: number[], directRecipientUserIds: number[] = []) {
  const [users, roles] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.organizationId, organizationId)),
    db.select().from(rolesTable).where(eq(rolesTable.organizationId, organizationId)),
  ]);
  const allowedIds = restrictedUserIds ? new Set(restrictedUserIds.map(Number)) : null;
  const roleBySlug = new Map((roles as any[]).filter(r => r.isActive !== false).flatMap(r => [[slug(r.name), r], [slug(r.slug), r]]));
  const directIds = new Set(directRecipientUserIds.map(Number));
  return (users as any[]).filter(user => {
    if (user.isDeleted || user.isActive === false) return false;
    if (directIds.has(Number(user.id))) return true;
    if (allowedIds && !allowedIds.has(Number(user.id))) return false;
    const role = roleBySlug.get(slug(user.role)) as any;
    if (
      ["admin", "super_admin"].includes(slug(user.role)) ||
      ["ADMIN", "SUPER_ADMIN"].includes(String(user.systemKey || "")) ||
      role?.isSuperAdmin ||
      ["ADMIN", "SUPER_ADMIN"].includes(String(role?.systemKey || ""))
    )
      return true;
    const permissions = new Set(normalizePermissions(role?.permissions));
    for (const override of normalizeOverrides(user.permissionOverrides)) override.allowed ? permissions.add(override.permissionKey) : permissions.delete(override.permissionKey);
    return permissions.has(permissionKey);
  });
}

export async function publishNotification(input: NotificationEvent, database: typeof db = db, throwOnError = false) {
  const event = notificationEventSchema.parse(input);
  const priority = event.priority ?? "NORMAL";
  const priorityRank = { CRITICAL: 1, HIGH: 2, NORMAL: 3, LOW: 4 }[priority];
  try {
    const [record] = await database.insert(notificationOutboxTable).values({
      eventKey: event.eventKey, eventType: event.eventType, organizationId: event.organizationId,
      actorId: event.actorId, priority, priorityRank, payload: event,
      status: "PENDING", attempts: 0, nextAttemptAt: new Date(),
    }).returning();
    logger.info({ eventId: record?.id, eventType: event.eventType, organizationId: event.organizationId }, "NOTIFICATION_EVENT_CREATED");
    return record;
  } catch (error: any) {
    if (error?.code === 11000) return null;
    if (throwOnError) throw error;
    logger.error({ err: error, eventType: event.eventType, eventKey: event.eventKey }, "Notification event enqueue failed");
    return null;
  }
}
