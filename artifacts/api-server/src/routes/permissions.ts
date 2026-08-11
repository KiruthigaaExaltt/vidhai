import { Router } from "express";
import {
  effectivePermissions,
  getAuthUser,
  requirePermission,
} from "../lib/access";
import { permissionCatalog } from "../lib/permissionCatalog";

const router = Router();
router.get("/permissions/me", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const result = await effectivePermissions(user);
  return res.json({
    userId: user.id,
    role: user.role,
    isSuperAdmin: result.includes("*"),
    permissions: result.includes("*") ? ["*"] : result,
    catalog: permissionCatalog,
  });
});
router.get(
  "/settings/permissions/catalog",
  requirePermission("settings.user_management.view"),
  (_req, res) => res.json(permissionCatalog),
);
export default router;
export { permissionCatalog };
