import { compare, hash } from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import {
  and,
  db,
  eq,
  moduleEncryptionAttemptsTable,
  moduleEncryptionAuditTable,
  moduleEncryptionSettingsTable,
  moduleUnlockGrantsTable,
} from "@workspace/db";
import { effectivePermissions, getAuthUser } from "./access";
import { moduleViewKeys } from "./permissionCatalog";
import { isProductModuleEnabled } from "./productModules";

export const ENCRYPTED_MODULES = {
  ledger: {
    key: "ledger",
    label: "Ledger",
    passwordLength: 6,
    permissionPrefix: "accounts",
  },
  contracta: {
    key: "contracta",
    label: "Contracta",
    passwordLength: 6,
    permissionPrefix: "contracta",
  },
} as const;
export type EncryptedModuleKey = keyof typeof ENCRYPTED_MODULES;

const INACTIVITY_MS = 15 * 60 * 1000;
const ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const SALT_ROUNDS = 10;
const DUMMY_PASSWORD_HASH =
  "$2b$10$dL0MKDo4rgVLQU.sxptkI.nwQqr4IYGLkSFxSlN0r18TP7Gv7I59O";

export function isEncryptedModuleKey(
  value: unknown,
): value is EncryptedModuleKey {
  return value === "ledger" || value === "contracta";
}

export function validateModulePassword(value: unknown): string | null {
  return typeof value === "string" &&
    value.length === 6 &&
    value.trim().length > 0
    ? value
    : null;
}

const fingerprint = (value: unknown) =>
  createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex");

function requestContext(req: Request) {
  return {
    sessionId: req.sessionID,
    ipHash: fingerprint(req.ip),
    userAgentHash: fingerprint(req.get("user-agent")),
  };
}

async function audit(
  req: Request,
  user: Record<string, any>,
  moduleKey: EncryptedModuleKey,
  actionType: "UPDATE" | "LOGIN" | "LOGIN_FAILED" | "LOCK",
  description: string,
  redactedValues: Record<string, unknown> = {},
  database = db,
) {
  const context = requestContext(req);
  await database.insert(moduleEncryptionAuditTable).values({
    organizationId: Number(user.organizationId ?? 1),
    userId: Number(user.id),
    actorName: String(user.displayName || user.name || user.username || "User"),
    moduleKey,
    actionType,
    description,
    redactedValues: JSON.stringify(redactedValues),
    authenticationSessionId: context.sessionId,
    ipHash: context.ipHash,
    userAgentHash: context.userAgentHash,
  });
}

export async function getModuleEncryptionSetting(
  organizationId: number,
  moduleKey: EncryptedModuleKey,
  database = db,
) {
  const [setting] = await database
    .select()
    .from(moduleEncryptionSettingsTable)
    .where(
      and(
        eq(moduleEncryptionSettingsTable.organizationId, organizationId),
        eq(moduleEncryptionSettingsTable.moduleKey, moduleKey),
      ),
    )
    .limit(1);
  return setting ?? null;
}

export async function encryptedModuleIsEnabled(
  organizationId: number,
  moduleKey: EncryptedModuleKey,
) {
  return moduleKey === "ledger"
    ? isProductModuleEnabled(organizationId, "ledger")
    : false;
}

export async function userCanViewEncryptedModule(
  user: Record<string, any>,
  moduleKey: EncryptedModuleKey,
) {
  const permissions = await effectivePermissions(user);
  if (permissions.includes("*")) return true;
  return moduleViewKeys(ENCRYPTED_MODULES[moduleKey].permissionPrefix).some(
    (key) => permissions.includes(key),
  );
}

export async function revokeModuleGrants(
  organizationId: number,
  moduleKey: EncryptedModuleKey,
  reason: string,
  database = db,
) {
  await database
    .update(moduleUnlockGrantsTable)
    .set({
      revokedAt: new Date(),
      revokedReason: reason,
    })
    .where(
      and(
        eq(moduleUnlockGrantsTable.organizationId, organizationId),
        eq(moduleUnlockGrantsTable.moduleKey, moduleKey),
      ),
    );
}

