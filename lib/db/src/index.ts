import { connectMongo } from "./query";
import { createDatabase, eq, type Database } from "./query";
import bcrypt from "bcryptjs";
import { usersTable } from "./schema/users";
await connectMongo();
export const db: Database = createDatabase();

async function bootstrapAdmin() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const displayName =
    process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME?.trim() || "Administrator";

  if (!username || !password) {
    throw new Error(
      "BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD must be set",
    );
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  // The bootstrap account is controlled by the active runtime environment.
  // Synchronizing it on startup means a staging/production credential change
  // takes effect after a restart even when the database already has the user.
  if (existing) {
    const passwordChanged = !(await bcrypt.compare(
      password,
      existing.passwordHash,
    ));
    const passwordHash = passwordChanged
      ? await bcrypt.hash(password, 10)
      : existing.passwordHash;
    await db
      .update(usersTable)
      .set({
        passwordHash,
        displayName,
        role: "super_admin",
        systemKey: "SUPER_ADMIN",
        locationScope: JSON.stringify(["cross_site"]),
        isSystemGenerated: true,
        isDeleted: false,
        sessionVersion: passwordChanged
          ? Number(existing.sessionVersion ?? 0) + 1
          : Number(existing.sessionVersion ?? 0),
      })
      .where(eq(usersTable.id, existing.id));
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(usersTable).values({
      username,
      passwordHash,
      displayName,
      role: "super_admin",
      systemKey: "SUPER_ADMIN",
      locationScope: JSON.stringify(["cross_site"]),
      isSystemGenerated: true,
      isDeleted: false,
    });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
  }
}

await bootstrapAdmin();
export {
  connectMongo,
  modelFor,
  syncTableIndexes,
  syncTableCustomIndexes,
  eq,
  and,
  or,
  gte,
  lte,
  ilike,
  inArray,
  isNull,
  asc,
  desc,
} from "./query";
export * from "./schema";
