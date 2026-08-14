import type { Request, Response, NextFunction } from "express";
import { db, eq, rolesTable, usersTable } from "@workspace/db";
import {
  allPermissionKeys,
  normalizeOverrides,
  normalizePermissions,
  normalizePermissionKey,
  buildPermissionKey,
} from "./permissionCatalog";

export type AuthUser = Record<string, any>;
const slug = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const userId = (req.session as any)?.userId;
  if (!userId) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, Number(userId)))
    .limit(1);
  if (
    !user ||
    user.isDeleted ||
    user.isActive === false ||
    Number((req.session as any)?.sessionVersion ?? 0) !==
      Number(user.sessionVersion ?? 0)
  )
    return null;
  return user;
}
export async function effectivePermissions(user: AuthUser): Promise<string[]> {
  const roles = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.organizationId, user.organizationId ?? 1));
  const userRole = slug(user.role);
  const role = roles.find(
    (item: any) =>
      item.isActive !== false &&
      (slug(item.name) === userRole || slug(item.slug) === userRole),
  );
  if (
    userRole === "admin" ||
    userRole === "super_admin" ||
    role?.isSuperAdmin ||
    role?.systemKey === "SUPER_ADMIN"
  )
    return ["*"];
  const base = new Set(normalizePermissions(role?.permissions));
  for (const override of normalizeOverrides(user.permissionOverrides))
    override.allowed
      ? base.add(override.permissionKey)
      : base.delete(override.permissionKey);
  return [...base].filter((key) => allPermissionKeys.includes(key)).sort();
}
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = normalizePermissionKey(permission) ?? permission;
    const user = await getAuthUser(req);
    if (!user)
      return res.status(401).json({ error: "Authentication required" });
    const permissions = await effectivePermissions(user);
    if (!permissions.includes("*") && !permissions.includes(key))
      return res.status(403).json({ error: "Access denied", permission: key });
    (req as any).authUser = user;
    return next();
  };
}
export function permissionSetHas(permissions: string[], permission: string) {
  const key = normalizePermissionKey(permission);
  return (
    Boolean(key) && (permissions.includes("*") || permissions.includes(key!))
  );
}
export function scopedPermissionSetHas(
  permissions: string[],
  moduleKey: string,
  submoduleKey: string | null | undefined,
  action: string,
) {
  const key = buildPermissionKey(moduleKey, submoduleKey, action);
  return Boolean(key) && permissionSetHas(permissions, key!);
}
export function resolveScopeFromPermissions(
  permissions: string[],
  moduleKey: string,
  submoduleKey?: string | null,
) {
  const canForOwn = scopedPermissionSetHas(
    permissions,
    moduleKey,
    submoduleKey,
    "for_own",
  );
  const canForOthers = scopedPermissionSetHas(
    permissions,
    moduleKey,
    submoduleKey,
    "for_others",
  );
  return {
    canForOwn,
    canForOthers,
    mode: canForOthers ? "all" : canForOwn ? "own" : "none",
  } as const;
}
export function permissionAction(req: Request): string {
  const path = req.path.toLowerCase();
  if (path.includes("download") || path.includes("/open")) return "download";
  if (path.includes("upload")) return "upload";
  if (path.includes("restore")) return "restore";
  if (path.includes("allocate") || path.includes("allocation")) return "assign";
  if (
    path.includes("/advance") ||
    path.includes("/initiate") ||
    path.includes("/qc")
  )
    return "approve";
  if (path.includes("export") || path.endsWith("-report")) return "export";
  if (path.includes("import")) return "import";
  const status = String((req.body as any)?.status ?? "").toLowerCase();
  if (
    path.includes("approve") ||
    ["approved", "complete", "completed"].includes(status)
  )
    return "approve";
  if (path.includes("reject") || status === "rejected") return "reject";
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS")
    return "view";
  if (req.method === "POST") return "create";
  if (req.method === "DELETE") return "delete";
  return "update";
}
export function requireModulePermission(
  resolveScope: string | ((req: Request) => string),
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const scope =
      typeof resolveScope === "function" ? resolveScope(req) : resolveScope;
    return requirePermission(`${scope}.${permissionAction(req)}`)(
      req,
      res,
      next,
    );
  };
}
export function organizationId(req: Request): number {
  return Number((req as any).authUser?.organizationId ?? 1);
}
