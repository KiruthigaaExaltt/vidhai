import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import router from "./routes";
import { logger } from "./lib/logger";
import { configuredCorsOrigins, corsOriginHandler } from "./lib/cors";
import { notificationEventMiddleware } from "./lib/notificationEvents";

const app: Express = express();
const production = process.env.NODE_ENV === "production";
const sessionCookieMaxAgeMs = Number(
  process.env.SESSION_COOKIE_MAX_AGE_MS ?? "604800000",
);
if (
  !Number.isSafeInteger(sessionCookieMaxAgeMs) ||
  sessionCookieMaxAgeMs <= 0
) {
  throw new Error("SESSION_COOKIE_MAX_AGE_MS must be a positive integer");
}
if (production && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required in production");
}
if (production) app.set("trust proxy", 1);
app.disable("etag");
const corsOrigins = configuredCorsOrigins();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: corsOriginHandler(corsOrigins),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET ?? "vidhai-dev-secret-2024",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: production,
    httpOnly: true,
    sameSite: "lax",
    maxAge: sessionCookieMaxAgeMs,
  },
});
app.use(sessionMiddleware);
app.use(notificationEventMiddleware);

app.use(
  "/api",
  (_req, res, next) => {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    next();
  },
  router,
);

// Express 5 forwards rejected async handlers here. Always send a response
// instead of letting an upstream request end with a reset connection.
app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    logger.error(
      { err: error, method: req.method, url: req.originalUrl.split("?")[0] },
      "Unhandled request error",
    );
    if (res.headersSent) return next(error);
    return res.status(500).json({ error: "Internal server error" });
  },
);

export default app;
