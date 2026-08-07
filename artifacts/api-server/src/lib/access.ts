import type { Request, Response, NextFunction } from "express";
import { db, eq, rolesTable, usersTable } from "@workspace/db";

export type AuthUser = Record<string, any>;

export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const userId = (req.session as any)?.userId;
  if (!userId) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, Number(userId)))
    .limit(1);
  if (!user || user.isDeleted || user.isActive === false) return null;
  return user;
}

function json<T>(value: unknown, fallback: T): T {
  try {
    return typeof value === "string"
      ? JSON.parse(value)
      : ((value as T) ?? fallback);
  } catch {
    return fallback;
  }
}

export async function effectivePermissions(user: AuthUser): Promise<string[]> {
  if (user.role === "admin") return ["*"];
  const roles = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.organizationId, user.organizationId ?? 1));
  const role = roles.find(
    (item: any) => item.isActive !== false && item.name === user.role,
  );
  const stored = json<any>(role?.permissions, []);
  const base = new Set<string>(Array.isArray(stored) ? stored : []);
  for (const override of json<any[]>(user.permissionOverrides, [])) {
    if (!override?.permissionKey) continue;
    override.allowed
      ? base.add(override.permissionKey)
      : base.delete(override.permissionKey);
  }
  return [...base];
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const permissions = await effectivePermissions(user);
    if (!permissions.includes("*") && !permissions.includes(permission))
      return res
        .status(403)
        .json({ error: `Missing permission: ${permission}` });
    (req as any).authUser = user;
    return next();
  };
}

export function organizationId(req: Request): number {
  return Number((req as any).authUser?.organizationId ?? 1);
}
