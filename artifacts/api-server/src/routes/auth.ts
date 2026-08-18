import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "@workspace/db";
import { logger } from "../lib/logger";
import { verifyPassword, hashPassword } from "../lib/password";
import { revokeSessionGrants } from "../lib/moduleEncryption";
import {
  createLoginKeyPair,
  decryptLoginPassword,
} from "../lib/loginEncryption";

const router = Router();
const loginKeys = createLoginKeyPair();

router.get("/login-key", (_req, res) => {
  res.set("Cache-Control", "no-store");
  return res.json({ publicKey: loginKeys.publicKey });
});

router.post("/login", async (req, res) => {
  const {
    username,
    password: encryptedPassword,
    passwordEncoding,
  } = req.body as {
    username: string;
    password: string;
    passwordEncoding?: string;
  };
  if (!username || !encryptedPassword) {
    return res.status(400).json({ error: "username and password required" });
  }
  if (passwordEncoding !== "rsa-oaep-256") {
    return res
      .status(400)
      .json({ error: "RSA-OAEP password encryption required" });
  }
  let password: string;
  try {
    password = decryptLoginPassword(encryptedPassword, loginKeys.privateKey);
  } catch {
    return res.status(400).json({ error: "Invalid encrypted credential" });
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);
  if (
    !user ||
    user.isDeleted ||
    user.isActive === false ||
    !(await verifyPassword(password, user.passwordHash))
  ) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  (req.session as any).userId = user.id;
  (req.session as any).sessionVersion = user.sessionVersion ?? 0;
  await db
    .update(usersTable)
    .set({ lastLogin: new Date() })
    .where(eq(usersTable.id, user.id));
  const { passwordHash: _ph, ...safeUser } = user;
  return res.json({
    user: {
      ...safeUser,
      locationScope: JSON.parse(user.locationScope ?? "[]"),
    },
  });
});

router.post("/logout", async (req, res) => {
  try {
    await revokeSessionGrants(req.sessionID);
  } finally {
    req.session.destroy(() => {});
  }
  res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (
    !user ||
    user.isDeleted ||
    user.isActive === false ||
    Number((req.session as any).sessionVersion ?? 0) !==
      Number(user.sessionVersion ?? 0)
  )
    return res.status(401).json({ error: "Not authenticated" });
  const { passwordHash: _ph, ...safeUser } = user;
  return res.json({
    ...safeUser,
    locationScope: JSON.parse(user.locationScope ?? "[]"),
  });
});

export async function hashPasswordExport(pw: string) {
  return hashPassword(pw);
}

/** Express middleware — passes if request has a valid session, else 401. */
export function requireAuth(req: any, res: any, next: any) {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

/** Express middleware — passes if the session user has role === 'admin', else 403. */
export async function requireAdmin(req: any, res: any, next: any) {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  const [user] = await db
    .select({ role: usersTable.role, systemKey: usersTable.systemKey })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (
    !user ||
    !(
      user.systemKey === "SUPER_ADMIN" ||
      String(user.role).trim().toLowerCase() === "super_admin"
    )
  ) {
    return res.status(403).json({ error: "SuperAdmin access required" });
  }
  next();
}

export default router;
