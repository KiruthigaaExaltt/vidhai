import { hostname } from "node:os";
import { db, eq, modelFor, notificationOutboxTable, notificationsTable } from "@workspace/db";
import { emitNotification } from "./notificationGateway";
import { logger } from "./logger";
import { notificationEventSchema, resolveNotificationRecipients, type NotificationEvent } from "./notificationService";
import { PushDeliveryError, sendExternalNotification } from "./pushNotificationService";

const workerId = `${hostname()}:${process.pid}`;
const pollMs = Math.max(250, Number(process.env.NOTIFICATION_WORKER_POLL_MS) || 1000);
const maxAttempts = Math.max(1, Number(process.env.NOTIFICATION_JOB_ATTEMPTS) || 5);
const concurrency = Math.max(1, Number(process.env.NOTIFICATION_WORKER_CONCURRENCY) || 4);
const backoffMs = (attempt: number) => Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
let timer: NodeJS.Timeout | undefined;
let running = false, stopping = false;

async function claim() {
  const now = new Date(), stale = new Date(now.getTime() - 5 * 60_000);
  return modelFor(notificationOutboxTable).findOneAndUpdate(
    { $or: [
      { status: { $in: ["PENDING", "RETRYING"] }, nextAttemptAt: { $lte: now } },
      { status: "PROCESSING", lockedAt: { $lte: stale } },
    ] },
    { $set: { status: "PROCESSING", lockedAt: now, lockedBy: workerId, updatedAt: now }, $inc: { attempts: 1 } },
    { new: true, sort: { priorityRank: 1, createdAt: 1 } },
  ).lean();
}

async function notificationFor(event: NotificationEvent, recipientId: number) {
  const key = `${event.eventKey}:${recipientId}`;
  const find = () => db.select().from(notificationsTable).where(eq(notificationsTable.eventRecipientKey, key)).limit(1);
  const [existing] = await find();
  if (existing) return existing;
  try {
    const [created] = await db.insert(notificationsTable).values({
      organizationId: event.organizationId, recipientUserId: recipientId,
      permissionKey: event.permissionKey, sourceModule: event.sourceModule,
      targetModule: event.targetModule ?? event.sourceModule, submodule: event.submodule,
      eventType: event.eventType, eventRecipientKey: key, title: event.title, message: event.message,
      sourceEntityType: event.sourceEntityType,
      sourceEntityId: event.sourceEntityId == null ? undefined : String(event.sourceEntityId),
      sourceReference: event.sourceReference, navigationUrl: event.navigationUrl,
      metadata: event.metadata ?? {}, channelStatus: { IN_APP: "SUCCESS", SOCKET: "PENDING", PUSH: "PENDING" },
      deliveryAttempts: 0, isRead: false,
    }).returning();
    return created;
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    return (await find())[0];
  }
}

async function deliver(event: NotificationEvent, recipientId: number) {
  const notification: any = await notificationFor(event, recipientId);
  if (!notification) throw new Error("Notification persistence failed");
  const status: Record<string, any> = { IN_APP: "SUCCESS", SOCKET: "PENDING", PUSH: "PENDING", ...(notification.channelStatus || {}) };
  if (!["SUCCESS", "SKIPPED"].includes(status.SOCKET))
    status.SOCKET = await emitNotification(notification) ? "SUCCESS" : "SKIPPED";
  if (!["SUCCESS", "SKIPPED"].includes(status.PUSH)) {
    try {
      const result = await sendExternalNotification(notification, status.pushDeliveredEndpoints || []);
      status.PUSH = result.status;
      status.pushDeliveredEndpoints = result.deliveredEndpoints;
    }
    catch (error) {
      status.PUSH = "RETRYING";
      if (error instanceof PushDeliveryError) status.pushDeliveredEndpoints = error.deliveredEndpoints;
      await db.update(notificationsTable).set({
        channelStatus: status, deliveryAttempts: Number(notification.deliveryAttempts || 0) + 1,
        lastAttemptAt: new Date(), failureReason: error instanceof Error ? error.message.slice(0, 500) : "Push failed",
      }).where(eq(notificationsTable.id, notification.id));
      throw error;
    }
  }
  await db.update(notificationsTable).set({
    channelStatus: status, deliveryAttempts: Number(notification.deliveryAttempts || 0) + 1,
    lastAttemptAt: new Date(), deliveredAt: new Date(), failedAt: null, failureReason: null,
  }).where(eq(notificationsTable.id, notification.id));
  logger.info({ notificationId: notification.id, organizationId: event.organizationId, recipientId, eventType: event.eventType }, "NOTIFICATION_CREATED");
}

async function processJob(job: any) {
  const event = notificationEventSchema.parse(job.payload);
  logger.info({ jobId: job.id, eventType: event.eventType, organizationId: event.organizationId }, "NOTIFICATION_JOB_STARTED");
  const recipients = await resolveNotificationRecipients(
    event.organizationId,
    event.permissionKey,
    event.recipientUserIds,
    event.directRecipientUserIds,
  );
  const results = await Promise.allSettled(recipients.map(recipient => deliver(event, Number(recipient.id))));
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map(result => (result as PromiseRejectedResult).reason), "Notification delivery failed");
  await db.update(notificationOutboxTable).set({
    status: "COMPLETED", processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null, updatedAt: new Date(),
  }).where(eq(notificationOutboxTable.id, job.id));
}

async function work() {
  if (running || stopping) return;
  running = true;
  try {
    const jobs = (await Promise.all(Array.from({ length: concurrency }, () => claim()))).filter(Boolean);
    await Promise.all(jobs.map(async (job: any) => {
      try { await processJob(job); }
      catch (error) {
        const attempts = Number(job.attempts || 1), exhausted = attempts >= maxAttempts;
        await db.update(notificationOutboxTable).set({
          status: exhausted ? "FAILED" : "RETRYING",
          nextAttemptAt: new Date(Date.now() + backoffMs(attempts)), failedAt: exhausted ? new Date() : null,
          lockedAt: null, lockedBy: null,
          lastError: error instanceof Error ? error.message.slice(0, 1000) : "Unknown worker error", updatedAt: new Date(),
        }).where(eq(notificationOutboxTable.id, job.id));
        if (exhausted) {
          await modelFor(notificationsTable).updateMany(
            { eventRecipientKey: { $regex: `^${String(job.eventKey).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:` }, "channelStatus.PUSH": "RETRYING" },
            { $set: { "channelStatus.PUSH": "FAILED", failedAt: new Date(), failureReason: error instanceof Error ? error.message.slice(0, 500) : "Delivery failed" } },
          );
        }
        logger[exhausted ? "error" : "warn"]({ err: error, jobId: job.id, attempt: attempts }, exhausted ? "NOTIFICATION_FAILED" : "NOTIFICATION_RETRY");
      }
    }));
  } finally { running = false; }
}

export function startNotificationWorker() {
  if (timer) return;
  stopping = false; void work(); timer = setInterval(() => void work(), pollMs); timer.unref();
  logger.info({ workerId, concurrency, maxAttempts }, "Notification worker ready");
}
export async function stopNotificationWorker() {
  stopping = true; if (timer) clearInterval(timer); timer = undefined;
  while (running) await new Promise(resolve => setTimeout(resolve, 25));
}
