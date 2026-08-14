import { Router } from "express";
import { effectivePermissions, getAuthUser } from "../lib/access";
import {
  activeGrant,
  encryptedModuleIsEnabled,
  ENCRYPTED_MODULES,
  getModuleEncryptionSetting,
  isEncryptedModuleKey,
  isRateLimited,
  lockCurrentGrant,
  updateModulePassword,
  userCanViewEncryptedModule,
  validateModulePassword,
  verifyAndUnlock,
} from "../lib/moduleEncryption";

const router = Router();

async function authenticated(req: any, res: any) {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return user;
}

async function hasSettingPermission(user: any, permission: string) {
  const permissions = await effectivePermissions(user);
  return permissions.includes("*") || permissions.includes(permission);
}

router.get("/settings/module-encryption", async (req, res) => {
  const user = await authenticated(req, res);
  if (!user) return;
  if (!(await hasSettingPermission(user, "settings.module_encryption.view"))) {
    return res
      .status(403)
      .json({
        error: "Access denied",
        permission: "settings.module_encryption.view",
      });
  }
  const organizationId = Number(user.organizationId ?? 1);
  const modules = [];
  for (const definition of Object.values(ENCRYPTED_MODULES)) {
    const enabled = await encryptedModuleIsEnabled(
      organizationId,
      definition.key,
    );
    if (!enabled) continue;
    const setting = await getModuleEncryptionSetting(
      organizationId,
      definition.key,
    );
    modules.push({
      module: definition.key,
      label: definition.label,
      passwordLength: definition.passwordLength,
      configured: Boolean(setting?.passwordHash),
      enabled,
      passwordUpdatedAt: setting?.passwordUpdatedAt ?? null,
    });
  }
  return res.json({ modules });
});

router.put("/settings/module-encryption", async (req, res) => {
  const user = await authenticated(req, res);
  if (!user) return;
  if (
    !(await hasSettingPermission(
      user,
      "settings.module_encryption.manage_settings",
    ))
  ) {
    return res
      .status(403)
      .json({
        error: "Access denied",
        permission: "settings.module_encryption.manage_settings",
      });
  }
  if (!isEncryptedModuleKey(req.body?.module)) {
    return res.status(400).json({ error: "Invalid encrypted module" });
  }
  const moduleKey = req.body.module;
  if (
    !(await encryptedModuleIsEnabled(
      Number(user.organizationId ?? 1),
      moduleKey,
    ))
  ) {
    return res.status(404).json({ error: "Not found" });
  }
  const password = validateModulePassword(req.body?.password);
  if (!password) {
    return res
      .status(400)
      .json({
        error:
          "Password must contain exactly 6 characters and cannot be only whitespace",
      });
  }
  if (
    req.body?.confirmPassword !== undefined &&
    req.body.confirmPassword !== password
  ) {
    return res.status(400).json({ error: "Passwords do not match" });
  }
  await updateModulePassword(req, user, moduleKey, password);
  return res.json({ success: true, module: moduleKey });
});

router.post("/module-encryption/verify", async (req, res) => {
  const user = await authenticated(req, res);
  if (!user) return;
  if (!isEncryptedModuleKey(req.body?.module)) {
    return res.status(400).json({ error: "Invalid encrypted module" });
  }
  const moduleKey = req.body.module;
  const organizationId = Number(user.organizationId ?? 1);
  if (!(await encryptedModuleIsEnabled(organizationId, moduleKey))) {
    return res.status(404).json({ error: "Not found" });
  }
  if (!(await userCanViewEncryptedModule(user, moduleKey))) {
    return res.status(403).json({ error: "Access denied" });
  }
  const password = validateModulePassword(req.body?.password);
  if (!password) {
    return res
      .status(400)
      .json({ error: "Password must contain exactly 6 characters" });
  }
  if (await isRateLimited(req, user, moduleKey)) {
    return res
      .status(429)
      .json({ error: "Too many verification attempts. Try again later." });
  }
  const result = await verifyAndUnlock(req, user, moduleKey, password);
  if (!result.success) {
    if (result.rateLimited) {
      return res
        .status(429)
        .json({ error: "Too many verification attempts. Try again later." });
    }
    return res.status(401).json({ error: "Invalid module password" });
  }
  return res.json({
    success: true,
    module: moduleKey,
    expiresAt: result.expiresAt,
  });
});

router.get("/module-encryption/status/:module", async (req, res) => {
  const user = await authenticated(req, res);
  if (!user) return;
  if (!isEncryptedModuleKey(req.params.module)) {
    return res.status(400).json({ error: "Invalid encrypted module" });
  }
  const moduleKey = req.params.module;
  if (
    !(await encryptedModuleIsEnabled(
      Number(user.organizationId ?? 1),
      moduleKey,
    ))
  ) {
    return res.status(404).json({ error: "Not found" });
  }
  if (!(await userCanViewEncryptedModule(user, moduleKey))) {
    return res.status(403).json({ error: "Access denied" });
  }
  const setting = await getModuleEncryptionSetting(
    Number(user.organizationId ?? 1),
    moduleKey,
  );
  const grant = await activeGrant(req, user, moduleKey);
  return res.json({
    module: moduleKey,
    unlocked: Boolean(grant),
    configured: Boolean(setting?.passwordHash),
    ...(grant ? { expiresAt: grant.expiresAt } : {}),
  });
});

router.post("/module-encryption/lock", async (req, res) => {
  const user = await authenticated(req, res);
  if (!user) return;
  if (!isEncryptedModuleKey(req.body?.module)) {
    return res.status(400).json({ error: "Invalid encrypted module" });
  }
  await lockCurrentGrant(req, user, req.body.module);
  return res.json({ success: true, module: req.body.module, unlocked: false });
});

export default router;
