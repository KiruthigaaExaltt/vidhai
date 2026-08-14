import { Router } from "express";
import { effectivePermissions, getAuthUser } from "../lib/access";
import {
  enabledModuleKeys,
  getModuleAccess,
  PRODUCT_MODULES,
  setProductModuleEnabled,
  type ProductModuleKey,
} from "../lib/productModules";

const router = Router();
async function context(req: any, res: any) {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const permissions = await effectivePermissions(user);
  if (!permissions.includes("*")) {
    res.status(404).json({ error: "Settings page not found" });
    return null;
  }
  return { user, organizationId: Number(user.organizationId ?? 1) };
}

router.get("/settings/module-access", async (req, res) => {
  const auth = await context(req, res);
  if (!auth) return;
  return res.json({
    modules: await getModuleAccess(auth.organizationId),
    enabledModuleKeys: await enabledModuleKeys(auth.organizationId),
  });
});

router.put("/settings/module-access/:moduleKey", async (req, res) => {
  const auth = await context(req, res);
  if (!auth) return;
  const moduleKey = String(req.params.moduleKey) as ProductModuleKey;
  if (!PRODUCT_MODULES.some((module) => module.key === moduleKey)) {
    return res.status(404).json({ error: "Module not found" });
  }
  if (typeof req.body?.enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be a boolean" });
  }
  await setProductModuleEnabled(
    auth.organizationId,
    moduleKey,
    req.body.enabled,
    Number(auth.user.id),
  );
  return res.json({
    modules: await getModuleAccess(auth.organizationId),
    enabledModuleKeys: await enabledModuleKeys(auth.organizationId),
  });
});

export default router;
