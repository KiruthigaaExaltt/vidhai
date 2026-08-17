import { Router } from "express";
import {
  effectivePermissions,
  getAuthUser,
  requirePermission,
} from "../lib/access";
import { permissionCatalog } from "../lib/permissionCatalog";
import {
  enabledModuleKeys,
  filterPermissionCatalogForModules,
  filterPermissionsForModules,
} from "../lib/productModules";

const router = Router();
router.get("/permissions/me", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const result = await effectivePermissions(user);
  const enabledKeys = await enabledModuleKeys(Number(user.organizationId ?? 1));
  return res.json({
    userId: user.id,
    role: user.role,
    isSuperAdmin: result.includes("*"),
    permissions: result.includes("*")
      ? ["*"]
      : filterPermissionsForModules(result, enabledKeys),
    catalog: filterPermissionCatalogForModules(permissionCatalog, enabledKeys),
    enabledModuleKeys: enabledKeys,
  });
});
router.get(
  "/settings/permissions/catalog",
  requirePermission("settings.user_management.view"),
  async (req, res) => {
    const user = (req as any).authUser;
    const enabledKeys = await enabledModuleKeys(
      Number(user.organizationId ?? 1),
    );
    return res.json(
      filterPermissionCatalogForModules(permissionCatalog, enabledKeys),
    );
  },
);
export default router;
export { permissionCatalog };
