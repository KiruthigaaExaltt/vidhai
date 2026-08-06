import { mongoTable, serial, text, timestamp, createInsertSchema, integer, boolean } from "./dsl";
import { z } from "zod/v4";

export const usersTable = mongoTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("operator"),
  locationScope: text("location_scope").notNull().default("[]"),
  organizationId: integer("organization_id").notNull().default(1),
  employeeId: integer("employee_id"),
  employeeName: text("employee_name"),
  permissionOverrides: text("permission_overrides").notNull().default("[]"),
  sessionVersion: integer("session_version").notNull().default(0),
  lastLogin: timestamp("last_login", { withTimezone: true }),
  isSystemGenerated: boolean("is_system_generated").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
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
