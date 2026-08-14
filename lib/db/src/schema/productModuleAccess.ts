import { boolean, integer, mongoTable, serial, text, timestamp } from "./dsl";

export const productModuleAccessTable = mongoTable("product_module_access", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  moduleKey: text("module_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const productModuleAccessAuditTable = mongoTable(
  "product_module_access_audit",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull(),
    moduleKey: text("module_key").notNull(),
    previousEnabled: boolean("previous_enabled").notNull(),
    enabled: boolean("enabled").notNull(),
    changedBy: integer("changed_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
