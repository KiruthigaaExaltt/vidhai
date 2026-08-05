import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "@workspace/db";
import { createHash } from "crypto";

const router = Router();

function hashPassword(pw: string) {
  return createHash("sha256").update(pw + "vidhai-salt-2024").digest("hex");
}

router.get("/", async (req, res) => {
  const users = await db.select().from(usersTable);
  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      locationScope: JSON.parse(u.locationScope ?? "[]"),
      createdAt: u.createdAt,
    }))
  );
});

router.post("/", async (req, res) => {
  const { username, password, displayName, role, locationScope } = req.body;
  const [user] = await db
    .insert(usersTable)
    .values({
      username,
      passwordHash: hashPassword(password),
      displayName,
      role: role ?? "operator",
      locationScope: JSON.stringify(locationScope ?? []),
    })
    .returning();
  const { passwordHash: _ph, ...safe } = user;
  res.status(201).json({ ...safe, locationScope: JSON.parse(user.locationScope ?? "[]") });
});

router.get("/:id", async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, Number(req.params.id)));
  if (!user) return res.status(404).json({ error: "Not found" });
  const { passwordHash: _ph, ...safe } = user;
  return res.json({ ...safe, locationScope: JSON.parse(user.locationScope ?? "[]") });
});

router.patch("/:id", async (req, res) => {
  const { displayName, role, locationScope, password } = req.body;
  const updates: Record<string, unknown> = {};
  if (displayName !== undefined) updates.displayName = displayName;
  if (role !== undefined) updates.role = role;
  if (locationScope !== undefined) updates.locationScope = JSON.stringify(locationScope);
  if (password !== undefined) updates.passwordHash = hashPassword(password);
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, Number(req.params.id))).returning();
  if (!user) return res.status(404).json({ error: "Not found" });
  const { passwordHash: _ph, ...safe } = user;
  return res.json({ ...safe, locationScope: JSON.parse(user.locationScope ?? "[]") });
});

router.delete("/:id", async (req, res) => {
  await db.delete(usersTable).where(eq(usersTable.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;
