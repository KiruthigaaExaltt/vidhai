import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, db, eq, refreshSessionsTable, usersTable } from "@workspace/db";

type TokenType = "access" | "refresh";
type Claims = {
  sub: string;
  type: TokenType;
  sv: number;
  sid?: string;
  iat: number;
  exp: number;
};
const COOKIE = "refreshToken";
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const durationSeconds = (value: string) => {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!match) throw new Error(`Invalid JWT expiry: ${value}`);
  return Number(match[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[match[2]]!;
};
const encode = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const secret = (type: TokenType) =>
  required(type === "access" ? "JWT_ACCESS_SECRET" : "JWT_REFRESH_SECRET");
const sign = (
  type: TokenType,
  sub: number,
  sv: number,
  sid?: string,
  lifetime?: number,
) => {
  const now = Math.floor(Date.now() / 1000);
  const seconds =
    lifetime ??
    durationSeconds(
      required(type === "access" ? "JWT_ACCESS_EXPIRY" : "JWT_REFRESH_EXPIRY"),
    );
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: String(sub),
    type,
    sv,
    ...(sid ? { sid } : {}),
    iat: now,
    exp: now + seconds,
  });
  const signature = createHmac("sha256", secret(type))
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
};
const verify = (token: string, type: TokenType): Claims => {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid token");
  const expected = createHmac("sha256", secret(type))
    .update(`${parts[0]}.${parts[1]}`)
    .digest();
  const actual = Buffer.from(parts[2], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("invalid token");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  const claims = JSON.parse(
    Buffer.from(parts[1], "base64url").toString(),
  ) as Claims;
  if (
    header.alg !== "HS256" ||
    claims.type !== type ||
    !claims.sub ||
    claims.exp <= Date.now() / 1000
  )
    throw new Error("invalid token");
  return claims;
};
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const cookieMaxAge = () => Number(required("JWT_REFRESH_COOKIE_MAX_AGE_MS"));
const assertRefreshExpiryConfiguration = () => {
  if (durationSeconds(required("JWT_REFRESH_EXPIRY")) * 1000 !== cookieMaxAge())
    throw new Error(
      "JWT_REFRESH_EXPIRY and JWT_REFRESH_COOKIE_MAX_AGE_MS must match",
    );
};
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: (process.env.JWT_COOKIE_SAME_SITE ?? "lax") as
    | "lax"
    | "strict"
    | "none",
  maxAge: cookieMaxAge(),
  path: "/api/auth",
});
export const clearRefreshCookie = (res: Response) =>
  res.clearCookie(COOKIE, cookieOptions());
export const accessToken = (user: any) =>
  sign("access", user.id, Number(user.sessionVersion ?? 0));
export async function createRefreshSession(
  req: Request,
  res: Response,
  user: any,
  absoluteExpiresAt?: Date,
) {
  assertRefreshExpiryConfiguration();
  const maxExpiry = absoluteExpiresAt ?? new Date(Date.now() + cookieMaxAge());
  const remaining = Math.max(
    1,
    Math.floor((maxExpiry.getTime() - Date.now()) / 1000),
  );
  const sid = randomUUID();
  const token = sign(
    "refresh",
    user.id,
    Number(user.sessionVersion ?? 0),
    sid,
    remaining,
  );
  await db.insert(refreshSessionsTable).values({
    userId: user.id,
    tokenHash: tokenHash(token),
    sessionVersion: Number(user.sessionVersion ?? 0),
    expiresAt: maxExpiry,
    userAgent: req.get("user-agent") ?? null,
    ipAddress: req.ip ?? null,
  });
  res.cookie(COOKIE, token, {
    ...cookieOptions(),
    maxAge: Math.min(cookieMaxAge(), maxExpiry.getTime() - Date.now()),
  });
  return token;
}
export async function rotateRefreshSession(req: Request, res: Response) {
  const token = req.cookies?.[COOKIE];
  if (!token) throw new Error("unauthorized");
  const claims = verify(token, "refresh");
  const [session] = await db
    .select()
    .from(refreshSessionsTable)
    .where(
      and(
        eq(refreshSessionsTable.tokenHash, tokenHash(token)),
        eq(refreshSessionsTable.userId, Number(claims.sub)),
      ),
    )
    .limit(1);
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now()
  )
    throw new Error("unauthorized");
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, Number(claims.sub)))
    .limit(1);
  if (
    !user ||
    user.isDeleted ||
    user.isActive === false ||
    Number(user.sessionVersion ?? 0) !== claims.sv
  )
    throw new Error("unauthorized");
  await db
    .update(refreshSessionsTable)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(refreshSessionsTable.id, session.id));
  await createRefreshSession(req, res, user, session.expiresAt);
  (req.session as any).userId = user.id;
  (req.session as any).sessionVersion = user.sessionVersion ?? 0;
  return { user, accessToken: accessToken(user) };
}
export async function revokeCurrentRefresh(req: Request) {
  const token = req.cookies?.[COOKIE];
  if (!token) return;
  await db
    .update(refreshSessionsTable)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(refreshSessionsTable.tokenHash, tokenHash(token)));
}
export async function revokeUserRefreshSessions(userId: number) {
  await db
    .update(refreshSessionsTable)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(refreshSessionsTable.userId, userId));
}
export async function authenticateAccessToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const match = /^Bearer (.+)$/i.exec(req.get("authorization") ?? "");
    if (!match) throw new Error("unauthorized");
    const claims = verify(match[1], "access");
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(claims.sub)))
      .limit(1);
    if (
      !user ||
      user.isDeleted ||
      user.isActive === false ||
      Number(user.sessionVersion ?? 0) !== claims.sv
    )
      throw new Error("unauthorized");
    (req.session as any).userId = Number(claims.sub);
    (req.session as any).sessionVersion = claims.sv;
    (req as any).authTokenClaims = claims;
    (req as any).authUser = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Not authenticated" });
  }
}
