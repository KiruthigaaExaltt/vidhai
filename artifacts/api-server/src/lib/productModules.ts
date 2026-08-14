import type { NextFunction, Request, Response } from "express";
import {
  and,
  db,
  eq,
  moduleUnlockGrantsTable,
  productModuleAccessAuditTable,
  productModuleAccessTable,
} from "@workspace/db";
import { getAuthUser } from "./access";

export const PRODUCT_MODULES = [
  {
    key: "ledger",
    label: "Ledger",
    description:
      "Finance dashboard, ledgers, chart of accounts, payables, receivables, journals, and financial statements.",
    category: "Finance",
    permissionPrefixes: ["accounts"],
    defaultEnabled: true,
  },
] as const;
export type ProductModuleKey = (typeof PRODUCT_MODULES)[number]["key"];

export async function getModuleAccess(organizationId: number) {
  const rows = await db
    .select()
    .from(productModuleAccessTable)
    .where(eq(productModuleAccessTable.organizationId, organizationId));
  const byKey = new Map(rows.map((row: any) => [String(row.moduleKey), row]));
  return PRODUCT_MODULES.map((module) => ({
    ...module,
    enabled: Boolean(byKey.get(module.key)?.enabled ?? module.defaultEnabled),
    updatedAt: byKey.get(module.key)?.updatedAt ?? null,
  }));
}

export async function enabledModuleKeys(organizationId: number) {
  return (await getModuleAccess(organizationId))
    .filter((item) => item.enabled)
    .map((item) => item.key);
}

export async function isProductModuleEnabled(
  organizationId: number,
  moduleKey: ProductModuleKey,
) {
  return (await enabledModuleKeys(organizationId)).includes(moduleKey);
}

export async function setProductModuleEnabled(
  organizationId: number,
  moduleKey: ProductModuleKey,
  enabled: boolean,
  updatedBy: number,
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(productModuleAccessTable)
      .where(
        and(
          eq(productModuleAccessTable.organizationId, organizationId),
          eq(productModuleAccessTable.moduleKey, moduleKey),
        ),
      )
      .limit(1);
    const previousEnabled = Boolean(existing?.enabled ?? true);
    const data = {
      organizationId,
      moduleKey,
      enabled,
      updatedBy,
      updatedAt: new Date(),
    };
    if (existing) {
      await tx
        .update(productModuleAccessTable)
        .set(data)
        .where(eq(productModuleAccessTable.id, existing.id));
    } else {
      await tx.insert(productModuleAccessTable).values(data);
    }
    if (previousEnabled !== enabled) {
      await tx.insert(productModuleAccessAuditTable).values({
        organizationId,
        moduleKey,
        previousEnabled,
        enabled,
        changedBy: updatedBy,
      });
    }
    if (!enabled) {
      await tx
        .update(moduleUnlockGrantsTable)
        .set({
          revokedAt: new Date(),
          revokedReason: "module_disabled",
        })
        .where(
          and(
            eq(moduleUnlockGrantsTable.organizationId, organizationId),
            eq(moduleUnlockGrantsTable.moduleKey, moduleKey),
          ),
        );
    }
  });
}

export function filterPermissionCatalogForModules<T extends { key: string }>(
  catalog: T[],
  enabledKeys: string[],
) {
  const enabled = new Set(enabledKeys);
  return catalog.filter(
    (row) => !row.key.startsWith("accounts.") || enabled.has("ledger"),
  );
}

export function filterPermissionsForModules(
  permissions: string[],
  enabledKeys: string[],
) {
  if (permissions.includes("*")) return permissions;
  const enabled = new Set(enabledKeys);
  return permissions.filter(
    (key) => !key.startsWith("accounts.") || enabled.has("ledger"),
  );
}

export function requireProductModule(moduleKey: ProductModuleKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).authUser ?? (await getAuthUser(req));
    if (!user)
      return res.status(401).json({ error: "Authentication required" });
    if (
      !(await isProductModuleEnabled(
        Number(user.organizationId ?? 1),
        moduleKey,
      ))
    ) {
      return res.status(404).json({ error: "Not found" });
    }
    (req as any).authUser = user;
    return next();
  };
}
