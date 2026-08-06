import { mongoTable, serial, text, boolean, timestamp, integer } from "./dsl";

/**
 * Role definitions — each row holds a permission matrix as a JSON string.
 *
 * permissions JSON shape:
 * {
 *   "view":    ["annur", "ooty", "coimbatore", "lab", "cross_site"],
 *   "create":  ["annur", "coimbatore"],
 *   "approve": ["ooty"],
 *   "delete":  []
 * }
 *
 * Recognised location slugs: annur | ooty | coimbatore | lab | cross_site
 * Recognised actions:        view  | create | approve   | delete
 */
export const rolesTable = mongoTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  slug: text("slug").notNull(),
  organizationId: integer("organization_id").notNull().default(1),
  /** JSON string — permission matrix keyed by action → location[] */
  permissions: text("permissions").notNull().default("{}"),
  /** System roles (admin, location_manager, operator, viewer) cannot be deleted */
  isSystem: boolean("is_system").notNull().default(false),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  systemKey: text("system_key"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Role = typeof rolesTable.$inferSelect;
