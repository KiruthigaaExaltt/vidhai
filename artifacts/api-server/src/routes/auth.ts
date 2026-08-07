import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "@workspace/db";
import { logger } from "../lib/logger";
import { verifyPassword, hashPassword } from "../lib/password";

const router = Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body as {
    username: string;
    password: string;
  };
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
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
    !verifyPassword(password, user.passwordHash)
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

router.post("/logout", (req, res) => {
  req.session.destroy(() => {});
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

export function hashPasswordExport(pw: string) {
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
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export default router;
