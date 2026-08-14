import type { Server as HttpServer } from "node:http";
import type { RequestHandler } from "express";
import { Server } from "socket.io";
import { db, eq, usersTable } from "@workspace/db";
import { configuredCorsOrigins, corsOriginHandler } from "./cors";
import { logger } from "./logger";

let io: Server | null = null;

export function initializeNotificationGateway(
  server: HttpServer,
  sessionMiddleware: RequestHandler,
) {
  io = new Server(server, {
    path: "/api/socket.io",
    cors: { origin: configuredCorsOrigins(), credentials: true },
  });
  io.engine.use(sessionMiddleware);
  io.use(async (socket, next) => {
    try {
      const session = (socket.request as any).session;
      const userId = Number(session?.userId);
      if (!userId) return next(new Error("Authentication required"));
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (
        !user ||
        user.isDeleted ||
        user.isActive === false ||
        Number(user.sessionVersion ?? 0) !== Number(session.sessionVersion ?? 0)
      )
        return next(new Error("Authentication required"));
      socket.data.user = user;
      return next();
    } catch (error) {
      return next(error as Error);
    }
  });
  io.on("connection", (socket) => {
    const user = socket.data.user;
    socket.join(`org:${user.organizationId}:user:${user.id}`);
  });
  logger.info("Authenticated notification Socket.IO gateway ready");
}

export function emitNotification(notification: any) {
  if (!io) return;
  io.to(
    `org:${notification.organizationId}:user:${notification.recipientUserId}`,
  ).emit("notification:new", notification);
}
