import webpush from "web-push";
import { and, db, eq, pushSubscriptionsTable } from "@workspace/db";
import { logger } from "./logger";

const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@vidhai.local";
const enabled = Boolean(publicKey && privateKey);

if (enabled) webpush.setVapidDetails(subject, publicKey!, privateKey!);
else logger.warn("VAPID keys are not configured; external push notifications are disabled");

export const getPushPublicKey = () => publicKey ?? null;

export class PushDeliveryError extends Error {
  constructor(public readonly deliveredEndpoints: string[]) {
    super("One or more push deliveries failed");
  }
}

export async function sendExternalNotification(notification: any, previouslyDelivered: string[] = []) {
  if (!enabled) return { status: "SKIPPED" as const, deliveredEndpoints: previouslyDelivered };
  const delivered = new Set(previouslyDelivered);
  const subscriptions = (await db.select().from(pushSubscriptionsTable).where(and(
    eq(pushSubscriptionsTable.organizationId, notification.organizationId),
    eq(pushSubscriptionsTable.userId, notification.recipientUserId),
  ))).filter((row: any) => !delivered.has(row.endpoint));
  const payload = JSON.stringify({
    notificationId: notification.id,
    title: notification.title,
    message: notification.message,
    navigationUrl: notification.navigationUrl || "/notifications",
    tag: notification.eventRecipientKey,
    createdAt: notification.createdAt,
  });
  if (!subscriptions.length)
    return { status: previouslyDelivered.length ? "SUCCESS" as const : "SKIPPED" as const, deliveredEndpoints: [...delivered] };
  const failures: Error[] = [];
  await Promise.all((subscriptions as any[]).map(async (row) => {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
        { TTL: 60 * 60, urgency: "normal" },
      );
      delivered.add(row.endpoint);
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, row.endpoint));
        return;
      }
      logger.warn({ err: error, subscriptionId: row.id }, "External push delivery failed");
      failures.push(error instanceof Error ? error : new Error("Push delivery failed"));
    }
  }));
  if (failures.length) throw new PushDeliveryError([...delivered]);
  return { status: "SUCCESS" as const, deliveredEndpoints: [...delivered] };
}
