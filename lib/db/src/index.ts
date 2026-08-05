import { connectMongo } from "./query";
import { createDatabase, eq, type Database } from "./query";
import { createHash } from "node:crypto";
import { usersTable } from "./schema/users";
await connectMongo();
export const db: Database = createDatabase();

async function bootstrapAdmin() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!username || !password) return;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (existing) return;

  const passwordHash = createHash("sha256")
    .update(password + "vidhai-salt-2024")
    .digest("hex");

  try {
    await db.insert(usersTable).values({
      username,
      passwordHash,
      displayName: process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME || "Administrator",
      role: "admin",
      locationScope: JSON.stringify(["cross_site"]),
    });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
  }
}

await bootstrapAdmin();
export { connectMongo, eq, and, gte, lte, ilike, inArray, isNull, asc, desc } from "./query";
export * from "./schema";
