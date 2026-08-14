import { Router } from "express";
import {
  and,
  db,
  desc,
  eq,
  notificationsTable,
  pushSubscriptionsTable,
} from "@workspace/db";
import { requireAuth } from "./auth";
import { getAuthUser } from "../lib/access";
import { getPushPublicKey } from "../lib/pushNotificationService";

const router = Router();
router.use(requireAuth);
router.use(async (req, res, next) => {
  const user = await getAuthUser(req);
  if (
    !user ||
    Number(user.sessionVersion ?? 0) !==
      Number((req.session as any)?.sessionVersion ?? 0)
  )
    return res.status(401).json({ error: "Authentication required" });
  (req as any).notificationUser = user;
  return next();
});
async function context(req: any) {
  const user = req.notificationUser;
  return {
    userId: Number(user.id),
    organizationId: Number(user.organizationId ?? 1),
  };
}
router.get("/count", async (req, res) => {
  const c = await context(req);
  const unreadCount = await db.count(
    notificationsTable,
    and(
      eq(notificationsTable.organizationId, c.organizationId),
      eq(notificationsTable.recipientUserId, c.userId),
      eq(notificationsTable.isRead, false),
    ),
  );
  res.json({ unreadCount });
});
router.get("/push/public-key", (_req, res) => {
  const key = getPushPublicKey();
  if (!key)
    return res
      .status(503)
      .json({ error: "External notifications are not configured" });
  return res.json({ publicKey: key });
});
router.post("/push/subscriptions", async (req, res) => {
  const c = await context(req);
  const endpoint = String(req.body?.endpoint ?? "");
  const p256dh = String(req.body?.keys?.p256dh ?? "");
  const auth = String(req.body?.keys?.auth ?? "");
  if (!endpoint.startsWith("https://") || !p256dh || !auth)
    return res.status(400).json({ error: "Invalid push subscription" });
  const [existing] = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, endpoint))
    .limit(1);
  if (existing) {
    await db
      .update(pushSubscriptionsTable)
      .set({
        organizationId: c.organizationId,
        userId: c.userId,
        p256dh,
        auth,
        userAgent: req.get("user-agent"),
        updatedAt: new Date(),
      })
      .where(eq(pushSubscriptionsTable.endpoint, endpoint));
  } else {
    await db.insert(pushSubscriptionsTable).values({
      organizationId: c.organizationId,
      userId: c.userId,
      endpoint,
      p256dh,
      auth,
      userAgent: req.get("user-agent"),
    });
  }
  return res.status(existing ? 200 : 201).json({ success: true });
});
router.delete("/push/subscriptions", async (req, res) => {
  const c = await context(req);
  const endpoint = String(req.body?.endpoint ?? "");
  if (!endpoint)
    return res.status(400).json({ error: "endpoint is required" });
  await db.delete(pushSubscriptionsTable).where(
    and(
      eq(pushSubscriptionsTable.endpoint, endpoint),
      eq(pushSubscriptionsTable.organizationId, c.organizationId),
      eq(pushSubscriptionsTable.userId, c.userId),
    ),
  );
  return res.json({ success: true });
});
router.get("/", async (req, res) => {
  const c = await context(req),
    status = String(req.query.status ?? "unread").toLowerCase();
  const page = Math.max(1, Number(req.query.page) || 1),
    limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const base = and(
    eq(notificationsTable.organizationId, c.organizationId),
    eq(notificationsTable.recipientUserId, c.userId),
    eq(notificationsTable.isRead, status === "read"),
  );
  const total = await db.count(notificationsTable, base);
  const items = await db
    .select()
    .from(notificationsTable)
    .where(base)
    .orderBy(desc(notificationsTable.createdAt))
    .offset((page - 1) * limit)
    .limit(limit);
  res.json({
    items,
    page,
    limit,
    total,
    hasMore: page * limit < total,
  });
});
router.patch("/:id/read", async (req, res) => {
  const c = await context(req),
    id = Number(req.params.id);
  const [item] = await db
    .update(notificationsTable)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(notificationsTable.id, id),
        eq(notificationsTable.organizationId, c.organizationId),
        eq(notificationsTable.recipientUserId, c.userId),
      ),
    )
    .returning();
  if (!item) return res.status(404).json({ error: "Notification not found" });
  return res.json(item);
});
router.post("/read-all", async (req, res) => {
  const c = await context(req);
  await db
    .update(notificationsTable)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(notificationsTable.organizationId, c.organizationId),
        eq(notificationsTable.recipientUserId, c.userId),
        eq(notificationsTable.isRead, false),
      ),
    );
  res.json({ success: true, unreadCount: 0 });
});
export default router;
