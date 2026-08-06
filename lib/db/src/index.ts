import { connectMongo } from "./query";
import { createDatabase, eq, type Database } from "./query";
import { createHash } from "node:crypto";
import { usersTable } from "./schema/users";
await connectMongo();
export const db: Database = createDatabase();

async function bootstrapAdmin() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const displayName = process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME?.trim() || "Administrator";

  if (!username || !password) {
    throw new Error(
      "BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD must be set",
    );
  }

  const passwordHash = createHash("sha256")
    .update(password + "vidhai-salt-2024")
    .digest("hex");

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);

  // The bootstrap account is controlled by the active runtime environment.
  // Synchronizing it on startup means a staging/production credential change
  // takes effect after a restart even when the database already has the user.
  if (existing) {
    const passwordChanged = existing.passwordHash !== passwordHash;
    await db.update(usersTable).set({
      passwordHash,
      displayName,
      role: "admin",
      locationScope: JSON.stringify(["cross_site"]),
      isSystemGenerated: true,
      isDeleted: false,
      sessionVersion: passwordChanged
        ? Number(existing.sessionVersion ?? 0) + 1
        : Number(existing.sessionVersion ?? 0),
    }).where(eq(usersTable.id, existing.id));
    return;
  }

  try {
    await db.insert(usersTable).values({
      username,
      passwordHash,
      displayName,
      role: "admin",
      locationScope: JSON.stringify(["cross_site"]),
      isSystemGenerated: true,
      isDeleted: false,
    });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
  }
}

await bootstrapAdmin();
export { connectMongo, eq, and, gte, lte, ilike, inArray, isNull, asc, desc } from "./query";
export * from "./schema";
