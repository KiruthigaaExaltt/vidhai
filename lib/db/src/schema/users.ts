import { mongoTable, serial, text, timestamp, createInsertSchema, integer, boolean } from "./dsl";
import { z } from "zod/v4";

export const usersTable = mongoTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  name: text("name"),
  role: text("role").notNull().default("operator"),
  locationScope: text("location_scope").notNull().default("[]"),
  organizationId: integer("organization_id").notNull().default(1),
  employeeId: integer("employee_id"),
  employeeName: text("employee_name"),
  department: text("department"),
  systemKey: text("system_key"),
  userType: text("user_type").notNull().default("USER"),
  permissionOverrides: text("permission_overrides").notNull().default("[]"),
  sessionVersion: integer("session_version").notNull().default(0),
  lastLogin: timestamp("last_login", { withTimezone: true }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  deactivatedBy: integer("deactivated_by"),
  isSystemGenerated: boolean("is_system_generated").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: integer("deleted_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // ── Profile page fields ──
  department: text("department"),
  designation: text("designation"),
  phoneNumber: text("phone_number"),
  workLocation: text("work_location"),
  dob: timestamp("dob", { withTimezone: true }),
  employeeCode: text("employee_code"),
  reportingManager: text("reporting_manager"),
  joiningDate: timestamp("joining_date", { withTimezone: true }),
  employmentType: text("employment_type").default("Full-time"),
  status: text("status").default("Active"),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
