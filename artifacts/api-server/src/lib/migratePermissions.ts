import { db, eq, rolesTable, usersTable } from "@workspace/db";
import { normalizeOverrides, normalizePermissions } from "./permissionCatalog";

const parse = (value: unknown) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};
const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
export async function migratePermissionData() {
  const roles = await db.select().from(rolesTable);
  let migratedRoles = 0;
  for (const role of roles) {
    const before = parse(role.permissions);
    const after = normalizePermissions(before);
    if (!same(before, after)) {
      await db
        .update(rolesTable)
        .set({ permissions: JSON.stringify(after), updatedAt: new Date() })
        .where(eq(rolesTable.id, role.id));
      migratedRoles += 1;
    }
  }
  const users = await db.select().from(usersTable);
  let migratedUsers = 0;
  for (const user of users) {
    const before = parse(user.permissionOverrides);
    const after = normalizeOverrides(before);
    if (!same(before, after)) {
      await db
        .update(usersTable)
        .set({
          permissionOverrides: JSON.stringify(after),
          sessionVersion: Number(user.sessionVersion ?? 0) + 1,
        })
        .where(eq(usersTable.id, user.id));
      migratedUsers += 1;
    }
  }
  return { migratedRoles, migratedUsers };
}
