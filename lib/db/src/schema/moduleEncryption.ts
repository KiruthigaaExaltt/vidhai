import { boolean, integer, mongoTable, serial, text, timestamp } from "./dsl";

export const moduleEncryptionSettingsTable = mongoTable(
  "module_encryption_settings",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull(),
    moduleKey: text("module_key").notNull(),
    passwordHash: text("password_hash").notNull().default(""),
    passwordVersion: integer("password_version").notNull().default(1),
    passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),
    updatedBy: integer("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const moduleUnlockGrantsTable = mongoTable("module_unlock_grants", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  userId: integer("user_id").notNull(),
  authenticationSessionId: text("authentication_session_id").notNull(),
  moduleKey: text("module_key").notNull(),
  passwordVersion: integer("password_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at", {
    withTimezone: true,
  }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedReason: text("revoked_reason"),
  ipHash: text("ip_hash"),
  userAgentHash: text("user_agent_hash"),
});

export const moduleEncryptionAttemptsTable = mongoTable(
  "module_encryption_attempts",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull(),
    userId: integer("user_id").notNull(),
    authenticationSessionId: text("authentication_session_id").notNull(),
    moduleKey: text("module_key").notNull(),
    ipHash: text("ip_hash").notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const moduleEncryptionAuditTable = mongoTable(
  "module_encryption_audit",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull(),
    userId: integer("user_id").notNull(),
    actorName: text("actor_name").notNull(),
    moduleKey: text("module_key").notNull(),
    actionType: text("action_type").notNull(),
    description: text("description").notNull(),
    redactedValues: text("redacted_values").notNull().default("{}"),
    authenticationSessionId: text("authentication_session_id"),
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type ModuleEncryptionSetting =
  typeof moduleEncryptionSettingsTable.$inferSelect;
export type ModuleUnlockGrant = typeof moduleUnlockGrantsTable.$inferSelect;