export async function revokeSessionGrants(
  sessionId: string,
  reason = "logout",
) {
  if (!sessionId) return;
  await db
    .update(moduleUnlockGrantsTable)
    .set({
      revokedAt: new Date(),
      revokedReason: reason,
    })
    .where(eq(moduleUnlockGrantsTable.authenticationSessionId, sessionId));
}

export async function updateModulePassword(
  req: Request,
  user: Record<string, any>,
  moduleKey: EncryptedModuleKey,
  password: string,
) {
  const organizationId = Number(user.organizationId ?? 1);
  const passwordHash = await hash(password, SALT_ROUNDS);
  const now = new Date();
  return db.transaction(async (tx) => {
    const existing = await getModuleEncryptionSetting(
      organizationId,
      moduleKey,
      tx,
    );
    const passwordVersion = Number(existing?.passwordVersion ?? 0) + 1;
    const data = {
      organizationId,
      moduleKey,
      passwordHash,
      passwordVersion,
      passwordUpdatedAt: now,
      updatedBy: Number(user.id),
      updatedAt: now,
    };
    if (existing) {
      await tx
        .update(moduleEncryptionSettingsTable)
        .set(data)
        .where(eq(moduleEncryptionSettingsTable.id, existing.id));
    } else {
      await tx.insert(moduleEncryptionSettingsTable).values(data);
    }
    await revokeModuleGrants(organizationId, moduleKey, "password_changed", tx);
    const actor = String(user.displayName || user.username || "User");
    await audit(
      req,
      user,
      moduleKey,
      "UPDATE",
      `${actor} updated ${ENCRYPTED_MODULES[moduleKey].label} module encryption password`,
      {
        oldValues: {
          module: ENCRYPTED_MODULES[moduleKey].label,
          password: "[redacted]",
        },
        newValues: {
          module: ENCRYPTED_MODULES[moduleKey].label,
          password: "[redacted]",
        },
      },
      tx,
    );
    return passwordVersion;
  });
}

