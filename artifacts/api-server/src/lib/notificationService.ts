import {
  db,
  eq,
  notificationsTable,
  rolesTable,
  usersTable,
} from "@workspace/db";
import { normalizeOverrides, normalizePermissions } from "./permissionCatalog";
import { emitNotification } from "./notificationGateway";
import { logger } from "./logger";
import { sendExternalNotification } from "./pushNotificationService";

const slug = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
export type NotificationEvent = {
  organizationId: number;
  permissionKey: string;
  eventType: string;
  eventKey: string;
  sourceModule: string;
  targetModule?: string;
  submodule?: string;
  title: string;
  message: string;
  sourceEntityType?: string;
  sourceEntityId?: string | number;
  sourceReference?: string;
  navigationUrl?: string;
  metadata?: Record<string, unknown>;
  recipientUserIds?: number[];
};

export async function resolveNotificationRecipients(
  organizationId: number,
  permissionKey: string,
  restrictedUserIds?: number[],
) {
  const [users, roles] = await Promise.all([
    db
      .select()
      .from(usersTable)
      .where(eq(usersTable.organizationId, organizationId)),
    db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.organizationId, organizationId)),
  ]);
  const allowedIds = restrictedUserIds
    ? new Set(restrictedUserIds.map(Number))
    : null;
  const roleBySlug = new Map(
    (roles as any[])
      .filter((r) => r.isActive !== false)
      .flatMap((r) => [
        [slug(r.name), r],
        [slug(r.slug), r],
      ]),
  );
  return (users as any[]).filter((user) => {
    if (
      user.isDeleted ||
      user.isActive === false ||
      (allowedIds && !allowedIds.has(Number(user.id)))
    )
      return false;
    const role = roleBySlug.get(slug(user.role));
    if (
      slug(user.role) === "admin" ||
      slug(user.role) === "super_admin" ||
      role?.isSuperAdmin ||
      role?.systemKey === "SUPER_ADMIN"
    )
      return true;
    const permissions = new Set(normalizePermissions(role?.permissions));
    for (const override of normalizeOverrides(user.permissionOverrides))
      override.allowed
        ? permissions.add(override.permissionKey)
        : permissions.delete(override.permissionKey);
    return permissions.has(permissionKey);
  });
}

export async function publishNotification(event: NotificationEvent) {
  try {
    const recipients = await resolveNotificationRecipients(
      event.organizationId,
      event.permissionKey,
      event.recipientUserIds,
    );
    const created: any[] = [];
    for (const recipient of recipients) {
      try {
        const [notification] = await db
          .insert(notificationsTable)
          .values({
            organizationId: event.organizationId,
            recipientUserId: recipient.id,
            permissionKey: event.permissionKey,
            sourceModule: event.sourceModule,
            targetModule: event.targetModule ?? event.sourceModule,
            submodule: event.submodule,
            eventType: event.eventType,
            eventRecipientKey: `${event.eventKey}:${recipient.id}`,
            title: event.title,
            message: event.message,
            sourceEntityType: event.sourceEntityType,
            sourceEntityId:
              event.sourceEntityId == null
                ? undefined
                : String(event.sourceEntityId),
            sourceReference: event.sourceReference,
            navigationUrl: event.navigationUrl,
            metadata: event.metadata ?? {},
            isRead: false,
          })
          .returning();
        if (notification) {
          created.push(notification);
          emitNotification(notification);
          void sendExternalNotification(notification).catch((error) =>
            logger.warn(
              { err: error, notificationId: notification.id },
              "External notification delivery failed",
            ),
          );
        }
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
      }
    }
    return created;
  } catch (error) {
    logger.error(
      { err: error, eventType: event.eventType, eventKey: event.eventKey },
      "Notification publication failed",
    );
    return [];
  }
}