async function attemptRow(
  organizationId: number,
  userId: number,
  sessionId: string,
  moduleKey: EncryptedModuleKey,
  ipHash: string,
) {
  const [row] = await db
    .select()
    .from(moduleEncryptionAttemptsTable)
    .where(
      and(
        eq(moduleEncryptionAttemptsTable.organizationId, organizationId),
        eq(moduleEncryptionAttemptsTable.userId, userId),
        eq(moduleEncryptionAttemptsTable.authenticationSessionId, sessionId),
        eq(moduleEncryptionAttemptsTable.moduleKey, moduleKey),
        eq(moduleEncryptionAttemptsTable.ipHash, ipHash),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function isRateLimited(
  req: Request,
  user: Record<string, any>,
  moduleKey: EncryptedModuleKey,
) {
  const context = requestContext(req);
  const row = await attemptRow(
    Number(user.organizationId ?? 1),
    Number(user.id),
    context.sessionId,
    moduleKey,
    context.ipHash,
  );
  return Boolean(row?.lockedUntil && new Date(row.lockedUntil) > new Date());
}

export async function recordFailedAttempt(
  req: Request,
  user: Record<string, any>,
  moduleKey: EncryptedModuleKey,
) {
  const organizationId = Number(user.organizationId ?? 1);
  const userId = Number(user.id);
  const context = requestContext(req);
  const now = new Date();
  const existing = await attemptRow(
    organizationId,
    userId,
    context.sessionId,
    moduleKey,
    context.ipHash,
  );
  const windowExpired =
    !existing ||
    now.getTime() - new Date(existing.windowStartedAt).getTime() >
      ATTEMPT_WINDOW_MS;
  const failedAttempts = windowExpired
    ? 1
    : Number(existing.failedAttempts ?? 0) + 1;
  const data = {
    organizationId,
    userId,
    authenticationSessionId: context.sessionId,
    moduleKey,
    ipHash: context.ipHash,
    failedAttempts,
    windowStartedAt: windowExpired ? now : existing.windowStartedAt,
    lockedUntil:
      failedAttempts >= MAX_ATTEMPTS
        ? new Date(now.getTime() + ATTEMPT_WINDOW_MS)
        : null,
    updatedAt: now,
  };
  if (existing) {
    await db
      .update(moduleEncryptionAttemptsTable)
      .set(data)
      .where(eq(moduleEncryptionAttemptsTable.id, existing.id));
  } else {
    await db.insert(moduleEncryptionAttemptsTable).values(data);
  }
  const actor = String(user.displayName || user.username || "User");
  await audit(
    req,
    user,
    moduleKey,
    "LOGIN_FAILED",
    `${actor} failed ${ENCRYPTED_MODULES[moduleKey].label} module verification`,
    { reason: "invalid_password" },
  );
  return failedAttempts >= MAX_ATTEMPTS;
}

async function clearAttempts(
  req: Request,
  user: Record<string, any>,
  moduleKey: EncryptedModuleKey,
) {
  const context = requestContext(req);
  await db
    .delete(moduleEncryptionAttemptsTable)
    .where(
      and(
        eq(
          moduleEncryptionAttemptsTable.organizationId,
          Number(user.organizationId ?? 1),
        ),
        eq(moduleEncryptionAttemptsTable.userId, Number(user.id)),
        eq(
          moduleEncryptionAttemptsTable.authenticationSessionId,
          context.sessionId,
        ),
        eq(moduleEncryptionAttemptsTable.moduleKey, moduleKey),
        eq(moduleEncryptionAttemptsTable.ipHash, context.ipHash),
      ),
    );
}

export async function verifyAndUnlock(
  req: Request,
  user: Record<string, any>,
  moduleKey: EncryptedModuleKey,
  password: string,
) {
  const organizationId = Number(user.organizationId ?? 1);
  const setting = await getModuleEncryptionSetting(organizationId, moduleKey);
  const passwordMatches = await compare(
    password,
    setting?.passwordHash || DUMMY_PASSWORD_HASH,
  );
  const valid = Boolean(setting?.passwordHash) && passwordMatches;
  if (!valid) {
    const locked = await recordFailedAttempt(req, user, moduleKey);
    return { success: false as const, rateLimited: locked };
  }

  const context = requestContext(req);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INACTIVITY_MS);
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_MS);
  const [existing] = await db
    .select()
    .from(moduleUnlockGrantsTable)
    .where(
      and(
        eq(moduleUnlockGrantsTable.organizationId, organizationId),
        eq(moduleUnlockGrantsTable.userId, Number(user.id)),
        eq(moduleUnlockGrantsTable.authenticationSessionId, context.sessionId),
        eq(moduleUnlockGrantsTable.moduleKey, moduleKey),
      ),
    )
    .limit(1);
  const data = {
    organizationId,
    userId: Number(user.id),
    authenticationSessionId: context.sessionId,
    moduleKey,
    passwordVersion: Number(setting.passwordVersion),
    createdAt: now,
    lastActivityAt: now,
    expiresAt,
    absoluteExpiresAt,
    revokedAt: null,
    revokedReason: null,
    ipHash: context.ipHash,
    userAgentHash: context.userAgentHash,
  };
  if (existing) {
    await db
      .update(moduleUnlockGrantsTable)
      .set(data)
      .where(eq(moduleUnlockGrantsTable.id, existing.id));
  } else {
    await db.insert(moduleUnlockGrantsTable).values(data);
  }
  await clearAttempts(req, user, moduleKey);
  const actor = String(user.displayName || user.username || "User");
  await audit(
    req,
    user,
    moduleKey,
    "LOGIN",
    `${actor} unlocked the ${ENCRYPTED_MODULES[moduleKey].label} module`,
  );
  return { success: true as const, expiresAt };
}

export async function activeGrant(
  req: Request,
  user: Record<string, any>,
  moduleKey: EncryptedModuleKey,
  touch = false,
) {
  const organizationId = Number(user.organizationId ?? 1);
  const context = requestContext(req);
  const [grant] = await db
    .select()
    .from(moduleUnlockGrantsTable)
    .where(
      and(
        eq(moduleUnlockGrantsTable.organizationId, organizationId),
        eq(moduleUnlockGrantsTable.userId, Number(user.id)),
        eq(moduleUnlockGrantsTable.authenticationSessionId, context.sessionId),
        eq(moduleUnlockGrantsTable.moduleKey, moduleKey),
      ),
    )
    .limit(1);
  if (!grant || grant.revokedAt) return null;
  const contextChanged =
    grant.ipHash !== context.ipHash ||
    grant.userAgentHash !== context.userAgentHash;
  if (contextChanged) {
    await db
      .update(moduleUnlockGrantsTable)
      .set({ revokedAt: new Date(), revokedReason: "request_context_changed" })
      .where(eq(moduleUnlockGrantsTable.id, grant.id));
    return null;
  }
  const now = new Date();
  if (
    new Date(grant.expiresAt) <= now ||
    new Date(grant.absoluteExpiresAt) <= now
  ) {
    await db
      .update(moduleUnlockGrantsTable)
      .set({ revokedAt: now, revokedReason: "expired" })
      .where(eq(moduleUnlockGrantsTable.id, grant.id));
    return null;
  }
  const setting = await getModuleEncryptionSetting(organizationId, moduleKey);
  if (
    !setting?.passwordHash ||
    Number(grant.passwordVersion) !== Number(setting.passwordVersion)
  ) {
    await db
      .update(moduleUnlockGrantsTable)
      .set({ revokedAt: now, revokedReason: "password_changed" })
      .where(eq(moduleUnlockGrantsTable.id, grant.id));
    return null;
  }
  if (touch) {
    const nextExpiry = new Date(
      Math.min(
        now.getTime() + INACTIVITY_MS,
        new Date(grant.absoluteExpiresAt).getTime(),
      ),
    );
    await db
      .update(moduleUnlockGrantsTable)
      .set({ lastActivityAt: now, expiresAt: nextExpiry })
      .where(eq(moduleUnlockGrantsTable.id, grant.id));
    grant.expiresAt = nextExpiry;
  }
  return grant;
}

export async function lockCurrentGrant(
  req: Request,
  user: Record<string, any>,
  moduleKey: EncryptedModuleKey,
) {
  const context = requestContext(req);
  await db
    .update(moduleUnlockGrantsTable)
    .set({
      revokedAt: new Date(),
      revokedReason: "manual_lock",
    })
    .where(
      and(
        eq(
          moduleUnlockGrantsTable.organizationId,
          Number(user.organizationId ?? 1),
        ),
        eq(moduleUnlockGrantsTable.userId, Number(user.id)),
        eq(moduleUnlockGrantsTable.authenticationSessionId, context.sessionId),
        eq(moduleUnlockGrantsTable.moduleKey, moduleKey),
      ),
    );
  const actor = String(user.displayName || user.username || "User");
  await audit(
    req,
    user,
    moduleKey,
    "LOCK",
    `${actor} locked the ${ENCRYPTED_MODULES[moduleKey].label} module`,
  );
}

export function requireModuleUnlock(moduleKey: EncryptedModuleKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).authUser ?? (await getAuthUser(req));
    if (!user)
      return res.status(401).json({ error: "Authentication required" });
    const grant = await activeGrant(req, user, moduleKey, true);
    if (!grant) {
      return res
        .status(423)
        .json({ error: "Module locked", module: moduleKey });
    }
    (req as any).authUser = user;
    return next();
  };
}
